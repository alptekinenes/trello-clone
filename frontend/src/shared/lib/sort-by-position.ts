/** Server order: position, then id. */
export function sortByPosition<T extends { id: string; position: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}
