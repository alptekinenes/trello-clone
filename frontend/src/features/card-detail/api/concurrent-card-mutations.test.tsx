import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { CardDetailDto, ChecklistItemDto, LabelDto } from '@trello/contracts';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BOARD_ID,
  apiError,
  boardDetail,
  testCard,
  testCardDetail,
  testLists,
} from '../../../test/fixtures';
import { server } from '../../../test/msw-server';
import { gate, waitForMutationSuccess } from '../../../test/gate';
import { createTestQueryClient } from '../../../test/render';
import { useBoard } from '../../board-detail';
// A label rename is a board mutation; the test needs one that runs inside the dialog.
import { useUpdateLabel } from '../../board-detail/api/use-label-mutations';
import { boardKeys } from '../../boards';
import { withCounters } from '../lib/card-detail-cache';
import { cardKeys } from './card-keys';
import { useCardDetail } from './use-card-detail';
import { useUpdateChecklistItem } from './use-checklist-mutations';
import { useUpdateCard } from './use-card-mutations';

const [TODO] = testLists('Yapılacaklar');
const LABEL: LabelDto = { id: 'label-1', boardId: BOARD_ID, name: 'Acil', color: 'RED' };
const ITEM: ChecklistItemDto = {
  id: 'i-1',
  checklistId: 'cl-1',
  content: 'Taslak',
  isCompleted: false,
  position: 1024,
};
const CARD: CardDetailDto = withCounters(
  testCardDetail({
    id: 'card-1',
    listId: TODO.id,
    title: 'Rapor',
    checklists: [{ id: 'cl-1', cardId: 'card-1', title: 'Liste', position: 1024, items: [ITEM] }],
  }),
);

/** The dialog has mounted and loaded its card; the changes under test come after that. */
async function setup() {
  const queryClient = createTestQueryClient();
  queryClient.setQueryDefaults(boardKeys.all, { staleTime: Infinity });
  queryClient.setQueryData(
    boardKeys.detail(BOARD_ID),
    boardDetail('OWNER', 'Pano', [TODO], [testCard(CARD)], [LABEL]),
  );
  queryClient.setQueryData(cardKeys.detail(BOARD_ID, CARD.id), CARD);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(
    () => {
      useBoard(BOARD_ID);
      const detail = useCardDetail(BOARD_ID, CARD.id);
      return {
        detail,
        updateCard: useUpdateCard(BOARD_ID, CARD.id),
        updateItem: useUpdateChecklistItem(BOARD_ID, CARD.id),
        updateLabel: useUpdateLabel(BOARD_ID),
      };
    },
    { wrapper },
  );
  const card = () => queryClient.getQueryData<CardDetailDto>(cardKeys.detail(BOARD_ID, CARD.id));
  const done = () => card()?.checklists[0].items[0].isCompleted;
  await waitFor(() => expect(result.current.detail.isFetching).toBe(false));
  requests.card = 0;
  cardRefetch = gate();
  return { result, card, done, queryClient };
}

const requests = { card: 0 };

/** The card as the server has it: the GETs read it, the PATCH handlers of a test change it. */
let serverCard: CardDetailDto = CARD;

/**
 * Once the dialog has loaded, the GETs of the card are held back (until the test ends), so the
 * cache can be looked at between an answer and the refetch it triggers.
 */
let cardRefetch = gate();

afterEach(() => cardRefetch.release());

function serverBoard() {
  requests.card = 0;
  serverCard = CARD;
  cardRefetch.release();
  server.use(
    http.get(`*/api/v1/boards/${BOARD_ID}`, () =>
      HttpResponse.json(boardDetail('OWNER', 'Pano', [TODO], [testCard(serverCard)], [LABEL])),
    ),
    http.get(`*/api/v1/cards/${CARD.id}`, async () => {
      requests.card += 1;
      await cardRefetch.opened;
      return HttpResponse.json(serverCard);
    }),
  );
}

const setItemDone = (isCompleted: boolean) => {
  serverCard = withCounters({
    ...serverCard,
    checklists: [{ ...CARD.checklists[0], items: [{ ...ITEM, isCompleted }] }],
  });
};

const isItemChange = (variables: unknown, isCompleted: boolean) =>
  (variables as { isCompleted?: boolean }).isCompleted === isCompleted;

const isTitleChange = (variables: unknown, title: string) => (variables as { title?: string }).title === title;

describe('overlapping changes to one card', () => {
  it('ignores the answer of an older change to a field a newer change has set', async () => {
    serverBoard();
    const arrived = { ticked: gate(), unticked: gate() };
    const answer = { ticked: gate(), unticked: gate() };
    server.use(
      http.patch('*/api/v1/checklist-items/i-1', async ({ request }) => {
        const body = (await request.json()) as { isCompleted: boolean };
        const key = body.isCompleted ? 'ticked' : 'unticked';
        setItemDone(body.isCompleted);
        arrived[key].release();
        await answer[key].opened;
        return HttpResponse.json({ ...ITEM, isCompleted: body.isCompleted });
      }),
    );
    const { result, done, queryClient } = await setup();

    act(() => {
      result.current.updateItem.mutate({ itemId: 'i-1', isCompleted: true });
      result.current.updateItem.mutate({ itemId: 'i-1', isCompleted: false });
    });
    await arrived.ticked.opened;
    await arrived.unticked.opened;
    expect(done()).toBe(false);

    // The first answer (ticked) arrives while the second request is still on its way.
    answer.ticked.release();
    await waitForMutationSuccess(queryClient, (variables) => isItemChange(variables, true));
    expect(done()).toBe(false);

    // The last answer settles the changes, which refetches the card (held back).
    answer.unticked.release();
    await waitFor(() => expect(requests.card).toBeGreaterThan(0));
    expect(done()).toBe(false);
  });

  it('writes the answer of the newest change to a field', async () => {
    serverBoard();
    const arrived = { A: gate(), B: gate() };
    const answer = { A: gate(), B: gate() };
    server.use(
      http.patch(`*/api/v1/cards/${CARD.id}`, async ({ request }) => {
        const body = (await request.json()) as { title: 'A' | 'B' };
        serverCard = { ...serverCard, title: body.title };
        arrived[body.title].release();
        await answer[body.title].opened;
        return HttpResponse.json(testCard({ ...CARD, title: body.title }));
      }),
    );
    const { result, card, queryClient } = await setup();

    act(() => {
      result.current.updateCard.mutate({ title: 'A' });
      result.current.updateCard.mutate({ title: 'B' });
    });
    await arrived.A.opened;
    await arrived.B.opened;
    answer.B.release();
    await waitForMutationSuccess(queryClient, (variables) => isTitleChange(variables, 'B'));
    expect(card()?.title).toBe('B');

    // A's answer is in by now; the refetch it triggers is still on its way.
    answer.A.release();
    await waitFor(() => expect(requests.card).toBeGreaterThan(0));
    expect(card()?.title).toBe('B');
  });

  it('keeps the newest cover color when two changes to it overlap', async () => {
    serverBoard();
    const arrived = { RED: gate(), BLUE: gate() };
    const answer = { RED: gate(), BLUE: gate() };
    server.use(
      http.patch(`*/api/v1/cards/${CARD.id}`, async ({ request }) => {
        const body = (await request.json()) as { coverColor: 'RED' | 'BLUE' };
        serverCard = { ...serverCard, coverColor: body.coverColor };
        arrived[body.coverColor].release();
        await answer[body.coverColor].opened;
        return HttpResponse.json(testCard({ ...CARD, coverColor: body.coverColor }));
      }),
    );
    const { result, card, queryClient } = await setup();

    act(() => {
      result.current.updateCard.mutate({ coverColor: 'RED' });
      result.current.updateCard.mutate({ coverColor: 'BLUE' });
    });
    await arrived.RED.opened;
    await arrived.BLUE.opened;
    answer.BLUE.release();
    await waitForMutationSuccess(
      queryClient,
      (variables) => (variables as { coverColor?: string }).coverColor === 'BLUE',
    );
    expect(card()?.coverColor).toBe('BLUE');

    answer.RED.release();
    await waitFor(() => expect(requests.card).toBeGreaterThan(0));
    expect(card()?.coverColor).toBe('BLUE');
  });

  it('rolls back only the failed change, not one that succeeded meanwhile', async () => {
    serverBoard();
    const itemAnswer = gate();
    server.use(
      http.patch('*/api/v1/checklist-items/i-1', async () => {
        await itemAnswer.opened;
        return apiError(500, 'INTERNAL_ERROR');
      }),
      http.patch(`*/api/v1/cards/${CARD.id}`, () => {
        serverCard = { ...serverCard, title: 'Yeni' };
        return HttpResponse.json(testCard({ ...CARD, title: 'Yeni' }));
      }),
    );
    const { result, card, done } = await setup();

    act(() => result.current.updateItem.mutate({ itemId: 'i-1', isCompleted: true }));
    act(() => result.current.updateCard.mutate({ title: 'Yeni' }));
    await waitFor(() => expect(result.current.updateCard.isSuccess).toBe(true));
    itemAnswer.release();
    await waitFor(() => expect(requests.card).toBeGreaterThan(0));
    cardRefetch.release();
    await waitFor(() => expect(result.current.updateItem.isError).toBe(true));

    expect(done()).toBe(false);
    expect(card()?.title).toBe('Yeni');
  });

  it('refetches the card when the last change to settle is a board change', async () => {
    serverBoard();
    const labelAnswer = gate();
    server.use(
      http.patch('*/api/v1/checklist-items/i-1', () => apiError(500, 'INTERNAL_ERROR')),
      http.patch(`*/api/v1/labels/${LABEL.id}`, async () => {
        await labelAnswer.opened;
        return HttpResponse.json({ ...LABEL, name: 'Çok acil' });
      }),
    );
    const { result } = await setup();

    act(() => result.current.updateLabel.mutate({ labelId: LABEL.id, name: 'Çok acil' }));
    act(() => result.current.updateItem.mutate({ itemId: 'i-1', isCompleted: true }));
    await waitFor(() => expect(result.current.updateItem.isError).toBe(true));
    labelAnswer.release();
    await waitFor(() => expect(requests.card).toBeGreaterThan(0));

    cardRefetch.release();
    await waitFor(() => expect(result.current.updateLabel.isSuccess).toBe(true));
  });
});
