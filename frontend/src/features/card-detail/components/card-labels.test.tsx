import { screen, waitFor, within } from '@testing-library/react';
import type { CardDetailDto, LabelDto } from '@trello/contracts';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { CARD_PATH, CARD_URL, cardDialog, openCard } from '../../../test/card-dialog';
import { BOARD_ID, apiError } from '../../../test/fixtures';
import { server } from '../../../test/msw-server';

const RED: LabelDto = { id: 'label-red', boardId: BOARD_ID, name: 'Acil', color: 'RED' };
const GREEN: LabelDto = { id: 'label-green', boardId: BOARD_ID, name: '', color: 'GREEN' };
const LABELS = [GREEN, RED];

interface Call {
  method: string;
  labelId: string;
  body: string;
}

/** PUT/DELETE /cards/:id/labels/:labelId like the server: the card's labels change. */
function labelEndpoints(state: { card: CardDetailDto }) {
  const calls: Call[] = [];
  const handle = (method: string) => async ({ request, params }: { request: Request; params: Record<string, unknown> }) => {
    const labelId = String(params.labelId);
    calls.push({ method, labelId, body: await request.text() });
    const others = state.card.labelIds.filter((id) => id !== labelId);
    state.card = { ...state.card, labelIds: method === 'PUT' ? [...others, labelId] : others };
    return new HttpResponse(null, { status: 204 });
  };
  server.use(
    http.put(`${CARD_URL}/labels/:labelId`, handle('PUT')),
    http.delete(`${CARD_URL}/labels/:labelId`, handle('DELETE')),
  );
  return calls;
}

describe('card labels', () => {
  it('ticks a label: a body-less PUT, and the chip shows on the card and on the tile', async () => {
    const { user, serverCard } = openCard(CARD_PATH, {}, LABELS);
    const calls = labelEndpoints(serverCard);
    const dialog = await cardDialog();

    const opener = within(dialog).getByRole('button', { name: 'Etiketler' });
    expect(opener).toHaveAttribute('aria-expanded', 'false');
    await user.click(opener);
    expect(opener).toHaveAttribute('aria-expanded', 'true');
    const group = within(dialog).getByRole('group', { name: 'Etiketler' });
    expect(within(group).getAllByRole('checkbox')[0]).toHaveFocus();
    await user.click(within(group).getByRole('checkbox', { name: 'Acil' }));

    const chips = within(dialog).getByRole('list', { name: 'Kartın etiketleri' });
    expect(within(chips).getByText('Acil')).toBeInTheDocument();
    // The tile sits behind the dialog: it has its chip list too.
    expect(screen.getAllByText('Acil', { selector: 'span' }).length).toBeGreaterThan(1);
    await waitFor(() => expect(calls).toEqual([{ method: 'PUT', labelId: RED.id, body: '' }]));
  });

  it('unticks a label with a DELETE', async () => {
    const { user, serverCard } = openCard(CARD_PATH, { labelIds: [RED.id] }, LABELS);
    const calls = labelEndpoints(serverCard);
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Etiketler' }));
    const box = within(dialog).getByRole('checkbox', { name: 'Acil' });
    expect(box).toBeChecked();
    await user.click(box);

    expect(box).not.toBeChecked();
    await waitFor(() => expect(calls).toEqual([{ method: 'DELETE', labelId: RED.id, body: '' }]));
    expect(within(dialog).queryByRole('list', { name: 'Kartın etiketleri' })).not.toBeInTheDocument();
  });

  it('names a nameless label by its color', async () => {
    const { user } = openCard(CARD_PATH, {}, LABELS);
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Etiketler' }));

    expect(within(dialog).getByRole('checkbox', { name: 'Yeşil etiket' })).toBeInTheDocument();
  });

  it('undoes the change and says so in the dialog when the label is gone', async () => {
    const { user, requests } = openCard(CARD_PATH, {}, LABELS);
    server.use(http.put(`${CARD_URL}/labels/:labelId`, () => apiError(400, 'LABEL_NOT_IN_BOARD')));
    const dialog = await cardDialog();
    const fetchesBefore = requests.board;

    await user.click(within(dialog).getByRole('button', { name: 'Etiketler' }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'Acil' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Etiket bulunamadı, silinmiş olabilir.',
    );
    expect(within(dialog).getByRole('checkbox', { name: 'Acil' })).not.toBeChecked();
    await waitFor(() => expect(requests.board).toBeGreaterThan(fetchesBefore));
  });

  it('does not show an id of a deleted label', async () => {
    openCard(CARD_PATH, { labelIds: [RED.id, 'label-deleted'] }, LABELS);
    const dialog = await cardDialog();

    const chips = within(dialog).getByRole('list', { name: 'Kartın etiketleri' });
    expect(within(chips).getAllByRole('listitem')).toHaveLength(1);
  });

  it('switches to managing the board labels and back, and Escape closes only the section', async () => {
    const { user } = openCard(CARD_PATH, {}, LABELS);
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Etiketler' }));
    await user.click(within(dialog).getByRole('button', { name: 'Etiketleri düzenle' }));
    expect(
      within(dialog).getByRole('button', { name: '“Acil” etiketini düzenle' }),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Etiketleri seç' }));
    expect(within(dialog).getByRole('group', { name: 'Etiketler' })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(within(dialog).queryByRole('group', { name: 'Etiketler' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Rapor' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Etiketler' })).toHaveFocus();
  });
});
