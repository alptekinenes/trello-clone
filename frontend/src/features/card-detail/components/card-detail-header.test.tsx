import { screen, waitFor, within } from '@testing-library/react';
import type { MoveCardRequest } from '@trello/contracts';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { CARD_ID, CARD_PATH, BOARD_URL, cardDialog, openCard } from '../../../test/card-dialog';
import { apiError, boardDetail, testCard, testLists } from '../../../test/fixtures';
import { server } from '../../../test/msw-server';

const [TODO, DONE] = testLists('Yapılacaklar', 'Bitti');
const MOVE_URL = `*/api/v1/cards/${CARD_ID}/move`;

/** A board of two lists; the card is in `placed.listId`, one other card is in "Bitti". */
function openOnTwoLists() {
  const placed = { listId: TODO.id, boardFetches: 0 };
  const view = openCard(CARD_PATH);
  server.use(
    http.get(BOARD_URL, () => {
      placed.boardFetches += 1;
      return HttpResponse.json(
        boardDetail(
          'OWNER',
          'Pano',
          [TODO, DONE],
          [
            testCard({ id: CARD_ID, listId: placed.listId, title: 'Rapor' }),
            testCard({ id: 'other', listId: DONE.id, title: 'Eski', position: 1024 }),
          ],
        ),
      );
    }),
  );
  return { ...view, placed };
}

async function pick(
  user: ReturnType<typeof openCard>['user'],
  dialog: HTMLElement,
  list: string,
) {
  await user.click(within(dialog).getByRole('button', { name: /^Liste:/ }));
  await user.click(within(dialog).getByRole('menuitemradio', { name: list }));
}

describe('list selector', () => {
  it('lists the lists, marks the current one and opens on it', async () => {
    const { user } = openOnTwoLists();
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Liste: Yapılacaklar' }));

    const menu = within(dialog).getByRole('menu', { name: 'Kartı taşı' });
    expect(within(menu).getByRole('menuitemradio', { name: 'Yapılacaklar' })).toBeChecked();
    expect(within(menu).getByRole('menuitemradio', { name: 'Bitti' })).not.toBeChecked();
    expect(within(menu).getByRole('menuitemradio', { name: 'Yapılacaklar' })).toHaveFocus();
  });

  it('moves the card to the end of the chosen list, says so and keeps the focus on the selector', async () => {
    const { user, placed } = openOnTwoLists();
    let sent: MoveCardRequest | null = null;
    server.use(
      http.post(MOVE_URL, async ({ request }) => {
        sent = (await request.json()) as MoveCardRequest;
        placed.listId = DONE.id;
        return HttpResponse.json({ id: CARD_ID, listId: DONE.id, position: 2048, rebalanced: null });
      }),
    );
    const dialog = await cardDialog();

    await pick(user, dialog, 'Bitti');

    expect(await within(dialog).findByRole('button', { name: 'Liste: Bitti' })).toHaveFocus();
    expect(within(dialog).getByText('Kart “Bitti” listesine taşındı.')).toBeInTheDocument();
    await waitFor(() => expect(sent).toEqual({ listId: DONE.id, afterCardId: 'other', beforeCardId: null }));
  });

  it('does nothing when the current list is chosen', async () => {
    const { user } = openOnTwoLists();
    let requests = 0;
    server.use(
      http.post(MOVE_URL, () => {
        requests += 1;
        return HttpResponse.json({});
      }),
    );
    const dialog = await cardDialog();

    await pick(user, dialog, 'Yapılacaklar');

    expect(within(dialog).getByRole('button', { name: 'Liste: Yapılacaklar' })).toHaveFocus();
    await delay(50);
    expect(requests).toBe(0);
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('puts the card back and tells the user in the dialog when the move fails', async () => {
    const { user } = openOnTwoLists();
    server.use(http.post(MOVE_URL, () => apiError(500, 'INTERNAL_ERROR')));
    const dialog = await cardDialog();

    await pick(user, dialog, 'Bitti');

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Kart taşınamadı. Tekrar dene.');
    expect(within(dialog).getByRole('button', { name: 'Liste: Yapılacaklar' })).toBeInTheDocument();
  });

  it('puts the card back, reloads the board and says why on a conflict (409)', async () => {
    const { user, placed } = openOnTwoLists();
    server.use(http.post(MOVE_URL, () => apiError(409, 'POSITION_CONFLICT')));
    const dialog = await cardDialog();
    const before = placed.boardFetches;

    await pick(user, dialog, 'Bitti');

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/başka biri tarafından/);
    expect(within(dialog).getByRole('button', { name: 'Liste: Yapılacaklar' })).toBeInTheDocument();
    await waitFor(() => expect(placed.boardFetches).toBeGreaterThan(before));
  });

  it('closes on Escape without closing the dialog and gives the focus back', async () => {
    const { user, router } = openOnTwoLists();
    const dialog = await cardDialog();
    await user.click(within(dialog).getByRole('button', { name: 'Liste: Yapılacaklar' }));

    await user.keyboard('{Escape}');

    expect(within(dialog).queryByRole('menu')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Liste: Yapılacaklar' })).toHaveFocus();
    expect(screen.getByRole('dialog', { name: 'Rapor' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(CARD_PATH);
  });
});

describe('card menu', () => {
  it('holds the archive action', async () => {
    const { user } = openOnTwoLists();
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Kart menüsü' }));

    const menu = within(dialog).getByRole('menu', { name: 'Kart menüsü' });
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Arşivle']);
    expect(within(menu).getByRole('menuitem', { name: 'Arşivle' })).toHaveFocus();
  });

  it('is reachable with the keyboard and closes on Escape with the focus back on it', async () => {
    const { user } = openOnTwoLists();
    const dialog = await cardDialog();
    const trigger = within(dialog).getByRole('button', { name: 'Kart menüsü' });
    trigger.focus();

    await user.keyboard('{ArrowDown}');
    expect(within(dialog).getByRole('menuitem', { name: 'Arşivle' })).toHaveFocus();
    await user.keyboard('{Escape}');

    expect(within(dialog).queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(screen.getByRole('dialog', { name: 'Rapor' })).toBeInTheDocument();
  });
});
