import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BoardRole, CardSummaryDto, ListDto } from '@trello/contracts';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { useAuthStore } from '../../auth/store/auth-store';
import {
  BOARD_ID,
  boardDetail,
  testCard,
  testCards,
  testLists,
  testUser,
} from '../../../test/fixtures';
import { openListMenu, selectListMenuItem } from '../../../test/list-menu';
import { server } from '../../../test/msw-server';
import { renderApp } from '../../../test/render';

const BOARD_URL = `*/api/v1/boards/${BOARD_ID}`;
const [TODO, DOING] = testLists('Yapılacaklar', 'Yapılıyor');

function openBoard(lists: ListDto[], cards: CardSummaryDto[], role: BoardRole = 'OWNER') {
  const state = { lists, cards };
  useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
  server.use(
    http.get(BOARD_URL, () =>
      HttpResponse.json(boardDetail(role, 'Pano', state.lists, state.cards)),
    ),
    http.get(`${BOARD_URL}/cards`, () => HttpResponse.json([])),
    http.get(`${BOARD_URL}/lists`, () => HttpResponse.json([])),
  );
  renderApp(`/boards/${BOARD_ID}`);
  return { state, user: userEvent.setup() };
}

describe('List header', () => {
  it('shows how many cards each list holds', async () => {
    openBoard([TODO, DOING], testCards(TODO.id, 'A', 'B', 'C'));

    expect(await screen.findByText('3 kart', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('0 kart', { exact: true })).toBeInTheDocument();
  });

  it('counts a card the moment it is added', async () => {
    const { state, user } = openBoard([TODO], testCards(TODO.id, 'A'));
    server.use(
      http.post(`*/api/v1/lists/${TODO.id}/cards`, () => {
        const card = testCard({ id: 'new', listId: TODO.id, title: 'B', position: 2048 });
        state.cards = [...state.cards, card];
        return HttpResponse.json(card, { status: 201 });
      }),
    );

    await user.click(
      await screen.findByRole('button', { name: '“Yapılacaklar” listesine kart ekle' }),
    );
    await user.type(screen.getByRole('textbox', { name: 'Kart başlığı' }), 'B{Enter}');

    expect(await screen.findByText('2 kart', { exact: true })).toBeInTheDocument();
  });

  it('counts one less once a card is archived', async () => {
    const { state, user } = openBoard([TODO], testCards(TODO.id, 'A', 'B'));
    server.use(
      http.patch(`*/api/v1/cards/${TODO.id}-card-1`, () => {
        const [a] = testCards(TODO.id, 'A');
        state.cards = state.cards.filter((card) => card.id !== a.id);
        return HttpResponse.json({ ...a, archivedAt: '2026-10-28T10:00:00.000Z' });
      }),
    );

    expect(await screen.findByText('2 kart', { exact: true })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '“A” kartının işlemleri' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Kart işlemleri' })).getByRole('button', {
        name: 'Arşivle',
      }),
    );

    expect(await screen.findByText('1 kart', { exact: true })).toBeInTheDocument();
  });
});

describe('List menu', () => {
  it('offers "Kart ekle" and "Listeyi arşivle"', async () => {
    const { user } = openBoard([TODO], []);

    const menu = await openListMenu(user, 'Yapılacaklar');

    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Kart ekle', 'Listeyi arşivle']);
  });

  it('opens the card composer with the focus in its field', async () => {
    const { user } = openBoard([TODO, DOING], []);

    await selectListMenuItem(user, 'Yapılıyor', 'Kart ekle');

    const field = screen.getByRole('textbox', { name: 'Kart başlığı' });
    await waitFor(() => expect(field).toHaveFocus());
    expect(screen.getAllByRole('textbox', { name: 'Kart başlığı' })).toHaveLength(1);
  });

  it('gives the focus back to the "…" button on Escape', async () => {
    const { user } = openBoard([TODO], []);
    await openListMenu(user, 'Yapılacaklar');

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('button', { name: '“Yapılacaklar” listesinin işlemleri' })).toHaveFocus();
  });

  it('keeps the keyboard handle for moving the list', async () => {
    openBoard([TODO], []);

    const handle = await screen.findByRole('button', { name: '“Yapılacaklar” listesini taşı' });

    expect(handle).toHaveAttribute('aria-roledescription', 'sıralanabilir liste');
  });

  it.each<BoardRole>(['MEMBER', 'ADMIN', 'OWNER'])('is available to a %s', async (role) => {
    const { user } = openBoard([TODO], [], role);

    const menu = await openListMenu(user, 'Yapılacaklar');

    expect(within(menu).getAllByRole('menuitem')).toHaveLength(2);
  });
});
