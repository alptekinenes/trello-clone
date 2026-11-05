import type { CommentDto } from './comments.js';

/** Same eight values as the Prisma `ActivityType` enum (a backend test keeps them equal). */
export const ActivityType = {
  CARD_CREATED: 'CARD_CREATED',
  CARD_MOVED: 'CARD_MOVED',
  CARD_ARCHIVED: 'CARD_ARCHIVED',
  CARD_RESTORED: 'CARD_RESTORED',
  CARD_COMPLETED: 'CARD_COMPLETED',
  CARD_UNCOMPLETED: 'CARD_UNCOMPLETED',
  CARD_MEMBER_ADDED: 'CARD_MEMBER_ADDED',
  CARD_MEMBER_REMOVED: 'CARD_MEMBER_REMOVED',
} as const;
export type ActivityType = (typeof ActivityType)[keyof typeof ActivityType];

/** Author or actor of a feed item. Never carries an e-mail address. */
export interface UserRefDto {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface ListRef {
  id: string;
  title: string;
}

export interface MemberRefData {
  id: string;
  name: string;
}

/** Payload per type, with names copied from that moment. Shapes only ever gain optional fields; old rows must stay readable. */
export interface ActivityDataMap {
  CARD_CREATED: { cardTitle: string; list: ListRef };
  CARD_MOVED: { cardTitle: string; fromList: ListRef; toList: ListRef };
  CARD_ARCHIVED: { cardTitle: string };
  CARD_RESTORED: { cardTitle: string };
  CARD_COMPLETED: { cardTitle: string };
  CARD_UNCOMPLETED: { cardTitle: string };
  CARD_MEMBER_ADDED: { cardTitle: string; member: MemberRefData };
  CARD_MEMBER_REMOVED: { cardTitle: string; member: MemberRefData };
}

export type ActivityDto = {
  [T in ActivityType]: {
    kind: 'activity';
    id: string;
    cardId: string;
    actor: UserRefDto;
    createdAt: string;
    type: T;
    data: ActivityDataMap[T];
  };
}[ActivityType];

/** One entry of a card's feed; narrow it with `kind`. */
export type FeedItemDto = CommentDto | ActivityDto;

/** Newest first. `nextCursor` is opaque: send it back unchanged. */
export interface CardFeedPageDto {
  items: FeedItemDto[];
  nextCursor: string | null;
}

export const FEED_LIMITS = { PAGE_DEFAULT: 20, PAGE_MAX: 50 } as const;
