import { PrismaClient } from '@prisma/client';

// เก็บ instance เดียวไว้ใน globalThis กัน hot-reload (tsx watch) สร้าง connection ซ้ำจนชน connection limit
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
