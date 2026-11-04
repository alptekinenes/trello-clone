import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { InvitationPreviewDto, UserDto } from '@trello/contracts';
import { http, HttpResponse } from 'msw';
import { StrictMode } from 'react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { describe, expect, it } from 'vitest';
import { routes } from '../../../app/routes';
import { BOARD_ID, apiError, boardDetail, testUser } from '../../../test/fixtures';
import { server } from '../../../test/msw-server';
import { renderApp, renderWithProviders } from '../../../test/render';
import { useAuthStore } from '../../auth/store/auth-store';
import { useInvitationIntentStore } from '../store/invitation-intent-store';

const TOKEN = 'a'.repeat(21) + 'B'.repeat(21) + '-';
const PAGE = `/invitations/${TOKEN}`;
const PREVIEW_URL = `*/api/v1/invitations/${TOKEN}`;
const ACCEPT_URL = `${PREVIEW_URL}/accept`;

const PREVIEW: InvitationPreviewDto = {
  boardTitle: 'Yol haritası',
  inviterName: 'Ali Demir',
  email: 'bora@example.com',
  role: 'MEMBER',
  expiresAt: '2026-11-09T14:30:00.000Z',
};
const BORA: UserDto = { id: 'u-bora', email: 'bora@example.com', name: 'Bora Kaya', avatarUrl: null };

/** Requests the page made, and what the accept endpoint answers. */
function serveInvitation(
  { preview = PREVIEW, accept }: { preview?: InvitationPreviewDto | Response; accept?: () => Response } = {},
) {
  const requests = { preview: 0, accept: 0 };
  server.use(
    http.get(PREVIEW_URL, () => {
      requests.preview += 1;
      return preview instanceof Response ? preview.clone() : HttpResponse.json(preview);
    }),
    http.post(ACCEPT_URL, () => {
      requests.accept += 1;
      return accept ? accept() : HttpResponse.json({ boardId: BOARD_ID });
    }),
    http.get(`*/api/v1/boards/${BOARD_ID}`, () => HttpResponse.json(boardDetail('MEMBER'))),
    http.get('*/api/v1/boards', () => HttpResponse.json([])),
  );
  return requests;
}

const signedOut = () => useAuthStore.getState().clearSession();
const signedInAs = (user: UserDto) =>
  useAuthStore.getState().setSession({ accessToken: 'token', user });
const main = () => screen.getByRole('main');

describe('invitation page: the invitation', () => {
  it('shows who invited whom to what, to a signed-out visitor, with ways to sign up and in', async () => {
    signedOut();
    serveInvitation();
    renderApp(PAGE);

    expect(await screen.findByRole('heading', { level: 1, name: 'Panoya davet' })).toBeInTheDocument();
    expect(main()).toHaveTextContent('Ali Demir seni Yol haritası panosuna üye olarak davet etti.');
    expect(main()).toHaveTextContent('Davet bora@example.com adresine gönderildi.');
    expect(main()).toHaveTextContent(/Son geçerlilik: \d+ Kasım 2026/);
    const returnUrl = `returnUrl=${encodeURIComponent(`/invitations/${TOKEN}`)}`;
    expect(within(main()).getByRole('link', { name: 'Kayıt ol' })).toHaveAttribute(
      'href',
      `/register?${returnUrl}`,
    );
    expect(within(main()).getByRole('link', { name: 'Giriş yap' })).toHaveAttribute(
      'href',
      `/login?${returnUrl}`,
    );
  });

  it('opens without signing in: it is not sent to the login page', async () => {
    signedOut();
    serveInvitation();
    const { router } = renderApp(PAGE);

    await screen.findByRole('heading', { level: 1, name: 'Panoya davet' });

    expect(router.state.location.pathname).toBe(PAGE);
  });

  it('says it is checking the session while it does not know whether the user is signed in', async () => {
    serveInvitation();
    renderApp(PAGE);

    expect(await within(await screen.findByRole('main')).findByText('Oturum kontrol ediliyor…')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Kayıt ol' })).not.toBeInTheDocument();
  });

  it('does not ask the server about a token that cannot be one', async () => {
    signedOut();
    const requests = serveInvitation();
    renderApp('/invitations/abc');

    expect(await screen.findByRole('heading', { level: 1, name: 'Davet kullanılamıyor' })).toBeInTheDocument();
    expect(main()).toHaveTextContent('Davet bulunamadı.');
    expect(requests.preview).toBe(0);
  });

  it.each([
    ['unknown', 404, 'NOT_FOUND', 'Davet bulunamadı. Bağlantı hatalı olabilir ya da davet yenilenmiş olabilir.'],
    ['expired', 410, 'INVITATION_EXPIRED', 'Bu davetin süresi dolmuş. Seni davet eden kişiden yeni bir davet iste.'],
    ['revoked', 410, 'INVITATION_REVOKED', 'Bu davet iptal edilmiş.'],
    ['used', 410, 'INVITATION_USED', 'Bu davet zaten kullanılmış. Panoya erişimin varsa Panolarım sayfasında görebilirsin.'],
  ] as const)('explains an %s invitation and offers the login to a visitor', async (_, status, code, message) => {
    signedOut();
    serveInvitation({ preview: apiError(status, code) });
    renderApp(PAGE);

    expect(await screen.findByRole('heading', { level: 1, name: 'Davet kullanılamıyor' })).toBeInTheDocument();
    expect(main()).toHaveTextContent(message);
    expect(within(main()).getByRole('link', { name: 'Giriş yap' })).toHaveAttribute('href', '/login');
  });

  it('offers a signed-in user their boards when the invitation is unusable', async () => {
    signedInAs(testUser);
    serveInvitation({ preview: apiError(410, 'INVITATION_REVOKED') });
    renderApp(PAGE);

    expect(await screen.findByText('Bu davet iptal edilmiş.')).toBeInTheDocument();
    expect(within(main()).getByRole('link', { name: 'Panolarına git' })).toHaveAttribute('href', '/boards');
  });

  it('lets the user try again when the preview could not be loaded', async () => {
    signedOut();
    let failing = true;
    server.use(
      http.get(PREVIEW_URL, () =>
        failing ? apiError(500, 'INTERNAL_ERROR') : HttpResponse.json(PREVIEW),
      ),
    );
    renderApp(PAGE);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sunucuya şu an ulaşılamıyor');
    failing = false;

    await userEvent.setup().click(screen.getByRole('button', { name: 'Tekrar dene' }));

    expect(await screen.findByText(/Ali Demir/)).toBeInTheDocument();
  });
});

describe('invitation page: accepting', () => {
  it('waits for the user: the button is there and nothing is sent until it is pressed', async () => {
    signedInAs(BORA);
    const requests = serveInvitation();
    const { router } = renderApp(PAGE);
    const user = userEvent.setup();

    const accept = await screen.findByRole('button', { name: 'Daveti kabul et' });
    expect(requests.accept).toBe(0);
    await user.click(accept);

    await waitFor(() => expect(router.state.location.pathname).toBe(`/boards/${BOARD_ID}`));
    expect(requests.accept).toBe(1);
    expect(router.state.historyAction).toBe('REPLACE');
    expect(screen.getByText('“Yol haritası” panosuna katıldın.')).toBeInTheDocument();
  });

  it('announces the request in a status region that was there before it started', async () => {
    signedInAs(BORA);
    serveInvitation();
    let release: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post(ACCEPT_URL, async () => {
        await answered;
        return HttpResponse.json({ boardId: BOARD_ID });
      }),
    );
    renderApp(PAGE);
    const user = userEvent.setup();
    const accept = await screen.findByRole('button', { name: 'Daveti kabul et' });
    const status = within(main()).getByRole('status');
    expect(status).toBeEmptyDOMElement();

    await user.click(accept);

    await waitFor(() => expect(status).toHaveTextContent('Davet kabul ediliyor…'));
    expect(within(main()).getByRole('status')).toBe(status);
    release();
  });

  it('matches the address whatever its case', async () => {
    signedInAs({ ...BORA, email: 'Bora@Example.com' });
    serveInvitation();
    renderApp(PAGE);

    expect(await screen.findByRole('button', { name: 'Daveti kabul et' })).toBeInTheDocument();
  });

  it('does not accept on its own just because the page opened for the right account', async () => {
    signedInAs(BORA);
    const requests = serveInvitation();
    renderApp(`${PAGE}?accept=1`);

    await screen.findByRole('button', { name: 'Daveti kabul et' });

    expect(requests.accept).toBe(0);
  });

  it('warns a signed-in user of another address and offers to sign out instead of accepting', async () => {
    signedInAs(testUser);
    const requests = serveInvitation();
    let loggedOut = false;
    server.use(
      http.post('*/api/v1/auth/logout', () => {
        loggedOut = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp(PAGE);
    const user = userEvent.setup();

    expect(await within(await screen.findByRole('main')).findByText(/Şu an/)).toHaveTextContent(
      'Bu davet bora@example.com adresine gönderildi. Şu an ayse@example.com olarak giriş yaptın. Daveti kabul etmek için davet edilen adresle giriş yap.',
    );
    expect(screen.queryByRole('button', { name: 'Daveti kabul et' })).not.toBeInTheDocument();
    await user.click(within(main()).getByRole('button', { name: 'Çıkış yap ve başka hesapla devam et' }));

    expect(await within(main()).findByRole('link', { name: 'Kayıt ol' })).toBeInTheDocument();
    expect(loggedOut).toBe(true);
    expect(requests.accept).toBe(0);
  });

  it('forgets the intent left for the wrong account when the user signs out of it', async () => {
    signedInAs(testUser);
    serveInvitation();
    server.use(http.post('*/api/v1/auth/logout', () => new HttpResponse(null, { status: 204 })));
    useInvitationIntentStore.getState().remember(TOKEN);
    renderApp(PAGE);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Çıkış yap ve başka hesapla devam et' }));

    expect(await within(main()).findByRole('link', { name: 'Kayıt ol' })).toBeInTheDocument();
    expect(useInvitationIntentStore.getState().token).toBeNull();
  });

  it('comes back from signing in and accepts exactly once, on its own', async () => {
    signedOut();
    const requests = serveInvitation();
    server.use(
      http.post('*/api/v1/auth/login', () => HttpResponse.json({ accessToken: 'token', user: BORA })),
    );
    const { router } = renderApp(PAGE);
    const user = userEvent.setup();

    await user.click(await within(await screen.findByRole('main')).findByRole('link', { name: 'Giriş yap' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Giriş yap' })).toBeInTheDocument();
    expect(screen.getByLabelText('E-posta')).toHaveValue('bora@example.com');
    await user.type(screen.getByLabelText('Parola'), 'secret-password');
    await user.click(screen.getByRole('button', { name: 'Giriş yap' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/boards/${BOARD_ID}`));
    expect(requests.accept).toBe(1);
    expect(useInvitationIntentStore.getState().token).toBeNull();
  });

  it('also accepts on its own after signing up from the page', async () => {
    signedOut();
    const requests = serveInvitation();
    server.use(
      http.post('*/api/v1/auth/register', () =>
        HttpResponse.json({ accessToken: 'token', user: BORA }, { status: 201 }),
      ),
    );
    const { router } = renderApp(PAGE);
    const user = userEvent.setup();

    await user.click(await within(await screen.findByRole('main')).findByRole('link', { name: 'Kayıt ol' }));
    await user.type(await screen.findByLabelText('Ad soyad'), 'Bora Kaya');
    expect(screen.getByLabelText('E-posta')).toHaveValue('bora@example.com');
    await user.type(screen.getByLabelText('Parola'), 'secret-password');
    await user.click(screen.getByRole('button', { name: 'Kayıt ol' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/boards/${BOARD_ID}`));
    expect(requests.accept).toBe(1);
  });

  it('sends one request even when React runs the page twice (StrictMode)', async () => {
    signedInAs(BORA);
    const requests = serveInvitation();
    useInvitationIntentStore.getState().remember(TOKEN);
    const router = createMemoryRouter(routes, { initialEntries: [PAGE] });
    renderWithProviders(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>,
    );

    await waitFor(() => expect(router.state.location.pathname).toBe(`/boards/${BOARD_ID}`));
    expect(requests.accept).toBe(1);
  });

  it('asks again after signing in elsewhere: no intent was left, so the button waits', async () => {
    signedOut();
    const requests = serveInvitation();
    server.use(
      http.post('*/api/v1/auth/login', () => HttpResponse.json({ accessToken: 'token', user: BORA })),
    );
    const { router } = renderApp(`/login?returnUrl=${encodeURIComponent(PAGE)}`);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('E-posta'), 'bora@example.com');
    await user.type(screen.getByLabelText('Parola'), 'secret-password');
    await user.click(screen.getByRole('button', { name: 'Giriş yap' }));

    expect(await screen.findByRole('button', { name: 'Daveti kabul et' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(PAGE);
    expect(requests.accept).toBe(0);
  });

  it.each([
    ['another address', 403, 'EMAIL_MISMATCH', 'Bu davet başka bir e-posta adresine gönderilmiş. Davet edilen adresle giriş yap.'],
    ['an expired invitation', 410, 'INVITATION_EXPIRED', 'Bu davetin süresi dolmuş. Seni davet eden kişiden yeni bir davet iste.'],
    ['an unknown invitation', 404, 'NOT_FOUND', 'Davet bulunamadı. Bağlantı hatalı olabilir ya da davet yenilenmiş olabilir.'],
  ] as const)('explains a refusal for %s and takes the button away', async (_, status, code, message) => {
    signedInAs(BORA);
    serveInvitation({ accept: () => apiError(status, code) });
    renderApp(PAGE);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Daveti kabul et' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByRole('button', { name: 'Daveti kabul et' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tekrar dene' })).not.toBeInTheDocument();
    expect(within(main()).getByRole('link', { name: 'Panolarına git' })).toBeInTheDocument();
  });

  it('keeps a "Tekrar dene" button after a server error, and it works', async () => {
    signedInAs(BORA);
    let failing = true;
    const requests = serveInvitation({
      accept: () => (failing ? apiError(500, 'INTERNAL_ERROR') : HttpResponse.json({ boardId: BOARD_ID })),
    });
    const { router } = renderApp(PAGE);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Daveti kabul et' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sunucuya şu an ulaşılamıyor');
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Tekrar dene' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/boards/${BOARD_ID}`));
    expect(requests.accept).toBe(2);
  });

  it('keeps the invitation token out of storage', async () => {
    signedOut();
    serveInvitation();
    renderApp(PAGE);
    const user = userEvent.setup();

    await user.click(await within(await screen.findByRole('main')).findByRole('link', { name: 'Kayıt ol' }));

    expect(JSON.stringify({ ...localStorage })).not.toContain(TOKEN);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(TOKEN);
  });
});
