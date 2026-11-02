import { expect, type Locator, type Page, test } from '@playwright/test';
import { keyboardDragReady, seedBoard, signUp } from './helpers.js';

/* Needs the backend and its database (the Playwright config starts both dev servers). */

const cardList = (page: Page, listTitle: string) =>
  page.getByRole('list', { name: `“${listTitle}” kartları` });

/** Drag handles of the cards in a list (the tile itself), top to bottom. */
const cardTiles = (page: Page, listTitle: string) =>
  cardList(page, listTitle).locator('[aria-roledescription="sıralanabilir kart"]');

const card = (page: Page, title: string) =>
  page.locator('[aria-roledescription="sıralanabilir kart"]', { hasText: title });

/** Card titles per list, so one poll checks the whole board. */
async function board(page: Page, lists: string[]): Promise<Record<string, string[]>> {
  const entries = await Promise.all(
    lists.map(async (list) => [list, await cardTiles(page, list).allTextContents()] as const),
  );
  return Object.fromEntries(entries);
}

async function openSeededBoard(
  page: Page,
  lists: string[],
  cards: Record<string, string[]>,
): Promise<string> {
  const token = await signUp(page);
  const boardId = await seedBoard(page, token, 'Kart testi', lists, cards);
  await page.goto(`/boards/${boardId}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Kart testi' })).toBeVisible();
  return boardId;
}

/** Presses the mouse on `source`, then moves in steps to the point in `target` and releases. */
async function dragTo(page: Page, source: Locator, target: Locator, at: 'top' | 'center' = 'center') {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('drag source or target is not visible');

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 5 });
  const y = at === 'top' ? to.y + 4 : to.y + to.height / 2;
  await page.mouse.move(to.x + to.width / 2, y, { steps: 20 });
  await page.mouse.up();
}

test('add cards from the composer', async ({ page }) => {
  await openSeededBoard(page, ['Yapılacaklar'], {});

  await page.getByRole('button', { name: '“Yapılacaklar” listesine kart ekle' }).click();
  const input = page.getByRole('textbox', { name: 'Kart başlığı' });
  await input.fill('Taslak hazırla');
  await input.press('Enter');
  await expect(input).toHaveValue('');
  await input.fill('Gözden geçir');
  await input.press('Enter');

  await expect.poll(() => board(page, ['Yapılacaklar'])).toEqual({
    Yapılacaklar: ['Taslak hazırla', 'Gözden geçir'],
  });
  await input.press('Escape');
  await expect(
    page.getByRole('button', { name: '“Yapılacaklar” listesine kart ekle' }),
  ).toBeFocused();

  await page.reload();
  await expect.poll(() => board(page, ['Yapılacaklar'])).toEqual({
    Yapılacaklar: ['Taslak hazırla', 'Gözden geçir'],
  });
});

test('drag a card to another list with the mouse; the move survives a reload', async ({ page }) => {
  const lists = ['Yapılacaklar', 'Yapılıyor', 'Boş'];
  await openSeededBoard(page, lists, { Yapılacaklar: ['A', 'B'], Yapılıyor: ['C'] });
  await expect.poll(() => board(page, lists)).toEqual({
    Yapılacaklar: ['A', 'B'],
    Yapılıyor: ['C'],
    Boş: [],
  });

  // A goes on top of C in the next list.
  await dragTo(page, card(page, 'A'), card(page, 'C'), 'top');
  await expect.poll(() => board(page, lists)).toEqual({
    Yapılacaklar: ['B'],
    Yapılıyor: ['A', 'C'],
    Boş: [],
  });

  // B goes into the empty list (onto its "Kart ekle" area).
  await dragTo(page, card(page, 'B'), page.getByRole('button', { name: '“Boş” listesine kart ekle' }));
  await expect.poll(() => board(page, lists)).toEqual({
    Yapılacaklar: [],
    Yapılıyor: ['A', 'C'],
    Boş: ['B'],
  });

  await page.reload();
  await expect.poll(() => board(page, lists)).toEqual({
    Yapılacaklar: [],
    Yapılıyor: ['A', 'C'],
    Boş: ['B'],
  });
});

test('a refused drag puts the card back at once, not after the board reloads', async ({ page }) => {
  const lists = ['Yapılacaklar', 'Bitti'];
  const boardId = await openSeededBoard(page, lists, { Yapılacaklar: ['A'], Bitti: ['B'] });
  await expect.poll(() => board(page, lists)).toEqual({ Yapılacaklar: ['A'], Bitti: ['B'] });
  await page.route('**/api/v1/cards/*/move', (route) =>
    route.fulfill({ status: 500, json: { statusCode: 500, code: 'INTERNAL_ERROR', message: 'x' } }),
  );
  // A slow reload: the card must be back long before it arrives.
  await page.route(`**/api/v1/boards/${boardId}`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await route.continue();
  });

  await dragTo(page, card(page, 'A'), card(page, 'B'), 'top');

  await expect(page.getByText('Kart taşınamadı. Tekrar dene.')).toBeVisible();
  await expect
    .poll(() => board(page, lists), { timeout: 1500 })
    .toEqual({ Yapılacaklar: ['A'], Bitti: ['B'] });
  // The card remounted in its old list and has the focus back.
  await expect(card(page, 'A')).toBeFocused();
});

test('reorder cards inside a list with the mouse', async ({ page }) => {
  await openSeededBoard(page, ['Yapılacaklar'], { Yapılacaklar: ['A', 'B', 'C'] });

  await dragTo(page, card(page, 'C'), card(page, 'A'));
  await expect.poll(() => board(page, ['Yapılacaklar'])).toEqual({ Yapılacaklar: ['C', 'A', 'B'] });

  await page.reload();
  await expect.poll(() => board(page, ['Yapılacaklar'])).toEqual({ Yapılacaklar: ['C', 'A', 'B'] });
});

test('move cards with the keyboard, within and across lists', async ({ page }) => {
  const lists = ['Yapılacaklar', 'Bitti'];
  await openSeededBoard(page, lists, { Yapılacaklar: ['A', 'B'], Bitti: ['C'] });
  await expect.poll(() => board(page, lists)).toEqual({ Yapılacaklar: ['A', 'B'], Bitti: ['C'] });

  // Each step waits for the screen reader announcement, like a user listening to it.
  const announced = (text: string) => expect(page.getByText(text, { exact: true })).toBeAttached();

  await card(page, 'A').focus();
  await page.keyboard.press('Space');
  await announced('“A” kartı tutuldu. “Yapılacaklar” listesinde 1. sırada.');
  await keyboardDragReady(page);
  await page.keyboard.press('ArrowDown');
  await announced('“A” kartı “Yapılacaklar” listesinde 2. sıraya geldi.');
  await page.keyboard.press('Space');
  await announced('“A” kartı “Yapılacaklar” listesinde 2. sıraya bırakıldı.');
  await expect.poll(() => board(page, lists)).toEqual({ Yapılacaklar: ['B', 'A'], Bitti: ['C'] });
  await expect(card(page, 'A')).toBeFocused();

  await page.keyboard.press('Space');
  await announced('“A” kartı tutuldu. “Yapılacaklar” listesinde 2. sırada.');
  await keyboardDragReady(page);
  await page.keyboard.press('ArrowRight');
  await announced('“A” kartı “Bitti” listesinde 1. sıraya geldi.');
  await page.keyboard.press('Space');
  await announced('“A” kartı “Bitti” listesinde 1. sıraya bırakıldı.');
  await expect.poll(() => board(page, lists)).toEqual({ Yapılacaklar: ['B'], Bitti: ['A', 'C'] });
  await expect(card(page, 'A')).toBeFocused();

  await page.reload();
  await expect.poll(() => board(page, lists)).toEqual({ Yapılacaklar: ['B'], Bitti: ['A', 'C'] });
});

test('move a card with the actions dialog; it keeps the focus', async ({ page }) => {
  const lists = ['Yapılacaklar', 'Bitti'];
  await openSeededBoard(page, lists, { Yapılacaklar: ['A'], Bitti: ['B', 'C'] });

  await page.getByRole('button', { name: '“A” kartının işlemleri' }).click();
  const dialog = page.getByRole('dialog', { name: 'Kart işlemleri' });
  await dialog.getByRole('combobox', { name: 'Liste' }).selectOption({ label: 'Bitti' });
  await expect(dialog.getByRole('combobox', { name: 'Sıra' })).toHaveValue('3');
  await dialog.getByRole('combobox', { name: 'Sıra' }).selectOption('2');
  await dialog.getByRole('button', { name: 'Taşı' }).click();

  await expect(dialog).toBeHidden();
  await expect.poll(() => board(page, lists)).toEqual({ Yapılacaklar: [], Bitti: ['B', 'A', 'C'] });
  await expect(card(page, 'A')).toBeFocused();

  await page.reload();
  await expect.poll(() => board(page, lists)).toEqual({ Yapılacaklar: [], Bitti: ['B', 'A', 'C'] });
});

test('archive a card, then restore it from the archive', async ({ page }) => {
  await openSeededBoard(page, ['Yapılacaklar'], { Yapılacaklar: ['A', 'B'] });

  await page.getByRole('button', { name: '“A” kartının işlemleri' }).click();
  await page.getByRole('dialog', { name: 'Kart işlemleri' }).getByRole('button', { name: 'Arşivle' }).click();
  await expect.poll(() => board(page, ['Yapılacaklar'])).toEqual({ Yapılacaklar: ['B'] });
  await expect(page.getByText('“A” kartı arşivlendi.')).toBeVisible();

  await page.getByRole('button', { name: 'Arşiv', exact: true }).click();
  const archive = page.getByRole('dialog', { name: 'Arşiv' });
  await expect(archive.getByText('“Yapılacaklar” listesinde')).toBeVisible();
  await archive.getByRole('button', { name: '“A” kartını geri yükle' }).click();
  await expect(archive.getByText('Arşivde kart yok.')).toBeVisible();
  await archive.getByRole('button', { name: 'Kapat' }).click();

  await expect.poll(() => board(page, ['Yapılacaklar'])).toEqual({ Yapılacaklar: ['B', 'A'] });
});
