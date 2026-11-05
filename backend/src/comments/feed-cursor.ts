import { isUUID } from 'class-validator';

export interface FeedCursor {
  createdAt: Date;
  id: string;
}

/** Position of the last item of a page: `base64url("<createdAt ISO>|<id>")`. Only the server reads it. */
export function encodeFeedCursor(position: FeedCursor): string {
  return Buffer.from(`${position.createdAt.toISOString()}|${position.id}`, 'utf8').toString(
    'base64url',
  );
}

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** The position a cursor names, or null when it is not one this server made. */
export function decodeFeedCursor(cursor: string): FeedCursor | null {
  const text = Buffer.from(cursor, 'base64url').toString('utf8');
  const [iso, id, ...rest] = text.split('|');
  if (rest.length > 0 || !iso || !id || !ISO_INSTANT.test(iso) || !isUUID(id)) return null;
  const createdAt = new Date(iso);
  if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== iso) return null;
  return { createdAt, id: id.toLowerCase() };
}
