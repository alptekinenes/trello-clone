import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UpdateCardRequest } from '@trello/contracts';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { BOARD_ID, apiError, boardDetail, testCard, testCardDetail, testLists, testUser } from '../../../test/fixtures';
import {
  BOARD_URL,
  CARD_ID,
  CARD_URL,
  LIST,
  cardDialog,
  openCard,
  openCard as open,
  recordPatches,
} from '../../../test/card-dialog';
import { server } from '../../../test/msw-server';
import { renderApp } from '../../../test/render';
import { useAuthStore } from '../../auth/store/auth-store';

const list = LIST;
const CARD_PATH = `/boards/${BOARD_ID}/c/${CARD_ID}`;
const tile = () => screen.findByRole('button', { name: 'Rapor' });

describe('card dialog route', () => {
  it('opens from a URL, named after the card', async () => {
    open(`/boards/${BOARD_ID}/c/${CARD_ID}`);

    const dialog = await cardDialog();
    expect(within(dialog).getByRole('button', { name: 'Rapor' })).toHaveAccessibleDescription(
      'Kart başlığını düzenle',
    );
    expect(within(dialog).getByRole('button', { name: 'Liste: Yapılacaklar' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Kart menüsü' })).toBeInTheDocument();
  });

  it('lays the details and the comments panel side by side from 1024 px, in the widest dialog', async () => {
    open(`/boards/${BOARD_ID}/c/${CARD_ID}`);

    const dialog = await cardDialog();
    const panel = within(dialog).getByRole('region', { name: 'Yorumlar ve etkinlik' });

    expect(dialog).toHaveClass('max-w-6xl');
    expect(panel.parentElement).toHaveClass('lg:grid-cols-[minmax(0,1fr)_22rem]');
    expect(panel.parentElement?.firstElementChild).toContainElement(
      within(dialog).getByRole('button', { name: 'Rapor' }),
    );
  });

  it('keeps the same close button while the card loads, so focus stays on it', async () => {
    open(CARD_PATH);
    const dialog = await screen.findByRole('dialog');
    const closeButton = within(dialog).getByRole('button', { name: 'Kapat' });
    closeButton.focus();

    await within(dialog).findByText('Liste: Yapılacaklar');

    expect(within(dialog).getByRole('button', { name: 'Kapat' })).toBe(closeButton);
    expect(closeButton).toHaveFocus();
  });

  it('puts a horizontal action row with real actions only under the title', async () => {
    open(`/boards/${BOARD_ID}/c/${CARD_ID}`);

    const dialog = await cardDialog();
    const row = within(dialog).getByRole('group', { name: 'Kart işlemleri' });
    expect(within(row).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Üyeler',
      'Etiketler',
      'Kapak',
      'Son tarih',
      'Checklist',
    ]);
    const title = within(dialog).getByRole('button', { name: 'Rapor' });
    expect(title.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(dialog.querySelector('aside')).toBeNull();
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

    expect(await screen.findByRole('alert')).toHaveTextContent('Kart bulunamadı. Silinmiş olabilir.');
    await userEvent.click(screen.getByRole('button', { name: 'Panoya dön' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/boards/${BOARD_ID}`));
  });

  it('says in a status region that the card is loading', async () => {
    useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
    server.use(
      http.get(BOARD_URL, () => HttpResponse.json(boardDetail('OWNER', 'Pano', [list], []))),
      http.get('*/api/v1/cards/slow', async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );
    renderApp(`/boards/${BOARD_ID}/c/slow`);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('status')).toHaveTextContent('Kart yükleniyor…');
  });

  it.each([
    ['a server error', () => apiError(500, 'INTERNAL_ERROR'), /^Sunucuya şu an ulaşılamıyor/],
    ['a lost connection', () => HttpResponse.error(), /^Bağlantı kurulamadı/],
  ])('announces %s and loads the card on retry', async (_, failure, message) => {
    useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
    let attempts = 0;
    server.use(
      http.get(BOARD_URL, () =>
        HttpResponse.json(boardDetail('OWNER', 'Pano', [list], [testCard({ id: 'flaky', listId: list.id, title: 'Rapor' })])),
      ),
      http.get('*/api/v1/cards/flaky/feed', () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get('*/api/v1/cards/flaky', () => {
        attempts += 1;
        return attempts === 1 ? failure() : HttpResponse.json(testCardDetail({ id: 'flaky', listId: list.id, title: 'Rapor' }));
      }),
    );
    renderApp(`/boards/${BOARD_ID}/c/flaky`);
    const dialog = await screen.findByRole('dialog');

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(message);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tekrar dene' }));

    expect(await within(dialog).findByRole('button', { name: 'Rapor' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
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
    expect(await screen.findByText('Yeni', { selector: 'span' })).toBeInTheDocument();
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

    await user.click(within(dialog).getByRole('button', { name: 'Kart menüsü' }));
    await user.click(within(dialog).getByRole('menuitem', { name: 'Arşivle' }));

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
    expect(within(dialog).queryByRole('button', { name: 'Kart menüsü' })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Geri yükle' }));

    await waitFor(() => expect(restored).toEqual({ archived: false }));
  });
});

describe('a card the board has moved or archived', () => {
  const OTHER = { ...testLists('Yapılacaklar', 'Bitti')[1] };

  it('names the list the board has it in, not the one the cached card had', async () => {
    open(`/boards/${BOARD_ID}/c/${CARD_ID}`);
    server.use(
      http.get(BOARD_URL, () =>
        HttpResponse.json(
          boardDetail('OWNER', 'Pano', [list, OTHER], [testCard({ id: CARD_ID, listId: OTHER.id, title: 'Rapor' })]),
        ),
      ),
    );

    const dialog = await screen.findByRole('dialog', { name: 'Rapor' });

    expect(await within(dialog).findByRole('button', { name: 'Liste: Bitti' })).toBeInTheDocument();
  });

  it('shows the archive banner for a card that is no longer on the board', async () => {
    open(`/boards/${BOARD_ID}/c/${CARD_ID}`);
    server.use(
      http.get(BOARD_URL, () => HttpResponse.json(boardDetail('OWNER', 'Pano', [list], []))),
    );

    const dialog = await screen.findByRole('dialog', { name: 'Rapor' });

    expect(await within(dialog).findByText('Bu kart arşivde.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Kart menüsü' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /^Liste:/ })).not.toBeInTheDocument();
    expect(within(dialog).getByText('Liste: Yapılacaklar')).toBeInTheDocument();
  });
});

describe('focus when the focused element goes away', () => {
  it('moves to "Kart menüsü" and announces it when the card is restored', async () => {
    const { user, serverCard } = openCard(CARD_PATH, { archivedAt: '2026-11-02T10:00:00.000Z' });
    recordPatches(serverCard);
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Geri yükle' }));

    const menu = await within(dialog).findByRole('button', { name: 'Kart menüsü' });
    expect(menu).toHaveFocus();
    expect(within(dialog).getByText('Kart geri yüklendi.')).toBeInTheDocument();
    expect(within(dialog).queryByText('Bu kart arşivde.')).not.toBeInTheDocument();
  });

  it('moves to the title when the error notice is dismissed', async () => {
    const { user } = openCard(CARD_PATH);
    server.use(http.patch(CARD_URL, () => apiError(500, 'INTERNAL_ERROR')));
    const dialog = await cardDialog();
    await user.click(within(dialog).getByRole('button', { name: 'Rapor' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Kart başlığı' }), 'x{Enter}');

    await user.click(await within(dialog).findByRole('button', { name: 'Uyarıyı kapat' }));

    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Rapor' })).toHaveFocus();
  });
});
