import { needsRebalance, positionBetween, rebalancedPositions } from '@trello/contracts';

export interface Sibling {
  id: string;
  position: number;
}

export interface Anchors {
  afterId?: string | null;
  beforeId?: string | null;
}

export interface Placement {
  /** Position for the placed item. */
  position: number;
  /** New positions for every sibling when the gap ran out; null for a normal move. */
  rebalanced: Sibling[] | null;
}

/** An anchor is not among the siblings: someone else moved, archived or deleted it. */
export class AnchorNotFoundError extends Error {
  constructor(readonly anchorId: string) {
    super(`Anchor ${anchorId} is not in the target container`);
    this.name = 'AnchorNotFoundError';
  }
}

function indexOf(siblings: readonly Sibling[], id: string): number {
  const index = siblings.findIndex((sibling) => sibling.id === id);
  if (index === -1) throw new AnchorNotFoundError(id);
  return index;
}

/** Where the item goes in `siblings`. `afterId` wins over `beforeId`; neither means the end. */
function insertIndex(siblings: readonly Sibling[], anchors: Anchors): number {
  if (anchors.afterId) return indexOf(siblings, anchors.afterId) + 1;
  if (anchors.beforeId) return indexOf(siblings, anchors.beforeId);
  return siblings.length;
}

/**
 * Computes the position of an item placed among `siblings`.
 * `siblings` must be sorted by (position, id) and must not contain the item itself.
 */
export function placeItem(siblings: readonly Sibling[], anchors: Anchors): Placement {
  const index = insertIndex(siblings, anchors);
  const prev = siblings[index - 1]?.position ?? null;
  const next = siblings[index]?.position ?? null;
  const position = positionBetween(prev, next);

  if (!needsRebalance(prev, next, position)) return { position, rebalanced: null };

  // Spread everything evenly; the item takes slot `index`, the rest keep their order.
  const slots = rebalancedPositions(siblings.length + 1);
  const rebalanced = siblings.map((sibling, i) => ({
    id: sibling.id,
    position: slots[i < index ? i : i + 1],
  }));
  return { position: slots[index], rebalanced };
}
