import type { BoardEvent, PositionRebalancedData } from '@trello/contracts';
import type { Sibling } from '../ordering/placement.js';

/** What was rebalanced, without the new positions (those come from the placement). */
export type RebalanceTarget =
  | { entity: 'list' }
  | { entity: 'card'; listId: string }
  | { entity: 'checklist'; cardId: string }
  | { entity: 'checklist-item'; cardId: string; checklistId: string };

/**
 * The `position:rebalanced` event for a placement that had to respread its siblings,
 * or no event at all. Put it in front of the event of the change that caused it.
 */
export function rebalanceEvents(
  target: RebalanceTarget,
  rebalanced: readonly Sibling[] | null,
): BoardEvent[] {
  if (!rebalanced) return [];
  const positions = rebalanced.map(({ id, position }) => ({ id, position }));
  const data: PositionRebalancedData = { ...target, positions };
  return [{ type: 'position:rebalanced', data }];
}
