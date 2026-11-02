import { expect, test, type Page } from '@playwright/test';
import { keyboardDragReady, seedBoard, signUp } from './helpers.js';

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

test('archive a list, then restore it from the archive', async ({ page }) => {
  await openSeededBoard(page, ['A', 'B']);

  await page.getByRole('button', { name: '“A” listesini arşivle' }).click();
  await expect.poll(() => listTitles(page)).toEqual(['B']);
  await expect(page.getByText('“A” listesi arşivlendi.')).toBeVisible();

  await page.getByRole('button', { name: 'Arşiv', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Arşiv' });
  await dialog.getByRole('button', { name: '“A” listesini geri yükle' }).click();
  await expect(dialog.getByText('Arşivde liste yok.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Kapat' }).click();

  await expect.poll(() => listTitles(page)).toEqual(['B', 'A']);
});
