import { ActivityType as ContractActivityType, type ActivityDto } from '@trello/contracts';
import type { Prisma } from '../generated/prisma/client.js';

/** Author or actor columns. No e-mail address: it must never reach another member. */
export const USER_REF_SELECT = { id: true, name: true, avatarUrl: true } as const;

export const ACTIVITY_SELECT = {
  id: true,
  cardId: true,
  type: true,
  data: true,
  createdAt: true,
  actor: { select: USER_REF_SELECT },
} as const;

export interface ActivityRow {
  id: string;
  cardId: string;
  type: string;
  data: Prisma.JsonValue;
  createdAt: Date;
  actor: { id: string; name: string; avatarUrl: string | null };
}

const KNOWN_TYPES: ReadonlySet<string> = new Set(Object.values(ContractActivityType));

function isKnownType(type: string): type is ActivityDto['type'] {
  return KNOWN_TYPES.has(type);
}

/** The only checks the reader makes: `data` is an object with a string `cardTitle`. Only `record()` writes the rest. */
function isActivityData(value: Prisma.JsonValue): value is { cardTitle: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value.cardTitle === 'string'
  );
}

export function toActivityDto(row: ActivityRow): ActivityDto {
  if (!isKnownType(row.type) || !isActivityData(row.data)) {
    throw new Error(`Activity ${row.id} has an unreadable shape`);
  }
  // `record()` is the only writer, so the data matches the type it was stored with.
  return {
    kind: 'activity',
    id: row.id,
    cardId: row.cardId,
    actor: { id: row.actor.id, name: row.actor.name, avatarUrl: row.actor.avatarUrl },
    createdAt: row.createdAt.toISOString(),
    type: row.type,
    data: row.data,
  } as ActivityDto;
}
