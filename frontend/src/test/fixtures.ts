import type {
  BoardDetailDto,
  BoardRole,
  BoardSummaryDto,
  CardDetailDto,
  CardSummaryDto,
  ErrorCode,
  LabelDto,
  ListDto,
  UserDto,
} from '@trello/contracts';
import { HttpResponse } from 'msw';

export const testUser: UserDto = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ayse@example.com',
  name: 'Ayşe Yılmaz',
  avatarUrl: null,
};

/** An API error response in the backend's ApiErrorBody shape. */
export function apiError(status: number, code: ErrorCode, message = 'Error') {
  return HttpResponse.json(
    { statusCode: status, code, message, path: '/api/v1/test', timestamp: '2026-01-01T00:00:00.000Z' },
    { status },
  );
}

export const BOARD_ID = '22222222-2222-4222-8222-222222222222';

export function boardSummary(overrides: Partial<BoardSummaryDto> = {}): BoardSummaryDto {
  return {
    id: BOARD_ID,
    title: 'Yol haritası',
    background: 'green',
    myRole: 'OWNER',
    updatedAt: '2026-10-27T09:00:00.000Z',
    ...overrides,
  };
}

/** Board detail with the test user as the only member, in the given role. */
export function boardDetail(
  myRole: BoardRole = 'OWNER',
  title = 'Yol haritası',
  lists: ListDto[] = [],
  cards: CardSummaryDto[] = [],
  labels: LabelDto[] = [],
): BoardDetailDto {
  return {
    board: boardSummary({ myRole, title }),
    members: [
      {
        userId: testUser.id,
        name: testUser.name,
        email: testUser.email,
        avatarUrl: null,
        role: myRole,
        joinedAt: '2026-10-27T09:00:00.000Z',
      },
    ],
    labels,
    lists,
    cards,
  };
}

/** Lists at positions 1024, 2048 ... in the given order. */
export function testLists(...titles: string[]): ListDto[] {
  return titles.map((title, i) => ({
    id: `list-${i + 1}`,
    boardId: BOARD_ID,
    title,
    position: (i + 1) * 1024,
    archivedAt: null,
  }));
}

/** Cards of one list at positions 1024, 2048 ..., with ids <listId>-card-1, <listId>-card-2 ... */
export function testCards(listId: string, ...titles: string[]): CardSummaryDto[] {
  return titles.map((title, i) =>
    testCard({ id: `${listId}-card-${i + 1}`, listId, title, position: (i + 1) * 1024 }),
  );
}

export function testCard(
  card: Partial<CardSummaryDto> & Pick<CardSummaryDto, 'id' | 'listId' | 'title'>,
): CardSummaryDto {
  return {
    position: 1024,
    dueDate: null,
    dueComplete: false,
    archivedAt: null,
    labelIds: [],
    hasDescription: false,
    checklistTotal: 0,
    checklistDone: 0,
    ...card,
  };
}

/** A card as the card dialog gets it: the summary plus board, description and checklists. */
export function testCardDetail(
  card: Partial<CardDetailDto> & Pick<CardDetailDto, 'id' | 'listId' | 'title'>,
): CardDetailDto {
  return { ...testCard(card), boardId: BOARD_ID, description: null, checklists: [], ...card };
}
