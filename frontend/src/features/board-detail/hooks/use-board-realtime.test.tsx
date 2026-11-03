import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  BoardDetailDto,
  BoardRole,
  CardSummaryDto,
  ListDto,
  MemberDto,
} from '@trello/contracts';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { useAuthStore } from '../../auth/store/auth-store';
import { useToastStore } from '../../../shared/store/toast-store';
import { fakeRealtime } from '../../../test/fake-realtime';
import {
  BOARD_ID,
  boardDetail,
  testCard,
  testCards,
  testLists,
  testMember,
  testUser,
} from '../../../test/fixtures';
import { INVITATIONS_URL } from '../../../test/members-dialog';
import { server } from '../../../test/msw-server';
import { renderApp } from '../../../test/render';
import { boardKeys } from '../../boards';
import { boardInvitationKeys } from '../api/board-invitation-keys';

const BOARD_URL = `*/api/v1/boards/${BOARD_ID}`;
const [TODO, DOING] = testLists('Yapılacaklar', 'Yapılıyor');
const OTHER_USER = 'u-other';

interface Server {
  detail: BoardDetailDto;
  /** How many times the board was requested. */
  gets: number;
}

/** Opens the board as the test user with the socket connected (so the board is joined). */
async function openBoard({
  role = 'OWNER',
  lists = [TODO, DOING],
  cards = testCards(TODO.id, 'Taslak'),
  delayGets = 0,
}: { role?: BoardRole; lists?: ListDto[]; cards?: CardSummaryDto[]; delayGets?: number } = {}) {
  useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
  const state: Server = { detail: boardDetail(role, 'Yol haritası', lists, cards), gets: 0 };
  server.use(
    http.get(BOARD_URL, async () => {
      state.gets += 1;
      const answer = state.detail;
      if (delayGets > 0) await delay(delayGets);
      return HttpResponse.json(answer);
    }),
    http.get(`${BOARD_URL}/cards`, () => HttpResponse.json([])),
    http.get(`${BOARD_URL}/lists`, () => HttpResponse.json([])),
    http.get('*/api/v1/boards', () => HttpResponse.json([state.detail.board])),
  );
  const view = renderApp(`/boards/${BOARD_ID}`);
  await screen.findByRole('heading', { level: 1, name: 'Yol haritası' });
  fakeRealtime.connect();
  await waitFor(() => expect(state.gets).toBe(2));
  return { ...view, state, user: userEvent.setup() };
}

const emit = fakeRealtime.serverEmit;
const here = { boardId: BOARD_ID };

function cardTitles(listTitle: string): string[] {
  const list = screen.queryByRole('list', { name: `“${listTitle}” kartları` });
  if (!list) return [];
  return within(list)
    .getAllByRole('button')
    .filter((button) => button.getAttribute('aria-roledescription') === 'sıralanabilir kart')
    .map((button) => button.textContent ?? '');
}

const toasts = () => useToastStore.getState().toasts.map((toast) => toast.message);

describe('useBoardRealtime: joining', () => {
  it('joins the board once connected and refetches what was missed', async () => {
    const { state } = await openBoard();

    expect(fakeRealtime.joins).toEqual([BOARD_ID]);
    expect(state.gets).toBe(2);
  });

  it('does not join before the socket is connected', async () => {
    useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
    server.use(http.get(BOARD_URL, () => HttpResponse.json(boardDetail('OWNER'))));
    renderApp(`/boards/${BOARD_ID}`);
    await screen.findByRole('heading', { level: 1, name: 'Yol haritası' });

    expect(fakeRealtime.joins).toEqual([]);
  });

  it('leaves the board when the page goes away', async () => {
    const { router } = await openBoard();

    await act(() => router.navigate('/boards'));

    expect(fakeRealtime.leaves).toEqual([BOARD_ID]);
  });

  it('joins again and refetches after the connection came back', async () => {
    const { state } = await openBoard();

    fakeRealtime.drop('transport close');
    fakeRealtime.connect();

    await waitFor(() => expect(state.gets).toBe(3));
    expect(fakeRealtime.joins).toEqual([BOARD_ID, BOARD_ID]);
  });

  it('does not refetch when the join is refused', async () => {
    useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
    let gets = 0;
    server.use(
      http.get(BOARD_URL, () => {
        gets += 1;
        return HttpResponse.json(boardDetail('OWNER'));
      }),
    );
    fakeRealtime.ackJoin(() => ({ ok: false, code: 'NOT_FOUND' }));
    renderApp(`/boards/${BOARD_ID}`);
    await screen.findByRole('heading', { level: 1, name: 'Yol haritası' });

    fakeRealtime.connect();
    await delay(30);

    expect(fakeRealtime.joins).toEqual([BOARD_ID]);
    expect(gets).toBe(1);
  });
});

describe('useBoardRealtime: applying events', () => {
  it('shows a card created by someone else', async () => {
    await openBoard();

    emit('card:created', testCard({ id: 'n1', listId: TODO.id, title: 'Yeni kart', position: 2048 }), here);

    expect(await screen.findByRole('button', { name: 'Yeni kart' })).toBeInTheDocument();
    expect(cardTitles('Yapılacaklar')).toEqual(['Taslak', 'Yeni kart']);
  });

  it('moves a card to its new list at its place', async () => {
    const { state } = await openBoard({
      cards: [...testCards(TODO.id, 'Taslak', 'Gözden geçir'), ...testCards(DOING.id, 'Tasarım')],
    });
    const moved = state.detail.cards.find((card) => card.title === 'Taslak');

    emit('card:moved', { id: moved?.id ?? '', fromListId: TODO.id, toListId: DOING.id, position: 3072 }, here);

    await waitFor(() => expect(cardTitles('Yapılıyor')).toEqual(['Tasarım', 'Taslak']));
    expect(cardTitles('Yapılacaklar')).toEqual(['Gözden geçir']);
  });

  it('keeps the cache untouched when the same event arrives twice', async () => {
    const { queryClient } = await openBoard();
    const card = testCard({ id: 'n1', listId: TODO.id, title: 'Yeni kart', position: 2048 });

    emit('card:created', card, here);
    await screen.findByRole('button', { name: 'Yeni kart' });
    const once = queryClient.getQueryData(boardKeys.detail(BOARD_ID));
    emit('card:created', card, here);

    expect(queryClient.getQueryData(boardKeys.detail(BOARD_ID))).toBe(once);
  });

  it('ignores events of another board', async () => {
    const { queryClient } = await openBoard();
    const before = queryClient.getQueryData(boardKeys.detail(BOARD_ID));

    emit('card:created', testCard({ id: 'n1', listId: TODO.id, title: 'Yabancı' }), {
      boardId: 'other-board',
    });

    expect(queryClient.getQueryData(boardKeys.detail(BOARD_ID))).toBe(before);
    expect(screen.queryByRole('button', { name: 'Yabancı' })).not.toBeInTheDocument();
  });

  it('shows a new board title and patches the board list', async () => {
    const { queryClient } = await openBoard();
    queryClient.setQueryData(boardKeys.list(), [boardDetail('OWNER').board]);

    emit(
      'board:updated',
      { id: BOARD_ID, title: 'Yeni ad', background: 'green', updatedAt: '2026-11-03T10:00:00.000Z' },
      here,
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Yeni ad' })).toBeInTheDocument();
    expect(
      queryClient.getQueryData<{ title: string; myRole: string }[]>(boardKeys.list())?.[0],
    ).toMatchObject({ title: 'Yeni ad', myRole: 'OWNER' });
  });

  it('removes the invitation section when my role drops below admin', async () => {
    const { user, queryClient } = await openBoard({ role: 'ADMIN' });
    server.use(http.get(INVITATIONS_URL, () => HttpResponse.json([])));
    await user.click(screen.getByRole('button', { name: 'Üyeler' }));
    const dialog = await screen.findByRole('dialog', { name: 'Pano üyeleri' });
    expect(await within(dialog).findByRole('heading', { name: 'Davet et' })).toBeInTheDocument();
    const me: MemberDto = { ...testMember({ userId: testUser.id, name: testUser.name }), role: 'MEMBER' };

    emit('member:updated', me, here);

    await waitFor(() =>
      expect(within(dialog).queryByRole('heading', { name: 'Davet et' })).not.toBeInTheDocument(),
    );
    expect(queryClient.getQueryData(boardInvitationKeys.list(BOARD_ID))).toBeUndefined();
  });

  it('refreshes the invitation list when a member joined', async () => {
    const { queryClient } = await openBoard({ role: 'ADMIN' });
    queryClient.setQueryData(boardInvitationKeys.list(BOARD_ID), []);

    emit('member:added', testMember({ userId: 'u-new', name: 'Yeni Üye' }), here);

    await waitFor(() =>
      expect(queryClient.getQueryState(boardInvitationKeys.list(BOARD_ID))?.isInvalidated).toBe(true),
    );
  });
});

describe('useBoardRealtime: fetches and mutations', () => {
  it('starts the board request over when an event arrives while it is on its way', async () => {
    const { state, queryClient } = await openBoard({ delayGets: 80 });
    const created = testCard({ id: 'n1', listId: TODO.id, title: 'Yeni kart', position: 2048 });
    // A refetch is on its way and may have read the board before the event.
    const refetching = queryClient.invalidateQueries({ queryKey: boardKeys.detail(BOARD_ID) });
    await waitFor(() => expect(state.gets).toBe(3));
    state.detail = { ...state.detail, cards: [...state.detail.cards, created] };

    emit('card:created', created, here);

    await refetching;
    await waitFor(() => expect(state.gets).toBe(4));
    expect(await screen.findByRole('button', { name: 'Yeni kart' })).toBeInTheDocument();
  });

  it('refetches the board when the cache cannot follow the event', async () => {
    const { state } = await openBoard();

    emit('card:created', testCard({ id: 'n1', listId: 'list-3', title: 'Başka listede' }), here);

    await waitFor(() => expect(state.gets).toBe(3));
  });

  it('does not refetch while the board has a mutation running; the mutation does', async () => {
    const { state, user } = await openBoard();
    server.use(
      http.post(`*/api/v1/lists/${TODO.id}/cards`, async () => {
        await delay(120);
        const mine = testCard({ id: 'mine', listId: TODO.id, title: 'Benim', position: 2048 });
        state.detail = { ...state.detail, cards: [...state.detail.cards, mine] };
        return HttpResponse.json(mine, { status: 201 });
      }),
    );
    await user.click(screen.getByRole('button', { name: '“Yapılacaklar” listesine kart ekle' }));
    await user.type(screen.getByRole('textbox', { name: 'Kart başlığı' }), 'Benim{Enter}');

    emit('card:created', testCard({ id: 'n1', listId: 'list-3', title: 'Başka listede' }), here);
    await delay(20);
    expect(state.gets).toBe(2);

    await screen.findByRole('button', { name: 'Benim' });
    await waitFor(() => expect(state.gets).toBe(3));
  });
});

describe('useBoardRealtime: leaving the board', () => {
  it('goes to the boards page with a toast when removed from the board', async () => {
    const { router } = await openBoard();

    emit('membership:removed', { boardId: BOARD_ID }, here);

    await waitFor(() => expect(router.state.location.pathname).toBe('/boards'));
    expect(toasts()).toEqual(['“Yol haritası” panosundan çıkarıldın.']);
  });

  it('says it was left when the same user left in another tab', async () => {
    const { router } = await openBoard();

    emit('membership:removed', { boardId: BOARD_ID }, { ...here, actorId: testUser.id });

    await waitFor(() => expect(router.state.location.pathname).toBe('/boards'));
    expect(toasts()).toEqual(['“Yol haritası” panosundan ayrıldın.']);
  });

  it('says the board was deleted', async () => {
    const { router } = await openBoard();

    emit('board:deleted', { boardId: BOARD_ID }, here);

    await waitFor(() => expect(router.state.location.pathname).toBe('/boards'));
    expect(toasts()).toEqual(['“Yol haritası” panosu silindi.']);
  });

  it('leaves only when it is me who was removed from the member list', async () => {
    const { router } = await openBoard();

    emit('member:removed', { userId: OTHER_USER }, here);
    expect(router.state.location.pathname).toBe(`/boards/${BOARD_ID}`);

    emit('member:removed', { userId: testUser.id }, here);
    await waitFor(() => expect(router.state.location.pathname).toBe('/boards'));
    expect(toasts()).toHaveLength(1);
  });
});
