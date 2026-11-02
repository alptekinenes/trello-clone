import { screen, waitFor, within } from '@testing-library/react';
import type { BoardDetailDto } from '@trello/contracts';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiError, boardSummary, testMember, testUser } from '../../../test/fixtures';
import {
  AYSE,
  BORA,
  CEM,
  asRole,
  memberList,
  memberUrl,
  openMembers,
  rowOf,
} from '../../../test/members-dialog';
import { server } from '../../../test/msw-server';

describe('members dialog: viewing', () => {
  it('lists everyone with email and role, marking the current user', async () => {
    const { dialog } = await openMembers(asRole('OWNER', [AYSE, { ...BORA, role: 'ADMIN' }]));

    const rows = within(memberList(dialog)).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText(testUser.name)).toBeInTheDocument();
    expect(within(rows[0]).getByText('(sen)')).toBeInTheDocument();
    expect(within(rows[0]).getByText(testUser.email)).toBeInTheDocument();
    expect(within(rows[0]).getByText('Sahip')).toBeInTheDocument();
    expect(within(rowOf(dialog, BORA.name)).getByRole('combobox')).toHaveValue('ADMIN');
    expect(within(rowOf(dialog, AYSE.name)).getByRole('combobox')).toHaveValue('MEMBER');
  });

  it('closes the way the browser closes a dialog on Escape', async () => {
    const { dialog } = await openMembers(asRole('OWNER', [AYSE]));

    // jsdom has no Escape handling for <dialog>; the browser calls close() on it.
    (dialog as HTMLDialogElement).close();

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closes with its Kapat button', async () => {
    const { user, dialog } = await openMembers(asRole('OWNER', [AYSE]));

    await user.click(within(dialog).getByRole('button', { name: 'Kapat' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows a MEMBER the list, a way to leave and nothing to manage', async () => {
    const owner = testMember({ userId: 'u-owner', name: 'Sahip Kişi', role: 'OWNER' });
    // The fixture's own user is the member; the other two are above and beside them.
    const { dialog, state } = await openMembers(asRole('MEMBER', [owner, AYSE]));

    expect(within(dialog).queryByRole('combobox')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /çıkar/ })).not.toBeInTheDocument();
    expect(within(rowOf(dialog, testUser.name)).getByRole('button', { name: 'Panodan ayrıl' })).toBeInTheDocument();
    expect(within(rowOf(dialog, owner.name)).getByText('Sahip')).toBeInTheDocument();
    expect(within(rowOf(dialog, AYSE.name)).getByText('Üye')).toBeInTheDocument();
    expect(within(dialog).queryByRole('heading', { name: 'Davet et' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('heading', { name: 'Bekleyen davetler' })).not.toBeInTheDocument();
    expect(state.invitationRequests).toBe(0);
  });

  it('shows an ADMIN "Çıkar" on members only, and no role selects', async () => {
    const owner = testMember({ userId: 'u-owner', name: 'Sahip Kişi', role: 'OWNER' });
    const otherAdmin = testMember({ userId: 'u-admin', name: 'Dilek Admin', role: 'ADMIN' });
    const { dialog } = await openMembers(asRole('ADMIN', [owner, otherAdmin, AYSE]));

    expect(within(dialog).queryByRole('combobox')).not.toBeInTheDocument();
    expect(within(dialog).getAllByRole('button', { name: /panodan çıkar$/ })).toHaveLength(1);
    expect(
      within(rowOf(dialog, AYSE.name)).getByRole('button', { name: 'Ayşe Demir kişisini panodan çıkar' }),
    ).toBeInTheDocument();
    expect(within(rowOf(dialog, otherAdmin.name)).queryByRole('button')).not.toBeInTheDocument();
    expect(within(rowOf(dialog, owner.name)).queryByRole('button')).not.toBeInTheDocument();
    expect(within(rowOf(dialog, testUser.name)).getByRole('button', { name: 'Panodan ayrıl' })).toBeInTheDocument();
  });

  it('gives the OWNER role selects for others, "Çıkar" for all of them, and no way to leave', async () => {
    const { dialog } = await openMembers(asRole('OWNER', [AYSE, { ...BORA, role: 'ADMIN' }]));

    expect(within(memberList(dialog)).getAllByRole('combobox')).toHaveLength(2);
    expect(within(dialog).getAllByRole('button', { name: /panodan çıkar$/ })).toHaveLength(2);
    expect(within(dialog).queryByRole('button', { name: 'Panodan ayrıl' })).not.toBeInTheDocument();
    const own = rowOf(dialog, testUser.name);
    expect(within(own).queryByRole('combobox')).not.toBeInTheDocument();
    expect(within(own).queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('members dialog: changing a role', () => {
  it('sends the role and shows it at once', async () => {
    let body: unknown;
    let release: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { user, dialog, state } = await openMembers(asRole('OWNER', [AYSE]));
    server.use(
      http.patch(memberUrl(AYSE.userId), async ({ request }) => {
        body = await request.json();
        await answered;
        state.detail = asRole('OWNER', [{ ...AYSE, role: 'ADMIN' }]);
        return HttpResponse.json({ ...AYSE, role: 'ADMIN' });
      }),
    );
    const select = within(dialog).getByRole('combobox', { name: 'Ayşe Demir rolü' });

    await user.selectOptions(select, 'ADMIN');

    await waitFor(() => expect(select).toHaveValue('ADMIN'));
    release();
    expect(await within(dialog).findByText('Ayşe Demir artık Yönetici.')).toBeInTheDocument();
    expect(body).toEqual({ role: 'ADMIN' });
    expect(select).toHaveFocus();
  });

  it('goes back to the old role and says so when the request fails', async () => {
    const { user, dialog } = await openMembers(asRole('OWNER', [AYSE]));
    server.use(http.patch(memberUrl(AYSE.userId), () => apiError(500, 'INTERNAL_ERROR')));
    const select = within(dialog).getByRole('combobox', { name: 'Ayşe Demir rolü' });

    await user.selectOptions(select, 'ADMIN');

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Sunucuya şu an ulaşılamıyor');
    await waitFor(() => expect(select).toHaveValue('MEMBER'));
  });
});

describe('members dialog: removing a member', () => {
  function removalServer(state: { detail: BoardDetailDto }, userId: string) {
    server.use(
      http.delete(memberUrl(userId), () => {
        state.detail = {
          ...state.detail,
          members: state.detail.members.filter((member) => member.userId !== userId),
        };
        return new HttpResponse(null, { status: 204 });
      }),
    );
  }

  it('asks first, then removes the row and the avatar and moves on to the next "Çıkar"', async () => {
    const { user, dialog, state } = await openMembers(asRole('OWNER', [AYSE, BORA, CEM]));
    removalServer(state, AYSE.userId);
    expect(screen.getByRole('list', { name: 'Pano üyeleri' })).toHaveTextContent(AYSE.name);

    await user.click(within(dialog).getByRole('button', { name: 'Ayşe Demir kişisini panodan çıkar' }));
    const confirm = await screen.findByRole('dialog', { name: 'Üye çıkarılsın mı?' });
    expect(confirm).toHaveTextContent(
      'Ayşe Demir panodan çıkarılacak. Tekrar erişmesi için yeniden davet edilmesi gerekir.',
    );
    await user.click(within(confirm).getByRole('button', { name: 'Çıkar' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Üye çıkarılsın mı?' })).not.toBeInTheDocument());
    await waitFor(() => expect(within(memberList(dialog)).queryByText(AYSE.name)).not.toBeInTheDocument());
    expect(within(dialog).getByText('Ayşe Demir panodan çıkarıldı.')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Pano üyeleri' })).not.toHaveTextContent(AYSE.name);
    expect(within(dialog).getByRole('button', { name: 'Bora Kaya kişisini panodan çıkar' })).toHaveFocus();
  });

  it('puts the focus on the heading when the last row went away', async () => {
    const { user, dialog, state } = await openMembers(asRole('OWNER', [AYSE, BORA]));
    removalServer(state, BORA.userId);

    await user.click(within(dialog).getByRole('button', { name: 'Bora Kaya kişisini panodan çıkar' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Üye çıkarılsın mı?' })).getByRole('button', {
        name: 'Çıkar',
      }),
    );

    await waitFor(() => expect(within(memberList(dialog)).queryByText(BORA.name)).not.toBeInTheDocument());
    expect(within(dialog).getByRole('heading', { name: 'Üyeler' })).toHaveFocus();
  });

  it('keeps the member and explains when the server refuses', async () => {
    const { user, dialog } = await openMembers(asRole('OWNER', [AYSE]));
    server.use(http.delete(memberUrl(AYSE.userId), () => apiError(403, 'FORBIDDEN')));

    await user.click(within(dialog).getByRole('button', { name: 'Ayşe Demir kişisini panodan çıkar' }));
    const confirm = await screen.findByRole('dialog', { name: 'Üye çıkarılsın mı?' });
    await user.click(within(confirm).getByRole('button', { name: 'Çıkar' }));

    expect(await within(confirm).findByRole('alert')).toHaveTextContent('Bu işlem için yetkin yok.');
    expect(within(memberList(dialog)).getByText(AYSE.name)).toBeInTheDocument();
  });

  it('changes nothing when the user backs out', async () => {
    let deleted = false;
    const { user, dialog } = await openMembers(asRole('OWNER', [AYSE]));
    server.use(
      http.delete(memberUrl(AYSE.userId), () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await user.click(within(dialog).getByRole('button', { name: 'Ayşe Demir kişisini panodan çıkar' }));
    await user.click(await screen.findByRole('button', { name: 'Vazgeç' }));

    expect(screen.queryByRole('dialog', { name: 'Üye çıkarılsın mı?' })).not.toBeInTheDocument();
    expect(within(memberList(dialog)).getByText(AYSE.name)).toBeInTheDocument();
    expect(deleted).toBe(false);
  });
});

describe('members dialog: leaving the board', () => {
  it('asks, removes the user, goes to the boards and says so', async () => {
    const owner = testMember({ userId: 'u-owner', name: 'Sahip Kişi', role: 'OWNER' });
    const { user, dialog, router } = await openMembers(asRole('MEMBER', [owner]));
    let left = false;
    server.use(
      http.delete(memberUrl(testUser.id), () => {
        left = true;
        return new HttpResponse(null, { status: 204 });
      }),
      http.get('*/api/v1/boards', () => HttpResponse.json([boardSummary({ id: 'other', title: 'Başka' })])),
    );

    await user.click(within(rowOf(dialog, testUser.name)).getByRole('button', { name: 'Panodan ayrıl' }));
    const confirm = await screen.findByRole('dialog', { name: 'Panodan ayrılınsın mı?' });
    expect(confirm).toHaveTextContent(
      'Yol haritası panosundan ayrılacaksın. Tekrar katılmak için yeniden davet edilmen gerekir.',
    );
    await user.click(within(confirm).getByRole('button', { name: 'Panodan ayrıl' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Panolarım' })).toBeInTheDocument();
    expect(left).toBe(true);
    expect(router.state.location.pathname).toBe('/boards');
    expect(screen.getByText('“Yol haritası” panosundan ayrıldın.')).toBeInTheDocument();
    expect(screen.queryByText('Yol haritası')).not.toBeInTheDocument();
    expect(await screen.findByText('Başka')).toBeInTheDocument();
  });
});
