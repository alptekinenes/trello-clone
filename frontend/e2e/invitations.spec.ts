import { type BrowserContext, expect, type Locator, type Page, test as base } from '@playwright/test';
import {
  apiInvite,
  expireInvitation,
  freshEmail,
  inviteTokenPath,
  PASSWORD,
  seedBoard,
  signUpAs,
} from './helpers.js';

/* Needs the backend and its database (the Playwright config starts both dev servers). */

const OWNER_NAME = 'Ayşe Sahip';
const INVITEE_NAME = 'Burak Davetli';
const BOARD_TITLE = 'Yol haritası';

/** `newPage()` opens another person's browser: own cookies, so own session. */
const test = base.extend<{ newPage: () => Promise<Page> }>({
  newPage: async ({ browser, baseURL }, provide) => {
    const contexts: BrowserContext[] = [];
    await provide(async () => {
      const context = await browser.newContext({ baseURL, locale: 'tr-TR' });
      contexts.push(context);
      return context.newPage();
    });
    await Promise.all(contexts.map((context) => context.close()));
  },
});

interface SeededOwner {
  token: string;
  boardId: string;
}

/** Signs `page` up as the board owner and creates a board; the test opens it. */
async function seedOwnerBoard(page: Page, title = BOARD_TITLE): Promise<SeededOwner> {
  const { token } = await signUpAs(page, OWNER_NAME);
  const boardId = await seedBoard(page, token, title, ['Yapılacaklar']);
  return { token, boardId };
}

async function openBoard(page: Page, boardId: string, title = BOARD_TITLE): Promise<void> {
  await page.goto(`/boards/${boardId}`);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

async function openMembers(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Üyeler', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Pano üyeleri' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function inviteByEmail(dialog: Locator, email: string): Promise<void> {
  await dialog.getByLabel('E-posta', { exact: true }).fill(email);
  await dialog.getByRole('button', { name: 'Davet et', exact: true }).click();
}

/** The person list of the members dialog (not the avatars in the header). */
const memberList = (dialog: Locator) => dialog.getByRole('list', { name: 'Üyeler', exact: true });
const pendingList = (dialog: Locator) =>
  dialog.getByRole('list', { name: 'Bekleyen davetler', exact: true });

/** API route that accepts the invitation behind an app path like `/invitations/<token>`. */
const acceptPath = (invitePath: string) => `/api/v1${invitePath}/accept`;

test.describe('inviting people', () => {
  test('an owner invites an unregistered address and the invitee joins through the copied link', async ({
    page,
    context,
    newPage,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const { boardId } = await seedOwnerBoard(page);
    await openBoard(page, boardId);
    const dialog = await openMembers(page);

    const inviteeEmail = freshEmail('b');
    await inviteByEmail(dialog, inviteeEmail);

    const linkField = dialog.getByLabel('Davet bağlantısı');
    await expect(linkField).toHaveValue(/\/invitations\/[A-Za-z0-9_-]{43}$/);
    const copyButton = dialog.getByRole('button', { name: 'Bağlantıyı kopyala' });
    await expect(copyButton).toBeFocused();
    await expect(pendingList(dialog)).toContainText(inviteeEmail);

    await copyButton.click();
    await expect(dialog.getByRole('status')).toHaveText('Bağlantı kopyalandı.');
    // The e2e tsconfig has no DOM types, hence the expression as a string.
    const inviteUrl = (await page.evaluate('navigator.clipboard.readText()')) as string;
    expect(inviteUrl).toBe(await linkField.inputValue());

    // The invitee opens the link in their own browser: a preview, then sign up.
    const inviteePage = await newPage();
    await inviteePage.goto(inviteTokenPath(inviteUrl));
    const main = inviteePage.getByRole('main');
    await expect(main.getByRole('heading', { level: 1, name: 'Panoya davet' })).toBeVisible();
    await expect(main).toContainText(OWNER_NAME);
    await expect(main).toContainText(BOARD_TITLE);
    await expect(main).toContainText(inviteeEmail);

    await main.getByRole('link', { name: 'Kayıt ol' }).click();
    await expect(inviteePage.getByLabel('E-posta')).toHaveValue(inviteeEmail);
    await inviteePage.getByLabel('Ad soyad').fill(INVITEE_NAME);
    await inviteePage.getByLabel('Parola').fill(PASSWORD);
    await inviteePage.getByRole('button', { name: 'Kayıt ol' }).click();

    // Back on the invitation, the choice made on the page is carried out by itself.
    await expect(inviteePage).toHaveURL(`/boards/${boardId}`);
    await expect(inviteePage.getByRole('heading', { level: 1, name: BOARD_TITLE })).toBeVisible();
    await expect(
      inviteePage.getByRole('status').filter({ hasText: 'panosuna katıldın' }),
    ).toBeVisible();

    // The owner sees the new member, and no invitation is left.
    await page.reload();
    await expect(page.getByRole('list', { name: 'Pano üyeleri' })).toContainText(INVITEE_NAME);
    const reopened = await openMembers(page);
    await expect(memberList(reopened)).toContainText(INVITEE_NAME);
    await expect(reopened.getByText('Bekleyen davet yok.')).toBeVisible();
  });

  test('inviting a registered user adds them at once', async ({ page, newPage }) => {
    const invitee = await newPage();
    const { email } = await signUpAs(invitee, INVITEE_NAME);
    const { boardId } = await seedOwnerBoard(page);
    await openBoard(page, boardId);
    const dialog = await openMembers(page);

    await inviteByEmail(dialog, email);

    await expect(dialog.getByRole('status')).toHaveText(`${INVITEE_NAME} panoya eklendi.`);
    await expect(memberList(dialog)).toContainText(INVITEE_NAME);
    await expect(dialog.getByLabel('E-posta', { exact: true })).toHaveValue('');
    await expect(dialog.getByLabel('E-posta', { exact: true })).toBeFocused();
    await expect(dialog.getByLabel('Davet bağlantısı')).toHaveCount(0);

    // The invitee has the board on their boards page without accepting anything.
    await invitee.goto('/boards');
    await invitee.getByRole('link', { name: BOARD_TITLE }).click();
    await expect(invitee).toHaveURL(`/boards/${boardId}`);
    await expect(invitee.getByRole('heading', { level: 1, name: BOARD_TITLE })).toBeVisible();
  });

  test('inviting someone who is already a member shows a field error', async ({ page, newPage }) => {
    const invitee = await newPage();
    const { email } = await signUpAs(invitee, INVITEE_NAME);
    const { token, boardId } = await seedOwnerBoard(page);
    await apiInvite(page, token, boardId, email);
    await openBoard(page, boardId);
    const dialog = await openMembers(page);

    await inviteByEmail(dialog, email);

    const field = dialog.getByLabel('E-posta', { exact: true });
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(dialog.getByText('Bu kişi zaten panonun üyesi.')).toBeVisible();
  });

  test('an invalid email shows the form error and sends nothing', async ({ page }) => {
    const { boardId } = await seedOwnerBoard(page);
    await openBoard(page, boardId);
    const dialog = await openMembers(page);
    const posts: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/invitations')) {
        posts.push(request.url());
      }
    });

    await inviteByEmail(dialog, 'bu-bir-eposta-degil');

    await expect(dialog.getByText('Geçerli bir e-posta adresi gir.')).toBeVisible();
    expect(posts).toEqual([]);
  });

  test('a registered invitee signs in through the link and joins by themselves', async ({
    page,
    newPage,
  }) => {
    const { token, boardId } = await seedOwnerBoard(page);
    const inviteeEmail = freshEmail('x');
    const inviteUrl = await apiInvite(page, token, boardId, inviteeEmail);
    expect(inviteUrl).not.toBeNull();

    // Registered after the invitation was sent, and signed out in the browser used below.
    await signUpAs(await newPage(), INVITEE_NAME, inviteeEmail);

    const invitee = await newPage();
    await invitee.goto(inviteTokenPath(inviteUrl ?? ''));
    await invitee.getByRole('main').getByRole('link', { name: 'Giriş yap' }).click();
    await expect(invitee.getByLabel('E-posta')).toHaveValue(inviteeEmail);
    await invitee.getByLabel('Parola').fill(PASSWORD);
    await invitee.getByRole('button', { name: 'Giriş yap' }).click();

    await expect(invitee).toHaveURL(`/boards/${boardId}`);
    await expect(invitee.getByRole('heading', { level: 1, name: BOARD_TITLE })).toBeVisible();
  });

  test('opening the link while signed in does not join without a click', async ({ page, newPage }) => {
    const { token, boardId } = await seedOwnerBoard(page);
    const inviteeEmail = freshEmail('y');
    const inviteUrl = await apiInvite(page, token, boardId, inviteeEmail);
    const invitee = await newPage();
    await signUpAs(invitee, INVITEE_NAME, inviteeEmail);

    await invitee.goto(inviteTokenPath(inviteUrl ?? ''));
    const accept = invitee.getByRole('main').getByRole('button', { name: 'Daveti kabul et' });
    await expect(accept).toBeVisible();
    await expect(invitee).toHaveURL(/\/invitations\//);

    await accept.click();
    await expect(invitee).toHaveURL(`/boards/${boardId}`);
  });

  test('a signed-in stranger sees the mismatch view and can sign out', async ({ page, newPage }) => {
    const { token, boardId } = await seedOwnerBoard(page);
    const inviteUrl = await apiInvite(page, token, boardId, freshEmail('hedef'));
    const invitePath = inviteTokenPath(inviteUrl ?? '');
    const stranger = await newPage();
    const { email: strangerEmail, token: strangerToken } = await signUpAs(stranger, 'Cem Yabancı');

    await stranger.goto(invitePath);

    const main = stranger.getByRole('main');
    await expect(main).toContainText('Şu an');
    await expect(main).toContainText(strangerEmail);
    await expect(main.getByRole('button', { name: 'Daveti kabul et' })).toHaveCount(0);
    // The server refuses the wrong account as well.
    const refused = await stranger.request.post(acceptPath(invitePath), {
      headers: { Authorization: `Bearer ${strangerToken}` },
    });
    expect(refused.status()).toBe(403);

    await main.getByRole('button', { name: 'Çıkış yap ve başka hesapla devam et' }).click();

    await expect(main.getByRole('link', { name: 'Kayıt ol' })).toBeVisible();
    await expect(main.getByRole('link', { name: 'Giriş yap' })).toBeVisible();
    await expect(main.getByText(strangerEmail)).toHaveCount(0);
  });
});

test.describe('invitation links that no longer work', () => {
  test('a revoked invitation shows that it was taken back', async ({ page, newPage }) => {
    const { token, boardId } = await seedOwnerBoard(page);
    const email = freshEmail('iptal');
    const inviteUrl = await apiInvite(page, token, boardId, email);
    await openBoard(page, boardId);
    const dialog = await openMembers(page);
    await expect(pendingList(dialog)).toContainText(email);

    await dialog.getByRole('button', { name: `İptal et: ${email} daveti` }).click();

    await expect(dialog.getByRole('status')).toHaveText('Davet iptal edildi.');
    await expect(dialog.getByText('Bekleyen davet yok.')).toBeVisible();

    const invitee = await newPage();
    await invitee.goto(inviteTokenPath(inviteUrl ?? ''));
    const main = invitee.getByRole('main');
    await expect(main.getByRole('heading', { level: 1, name: 'Davet kullanılamıyor' })).toBeVisible();
    await expect(main.getByText('Bu davet iptal edilmiş.')).toBeVisible();
    await expect(main.getByRole('link', { name: 'Giriş yap' })).toBeVisible();
  });

  test('an expired invitation asks for a new one and is not listed for the owner', async ({
    page,
    newPage,
  }) => {
    const { token, boardId } = await seedOwnerBoard(page);
    const email = freshEmail('suresi');
    const inviteUrl = await apiInvite(page, token, boardId, email);
    await expireInvitation(boardId, email);

    const invitee = await newPage();
    await invitee.goto(inviteTokenPath(inviteUrl ?? ''));
    const main = invitee.getByRole('main');
    await expect(main.getByRole('heading', { level: 1, name: 'Davet kullanılamıyor' })).toBeVisible();
    await expect(main.getByText(/Bu davetin süresi dolmuş/)).toBeVisible();

    await openBoard(page, boardId);
    const dialog = await openMembers(page);
    await expect(dialog.getByText('Bekleyen davet yok.')).toBeVisible();
  });

  test('an accepted invitation cannot be used again', async ({ page, newPage }) => {
    const { token, boardId } = await seedOwnerBoard(page);
    const email = freshEmail('kullanilmis');
    const invitePath = inviteTokenPath((await apiInvite(page, token, boardId, email)) ?? '');
    const invitee = await newPage();
    await signUpAs(invitee, INVITEE_NAME, email);
    await invitee.goto(invitePath);
    await invitee.getByRole('button', { name: 'Daveti kabul et' }).click();
    await expect(invitee).toHaveURL(`/boards/${boardId}`);

    const stranger = await newPage();
    await stranger.goto(invitePath);

    const main = stranger.getByRole('main');
    await expect(main.getByRole('heading', { level: 1, name: 'Davet kullanılamıyor' })).toBeVisible();
    await expect(main.getByText(/Bu davet zaten kullanılmış/)).toBeVisible();
  });

  test('inviting again replaces the earlier link', async ({ page, newPage }) => {
    const { token, boardId } = await seedOwnerBoard(page);
    const email = freshEmail('yenile');
    const oldPath = inviteTokenPath((await apiInvite(page, token, boardId, email)) ?? '');
    const newPath = inviteTokenPath((await apiInvite(page, token, boardId, email)) ?? '');
    expect(newPath).not.toBe(oldPath);

    const invitee = await newPage();
    await invitee.goto(oldPath);
    await expect(
      invitee.getByRole('main').getByRole('heading', { level: 1, name: 'Davet kullanılamıyor' }),
    ).toBeVisible();
    await expect(invitee.getByRole('main').getByText(/Davet bulunamadı/)).toBeVisible();

    await invitee.goto(newPath);
    await expect(invitee.getByRole('main')).toContainText(BOARD_TITLE);
  });

  test('a malformed token shows the not found view', async ({ page }) => {
    await page.goto('/invitations/abc');

    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { level: 1, name: 'Davet kullanılamıyor' })).toBeVisible();
    await expect(main.getByText(/Davet bulunamadı/)).toBeVisible();
  });
});

test.describe('managing members', () => {
  test('the owner changes a role that survives a reload, then removes the member', async ({
    page,
    newPage,
  }) => {
    const member = await newPage();
    const { email } = await signUpAs(member, INVITEE_NAME);
    const { token, boardId } = await seedOwnerBoard(page);
    await apiInvite(page, token, boardId, email);
    await openBoard(page, boardId);
    let dialog = await openMembers(page);

    const roleSelect = dialog.getByLabel(`${INVITEE_NAME} rolü`);
    await expect(roleSelect).toHaveValue('MEMBER');
    await roleSelect.selectOption({ label: 'Yönetici' });
    await expect(dialog.getByRole('status')).toHaveText(`${INVITEE_NAME} artık yönetici.`);

    await page.reload();
    dialog = await openMembers(page);
    await expect(dialog.getByLabel(`${INVITEE_NAME} rolü`)).toHaveValue('ADMIN');

    await dialog.getByRole('button', { name: `${INVITEE_NAME} kişisini panodan çıkar` }).click();
    const confirm = page.getByRole('dialog', { name: 'Üye çıkarılsın mı?' });
    await confirm.getByRole('button', { name: 'Çıkar', exact: true }).click();

    await expect(dialog.getByRole('status')).toHaveText(`${INVITEE_NAME} panodan çıkarıldı.`);
    await expect(memberList(dialog)).not.toContainText(INVITEE_NAME);

    // The removed user no longer finds the board.
    await member.goto(`/boards/${boardId}`);
    await expect(member.getByRole('heading', { level: 1, name: 'Pano bulunamadı' })).toBeVisible();
  });

  test('a member leaves the board and it disappears from their boards', async ({ page, newPage }) => {
    const member = await newPage();
    const { email } = await signUpAs(member, INVITEE_NAME);
    const { token, boardId } = await seedOwnerBoard(page, 'Ortak pano');
    await apiInvite(page, token, boardId, email);
    await openBoard(member, boardId, 'Ortak pano');
    const dialog = await openMembers(member);

    await dialog.getByRole('button', { name: 'Panodan ayrıl' }).click();
    const confirm = member.getByRole('dialog', { name: 'Panodan ayrılınsın mı?' });
    await confirm.getByRole('button', { name: 'Panodan ayrıl', exact: true }).click();

    await expect(member).toHaveURL('/boards');
    await expect(member.getByRole('status').filter({ hasText: 'panosundan ayrıldın' })).toBeVisible();
    await expect(member.getByRole('link', { name: 'Ortak pano' })).toHaveCount(0);
    await expect(member.getByText(/Henüz bir panon yok/)).toBeVisible();
  });
});

test.describe('what a plain member can do', () => {
  test('the members dialog has no invitation parts and the API refuses invitation requests', async ({
    page,
    newPage,
  }) => {
    const member = await newPage();
    const { email, token: memberToken } = await signUpAs(member, INVITEE_NAME);
    const { token, boardId } = await seedOwnerBoard(page);
    await apiInvite(page, token, boardId, email);
    const invitationRequests: string[] = [];
    member.on('request', (request) => {
      if (request.url().includes('/api/v1/') && request.url().includes('/invitations')) {
        invitationRequests.push(request.url());
      }
    });

    await openBoard(member, boardId);
    const dialog = await openMembers(member);

    await expect(memberList(dialog)).toContainText(OWNER_NAME);
    await expect(memberList(dialog)).toContainText(INVITEE_NAME);
    await expect(dialog.getByRole('heading', { name: 'Davet et' })).toHaveCount(0);
    await expect(dialog.getByRole('heading', { name: 'Bekleyen davetler' })).toHaveCount(0);
    await expect(dialog.getByLabel('E-posta', { exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('combobox')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: /kişisini panodan çıkar/ })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Panodan ayrıl' })).toBeVisible();
    expect(invitationRequests).toEqual([]);

    const headers = { Authorization: `Bearer ${memberToken}` };
    const list = await member.request.get(`/api/v1/boards/${boardId}/invitations`, { headers });
    expect(list.status()).toBe(403);
    const create = await member.request.post(`/api/v1/boards/${boardId}/invitations`, {
      headers,
      data: { email: freshEmail('izinsiz'), role: 'MEMBER' },
    });
    expect(create.status()).toBe(403);
  });
});

test.describe('dialog focus and keyboard', () => {
  test('Escape closes the members dialog and focus returns to the "Üyeler" button', async ({
    page,
  }) => {
    const { boardId } = await seedOwnerBoard(page);
    await openBoard(page, boardId);
    const opener = page.getByRole('button', { name: 'Üyeler', exact: true });

    await opener.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Pano üyeleri' });
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test('the removal confirmation starts on "Vazgeç" and Escape leaves the member in place', async ({
    page,
    newPage,
  }) => {
    const member = await newPage();
    const { email } = await signUpAs(member, INVITEE_NAME);
    const { token, boardId } = await seedOwnerBoard(page);
    await apiInvite(page, token, boardId, email);
    await openBoard(page, boardId);
    const dialog = await openMembers(page);
    const removeButton = dialog.getByRole('button', {
      name: `${INVITEE_NAME} kişisini panodan çıkar`,
    });

    await removeButton.click();
    const confirm = page.getByRole('dialog', { name: 'Üye çıkarılsın mı?' });
    await expect(confirm.getByRole('button', { name: 'Vazgeç' })).toBeFocused();

    await page.keyboard.press('Escape');

    await expect(confirm).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(removeButton).toBeFocused();
    await expect(memberList(dialog)).toContainText(INVITEE_NAME);

    // And "Vazgeç" does the same by keyboard.
    await page.keyboard.press('Enter');
    await expect(confirm.getByRole('button', { name: 'Vazgeç' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(confirm).toHaveCount(0);
    await expect(memberList(dialog)).toContainText(INVITEE_NAME);
  });
});

test.describe('a 320 px wide screen with touch', () => {
  test.use({ viewport: { width: 320, height: 640 }, hasTouch: true });

  test('the members dialog does not overflow sideways and works by tapping', async ({
    page,
    context,
    newPage,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const member = await newPage();
    const { email } = await signUpAs(member, 'Burak Çok Uzun İsimli Davetli Kullanıcı');
    const { token, boardId } = await seedOwnerBoard(page);
    await apiInvite(page, token, boardId, email, 'ADMIN');
    const longEmail = freshEmail('uzun-uzun-uzun-davetli');
    await apiInvite(page, token, boardId, longEmail);
    await openBoard(page, boardId);

    await page.getByRole('button', { name: 'Üyeler', exact: true }).tap();
    const dialog = page.getByRole('dialog', { name: 'Pano üyeleri' });
    await expect(dialog).toBeVisible();
    await expect(pendingList(dialog)).toContainText(longEmail);

    // Invite by tapping; the link appears and is copied.
    const newEmail = freshEmail('dokunmatik-davet-edilen-kisi');
    await dialog.getByLabel('E-posta', { exact: true }).fill(newEmail);
    await dialog.getByRole('button', { name: 'Davet et', exact: true }).tap();
    await expect(dialog.getByLabel('Davet bağlantısı')).toBeVisible();
    await dialog.getByRole('button', { name: 'Bağlantıyı kopyala' }).tap();
    await expect(dialog.getByRole('status')).toHaveText('Bağlantı kopyalandı.');

    // Nothing sticks out of the dialog, and every control stays inside it.
    const sizes = await dialog.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
    expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.clientWidth);
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
    for (const control of await dialog.locator('button, input, select').all()) {
      const rect = await control.boundingBox();
      if (!rect) continue;
      expect(rect.x).toBeGreaterThanOrEqual((box?.x ?? 0) - 0.5);
      expect(rect.x + rect.width).toBeLessThanOrEqual((box?.x ?? 0) + (box?.width ?? 0) + 0.5);
    }

    await dialog.getByRole('button', { name: 'Kapat' }).tap();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
