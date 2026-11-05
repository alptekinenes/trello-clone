import { waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { BOARD_URL, CARD_ID, CARD_PATH, CARD_URL, LIST, cardDialog, openCard } from '../../../test/card-dialog';
import { apiError, boardDetail, testCard } from '../../../test/fixtures';
import { server } from '../../../test/msw-server';

const WATCH_URL = `${CARD_URL}/watch`;

/** The board as the server has it for this user: the watched ids change with the PUT and DELETE. */
function watchEndpoints(initial: string[]) {
  const state = { watched: initial, calls: [] as string[], boardFetches: 0 };
  server.use(
    http.get(BOARD_URL, () => {
      state.boardFetches += 1;
      return HttpResponse.json({
        ...boardDetail('OWNER', 'Pano', [LIST], [testCard({ id: CARD_ID, listId: LIST.id, title: 'Rapor' })]),
        myWatchedCardIds: state.watched,
      });
    }),
    http.put(WATCH_URL, () => {
      state.calls.push('PUT');
      state.watched = [CARD_ID];
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete(WATCH_URL, () => {
      state.calls.push('DELETE');
      state.watched = [];
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return state;
}

describe('watching a card', () => {
  it('starts watching: pressed at once, a body-less PUT', async () => {
    const { user } = openCard(CARD_PATH);
    const state = watchEndpoints([]);
    const dialog = await cardDialog();

    const button = within(dialog).getByRole('button', { name: 'Kartı izle' });
    expect(button).toHaveTextContent('Kartı izle');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await user.click(button);

    expect(button).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(state.calls).toEqual(['PUT']));
  });

  it('stops watching with a DELETE', async () => {
    const { user } = openCard(CARD_PATH);
    const state = watchEndpoints([CARD_ID]);
    const dialog = await cardDialog();

    const button = within(dialog).getByRole('button', { name: 'Kartı izle' });
    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'true'));
    await user.click(button);

    expect(button).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() => expect(state.calls).toEqual(['DELETE']));
  });

  it('puts the button back and says so in the dialog when it fails', async () => {
    const { user } = openCard(CARD_PATH);
    watchEndpoints([]);
    server.use(http.put(WATCH_URL, () => apiError(500, 'INTERNAL_ERROR')));
    const dialog = await cardDialog();

    const button = within(dialog).getByRole('button', { name: 'Kartı izle' });
    await user.click(button);

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'İzleme değişikliği kaydedilemedi. Tekrar dene.',
    );
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('refetches the board once the change has settled', async () => {
    const { user } = openCard(CARD_PATH);
    const state = watchEndpoints([]);
    const dialog = await cardDialog();
    const before = state.boardFetches;

    await user.click(within(dialog).getByRole('button', { name: 'Kartı izle' }));

    await waitFor(() => expect(state.boardFetches).toBeGreaterThan(before));
  });

  it('is there for an archived card too', async () => {
    openCard(CARD_PATH, { archivedAt: '2026-11-04T09:00:00.000Z' });
    const dialog = await cardDialog();

    expect(within(dialog).getByRole('button', { name: 'Kartı izle' })).toBeInTheDocument();
  });
});
