/**
 * Ordering for lists, cards, checklists and checklist items.
 *
 * Items keep a float `position` with gaps between them. Moving an item
 * between two neighbours takes the midpoint, so a normal move updates one
 * row. When the gap gets too small, the server rebalances the container.
 * Backend and frontend share this code so optimistic positions match.
 */

export const POSITION_GAP = 1024;
export const MIN_POSITION_GAP = 1e-6;

/** Position for an item placed between `prev` and `next` (null = no neighbour). */
export function positionBetween(prev: number | null, next: number | null): number {
  if (prev === null && next === null) return POSITION_GAP;
  if (prev === null) return next! / 2;
  if (next === null) return prev + POSITION_GAP;
  return (prev + next) / 2;
}

/** True when `pos` is too close to a neighbour and the container must be rebalanced. */
export function needsRebalance(prev: number | null, next: number | null, pos: number): boolean {
  const lower = prev ?? 0;
  if (pos - lower < MIN_POSITION_GAP) return true;
  return next !== null && next - pos < MIN_POSITION_GAP;
}

/** Evenly spaced positions for `count` items, used when rebalancing. */
export function rebalancedPositions(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * POSITION_GAP);
}
