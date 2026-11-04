import { expect, test } from '@playwright/test';
import { apiInvite, openBoardAs, openBoardMenuItem, seedBoard, signUp, signUpAs, watchRealtime } from './helpers.js';

/* Needs the backend and its database (the Playwright config starts both dev servers). */

test('create, open, rename and delete a board', async ({ page }) => {
  await signUp(page, 'Pano Testçi');
  await page.goto('/boards');
  await expect(page.getByText(/Henüz bir panon yok/)).toBeVisible();

  // Create
  await page.getByRole('button', { name: 'Yeni pano oluştur' }).click();
  const dialog = page.getByRole('dialog', { name: 'Pano oluştur' });
  await dialog.getByLabel('Pano adı').fill('E2E panosu');
  await dialog.getByTitle('Mor').click();
  await expect(dialog.getByRole('radio', { name: 'Mor' })).toBeChecked();
  await dialog.getByRole('button', { name: 'Oluştur' }).click();

  await expect(page).toHaveURL(/\/boards\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name: 'E2E panosu' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Pano üyeleri' })).toContainText('Pano Testçi');

  // Rename, then check it survives a reload
  await page.getByRole('button', { name: 'E2E panosu' }).click();
  const titleInput = page.getByRole('textbox', { name: 'Pano adı' });
  await titleInput.fill('Yeniden adlandırıldı');
  await titleInput.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Yeniden adlandırıldı' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Yeniden adlandırıldı' })).toBeVisible();

  // Listed on the boards page
  await page.getByRole('link', { name: 'Trello Klonu' }).click();
  await expect(page).toHaveURL('/boards');
  await page.getByRole('link', { name: 'Yeniden adlandırıldı' }).click();

  // Delete
  await openBoardMenuItem(page, 'Panoyu sil');
  const confirm = page.getByRole('dialog', { name: 'Pano silinsin mi?' });
  await confirm.getByRole('button', { name: 'Panoyu sil' }).click();

  await expect(page).toHaveURL('/boards');
  await expect(page.getByRole('link', { name: 'Yeniden adlandırıldı' })).toHaveCount(0);
  await expect(page.getByText(/Henüz bir panon yok/)).toBeVisible();
});

test('Escape closes the create dialog and focus returns to the opener', async ({ page }) => {
  await signUp(page, 'Pano Testçi');
  await page.goto('/boards');

  const opener = page.getByRole('button', { name: 'Yeni pano oluştur' });
  await opener.click();
  await expect(page.getByRole('dialog', { name: 'Pano oluştur' })).toBeVisible();
  await expect(page.getByLabel('Pano adı')).toBeFocused();

  await page.keyboard.press('Escape');

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test.describe('a 320 px wide screen with touch', () => {
  test.use({ viewport: { width: 320, height: 640 }, hasTouch: true });

  test('the board page has no sideways overflow and touch targets of at least 44 px', async ({
    page,
  }) => {
    const token = await signUp(page, 'Pano Testçi');
    const boardId = await seedBoard(page, token, 'Dokunmatik pano', ['Yapılacaklar'], {
      Yapılacaklar: ['Birinci kart'],
    });
    await page.goto(`/boards/${boardId}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Dokunmatik pano' })).toBeVisible();
    await expect(page.getByText('Birinci kart')).toBeVisible();

    const page320 = await page.evaluate<{ scrollWidth: number; clientWidth: number }>(
      '({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth })',
    );
    expect(page320.scrollWidth).toBeLessThanOrEqual(page320.clientWidth);

    const targets = [
      page.getByRole('button', { name: 'Dokunmatik pano' }),
      page.getByRole('button', { name: 'Paylaş', exact: true }),
      page.getByRole('button', { name: 'Pano menüsü' }),
      page.getByRole('button', { name: '“Yapılacaklar” listesini taşı' }),
      page.getByRole('button', { name: 'Yapılacaklar', exact: true }),
      page.getByRole('button', { name: '“Yapılacaklar” listesinin işlemleri' }),
      page.getByRole('button', { name: '“Birinci kart” kartının işlemleri' }),
      page.getByRole('button', { name: '“Yapılacaklar” listesine kart ekle' }),
      page.getByRole('button', { name: 'Başka liste ekle' }),
      page.getByRole('button', { name: 'Pano değiştir' }),
      page.getByRole('link', { name: 'Pano', exact: true }),
    ];
    for (const target of targets) {
      const box = await target.boundingBox();
      expect(box, `${target}`).not.toBeNull();
      expect(box?.width, `${target} width`).toBeGreaterThanOrEqual(43.5);
      expect(box?.height, `${target} height`).toBeGreaterThanOrEqual(43.5);
    }

    // The list menu opens inside the 320 px screen and its items are touch-sized.
    await page.getByRole('button', { name: '“Yapılacaklar” listesinin işlemleri' }).tap();
    const listMenu = page.getByRole('menu', { name: '“Yapılacaklar” listesinin işlemleri' });
    const listMenuBox = await listMenu.boundingBox();
    expect(listMenuBox?.x).toBeGreaterThanOrEqual(0);
    expect((listMenuBox?.x ?? 0) + (listMenuBox?.width ?? 0)).toBeLessThanOrEqual(320);
    const listItems = await listMenu.getByRole('menuitem').all();
    expect(listItems).toHaveLength(2);
    for (const item of listItems) {
      const box = await item.boundingBox();
      expect(box?.height, 'list menu item height').toBeGreaterThanOrEqual(43.5);
    }
    await page.keyboard.press('Escape');

    // The board switcher opens above the bar, inside the 320 px screen, and covers no list.
    await page.getByRole('button', { name: 'Pano değiştir' }).tap();
    const switcher = page.getByRole('menu', { name: 'Pano değiştir' });
    const switcherBox = await switcher.boundingBox();
    expect(switcherBox?.x).toBeGreaterThanOrEqual(0);
    expect((switcherBox?.x ?? 0) + (switcherBox?.width ?? 0)).toBeLessThanOrEqual(320);
    for (const item of await switcher.getByRole('menuitemradio').all()) {
      const box = await item.boundingBox();
      expect(box?.height, 'switcher item height').toBeGreaterThanOrEqual(43.5);
    }
    await page.keyboard.press('Escape');
    const barBox = await page.getByRole('navigation', { name: 'Pano gezintisi' }).boundingBox();
    const listBox = await page.locator('[data-list-id]').first().boundingBox();
    if (barBox && listBox) expect(listBox.y + listBox.height).toBeLessThanOrEqual(barBox.y + 0.5);

    // The board menu opens inside the 320 px screen and its items are touch-sized.
    await page.getByRole('button', { name: 'Pano menüsü' }).tap();
    const menu = page.getByRole('menu', { name: 'Pano menüsü' });
    const menuBox = await menu.boundingBox();
    expect(menuBox?.x).toBeGreaterThanOrEqual(0);
    expect((menuBox?.x ?? 0) + (menuBox?.width ?? 0)).toBeLessThanOrEqual(320);
    const items = await menu.getByRole('menuitem').all();
    expect(items).toHaveLength(4);
    for (const item of items) {
      const box = await item.boundingBox();
      expect(box?.height, 'menu item height').toBeGreaterThanOrEqual(43.5);
    }
    await menu.getByRole('menuitem', { name: 'Arka plan', exact: true }).tap();
    const swatches = page.getByRole('dialog', { name: 'Arka plan' }).locator('label[title]');
    await expect(swatches).toHaveCount(9);
    for (const swatch of await swatches.all()) {
      const box = await swatch.boundingBox();
      expect(box?.width, 'swatch width').toBeGreaterThanOrEqual(43.5);
      expect(box?.height, 'swatch height').toBeGreaterThanOrEqual(43.5);
    }
  });
});

test('the owner changes the background; it survives a reload and shows live to a member', async ({
  page,
  browser,
  baseURL,
}) => {
  const surface = (target: typeof page) =>
    target.getByRole('heading', { level: 1 }).locator('xpath=ancestor::header/../..');

  const memberContext = await browser.newContext({ baseURL, locale: 'tr-TR' });
  try {
    const member = await memberContext.newPage();
    watchRealtime(member);
    const { email } = await signUpAs(member, 'Burak Üye');
    watchRealtime(page);
    const { token } = await signUpAs(page, 'Ayşe Sahip');
    const boardId = await seedBoard(page, token, 'Renkli pano');
    await apiInvite(page, token, boardId, email);

    await openBoardAs(member, boardId, 'Renkli pano');
    await member.getByRole('button', { name: 'Pano menüsü' }).click();
    await expect(member.getByRole('menuitem', { name: 'Etiketler' })).toBeVisible();
    await expect(member.getByRole('menuitem', { name: 'Arka plan' })).toHaveCount(0);
    await member.keyboard.press('Escape');
    await expect(surface(member)).toHaveClass(/bg-board-blue/);

    await openBoardAs(page, boardId, 'Renkli pano');
    const opener = page.getByRole('button', { name: 'Pano menüsü' });
    await openBoardMenuItem(page, 'Arka plan');
    const dialog = page.getByRole('dialog', { name: 'Arka plan' });
    await expect(dialog.getByRole('radio', { name: 'Mavi', exact: true })).toBeChecked();

    // Keyboard: the arrow keys move through the swatches and each applies at once.
    await dialog.getByRole('radio', { name: 'Mavi', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(dialog.getByRole('radio', { name: 'Yeşil', exact: true })).toBeChecked();
    await dialog.getByTitle('Mor').click();
    await expect(dialog.getByRole('radio', { name: 'Mor' })).toBeChecked();
    await expect(surface(page)).toHaveClass(/bg-board-purple/);

    // Live for the other person, without a reload.
    await expect(surface(member)).toHaveClass(/bg-board-purple/);

    // Escape closes the dialog and the focus goes back to the board menu button.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(opener).toBeFocused();

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Renkli pano' })).toBeVisible();
    await expect(surface(page)).toHaveClass(/bg-board-purple/);
  } finally {
    await memberContext.close();
  }
});

test('a board of another user shows the not found page', async ({ page }) => {
  await signUp(page, 'Pano Testçi');
  await page.goto('/boards/00000000-0000-4000-8000-000000000000');

  await expect(page.getByRole('heading', { level: 1, name: 'Pano bulunamadı' })).toBeVisible();
});

test('the board menu works by keyboard and gives focus back to its button after a dialog closes', async ({
  page,
}) => {
  const token = await signUp(page, 'Menü Testçi');
  const boardId = await seedBoard(page, token, 'Menülü pano');
  await page.goto(`/boards/${boardId}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Menülü pano' })).toBeVisible();
  await expect(page.getByText('Özel pano')).toBeAttached();
  const trigger = page.getByRole('button', { name: 'Pano menüsü' });

  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Etiketler' })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('menuitem', { name: 'Panoyu sil' })).toBeFocused();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Arşiv' })).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('the board switcher moves to another board by keyboard and keeps the focus on its button', async ({
  page,
}) => {
  const token = await signUp(page, 'Geçiş Testçi');
  const firstId = await seedBoard(page, token, 'Birinci pano');
  await seedBoard(page, token, 'İkinci pano');
  await page.goto(`/boards/${firstId}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Birinci pano' })).toBeVisible();
  const trigger = page.getByRole('button', { name: 'Pano değiştir' });

  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitemradio', { name: 'Birinci pano' })).toBeFocused();
  await expect(page.getByRole('menuitemradio', { name: 'Birinci pano' })).toBeChecked();
  await page.getByRole('menuitemradio', { name: 'İkinci pano' }).focus();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { level: 1, name: 'İkinci pano' })).toBeVisible();
  await expect(page).not.toHaveURL(new RegExp(firstId));
  await expect(trigger).toBeFocused();

  await trigger.press('ArrowDown');
  await page.getByRole('menuitem', { name: 'Tüm panolar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Panolarım' })).toBeVisible();
});
