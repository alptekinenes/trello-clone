import type { BoardEvent, PositionRebalancedData } from '@trello/contracts';
import type { Sibling } from '../ordering/placement.js';

/** What was rebalanced, without the new positions (those come from the placement). */
export type RebalanceTarget =
  | { entity: 'list' }
  | { entity: 'card'; listId: string }
  | { entity: 'checklist'; cardId: string }
  | { entity: 'checklist-item'; cardId: string; checklistId: string };

/**
 * The data of a `position:rebalanced` event for a placement that had to respread
 * its siblings, or null. Move endpoints return the same data in their response.
 */
export function rebalancedData(
  target: RebalanceTarget,
  rebalanced: readonly Sibling[] | null,
): PositionRebalancedData | null {
  if (!rebalanced) return null;
  const positions = rebalanced.map(({ id, position }) => ({ id, position }));
  return { ...target, positions };
}

/**
 * The `position:rebalanced` event for a placement that had to respread its siblings,
 * or no event at all. Put it in front of the event of the change that caused it.
 */
export function rebalanceEvents(
  target: RebalanceTarget,
  rebalanced: readonly Sibling[] | null,
): BoardEvent[] {
  const data = rebalancedData(target, rebalanced);
  return data ? [{ type: 'position:rebalanced', data }] : [];
}
