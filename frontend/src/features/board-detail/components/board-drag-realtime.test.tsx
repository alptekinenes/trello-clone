import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CardSummaryDto } from '@trello/contracts';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { useAuthStore } from '../../auth/store/auth-store';
import { realtime } from '../../../shared/lib/realtime-client';
import { fakeRealtime } from '../../../test/fake-realtime';
import {
  BOARD_ID,
  boardDetail,
  testCard,
  testCards,
  testLists,
  testUser,
} from '../../../test/fixtures';
import { server } from '../../../test/msw-server';
import { renderApp } from '../../../test/render';

const BOARD_URL = `*/api/v1/boards/${BOARD_ID}`;
const [TODO, DOING] = testLists('Yapılacaklar', 'Yapılıyor');

async function openLiveBoard(cards: CardSummaryDto[]) {
  useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
  const state = { cards };
  server.use(
    http.get(BOARD_URL, () => HttpResponse.json(boardDetail('OWNER', 'Pano', [TODO, DOING], state.cards))),
    http.get(`${BOARD_URL}/cards`, () => HttpResponse.json([])),
    http.get(`${BOARD_URL}/lists`, () => HttpResponse.json([])),
    http.get('*/api/v1/boards', () => HttpResponse.json([])),
  );
  const { router } = renderApp(`/boards/${BOARD_ID}`);
  await screen.findByRole('list', { name: '“Yapılacaklar” kartları' });
  fakeRealtime.connect();
  await waitFor(() => expect(fakeRealtime.joins).toEqual([BOARD_ID]));
  return { state, router, user: userEvent.setup() };
}

const cardTile = (title: string) =>
  screen
    .getAllByRole('button', { name: title })
    .find((button) => button.getAttribute('aria-roledescription') === 'sıralanabilir kart') as HTMLElement;

function cardTitles(listTitle: string): string[] {
  const list = screen.queryByRole('list', { name: `“${listTitle}” kartları` });
  if (!list) return [];
  return within(list)
    .getAllByRole('button')
    .filter((button) => button.getAttribute('aria-roledescription') === 'sıralanabilir kart')
    .map((button) => button.textContent ?? '');
}

const incoming = testCard({ id: 'live', listId: TODO.id, title: 'Canlı kart', position: 9000 });
const emitIncoming = () => fakeRealtime.serverEmit('card:created', incoming, { boardId: BOARD_ID });

describe('events while a card is held', () => {
  it('waits for the drop, then shows the new card without moving the dropped one', async () => {
    const { user } = await openLiveBoard(testCards(TODO.id, 'Taslak', 'Gözden geçir'));
    cardTile('Taslak').focus();

    await user.keyboard(' ');
    emitIncoming();
    expect(screen.queryByRole('button', { name: 'Canlı kart' })).not.toBeInTheDocument();

    await user.keyboard(' ');
    expect(await screen.findByRole('button', { name: 'Canlı kart' })).toBeInTheDocument();
    expect(cardTitles('Yapılacaklar')).toEqual(['Taslak', 'Gözden geçir', 'Canlı kart']);
  });

  it('applies the event at once when the drag is cancelled', async () => {
    const { user } = await openLiveBoard(testCards(TODO.id, 'Taslak'));
    cardTile('Taslak').focus();

    await user.keyboard(' ');
    emitIncoming();
    expect(screen.queryByRole('button', { name: 'Canlı kart' })).not.toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(await screen.findByRole('button', { name: 'Canlı kart' })).toBeInTheDocument();
  });

  it('applies the held events when the board goes away mid-drag', async () => {
    const { user, router } = await openLiveBoard(testCards(TODO.id, 'Taslak'));
    cardTile('Taslak').focus();
    await user.keyboard(' ');
    const seen: string[] = [];
    const unsubscribe = realtime.subscribe((message) => seen.push(message.type));
    emitIncoming();
    expect(seen).toEqual([]);

    // Leaving the page releases the hold.
    await act(() => router.navigate('/boards'));

    expect(seen).toEqual(['card:created']);
    unsubscribe();
  });
});

describe('the card actions dialog when the card is removed by someone else', () => {
  it('closes, tells the user, and puts the focus on the add-card button of its list', async () => {
    const { user } = await openLiveBoard(testCards(TODO.id, 'Taslak', 'Gözden geçir'));
    await user.click(screen.getByRole('button', { name: '“Taslak” kartının işlemleri' }));
    expect(screen.getByRole('dialog', { name: 'Kart işlemleri' })).toBeInTheDocument();

    fakeRealtime.serverEmit('card:deleted', { id: `${TODO.id}-card-1`, listId: TODO.id }, { boardId: BOARD_ID });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getAllByRole('status').map((element) => element.textContent)).toContain(
      'Kart başka biri tarafından kaldırıldı.',
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '“Yapılacaklar” listesine kart ekle' })).toHaveFocus(),
    );
  });

  it('stays open when only another card changes', async () => {
    const { user } = await openLiveBoard(testCards(TODO.id, 'Taslak', 'Gözden geçir'));
    await user.click(screen.getByRole('button', { name: '“Taslak” kartının işlemleri' }));

    fakeRealtime.serverEmit('card:deleted', { id: `${TODO.id}-card-2`, listId: TODO.id }, { boardId: BOARD_ID });

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Gözden geçir' })).not.toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: 'Kart işlemleri' })).toBeInTheDocument();
  });
});
