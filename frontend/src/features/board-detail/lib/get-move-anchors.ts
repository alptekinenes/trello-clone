export interface MoveAnchors {
  /** Item that ends up right before the moved one, or null at the start. */
  afterId: string | null;
  /** Item that ends up right after the moved one, or null at the end. */
  beforeId: string | null;
  newIndex: number;
}

/**
 * Neighbours of `activeId` after it is dropped onto `overId` in `ids`
 * (the same rule as dnd-kit's arrayMove). Null when nothing moves.
 */
export function getMoveAnchors(
  ids: readonly string[],
  activeId: string,
  overId: string | null,
): MoveAnchors | null {
  if (overId === null) return null;
  const oldIndex = ids.indexOf(activeId);
  const newIndex = ids.indexOf(overId);
  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return null;

  const reordered = ids.filter((id) => id !== activeId);
  reordered.splice(newIndex, 0, activeId);
  return {
    afterId: reordered[newIndex - 1] ?? null,
    beforeId: reordered[newIndex + 1] ?? null,
    newIndex,
  };
}
