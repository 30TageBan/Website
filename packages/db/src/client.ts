import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient() {
  // Prisma wählt die zur Laufzeit passende Engine aus den binaryTargets.
  // Keine Docker-/Linux-Pfade auf Windows erzwingen.
  return new PrismaClient();
}

export const prisma: PrismaClient = global.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') global.__prisma = prisma;
