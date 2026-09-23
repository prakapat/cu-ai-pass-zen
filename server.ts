/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import session from "express-session";
import MySQLStoreFactory from "express-mysql-session";
import mysql2 from "mysql2";
import bcrypt from "bcryptjs";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { prisma } from "./src/lib/prisma";
import { requireAuth, requireRole, requireAiUnlocked } from "./src/lib/auth";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Railway (and most PaaS) terminate TLS at a reverse proxy — trust it so
// req.secure / the "secure" cookie flag reflect the client's actual HTTPS connection.
app.set("trust proxy", 1);

// Increase payload limits for base64 uploads (up to 5 files per request)
app.use(express.json({ limit: "40mb" }));
app.use(express.urlencoded({ limit: "40mb", extended: true }));

// express-session default MemoryStore ไม่เหมาะกับ production (leak memory, ใช้ได้แค่ process เดียว,
// session หายทุกครั้งที่ redeploy/restart) — เก็บ session ใน MySQL เดิมที่มีอยู่แล้วแทน ไม่ต้องเพิ่ม infra ใหม่ (เช่น Redis)
// สร้างตาราง sessions ให้เองอัตโนมัติถ้ายังไม่มี
const MySQLStore = MySQLStoreFactory(session);
// แยกส่วนประกอบ DATABASE_URL เองด้วย URL class แทนที่จะส่ง URI string ตรงๆ ให้ mysql2 parse เอง —
// mysql2 ต้องใช้ user/password/host แยกฟิลด์อยู่แล้วตาม README ของ express-mysql-session และ URL class
// decode อักขระพิเศษในรหัสผ่านที่ Railway auto-generate ให้ได้ถูกต้องกว่าเชื่อ parser ของ mysql2 เอง
const dbUrl = new URL(process.env.DATABASE_URL!);
// `as any`: @types/express-mysql-session pins its own nested mysql2 version, which TS treats as a
// nominally different (if structurally identical) Pool type from our own mysql2 — harmless at runtime.
const sessionStore = new MySQLStore(
  {},
  mysql2.createPool({
    host: dbUrl.hostname,
    port: Number(dbUrl.port) || 3306,
    user: decodeURIComponent(dbUrl.username),
    password: decodeURIComponent(dbUrl.password),
    database: dbUrl.pathname.replace(/^\//, ""),
    connectTimeout: 10000,
  }) as any
);
// MySQLStoreClass extends EventEmitter — an unhandled 'error' event throws synchronously and crashes
// the process, so this listener must exist even though onReady() below also reports failures.
sessionStore.on("error", (err) => console.error("Session store error:", err));
sessionStore
  .onReady()
  .then(() => console.log("Session store (MySQL) ready"))
  .catch((err) => console.error("Session store failed to initialize:", err));

app.use(
  session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || "dev-only-insecure-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 8 * 60 * 60 * 1000, // 8 ชั่วโมง
    },
  })
);

// Helper to initialize Gemini Client lazily
let aiClient: GoogleGenAI | null = null;
function getGeminiClient() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("Warning: GEMINI_API_KEY environment variable is not set. Using simulated responses.");
      return null;
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Gemini model ที่ใช้ ถ้า admin ยังไม่เคยตั้งค่าไว้ใน AiModelSetting เลย
// ใช้ alias "-latest" แทนเลขเวอร์ชันตายตัว — Google ขยับ alias นี้ไปชี้ model ตัวใหม่ให้เองเมื่อรุ่นเก่าถูกเลิกรองรับ
// กันปัญหาแบบเดียวกับที่ text-embedding-004 เจอ (ตายกะทันหันเพราะ pin เวอร์ชันตายตัวไว้) ไม่เกิดซ้ำกับ generateContent
const DEFAULT_AGENT_MODEL = "gemini-flash-latest";
const DEFAULT_INTENT_CLASSIFIER_MODEL = "gemini-flash-latest";
// ยังไม่มี "-latest" alias สำหรับ embedding model ในตอนนี้ จึงต้อง pin เวอร์ชันตรงๆ — ถ้าเลิกรองรับอีกจะเห็น badge เตือนที่หน้า admin (ดู /api/admin/gemini-models)
const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001";

// อ่านค่า model ปัจจุบันจาก AiModelSetting (มี default fallback ถ้ายังไม่เคยตั้งค่า) — เรียกครั้งเดียวต่อ request แล้วส่งต่อ ไม่ cache ข้าม request เพื่อให้ admin เปลี่ยนค่าแล้วมีผลทันที
async function getAiModels(): Promise<{ agent: string; intentClassifier: string }> {
  const rows = await prisma.aiModelSetting.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  return {
    agent: byKey.get("agent") || DEFAULT_AGENT_MODEL,
    intentClassifier: byKey.get("intentClassifier") || DEFAULT_INTENT_CLASSIFIER_MODEL,
  };
}

// -------------------------------------------------------------
// API ENDPOINTS
// -------------------------------------------------------------

// API Health Check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// -------------------------------------------------------------
// AUTH (username/password ต่อ demo user ที่ seed ไว้ — ยังไม่มี CU NET SSO จริง)
// -------------------------------------------------------------

function userPublicFields(u: { id: string; username: string; firstName: string; lastName: string; role: string }) {
  return { id: u.id, username: u.username, firstName: u.firstName, lastName: u.lastName, role: u.role };
}

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ success: false, error: "กรุณากรอก username และ password" });
    }
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ success: false, error: "username หรือ password ไม่ถูกต้อง" });
    }
    req.session.userId = user.id;
    req.session.role = user.role;
    res.json({ success: true, data: userPublicFields(user) });
  } catch (error: any) {
    console.error("Error in POST /api/auth/login:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error("Error in POST /api/auth/logout:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
    res.clearCookie("connect.sid");
    res.json({ success: true });
  });
});

app.get("/api/auth/profile", requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
    if (!user) {
      return res.status(401).json({ success: false, error: "ไม่พบผู้ใช้" });
    }
    const { passwordHash, ...profile } = user;
    res.json({ success: true, data: profile });
  } catch (error: any) {
    console.error("Error in GET /api/auth/profile:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/auth/me", async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ success: false, error: "ยังไม่ได้เข้าสู่ระบบ" });
    }
    const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
    if (!user) {
      return res.status(401).json({ success: false, error: "ไม่พบผู้ใช้" });
    }
    res.json({ success: true, data: userPublicFields(user) });
  } catch (error: any) {
    console.error("Error in GET /api/auth/me:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// -------------------------------------------------------------
// ADMIN — จัดการ user ที่ถูก lock จากการอัปโหลดเอกสารไม่เกี่ยวข้องซ้ำๆ
// -------------------------------------------------------------

app.get("/api/admin/users", requireRole("ADMIN"), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        role: true,
        irrelevantUploadStreak: true,
        irrelevantUploadTotal: true,
        pageLockedUntil: true,
        accountAiLocked: true,
      },
      orderBy: { username: "asc" },
    });
    res.json({ success: true, data: users });
  } catch (error: any) {
    console.error("Error in GET /api/admin/users:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/admin/users/:id/unlock", requireRole("ADMIN"), async (req, res) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { irrelevantUploadStreak: 0, irrelevantUploadTotal: 0, pageLockedUntil: null, accountAiLocked: false },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        role: true,
        irrelevantUploadStreak: true,
        irrelevantUploadTotal: true,
        pageLockedUntil: true,
        accountAiLocked: true,
      },
    });
    res.json({ success: true, data: user });
  } catch (error: any) {
    console.error(`Error in POST /api/admin/users/${req.params.id}/unlock:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// -------------------------------------------------------------
// ADMIN — ตั้งค่าระบบ (เกณฑ์ lock/โควต้า AI, กลุ่มประเทศ, อัตราเบี้ยเลี้ยงตามตำแหน่ง, คำถามแนะนำ chatbot)
// -------------------------------------------------------------

app.get("/api/admin/settings", requireRole("ADMIN"), async (req, res) => {
  try {
    const rows = await prisma.systemSetting.findMany();
    const byKey = new Map(rows.map((r) => [r.key, r]));
    // เติม default ให้ครบทุกคีย์เสมอ เผื่อยังไม่เคย seed แถวนั้นไว้ในฐานข้อมูล
    const merged = Object.keys(DEFAULT_SYSTEM_SETTINGS).map((key) => {
      const k = key as keyof typeof DEFAULT_SYSTEM_SETTINGS;
      return byKey.get(key) || { key, value: DEFAULT_SYSTEM_SETTINGS[k], description: SYSTEM_SETTING_DESCRIPTIONS[key] };
    });
    res.json({ success: true, data: merged });
  } catch (error: any) {
    console.error("Error in GET /api/admin/settings:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put("/api/admin/settings/:key", requireRole("ADMIN"), async (req, res) => {
  try {
    const { value } = req.body as { value?: number };
    if (!Number.isFinite(value) || (value as number) < 0) {
      return res.status(400).json({ success: false, error: "ค่าต้องเป็นตัวเลขไม่ติดลบ" });
    }
    const key = req.params.key;
    const description = SYSTEM_SETTING_DESCRIPTIONS[key] || "";
    const row = await prisma.systemSetting.upsert({
      where: { key },
      create: { key, value: value as number, description },
      update: { value: value as number },
    });
    res.json({ success: true, data: row });
  } catch (error: any) {
    console.error(`Error in PUT /api/admin/settings/${req.params.key}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/admin/ai-model-settings", requireRole("ADMIN"), async (req, res) => {
  try {
    const models = await getAiModels();
    // embeddingModel เป็นค่าคงที่ในโค้ด ไม่ผ่าน config นี้ (ตามที่ตกลงไว้) — ส่งมาแค่ให้หน้า admin แสดงสถานะสุขภาพเทียบกับ live model list เท่านั้น
    res.json({ success: true, data: { ...models, embeddingModel: DEFAULT_EMBEDDING_MODEL } });
  } catch (error: any) {
    console.error("Error in GET /api/admin/ai-model-settings:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put("/api/admin/ai-model-settings", requireRole("ADMIN"), async (req, res) => {
  try {
    const { agent, intentClassifier } = req.body as { agent?: string; intentClassifier?: string };
    const updates: Promise<any>[] = [];
    if (agent) {
      updates.push(prisma.aiModelSetting.upsert({ where: { key: "agent" }, create: { key: "agent", value: agent }, update: { value: agent } }));
    }
    if (intentClassifier) {
      updates.push(
        prisma.aiModelSetting.upsert({ where: { key: "intentClassifier" }, create: { key: "intentClassifier", value: intentClassifier }, update: { value: intentClassifier } })
      );
    }
    await Promise.all(updates);
    const models = await getAiModels();
    res.json({ success: true, data: models });
  } catch (error: any) {
    console.error("Error in PUT /api/admin/ai-model-settings:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// รายชื่อ Gemini model ปัจจุบันที่ API key นี้เรียกใช้ได้จริง (เรียก ai.models.list() สดทุกครั้ง ไม่ hardcode ไว้ กันรายการเก่าไปตกยุค)
// แยก 2 กลุ่มตาม action: generateContent (text/vision, ใช้เลือกใน Agent/Intent Classifier) กับ embedContent (ใช้เช็คสถานะ embedding model ที่ pin ไว้ในโค้ด ไม่ใช่ตัวเลือกให้ admin เปลี่ยน)
// ตัดกลุ่ม image-gen/audio/live/tts/robotics/computer-use ที่ไม่เกี่ยวกับ use case ในระบบนี้ออกจากฝั่ง generateContent
app.get("/api/admin/gemini-models", requireRole("ADMIN"), async (req, res) => {
  try {
    const ai = getGeminiClient();
    if (!ai) return res.json({ success: true, data: { generateContent: [], embedContent: [] } });
    const pager = await ai.models.list();
    const generateContentModels: { name: string; displayName: string }[] = [];
    const embedContentModels: { name: string; displayName: string }[] = [];
    for await (const m of pager) {
      const name = (m.name || "").replace(/^models\//, "");
      const actions = m.supportedActions || [];
      if (!name.startsWith("gemini-")) continue;
      if (actions.includes("generateContent") && !/image|audio|live|tts|robotics|computer-use/.test(name)) {
        generateContentModels.push({ name, displayName: m.displayName || name });
      }
      if (actions.includes("embedContent")) {
        embedContentModels.push({ name, displayName: m.displayName || name });
      }
    }
    res.json({ success: true, data: { generateContent: generateContentModels, embedContent: embedContentModels } });
  } catch (error: any) {
    console.error("Error in GET /api/admin/gemini-models:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/guide-questions", requireAuth, async (req, res) => {
  try {
    const rows = await prisma.guideQuestion.findMany({ orderBy: { sortOrder: "asc" } });
    res.json({ success: true, data: rows });
  } catch (error: any) {
    console.error("Error in GET /api/guide-questions:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/admin/guide-questions", requireRole("ADMIN"), async (req, res) => {
  try {
    const { text } = req.body as { text?: string };
    if (!text?.trim()) return res.status(400).json({ success: false, error: "กรุณาระบุข้อความคำถาม" });
    const maxOrder = await prisma.guideQuestion.aggregate({ _max: { sortOrder: true } });
    const row = await prisma.guideQuestion.create({ data: { text: text.trim(), sortOrder: (maxOrder._max.sortOrder ?? 0) + 1 } });
    res.json({ success: true, data: row });
  } catch (error: any) {
    console.error("Error in POST /api/admin/guide-questions:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put("/api/admin/guide-questions/:id", requireRole("ADMIN"), async (req, res) => {
  try {
    const { text } = req.body as { text?: string };
    if (!text?.trim()) return res.status(400).json({ success: false, error: "กรุณาระบุข้อความคำถาม" });
    const row = await prisma.guideQuestion.update({ where: { id: req.params.id }, data: { text: text.trim() } });
    res.json({ success: true, data: row });
  } catch (error: any) {
    console.error(`Error in PUT /api/admin/guide-questions/${req.params.id}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete("/api/admin/guide-questions/:id", requireRole("ADMIN"), async (req, res) => {
  try {
    await prisma.guideQuestion.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error: any) {
    console.error(`Error in DELETE /api/admin/guide-questions/${req.params.id}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/admin/country-groups", requireRole("ADMIN"), async (req, res) => {
  try {
    const { country, group, travelBufferDays, estimatedFlightCost, insuranceZone, visaRequirement, estimatedVisaFee } = req.body as {
      country?: string;
      group?: number;
      travelBufferDays?: number;
      estimatedFlightCost?: number | null;
      insuranceZone?: number | null;
      visaRequirement?: string | null;
      estimatedVisaFee?: number | null;
    };
    if (!country?.trim() || !group) {
      return res.status(400).json({ success: false, error: "กรุณาระบุชื่อประเทศและกลุ่ม" });
    }
    const row = await prisma.countryGroup.create({
      data: {
        country: country.trim(),
        group,
        travelBufferDays: travelBufferDays ?? 1,
        estimatedFlightCost: estimatedFlightCost ?? null,
        insuranceZone: insuranceZone ?? null,
        visaRequirement: (visaRequirement as any) ?? null,
        estimatedVisaFee: estimatedVisaFee ?? null,
      },
    });
    res.json({ success: true, data: row });
  } catch (error: any) {
    console.error("Error in POST /api/admin/country-groups:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put("/api/admin/country-groups/:id", requireRole("ADMIN"), async (req, res) => {
  try {
    const { country, group, travelBufferDays, estimatedFlightCost, insuranceZone, visaRequirement, estimatedVisaFee } = req.body as {
      country?: string;
      group?: number;
      travelBufferDays?: number;
      estimatedFlightCost?: number | null;
      insuranceZone?: number | null;
      visaRequirement?: string | null;
      estimatedVisaFee?: number | null;
    };
    const row = await prisma.countryGroup.update({
      where: { id: req.params.id },
      data: {
        country: country?.trim(),
        group,
        travelBufferDays,
        estimatedFlightCost,
        insuranceZone,
        visaRequirement: visaRequirement as any,
        estimatedVisaFee,
      },
    });
    res.json({ success: true, data: row });
  } catch (error: any) {
    console.error(`Error in PUT /api/admin/country-groups/${req.params.id}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete("/api/admin/country-groups/:id", requireRole("ADMIN"), async (req, res) => {
  try {
    await prisma.countryGroup.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error: any) {
    console.error(`Error in DELETE /api/admin/country-groups/${req.params.id}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put("/api/admin/policy-rates/:id", requireRole("ADMIN"), async (req, res) => {
  try {
    const { perDiemLumpSum, accommodationMax, perDiemItemized } = req.body as {
      perDiemLumpSum?: number;
      accommodationMax?: number;
      perDiemItemized?: number;
    };
    const row = await prisma.policyRate.update({
      where: { id: req.params.id },
      data: { perDiemLumpSum, accommodationMax, perDiemItemized },
    });
    res.json({ success: true, data: row });
  } catch (error: any) {
    console.error(`Error in PUT /api/admin/policy-rates/${req.params.id}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put("/api/admin/domestic-lump-sum-rates/:id", requireRole("ADMIN"), async (req, res) => {
  try {
    const { ratePerDay } = req.body as { ratePerDay?: number };
    const row = await prisma.domesticLumpSumRate.update({ where: { id: req.params.id }, data: { ratePerDay } });
    res.json({ success: true, data: row });
  } catch (error: any) {
    console.error(`Error in PUT /api/admin/domestic-lump-sum-rates/${req.params.id}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put("/api/admin/domestic-accommodation-rates/:id", requireRole("ADMIN"), async (req, res) => {
  try {
    const { singleRoomMax, twinRoomMax } = req.body as { singleRoomMax?: number; twinRoomMax?: number };
    const row = await prisma.domesticAccommodationRate.update({ where: { id: req.params.id }, data: { singleRoomMax, twinRoomMax } });
    res.json({ success: true, data: row });
  } catch (error: any) {
    console.error(`Error in PUT /api/admin/domestic-accommodation-rates/${req.params.id}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put("/api/admin/domestic-per-diem-rates/:id", requireRole("ADMIN"), async (req, res) => {
  try {
    const { ratePerDay } = req.body as { ratePerDay?: number };
    const row = await prisma.domesticPerDiemRate.update({ where: { id: req.params.id }, data: { ratePerDay } });
    res.json({ success: true, data: row });
  } catch (error: any) {
    console.error(`Error in PUT /api/admin/domestic-per-diem-rates/${req.params.id}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// -------------------------------------------------------------
// TRIP PLAN CRUD (Prisma + MySQL)
// -------------------------------------------------------------

const TRIP_WRITABLE_FIELDS = [
  "tripType",
  "reimbursementMode",
  "insurancePlanTier",
  "projectName",
  "conferenceStartDate",
  "conferenceEndDate",
  "startDate",
  "endDate",
  "hasPersonalLeave",
  "leaveStartDate",
  "leaveEndDate",
  "location",
  "country",
  "countryGroup",
  "destinationProvince",
  "hostOrganization",
  "budgetCode",
  "paymentMethod",
  "estimatedBudget",
  "status",
  "isCancelled",
  "travelers",
  "itemPaymentMethods",
  "customBudgetItems",
  "aiDetectedExpenses",
  "originCity",
  "destinationCity",
  "flightOptions",
  "selectedFlight",
  "insuranceOptions",
  "selectedInsurance",
  "memo",
  "ePaymentData",
  "receipts",
] as const;

function pickTripFields(body: any) {
  const data: Record<string, any> = {};
  for (const key of TRIP_WRITABLE_FIELDS) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  return data;
}

// REQUESTER เห็นเฉพาะทริปของตัวเอง, role อื่นเห็นทุกทริป
app.get("/api/trips", requireAuth, async (req, res) => {
  try {
    const where = req.session.role === "REQUESTER" ? { requesterId: req.session.userId } : {};
    const trips = await prisma.tripPlan.findMany({ where, orderBy: { createdAt: "desc" } });
    res.json({ success: true, data: trips });
  } catch (error: any) {
    console.error("Error in GET /api/trips:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/trips", requireRole("REQUESTER", "ADMIN"), async (req, res) => {
  try {
    const trip = await prisma.tripPlan.create({
      data: { ...pickTripFields(req.body), requesterId: req.session.userId } as any,
    });
    res.json({ success: true, data: trip });
  } catch (error: any) {
    console.error("Error in POST /api/trips:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// REQUESTER แก้ไขได้เฉพาะทริปของตัวเอง, FINANCE_OFFICER/ADMIN แก้ไขได้ทุกทริป, APPROVER ดูอย่างเดียวเข้าไม่ได้
app.put("/api/trips/:id", requireRole("REQUESTER", "FINANCE_OFFICER", "ADMIN"), async (req, res) => {
  try {
    if (req.session.role === "REQUESTER") {
      const existing = await prisma.tripPlan.findUnique({ where: { id: req.params.id } });
      if (!existing || existing.requesterId !== req.session.userId) {
        return res.status(403).json({ success: false, error: "ไม่มีสิทธิ์แก้ไขทริปนี้" });
      }
    }
    const trip = await prisma.tripPlan.update({
      where: { id: req.params.id },
      data: pickTripFields(req.body) as any,
    });
    res.json({ success: true, data: trip });
  } catch (error: any) {
    console.error(`Error in PUT /api/trips/${req.params.id}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete("/api/trips/:id", requireRole("REQUESTER", "ADMIN"), async (req, res) => {
  try {
    if (req.session.role === "REQUESTER") {
      const existing = await prisma.tripPlan.findUnique({ where: { id: req.params.id } });
      if (!existing || existing.requesterId !== req.session.userId) {
        return res.status(403).json({ success: false, error: "ไม่มีสิทธิ์ลบทริปนี้" });
      }
    }
    await prisma.tripPlan.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error: any) {
    console.error(`Error in DELETE /api/trips/${req.params.id}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// -------------------------------------------------------------
// TRIP ATTACHMENTS (ไฟล์ที่แนบตอนกด "ยืนยันข้อมูลโครงการ" ใน A1 — แยกจาก a1-parse-invitation
// เพื่อให้แนบไฟล์ได้โดยไม่ต้องพึ่ง Gemini และไม่บันทึกซ้ำตอน preview parse ก่อนยืนยัน)
// -------------------------------------------------------------

app.get("/api/trips/:id/attachments", requireAuth, async (req, res) => {
  try {
    if (req.session.role === "REQUESTER") {
      const existing = await prisma.tripPlan.findUnique({ where: { id: req.params.id } });
      if (!existing || existing.requesterId !== req.session.userId) {
        return res.status(403).json({ success: false, error: "ไม่มีสิทธิ์ดูไฟล์แนบในทริปนี้" });
      }
    }
    const attachments = await prisma.attachment.findMany({
      where: { tripId: req.params.id },
      select: { id: true, fileName: true, mimeType: true, type: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    res.json({ success: true, data: attachments });
  } catch (error: any) {
    console.error(`Error in GET /api/trips/${req.params.id}/attachments:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/trips/:id/attachments", requireRole("REQUESTER", "ADMIN"), async (req, res) => {
  try {
    const { files, type } = req.body as {
      files?: { fileName: string; mimeType: string; fileData: string }[];
      type?: "INVITATION_LETTER" | "SIGNED_MEMO" | "RECEIPT" | "OTHER";
    };
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, error: "ไม่มีไฟล์แนบ" });
    }
    if (req.session.role === "REQUESTER") {
      const existing = await prisma.tripPlan.findUnique({ where: { id: req.params.id } });
      if (!existing || existing.requesterId !== req.session.userId) {
        return res.status(403).json({ success: false, error: "ไม่มีสิทธิ์แนบไฟล์ในทริปนี้" });
      }
    }
    const created = await prisma.$transaction(
      files.map((f) =>
        prisma.attachment.create({
          data: {
            tripId: req.params.id,
            type: type || "INVITATION_LETTER",
            fileName: f.fileName,
            mimeType: f.mimeType,
            fileData: Buffer.from(f.fileData, "base64"),
          },
          select: { id: true, fileName: true, mimeType: true, type: true, createdAt: true },
        })
      )
    );
    res.json({ success: true, data: created });
  } catch (error: any) {
    console.error(`Error in POST /api/trips/${req.params.id}/attachments:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ส่งไฟล์ต้นฉบับที่แนบไว้กลับไปให้ preview/ดาวน์โหลด — inline เพื่อให้ browser เปิดดู PDF/รูปได้ทันทีแทนที่จะบังคับดาวน์โหลด
app.get("/api/trips/:id/attachments/:attachmentId/file", requireAuth, async (req, res) => {
  try {
    if (req.session.role === "REQUESTER") {
      const existing = await prisma.tripPlan.findUnique({ where: { id: req.params.id } });
      if (!existing || existing.requesterId !== req.session.userId) {
        return res.status(403).json({ success: false, error: "ไม่มีสิทธิ์เข้าถึงไฟล์แนบในทริปนี้" });
      }
    }
    const attachment = await prisma.attachment.findUnique({ where: { id: req.params.attachmentId } });
    if (!attachment || attachment.tripId !== req.params.id) {
      return res.status(404).json({ success: false, error: "ไม่พบไฟล์แนบนี้" });
    }
    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`);
    // ต้องห่อด้วย Buffer.from() เสมอ — Prisma คืนค่า Bytes เป็น Uint8Array ไม่ใช่ Buffer จริง
    // ถ้าส่ง res.send() ตรงๆ Express จะเข้าใจผิดว่าเป็น object ธรรมดาแล้ว JSON.stringify ให้แทนที่จะส่ง binary ตรงๆ
    res.send(Buffer.from(attachment.fileData));
  } catch (error: any) {
    console.error(`Error in GET /api/trips/${req.params.id}/attachments/${req.params.attachmentId}/file:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ลบไฟล์แนบออกจาก DB จริง (กรณี user ต้องการเปลี่ยนเอกสารที่แนบไว้แล้ว)
app.delete("/api/trips/:id/attachments/:attachmentId", requireRole("REQUESTER", "ADMIN"), async (req, res) => {
  try {
    if (req.session.role === "REQUESTER") {
      const existing = await prisma.tripPlan.findUnique({ where: { id: req.params.id } });
      if (!existing || existing.requesterId !== req.session.userId) {
        return res.status(403).json({ success: false, error: "ไม่มีสิทธิ์ลบไฟล์แนบในทริปนี้" });
      }
    }
    const attachment = await prisma.attachment.findUnique({ where: { id: req.params.attachmentId } });
    if (!attachment || attachment.tripId !== req.params.id) {
      return res.status(404).json({ success: false, error: "ไม่พบไฟล์แนบนี้" });
    }
    await prisma.attachment.delete({ where: { id: req.params.attachmentId } });
    res.json({ success: true });
  } catch (error: any) {
    console.error(`Error in DELETE /api/trips/${req.params.id}/attachments/${req.params.attachmentId}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// -------------------------------------------------------------
// F12 E-PAYMENT (บันทึกยืมรองจ่าย) — จัดการที่หน้า A4 เฉพาะเจ้าหน้าที่การเงิน เหมือน a4-parse-memo
// -------------------------------------------------------------

const F12_REQUEST_FIELDS = [
  "deptCode",
  "deptName",
  "subject",
  "recipientTitle",
  "authorizedPerson",
  "description",
  "borrowerName",
  "borrowerPosition",
  "fiscalYear",
  "loanPurpose",
  "fundCode",
  "fundName",
  "unitName",
  "returnDueDate",
  "totalLoanAmount",
  "notes",
  "refundOverpaymentConsent",
];

app.get("/api/trips/:id/f12", requireRole("FINANCE_OFFICER", "ADMIN"), async (req, res) => {
  try {
    const request = await prisma.ePaymentF12Request.findUnique({
      where: { tripId: req.params.id },
      include: { channels: { orderBy: { createdAt: "asc" } } },
    });
    res.json({ success: true, data: request });
  } catch (error: any) {
    console.error(`Error in GET /api/trips/${req.params.id}/f12:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// อัปเดตแบบ upsert เต็มฟอร์ม + แทนที่รายการช่องทางจ่ายเงินทั้งหมดในทีเดียว (ฝั่ง client ส่งรายการ channels ปัจจุบันมาครบทุกครั้ง)
app.put("/api/trips/:id/f12", requireRole("FINANCE_OFFICER", "ADMIN"), async (req, res) => {
  try {
    const trip = await prisma.tripPlan.findUnique({ where: { id: req.params.id } });
    if (!trip) {
      return res.status(404).json({ success: false, error: "ไม่พบคำขอเดินทางนี้" });
    }

    const { channels, confirm, ...body } = req.body as { channels?: any[]; confirm?: boolean; [key: string]: any };

    const data: any = {};
    for (const key of F12_REQUEST_FIELDS) {
      if (key in body) data[key] = body[key];
    }
    if (confirm) data.confirmedAt = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const saved = await tx.ePaymentF12Request.upsert({
        where: { tripId: req.params.id },
        create: { tripId: req.params.id, ...data },
        update: data,
      });

      if (channels) {
        await tx.ePaymentF12Channel.deleteMany({ where: { requestId: saved.id } });
        if (channels.length > 0) {
          await tx.ePaymentF12Channel.createMany({
            data: channels.map((c: any) => ({
              requestId: saved.id,
              channelType: c.channelType,
              amount: c.amount,
              sourceLabel: c.sourceLabel || null,
              recipientName: c.recipientName || null,
              bankName: c.bankName || null,
              bankAccountNumber: c.bankAccountNumber || null,
              bankBranch: c.bankBranch || null,
              cardNumber: c.cardNumber || null,
              cardHolderName: c.cardHolderName || null,
              cardValidFrom: c.cardValidFrom || null,
              cardValidTo: c.cardValidTo || null,
              cardType: c.cardType || null,
            })),
          });
        }
      }

      return tx.ePaymentF12Request.findUnique({
        where: { id: saved.id },
        include: { channels: { orderBy: { createdAt: "asc" } } },
      });
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error(`Error in PUT /api/trips/${req.params.id}/f12:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// -------------------------------------------------------------
// POLICY RATE / GL CODE / COUNTRY GROUP (ระเบียบการเบิกจ่าย, DB-backed)
// -------------------------------------------------------------

app.get("/api/policy-rates", requireAuth, async (req, res) => {
  try {
    const rates = await prisma.policyRate.findMany({ orderBy: [{ tier: "asc" }, { countryGroup: "asc" }] });
    res.json({ success: true, data: rates });
  } catch (error: any) {
    console.error("Error in GET /api/policy-rates:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/gl-codes", requireAuth, async (req, res) => {
  try {
    const codes = await prisma.gLCode.findMany({ orderBy: { code: "asc" } });
    res.json({ success: true, data: codes });
  } catch (error: any) {
    console.error("Error in GET /api/gl-codes:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/country-groups", requireAuth, async (req, res) => {
  try {
    const groups = await prisma.countryGroup.findMany({ orderBy: { country: "asc" } });
    res.json({ success: true, data: groups });
  } catch (error: any) {
    console.error("Error in GET /api/country-groups:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// อัตราการเดินทางในประเทศ (ข้อ 42-44) + สิทธิ์ชั้นโดยสารเครื่องบิน (ข้อ 44(4)/48(2)) + ค่าคงที่ระเบียบ (ข้อ 50, ข้อ 44(3))

app.get("/api/domestic-lump-sum-rates", requireAuth, async (req, res) => {
  try {
    const rates = await prisma.domesticLumpSumRate.findMany({ orderBy: { tier: "asc" } });
    res.json({ success: true, data: rates });
  } catch (error: any) {
    console.error("Error in GET /api/domestic-lump-sum-rates:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/domestic-accommodation-rates", requireAuth, async (req, res) => {
  try {
    const rates = await prisma.domesticAccommodationRate.findMany({ orderBy: { tier: "asc" } });
    res.json({ success: true, data: rates });
  } catch (error: any) {
    console.error("Error in GET /api/domestic-accommodation-rates:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/domestic-per-diem-rates", requireAuth, async (req, res) => {
  try {
    const rates = await prisma.domesticPerDiemRate.findMany({ orderBy: { tier: "asc" } });
    res.json({ success: true, data: rates });
  } catch (error: any) {
    console.error("Error in GET /api/domestic-per-diem-rates:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/flight-class-rules", requireAuth, async (req, res) => {
  try {
    const rules = await prisma.flightClassRule.findMany({ orderBy: [{ scope: "asc" }, { sortOrder: "asc" }] });
    res.json({ success: true, data: rules });
  } catch (error: any) {
    console.error("Error in GET /api/flight-class-rules:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/regulation-constants", requireAuth, async (req, res) => {
  try {
    const constants = await prisma.regulationConstant.findMany({ orderBy: { key: "asc" } });
    res.json({ success: true, data: constants });
  } catch (error: any) {
    console.error("Error in GET /api/regulation-constants:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// วันหยุดราชการไทย — ใช้เช็คตอน A1 auto-detect ว่าวันเดินทางที่เกินสิทธิ์ข้อ 49 วันไหนเป็นวันทำการที่ต้องยื่นลาเพิ่มเติม
app.get("/api/public-holidays", requireAuth, async (req, res) => {
  try {
    const holidays = await prisma.publicHoliday.findMany({ orderBy: { date: "asc" } });
    res.json({
      success: true,
      data: holidays.map((h) => ({ date: h.date.toISOString().split("T")[0], description: h.description })),
    });
  } catch (error: any) {
    console.error("Error in GET /api/public-holidays:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ประมาณการเบี้ยประกันเดินทาง (rule ประมาณการ ไม่ใช่อัตราตามระเบียบ) — โซนประเทศ x ช่วงวัน x ระดับแผน
app.get("/api/insurance-zone-rates", requireAuth, async (req, res) => {
  try {
    const rows = await prisma.insuranceZoneRate.findMany({ orderBy: { zone: "asc" } });
    res.json({ success: true, data: rows });
  } catch (error: any) {
    console.error("Error in GET /api/insurance-zone-rates:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/insurance-duration-tiers", requireAuth, async (req, res) => {
  try {
    const rows = await prisma.insuranceDurationTier.findMany({ orderBy: { sortOrder: "asc" } });
    res.json({ success: true, data: rows });
  } catch (error: any) {
    console.error("Error in GET /api/insurance-duration-tiers:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/insurance-plan-tiers", requireAuth, async (req, res) => {
  try {
    const rows = await prisma.insurancePlanTier.findMany({ orderBy: { sortOrder: "asc" } });
    res.json({ success: true, data: rows });
  } catch (error: any) {
    console.error("Error in GET /api/insurance-plan-tiers:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// A1: Parse Invitation Letter (รองรับหลายไฟล์พร้อมกัน สูงสุด 5 ไฟล์ต่อคำขอ)
// ---- ป้องกันการอัปโหลดเอกสารที่ไม่เกี่ยวข้องซ้ำๆ ----
// เกณฑ์ทั้งหมดนี้ config ได้จากหน้า admin (SystemSetting) — ค่าด้านล่างเป็นแค่ default เผื่อยังไม่เคย seed คีย์นั้นไว้
const DEFAULT_SYSTEM_SETTINGS = {
  pageLockThreshold: 5,
  pageLockDurationMinutes: 10,
  accountLockThreshold: 30,
  monthlyChatLimit: 100,
};
const SYSTEM_SETTING_DESCRIPTIONS: Record<string, string> = {
  pageLockThreshold: "จำนวนครั้งสูงสุดที่ส่งเอกสารไม่เกี่ยวข้องติดต่อกัน ก่อนล็อคหน้าอัปโหลดชั่วคราว",
  pageLockDurationMinutes: "ระยะเวลาล็อคหน้าอัปโหลด (นาที) เมื่อครบจำนวนครั้งที่กำหนด",
  accountLockThreshold: "จำนวนครั้งสะสมทั้งหมดที่ส่งเอกสารไม่เกี่ยวข้อง ก่อนล็อคฟีเจอร์ AI ทั้งหมดจนกว่า admin จะปลดล็อค",
  monthlyChatLimit: "จำนวนครั้งสูงสุดที่ใช้งานผู้ช่วย AI Agent (chat) ได้ต่อผู้ใช้หนึ่งคนต่อเดือน",
};

async function getSetting(key: keyof typeof DEFAULT_SYSTEM_SETTINGS): Promise<number> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  return row?.value ?? DEFAULT_SYSTEM_SETTINGS[key];
}

// เช็คว่าหน้าอัปโหลดถูก lock อยู่หรือไม่ — ถ้าครบเวลาแล้วให้ปลดล็อคหน้า + รีเซ็ตตัวนับต่อเนื่องทันที (ตามที่ตกลงกันว่ารีเซ็ตทุกครั้งที่ครบเวลา)
async function checkAndClearExpiredPageLock(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { pageLockedUntil: true } });
  if (user?.pageLockedUntil) {
    if (user.pageLockedUntil > new Date()) {
      const minutesRemaining = Math.max(1, Math.ceil((user.pageLockedUntil.getTime() - Date.now()) / 60000));
      return { locked: true as const, until: user.pageLockedUntil, minutesRemaining };
    }
    await prisma.user.update({ where: { id: userId }, data: { pageLockedUntil: null, irrelevantUploadStreak: 0 } });
  }
  return { locked: false as const };
}

// เรียกทุกครั้งที่ AI จำแนกเอกสารว่าไม่เกี่ยวข้อง — เพิ่มตัวนับทั้งสองตัว แล้วเช็ค threshold ของทั้ง page-lock และ account-lock (config ได้จากหน้า admin)
async function recordIrrelevantUpload(userId: string) {
  const [user, pageLockThreshold, pageLockDurationMinutes, accountLockThreshold] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { irrelevantUploadStreak: true, irrelevantUploadTotal: true } }),
    getSetting("pageLockThreshold"),
    getSetting("pageLockDurationMinutes"),
    getSetting("accountLockThreshold"),
  ]);
  const streak = (user?.irrelevantUploadStreak ?? 0) + 1;
  const total = (user?.irrelevantUploadTotal ?? 0) + 1;

  const data: { irrelevantUploadStreak: number; irrelevantUploadTotal: number; accountAiLocked?: true; pageLockedUntil?: Date } = {
    irrelevantUploadStreak: streak,
    irrelevantUploadTotal: total,
  };
  let accountAiLocked = false;
  let pageLockedUntil: Date | null = null;

  if (total >= accountLockThreshold) {
    accountAiLocked = true;
    data.accountAiLocked = true;
  } else if (streak >= pageLockThreshold) {
    pageLockedUntil = new Date(Date.now() + pageLockDurationMinutes * 60 * 1000);
    data.pageLockedUntil = pageLockedUntil;
  }

  await prisma.user.update({ where: { id: userId }, data });
  return { streak, total, accountAiLocked, pageLockedUntil };
}

// เช็คโควต้าการใช้ chatbot รายเดือน (SystemSetting key "monthlyChatLimit") แล้วเพิ่มตัวนับถ้ายังไม่เกิน — คืน allowed:false ถ้าเกินแล้ว (ไม่เพิ่มตัวนับซ้ำ)
async function checkAndIncrementChatQuota(userId: string) {
  const limit = await getSetting("monthlyChatLimit");
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const existing = await prisma.chatUsageMonthly.findUnique({ where: { userId_yearMonth: { userId, yearMonth } } });
  if (existing && existing.count >= limit) {
    return { allowed: false as const, limit, used: existing.count };
  }
  const updated = await prisma.chatUsageMonthly.upsert({
    where: { userId_yearMonth: { userId, yearMonth } },
    create: { userId, yearMonth, count: 1 },
    update: { count: { increment: 1 } },
  });
  return { allowed: true as const, limit, used: updated.count };
}

app.post("/api/agent/a1-parse-invitation", requireRole("REQUESTER", "ADMIN"), requireAiUnlocked, async (req, res) => {
  const { tripId, textContent, files } = req.body as {
    tripId?: string;
    textContent?: string;
    files?: { fileData: string; mimeType: string; fileName: string }[];
  };
  const uploadedFiles = (files || []).slice(0, 5);
  const ai = getGeminiClient();
  const { agent: agentModel } = await getAiModels();
  const userId = req.session.userId!;

  const pageLock = await checkAndClearExpiredPageLock(userId);
  if (pageLock.locked) {
    return res.status(423).json({
      success: false,
      error: `ส่งเอกสารที่ไม่เกี่ยวข้องกับงานซ้ำหลายครั้ง ระบบระงับการอัปโหลดหน้านี้ชั่วคราว กรุณาลองใหม่อีกครั้งในอีก ${pageLock.minutesRemaining} นาที`,
      locked: true,
      lockedUntil: pageLock.until,
    });
  }

  // บันทึกไฟล์ต้นฉบับลง DB เสมอ (ไม่ว่า Gemini จะพร้อมใช้งานหรือไม่) เพื่อใช้อ้างอิงตอนออกบันทึกข้อความภายหลัง
  const saveAttachments = async (ocrData: any) => {
    if (!tripId || uploadedFiles.length === 0) return;
    try {
      await prisma.attachment.createMany({
        data: uploadedFiles.map((f) => ({
          tripId,
          type: "INVITATION_LETTER" as const,
          fileName: f.fileName,
          mimeType: f.mimeType,
          fileData: Buffer.from(f.fileData, "base64"),
          ocrData,
        })),
      });
    } catch (error) {
      console.error("Error saving invitation Attachment rows:", error);
    }
  };

  if (!ai) {
    // Return standard realistic mock data for Japanese Symposium
    const mockData = {
      documentType: "A1_INVITATION",
      tripType: "INTERNATIONAL",
      projectName: "The International Symposium on Advanced Artificial Intelligence 2026",
      startDate: "2026-08-10",
      endDate: "2026-08-14",
      location: "Odaiba Center, Tokyo",
      country: "ญี่ปุ่น",
      hostOrganization: "Tokyo Institute of AI Technology",
      travelers: [
        { name: "ดร. สมชาย รักดี", position: "อาจารย์", positionLevel: "P3", rank: "Senior Staff" },
        { name: "ผศ.ดร. หญิง สุขดี", position: "ผู้ช่วยศาสตราจารย์", positionLevel: "P3", rank: "Senior Staff" }
      ],
      additionalExpenses: [
        { name: "ค่าลงทะเบียนงานประชุม (Registration Fee)", amount: 2900 }
      ]
    };
    await saveAttachments(mockData);
    return res.json({ success: true, simulated: true, data: mockData });
  }

  try {
    let contents: any[] = [];
    if (uploadedFiles.length > 0) {
      for (const f of uploadedFiles) {
        contents.push({ inlineData: { data: f.fileData, mimeType: f.mimeType } });
      }
      contents.push({
        text: `Classify this ${uploadedFiles.length > 1 ? "set of documents" : "document"} and, if applicable, extract trip metadata${uploadedFiles.length > 1 ? " (merge information across all files — they belong to the same trip)" : ""}. Respond ONLY with valid JSON structure matching the required schema.`
      });
    } else {
      contents.push({
        text: `Classify this document and, if applicable, extract trip metadata from this text: "${textContent || ''}". Respond ONLY with valid JSON structure matching the required schema.`
      });
    }

    const response = await ai.models.generateContent({
      model: agentModel,
      contents,
      config: {
        responseMimeType: "application/json",
        systemInstruction: `You are an expert administrative OCR assistant for a Thai university travel-request system (CU-AI PASS). Your job has two steps for every document:

STEP 1 — Classify the document into exactly one "documentType":
- 'A1_INVITATION': an invitation letter, joint-work letter, conference/seminar document, or any document requesting/inviting official travel.
- 'A4_APPROVAL': a signed approval memo/document (e.g. an internal approval record for the trip).
- 'A5_RECEIPT': a receipt, tax invoice, or other financial proof-of-payment document.
- 'IRRELEVANT': anything that is NOT one of the above (unrelated documents, random photos, unreadable files, personal documents unrelated to official travel, etc.)

IMPORTANT: Documents are often multi-page (invitation letters, official announcements, TOR-style notices with numbered sections). Read every page/image provided in full before answering — do not stop after the first page. Details such as the exact event dates, venue, host organization, and registration fee are frequently stated in a later numbered section (e.g. under a heading like "วัน เวลา สถานที่" or "อัตราค่าลงทะเบียน"), not necessarily near the document title. Scan the entire document for each field before concluding it is absent.

STEP 2 — Only if documentType is 'A1_INVITATION', also extract the trip metadata fields below (read English or Thai, translate destination country to Thai e.g. Japan -> ญี่ปุ่น). Determine tripType: 'DOMESTIC' if the destination is within Thailand (a Thai province), 'INTERNATIONAL' otherwise. If DOMESTIC, put the Thai province name in destinationProvince and leave country empty; if INTERNATIONAL, put the country in country and leave destinationProvince empty. If documentType is NOT 'A1_INVITATION', leave all these other fields empty — do not guess or invent values.

STEP 3 — Also scan the full document for any additional fixed costs it explicitly states that the traveler must pay, which are NOT already one of the standard regulation-covered items (flight, accommodation, per-diem, travel insurance, passport/visa, airport transport). The most common example is a conference/seminar registration fee (often labeled "อัตราค่าลงทะเบียน" or "ค่าลงทะเบียน" in Thai documents). List each as an entry in "additionalExpenses" with its exact stated amount in Thai Baht (convert other currencies to THB only if an explicit rate is given in the document; otherwise skip that item rather than guessing). Do not invent items — only include costs explicitly stated in the document text.`,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            documentType: {
              type: Type.STRING,
              description: "One of: 'A1_INVITATION', 'A4_APPROVAL', 'A5_RECEIPT', 'IRRELEVANT'",
            },
            tripType: { type: Type.STRING, description: "'DOMESTIC' if traveling within Thailand, 'INTERNATIONAL' if traveling abroad" },
            projectName: { type: Type.STRING, description: "Official name of the event, conference, symposium or project" },
            startDate: { type: Type.STRING, description: "Start date of the event in YYYY-MM-DD format" },
            endDate: { type: Type.STRING, description: "End date of the event in YYYY-MM-DD format" },
            location: { type: Type.STRING, description: "City and specific venue" },
            country: { type: Type.STRING, description: "Country name in Thai only — leave empty if tripType is DOMESTIC" },
            destinationProvince: { type: Type.STRING, description: "Thai province name — leave empty if tripType is INTERNATIONAL" },
            hostOrganization: { type: Type.STRING, description: "The organization hosting the event" },
            travelers: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "Full name in Thai or English if mentioned" },
                  rank: { type: Type.STRING, description: "Classify rank into: 'Executive', 'Senior Staff', or 'Staff'. Executive represents directors/professors, Senior Staff represents associate professors/research leads, Staff represents general researchers/officers." }
                },
                required: ["name", "rank"]
              }
            },
            additionalExpenses: {
              type: Type.ARRAY,
              description: "Fixed costs explicitly stated in the document that the traveler must pay, not already covered by flight/accommodation/per-diem/insurance/visa/airport-transport — e.g. a conference registration fee. Leave empty if none stated.",
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "Short description of the expense, e.g. 'ค่าลงทะเบียนงานประชุม (Registration Fee)'" },
                  amount: { type: Type.NUMBER, description: "Amount in Thai Baht as explicitly stated in the document" }
                },
                required: ["name", "amount"]
              }
            }
          },
          // ทุก field ต้อง required แม้จะไม่บังคับใช้ในทางปฏิบัติ (systemInstruction สอนให้ตอบค่าว่าง/array ว่างเมื่อไม่เกี่ยวข้องอยู่แล้ว) —
          // เจอจริงว่า gemini-flash-latest / gemini-3.7-flash จะข้าม field ที่ไม่ได้ mark required ไปเฉยๆทั้งที่ข้อมูลมีอยู่ในเอกสารชัดเจน
          // (gemini-2.5-flash ไม่เป็น แต่กันไว้ก่อนเผื่อ model รุ่นอื่นเป็นซ้ำ) required ครบทุก field แก้ได้ตรงจุดกว่าการ pin model เฉพาะตัว
          required: [
            "documentType",
            "tripType",
            "projectName",
            "startDate",
            "endDate",
            "location",
            "country",
            "destinationProvince",
            "hostOrganization",
            "travelers",
            "additionalExpenses"
          ]
        }
      }
    });

    const jsonText = response.text || "{}";
    const data = JSON.parse(jsonText.trim());

    if (data.documentType === "IRRELEVANT") {
      const misuse = await recordIrrelevantUpload(userId);
      return res.json({ success: true, simulated: false, data: { documentType: "IRRELEVANT" }, misuse });
    }

    await saveAttachments(data);
    return res.json({ success: true, simulated: false, data });
  } catch (error: any) {
    console.error("Error in a1-parse-invitation:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// A2: Search Travel (Flights and Insurance) using Search Grounding
app.post("/api/agent/a2-search-travel", requireRole("REQUESTER", "ADMIN"), requireAiUnlocked, async (req, res) => {
  const { destination, location, startDate, endDate, travelersCount, tripType } = req.body;
  const isDomestic = tripType === "DOMESTIC";
  const ai = getGeminiClient();
  const { agent: agentModel } = await getAiModels();

  // fallback ตอนไม่มี AI key — เดิม hardcode เที่ยวบินต่างประเทศเสมอ (Thai Airways/AirAsia X/Singapore Airlines) ทำให้ทริปในประเทศ
  // ได้ข้อมูลผิดประเภทไปเลย (สายการบินระหว่างประเทศ+ราคาระดับต่างประเทศ) ตอนนี้แยกชุดข้อมูลจำลองตาม tripType
  if (!ai) {
    if (isDomestic) {
      return res.json({
        success: true,
        simulated: true,
        data: {
          originCity: "กรุงเทพฯ, ประเทศไทย",
          destinationCity: destination || "-",
          flights: [
            { id: "flight-1", airline: "Thai Airways (TG) — เส้นทางในประเทศ", pricePerPerson: 2800, departureTime: "07:00", arrivalTime: "08:20", baggageAllowance: "20 kg", totalPrice: 2800 * (travelersCount || 1), bookingUrl: "https://www.thaiairways.com" },
            { id: "flight-2", airline: "Nok Air", pricePerPerson: 1600, departureTime: "09:15", arrivalTime: "10:35", baggageAllowance: "15 kg", totalPrice: 1600 * (travelersCount || 1), bookingUrl: "https://www.nokair.com" },
            { id: "flight-3", airline: "Thai AirAsia", pricePerPerson: 1400, departureTime: "11:30", arrivalTime: "12:50", baggageAllowance: "7 kg (ถือขึ้นเครื่อง)", totalPrice: 1400 * (travelersCount || 1), bookingUrl: "https://www.airasia.com" }
          ],
          insurance: [] // ค่าประกันภัยไม่อยู่ในสิทธิ์เบิกจ่ายการเดินทางในประเทศตามระเบียบ (ข้อ 42-45) จึงไม่มีให้เลือก
        }
      });
    }
    // Return high-quality realistic simulated flights and insurance options
    const isHighGroup = ["ญี่ปุ่น", "สิงคโปร์", "อังกฤษ", "สหรัฐอเมริกา"].includes(destination);
    const multiplier = isHighGroup ? 2.5 : 1.2;

    return res.json({
      success: true,
      simulated: true,
      data: {
        originCity: "กรุงเทพฯ, ประเทศไทย",
        destinationCity: destination || "-", // ไม่มี AI ให้ derive เมือง จึงใช้ชื่อประเทศเป็น fallback
        flights: [
          { id: "flight-1", airline: "Thai Airways (TG)", pricePerPerson: Math.round(15000 * multiplier), departureTime: "08:00", arrivalTime: "16:30", baggageAllowance: "30 kg", totalPrice: Math.round(15000 * multiplier * (travelersCount || 1)), bookingUrl: "https://www.thaiairways.com" },
          { id: "flight-2", airline: "AirAsia (X)", pricePerPerson: Math.round(9500 * multiplier), departureTime: "11:45", arrivalTime: "19:50", baggageAllowance: "20 kg", totalPrice: Math.round(9500 * multiplier * (travelersCount || 1)), bookingUrl: "https://www.airasia.com" },
          { id: "flight-3", airline: "Singapore Airlines (SQ)", pricePerPerson: Math.round(18000 * multiplier), departureTime: "13:20", arrivalTime: "21:10", baggageAllowance: "30 kg", totalPrice: Math.round(18000 * multiplier * (travelersCount || 1)), bookingUrl: "https://www.singaporeair.com" }
        ],
        insurance: [
          { id: "ins-1", provider: "MSIG Insurance", planName: "Travel Easy (Worldwide Plan A)", pricePerPerson: Math.round(850 * (multiplier / 1.5)), coverage: "คุ้มครองค่ารักษาพยาบาล 2,000,000 บาท, กระเป๋าเดินทางหาย, เที่ยวบินล่าช้า", totalPrice: Math.round(850 * (multiplier / 1.5) * (travelersCount || 1)), purchaseUrl: "https://www.msig-thai.com" },
          { id: "ins-2", provider: "Allianz Travel", planName: "Dance Plan (Premium Protection)", pricePerPerson: Math.round(1200 * (multiplier / 1.5)), coverage: "คุ้มครองชีวิตและค่ารักษาพยาบาล 5,000,000 บาท, ชดเชยรายวัน, ดูแล 24 ชม.", totalPrice: Math.round(1200 * (multiplier / 1.5) * (travelersCount || 1)), purchaseUrl: "https://www.allianz.co.th" }
        ]
      }
    });
  }

  try {
    // เปิด Google Search grounding (2569-08-19) แบบ 2 ขั้นตอนแยกกัน — ทดสอบแล้วว่าถ้ารวม tools: googleSearch
    // เข้ากับ responseSchema ที่มี array ซ้อนกัน (flights/insurance) ในคำเรียกเดียว จะช้ามากจนเจอ HeadersTimeoutError (หลายนาที)
    // จึงแยกเป็น: (1) เรียก grounding แบบข้อความล้วนสั้นๆ ก่อน จำกัดเวลาไม่เกิน 15 วิ ถ้าช้า/พังก็ปล่อยผ่านไม่ให้ทั้ง request ค้าง
    // (2) เอาผลที่ได้ (ถ้ามี) ไปเป็น context เสริมให้คำเรียกที่ทำ JSON schema แบบเดิม (ไม่ผูก tools ในคำเรียกนี้ จึงเร็ว/เสถียรเหมือนเดิม)
    // ทริปในประเทศเดิมไม่เคยถูกคิดถึงตอนออกแบบ prompt นี้เลย (destination เดิมส่ง trip.country ซึ่งเป็น undefined สำหรับทริปในประเทศ
    // ทำให้ prompt ได้ "Country: undefined" แล้วพังไปเข้า catch ด้านล่างซึ่ง hardcode เที่ยวบินต่างประเทศไว้ — เจอบั๊กนี้จริงจากการทดสอบ)
    // แยก prompt เป็น 2 แบบตาม tripType: ในประเทศค้นเฉพาะเที่ยวบินในประเทศจากสายการบินไทยจริง ไม่มีประกันภัย (ไม่อยู่ในสิทธิ์เบิกจ่ายตามระเบียบข้อ 42-45)
    const groundingQuery = isDomestic
      ? `Use Google Search to find realistic, current one-way or round-trip domestic flight prices within Thailand for this route.
Conference venue: ${location}
Destination province: ${destination}
Departure Date: ${startDate}
Return Date: ${endDate}

Give a brief list of 3-5 real Thai domestic airlines (e.g. Thai Airways, Bangkok Airways, Thai AirAsia, Nok Air, Thai Lion Air, Thai Vietjet) serving Bangkok to the airport nearest this destination province, each with an approximate current price in THB per person. Keep the answer short — a compact list of findings, not full sentences.`
      : `Use Google Search to find realistic, current round-trip flight prices and travel insurance prices for this route.
Conference venue: ${location || destination}
Country: ${destination}
Departure Date: ${startDate}
Return Date: ${endDate}

Give a brief list of 3-5 real airlines serving Bangkok (BKK) to the nearest major city with an international airport, and 2-3 real Thai travel insurance providers, each with an approximate current price in THB per person. Keep the answer short — a compact list of findings, not full sentences.`;

    const groundedFacts = await ai.models
      .generateContent({
        model: agentModel,
        contents: groundingQuery,
        config: { tools: [{ googleSearch: {} }], httpOptions: { timeout: 15000 } }
      })
      .catch((e) => {
        console.error("A2 grounding step failed/timed out, falling back to knowledge-only estimate:", e.message);
        return null;
      });

    const groundedContext = groundedFacts?.text
      ? `\n\nReal-time Google Search findings for this route (prefer these over guessing where relevant, but do not fabricate URLs from this text):\n${groundedFacts.text}`
      : "";

    const prompt = isDomestic
      ? `Estimate realistic one-way or round-trip domestic flight options within Thailand for this route.
Conference venue: ${location}
Destination province: ${destination}
Departure Date: ${startDate}
Return Date: ${endDate}
Number of Travelers: ${travelersCount}

First, identify the airport nearest this destination province, and format the destination as "City, Thailand" in Thai (e.g. "เชียงใหม่, ประเทศไทย") — return this as destinationCity.
Then give 3 to 5 flight options from real Thai domestic airlines (e.g. Thai Airways, Bangkok Airways, Thai AirAsia, Nok Air, Thai Lion Air, Thai Vietjet) serving Bangkok to that airport (airline name, typical flight time, estimated price per person in THB, baggage allowance, and a bookingUrl pointing to that airline's own official website homepage — not a fake deep link). Domestic flight prices are typically in the 1,000-4,000 THB range per person, NOT international long-haul pricing — do not confuse this with an international route.
This is a domestic Thai government trip — travel insurance is not part of the reimbursable budget for domestic travel, so return an empty array for insurance.
Prices may still shift by the time of actual booking — this is for budget-planning purposes, not a live quote.
Respond strictly in JSON according to the schema provided.${groundedContext}`
      : `Estimate realistic round-trip flight options and travel insurance options for this route.
Conference venue: ${location || destination}
Country: ${destination}
Departure Date: ${startDate}
Return Date: ${endDate}
Number of Travelers: ${travelersCount}

First, identify the nearest major city (with an international airport) to the conference venue above, and format it as "City, Country" in Thai (e.g. "โตเกียว, ประเทศญี่ปุ่น") — return this as destinationCity.
Then give 3 to 5 flight options from real airlines that plausibly serve Bangkok (BKK) to that city (airline name, typical flight time, estimated price per person in THB, baggage allowance, and a bookingUrl pointing to that airline's own official website homepage — not a fake deep link).
Give 2 to 3 travel insurance options from real Thai travel insurance providers (e.g. MSIG, Allianz, AXA, Tune Protect, Viriyah — company name, plan name, estimated price per person in THB, brief coverage highlights in Thai, and a purchaseUrl pointing to that insurer's own official website homepage).
Prices may still shift by the time of actual booking — this is for budget-planning purposes, not a live quote.
Respond strictly in JSON according to the schema provided.${groundedContext}`;

    const response = await ai.models.generateContent({
      model: agentModel,
      contents: prompt,
      config: {
        // จำกัดเวลาไว้ด้วยเช่นกัน (แยกจาก step 1) — เจอกรณี call นี้เองก็ช้าผิดปกติได้เหมือนกันเป็นบางครั้ง (ไม่เกี่ยวกับ grounding)
        // ถ้าเกินเวลา error จะหลุดไปเข้า catch ด้านล่างซึ่ง fallback เป็นข้อมูลจำลองอยู่แล้ว ดีกว่าปล่อยให้ request ค้างไม่รู้จบ
        httpOptions: { timeout: 25000 },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            destinationCity: { type: Type.STRING, description: "Nearest major city + country to the venue, in Thai, formatted as 'City, Country'" },
            flights: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  airline: { type: Type.STRING },
                  pricePerPerson: { type: Type.NUMBER, description: "Estimated price per person in THB" },
                  departureTime: { type: Type.STRING, description: "Estimated departure time or flight duration" },
                  arrivalTime: { type: Type.STRING, description: "Estimated arrival time" },
                  baggageAllowance: { type: Type.STRING, description: "Baggage limit e.g. 20 kg" },
                  bookingUrl: { type: Type.STRING, description: "Airline's official website homepage URL" }
                },
                required: ["airline", "pricePerPerson"]
              }
            },
            insurance: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  provider: { type: Type.STRING },
                  planName: { type: Type.STRING },
                  pricePerPerson: { type: Type.NUMBER, description: "Insurance price per person in THB" },
                  coverage: { type: Type.STRING, description: "Brief coverage details in Thai" },
                  purchaseUrl: { type: Type.STRING, description: "Insurer's official website homepage URL" }
                },
                required: ["provider", "planName", "pricePerPerson", "coverage"]
              }
            }
          },
          required: ["destinationCity", "flights", "insurance"]
        }
      }
    });

    const jsonText = response.text || "{}";
    const parsed = JSON.parse(jsonText.trim());

    // Enrich with IDs and totals
    const flights = (parsed.flights || []).map((f: any, idx: number) => ({
      id: `flight-${idx + 1}`,
      airline: f.airline,
      pricePerPerson: f.pricePerPerson || 12000,
      departureTime: f.departureTime || "09:00",
      arrivalTime: f.arrivalTime || "17:00",
      baggageAllowance: f.baggageAllowance || "20 kg",
      totalPrice: (f.pricePerPerson || 12000) * travelersCount,
      bookingUrl: f.bookingUrl || undefined
    }));

    const insurance = (parsed.insurance || []).map((i: any, idx: number) => ({
      id: `ins-${idx + 1}`,
      provider: i.provider,
      planName: i.planName,
      pricePerPerson: i.pricePerPerson || 800,
      coverage: i.coverage || "คุ้มครองอุบัติเหตุและเจ็บป่วยต่างประเทศ",
      totalPrice: (i.pricePerPerson || 800) * travelersCount,
      purchaseUrl: i.purchaseUrl || undefined
    }));

    return res.json({
      success: true,
      simulated: false,
      data: { originCity: "กรุงเทพฯ, ประเทศไทย", destinationCity: parsed.destinationCity || destination, flights, insurance }
    });
  } catch (error: any) {
    console.error("Error in a2-search-travel:", error);
    // Fallback in case the Gemini call itself fails (quota, network, malformed response, etc.)
    // เดิม hardcode เที่ยวบินต่างประเทศเสมอ (Thai Airways/Japan Airlines/EVA Air ราคาระดับต่างประเทศ) แม้ทริปจะเป็นในประเทศก็ตาม
    // — คือจุดที่ทำให้ทริปเชียงใหม่โผล่เที่ยวบิน JAL/EVA Air ราคา 19,500-28,000 บาท ตอนที่คำเรียกจริงพังเพราะ destination เป็น undefined
    res.json({
      success: true,
      simulated: true,
      error: error.message,
      data: isDomestic
        ? {
            originCity: "กรุงเทพฯ, ประเทศไทย",
            destinationCity: destination || "-",
            flights: [
              { id: "flight-1", airline: "Thai Airways (TG) — เส้นทางในประเทศ", pricePerPerson: 2800, departureTime: "07:00", arrivalTime: "08:20", baggageAllowance: "20 kg", totalPrice: 2800 * travelersCount, bookingUrl: "https://www.thaiairways.com" },
              { id: "flight-2", airline: "Nok Air", pricePerPerson: 1600, departureTime: "09:15", arrivalTime: "10:35", baggageAllowance: "15 kg", totalPrice: 1600 * travelersCount, bookingUrl: "https://www.nokair.com" },
              { id: "flight-3", airline: "Thai AirAsia", pricePerPerson: 1400, departureTime: "11:30", arrivalTime: "12:50", baggageAllowance: "7 kg (ถือขึ้นเครื่อง)", totalPrice: 1400 * travelersCount, bookingUrl: "https://www.airasia.com" }
            ],
            insurance: []
          }
        : {
            originCity: "กรุงเทพฯ, ประเทศไทย",
            destinationCity: destination || "-",
            flights: [
              { id: "flight-1", airline: "Thai Airways (TG)", pricePerPerson: 22000, departureTime: "08:00", arrivalTime: "16:30", baggageAllowance: "30 kg", totalPrice: 22000 * travelersCount, bookingUrl: "https://www.thaiairways.com" },
              { id: "flight-2", airline: "Japan Airlines (JL)", pricePerPerson: 28000, departureTime: "09:45", arrivalTime: "18:00", baggageAllowance: "2x 23 kg", totalPrice: 28000 * travelersCount, bookingUrl: "https://www.jal.co.jp" },
              { id: "flight-3", airline: "EVA Air (BR)", pricePerPerson: 19500, departureTime: "07:30", arrivalTime: "15:40", baggageAllowance: "30 kg", totalPrice: 19500 * travelersCount, bookingUrl: "https://www.evaair.com" }
            ],
            insurance: [
              { id: "ins-1", provider: "MSIG Insurance", planName: "Travel Easy Plan A", pricePerPerson: 950, coverage: "คุ้มครองค่ารักษาพยาบาล 2,000,000 บาท และเที่ยวบินล่าช้า", totalPrice: 950 * travelersCount, purchaseUrl: "https://www.msig-thai.com" },
              { id: "ins-2", provider: "Allianz Travel", planName: "Travel Plus Health", pricePerPerson: 1150, coverage: "คุ้มครองชีวิตและค่ารักษาพยาบาล 3,000,000 บาท", totalPrice: 1150 * travelersCount, purchaseUrl: "https://www.allianz.co.th" }
            ]
          }
    });
  }
});

// A3: ร่างเฉพาะ "ย่อหน้าเหตุผล/ความสำคัญ" + อีเมลแจ้งเตือน — ไม่ให้ AI แตะโครงสร้าง/ตัวเลขงบประมาณ
// (ฝั่ง client เป็นผู้ประกอบเอกสารทั้งฉบับแบบ deterministic เสมอ ผ่าน src/utils/memoGenerator.ts และ docxGenerator.ts)
app.post("/api/agent/a3-draft-memo", requireRole("REQUESTER", "ADMIN"), requireAiUnlocked, async (req, res) => {
  const { tripPlan, หน่วยงาน, วัตถุประสงค์เพิ่มเติม } = req.body;
  const ai = getGeminiClient();
  const { agent: agentModel } = await getAiModels();

  // "ต่างประเทศ" ต่อท้ายเฉพาะทริปต่างประเทศ — เดิม hardcode ทุกทริป ทำให้ทริปในประเทศได้ข้อความ fallback ผิดว่าไปปฏิบัติงานต่างประเทศ (และ tripPlan.country เป็น undefined สำหรับทริปในประเทศ)
  const travelScopeText = tripPlan.tripType === "DOMESTIC" ? "" : "ต่างประเทศ";
  const locationPhrase = tripPlan.tripType === "DOMESTIC" ? tripPlan.location : `${tripPlan.location}, ประเทศ${tripPlan.country}`;

  const fallbackJustification = `ด้วย ${หน่วยงาน || 'หน่วยงาน'} มีความประสงค์ขออนุมัติให้บุคลากรเดินทางไปปฏิบัติงาน${travelScopeText} เพื่อเข้าร่วม ${tripPlan.projectName} ณ ${locationPhrase} อันจะเป็นประโยชน์ต่อการพัฒนาบุคลากรและการดำเนินภารกิจของหน่วยงานต่อไป`;
  const fallbackEmailSubject = `[แจ้งพิจารณา] บันทึกขออนุมัติเดินทางทริป ${tripPlan.projectName} - ${tripPlan.location}`;
  const fallbackEmailBody = `เรียน ทีมงานที่เกี่ยวข้อง,\n\nระบบ AI Agent ได้จัดร่างบันทึกข้อความขออนุมัติเดินทางไปราชการ${travelScopeText}เรียบร้อยแล้ว\nชื่องาน: ${tripPlan.projectName}\nปลายทาง: ${locationPhrase}\nยอดงบประมาณประมาณการรวม: ${(tripPlan.estimatedBudget || 0).toLocaleString()} บาท\n\nสามารถดาวน์โหลดไฟล์เอกสาร .docx เพื่อนำไปลงนามเสนอผู้บริหารผ่านระบบ CU LessPaper หรือเสนอเซ็นสดต่อไป`;

  if (!ai) {
    return res.json({
      success: true,
      simulated: true,
      data: { justificationText: fallbackJustification, emailSubject: fallbackEmailSubject, emailBody: fallbackEmailBody }
    });
  }

  try {
    const prompt = `Draft ONE professional Thai paragraph (ย่อหน้าเหตุผล/ความสำคัญ) for an official Thai government travel-approval memorandum,
explaining why staff from "${หน่วยงาน || 'the requesting department'}" should travel to attend the following. Also draft a short internal
notification email (Thai) telling colleagues the memo draft is ready for review.

IMPORTANT: This is a ${tripPlan.tripType === "DOMESTIC" ? "DOMESTIC trip within Thailand — do NOT use the word \"ต่างประเทศ\" (abroad) anywhere" : "INTERNATIONAL trip abroad — use \"ต่างประเทศ\" (abroad) naturally where appropriate"}.

Trip details:
- Event/Conference: ${tripPlan.projectName}
- Location: ${locationPhrase}
- Dates: ${tripPlan.startDate} to ${tripPlan.endDate}
- Traveler positions: ${JSON.stringify((tripPlan.travelers || []).map((t: any) => t.position || t.rank))}
- Additional context from requester: ${วัตถุประสงค์เพิ่มเติม || '(none)'}

Write ONLY the justification paragraph text in formal Thai — no HTML tags, no headers, no signature block, no budget figures.
This single paragraph will be inserted verbatim into a pre-built official memo template, so it must read naturally as a standalone
opening paragraph. Keep it under 120 Thai words.
Return strictly in JSON with justificationText, emailSubject, and emailBody.`;

    const response = await ai.models.generateContent({
      model: agentModel,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            justificationText: { type: Type.STRING, description: "ย่อหน้าเหตุผล/ความสำคัญ ภาษาไทยทางการ ข้อความล้วน ไม่มี HTML" },
            emailSubject: { type: Type.STRING },
            emailBody: { type: Type.STRING }
          },
          required: ["justificationText", "emailSubject", "emailBody"]
        }
      }
    });

    const jsonText = response.text || "{}";
    const data = JSON.parse(jsonText.trim());
    return res.json({ success: true, simulated: false, data });
  } catch (error: any) {
    console.error("Error in a3-draft-memo:", error);
    res.json({
      success: true,
      simulated: true,
      error: error.message,
      data: { justificationText: fallbackJustification, emailSubject: fallbackEmailSubject, emailBody: fallbackEmailBody }
    });
  }
});

// A4: Parse Approved Memo (AI Vision/Extraction)
app.post("/api/agent/a4-parse-memo", requireRole("FINANCE_OFFICER", "ADMIN"), requireAiUnlocked, async (req, res) => {
  const { fileData, mimeType } = req.body;
  const ai = getGeminiClient();
  const { agent: agentModel } = await getAiModels();

  // Standard extracted data to represent an approved memo
  const mockExtracted = {
    documentNo: "อว 8604 / ว 2045",
    department: "คณะเทคโนโลยีสารสนเทศและนวัตกรรมดิจิทัล",
    date: new Date().toISOString().split('T')[0],
    projectName: "The International Symposium on Advanced Artificial Intelligence 2026",
    totalAmount: 185200,
    budgetCode: "BG-6901-2026",
    travelers: ["ดร. สมชาย รักดี", "ผศ.ดร. หญิง สุขดี"],
    expenses: [
      { item: "ค่าตั๋วเครื่องบินไป-กลับ", amount: 48000 },
      { item: "ค่าที่พักต่างประเทศ", amount: 64000 },
      { item: "ค่าเบี้ยเลี้ยงเดินทางต่างประเทศ", amount: 49000 },
      { item: "ค่าประกันภัยการเดินทาง", amount: 1900 },
      { item: "ค่าธรรมเนียมหนังสือเดินทางราชการและวีซ่า", amount: 3000 },
      { item: "ค่าพาหนะรับจ้างต่างประเทศ", amount: 4000 }
    ]
  };

  if (!ai || !fileData) {
    return res.json({ success: true, simulated: true, data: mockExtracted });
  }

  try {
    const response = await ai.models.generateContent({
      model: agentModel,
      contents: [
        {
          inlineData: {
            data: fileData,
            mimeType: mimeType || "image/png"
          }
        },
        {
          text: "Identify this approved memorandum document. Extract all numerical and textual fields required for CU E-payment. Respond ONLY with JSON matching the schema."
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            documentNo: { type: Type.STRING },
            department: { type: Type.STRING },
            date: { type: Type.STRING },
            projectName: { type: Type.STRING },
            totalAmount: { type: Type.NUMBER },
            budgetCode: { type: Type.STRING },
            travelers: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            expenses: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  item: { type: Type.STRING },
                  amount: { type: Type.NUMBER }
                },
                required: ["item", "amount"]
              }
            }
          },
          required: ["documentNo", "department", "projectName", "totalAmount"]
        }
      }
    });

    const jsonText = response.text || "{}";
    const data = JSON.parse(jsonText.trim());
    return res.json({ success: true, simulated: false, data });
  } catch (error: any) {
    console.error("Error in a4-parse-memo:", error);
    res.json({ success: true, simulated: true, data: mockExtracted });
  }
});

// A5: Parse Receipt (Vision OCR & GL Matching)
app.post("/api/agent/a5-parse-receipt", requireRole("REQUESTER", "FINANCE_OFFICER", "ADMIN"), requireAiUnlocked, async (req, res) => {
  const { fileData, mimeType, fileName } = req.body;
  const ai = getGeminiClient();
  const { agent: agentModel } = await getAiModels();

  // Mock receipt extraction depending on file name keywords or defaults
  const nameLower = (fileName || "").toLowerCase();
  let mockReceipt = {
    merchantName: "Hilton Tokyo Hotel",
    date: "2026-08-14",
    currency: "JPY",
    subtotal: 210000,
    vat: 21000,
    total: 231000,
    qualityScore: 92,
    items: [
      {
        description: "Room accommodation (4 nights)",
        amount: 210000,
        glCode: "5103010002",
        confidence: 96
      }
    ]
  };

  if (nameLower.includes("flight") || nameLower.includes("ticket") || nameLower.includes("tg") || nameLower.includes("air")) {
    mockReceipt = {
      merchantName: "Thai Airways Co., Ltd.",
      date: "2026-08-01",
      currency: "THB",
      subtotal: 22430,
      vat: 1570,
      total: 24000,
      qualityScore: 95,
      items: [
        {
          description: "Flight BKK-NRT Roundtrip (SOMCHAI)",
          amount: 24000,
          glCode: "5103010001",
          confidence: 98
        }
      ]
    };
  } else if (nameLower.includes("food") || nameLower.includes("restaurant") || nameLower.includes("meal")) {
    mockReceipt = {
      merchantName: "Ichiran Ramen Shinjuku",
      date: "2026-08-11",
      currency: "JPY",
      subtotal: 3500,
      vat: 350,
      total: 3850,
      qualityScore: 89,
      items: [
        {
          description: "Food and Beverage (Meals)",
          amount: 3850,
          glCode: "5103010003",
          confidence: 76 // Low confidence triggers warning in UI (<80%)
        }
      ]
    };
  }

  if (!ai || !fileData) {
    return res.json({ success: true, simulated: true, data: mockReceipt });
  }

  try {
    const response = await ai.models.generateContent({
      model: agentModel,
      contents: [
        {
          inlineData: {
            data: fileData,
            mimeType: mimeType || "image/png"
          }
        },
        {
          text: "Scan this receipt. Perform OCR to extract Merchant name, transaction date (format YYYY-MM-DD), items description and costs, total amount, subtotal, VAT, and currency. Auto-match items to standard GL codes: 5103010001 (Airfare), 5103010002 (Accommodation), 5103010003 (Meals/Per Diem), 5103010004 (Insurance), 5103010005 (Passport/Visa), 5103010006 (Taxi/Transport). Also evaluate image clarity/quality score (0-100). Respond ONLY in JSON."
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            merchantName: { type: Type.STRING },
            date: { type: Type.STRING, description: "Format: YYYY-MM-DD" },
            currency: { type: Type.STRING, description: "3-letter ISO code e.g. THB, USD, JPY" },
            subtotal: { type: Type.NUMBER },
            vat: { type: Type.NUMBER },
            total: { type: Type.NUMBER },
            qualityScore: { type: Type.NUMBER, description: "Clarity check score out of 100" },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  description: { type: Type.STRING },
                  amount: { type: Type.NUMBER },
                  glCode: { type: Type.STRING, description: "Suggested GL Code" },
                  confidence: { type: Type.NUMBER, description: "GL matching confidence score out of 100" }
                },
                required: ["description", "amount", "glCode", "confidence"]
              }
            }
          },
          required: ["merchantName", "date", "total", "items"]
        }
      }
    });

    const jsonText = response.text || "{}";
    const data = JSON.parse(jsonText.trim());
    return res.json({ success: true, simulated: false, data });
  } catch (error: any) {
    console.error("Error in a5-parse-receipt:", error);
    res.json({ success: true, simulated: true, data: mockReceipt });
  }
});

// -------------------------------------------------------------
// CHATBOT (Phase 1: ตอบคำถามระเบียบจากข้อมูล rate ต่างๆ ในฐานข้อมูลโดยตรง — ยังไม่มี trip search/สร้างคำขอ/RAG เอกสาร)
// -------------------------------------------------------------

// รวมข้อมูลระเบียบ/อัตราทั้งหมดในระบบเป็น context เดียว ให้ Gemini อ้างอิงตอบคำถามได้ตรงกับฐานข้อมูลจริงเสมอ
// (ข้อมูลมีขนาดพอเหมาะ ไม่ต้องทำ RAG/vector search แค่ยัด context ตรงๆ ก็พอ)
async function buildRegulationContext(): Promise<string> {
  const [
    policyRates,
    countryGroups,
    insuranceZoneRates,
    insuranceDurationTiers,
    insurancePlanTiers,
    domesticLumpSumRates,
    domesticAccommodationRates,
    domesticPerDiemRates,
    flightClassRules,
    regulationConstants,
    glCodes,
  ] = await Promise.all([
    prisma.policyRate.findMany(),
    prisma.countryGroup.findMany({ orderBy: { country: "asc" } }),
    prisma.insuranceZoneRate.findMany({ orderBy: { zone: "asc" } }),
    prisma.insuranceDurationTier.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.insurancePlanTier.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.domesticLumpSumRate.findMany(),
    prisma.domesticAccommodationRate.findMany(),
    prisma.domesticPerDiemRate.findMany(),
    prisma.flightClassRule.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.regulationConstant.findMany(),
    prisma.gLCode.findMany(),
  ]);

  return `
== ตำแหน่ง TIER ต่างๆ (คำอธิบายกลุ่มตำแหน่ง) ==
ต่างประเทศ (ข้อ 46-47): TIER1 = นายกสภา/กรรมการสภา/อธิการบดี/รองอธิการบดี/หัวหน้าส่วนงาน(รักษาการ)/ศาสตราจารย์/รองศาสตราจารย์/พนักงานมหาวิทยาลัยระดับ P1-P3, TIER2 = ผู้ช่วยศาสตราจารย์/อาจารย์/พนักงานมหาวิทยาลัยระดับ P4-P9
ในประเทศ (ข้อ 42/43(1)): TIER1 = นายกสภา/กรรมการสภา/อธิการบดี/รองอธิการบดี/หัวหน้าส่วนงาน(รักษาการ)/ศาสตราจารย์, TIER2 = รองศาสตราจารย์/ผู้ช่วยศาสตราจารย์/พนักงานมหาวิทยาลัยระดับ P1-P4, TIER3 = อาจารย์/พนักงานมหาวิทยาลัยระดับ P5-P7, TIER4 = กรณีอื่น
ในประเทศ เบี้ยเลี้ยงแยกรายการ (ข้อ 43(2)): TIER_A = แทบทุกตำแหน่งถึงอาจารย์/พนักงานมหาวิทยาลัยระดับ P1-P7, TIER_B = กรณีอื่น

== อัตราต่างประเทศตามกลุ่มประเทศ (ข้อ 46-47) — perDiemLumpSum=เหมาจ่ายรวมข้อ46, accommodationMax=ที่พักสูงสุดข้อ47(1), perDiemItemized=เบี้ยเลี้ยงแยกรายการข้อ47(2) ==
tier,countryGroup,perDiemLumpSum,accommodationMax,perDiemItemized,effectiveYear(พ.ศ.)
${policyRates.map((r) => `${r.tier},${r.countryGroup},${r.perDiemLumpSum},${r.accommodationMax},${r.perDiemItemized},${r.effectiveYear}`).join("\n")}

== อัตราในประเทศ เหมาจ่ายรวม (ข้อ 42) ==
tier,ratePerDay(บาท/วัน)
${domesticLumpSumRates.map((r) => `${r.tier},${r.ratePerDay}`).join("\n")}

== อัตราในประเทศ ค่าที่พักแยกรายการ (ข้อ 43(1)) ==
tier,singleRoomMax,twinRoomMax
${domesticAccommodationRates.map((r) => `${r.tier},${r.singleRoomMax},${r.twinRoomMax}`).join("\n")}

== อัตราในประเทศ เบี้ยเลี้ยงแยกรายการ (ข้อ 43(2)) ==
tier,ratePerDay(บาท/วัน)
${domesticPerDiemRates.map((r) => `${r.tier},${r.ratePerDay}`).join("\n")}

== สิทธิ์ชั้นโดยสารเครื่องบินตามตำแหน่ง (ข้อ 44(4) ในประเทศ, ข้อ 48(2) ต่างประเทศ) ==
scope,positionLabel,maxClass,exceptionMaxClass,exceptionThresholdHours(ชม.บินขั้นต่ำ)
${flightClassRules.map((r) => `${r.scope},${r.positionLabel},${r.maxClass},${r.exceptionMaxClass || "-"},${r.exceptionThresholdHours ?? "-"}`).join("\n")}

== ค่าคงที่อื่นๆ ตามระเบียบ ==
${regulationConstants.map((r) => `${r.key} = ${r.value} (${r.description})`).join("\n")}

== กลุ่มประเทศ + ข้อมูลประมาณการรายประเทศ (ข้อ 46/47 กลุ่มประเทศ, ข้อ 49 วันเดินทางล่วงหน้า/กลับหลัง) — ประเทศที่ไม่อยู่ในรายการถือเป็นกลุ่ม 5 และบัฟเฟอร์ 1 วันโดยปริยาย ==
country,group,travelBufferDays,estimatedFlightCost(บาท),insuranceZone,visaRequirement,estimatedVisaFee(บาท)
${countryGroups.map((c) => `${c.country},${c.group},${c.travelBufferDays},${c.estimatedFlightCost ?? "-"},${c.insuranceZone ?? "-"},${c.visaRequirement ?? "-"},${c.estimatedVisaFee ?? "-"}`).join("\n")}

== ประกันเดินทาง — โซนความเสี่ยง (ตัวคูณราคาฐานตามความเสี่ยง ไม่ใช่อัตราตามระเบียบ เป็น rule ประมาณการของระบบ) ==
zone,label,multiplier
${insuranceZoneRates.map((r) => `${r.zone},${r.label},${r.multiplier}`).join("\n")}

== ประกันเดินทาง — ราคาฐานตามช่วงวันเดินทาง (ไม่ใช่อัตราตามระเบียบ เป็น rule ประมาณการ) ==
minDays,maxDays,basePrice
${insuranceDurationTiers.map((r) => `${r.minDays},${r.maxDays ?? "ไม่จำกัด"},${r.basePrice}`).join("\n")}

== ประกันเดินทาง — ระดับแผนความคุ้มครอง (ไม่ใช่อัตราตามระเบียบ เป็น rule ประมาณการ) ==
tier,label,multiplier,coverageDescription
${insurancePlanTiers.map((r) => `${r.tier},${r.label},${r.multiplier},${r.coverageDescription}`).join("\n")}

== รหัสบัญชีแยกประเภท (GL Code) สำหรับจับคู่รายการค่าใช้จ่าย ==
code,name
${glCodes.map((g) => `${g.code},${g.name}`).join("\n")}
`.trim();
}

// เดิม buildRegulationContext() ถูกยัดใส่ system prompt ทุกครั้งที่ chat ไม่ว่าคำถามจะเกี่ยวกับอัตราหรือไม่
// เปลี่ยนเป็น tool ที่ Gemini เรียกเฉพาะตอนต้องใช้ตัวเลขจริงๆ — ประหยัด token ทุกคำถามที่ไม่เกี่ยวกับอัตรา/ระเบียบ (เช่น ค้นหาทริป, ทักทาย)
const getRegulationDataDeclaration = {
  name: "get_regulation_data",
  description:
    "ดึงข้อมูลระเบียบ/อัตราการเบิกจ่ายค่าเดินทางทั้งหมดในระบบ (เบี้ยเลี้ยง, ที่พัก, ตั๋วเครื่องบิน, ประกันเดินทาง, กลุ่มประเทศ, GL Code ฯลฯ) ต้องเรียกฟังก์ชันนี้ก่อนตอบคำถามที่เกี่ยวกับตัวเลข/อัตรา/ระเบียบการเบิกจ่ายเสมอ ห้ามเดาหรือแต่งตัวเลขขึ้นเองโดยไม่เรียกฟังก์ชันนี้ก่อน",
  parameters: { type: Type.OBJECT, properties: {} },
};

// ---- Phase 2: ค้นหาคำขอเดินทางในระบบ (สิทธิ์เหมือน GET /api/trips — REQUESTER เห็นแค่ทริปตัวเอง) ----
async function executeSearchTrips(session: { userId?: string; role?: string }, args: any) {
  const where: any = session.role === "REQUESTER" ? { requesterId: session.userId } : {};
  const and: any[] = [];
  if (args.keyword) {
    and.push({
      OR: [
        { projectName: { contains: args.keyword } },
        { location: { contains: args.keyword } },
        { country: { contains: args.keyword } },
        { destinationProvince: { contains: args.keyword } },
      ],
    });
  }
  if (args.country) and.push({ country: { contains: args.country } });
  if (args.status) and.push({ status: args.status });
  if (!args.includeCancelled) and.push({ isCancelled: false });
  if (and.length) where.AND = and;

  return prisma.tripPlan.findMany({ where, orderBy: { createdAt: "desc" }, take: 15 });
}

const searchTripsDeclaration = {
  name: "search_trips",
  description:
    "ค้นหารายการคำขอเดินทางในระบบ ตามคำค้น/ประเทศ/สถานะ ผลลัพธ์ถูกกรองตามสิทธิ์ผู้ใช้ที่ล็อกอินอยู่โดยอัตโนมัติ (REQUESTER เห็นแค่ทริปของตัวเอง) — ไม่ต้องอธิบายรายละเอียดคำขอทีละรายการในคำตอบ ระบบจะแสดงตารางผลลัพธ์ให้ผู้ใช้เอง แค่สรุปสั้นๆว่าพบกี่รายการ",
  parameters: {
    type: Type.OBJECT,
    properties: {
      keyword: { type: Type.STRING, description: "คำค้นทั่วไป จับคู่กับชื่อโครงการ/ปลายทาง/จังหวัด/ประเทศ" },
      country: { type: Type.STRING, description: "ชื่อประเทศปลายทาง (ภาษาไทย)" },
      status: {
        type: Type.STRING,
        description:
          "สถานะขั้นตอน หนึ่งใน: A1_DRAFT, A2_SEARCHING, A3_MEMO_DRAFTED, A3_A4_WAITING_SIGNATURE, A4_EPAYMENT_PREP, A4_EXPORTED, FIORI_PENDING, WAITING_CASH_ADVANCE, A5_UPLOADING_RECEIPTS, TRIP_CLEARED",
      },
      includeCancelled: { type: Type.BOOLEAN, description: "true = รวมรายการที่ยกเลิกแล้วด้วย (default false)" },
    },
  },
};

// รายชื่อผู้เดินทาง (ใช้ร่วมกันทั้ง create_trip_draft และ update_trip_draft) — ต้องเป็น "รายชื่อทั้งหมด" ที่คุยกันมาในบทสนทนา ไม่ใช่แค่คนล่าสุด
// (บั๊กเดิม: ใช้ field เดียว travelerName:STRING ทำให้เก็บได้แค่ 1 คน พอผู้ใช้เพิ่มคนที่ 2 คนแรกก็หายไป)
const travelersParamSchema = {
  type: Type.ARRAY,
  description:
    "รายชื่อผู้เดินทางทั้งหมดที่ทราบในบทสนทนานี้ (ต้องรวมทุกคนที่คุยกันมาแล้ว ไม่ใช่แค่คนที่เพิ่งพูดถึงล่าสุด) — ถ้าผู้ใช้ขอ 'เพิ่ม' ผู้เดินทาง ให้ส่งรายชื่อเดิมทั้งหมดพร้อมคนใหม่ที่เพิ่ม ถ้าขอ 'ลบ' ให้ส่งรายชื่อที่เหลือหลังตัดคนนั้นออก",
  items: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: "ชื่อ-นามสกุล" },
      position: { type: Type.STRING, description: "ตำแหน่ง เช่น อาจารย์, พนักงานมหาวิทยาลัย" },
      positionLevel: { type: Type.STRING, description: "ระดับตำแหน่ง เช่น P1-P9 ถ้าทราบ" },
    },
    required: ["name"],
  },
};

function normalizeTravelerInput(t: any) {
  return {
    name: t?.name || "",
    position: t?.position || "อาจารย์",
    positionLevel: t?.positionLevel || "P1",
    rank: "Staff",
    perDiemRate: 1500,
    maxAccommodationRate: 5000,
    days: 5,
  };
}

// ---- Phase 4: เตรียมข้อมูลร่างคำขอเดินทางใหม่จากบทสนทนา (READ-ONLY — ไม่บันทึกลง DB) ----
// AI มีหน้าที่แค่ "จัดเตรียมข้อมูล" ให้ผู้ใช้ตรวจสอบเท่านั้น ห้ามเขียนข้อมูลลง DB โดยตรงเด็ดขาด
// การบันทึกจริงเกิดขึ้นเมื่อผู้ใช้กดยืนยันในหน้าจอ ผ่าน POST /api/trips (write tool ที่มีอยู่แล้ว) เท่านั้น
function executeCreateTripDraft(session: { userId?: string; role?: string }, args: any) {
  if (session.role !== "REQUESTER" && session.role !== "ADMIN") {
    return { error: "บทบาทนี้ไม่มีสิทธิ์สร้างคำขอเดินทางใหม่" };
  }
  if (!args.projectName) {
    return { error: "ต้องระบุชื่องาน/โครงการก่อนสร้างคำขอ" };
  }
  const tripType = args.tripType === "DOMESTIC" ? "DOMESTIC" : "INTERNATIONAL";
  return {
    draft: {
      projectName: args.projectName,
      tripType,
      startDate: args.startDate || "",
      endDate: args.endDate || "",
      location: args.location || "",
      country: tripType === "INTERNATIONAL" ? args.country || "" : "",
      destinationProvince: tripType === "DOMESTIC" ? args.destinationProvince || "" : "",
      hostOrganization: args.hostOrganization || "",
      travelers: Array.isArray(args.travelers) ? args.travelers.map(normalizeTravelerInput) : [],
    },
  };
}

const createTripDraftDeclaration = {
  name: "create_trip_draft",
  description:
    "เตรียมข้อมูลร่างคำขอเดินทางใหม่จากข้อมูลที่รวบรวมได้ในบทสนทนา (ยังไม่บันทึกลงระบบ) ต้องถามผู้ใช้ให้ได้ข้อมูลที่จำเป็น (ชื่องาน/โครงการ, ปลายทาง, ช่วงวันที่โดยประมาณ) ให้ครบก่อนเรียกใช้ฟังก์ชันนี้ — ห้ามเดาข้อมูลที่ผู้ใช้ยังไม่ได้ให้ อย่าเรียกฟังก์ชันนี้ถ้ายังไม่มีอย่างน้อยชื่องาน/โครงการ หลังเรียกแล้วระบบจะแสดงข้อมูลร่างให้ผู้ใช้ตรวจสอบและกดยืนยันเองเพื่อบันทึกจริง",
  parameters: {
    type: Type.OBJECT,
    properties: {
      projectName: { type: Type.STRING, description: "ชื่องาน/โครงการที่เดินทางไป" },
      tripType: { type: Type.STRING, description: "'DOMESTIC' (ในประเทศ) หรือ 'INTERNATIONAL' (ต่างประเทศ)" },
      startDate: { type: Type.STRING, description: "วันเริ่มเดินทาง/ประชุม รูปแบบ YYYY-MM-DD ถ้าทราบ" },
      endDate: { type: Type.STRING, description: "วันสิ้นสุด รูปแบบ YYYY-MM-DD ถ้าทราบ" },
      location: { type: Type.STRING, description: "สถานที่จัดงาน/เมืองปลายทาง" },
      country: { type: Type.STRING, description: "ประเทศปลายทาง ภาษาไทย (เฉพาะ INTERNATIONAL)" },
      destinationProvince: { type: Type.STRING, description: "จังหวัดปลายทาง (เฉพาะ DOMESTIC)" },
      hostOrganization: { type: Type.STRING, description: "องค์กรเจ้าภาพ/ผู้จัดงาน" },
      travelers: travelersParamSchema,
    },
    required: ["projectName"],
  },
};

// ---- เตรียมข้อมูลแก้ไขคำขอเดินทางที่มีอยู่แล้ว (READ-ONLY — ไม่บันทึกลง DB) ----
// ต้องรู้ tripId จาก search_trips ก่อนเสมอ, แก้ได้เฉพาะคำขอที่ยังอยู่ขั้น A1_DRAFT (ยังไม่ผ่านขั้นตอนไปไหน) เพื่อความปลอดภัย
// เหมือน executeCreateTripDraft คือ "เตรียมข้อมูล" ให้ผู้ใช้ตรวจสอบเท่านั้น การบันทึกจริงเกิดจากผู้ใช้กดยืนยัน → PUT /api/trips/:id ที่มีอยู่แล้ว
async function executeUpdateTripDraft(session: { userId?: string; role?: string }, args: any) {
  if (session.role !== "REQUESTER" && session.role !== "ADMIN") {
    return { error: "บทบาทนี้ไม่มีสิทธิ์แก้ไขคำขอเดินทาง" };
  }
  if (!args.tripId) {
    return { error: "ต้องระบุ tripId ของคำขอที่ต้องการแก้ไข — เรียก search_trips ก่อนเพื่อหา tripId" };
  }
  const trip = await prisma.tripPlan.findUnique({ where: { id: args.tripId } });
  if (!trip) {
    return { error: "ไม่พบคำขอเดินทางนี้ในระบบ" };
  }
  if (session.role === "REQUESTER" && trip.requesterId !== session.userId) {
    return { error: "ไม่มีสิทธิ์แก้ไขคำขอนี้" };
  }
  if (trip.status !== "A1_DRAFT") {
    return {
      error:
        "คำขอนี้ผ่านขั้นตอน A1 ไปแล้ว ไม่สามารถแก้ไขผ่านแชทได้อีก — แจ้งผู้ใช้ให้ไปจัดการที่หน้ารายการคำขอโดยตรงแทน",
    };
  }

  const tripType = trip.tripType;
  return {
    draft: {
      tripId: trip.id,
      projectName: args.projectName || trip.projectName,
      tripType,
      startDate: args.startDate || trip.startDate,
      endDate: args.endDate || trip.endDate,
      location: args.location || trip.location,
      country: tripType === "INTERNATIONAL" ? args.country ?? trip.country ?? "" : "",
      destinationProvince: tripType === "DOMESTIC" ? args.destinationProvince ?? trip.destinationProvince ?? "" : "",
      hostOrganization: args.hostOrganization || trip.hostOrganization,
      travelers:
        Array.isArray(args.travelers) && args.travelers.length
          ? args.travelers.map(normalizeTravelerInput)
          : trip.travelers,
    },
  };
}

const updateTripDraftDeclaration = {
  name: "update_trip_draft",
  description:
    "เตรียมข้อมูลการแก้ไขคำขอเดินทางที่มีอยู่แล้วในระบบ ใช้เมื่อผู้ใช้ต้องการเปลี่ยนแปลงข้อมูลบางส่วนของคำขอเดิม (เช่น เปลี่ยนวันเดินทาง, เพิ่ม/ลบผู้เดินทาง, เปลี่ยนปลายทาง) — ต้องเรียก search_trips ก่อนเสมอเพื่อหา tripId ที่ถูกต้อง ห้ามเดา tripId แก้ไขได้เฉพาะคำขอที่ยังอยู่ขั้นตอน A1 (ร่าง) เท่านั้น ถ้าคำขอผ่านขั้น A1 ไปแล้วฟังก์ชันนี้จะปฏิเสธ ฟังก์ชันนี้เป็นการ 'เตรียมข้อมูล' เท่านั้น ยังไม่บันทึกจริง ระบบจะแสดงรายการที่จะเปลี่ยนให้ผู้ใช้ตรวจสอบและกดยืนยันเองจึงบันทึกจริง",
  parameters: {
    type: Type.OBJECT,
    properties: {
      tripId: { type: Type.STRING, description: "id ของคำขอที่ต้องการแก้ไข (ได้จากผลลัพธ์ search_trips ก่อนหน้านี้ในบทสนทนาเดียวกัน)" },
      projectName: { type: Type.STRING, description: "ชื่องาน/โครงการใหม่ (ถ้าต้องการเปลี่ยน)" },
      startDate: { type: Type.STRING, description: "วันเริ่มเดินทางใหม่ รูปแบบ YYYY-MM-DD (ถ้าต้องการเปลี่ยน)" },
      endDate: { type: Type.STRING, description: "วันสิ้นสุดใหม่ รูปแบบ YYYY-MM-DD (ถ้าต้องการเปลี่ยน)" },
      location: { type: Type.STRING, description: "สถานที่จัดงาน/เมืองปลายทางใหม่ (ถ้าต้องการเปลี่ยน)" },
      country: { type: Type.STRING, description: "ประเทศปลายทางใหม่ ภาษาไทย (ถ้าต้องการเปลี่ยน)" },
      destinationProvince: { type: Type.STRING, description: "จังหวัดปลายทางใหม่ (ถ้าต้องการเปลี่ยน)" },
      hostOrganization: { type: Type.STRING, description: "องค์กรเจ้าภาพใหม่ (ถ้าต้องการเปลี่ยน)" },
      travelers: travelersParamSchema,
    },
    required: ["tripId"],
  },
};

// ---- Phase 3: RAG เอกสารระเบียบต้นฉบับ — ยังไม่มีเอกสาร ingest เข้าระบบ (รอผู้ใช้ส่งมา) ----
// ระหว่างที่ตาราง RegulationDocumentChunk ยังว่าง ฟังก์ชันนี้ตอบกลับทันทีโดยไม่ต้องเรียก Gemini เลย (ไม่กินโควต้า)
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

async function executeSearchRegulationDocuments(ai: GoogleGenAI, args: any) {
  const totalChunks = await prisma.regulationDocumentChunk.count();
  if (totalChunks === 0) {
    return {
      found: false,
      message:
        "ยังไม่มีเอกสารระเบียบต้นฉบับ (ตัวเต็ม) อัปโหลดเข้าระบบในขณะนี้ ตอบได้เฉพาะจากข้อมูลตัวเลข/อัตราที่มีในฐานข้อมูลที่ให้ไว้แล้วเท่านั้น",
    };
  }
  const embedRes = await ai.models.embedContent({ model: DEFAULT_EMBEDDING_MODEL, contents: [args.query || ""] });
  const queryVector = embedRes.embeddings?.[0]?.values;
  if (!queryVector) return { found: false, message: "ไม่สามารถประมวลผลคำค้นได้" };

  const chunks = await prisma.regulationDocumentChunk.findMany();
  const ranked = chunks
    .map((c) => ({ text: c.text, source: c.source, score: cosineSimilarity(queryVector, c.embedding as number[]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  return { found: true, chunks: ranked };
}

const searchRegulationDocumentsDeclaration = {
  name: "search_regulation_documents",
  description:
    "ค้นหาเนื้อหาจากเอกสารระเบียบต้นฉบับแบบเต็ม (ข้อความจริงในประกาศฯ) ใช้เมื่อคำถามต้องการรายละเอียด/ข้อยกเว้น/ขั้นตอนที่ไม่มีอยู่ในข้อมูลตัวเลขที่ให้ไว้แล้วในบทสนทนานี้ — ถ้าเรียกแล้วได้ found:false แปลว่ายังไม่มีเอกสารในระบบ ให้แจ้งผู้ใช้ตามนั้น",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: "คำค้นหรือคำถามที่ต้องการหาในเอกสารระเบียบ" },
    },
    required: ["query"],
  },
};

// รับเอกสารระเบียบต้นฉบับ (ข้อความที่สกัดมาแล้ว) มาตัดเป็นชิ้นๆ + สร้าง embedding เก็บไว้ให้ search_regulation_documents ใช้
// ยังไม่มีใครเรียกใช้ endpoint นี้จริง — เตรียมไว้รอตอนที่มีเอกสารต้นฉบับส่งมา
app.post("/api/agent/ingest-regulation-doc", requireRole("ADMIN"), requireAiUnlocked, async (req, res) => {
  const { source, textContent } = req.body as { source?: string; textContent?: string };
  if (!source || !textContent?.trim()) {
    return res.status(400).json({ success: false, error: "ต้องระบุ source และ textContent" });
  }
  const ai = getGeminiClient();
  if (!ai) return res.status(400).json({ success: false, error: "ยังไม่ได้ตั้งค่า GEMINI_API_KEY" });

  try {
    const paragraphs = textContent.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const chunks: string[] = [];
    let buffer = "";
    for (const p of paragraphs) {
      if (buffer && (buffer + "\n\n" + p).length > 1000) {
        chunks.push(buffer);
        buffer = p;
      } else {
        buffer = buffer ? `${buffer}\n\n${p}` : p;
      }
    }
    if (buffer) chunks.push(buffer);

    await prisma.regulationDocumentChunk.deleteMany({ where: { source } });
    for (let i = 0; i < chunks.length; i++) {
      const embedRes = await ai.models.embedContent({ model: DEFAULT_EMBEDDING_MODEL, contents: [chunks[i]] });
      const vector = embedRes.embeddings?.[0]?.values;
      if (!vector) continue;
      await prisma.regulationDocumentChunk.create({
        data: { source, chunkIndex: i, text: chunks[i], embedding: vector as any },
      });
    }

    const chunksIndexed = await prisma.regulationDocumentChunk.count({ where: { source } });
    res.json({ success: true, data: { chunksIndexed } });
  } catch (error: any) {
    console.error("Error in ingest-regulation-doc:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---- ป้องกันการใช้งานผิดปกติ (abuse) — sliding window แบบ in-memory ต่อ userId ----
// จุดประสงค์คือกันการยิงถี่ผิดปกติ/บอท ไม่ใช่จำกัดโควต้าให้เท่ากันทุกคน จึงตั้งค่าให้หลวมพอที่จะไม่กระทบการใช้งานจริง
const CHAT_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const CHAT_RATE_LIMIT_MAX_REQUESTS = 20;
const chatRequestLog = new Map<string, number[]>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (chatRequestLog.get(userId) || []).filter((t) => now - t < CHAT_RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  chatRequestLog.set(userId, recent);
  return recent.length > CHAT_RATE_LIMIT_MAX_REQUESTS;
}

function logTokenUsage(label: string, response: any) {
  const usage = response?.usageMetadata;
  if (usage) {
    console.log(
      `[gemini-usage] ${label} — prompt:${usage.promptTokenCount ?? "?"} output:${usage.candidatesTokenCount ?? "?"} total:${usage.totalTokenCount ?? "?"}`
    );
  }
}

// ---- Semantic Router: เช็ค intent ด้วย prompt สั้นๆก่อนส่งเข้า agent หลักที่มี tool/context เต็มรูปแบบ ----
// ใช้โมเดลเดียวกันแต่ prompt เล็กมาก (ไม่มี tool, ไม่มี context ระเบียบ) จึงถูกกว่าการเรียก agent หลักมาก แม้จะเช็คทุกข้อความก็ตาม
// fail-open เสมอ (error/timeout ก็ให้ผ่านไปที่ agent หลักตามปกติ) เพื่อไม่ให้ปัญหาที่ตัวกรองเองมาบล็อกผู้ใช้ที่ถามเรื่องที่เกี่ยวข้องจริง
const OFF_TOPIC_REPLY =
  "เรื่องนี้อยู่นอกเหนือขอบเขตของผู้ช่วยนี้ครับ ผมช่วยได้เฉพาะเรื่องการเดินทางไปราชการ ระเบียบเบิกจ่าย และการค้นหา/สร้างคำขอเดินทางเท่านั้น — มีเรื่องพวกนี้ที่อยากให้ช่วยไหมครับ?";

async function classifyIsOnTopic(
  ai: GoogleGenAI,
  message: string,
  history: { role: "user" | "model"; text: string }[],
  model: string
): Promise<boolean> {
  const recentContext = history
    .slice(-2)
    .map((h) => `${h.role === "user" ? "ผู้ใช้" : "ผู้ช่วย"}: ${h.text}`)
    .join("\n");
  const prompt = `${recentContext ? `บทสนทนาก่อนหน้า:\n${recentContext}\n\n` : ""}ข้อความล่าสุดจากผู้ใช้: "${message}"

วิเคราะห์ว่าข้อความล่าสุดนี้เกี่ยวข้องกับการเดินทางไปราชการ, การเบิก-เคลียร์ค่าใช้จ่าย, ระเบียบของมหาวิทยาลัย, หรือการใช้งานระบบคำขอเดินทาง (CU-AI PASS) หรือไม่ ตอบคำเดียวเท่านั้น: YES หรือ NO`;

  const classify = ai.models
    .generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      // ปิด thinking (thinkingBudget: 0) — ไม่งั้นโมเดลนี้จะเผื่อ token ไปกับการ "คิด" ก่อนตอบเสมอ ทำให้คำตอบจริง (YES/NO)
      // ถูกตัดหายไปแบบสุ่มถ้า maxOutputTokens น้อยเกินไป (เจอบั๊กนี้ตรงจากการทดสอบจริง — ไม่ใช่แค่ทฤษฎี)
      config: { temperature: 0, maxOutputTokens: 10, thinkingConfig: { thinkingBudget: 0 } },
    })
    .then((res) => {
      logTokenUsage("intent_classifier", res);
      return (res.text || "").trim().toUpperCase().startsWith("Y");
    })
    .catch((err) => {
      console.error("Intent classification failed, failing open:", err);
      return true;
    });

  const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 3000));
  return Promise.race([classify, timeout]);
}

app.post("/api/agent/chat", requireAuth, requireAiUnlocked, async (req, res) => {
  const { message, history, activeTripId } = req.body as {
    message?: string;
    history?: { role: "user" | "model"; text: string }[];
    activeTripId?: string;
  };
  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, error: "กรุณาพิมพ์คำถาม" });
  }
  if (message.length > 2000) {
    return res.status(400).json({ success: false, error: "ข้อความยาวเกินไป กรุณาพิมพ์คำถามให้กระชับขึ้นครับ" });
  }
  if (req.session.userId && isRateLimited(req.session.userId)) {
    return res.status(429).json({ success: false, error: "ส่งข้อความถี่เกินไป กรุณารอสักครู่แล้วลองใหม่ครับ" });
  }
  if (req.session.userId) {
    const quota = await checkAndIncrementChatQuota(req.session.userId);
    if (!quota.allowed) {
      return res.status(429).json({
        success: false,
        error: `ใช้งานผู้ช่วย AI Agent ครบโควต้า ${quota.limit} ครั้งต่อเดือนแล้ว กรุณาลองใหม่เดือนถัดไป หรือติดต่อผู้ดูแลระบบ`,
      });
    }
  }

  const ai = getGeminiClient();
  if (!ai) {
    return res.json({
      success: true,
      simulated: true,
      data: { reply: "ระบบยังไม่ได้ตั้งค่า GEMINI_API_KEY จึงยังไม่สามารถตอบคำถามได้จริง (โหมดจำลอง)" },
    });
  }

  const session = { userId: req.session.userId, role: req.session.role };
  const { agent: agentModel, intentClassifier: intentClassifierModel } = await getAiModels();

  try {
    // Level 2: Semantic Router — เช็ค intent ก่อนทุกครั้ง ด้วย prompt เล็กๆที่ไม่มี tool/context หนักๆ
    const onTopic = await classifyIsOnTopic(ai, message, history || [], intentClassifierModel);
    if (!onTopic) {
      return res.json({ success: true, simulated: false, data: { reply: OFF_TOPIC_REPLY, trips: null, proposedTrip: null, proposedUpdate: null } });
    }

    const currentUser = session.userId
      ? await prisma.user.findUnique({ where: { id: session.userId }, select: { agentContextSummary: true } })
      : null;
    const priorSummary = currentUser?.agentContextSummary || null;

    const contents: any[] = [
      ...(history || []).map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
      { role: "user", parts: [{ text: message }] },
    ];

    const config = {
      temperature: 0,
      systemInstruction: `คุณคือผู้ช่วย AI ของระบบ CU-AI PASS (ระบบวางแผน/ขออนุมัติ/เคลียร์ค่าใช้จ่ายการเดินทางไปราชการของจุฬาลงกรณ์มหาวิทยาลัย)
คุณมี 5 หน้าที่หลัก:
1. ตอบคำถามเกี่ยวกับระเบียบ/อัตราการเบิกจ่ายค่าเดินทาง — ต้องเรียก get_regulation_data ก่อนเสมอเพื่อดึงตัวเลขล่าสุดมาใช้ตอบ ห้ามเดาหรือแต่งตัวเลขขึ้นเองเด็ดขาด ถ้าคำถามลงรายละเอียด/ข้อยกเว้นที่ไม่มีในข้อมูลที่ได้จาก get_regulation_data ให้เรียกใช้ search_regulation_documents เพิ่ม
2. ค้นหารายการคำขอเดินทางในระบบด้วย search_trips — ผลลัพธ์ถูกกรองตามสิทธิ์ผู้ใช้อัตโนมัติแล้ว แค่สรุปสั้นๆว่าพบกี่รายการ ไม่ต้องแจกแจงรายละเอียดทีละรายการเอง (ระบบจะแสดงตารางผลลัพธ์ให้ผู้ใช้เอง) — ผลลัพธ์จะมี tripId และ travelers ของแต่ละคำขอด้วย เก็บไว้ใช้ต่อถ้าผู้ใช้ขอแก้ไขคำขอนั้นในเทิร์นถัดไป
3. เตรียมข้อมูลร่างคำขอเดินทาง**ใหม่**ด้วย create_trip_draft — ใช้เฉพาะกรณีผู้ใช้ต้องการสร้างคำขอใหม่ที่ไม่มีในระบบเท่านั้น ถ้าผู้ใช้พูดถึงคำขอที่มีอยู่แล้ว (เจอจาก search_trips) และต้องการ "เปลี่ยน/แก้ไข/ปรับ" ข้อมูล ห้ามใช้ฟังก์ชันนี้ ให้ใช้ update_trip_draft แทนเสมอ — ต้องถามข้อมูลที่จำเป็น (ชื่องาน/โครงการ, ปลายทาง, วันที่โดยประมาณ) ให้ครบก่อนเรียกใช้ฟังก์ชันนี้ ห้ามเดาข้อมูลที่ไม่ได้รับ ฟังก์ชันนี้เป็นการ "เตรียมข้อมูล" เท่านั้น ยังไม่ได้บันทึกลงระบบ ระบบจะแสดงข้อมูลร่างให้ผู้ใช้ตรวจสอบและกดยืนยันเองจึงจะบันทึกจริง ห้ามบอกผู้ใช้ว่า "สร้างคำขอให้แล้ว" ให้บอกว่าเตรียมร่างไว้ให้ตรวจสอบแทน
4. เตรียมข้อมูลแก้ไขคำขอเดินทาง**ที่มีอยู่แล้ว**ด้วย update_trip_draft — ใช้ทุกครั้งที่ผู้ใช้ขอเปลี่ยนแปลงข้อมูลของคำขอที่มีอยู่แล้วในระบบ (เปลี่ยนวันที่, เพิ่ม/ลบผู้เดินทาง, เปลี่ยนปลายทาง ฯลฯ) ต้องเรียก search_trips ก่อนเสมอเพื่อได้ tripId ที่ถูกต้อง ห้ามเดา tripId เด็ดขาด ถ้าหาไม่พบหรือไม่แน่ใจว่าเป็นคำขอไหนให้ถามผู้ใช้ให้ชัดเจนก่อน — ฟังก์ชันนี้แก้ไขได้เฉพาะคำขอที่ยังอยู่ขั้น A1 (ร่าง) เท่านั้น ถ้าปฏิเสธเพราะผ่านขั้นตอนไปแล้ว ให้แจ้งผู้ใช้ตามนั้นและแนะนำให้ไปจัดการที่หน้ารายการคำขอแทน — เป็นการ "เตรียมข้อมูล" เท่านั้น ยังไม่บันทึกจริง ระบบจะแสดงรายการที่จะเปลี่ยนให้ผู้ใช้ตรวจสอบและกดยืนยันเอง
5. get_regulation_data — ดึงข้อมูลระเบียบ/อัตราทั้งหมดมาใช้อ้างอิง (ดูรายละเอียดในหน้าที่ 1)

กฎสำคัญเรื่องรายชื่อผู้เดินทาง (travelers) ในทั้ง create_trip_draft และ update_trip_draft: ต้องส่งรายชื่อผู้เดินทางทั้งหมดที่เกี่ยวข้องเสมอ ไม่ใช่แค่คนที่ผู้ใช้เพิ่งพูดถึงล่าสุด — เช่น ถ้าก่อนหน้านี้มีคุณ ก. อยู่แล้ว แล้วผู้ใช้บอกว่า "เพิ่มคุณ ข. อีกคน" ต้องส่ง travelers เป็น [ก., ข.] ทั้งสองคน ไม่ใช่ส่งแค่ ข. คนเดียว (ดูรายชื่อเดิมได้จากผลลัพธ์ search_trips หรือจาก draft ที่เพิ่งเสนอไปในเทิร์นก่อนหน้า)

ก่อนตอบคำถามระเบียบทุกครั้ง ให้เรียก get_regulation_data แล้วหาแถวข้อมูลที่ตรงกับคำถามก่อน แล้วคัดลอกตัวเลขจากแถวนั้นมาตอบตรงๆ ห้ามจำหรือประมาณจากแถวอื่นที่คล้ายกัน — ถ้ามีหลาย tier/กลุ่ม ให้ตรวจแยกแต่ละแถวให้ตรงตัวก่อนตอบ (เช่น TIER_A กับ TIER_B คือคนละตัวเลขกัน ห้ามตอบเลขเดียวกันโดยไม่ตรวจสอบ)
ตอบเป็นภาษาไทย กระชับ ชัดเจน อ้างอิงเลขข้อระเบียบเมื่อมีข้อมูล ถ้าคำนวณอะไรให้ show การคำนวณสั้นๆ ด้วย

บริบทงานที่ผู้ใช้ทำอยู่ก่อนหน้านี้ (จากครั้งก่อน ถ้ามี): ${priorSummary || "(ยังไม่มีบริบทก่อนหน้า)"}
${activeTripId ? `\nกำลังเสนอแก้ไขคำขอ tripId: ${activeTripId} อยู่ (ยังไม่ได้ยืนยันบันทึก) — ถ้าผู้ใช้พูดถึงการเปลี่ยนแปลงเพิ่มเติมต่อจากนี้โดยไม่ได้บอกว่าต้องการเปลี่ยนไปทำรายการอื่น ให้ใช้ tripId นี้ต่อเนื่องเมื่อเรียก update_trip_draft ห้ามสลับไปใช้ id อื่นที่ชื่อคล้ายกันโดยไม่มีเหตุผลชัดเจนจากผู้ใช้ ไม่ต้องเรียก search_trips ซ้ำก็ได้ในกรณีนี้` : ""}

กฎสำคัญเกี่ยวกับการสรุปบริบท: ทุกครั้งที่ตอบ (เฉพาะคำตอบสุดท้ายที่จะส่งกลับให้ผู้ใช้ ไม่ใช่ระหว่างเรียกฟังก์ชัน) ให้ต่อท้ายคำตอบด้วยบรรทัดคั่น "###CONTEXT_SUMMARY###" แล้วตามด้วยสรุปบริบทงานที่กำลังทำอยู่ในบทสนทนานี้ 1 บรรทัด ภาษาไทย ไม่เกิน 200 ตัวอักษร (ปรับปรุงจากบริบทเดิมด้านบน โดยรวมสิ่งที่เกิดขึ้นใหม่ในเทิร์นนี้เข้าไปด้วย) — สรุปเฉพาะ "งาน/สิ่งที่กำลังทำอยู่" เท่านั้น (เช่น กำลังหาคำขอไปประเทศไหน, กำลังร่างคำขอเดินทางอะไรค้างอยู่) ห้ามสรุปข้อมูลส่วนตัวอื่นของผู้ใช้ (ชื่อ/ตำแหน่ง) เพราะระบบมีอยู่แล้ว ถ้าเทิร์นนี้เป็นแค่คำถามทั่วไปที่ไม่กระทบบริบทงาน ให้คัดลอกสรุปเดิมมาเหมือนเดิมได้ ห้ามเว้นบรรทัดสรุปนี้เด็ดขาดไม่ว่าคำตอบจะเป็นอะไร`,
      tools: [
        {
          functionDeclarations: [
            searchTripsDeclaration,
            createTripDraftDeclaration,
            updateTripDraftDeclaration,
            searchRegulationDocumentsDeclaration,
            getRegulationDataDeclaration,
          ],
        },
      ],
    };

    let lastTrips: any[] | null = null;
    let proposedTrip: any | null = null;
    let proposedUpdate: any | null = null;

    let response = await ai.models.generateContent({ model: agentModel, contents, config });
    logTokenUsage("agent_turn", response);
    let iterations = 0;
    while (response.functionCalls && response.functionCalls.length > 0 && iterations < 4) {
      const call = response.functionCalls[0];
      let result: any;

      if (call.name === "search_trips") {
        const trips = await executeSearchTrips(session, call.args || {});
        lastTrips = trips;
        result = trips.map((t) => ({
          id: t.id,
          projectName: t.projectName,
          location: t.location,
          country: t.country,
          destinationProvince: t.destinationProvince,
          status: t.status,
          startDate: t.startDate,
          endDate: t.endDate,
          estimatedBudget: t.estimatedBudget,
          travelers: (Array.isArray(t.travelers) ? (t.travelers as any[]) : []).map((tr) => ({
            name: tr?.name,
            position: tr?.position,
            positionLevel: tr?.positionLevel,
          })),
        }));
      } else if (call.name === "create_trip_draft") {
        const outcome = executeCreateTripDraft(session, call.args || {});
        if (!outcome.error) proposedTrip = outcome.draft;
        result = outcome;
      } else if (call.name === "update_trip_draft") {
        const outcome = await executeUpdateTripDraft(session, call.args || {});
        if (!outcome.error) proposedUpdate = outcome.draft;
        result = outcome;
      } else if (call.name === "search_regulation_documents") {
        result = await executeSearchRegulationDocuments(ai, call.args || {});
      } else if (call.name === "get_regulation_data") {
        result = { data: await buildRegulationContext() };
      } else {
        result = { error: "unknown function" };
      }

      contents.push({ role: "model", parts: response.candidates?.[0]?.content?.parts || [{ functionCall: call }] });
      contents.push({ role: "user", parts: [{ functionResponse: { name: call.name, response: { output: result } } }] });

      response = await ai.models.generateContent({ model: agentModel, contents, config });
      logTokenUsage("agent_turn", response);
      iterations++;
    }

    let reply = response.text?.trim() || "ขออภัย ไม่สามารถประมวลผลคำตอบได้ กรุณาลองใหม่";

    // แยกสรุปบริบทงาน (piggyback มาในคำตอบเดิม ไม่เรียก Gemini เพิ่ม) ออกจากคำตอบที่จะโชว์ให้ผู้ใช้ แล้วบันทึกลง DB ทับของเก่า
    const SUMMARY_DELIMITER = "###CONTEXT_SUMMARY###";
    const delimiterIndex = reply.indexOf(SUMMARY_DELIMITER);
    if (delimiterIndex !== -1) {
      const newSummary = reply.slice(delimiterIndex + SUMMARY_DELIMITER.length).trim().slice(0, 200);
      reply = reply.slice(0, delimiterIndex).trim();
      if (newSummary && session.userId) {
        prisma.user
          .update({ where: { id: session.userId }, data: { agentContextSummary: newSummary } })
          .catch((err) => console.error("Failed to save agentContextSummary:", err));
      }
    }

    return res.json({ success: true, simulated: false, data: { reply, trips: lastTrips, proposedTrip, proposedUpdate } });
  } catch (error: any) {
    console.error("Error in /api/agent/chat:", error);
    const msg = error.message || "";
    const quotaExhausted = /"code":\s*429|RESOURCE_EXHAUSTED|quota exceeded/i.test(msg);
    const overloaded = /"code":\s*503|UNAVAILABLE|high demand/i.test(msg);
    res.status(500).json({
      success: false,
      error: quotaExhausted
        ? "AI ใช้งานครบโควต้ารายวันแล้ว ระบบจะใช้งานได้อีกครั้งเมื่อโควต้ารีเซ็ต (การลองใหม่ตอนนี้จะไม่ช่วย)"
        : overloaded
        ? "ระบบ AI มีผู้ใช้งานหนาแน่นในขณะนี้ กรุณาลองใหม่อีกครั้งในอีกสักครู่"
        : "เกิดข้อผิดพลาดในการตอบคำถาม กรุณาลองใหม่",
    });
  }
});

// -------------------------------------------------------------
// VITE AND ASSETS HANDLERS
// -------------------------------------------------------------

async function bootstrap() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

bootstrap();
