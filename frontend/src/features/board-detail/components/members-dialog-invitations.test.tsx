import { screen, waitFor, within } from '@testing-library/react';
import type { CreateInvitationRequest, CreateInvitationResponse } from '@trello/contracts';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { apiError } from '../../../test/fixtures';
import {
  AYSE,
  BORA,
  INVITATIONS_URL,
  asRole,
  openMembers,
  rowOf,
  testInvitation,
} from '../../../test/members-dialog';
import { server } from '../../../test/msw-server';

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
afterEach(() => {
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
  else Reflect.deleteProperty(navigator, 'clipboard');
});

const INVITE_URL = `http://localhost:5173/invitations/${'a'.repeat(43)}`;

/** A POST handler that records what was sent and answers with `respond`. */
function inviteHandler(respond: (body: CreateInvitationRequest) => Response | CreateInvitationResponse) {
  const sent: CreateInvitationRequest[] = [];
  server.use(
    http.post(INVITATIONS_URL, async ({ request }) => {
      const body = (await request.json()) as CreateInvitationRequest;
      sent.push(body);
      const answer = respond(body);
      return answer instanceof Response ? answer : HttpResponse.json(answer, { status: 201 });
    }),
  );
  return sent;
}

const createdFor = (email: string, role: 'ADMIN' | 'MEMBER' = 'MEMBER'): CreateInvitationResponse => ({
  result: 'INVITATION_CREATED',
  invitation: testInvitation({ id: 'inv-new', email, role }),
  inviteUrl: INVITE_URL,
});

describe('members dialog: who may invite', () => {
  it('lets an ADMIN invite members only: no role field, and "MEMBER" is sent', async () => {
    const { user, dialog } = await openMembers(asRole('ADMIN', []));
    const sent = inviteHandler((body) => createdFor(body.email));

    expect(within(dialog).queryByRole('combobox', { name: 'Rol' })).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('E-posta'), 'yeni@example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Davet et' }));

    await within(dialog).findByLabelText('Davet bağlantısı');
    expect(sent).toEqual([{ email: 'yeni@example.com', role: 'MEMBER' }]);
  });

  it('lets the OWNER pick the role', async () => {
    const { user, dialog } = await openMembers(asRole('OWNER', []));
    const sent = inviteHandler((body) => createdFor(body.email, body.role));

    await user.type(within(dialog).getByLabelText('E-posta'), 'yeni@example.com');
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Rol' }), 'ADMIN');
    await user.click(within(dialog).getByRole('button', { name: 'Davet et' }));

    await within(dialog).findByLabelText('Davet bağlantısı');
    expect(sent).toEqual([{ email: 'yeni@example.com', role: 'ADMIN' }]);
  });
});

describe('members dialog: inviting', () => {
  it('checks the address on the client and sends nothing', async () => {
    const { user, dialog } = await openMembers(asRole('OWNER', []));
    const sent = inviteHandler((body) => createdFor(body.email));
    const email = within(dialog).getByLabelText('E-posta');

    await user.click(within(dialog).getByRole('button', { name: 'Davet et' }));
    expect(await within(dialog).findByText('E-posta adresini gir.')).toBeInTheDocument();
    await user.type(email, 'bu-bir-adres-degil');
    await user.click(within(dialog).getByRole('button', { name: 'Davet et' }));

    expect(await within(dialog).findByText('Geçerli bir e-posta adresi gir.')).toBeInTheDocument();
    expect(email).toHaveAccessibleDescription('Geçerli bir e-posta adresi gir.');
    expect(sent).toEqual([]);
  });

  it('adds a registered person at once: member row, avatar, status, empty field, focus', async () => {
    const { user, dialog, state } = await openMembers(asRole('OWNER', []));
    inviteHandler(() => {
      state.detail = asRole('OWNER', [AYSE]);
      return { result: 'MEMBER_ADDED', member: AYSE };
    });
    const email = within(dialog).getByLabelText('E-posta');

    await user.type(email, 'ayse.d@example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Davet et' }));

    expect(await within(dialog).findByText('Ayşe Demir panoya eklendi.')).toBeInTheDocument();
    expect(within(dialog).getByRole('status')).toHaveTextContent('Ayşe Demir panoya eklendi.');
    expect(rowOf(dialog, AYSE.name)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Pano üyeleri' })).toHaveTextContent(AYSE.name);
    expect(email).toHaveValue('');
    expect(email).toHaveFocus();
    expect(within(dialog).queryByLabelText('Davet bağlantısı')).not.toBeInTheDocument();
  });

  it('takes the accepted invitation of a registered person off the pending list', async () => {
    const { user, dialog, state } = await openMembers(asRole('OWNER', []), [
      testInvitation({ id: 'inv-ayse', email: 'ayse.d@example.com' }),
      testInvitation({ id: 'inv-other', email: 'baska@example.com' }),
    ]);
    inviteHandler(() => {
      state.detail = asRole('OWNER', [AYSE]);
      state.invitations = [testInvitation({ id: 'inv-other', email: 'baska@example.com' })];
      return { result: 'MEMBER_ADDED', member: AYSE };
    });
    expect(await within(dialog).findByText('ayse.d@example.com')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('E-posta'), ' Ayse.D@Example.com ');
    await user.click(within(dialog).getByRole('button', { name: 'Davet et' }));

    await waitFor(() => expect(within(dialog).queryByText('ayse.d@example.com')).not.toBeInTheDocument());
    expect(within(dialog).getByText('baska@example.com')).toBeInTheDocument();
  });

  it('shows the link of an unregistered address, copies it and puts the invitation on top', async () => {
    const { user, dialog, state } = await openMembers(asRole('OWNER', []), [
      testInvitation({ id: 'inv-old', email: 'eski@example.com' }),
    ]);
    inviteHandler((body) => {
      const created = createdFor(body.email);
      if (created.result === 'INVITATION_CREATED') {
        state.invitations = [created.invitation, ...state.invitations];
      }
      return created;
    });
    expect(await within(dialog).findByText('eski@example.com')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('E-posta'), 'yeni@example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Davet et' }));

    const link = await within(dialog).findByLabelText('Davet bağlantısı');
    expect(link).toHaveValue(INVITE_URL);
    expect(link).toHaveAttribute('readonly');
    expect(link).toHaveAccessibleDescription(/Bağlantıyı yalnızca davet ettiğin kişiyle paylaş\. Bağlantı 7 gün geçerli ve yalnızca yeni@example\.com adresiyle/);
    expect(within(dialog).getByText('yeni@example.com için davet bağlantısı')).toBeInTheDocument();
    const copy = within(dialog).getByRole('button', { name: 'Bağlantıyı kopyala' });
    expect(copy).toHaveFocus();
    expect(within(dialog).getByLabelText('E-posta')).toHaveValue('');

    await user.click(copy);

    expect(await navigator.clipboard.readText()).toBe(INVITE_URL);
    expect(await within(dialog).findByText('Bağlantı kopyalandı.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Bağlantıyı kopyala' })).toBeInTheDocument();
    const pending = within(dialog).getByRole('list', { name: 'Bekleyen davetler' });
    const emails = within(pending)
      .getAllByRole('listitem')
      .map((item) => item.querySelector('p')?.textContent);
    expect(emails).toEqual(['yeni@example.com', 'eski@example.com']);
  });

  it('selects the link and says to copy by hand when the clipboard is refused', async () => {
    const { user, dialog } = await openMembers(asRole('OWNER', []));
    inviteHandler((body) => createdFor(body.email));
    await user.type(within(dialog).getByLabelText('E-posta'), 'yeni@example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Davet et' }));
    await within(dialog).findByLabelText('Davet bağlantısı');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) },
    });

    await user.click(within(dialog).getByRole('button', { name: 'Bağlantıyı kopyala' }));

    expect(
      await within(dialog).findByText('Kopyalanamadı. Bağlantıyı seçip elle kopyala.'),
    ).toBeInTheDocument();
    expect(document.activeElement).toBe(within(dialog).getByLabelText('Davet bağlantısı'));
  });

  it('says on the email field that the person is a member already', async () => {
    const { user, dialog } = await openMembers(asRole('OWNER', [AYSE]));
    inviteHandler(() => apiError(409, 'ALREADY_MEMBER'));
    const email = within(dialog).getByLabelText('E-posta');

    await user.type(email, 'ayse.d@example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Davet et' }));

    expect(await within(dialog).findByText('Bu kişi zaten panonun üyesi.')).toBeInTheDocument();
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('Bu kişi zaten panonun üyesi.');
  });

  it('shows any other refusal as an alert and keeps the address', async () => {
    const { user, dialog } = await openMembers(asRole('OWNER', []));
    inviteHandler(() => apiError(429, 'TOO_MANY_REQUESTS'));
    const email = within(dialog).getByLabelText('E-posta');

    await user.type(email, 'yeni@example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Davet et' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Çok fazla istek gönderildi.');
    expect(email).toHaveValue('yeni@example.com');
  });
});

describe('members dialog: status region', () => {
  it('reads the same message out again by replacing its content', async () => {
    const { user, dialog } = await openMembers(asRole('OWNER', []));
    inviteHandler((body) => createdFor(body.email));
    await user.type(within(dialog).getByLabelText('E-posta'), 'yeni@example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Davet et' }));
    await within(dialog).findByLabelText('Davet bağlantısı');
    const copy = within(dialog).getByRole('button', { name: 'Bağlantıyı kopyala' });

    await user.click(copy);
    const first = await within(dialog).findByText('Bağlantı kopyalandı.');
    await user.click(copy);

    await waitFor(() => expect(within(dialog).getByText('Bağlantı kopyalandı.')).not.toBe(first));
    expect(within(dialog).getByRole('status')).toHaveTextContent('Bağlantı kopyalandı.');
  });

  it('says in the region, to screen readers only, that the invitations are loading', async () => {
    let open: () => void = () => undefined;
    const invitationsGate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const { dialog } = await openMembers(asRole('OWNER', []), [testInvitation()], { invitationsGate });
    const status = within(dialog).getByRole('status');

    expect(status).toHaveTextContent('Bekleyen davetler yükleniyor…');
    expect(status).toHaveClass('sr-only');
    open();

    await within(dialog).findByText('davetli@example.com');
    expect(status).toBeEmptyDOMElement();
  });
});

describe('members dialog: pending invitations', () => {
  it('says it is loading, then shows who, which role, until when and from whom', async () => {
    let open: () => void = () => undefined;
    const invitationsGate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const { dialog } = await openMembers(
      asRole('OWNER', []),
      [testInvitation({ role: 'ADMIN', invitedBy: { userId: 'u-x', name: 'Ali Demir' } })],
      { invitationsGate },
    );
    expect(within(dialog).getByText('Davetler yükleniyor…')).toBeInTheDocument();
    open();

    const list = await within(dialog).findByRole('list', { name: 'Bekleyen davetler' });
    const row = within(list).getByRole('listitem');
    expect(row).toHaveTextContent('davetli@example.com');
    expect(row).toHaveTextContent('Yönetici');
    expect(row).toHaveTextContent(/Son geçerlilik: 9 Kasım 2026/);
    expect(row).toHaveTextContent('Davet eden: Ali Demir');
  });

  it('shows an admin the invitations of admins without a way to renew or revoke them', async () => {
    const { dialog } = await openMembers(asRole('ADMIN', []), [
      testInvitation({ id: 'inv-m', email: 'uye@example.com', role: 'MEMBER' }),
      testInvitation({ id: 'inv-a', email: 'yonetici@example.com', role: 'ADMIN' }),
    ]);

    const rows = within(await within(dialog).findByRole('list', { name: 'Bekleyen davetler' })).getAllByRole('listitem');

    expect(within(rows[0]).getByRole('button', { name: 'uye@example.com için yeni bağlantı oluştur' })).toBeInTheDocument();
    expect(within(rows[0]).getByRole('button', { name: 'İptal et: uye@example.com daveti' })).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent('yonetici@example.com');
    expect(rows[1]).toHaveTextContent('Yönetici');
    expect(rows[1]).toHaveTextContent('Yalnızca pano sahibi yönetebilir.');
    expect(within(rows[1]).queryByRole('button')).not.toBeInTheDocument();
  });

  it('gives the owner the buttons for the invitations of admins too', async () => {
    const { dialog } = await openMembers(asRole('OWNER', []), [
      testInvitation({ id: 'inv-a', email: 'yonetici@example.com', role: 'ADMIN' }),
    ]);

    expect(
      await within(dialog).findByRole('button', { name: 'yonetici@example.com için yeni bağlantı oluştur' }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'İptal et: yonetici@example.com daveti' })).toBeInTheDocument();
    expect(within(dialog).queryByText('Yalnızca pano sahibi yönetebilir.')).not.toBeInTheDocument();
  });

  it('says so when there is none', async () => {
    const { dialog } = await openMembers(asRole('ADMIN', []));

    expect(await within(dialog).findByText('Bekleyen davet yok.')).toBeInTheDocument();
  });

  it('shows a failed load with a retry that works', async () => {
    const { user, dialog, state } = await openMembers(asRole('OWNER', []), [], { invitationsFail: true });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Sunucuya şu an ulaşılamıyor');
    state.invitationsFail = false;
    state.invitations = [testInvitation()];

    await user.click(within(dialog).getByRole('button', { name: 'Tekrar dene' }));

    expect(await within(dialog).findByText('davetli@example.com')).toBeInTheDocument();
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('takes the invitation off the list at once and keeps it gone', async () => {
    let release: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { user, dialog, state } = await openMembers(asRole('OWNER', []), [
      testInvitation({ id: 'inv-1', email: 'bir@example.com' }),
      testInvitation({ id: 'inv-2', email: 'iki@example.com' }),
    ]);
    server.use(
      http.delete(`${INVITATIONS_URL}/inv-1`, async () => {
        await answered;
        state.invitations = state.invitations.filter((item) => item.id !== 'inv-1');
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await within(dialog).findByText('bir@example.com');

    await user.click(within(dialog).getByRole('button', { name: 'İptal et: bir@example.com daveti' }));

    await waitFor(() => expect(within(dialog).queryByText('bir@example.com')).not.toBeInTheDocument());
    expect(within(dialog).getByRole('button', { name: 'İptal et: iki@example.com daveti' })).toHaveFocus();
    release();
    expect(await within(dialog).findByText('Davet iptal edildi.')).toBeInTheDocument();
    expect(within(dialog).queryByText('bir@example.com')).not.toBeInTheDocument();
  });

  it('puts the focus on the heading when the last invitation went away', async () => {
    const { user, dialog, state } = await openMembers(asRole('OWNER', []), [
      testInvitation({ id: 'inv-1', email: 'bir@example.com' }),
    ]);
    server.use(
      http.delete(`${INVITATIONS_URL}/inv-1`, () => {
        state.invitations = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await user.click(await within(dialog).findByRole('button', { name: 'İptal et: bir@example.com daveti' }));

    expect(await within(dialog).findByText('Bekleyen davet yok.')).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'Bekleyen davetler' })).toHaveFocus();
  });

  it('brings the invitation back and says so when revoking fails', async () => {
    const { user, dialog } = await openMembers(asRole('OWNER', []), [testInvitation({ id: 'inv-1' })]);
    server.use(http.delete(`${INVITATIONS_URL}/inv-1`, () => apiError(500, 'INTERNAL_ERROR')));

    await user.click(await within(dialog).findByRole('button', { name: 'İptal et: davetli@example.com daveti' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Sunucuya şu an ulaşılamıyor');
    expect(await within(dialog).findByText('davetli@example.com')).toBeInTheDocument();
  });

  it('says it was accepted meanwhile and refreshes the board with its new member', async () => {
    const { user, dialog, state } = await openMembers(asRole('OWNER', []), [
      testInvitation({ id: 'inv-1', email: 'bora@example.com' }),
    ]);
    server.use(
      http.delete(`${INVITATIONS_URL}/inv-1`, () => {
        state.detail = asRole('OWNER', [BORA]);
        state.invitations = [];
        return apiError(409, 'INVITATION_USED');
      }),
    );
    const boardRequests = state.boardRequests;

    await user.click(await within(dialog).findByRole('button', { name: 'İptal et: bora@example.com daveti' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Davet az önce kabul edildi.');
    expect(await within(dialog).findByText(BORA.name)).toBeInTheDocument();
    expect(state.boardRequests).toBeGreaterThan(boardRequests);
    await waitFor(() => expect(within(dialog).queryByText('bora@example.com')).not.toBeInTheDocument());
  });

  it('makes a new link for the same address and role with "Yeni bağlantı"', async () => {
    const { user, dialog } = await openMembers(asRole('OWNER', []), [
      testInvitation({ id: 'inv-1', email: 'davetli@example.com', role: 'ADMIN' }),
    ]);
    const sent = inviteHandler((body) => ({
      ...createdFor(body.email, body.role),
      invitation: testInvitation({ id: 'inv-1', email: body.email, role: body.role }),
    }));

    await user.click(
      await within(dialog).findByRole('button', { name: 'davetli@example.com için yeni bağlantı oluştur' }),
    );

    expect(await within(dialog).findByLabelText('Davet bağlantısı')).toHaveValue(INVITE_URL);
    expect(sent).toEqual([{ email: 'davetli@example.com', role: 'ADMIN' }]);
    expect(within(dialog).getByRole('button', { name: 'Bağlantıyı kopyala' })).toHaveFocus();
    expect(within(dialog).getByText('davetli@example.com için davet bağlantısı')).toBeInTheDocument();
  });

  it('lets one "Yeni bağlantı" request run at a time and shows its link', async () => {
    let release: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { user, dialog } = await openMembers(asRole('OWNER', []), [
      testInvitation({ id: 'inv-a', email: 'a@example.com' }),
      testInvitation({ id: 'inv-b', email: 'b@example.com' }),
    ]);
    const sent = inviteHandler((body) => createdFor(body.email));
    server.use(
      http.post(INVITATIONS_URL, async ({ request }) => {
        const body = (await request.json()) as CreateInvitationRequest;
        sent.push(body);
        await answered;
        return HttpResponse.json(createdFor(body.email), { status: 201 });
      }),
    );
    const renewA = await within(dialog).findByRole('button', { name: 'a@example.com için yeni bağlantı oluştur' });
    const renewB = within(dialog).getByRole('button', { name: 'b@example.com için yeni bağlantı oluştur' });

    await user.click(renewA);

    await waitFor(() => expect(renewB).toBeDisabled());
    await user.click(renewB);
    release();
    expect(await within(dialog).findByText('a@example.com için davet bağlantısı')).toBeInTheDocument();
    expect(sent).toEqual([{ email: 'a@example.com', role: 'MEMBER' }]);
    await waitFor(() => expect(renewB).toBeEnabled());
    await user.click(renewB);
    expect(await within(dialog).findByText('b@example.com için davet bağlantısı')).toBeInTheDocument();
    expect(sent.map((body) => body.email)).toEqual(['a@example.com', 'b@example.com']);
  });

  it('still finishes the form when "Yeni bağlantı" is pressed while the form is being sent', async () => {
    let release: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { user, dialog } = await openMembers(asRole('OWNER', []), [
      testInvitation({ id: 'inv-a', email: 'a@example.com' }),
    ]);
    server.use(
      http.post(INVITATIONS_URL, async ({ request }) => {
        const body = (await request.json()) as CreateInvitationRequest;
        if (body.email === 'yeni@example.com') await answered;
        return HttpResponse.json(createdFor(body.email), { status: 201 });
      }),
    );
    const email = within(dialog).getByLabelText('E-posta');
    await user.type(email, 'yeni@example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Davet et' }));

    await user.click(await within(dialog).findByRole('button', { name: 'a@example.com için yeni bağlantı oluştur' }));
    expect(await within(dialog).findByText('a@example.com için davet bağlantısı')).toBeInTheDocument();
    release();

    expect(await within(dialog).findByText('yeni@example.com için davet bağlantısı')).toBeInTheDocument();
    expect(email).toHaveValue('');
  });

  it('keeps the link out of storage', async () => {
    const { user, dialog } = await openMembers(asRole('OWNER', []));
    inviteHandler((body) => createdFor(body.email));

    await user.type(within(dialog).getByLabelText('E-posta'), 'yeni@example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Davet et' }));
    await within(dialog).findByLabelText('Davet bağlantısı');

    expect(JSON.stringify({ ...localStorage })).not.toContain(INVITE_URL);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(INVITE_URL);
  });
});
