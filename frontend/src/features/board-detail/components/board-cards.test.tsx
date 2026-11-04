import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  BoardRole,
  CardSummaryDto,
  CreateCardRequest,
  ListDto,
  MoveCardRequest,
  UpdateCardRequest,
} from '@trello/contracts';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { useAuthStore } from '../../auth/store/auth-store';
import {
  BOARD_ID,
  apiError,
  boardDetail,
  testCard,
  testCards,
  testLists,
  testUser,
} from '../../../test/fixtures';
import { server } from '../../../test/msw-server';
import { renderApp } from '../../../test/render';
import { useCardUiStore } from '../store/card-ui-store';

const BOARD_URL = `*/api/v1/boards/${BOARD_ID}`;
const ARCHIVED_AT = '2026-10-28T10:00:00.000Z';

interface BoardState {
  lists: ListDto[];
  cards: CardSummaryDto[];
  archivedCards: CardSummaryDto[];
}

/** Opens the board page; the board GET always returns the current state. */
function openBoard(lists: ListDto[], cards: CardSummaryDto[], role: BoardRole = 'OWNER') {
  const state: BoardState = { lists, cards, archivedCards: [] };
  useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
  server.use(
    http.get(BOARD_URL, () =>
      HttpResponse.json(boardDetail(role, 'Pano', state.lists, state.cards)),
    ),
    http.get(`${BOARD_URL}/cards`, () => HttpResponse.json(state.archivedCards)),
    http.get(`${BOARD_URL}/lists`, () => HttpResponse.json([])),
  );
  renderApp(`/boards/${BOARD_ID}`);
  return { state, user: userEvent.setup() };
}

/** Card titles shown in a list, top to bottom. */
function cardTitles(listTitle: string): string[] {
  const list = screen.queryByRole('list', { name: `“${listTitle}” kartları` });
  if (!list) return [];
  return within(list)
    .getAllByRole('button')
    .filter((button) => button.getAttribute('aria-roledescription') === 'sıralanabilir kart')
    .map((button) => button.textContent ?? '');
}

const cardTile = (title: string) =>
  screen
    .getAllByRole('button', { name: title })
    .find((button) => button.getAttribute('aria-roledescription') === 'sıralanabilir kart');

const [TODO, DOING] = testLists('Yapılacaklar', 'Yapılıyor');

describe('Cards on the board', () => {
  it('shows each list’s cards in order as keyboard-draggable tiles', async () => {
    openBoard(
      [TODO, DOING],
      [...testCards(TODO.id, 'Taslak', 'Gözden geçir'), ...testCards(DOING.id, 'Tasarım')],
    );

    await screen.findByRole('list', { name: '“Yapılacaklar” kartları' });
    expect(cardTitles('Yapılacaklar')).toEqual(['Taslak', 'Gözden geçir']);
    expect(cardTitles('Yapılıyor')).toEqual(['Tasarım']);
    expect(cardTile('Taslak')).toHaveAttribute('tabindex', '0');
    expect(
      screen.getByRole('button', { name: '“Taslak” kartının işlemleri' }),
    ).toBeInTheDocument();
  });

  describe('adding a card', () => {
    it('adds the card at the end of its list and keeps the composer open', async () => {
      const { state, user } = openBoard([TODO, DOING], testCards(TODO.id, 'Taslak'));
      let sent: CreateCardRequest | null = null;
      server.use(
        http.post(`*/api/v1/lists/${TODO.id}/cards`, async ({ request }) => {
          sent = (await request.json()) as CreateCardRequest;
          const card = testCard({ id: 'new', listId: TODO.id, title: 'Yeni kart', position: 2048 });
          state.cards = [...state.cards, card];
          return HttpResponse.json(card, { status: 201 });
        }),
      );

      await user.click(
        await screen.findByRole('button', { name: '“Yapılacaklar” listesine kart ekle' }),
      );
      const input = screen.getByRole('textbox', { name: 'Kart başlığı' });
      expect(input).toHaveFocus();
      await user.type(input, '  Yeni kart {Enter}');

      await screen.findByRole('button', { name: 'Yeni kart' });
      expect(sent).toEqual({ title: 'Yeni kart' });
      expect(cardTitles('Yapılacaklar')).toEqual(['Taslak', 'Yeni kart']);
      expect(screen.getByRole('textbox', { name: 'Kart başlığı' })).toHaveValue('');
      expect(screen.getByRole('textbox', { name: 'Kart başlığı' })).toHaveFocus();
    });

    it('adds one card when Enter is pressed again or held while it saves', async () => {
      const { state, user } = openBoard([TODO], []);
      let posts = 0;
      server.use(
        http.post(`*/api/v1/lists/${TODO.id}/cards`, async () => {
          posts += 1;
          await delay(150);
          const card = testCard({ id: `new-${posts}`, listId: TODO.id, title: 'Tek kart' });
          state.cards = [...state.cards, card];
          return HttpResponse.json(card, { status: 201 });
        }),
      );

      await user.click(
        await screen.findByRole('button', { name: '“Yapılacaklar” listesine kart ekle' }),
      );
      await user.type(screen.getByRole('textbox', { name: 'Kart başlığı' }), 'Tek kart');
      // Two presses, then a held key that repeats.
      await user.keyboard('{Enter}{Enter}{Enter>3/}');

      await screen.findByRole('button', { name: 'Tek kart' });
      await delay(200);
      expect(posts).toBe(1);
      expect(cardTitles('Yapılacaklar')).toEqual(['Tek kart']);
      expect(screen.queryByText('Kart başlığını gir.')).not.toBeInTheDocument();
    });

    it('saves titles typed in quick succession one after another, in order', async () => {
      const { state, user } = openBoard([TODO], []);
      const sent: string[] = [];
      let running = 0;
      let overlapped = false;
      server.use(
        http.post(`*/api/v1/lists/${TODO.id}/cards`, async ({ request }) => {
          const { title } = (await request.json()) as CreateCardRequest;
          running += 1;
          overlapped ||= running > 1;
          sent.push(title);
          await delay(100);
          const card = testCard({
            id: `card-${sent.length}`,
            listId: TODO.id,
            title,
            position: sent.length * 1024,
          });
          state.cards = [...state.cards, card];
          running -= 1;
          return HttpResponse.json(card, { status: 201 });
        }),
      );

      await user.click(
        await screen.findByRole('button', { name: '“Yapılacaklar” listesine kart ekle' }),
      );
      await user.type(screen.getByRole('textbox', { name: 'Kart başlığı' }), 'Bir{Enter}İki{Enter}');

      await screen.findByRole('button', { name: 'İki' });
      expect(sent).toEqual(['Bir', 'İki']);
      expect(overlapped).toBe(false);
      await waitFor(() => expect(cardTitles('Yapılacaklar')).toEqual(['Bir', 'İki']));
    });

    it('empties the field at once, so typing the next title is not lost while one saves', async () => {
      const { state, user } = openBoard([TODO], []);
      server.use(
        http.post(`*/api/v1/lists/${TODO.id}/cards`, async () => {
          await delay(150);
          const card = testCard({ id: 'first', listId: TODO.id, title: 'İlk' });
          state.cards = [card];
          return HttpResponse.json(card, { status: 201 });
        }),
      );

      await user.click(
        await screen.findByRole('button', { name: '“Yapılacaklar” listesine kart ekle' }),
      );
      const input = screen.getByRole('textbox', { name: 'Kart başlığı' });
      await user.type(input, 'İlk{Enter}İkinci');

      await screen.findByRole('button', { name: 'İlk' });
      expect(input).toHaveValue('İkinci');
    });

    it('validates the title and closes with Escape, returning focus', async () => {
      const { user } = openBoard([TODO], []);

      const opener = await screen.findByRole('button', {
        name: '“Yapılacaklar” listesine kart ekle',
      });
      await user.click(opener);
      await user.keyboard('{Enter}');
      expect(await screen.findByText('Kart başlığını gir.')).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Kart başlığı' })).toHaveAttribute(
        'aria-invalid',
        'true',
      );

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('textbox', { name: 'Kart başlığı' })).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: '“Yapılacaklar” listesine kart ekle' }),
      ).toHaveFocus();
    });

    it('shows a server error inside the composer', async () => {
      const { user } = openBoard([TODO], []);
      server.use(http.post(`*/api/v1/lists/${TODO.id}/cards`, () => apiError(500, 'INTERNAL_ERROR')));

      await user.click(
        await screen.findByRole('button', { name: '“Yapılacaklar” listesine kart ekle' }),
      );
      await user.type(screen.getByRole('textbox', { name: 'Kart başlığı' }), 'A{Enter}');

      expect(await screen.findByRole('alert')).toHaveTextContent('Sunucuya şu an ulaşılamıyor');
      // The title is not lost.
      expect(screen.getByRole('textbox', { name: 'Kart başlığı' })).toHaveValue('A');
    });
  });

  describe('card actions', () => {
    it('moves a card to another list from the dialog and focuses it there', async () => {
      const { state, user } = openBoard(
        [TODO, DOING],
        [...testCards(TODO.id, 'Taslak', 'Test'), ...testCards(DOING.id, 'Tasarım')],
      );
      let sent: MoveCardRequest | null = null;
      server.use(
        http.post(`*/api/v1/cards/${TODO.id}-card-1/move`, async ({ request }) => {
          sent = (await request.json()) as MoveCardRequest;
          state.cards = state.cards.map((card) =>
            card.title === 'Taslak' ? { ...card, listId: DOING.id, position: 512 } : card,
          );
          return HttpResponse.json({
            id: `${TODO.id}-card-1`,
            listId: DOING.id,
            position: 512,
            rebalanced: null,
          });
        }),
      );

      await user.click(await screen.findByRole('button', { name: '“Taslak” kartının işlemleri' }));
      const dialog = screen.getByRole('dialog', { name: 'Kart işlemleri' });
      const list = within(dialog).getByRole('combobox', { name: 'Liste' });
      const place = within(dialog).getByRole('combobox', { name: 'Sıra' });
      expect(list).toHaveValue(TODO.id);
      expect(within(place).getByRole('option', { selected: true })).toHaveTextContent('1 (şu an)');

      await user.selectOptions(list, 'Yapılıyor');
      // Another list: the card goes to its end by default.
      expect(place).toHaveValue('2');
      await user.selectOptions(place, '1');
      await user.click(within(dialog).getByRole('button', { name: 'Taşı' }));

      expect(screen.queryByRole('dialog', { name: 'Kart işlemleri' })).not.toBeInTheDocument();
      await waitFor(() => expect(cardTitles('Yapılıyor')).toEqual(['Taslak', 'Tasarım']));
      expect(cardTitles('Yapılacaklar')).toEqual(['Test']);
      await waitFor(() => expect(cardTile('Taslak')).toHaveFocus());
      expect(sent).toEqual({ listId: DOING.id, afterCardId: null, beforeCardId: `${DOING.id}-card-1` });
    });

    it('sends nothing when the card stays where it is', async () => {
      const { user } = openBoard([TODO], testCards(TODO.id, 'A', 'B'));

      await user.click(await screen.findByRole('button', { name: '“B” kartının işlemleri' }));
      const dialog = screen.getByRole('dialog', { name: 'Kart işlemleri' });
      expect(within(dialog).getByRole('combobox', { name: 'Sıra' })).toHaveValue('2');
      // No move handler: a request would fail the test.
      await user.click(within(dialog).getByRole('button', { name: 'Taşı' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(cardTile('B')).toHaveFocus();
    });

    it('rolls the move back and explains when the server refuses it', async () => {
      const { user } = openBoard([TODO, DOING], testCards(TODO.id, 'Taslak'));
      server.use(
        http.post(`*/api/v1/cards/${TODO.id}-card-1/move`, () => apiError(500, 'INTERNAL_ERROR')),
      );

      await user.click(await screen.findByRole('button', { name: '“Taslak” kartının işlemleri' }));
      const dialog = screen.getByRole('dialog', { name: 'Kart işlemleri' });
      await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Liste' }), 'Yapılıyor');
      await user.click(within(dialog).getByRole('button', { name: 'Taşı' }));

      expect(await screen.findByText('Kart taşınamadı. Tekrar dene.')).toBeInTheDocument();
      await waitFor(() => expect(cardTitles('Yapılacaklar')).toEqual(['Taslak']));
      expect(cardTitles('Yapılıyor')).toEqual([]);
      await waitFor(() => expect(cardTile('Taslak')).toHaveFocus());
    });

    it('archives a card at once and offers to undo', async () => {
      const { state, user } = openBoard([TODO], testCards(TODO.id, 'A', 'B'));
      const requests: UpdateCardRequest[] = [];
      server.use(
        http.patch(`*/api/v1/cards/${TODO.id}-card-1`, async ({ request }) => {
          const body = (await request.json()) as UpdateCardRequest;
          requests.push(body);
          const [a] = testCards(TODO.id, 'A');
          if (body.archived) {
            state.cards = state.cards.filter((card) => card.id !== a.id);
            return HttpResponse.json({ ...a, archivedAt: ARCHIVED_AT });
          }
          const restored = { ...a, position: 3072 };
          state.cards = [...state.cards, restored];
          return HttpResponse.json(restored);
        }),
      );

      await user.click(await screen.findByRole('button', { name: '“A” kartının işlemleri' }));
      await user.click(
        within(screen.getByRole('dialog', { name: 'Kart işlemleri' })).getByRole('button', {
          name: 'Arşivle',
        }),
      );

      await waitFor(() => expect(cardTitles('Yapılacaklar')).toEqual(['B']));
      expect(await screen.findByText('“A” kartı arşivlendi.')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Geri al' }));

      await screen.findByRole('button', { name: 'A' });
      expect(cardTitles('Yapılacaklar')).toEqual(['B', 'A']);
      expect(requests).toEqual([{ archived: true }, { archived: false }]);
    });

    it('moves the focus to the next card after archiving', async () => {
      const { state, user } = openBoard([TODO], testCards(TODO.id, 'A', 'B'));
      server.use(
        http.patch(`*/api/v1/cards/${TODO.id}-card-1`, () => {
          state.cards = state.cards.filter((card) => card.title !== 'A');
          return HttpResponse.json({ ...testCards(TODO.id, 'A')[0], archivedAt: ARCHIVED_AT });
        }),
      );

      await user.click(await screen.findByRole('button', { name: '“A” kartının işlemleri' }));
      await user.click(screen.getByRole('button', { name: 'Arşivle' }));

      await waitFor(() => expect(cardTitles('Yapılacaklar')).toEqual(['B']));
      expect(cardTile('B')).toHaveFocus();
    });

    it('moves the focus to "Kart ekle" after archiving the only card of a list', async () => {
      const { state, user } = openBoard([TODO], testCards(TODO.id, 'A'));
      server.use(
        http.patch(`*/api/v1/cards/${TODO.id}-card-1`, () => {
          state.cards = [];
          return HttpResponse.json({ ...testCards(TODO.id, 'A')[0], archivedAt: ARCHIVED_AT });
        }),
      );

      await user.click(await screen.findByRole('button', { name: '“A” kartının işlemleri' }));
      await user.click(screen.getByRole('button', { name: 'Arşivle' }));

      await waitFor(() => expect(cardTitles('Yapılacaklar')).toEqual([]));
      expect(
        screen.getByRole('button', { name: '“Yapılacaklar” listesine kart ekle' }),
      ).toHaveFocus();
    });

    it('says so when undoing the archive fails', async () => {
      const { state, user } = openBoard([TODO], testCards(TODO.id, 'A'));
      server.use(
        http.patch(`*/api/v1/cards/${TODO.id}-card-1`, async ({ request }) => {
          const body = (await request.json()) as UpdateCardRequest;
          if (!body.archived) return apiError(500, 'INTERNAL_ERROR');
          state.cards = [];
          return HttpResponse.json({ ...testCards(TODO.id, 'A')[0], archivedAt: ARCHIVED_AT });
        }),
      );

      await user.click(await screen.findByRole('button', { name: '“A” kartının işlemleri' }));
      await user.click(screen.getByRole('button', { name: 'Arşivle' }));
      await user.click(await screen.findByRole('button', { name: 'Geri al' }));

      expect(await screen.findByText('Kart geri yüklenemedi. Tekrar dene.')).toBeInTheDocument();
    });

    it('forgets an open dialog when the board page goes away', async () => {
      openBoard([TODO], testCards(TODO.id, 'A'));
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: '“A” kartının işlemleri' }));
      expect(useCardUiStore.getState().actionsCardId).toBe(`${TODO.id}-card-1`);

      cleanup();

      expect(useCardUiStore.getState().actionsCardId).toBeNull();
    });
  });

  describe('archive', () => {
    it('lists archived cards with their list, restores them and deletes them for good', async () => {
      const { state, user } = openBoard([TODO], [], 'MEMBER');
      const old = testCard({ id: 'old', listId: TODO.id, title: 'Eski kart', archivedAt: ARCHIVED_AT });
      const gone = testCard({ id: 'gone', listId: TODO.id, title: 'Silinecek', archivedAt: ARCHIVED_AT });
      state.archivedCards = [old, gone];
      let deleted = false;
      server.use(
        http.patch('*/api/v1/cards/old', () => {
          const restored = { ...old, archivedAt: null };
          state.archivedCards = state.archivedCards.filter((card) => card.id !== 'old');
          state.cards = [restored];
          return HttpResponse.json(restored);
        }),
        http.delete('*/api/v1/cards/gone', () => {
          deleted = true;
          state.archivedCards = state.archivedCards.filter((card) => card.id !== 'gone');
          return new HttpResponse(null, { status: 204 });
        }),
      );

      await user.click(await screen.findByRole('button', { name: 'Arşiv' }));
      const dialog = screen.getByRole('dialog', { name: 'Arşiv' });
      const cards = await within(dialog).findByRole('list', { name: 'Arşivlenmiş kartlar' });
      expect(within(cards).getAllByText('“Yapılacaklar” listesinde')).toHaveLength(2);

      await user.click(within(dialog).getByRole('button', { name: '“Eski kart” kartını geri yükle' }));
      expect(await within(dialog).findByRole('button', { name: '“Silinecek” kartını kalıcı olarak sil' })).toBeInTheDocument();
      await waitFor(() => expect(cardTitles('Yapılacaklar')).toEqual(['Eski kart']));

      // Members may delete cards for good (lists need an admin).
      await user.click(within(dialog).getByRole('button', { name: '“Silinecek” kartını kalıcı olarak sil' }));
      const confirm = screen.getByRole('dialog', { name: 'Kart kalıcı olarak silinsin mi?' });
      await user.click(within(confirm).getByRole('button', { name: 'Kartı sil' }));

      expect(await within(dialog).findByText('Arşivde kart yok.')).toBeInTheDocument();
      expect(deleted).toBe(true);
    });

    it('does not restore a card while its list is archived, and says why', async () => {
      const { state, user } = openBoard([TODO], []);
      const oldList = { ...testLists('Eski liste')[0], id: 'list-9', archivedAt: ARCHIVED_AT };
      state.archivedCards = [
        testCard({ id: 'old', listId: oldList.id, title: 'Eski kart', archivedAt: ARCHIVED_AT }),
      ];
      server.use(http.get(`${BOARD_URL}/lists`, () => HttpResponse.json([oldList])));

      await user.click(await screen.findByRole('button', { name: 'Arşiv' }));
      const dialog = screen.getByRole('dialog', { name: 'Arşiv' });
      const restore = await within(dialog).findByRole('button', {
        name: '“Eski kart” kartını geri yükle',
      });

      expect(restore).toBeDisabled();
      await waitFor(() =>
        expect(restore).toHaveAccessibleDescription(
          '“Eski liste” listesi arşivde. Önce listeyi geri yükle.',
        ),
      );
    });
  });
});
