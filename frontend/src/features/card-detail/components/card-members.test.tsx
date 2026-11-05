import { screen, waitFor, within } from '@testing-library/react';
import type { CardDetailDto, MemberDto } from '@trello/contracts';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { CARD_PATH, CARD_URL, cardDialog, openCard } from '../../../test/card-dialog';
import { apiError, testMember, testUser } from '../../../test/fixtures';
import { server } from '../../../test/msw-server';

const AYSE = testMember({ userId: 'user-ayse', name: 'Ayşe Demir' });
const MEMBERS: MemberDto[] = [AYSE];

interface Call {
  method: string;
  userId: string;
  body: string;
}

/** PUT/DELETE /cards/:id/members/:userId like the server: the card's members change. */
function memberEndpoints(state: { card: CardDetailDto }) {
  const calls: Call[] = [];
  const handle =
    (method: string) =>
    async ({ request, params }: { request: Request; params: Record<string, unknown> }) => {
      const userId = String(params.userId);
      calls.push({ method, userId, body: await request.text() });
      const others = state.card.memberIds.filter((id) => id !== userId);
      state.card = { ...state.card, memberIds: method === 'PUT' ? [...others, userId] : others };
      return new HttpResponse(null, { status: 204 });
    };
  server.use(
    http.put(`${CARD_URL}/members/:userId`, handle('PUT')),
    http.delete(`${CARD_URL}/members/:userId`, handle('DELETE')),
  );
  return calls;
}

describe('card members', () => {
  it('ticks a member: a body-less PUT, and the member shows on the card at once', async () => {
    const { user, serverCard } = openCard(CARD_PATH, {}, [], MEMBERS);
    const calls = memberEndpoints(serverCard);
    const dialog = await cardDialog();

    const opener = within(dialog).getByRole('button', { name: 'Üyeler' });
    expect(opener).toHaveAttribute('aria-expanded', 'false');
    await user.click(opener);
    expect(opener).toHaveAttribute('aria-expanded', 'true');
    const group = within(dialog).getByRole('group', { name: 'Pano üyeleri' });
    expect(within(group).getAllByRole('checkbox')[0]).toHaveFocus();
    await user.click(within(group).getByRole('checkbox', { name: 'Ayşe Demir' }));

    const list = within(dialog).getByRole('list', { name: 'Kartın üyeleri' });
    expect(within(list).getByText('Ayşe Demir')).toBeInTheDocument();
    await waitFor(() => expect(calls).toEqual([{ method: 'PUT', userId: AYSE.userId, body: '' }]));
  });

  it('unticks a member with a DELETE', async () => {
    const { user, serverCard } = openCard(CARD_PATH, { memberIds: [AYSE.userId] }, [], MEMBERS);
    const calls = memberEndpoints(serverCard);
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Üyeler' }));
    const box = within(dialog).getByRole('checkbox', { name: 'Ayşe Demir' });
    expect(box).toBeChecked();
    await user.click(box);

    expect(box).not.toBeChecked();
    await waitFor(() =>
      expect(calls).toEqual([{ method: 'DELETE', userId: AYSE.userId, body: '' }]),
    );
    expect(within(dialog).queryByRole('list', { name: 'Kartın üyeleri' })).not.toBeInTheDocument();
  });

  it('lists the test user among the pickable board members', async () => {
    const { user } = openCard(CARD_PATH, {}, [], MEMBERS);
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Üyeler' }));

    expect(within(dialog).getByRole('checkbox', { name: testUser.name })).toBeInTheDocument();
  });

  it('undoes the change when the request fails', async () => {
    const { user } = openCard(CARD_PATH, {}, [], MEMBERS);
    server.use(
      http.put(`${CARD_URL}/members/:userId`, () => new HttpResponse(null, { status: 500 })),
    );
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Üyeler' }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'Ayşe Demir' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Üye değişikliği kaydedilemedi. Tekrar dene.',
    );
    expect(within(dialog).getByRole('checkbox', { name: 'Ayşe Demir' })).not.toBeChecked();
  });

  it('says so in the dialog when the person has left the board', async () => {
    const { user, requests } = openCard(CARD_PATH, {}, [], MEMBERS);
    server.use(http.put(`${CARD_URL}/members/:userId`, () => apiError(400, 'NOT_BOARD_MEMBER')));
    const dialog = await cardDialog();
    const fetchesBefore = requests.board;

    await user.click(within(dialog).getByRole('button', { name: 'Üyeler' }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'Ayşe Demir' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Bu kişi artık panonun üyesi değil.',
    );
    expect(within(dialog).getByRole('checkbox', { name: 'Ayşe Demir' })).not.toBeChecked();
    await waitFor(() => expect(requests.board).toBeGreaterThan(fetchesBefore));
  });

  it('does not show an id of someone who is not a board member', async () => {
    openCard(CARD_PATH, { memberIds: [AYSE.userId, 'user-gone'] }, [], MEMBERS);
    const dialog = await cardDialog();

    const list = within(dialog).getByRole('list', { name: 'Kartın üyeleri' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  });

  it('closes only the section on Escape and gives the focus back to the button', async () => {
    const { user } = openCard(CARD_PATH, {}, [], MEMBERS);
    const dialog = await cardDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Üyeler' }));
    await user.keyboard('{Escape}');

    expect(within(dialog).queryByRole('group', { name: 'Pano üyeleri' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Rapor' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Üyeler' })).toHaveFocus();
  });
});
