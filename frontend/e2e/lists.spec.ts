import { expect, test, type Page } from '@playwright/test';
import { keyboardDragReady, openBoardMenuItem, openListMenuItem, seedBoard, signUp } from './helpers.js';

/* Needs the backend and its database (the Playwright config starts both dev servers). */

const listColumn = (page: Page) => page.getByRole('list', { name: 'Listeler' });

/** Visible list titles, left to right. */
async function listTitles(page: Page): Promise<string[]> {
  return listColumn(page).getByRole('heading', { level: 2 }).getByRole('button').allTextContents();
}

async function openSeededBoard(page: Page, lists: string[]) {
  const token = await signUp(page);
  const boardId = await seedBoard(page, token, 'Liste testi', lists);
  await page.goto(`/boards/${boardId}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Liste testi' })).toBeVisible();
}

test('add lists from the composer', async ({ page }) => {
  await openSeededBoard(page, []);

  await page.getByRole('button', { name: 'Liste ekle' }).click();
  const input = page.getByRole('textbox', { name: 'Liste adı' });
  await input.fill('Yapılacaklar');
  await input.press('Enter');
  await expect(input).toHaveValue('');
  await input.fill('Bitti');
  await input.press('Enter');

  await expect.poll(() => listTitles(page)).toEqual(['Yapılacaklar', 'Bitti']);
  await input.press('Escape');
  await expect(page.getByRole('button', { name: 'Başka liste ekle' })).toBeFocused();
});

test('drag a list with the mouse; the order survives a reload', async ({ page }) => {
  await openSeededBoard(page, ['A', 'B', 'C']);
  await expect.poll(() => listTitles(page)).toEqual(['A', 'B', 'C']);

  // Grab C by its title area and drop it over A.
  const source = page.getByRole('button', { name: '“C” listesini taşı' });
  const target = page.getByRole('button', { name: '“A” listesini taşı' });
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('list handles are not visible');

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x - 20, from.y + 5, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
  await page.mouse.up();

  await expect.poll(() => listTitles(page)).toEqual(['C', 'A', 'B']);
  await page.reload();
  await expect.poll(() => listTitles(page)).toEqual(['C', 'A', 'B']);
});

test('move a list with the keyboard', async ({ page }) => {
  await openSeededBoard(page, ['A', 'B', 'C']);
  await expect.poll(() => listTitles(page)).toEqual(['A', 'B', 'C']);

  // Each step waits for the screen reader announcement, like a user listening to it.
  const announced = (text: string) => expect(page.getByText(text, { exact: true })).toBeAttached();

  await page.getByRole('button', { name: '“A” listesini taşı' }).focus();
  await page.keyboard.press('Space');
  await announced('“A” listesi tutuldu. 1. sırada, toplam 3 liste.');
  await keyboardDragReady(page);
  await page.keyboard.press('ArrowRight');
  await announced('“A” listesi 2. sıraya geldi.');
  await page.keyboard.press('ArrowRight');
  await announced('“A” listesi 3. sıraya geldi.');
  await page.keyboard.press('Space');
  await announced('“A” listesi 3. sıraya bırakıldı.');

  await expect.poll(() => listTitles(page)).toEqual(['B', 'C', 'A']);
  await page.reload();
  await expect.poll(() => listTitles(page)).toEqual(['B', 'C', 'A']);
});

/** Scroll metrics of the element that holds a list's cards (the parent of the card `ol`). */
interface ScrollArea {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
  overflowY: string;
}

const cardScrollArea = (page: Page, listTitle: string) =>
  page.getByRole('list', { name: `“${listTitle}” kartları` });

/** Runs `body` in the page with `el` bound to the parent of the `ol` that has this label. */
const inParentOfList = (label: string, body: string) =>
  `(() => { const el = document.querySelector('ol[aria-label="${label}"]').parentElement; ${body} })()`;

function scrollAreaOf(page: Page, listTitle: string): Promise<ScrollArea> {
  return page.evaluate<ScrollArea>(
    inParentOfList(
      `“${listTitle}” kartları`,
      `return {
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
        scrollTop: el.scrollTop,
        overflowY: getComputedStyle(el).overflowY,
      };`,
    ),
  );
}

test.describe('bounded list columns on a desktop screen', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('a list of 30 cards fits the screen and only its cards scroll', async ({ page }) => {
    const token = await signUp(page);
    const cards = Array.from({ length: 30 }, (_, index) => `Kart ${index + 1}`);
    const boardId = await seedBoard(page, token, 'Uzun liste', ['Uzun'], { Uzun: cards });
    await page.goto(`/boards/${boardId}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Uzun liste' })).toBeVisible();
    await expect(page.getByText('Kart 1', { exact: true })).toBeVisible();

    // The page itself does not scroll, and the column ends inside the viewport.
    const doc = await page.evaluate<{ scrollHeight: number; clientHeight: number; innerHeight: number }>(
      '({ scrollHeight: document.documentElement.scrollHeight, clientHeight: document.documentElement.clientHeight, innerHeight: window.innerHeight })',
    );
    expect(doc.scrollHeight).toBeLessThanOrEqual(doc.clientHeight);
    const column = await listColumn(page).locator('> li').first().boundingBox();
    expect(column).not.toBeNull();
    expect((column?.y ?? 0) + (column?.height ?? 0)).toBeLessThanOrEqual(doc.innerHeight);

    // Header and "Kart ekle" stay visible; the cards scroll inside the column.
    await expect(page.getByRole('button', { name: 'Uzun', exact: true })).toBeInViewport();
    await expect(page.getByRole('button', { name: '“Uzun” listesine kart ekle' })).toBeInViewport();
    const before = await scrollAreaOf(page, 'Uzun');
    expect(before.overflowY).toBe('auto');
    expect(before.scrollHeight).toBeGreaterThan(before.clientHeight);

    await page.getByText('Kart 30', { exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByText('Kart 30', { exact: true })).toBeInViewport();
    await expect(page.getByRole('button', { name: '“Uzun” listesine kart ekle' })).toBeInViewport();
  });

  test('dragging a card to the bottom edge scrolls the card area', async ({ page }) => {
    const token = await signUp(page);
    const cards = Array.from({ length: 30 }, (_, index) => `Kart ${index + 1}`);
    const boardId = await seedBoard(page, token, 'Uzun liste', ['Uzun'], { Uzun: cards });
    await page.goto(`/boards/${boardId}`);
    await expect(page.getByText('Kart 1', { exact: true })).toBeVisible();

    const card = await page.getByText('Kart 1', { exact: true }).boundingBox();
    const area = await cardScrollArea(page, 'Uzun').locator('xpath=..').boundingBox();
    if (!card || !area) throw new Error('card area is not visible');

    await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
    await page.mouse.down();
    await page.mouse.move(card.x + card.width / 2, card.y + 20, { steps: 5 });
    await page.mouse.move(card.x + card.width / 2, area.y + area.height - 6, { steps: 15 });
    await expect(listColumn(page).locator('xpath=..')).toHaveAttribute('data-dragging', 'card');
    await expect.poll(async () => (await scrollAreaOf(page, 'Uzun')).scrollTop).toBeGreaterThan(0);
    await page.mouse.up();
  });
});

test.describe('single column layout on a narrow screen', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

  test('one list fills most of the screen and scrolling snaps to the next', async ({ page }) => {
    const token = await signUp(page);
    const boardId = await seedBoard(page, token, 'Dar ekran', ['A', 'B', 'C'], { A: ['Kart a'] });
    await page.goto(`/boards/${boardId}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Dar ekran' })).toBeVisible();
    await expect(page.getByText('Kart a', { exact: true })).toBeVisible();

    const columns = listColumn(page).locator('> li');
    const first = await columns.nth(0).boundingBox();
    expect(first?.width).toBeGreaterThan(375 * 0.85 - 2);
    expect(first?.width).toBeLessThan(375 * 0.85 + 2);
    // The next list peeks in from the right edge.
    const second = await columns.nth(1).boundingBox();
    expect(second?.x).toBeLessThan(375);

    const snapType = await page.evaluate<string>(
      inParentOfList('Listeler', 'return getComputedStyle(el).scrollSnapType;'),
    );
    expect(snapType).toContain('mandatory');

    // A scroll that stops between two lists settles with the second one at the left padding.
    await page.evaluate(inParentOfList('Listeler', 'el.scrollLeft = 250;'));
    await expect
      .poll(async () => (await columns.nth(1).boundingBox())?.x ?? Number.NaN)
      .toBeGreaterThan(14);
    await expect
      .poll(async () => (await columns.nth(1).boundingBox())?.x ?? Number.NaN)
      .toBeLessThan(18);
  });

  test('at 320 px a list is as wide as the screen allows and the page does not overflow', async ({
    page,
  }) => {
    const token = await signUp(page);
    const boardId = await seedBoard(page, token, 'Dar ekran', ['A', 'B']);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(`/boards/${boardId}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Dar ekran' })).toBeVisible();

    const box = await listColumn(page).locator('> li').first().boundingBox();
    expect(box?.width).toBeGreaterThan(320 * 0.85 - 2);
    expect(box?.width).toBeLessThan(320 * 0.85 + 2);
    const page320 = await page.evaluate<{ scrollWidth: number; clientWidth: number }>(
      '({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth })',
    );
    expect(page320.scrollWidth).toBeLessThanOrEqual(page320.clientWidth);
  });
});

test('the list header counts the cards and its menu opens the card composer', async ({ page }) => {
  await openSeededBoard(page, ['A']);
  await expect(page.getByText('0 kart', { exact: true })).toBeVisible();

  await openListMenuItem(page, 'A', 'Kart ekle');
  const input = page.getByRole('textbox', { name: 'Kart başlığı' });
  await expect(input).toBeFocused();
  await input.fill('Birinci');
  await input.press('Enter');

  await expect(page.getByText('1 kart', { exact: true })).toBeVisible();
});

test('archive a list, then restore it from the archive', async ({ page }) => {
  await openSeededBoard(page, ['A', 'B']);

  await openListMenuItem(page, 'A', 'Listeyi arşivle');
  await expect.poll(() => listTitles(page)).toEqual(['B']);
  await expect(page.getByText('“A” listesi arşivlendi.')).toBeVisible();

  await openBoardMenuItem(page, 'Arşiv');
  const dialog = page.getByRole('dialog', { name: 'Arşiv' });
  await dialog.getByRole('button', { name: '“A” listesini geri yükle' }).click();
  await expect(dialog.getByText('Arşivde liste yok.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Kapat' }).click();

  await expect.poll(() => listTitles(page)).toEqual(['B', 'A']);
});
