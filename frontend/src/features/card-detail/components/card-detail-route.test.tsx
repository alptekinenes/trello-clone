import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CardDetailDto, UpdateCardRequest } from '@trello/contracts';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import {
  BOARD_ID,
  apiError,
  boardDetail,
  testCard,
  testCardDetail,
  testLists,
  testUser,
} from '../../../test/fixtures';
import { server } from '../../../test/msw-server';
import { renderApp } from '../../../test/render';
import { useAuthStore } from '../../auth/store/auth-store';

const [list] = testLists('Yapılacaklar');
const CARD_ID = 'card-1';
const BOARD_URL = `*/api/v1/boards/${BOARD_ID}`;
const CARD_URL = `*/api/v1/cards/${CARD_ID}`;

/** Opens `path` with one card on the board; the card GET answers with `detail`. */
function open(path: string, detail: Partial<CardDetailDto> = {}) {
  useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
  const card = testCardDetail({ id: CARD_ID, listId: list.id, title: 'Rapor', ...detail });
  server.use(
    http.get(BOARD_URL, () =>
      HttpResponse.json(boardDetail('OWNER', 'Pano', [list], [testCard(card)])),
    ),
    http.get(CARD_URL, () => HttpResponse.json(card)),
  );
  const result = renderApp(path);
  return { ...result, user: userEvent.setup(), card };
}

const tile = () => screen.findByRole('button', { name: 'Rapor' });
/** The card dialog once the card has loaded. */
async function cardDialog() {
  const dialog = await screen.findByRole('dialog', { name: 'Rapor' });
  await within(dialog).findByText('“Yapılacaklar” listesinde');
  return dialog;
}

describe('card dialog route', () => {
  it('opens from a URL, named after the card', async () => {
    open(`/boards/${BOARD_ID}/c/${CARD_ID}`);

    const dialog = await cardDialog();
    expect(within(dialog).getByRole('button', { name: 'Rapor' })).toHaveAccessibleDescription(
      'Kart başlığını düzenle',
    );
    expect(within(dialog).getByText('“Yapılacaklar” listesinde')).toBeInTheDocument();
  });

  it('closes to the board and puts the focus on the card tile', async () => {
    const { user, router } = open(`/boards/${BOARD_ID}/c/${CARD_ID}`);
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Kapat' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/boards/${BOARD_ID}`));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(async () => expect(await tile()).toHaveFocus());
  });

  it('opens when the tile is clicked and goes back in the history on close', async () => {
    const { user, router } = open(`/boards/${BOARD_ID}`);

    await user.click(await tile());

    const dialog = await cardDialog();
    expect(router.state.location.pathname).toBe(`/boards/${BOARD_ID}/c/${CARD_ID}`);
    await user.click(within(dialog).getByRole('button', { name: 'Kapat' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/boards/${BOARD_ID}`));
    expect(router.state.historyAction).toBe('POP');
  });

  it('opens with Enter on the focused tile, while Space still lifts it', async () => {
    const { user } = open(`/boards/${BOARD_ID}`);
    (await tile()).focus();

    await user.keyboard(' ');
    expect(await screen.findByText(/kartı tutuldu/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.keyboard('{Escape}');
    await user.keyboard('{Enter}');
    expect(await cardDialog()).toBeInTheDocument();
  });

  it('keeps the tile named by its title and describes how to open it', async () => {
    open(`/boards/${BOARD_ID}`);

    expect(await tile()).toHaveAccessibleDescription(/Kartı açmak için Enter tuşuna bas\./);
  });

  it('says so when the card does not exist', async () => {
    useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
    server.use(
      http.get(BOARD_URL, () => HttpResponse.json(boardDetail('OWNER', 'Pano', [list], []))),
      http.get('*/api/v1/cards/nope', () => apiError(404, 'NOT_FOUND')),
    );
    const { router } = renderApp(`/boards/${BOARD_ID}/c/nope`);

    expect(await screen.findByText('Kart bulunamadı. Silinmiş olabilir.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Panoya dön' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/boards/${BOARD_ID}`));
  });

  it('redirects to the board the card really belongs to', async () => {
    const OTHER = '99999999-9999-4999-8999-999999999999';
    const { router } = open(`/boards/${OTHER}/c/${CARD_ID}`, { boardId: BOARD_ID });
    server.use(
      http.get(`*/api/v1/boards/${OTHER}`, () =>
        HttpResponse.json(boardDetail('OWNER', 'Başka', [], [])),
      ),
    );

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/boards/${BOARD_ID}/c/${CARD_ID}`),
    );
  });
});

describe('renaming from the dialog', () => {
  async function rename(user: ReturnType<typeof userEvent.setup>, title: string) {
    const dialog = await cardDialog();
    await user.click(within(dialog).getByRole('button', { name: 'Rapor' }));
    const input = within(dialog).getByRole('textbox', { name: 'Kart başlığı' });
    await user.clear(input);
    await user.type(input, `${title}{Enter}`);
    return dialog;
  }

  it('shows the new title on the tile at once and sends it', async () => {
    const { user } = open(`/boards/${BOARD_ID}/c/${CARD_ID}`);
    let sent: UpdateCardRequest | null = null;
    server.use(
      http.patch(CARD_URL, async ({ request }) => {
        sent = (await request.json()) as UpdateCardRequest;
        await delay(50);
        return HttpResponse.json(testCard({ id: CARD_ID, listId: list.id, title: 'Yeni' }));
      }),
    );

    await rename(user, 'Yeni');

    // The tile sits behind the modal, so it is not in the accessibility tree: look it up by text.
    expect(await screen.findByText('Yeni', { selector: 'p' })).toBeInTheDocument();
    await waitFor(() => expect(sent).toEqual({ title: 'Yeni' }));
  });

  it('puts the old title back and tells the user in the dialog when saving fails', async () => {
    const { user } = open(`/boards/${BOARD_ID}/c/${CARD_ID}`);
    server.use(http.patch(CARD_URL, () => apiError(500, 'INTERNAL_ERROR')));

    const dialog = await rename(user, 'Yeni');

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Değişiklik kaydedilemedi. Tekrar dene.',
    );
    expect(within(dialog).getByRole('button', { name: 'Rapor' })).toBeInTheDocument();
    expect(screen.queryByText('Yeni')).not.toBeInTheDocument();
  });
});

describe('archive from the dialog', () => {
  it('archives the card, closes the dialog and offers to undo', async () => {
    const { user, router } = open(`/boards/${BOARD_ID}/c/${CARD_ID}`);
    server.use(
      http.patch(CARD_URL, () =>
        HttpResponse.json(testCard({ id: CARD_ID, listId: list.id, title: 'Rapor', archivedAt: '2026-11-02T10:00:00.000Z' })),
      ),
    );
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Arşivle' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/boards/${BOARD_ID}`));
    expect(await screen.findByText('“Rapor” kartı arşivlendi.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Geri al' })).toBeInTheDocument();
  });

  it('shows an archive banner with a restore button instead of the archive action', async () => {
    const { user } = open(`/boards/${BOARD_ID}/c/${CARD_ID}`, {
      archivedAt: '2026-11-02T10:00:00.000Z',
    });
    let restored: UpdateCardRequest | null = null;
    server.use(
      http.patch(CARD_URL, async ({ request }) => {
        restored = (await request.json()) as UpdateCardRequest;
        return HttpResponse.json(testCard({ id: CARD_ID, listId: list.id, title: 'Rapor' }));
      }),
    );
    const dialog = await cardDialog();

    expect(within(dialog).getByText('Bu kart arşivde.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Arşivle' })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Geri yükle' }));

    await waitFor(() => expect(restored).toEqual({ archived: false }));
  });
});
