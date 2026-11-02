export const cardKeys = {
  all: ['cards'] as const,
  detail: (cardId: string) => [...cardKeys.all, 'detail', cardId] as const,
};
