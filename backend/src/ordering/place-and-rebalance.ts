import { positionConflict } from './ordering.errors.js';
import {
  type Anchors,
  AnchorNotFoundError,
  type Placement,
  placeItem,
  type Sibling,
} from './placement.js';

/**
 * Position for an item placed among `siblings` (sorted, without the item).
 * When the gap ran out, writes the new positions of the siblings first.
 * A stale anchor becomes 409 POSITION_CONFLICT.
 */
export async function placeAndRebalance(
  siblings: readonly Sibling[],
  anchors: Anchors,
  writePosition: (id: string, position: number) => Promise<unknown>,
): Promise<number> {
  let placement: Placement;
  try {
    placement = placeItem(siblings, anchors);
  } catch (error) {
    if (error instanceof AnchorNotFoundError) throw positionConflict();
    throw error;
  }

  for (const sibling of placement.rebalanced ?? []) {
    await writePosition(sibling.id, sibling.position);
  }
  return placement.position;
}
