import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  BoardRole,
  CardDetailDto,
  FeedItemDto,
  LabelDto,
  MemberDto,
  UpdateCardRequest,
} from '@trello/contracts';
import { http, HttpResponse } from 'msw';
import { useAuthStore } from '../features/auth/store/auth-store';
import { BOARD_ID, boardDetail, boardWithMembers, testCard, testCardDetail, testLists, testUser } from './fixtures';
import { server } from './msw-server';
import { renderApp } from './render';

export const [LIST] = testLists('Yapılacaklar');
export const CARD_ID = 'card-1';
export const BOARD_URL = `*/api/v1/boards/${BOARD_ID}`;
export const CARD_URL = `*/api/v1/cards/${CARD_ID}`;
export const FILE_TOKEN = 'file-key-1';
export const FILE_TOKEN_URL = `*/api/v1/boards/${BOARD_ID}/file-token`;
export const FEED_URL = `${CARD_URL}/feed`;
export const CARD_PATH = `/boards/${BOARD_ID}/c/${CARD_ID}`;

/** The card's feed as the server has it (newest first), and what was asked of it. */
export interface FeedState {
  items: FeedItemDto[];
  pageSize: number;
  requests: { details: string | null; cursor: string | null }[];
}

/** GET /cards/:id/feed like the server: comments only unless details=true; the cursor is an offset. */
function feedHandler(feed: FeedState) {
  return http.get(FEED_URL, ({ request }) => {
    const url = new URL(request.url);
    const details = url.searchParams.get('details');
    const cursor = url.searchParams.get('cursor');
    feed.requests.push({ details, cursor });
    const visible = feed.items.filter((item) => details === 'true' || item.kind === 'comment');
    const from = cursor === null ? 0 : Number(cursor);
    const to = from + feed.pageSize;
    return HttpResponse.json({
      items: visible.slice(from, to),
      nextCursor: to < visible.length ? String(to) : null,
    });
  });
}

/** The board tile of a card, like the server computes it. */
function summaryOf(card: CardDetailDto) {
  const items = card.checklists.flatMap((checklist) => checklist.items);
  return testCard({
    ...card,
    hasDescription: card.description !== null,
    checklistTotal: items.length,
    checklistDone: items.filter((item) => item.isCompleted).length,
  });
}

/**
 * Opens `path` on a board with one card ("Rapor"). The board and card GETs answer with
 * the given state; tests add handlers for the writes they care about.
 */
export function openCard(
  path: string,
  detail: Partial<CardDetailDto> = {},
  labels: LabelDto[] = [],
  /** Board members besides the test user. */
  members: MemberDto[] = [],
  /** The card's comments and activity, newest first. */
  feedItems: FeedItemDto[] = [],
  /** The test user's role on the board. */
  role: BoardRole = 'OWNER',
) {
  useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
  /** The card as the server has it; PATCH handlers change it. */
  const requests = { board: 0 };
  const serverState = { card: testCardDetail({ id: CARD_ID, listId: LIST.id, title: 'Rapor', ...detail }) };
  const feed: FeedState = { items: feedItems, pageSize: 20, requests: [] };
  server.use(
    feedHandler(feed),
    http.get(FILE_TOKEN_URL, () =>
      HttpResponse.json({ token: FILE_TOKEN, expiresAt: '2099-01-01T00:00:00.000Z' }),
    ),
    http.get(BOARD_URL, () => {
      requests.board += 1;
      const base = boardDetail(
        role,
        'Pano',
        [LIST],
        serverState.card.archivedAt ? [] : [summaryOf(serverState.card)],
        labels,
      );
      return HttpResponse.json({ ...base, members: boardWithMembers(role, members).members });
    }),
    http.get(CARD_URL, () => HttpResponse.json(serverState.card)),
  );
  const result = renderApp(path);
  return { ...result, user: userEvent.setup(), serverCard: serverState, requests, feed };
}

/** Answers PATCH /cards/:id like the server would and returns what was sent. */
export function recordPatches(state: { card: CardDetailDto }) {
  const sent: UpdateCardRequest[] = [];
  server.use(
    http.patch(CARD_URL, async ({ request }) => {
      const edit = (await request.json()) as UpdateCardRequest;
      sent.push(edit);
      const dueDate = edit.dueDate === undefined ? state.card.dueDate : edit.dueDate;
      state.card = {
        ...state.card,
        title: edit.title ?? state.card.title,
        archivedAt: edit.archived === false ? null : state.card.archivedAt,
        description:
          edit.description === undefined ? state.card.description : edit.description?.trim() || null,
        dueDate,
        dueComplete: dueDate === null ? false : (edit.dueComplete ?? state.card.dueComplete),
        completedAt:
          edit.isCompleted === undefined
            ? state.card.completedAt
            : edit.isCompleted
              ? (state.card.completedAt ?? new Date().toISOString())
              : null,
        // A color and an image cover exclude each other, like on the server.
        coverColor:
          edit.coverAttachmentId ? null : edit.coverColor === undefined ? state.card.coverColor : edit.coverColor,
        coverAttachmentId: edit.coverColor
          ? null
          : edit.coverAttachmentId === undefined
            ? state.card.coverAttachmentId
            : edit.coverAttachmentId,
      };
      return HttpResponse.json(summaryOf(state.card));
    }),
  );
  return sent;
}

/** The card dialog once the card has loaded. */
export async function cardDialog(name = 'Rapor') {
  const dialog = await screen.findByRole('dialog', { name });
  await within(dialog).findByText('Liste: Yapılacaklar');
  return dialog;
}
