/** Item ids of each container (by container id), in order. */
export type Columns = Record<string, string[]>;

/** Where an item sits: its container, index, and the neighbours the server needs to place it. */
export interface Neighbours {
  containerId: string;
  index: number;
  afterId: string | null;
  beforeId: string | null;
}

export function findColumn(columns: Columns, itemId: string): string | null {
  for (const [containerId, ids] of Object.entries(columns)) {
    if (ids.includes(itemId)) return containerId;
  }
  return null;
}

/** Columns with the item taken out of its container and put into `containerId` at `index` (clamped). */
export function moveToColumn(
  columns: Columns,
  itemId: string,
  containerId: string,
  index: number,
): Columns {
  if (!(containerId in columns)) return columns;
  const next: Columns = {};
  for (const [id, ids] of Object.entries(columns)) next[id] = ids.filter((item) => item !== itemId);
  const target = next[containerId];
  target.splice(Math.max(0, Math.min(index, target.length)), 0, itemId);
  return next;
}

export function neighboursOf(columns: Columns, itemId: string): Neighbours | null {
  const containerId = findColumn(columns, itemId);
  if (containerId === null) return null;
  const ids = columns[containerId];
  const index = ids.indexOf(itemId);
  return {
    containerId,
    index,
    afterId: ids[index - 1] ?? null,
    beforeId: ids[index + 1] ?? null,
  };
}

/**
 * Columns after the item is dropped on `overItemId`. A drop on another item of
 * the same container takes that item's index (dnd-kit's arrayMove rule); anything
 * else leaves the item where dragging put it.
 */
export function dropColumns(columns: Columns, itemId: string, overItemId: string | null): Columns {
  const containerId = findColumn(columns, itemId);
  if (containerId === null || overItemId === null || overItemId === itemId) return columns;
  const overIndex = columns[containerId].indexOf(overItemId);
  return overIndex === -1 ? columns : moveToColumn(columns, itemId, containerId, overIndex);
}

/** True when both places have the same container and neighbours, so nothing has to be sent. */
export function sameNeighbours(a: Neighbours, b: Neighbours): boolean {
  return a.containerId === b.containerId && a.afterId === b.afterId && a.beforeId === b.beforeId;
}
