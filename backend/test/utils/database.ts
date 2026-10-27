import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service.js';

/** Empties every table. Deleting users cascades to tokens and memberships. */
export async function resetDatabase(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "User", "Board" RESTART IDENTITY CASCADE',
  );
}
