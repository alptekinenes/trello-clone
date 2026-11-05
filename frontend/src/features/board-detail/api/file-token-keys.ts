/**
 * Deliberately outside the board's query key: every board invalidation (after each
 * mutation) would otherwise fetch the file key again.
 */
export const fileTokenKeys = {
  token: (boardId: string) => ['file-token', boardId] as const,
};
