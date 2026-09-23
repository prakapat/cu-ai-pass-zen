import type { Request, Response, NextFunction } from "express";
import type { UserRole } from "@prisma/client";
import { prisma } from "./prisma";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    role?: UserRole;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, error: "ยังไม่ได้เข้าสู่ระบบ" });
  }
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId) {
      return res.status(401).json({ success: false, error: "ยังไม่ได้เข้าสู่ระบบ" });
    }
    if (!req.session.role || !roles.includes(req.session.role)) {
      return res.status(403).json({ success: false, error: "ไม่มีสิทธิ์เข้าถึงส่วนนี้" });
    }
    next();
  };
}

// กันไม่ให้ user ที่ถูกล็อคจากการส่งเอกสารไม่เกี่ยวข้องซ้ำๆ (ครบ 30 ครั้ง) เรียกฟีเจอร์ AI ใดๆได้อีก จนกว่า admin จะปลดล็อค
// ยังดูข้อมูล/ใช้ฟีเจอร์อื่นที่ไม่ใช่ AI ได้ปกติ — ต้อง requireAuth มาก่อนเสมอ (ใช้ req.session.userId)
export async function requireAiUnlocked(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, error: "ยังไม่ได้เข้าสู่ระบบ" });
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
      select: { accountAiLocked: true },
    });
    if (user?.accountAiLocked) {
      return res.status(423).json({
        success: false,
        error: "บัญชีของท่านถูกระงับการใช้งานฟีเจอร์ AI ทั้งหมด เนื่องจากส่งเอกสารที่ไม่เกี่ยวข้องซ้ำหลายครั้ง กรุณาติดต่อผู้ดูแลระบบเพื่อปลดล็อค",
        locked: true,
      });
    }
    next();
  } catch (error) {
    console.error("Error in requireAiUnlocked:", error);
    res.status(500).json({ success: false, error: "เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์" });
  }
}
