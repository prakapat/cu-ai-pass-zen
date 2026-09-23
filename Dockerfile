FROM node:22-slim

WORKDIR /app

# node:22-slim ไม่มี openssl มาให้ — Prisma query engine ต้องการ libssl ตอน runtime ถ้าไม่มีจะต่อ DB ไม่ได้เลย
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# ติดตั้ง dependency ก่อน copy source ที่เหลือ ให้ Docker cache layer นี้ไว้ใช้ซ้ำเมื่อแก้แค่โค้ด ไม่แก้ package.json
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# ตั้งใจไม่ประกาศ ARG/ENV รับ secret ใดๆ (GEMINI_API_KEY, SESSION_SECRET, SEED_DEMO_PASSWORD, DATABASE_URL) ที่ขั้นตอน build เลย —
# ขั้นตอน build (prisma generate / vite build / esbuild) ไม่ต้องใช้ค่าจริงของ secret พวกนี้อยู่แล้ว
# Railway จะ inject service variables ให้เป็น runtime env ตอน container รันจริงเท่านั้น ไม่ถูกฝังเข้า image layer
ENV NODE_ENV=production
RUN npx prisma generate && npm run build

EXPOSE 8080

CMD ["sh", "-c", "npm run db:migrate && node dist/server.cjs"]
