import type { Prisma } from '../generated/prisma/client.js';

/**
 * Locks the board row until the transaction ends, so list writes on the same
 * board run one after another. Returns false when the board no longer exists.
 */
export async function lockBoard(tx: Prisma.TransactionClient, boardId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Board" WHERE id = ${boardId}::uuid FOR UPDATE`;
  return rows.length > 0;
}
