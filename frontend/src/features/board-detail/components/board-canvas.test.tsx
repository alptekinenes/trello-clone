import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BoardRole, CreateListRequest, ListDto, UpdateListRequest } from '@trello/contracts';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { useAuthStore } from '../../auth/store/auth-store';
import { BOARD_ID, apiError, boardDetail, testLists, testUser } from '../../../test/fixtures';
import { server } from '../../../test/msw-server';
import { renderApp } from '../../../test/render';

const BOARD_URL = `*/api/v1/boards/${BOARD_ID}`;

/** Visible list titles (the hidden edit hint is not part of them). */
function titleOf(heading: HTMLElement) {
  return (heading.querySelector('button') ?? heading).textContent;
}

/** Opens the board page; the board GET always returns the current `lists`. */
function openBoard(initial: ListDto[], role: BoardRole = 'OWNER') {
  const state = { lists: initial };
  useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
  server.use(
    http.get(BOARD_URL, () => HttpResponse.json(boardDetail(role, 'Pano', state.lists))),
    http.get(`${BOARD_URL}/cards`, () => HttpResponse.json([])),
  );
  renderApp(`/boards/${BOARD_ID}`);
  return { state, user: userEvent.setup() };
}

async function listNames() {
  const lists = await screen.findByRole('list', { name: 'Listeler' });
  return within(lists)
    .queryAllByRole('heading', { level: 2 })
    .map(titleOf);
}

describe('BoardCanvas', () => {
  it('shows the lists in order with keyboard drag handles', async () => {
    openBoard(testLists('Yapılacaklar', 'Yapılıyor', 'Bitti'));

    expect(await listNames()).toEqual(['Yapılacaklar', 'Yapılıyor', 'Bitti']);
    const handle = screen.getByRole('button', { name: '“Yapılıyor” listesini taşı' });
    expect(handle).toHaveAttribute('aria-roledescription', 'sıralanabilir liste');
  });

  describe('adding a list', () => {
    it('adds the list at the end and keeps the composer open for the next one', async () => {
      const { state, user } = openBoard(testLists('A'));
      let sent: CreateListRequest | null = null;
      server.use(
        http.post(`${BOARD_URL}/lists`, async ({ request }) => {
          sent = (await request.json()) as CreateListRequest;
          const created = { ...testLists('A', 'Yeni')[1] };
          state.lists = [...state.lists, created];
          return HttpResponse.json(created, { status: 201 });
        }),
      );

      await user.click(await screen.findByRole('button', { name: 'Başka liste ekle' }));
      const input = screen.getByRole('textbox', { name: 'Liste adı' });
      expect(input).toHaveFocus();
      await user.type(input, '  Yeni {Enter}');

      await screen.findByRole('heading', { level: 2, name: 'Yeni' });
      expect(sent).toEqual({ title: 'Yeni' });
      expect(await listNames()).toEqual(['A', 'Yeni']);
      expect(screen.getByRole('textbox', { name: 'Liste adı' })).toHaveValue('');
      expect(screen.getByRole('textbox', { name: 'Liste adı' })).toHaveFocus();
    });

    it('validates the title and closes with Escape, returning focus', async () => {
      const { user } = openBoard([]);

      const opener = await screen.findByRole('button', { name: 'Liste ekle' });
      await user.click(opener);
      await user.click(screen.getByRole('button', { name: 'Listeyi ekle' }));
      expect(await screen.findByText('Liste adını gir.')).toBeInTheDocument();

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('textbox', { name: 'Liste adı' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Liste ekle' })).toHaveFocus();
    });

    it('shows a server error inside the composer', async () => {
      const { user } = openBoard([]);
      server.use(http.post(`${BOARD_URL}/lists`, () => apiError(500, 'INTERNAL_ERROR')));

      await user.click(await screen.findByRole('button', { name: 'Liste ekle' }));
      await user.type(screen.getByRole('textbox', { name: 'Liste adı' }), 'A{Enter}');

      expect(await screen.findByRole('alert')).toHaveTextContent('Sunucuya şu an ulaşılamıyor');
    });
  });

  it('renames a list', async () => {
    const { state, user } = openBoard(testLists('A', 'B'));
    let sent: UpdateListRequest | null = null;
    server.use(
      http.patch('*/api/v1/lists/list-2', async ({ request }) => {
        sent = (await request.json()) as UpdateListRequest;
        state.lists = [state.lists[0], { ...state.lists[1], title: 'Bitti' }];
        return HttpResponse.json(state.lists[1]);
      }),
    );

    await user.click(await screen.findByRole('button', { name: 'B' }));
    const input = screen.getByRole('textbox', { name: 'Liste adı' });
    await user.clear(input);
    await user.type(input, 'Bitti{Enter}');

    expect(await screen.findByRole('heading', { level: 2, name: 'Bitti' })).toBeInTheDocument();
    expect(sent).toEqual({ title: 'Bitti' });
  });

  describe('archive', () => {
    it('archives a list at once and offers to undo', async () => {
      const { state, user } = openBoard(testLists('A', 'B'));
      const requests: UpdateListRequest[] = [];
      server.use(
        http.patch('*/api/v1/lists/list-1', async ({ request }) => {
          const body = (await request.json()) as UpdateListRequest;
          requests.push(body);
          const list = { ...testLists('A')[0] };
          if (body.archived) {
            state.lists = state.lists.filter((l) => l.id !== 'list-1');
            return HttpResponse.json({ ...list, archivedAt: '2026-10-27T10:00:00.000Z' });
          }
          const restored = { ...list, position: 3072 };
          state.lists = [...state.lists, restored];
          return HttpResponse.json(restored);
        }),
      );

      await user.click(await screen.findByRole('button', { name: '“A” listesini arşivle' }));

      expect(await listNames()).toEqual(['B']);
      expect(await screen.findByText('“A” listesi arşivlendi.')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Geri al' }));

      await screen.findByRole('heading', { level: 2, name: 'A' });
      expect(await listNames()).toEqual(['B', 'A']);
      expect(requests).toEqual([{ archived: true }, { archived: false }]);
    });

    it('lists archived lists, restores them, and lets admins delete them for good', async () => {
      const archived = { ...testLists('Eski')[0], id: 'list-9', archivedAt: '2026-10-27T10:00:00.000Z' };
      const { user } = openBoard(testLists('A'));
      let archive = [archived];
      let deleted = false;
      server.use(
        http.get(`${BOARD_URL}/lists`, () => HttpResponse.json(archive)),
        http.delete('*/api/v1/lists/list-9', () => {
          deleted = true;
          archive = [];
          return new HttpResponse(null, { status: 204 });
        }),
      );

      await user.click(await screen.findByRole('button', { name: 'Arşiv' }));
      const dialog = screen.getByRole('dialog', { name: 'Arşiv' });
      expect(await within(dialog).findByText('Eski')).toBeInTheDocument();
      expect(
        within(dialog).getByRole('button', { name: '“Eski” listesini geri yükle' }),
      ).toBeInTheDocument();

      await user.click(
        within(dialog).getByRole('button', { name: '“Eski” listesini kalıcı olarak sil' }),
      );
      const confirm = screen.getByRole('dialog', { name: 'Liste kalıcı olarak silinsin mi?' });
      await user.click(within(confirm).getByRole('button', { name: 'Listeyi sil' }));

      expect(await within(dialog).findByText('Arşivde liste yok.')).toBeInTheDocument();
      expect(deleted).toBe(true);
    });

    it('does not offer permanent delete to members', async () => {
      const archived = { ...testLists('Eski')[0], archivedAt: '2026-10-27T10:00:00.000Z' };
      const { user } = openBoard([], 'MEMBER');
      server.use(http.get(`${BOARD_URL}/lists`, () => HttpResponse.json([archived])));

      await user.click(await screen.findByRole('button', { name: 'Arşiv' }));
      const dialog = screen.getByRole('dialog', { name: 'Arşiv' });

      expect(await within(dialog).findByText('Eski')).toBeInTheDocument();
      expect(within(dialog).queryByRole('button', { name: /kalıcı olarak sil/ })).toBeNull();
    });
  });
});
