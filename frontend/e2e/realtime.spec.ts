import { type BrowserContext, expect, type Locator, type Page, test as base } from '@playwright/test';
import {
  apiAddChecklistItem,
  apiAddComment,
  apiDeleteComment,
  apiEditComment,
  apiAssignMember,
  apiMoveCardToList,
  apiInvite,
  apiDeleteCard,
  apiPatchCard,
  apiSetItemCompleted,
  expectFrame,
  keyboardDragReady,
  openBoardAs,
  openBoardMenuItem,
  openBoardsPageAs,
  registerUser,
  seedBoard,
  seedCard,
  seedChecklist,
  signUpAs,
  watchRealtime,
} from './helpers.js';

/*
 * Two people, two browser contexts: A makes a change, B sees it without reloading.
 * Needs the backend and its database (the Playwright config starts both dev servers).
 *
 * B is never assumed to have joined the board room before A acts: the refetch after a join
 * brings in what was missed. `openBoardAs` waits for the join anyway, so these tests do
 * exercise the live events and not just that refetch.
 */

const A_NAME = 'Ayşe Sahip';
const B_NAME = 'Burak Üye';

/** `newPage()` opens another person's browser: own cookies, so own session and own socket. */
const test = base.extend<{ newPage: () => Promise<Page> }>({
  newPage: async ({ browser, baseURL }, provide) => {
    const contexts: BrowserContext[] = [];
    await provide(async () => {
      const context = await browser.newContext({ baseURL, locale: 'tr-TR' });
      contexts.push(context);
      const page = await context.newPage();
      watchRealtime(page);
      return page;
    });
    await Promise.all(contexts.map((context) => context.close()));
  },
});

interface Collaboration {
  a: Page;
  b: Page;
  tokenA: string;
  emailB: string;
  userIdB: string;
  boardId: string;
  title: string;
}

/**
 * A owns a board with these lists and cards; B is registered and a member. Neither has
 * opened the board yet.
 */
async function collaborate(
  page: Page,
  newPage: () => Promise<Page>,
  options: { title?: string; lists?: string[]; cards?: Record<string, string[]>; member?: boolean } = {},
): Promise<Collaboration> {
  const { title = 'Ortak pano', lists = [], cards = {}, member = true } = options;
  const b = await newPage();
  const { email, userId: userIdB } = await signUpAs(b, B_NAME);
  watchRealtime(page);
  const { token: tokenA } = await signUpAs(page, A_NAME);
  const boardId = await seedBoard(page, tokenA, title, lists, cards);
  if (member) await apiInvite(page, tokenA, boardId, email);
  return { a: page, b, tokenA, emailB: email, userIdB, boardId, title };
}

const cardList = (page: Page, listTitle: string) =>
  page.getByRole('list', { name: `“${listTitle}” kartları` });

const cardTiles = (page: Page, listTitle: string) =>
  cardList(page, listTitle).locator('[aria-roledescription="sıralanabilir kart"]');

const tile = (page: Page, title: string) =>
  page.locator('[aria-roledescription="sıralanabilir kart"]', { hasText: title });

/** Card titles per list, so one poll checks the whole board. */
async function cardsByList(page: Page, lists: string[]): Promise<Record<string, string[]>> {
  const entries = await Promise.all(
    lists.map(async (list) => [list, await cardTiles(page, list).allTextContents()] as const),
  );
  return Object.fromEntries(entries);
}

/** Visible list titles, left to right. */
async function listTitles(page: Page): Promise<string[]> {
  return page
    .getByRole('list', { name: 'Listeler' })
    .getByRole('heading', { level: 2 })
    .getByRole('button')
    .allTextContents();
}

/** Presses the mouse on `source`, moves in steps to the top of `target` and releases. */
async function dragOnto(page: Page, source: Locator, target: Locator): Promise<void> {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('drag source or target is not visible');

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + 4, { steps: 20 });
  await page.mouse.up();
}

async function addList(page: Page, titles: string[]): Promise<void> {
  await page.getByRole('button', { name: /^(Liste ekle|Başka liste ekle)$/ }).click();
  const input = page.getByRole('textbox', { name: 'Liste adı' });
  for (const title of titles) {
    await input.fill(title);
    await input.press('Enter');
    await expect(input).toHaveValue('');
  }
  await input.press('Escape');
}

async function addCards(page: Page, listTitle: string, titles: string[]): Promise<void> {
  await page.getByRole('button', { name: `“${listTitle}” listesine kart ekle` }).click();
  const input = page.getByRole('textbox', { name: 'Kart başlığı' });
  for (const title of titles) {
    await input.fill(title);
    await input.press('Enter');
    await expect(input).toHaveValue('');
  }
  await input.press('Escape');
}

async function openMembers(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Paylaş', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Pano üyeleri' });
  await expect(dialog).toBeVisible();
  return dialog;
}

/**
 * Opens a card from its tile and waits until the card itself has loaded (its "Checklist" button
 * is there): a change that A makes while the first load is in flight is a different race than
 * the one these tests are about.
 */
async function openCard(page: Page, title: string): Promise<Locator> {
  await tile(page, title).click();
  const dialog = page.getByRole('dialog', { name: title });
  await expect(
    dialog.getByRole('group', { name: 'Kart işlemleri' }).getByRole('button', { name: 'Checklist', exact: true }),
  ).toBeVisible();
  return dialog;
}

const toast = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text });

test('lists and cards that A adds, moves and renames show up for B without a reload', async ({
  page,
  newPage,
}) => {
  const { a, b, boardId, title } = await collaborate(page, newPage);
  await openBoardAs(a, boardId, title);
  await openBoardAs(b, boardId, title);
  let reloadsOfB = 0;
  b.on('load', () => reloadsOfB++);

  await addList(a, ['Yapılacaklar', 'Bitti']);
  await expect.poll(() => listTitles(b)).toEqual(['Yapılacaklar', 'Bitti']);

  await addCards(a, 'Yapılacaklar', ['Taslak', 'Gözden geçir']);
  await addCards(a, 'Bitti', ['Yayınla']);
  const lists = ['Yapılacaklar', 'Bitti'];
  await expect.poll(() => cardsByList(b, lists)).toEqual({
    Yapılacaklar: ['Taslak', 'Gözden geçir'],
    Bitti: ['Yayınla'],
  });

  // "Taslak" goes on top of "Yayınla" in the next list.
  await dragOnto(a, tile(a, 'Taslak'), tile(a, 'Yayınla'));
  await expect.poll(() => cardsByList(b, lists)).toEqual({
    Yapılacaklar: ['Gözden geçir'],
    Bitti: ['Taslak', 'Yayınla'],
  });

  await a.getByRole('heading', { level: 2 }).getByRole('button', { name: 'Bitti' }).click();
  const rename = a.getByRole('textbox', { name: 'Liste adı' });
  await rename.fill('Tamamlandı');
  await rename.press('Enter');
  await expect.poll(() => listTitles(b)).toEqual(['Yapılacaklar', 'Tamamlandı']);

  expect(reloadsOfB).toBe(0);
  const expected = {
    Yapılacaklar: ['Gözden geçir'],
    Tamamlandı: ['Taslak', 'Yayınla'],
  };
  await expect.poll(() => cardsByList(b, ['Yapılacaklar', 'Tamamlandı'])).toEqual(expected);
  await b.reload();
  await expect.poll(() => cardsByList(b, ['Yapılacaklar', 'Tamamlandı'])).toEqual(expected);
  await expect.poll(() => listTitles(b)).toEqual(['Yapılacaklar', 'Tamamlandı']);
});

test('the list selector of an open card follows A moving the card to another list', async ({
  page,
  newPage,
}) => {
  const { a, b, tokenA, boardId, title } = await collaborate(page, newPage, {
    lists: ['Yapılacaklar', 'Bitti'],
    cards: { Yapılacaklar: ['Rapor'] },
  });
  await openBoardAs(b, boardId, title);
  const dialog = await openCard(b, 'Rapor');
  await expect(dialog.getByRole('button', { name: 'Liste: Yapılacaklar' })).toBeVisible();
  const cardId = b.url().split('/').pop() ?? '';

  await apiMoveCardToList(a, tokenA, boardId, cardId, 'Bitti');

  await expect(dialog.getByRole('button', { name: 'Liste: Bitti' })).toBeVisible();
});

test('an open card shows A\'s checklist, tick and new title; its deletion is announced', async ({
  page,
  newPage,
}) => {
  const { a, b, tokenA, boardId, title } = await collaborate(page, newPage, {
    lists: ['Yapılacaklar'],
    cards: { Yapılacaklar: ['Rapor'] },
  });
  const cardId = await seedCard(a, tokenA, boardId, 'Yapılacaklar', 'Silinecek');
  await openBoardAs(b, boardId, title);

  const dialog = await openCard(b, 'Rapor');

  await expect(b).toHaveURL(/\/c\/[^/]+$/);
  const reportId = b.url().split('/').pop() ?? '';
  const checklistId = await seedChecklist(a, tokenA, reportId, 'Hazırlık');
  await expect(dialog.getByRole('list', { name: '“Hazırlık” öğeleri' })).toBeAttached();

  const itemId = await apiAddChecklistItem(a, tokenA, checklistId, 'Birinci');
  const checkbox = dialog.getByRole('checkbox', { name: 'Birinci' });
  await expect(checkbox).not.toBeChecked();
  await apiSetItemCompleted(a, tokenA, itemId, true);
  await expect(checkbox).toBeChecked();

  await apiPatchCard(a, tokenA, reportId, { title: 'Rapor v2' });
  await expect(b.getByRole('dialog', { name: 'Rapor v2' })).toBeVisible();

  await b.getByRole('dialog', { name: 'Rapor v2' }).getByRole('button', { name: 'Kapat' }).click();
  await expect(b.getByRole('dialog')).toHaveCount(0);
  await expect(tile(b, 'Rapor v2')).toContainText('1/1');

  // The card B has open is deleted.
  await openCard(b, 'Silinecek');
  await apiDeleteCard(a, tokenA, cardId);
  // The dialog is named after the card, so once the card is gone it is found by role alone.
  const gone = b.getByRole('dialog');
  await expect(gone.getByRole('alert')).toHaveText('Bu kart başka biri tarafından silindi.');
  await gone.getByRole('button', { name: 'Panoya dön' }).click();
  await expect(b.getByRole('dialog')).toHaveCount(0);
  await expect(tile(b, 'Silinecek')).toHaveCount(0);
  await expect(tile(b, 'Rapor v2')).toBeVisible();
});

test('B is sent to the boards page when A removes them from the board', async ({ page, newPage }) => {
  const { a, b, boardId, title } = await collaborate(page, newPage, { lists: ['Yapılacaklar'] });
  await openBoardAs(a, boardId, title);
  await openBoardAs(b, boardId, title);

  const dialog = await openMembers(a);
  await dialog.getByRole('button', { name: `${B_NAME} kişisini panodan çıkar` }).click();
  await a.getByRole('dialog', { name: 'Üye çıkarılsın mı?' }).getByRole('button', { name: 'Çıkar', exact: true }).click();

  await expect(b).toHaveURL('/boards');
  await expect(toast(b, `“${title}” panosundan çıkarıldın.`)).toBeVisible();
  await expect(b.getByRole('link', { name: title })).toHaveCount(0);
  await expect(b.getByText(/Henüz bir panon yok/)).toBeVisible();
});

test.describe('deleting a board', () => {
  test('it disappears from B\'s boards page', async ({ page, newPage }) => {
    const { a, b, boardId, title } = await collaborate(page, newPage);
    await openBoardAs(a, boardId, title);
    await openBoardsPageAs(b);
    await expect(b.getByRole('link', { name: title })).toBeVisible();

    await openBoardMenuItem(a, 'Panoyu sil');
    await a.getByRole('dialog', { name: 'Pano silinsin mi?' }).getByRole('button', { name: 'Panoyu sil' }).click();

    await expect(a).toHaveURL('/boards');
    await expect(b.getByRole('link', { name: title })).toHaveCount(0);
    await expect(b.getByText(/Henüz bir panon yok/)).toBeVisible();
  });

  test('B who is on the board is sent away and told why', async ({ page, newPage }) => {
    const { a, b, boardId, title } = await collaborate(page, newPage);
    await openBoardAs(a, boardId, title);
    await openBoardAs(b, boardId, title);

    await openBoardMenuItem(a, 'Panoyu sil');
    await a.getByRole('dialog', { name: 'Pano silinsin mi?' }).getByRole('button', { name: 'Panoyu sil' }).click();

    await expect(b).toHaveURL('/boards');
    await expect(toast(b, `“${title}” panosu silindi.`)).toBeVisible();
    await expect(b.getByRole('link', { name: title })).toHaveCount(0);
  });
});

test('a board A invites B to appears on B\'s boards page and opens', async ({ page, newPage }) => {
  const { a, b, emailB, boardId, title } = await collaborate(page, newPage, {
    lists: ['Yapılacaklar'],
    member: false,
  });
  await openBoardAs(a, boardId, title);
  await openBoardsPageAs(b);
  await expect(b.getByText(/Henüz bir panon yok/)).toBeVisible();

  const dialog = await openMembers(a);
  await dialog.getByLabel('E-posta', { exact: true }).fill(emailB);
  await dialog.getByRole('button', { name: 'Davet et', exact: true }).click();

  const link = b.getByRole('link', { name: title });
  await expect(link).toBeVisible();
  await link.click();
  await expect(b.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(b.getByRole('list', { name: 'Listeler' })).toContainText('Yapılacaklar');
});

test('a card A adds while B holds a card does not break B\'s keyboard move', async ({ page, newPage }) => {
  const { a, b, tokenA, boardId, title } = await collaborate(page, newPage, {
    lists: ['Yapılacaklar'],
    cards: { Yapılacaklar: ['Birinci', 'İkinci', 'Üçüncü'] },
  });
  await openBoardAs(b, boardId, title);
  await expect.poll(() => cardsByList(b, ['Yapılacaklar'])).toEqual({
    Yapılacaklar: ['Birinci', 'İkinci', 'Üçüncü'],
  });
  const announced = (text: string) => expect(b.getByText(text, { exact: true })).toBeAttached();

  await tile(b, 'Birinci').focus();
  await b.keyboard.press('Space');
  await announced('“Birinci” kartı tutuldu. “Yapılacaklar” listesinde 1. sırada.');
  await keyboardDragReady(b);

  // The remote card reaches B's browser while the card is still in hand: it waits for the drop.
  await seedCard(a, tokenA, boardId, 'Yapılacaklar', 'Uzaktan');
  await expectFrame(b, /card:created.*Uzaktan/);
  await expect(tile(b, 'Uzaktan')).toHaveCount(0);

  await b.keyboard.press('ArrowDown');
  await announced('“Birinci” kartı “Yapılacaklar” listesinde 2. sıraya geldi.');
  await b.keyboard.press('Space');
  await announced('“Birinci” kartı “Yapılacaklar” listesinde 2. sıraya bırakıldı.');

  const expected = { Yapılacaklar: ['İkinci', 'Birinci', 'Üçüncü', 'Uzaktan'] };
  await expect.poll(() => cardsByList(b, ['Yapılacaklar'])).toEqual(expected);
  await expect(b.getByText(/başka biri tarafından değiştirildi|taşınamadı/)).toHaveCount(0);

  await b.reload();
  await expect.poll(() => cardsByList(b, ['Yapılacaklar'])).toEqual(expected);
});

test('A archives a card and B loses it; A restores it and B gets it back at the end', async ({
  page,
  newPage,
}) => {
  const { a, b, boardId, title } = await collaborate(page, newPage, {
    lists: ['Yapılacaklar'],
    cards: { Yapılacaklar: ['Birinci', 'İkinci'] },
  });
  await openBoardAs(a, boardId, title);
  await openBoardAs(b, boardId, title);
  const lists = ['Yapılacaklar'];
  await expect.poll(() => cardsByList(b, lists)).toEqual({ Yapılacaklar: ['Birinci', 'İkinci'] });

  await a.getByRole('button', { name: '“Birinci” kartının işlemleri' }).click();
  await a.getByRole('dialog', { name: 'Kart işlemleri' }).getByRole('button', { name: 'Arşivle' }).click();
  await expect.poll(() => cardsByList(b, lists)).toEqual({ Yapılacaklar: ['İkinci'] });

  await openBoardMenuItem(a, 'Arşiv');
  const archive = a.getByRole('dialog', { name: 'Arşiv' });
  await archive.getByRole('button', { name: '“Birinci” kartını geri yükle' }).click();
  await expect(archive.getByText('Arşivde kart yok.')).toBeVisible();
  await expect.poll(() => cardsByList(b, lists)).toEqual({ Yapılacaklar: ['İkinci', 'Birinci'] });
});

const cardMembers = (page: Page, title: string) =>
  tile(page, title).getByRole('list', { name: 'Kart üyeleri' });

test('A puts B on a card, picks a cover and completes it; B sees avatar, cover and check live, then the avatar leaves', async ({
  page,
  newPage,
}) => {
  const { a, b, boardId, title } = await collaborate(page, newPage, {
    lists: ['Yapılacaklar'],
    cards: { Yapılacaklar: ['Rapor'] },
  });
  await openBoardAs(a, boardId, title);
  await openBoardAs(b, boardId, title);
  await expect(tile(b, 'Rapor')).toBeVisible();
  let reloadsOfB = 0;
  b.on('load', () => reloadsOfB++);

  const dialog = await openCard(a, 'Rapor');
  const sideButton = (name: string) =>
    dialog.getByRole('group', { name: 'Kart işlemleri' }).getByRole('button', { name, exact: true });

  await sideButton('Üyeler').click();
  await dialog.getByRole('checkbox', { name: B_NAME }).click();
  await expect(cardMembers(b, 'Rapor')).toContainText(B_NAME);
  await dialog.getByRole('button', { name: 'Tamam' }).click();

  await sideButton('Kapak').click();
  await dialog.getByTitle('Mor', { exact: true }).click();
  await expect(dialog.getByTestId('card-cover')).toHaveClass(/bg-label-purple/);
  await expect(tile(b, 'Rapor').locator('.bg-label-purple')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Tamam' }).click();

  await dialog.locator('label').filter({ hasText: 'Kartı tamamla' }).click();
  await expect(tile(b, 'Rapor')).toContainText('Kart tamamlandı');

  await sideButton('Üyeler').click();
  await dialog.getByRole('checkbox', { name: B_NAME }).click();
  await expect(dialog.getByRole('checkbox', { name: B_NAME })).not.toBeChecked();
  await expect(cardMembers(b, 'Rapor')).toHaveCount(0);
  await expect(tile(b, 'Rapor').locator('.bg-label-purple')).toHaveCount(1);
  expect(reloadsOfB).toBe(0);
});

test('an open card on B\'s screen shows A\'s member, cover and completion as they happen', async ({
  page,
  newPage,
}) => {
  const { a, b, tokenA, userIdB, boardId, title } = await collaborate(page, newPage, {
    lists: ['Yapılacaklar'],
    cards: { Yapılacaklar: ['Rapor'] },
  });
  await openBoardAs(b, boardId, title);
  const dialog = await openCard(b, 'Rapor');
  const cardId = b.url().split('/').pop() ?? '';

  await apiAssignMember(a, tokenA, cardId, userIdB);
  await expect(dialog.getByRole('list', { name: 'Kartın üyeleri' })).toContainText(B_NAME);

  await apiPatchCard(a, tokenA, cardId, { coverColor: 'GREEN', isCompleted: true });
  await expect(dialog.getByTestId('card-cover')).toHaveClass(/bg-label-green/);
  await expect(dialog.getByRole('checkbox', { name: 'Kartı tamamla' })).toBeChecked();
});

test('B\'s watching shows on B\'s screen and does not leak to A\'s', async ({ page, newPage }) => {
  const { a, b, tokenA, boardId, title } = await collaborate(page, newPage, {
    lists: ['Yapılacaklar'],
    cards: { Yapılacaklar: ['Rapor'] },
  });
  await openBoardAs(a, boardId, title);
  await openBoardAs(b, boardId, title);
  const dialog = await openCard(b, 'Rapor');

  await dialog.getByRole('button', { name: 'Kartı izle' }).click();
  await expect(dialog.getByRole('button', { name: 'Kartı izle' })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'Kapat' }).click();
  await expect(tile(b, 'Rapor')).toContainText('İzliyorsun');

  // Events reach A in order: once a card created after B's watch is on A's screen, a leaked watch would be too.
  await seedCard(a, tokenA, boardId, 'Yapılacaklar', 'İşaretçi');
  await expect(tile(a, 'İşaretçi')).toBeVisible();
  await expect(tile(a, 'Rapor')).not.toContainText('İzliyorsun');
  await expect(tile(b, 'Rapor')).toContainText('İzliyorsun');
});

test('when A removes a member from the board, that person\'s avatar leaves the cards on A\'s screen', async ({
  page,
  newPage,
  request,
}) => {
  const { a, tokenA, boardId, title } = await collaborate(page, newPage, {
    lists: ['Yapılacaklar'],
    cards: { Yapılacaklar: ['Rapor'] },
  });
  const carol = await registerUser(request, 'Can Üye');
  await apiInvite(a, tokenA, boardId, carol.email);
  const cardId = await seedCard(a, tokenA, boardId, 'Yapılacaklar', 'Plan');
  await apiAssignMember(a, tokenA, cardId, carol.userId);
  await openBoardAs(a, boardId, title);
  await expect(cardMembers(a, 'Plan')).toContainText('Can Üye');

  const members = await openMembers(a);
  await members.getByRole('button', { name: 'Can Üye kişisini panodan çıkar' }).click();
  await a.getByRole('dialog', { name: 'Üye çıkarılsın mı?' }).getByRole('button', { name: 'Çıkar', exact: true }).click();
  await expect(members.getByRole('button', { name: 'Can Üye kişisini panodan çıkar' })).toHaveCount(0);
  await members.getByRole('button', { name: 'Kapat' }).click();

  await expect(cardMembers(a, 'Plan')).toHaveCount(0);
  await a.reload();
  await expect(tile(a, 'Plan')).toBeVisible();
  await expect(cardMembers(a, 'Plan')).toHaveCount(0);
});

const feedOf = (dialog: Locator) => dialog.getByRole('list', { name: 'Yorumlar ve etkinlik' });
const feedItems = (dialog: Locator) => feedOf(dialog).getByRole('listitem');

/** B has the card open and its feed loaded; returns the dialog and the card id. */
async function bOpensCard(b: Page, title: string): Promise<{ dialog: Locator; cardId: string }> {
  const dialog = await openCard(b, title);
  await expect(dialog.getByRole('textbox', { name: 'Yorum yaz' })).toBeVisible();
  await expect(dialog.getByText('Yorumlar yükleniyor…')).toHaveCount(0);
  return { dialog, cardId: b.url().split('/').pop() ?? '' };
}

test('A\'s comment, edit and deletion show in B\'s open card and on its tile without a reload', async ({
  page,
  newPage,
}) => {
  const { a, b, tokenA, boardId, title } = await collaborate(page, newPage, {
    lists: ['Yapılacaklar'],
    cards: { Yapılacaklar: ['Rapor'] },
  });
  await openBoardAs(b, boardId, title);
  const { dialog, cardId } = await bOpensCard(b, 'Rapor');
  let reloadsOfB = 0;
  b.on('load', () => reloadsOfB++);

  const commentId = await apiAddComment(a, tokenA, cardId, 'Ayşe yazdı');
  await expect(feedItems(dialog)).toHaveCount(1);
  await expect(feedItems(dialog).first()).toContainText(`${A_NAME}`);
  await expect(feedItems(dialog).first()).toContainText('Ayşe yazdı');
  await expect(tile(b, 'Rapor')).toContainText('1 yorum');

  await apiEditComment(a, tokenA, commentId, 'Ayşe düzeltti');
  await expect(feedItems(dialog).first()).toContainText('Ayşe düzeltti');
  await expect(feedItems(dialog).first()).toContainText('(düzenlendi)');
  await expect(dialog.getByText('Ayşe yazdı')).toHaveCount(0);

  await apiDeleteComment(a, tokenA, commentId);
  await expect(dialog.getByText('Henüz yorum yok.')).toBeVisible();
  await expect(tile(b, 'Rapor')).not.toContainText(/\d+ yorum/);
  expect(reloadsOfB).toBe(0);
});

test('A\'s comment on a card B has not opened raises the badge on B\'s tile only for that card', async ({
  page,
  newPage,
}) => {
  const { a, b, tokenA, boardId, title } = await collaborate(page, newPage, {
    lists: ['Yapılacaklar'],
    cards: { Yapılacaklar: ['Birinci', 'İkinci'] },
  });
  const firstId = await seedCard(a, tokenA, boardId, 'Yapılacaklar', 'Üçüncü');
  await openBoardAs(b, boardId, title);

  await apiAddComment(a, tokenA, firstId, 'Sadece üçüncüye');

  await expect(tile(b, 'Üçüncü')).toContainText('1 yorum');
  await expect(tile(b, 'Birinci')).not.toContainText(/\d+ yorum/);
  await expect(tile(b, 'İkinci')).not.toContainText(/\d+ yorum/);
});

test('A moving the card adds a "taşıdı" entry to B\'s activity feed', async ({ page, newPage }) => {
  const { a, b, tokenA, boardId, title } = await collaborate(page, newPage, {
    lists: ['Yapılacaklar', 'Bitti'],
    cards: { Yapılacaklar: ['Rapor'] },
  });
  await openBoardAs(b, boardId, title);
  const { dialog, cardId } = await bOpensCard(b, 'Rapor');
  await dialog.getByRole('button', { name: 'Ayrıntıları göster' }).click();
  await expect(feedItems(dialog).filter({ hasText: 'listesine ekledi' })).toBeVisible();

  await apiMoveCardToList(a, tokenA, boardId, cardId, 'Bitti');

  await expect(feedItems(dialog).first()).toContainText(
    `${A_NAME} bu kartı Yapılacaklar listesinden Bitti listesine taşıdı`,
  );
});

test('a MEMBER sees no "Düzenle" or "Sil" on someone else\'s comment', async ({ page, newPage }) => {
  const { a, b, tokenA, boardId, title } = await collaborate(page, newPage, {
    lists: ['Yapılacaklar'],
    cards: { Yapılacaklar: ['Rapor'] },
  });
  await openBoardAs(b, boardId, title);
  const { dialog, cardId } = await bOpensCard(b, 'Rapor');

  await apiAddComment(a, tokenA, cardId, 'Ayşe\'nin yorumu');

  const item = feedItems(dialog).filter({ hasText: 'Ayşe\'nin yorumu' });
  await expect(item).toBeVisible();
  await expect(item.getByRole('button')).toHaveCount(0);
});

test('an ADMIN can delete but not edit someone else\'s comment', async ({ page, newPage }) => {
  const { a, b, tokenA, emailB, boardId, title } = await collaborate(page, newPage, {
    lists: ['Yapılacaklar'],
    cards: { Yapılacaklar: ['Rapor'] },
    member: false,
  });
  await apiInvite(a, tokenA, boardId, emailB, 'ADMIN');
  await openBoardAs(b, boardId, title);
  const { dialog, cardId } = await bOpensCard(b, 'Rapor');

  await apiAddComment(a, tokenA, cardId, 'Ayşe\'nin yorumu');

  const item = feedItems(dialog).filter({ hasText: 'Ayşe\'nin yorumu' });
  await expect(item.getByRole('button', { name: 'Yorumu sil' })).toBeVisible();
  await expect(item.getByRole('button', { name: 'Yorumu düzenle' })).toHaveCount(0);

  await item.getByRole('button', { name: 'Yorumu sil' }).click();
  await b.getByRole('dialog', { name: 'Yorum silinsin mi?' }).getByRole('button', { name: 'Sil' }).click();
  await expect(dialog.getByText('Henüz yorum yok.')).toBeVisible();
});
