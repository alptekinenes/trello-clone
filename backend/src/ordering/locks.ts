import { Prisma } from '../generated/prisma/client.js';

/*
 * Ordering locks use FOR NO KEY UPDATE, not FOR UPDATE. Two of them still
 * wait for each other, so writes stay serialized, but they let the
 * FOR KEY SHARE lock of a foreign key check through. A card insert checks
 * its board row while holding a list lock; with FOR UPDATE on the board,
 * a list write holding the board and waiting for that list would deadlock.
 */

/**
 * Locks the board row until the transaction ends, so list writes on the same
 * board run one after another. Returns false when the board no longer exists.
 */
export async function lockBoard(tx: Prisma.TransactionClient, boardId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Board" WHERE id = ${boardId}::uuid FOR NO KEY UPDATE`;
  return rows.length > 0;
}

export interface LockedList {
  id: string;
  archivedAt: Date | null;
}

/**
 * Locks the given lists of the board until the transaction ends, in id order so
 * two transactions never wait on each other. Card writes that change positions
 * in a list, or move cards in or out of it, take this lock first.
 * Lists that are missing or on another board are left out of the result.
 */
export async function lockLists(
  tx: Prisma.TransactionClient,
  boardId: string,
  listIds: readonly string[],
): Promise<LockedList[]> {
  const ids = [...new Set(listIds)];
  return tx.$queryRaw<LockedList[]>`
    SELECT id, "archivedAt" FROM "List"
    WHERE "boardId" = ${boardId}::uuid
      AND id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
    ORDER BY id
    FOR NO KEY UPDATE`;
}
