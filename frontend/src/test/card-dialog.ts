import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CardDetailDto, LabelDto, UpdateCardRequest } from '@trello/contracts';
import { http, HttpResponse } from 'msw';
import { useAuthStore } from '../features/auth/store/auth-store';
import { BOARD_ID, boardDetail, testCard, testCardDetail, testLists, testUser } from './fixtures';
import { server } from './msw-server';
import { renderApp } from './render';

export const [LIST] = testLists('Yapılacaklar');
export const CARD_ID = 'card-1';
export const BOARD_URL = `*/api/v1/boards/${BOARD_ID}`;
export const CARD_URL = `*/api/v1/cards/${CARD_ID}`;
export const CARD_PATH = `/boards/${BOARD_ID}/c/${CARD_ID}`;

/** The board tile of a card, like the server computes it. */
function summaryOf(card: CardDetailDto) {
  return testCard({ ...card, hasDescription: card.description !== null });
}

/**
 * Opens `path` on a board with one card ("Rapor"). The board and card GETs answer with
 * the given state; tests add handlers for the writes they care about.
 */
export function openCard(
  path: string,
  detail: Partial<CardDetailDto> = {},
  labels: LabelDto[] = [],
) {
  useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
  /** The card as the server has it; PATCH handlers change it. */
  const serverState = { card: testCardDetail({ id: CARD_ID, listId: LIST.id, title: 'Rapor', ...detail }) };
  server.use(
    http.get(BOARD_URL, () =>
      HttpResponse.json(boardDetail('OWNER', 'Pano', [LIST], [summaryOf(serverState.card)], labels)),
    ),
    http.get(CARD_URL, () => HttpResponse.json(serverState.card)),
  );
  const result = renderApp(path);
  return { ...result, user: userEvent.setup(), serverCard: serverState };
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
        description:
          edit.description === undefined ? state.card.description : edit.description?.trim() || null,
        dueDate,
        dueComplete: dueDate === null ? false : (edit.dueComplete ?? state.card.dueComplete),
      };
      return HttpResponse.json(summaryOf(state.card));
    }),
  );
  return sent;
}

/** The card dialog once the card has loaded. */
export async function cardDialog(name = 'Rapor') {
  const dialog = await screen.findByRole('dialog', { name });
  await within(dialog).findByText('“Yapılacaklar” listesinde');
  return dialog;
}
