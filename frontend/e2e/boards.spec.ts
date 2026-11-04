import { expect, test } from '@playwright/test';
import { seedBoard, signUp } from './helpers.js';

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
  await page.getByRole('link', { name: 'Trello Clone' }).click();
  await expect(page).toHaveURL('/boards');
  await page.getByRole('link', { name: 'Yeniden adlandırıldı' }).click();

  // Delete
  await page.getByRole('button', { name: 'Panoyu sil' }).click();
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
      page.getByRole('button', { name: 'Üyeler', exact: true }),
      page.getByRole('button', { name: 'Etiketler', exact: true }),
      page.getByRole('button', { name: 'Arşiv', exact: true }),
      page.getByRole('button', { name: 'Panoyu sil' }),
      page.getByRole('button', { name: '“Yapılacaklar” listesini taşı' }),
      page.getByRole('button', { name: 'Yapılacaklar', exact: true }),
      page.getByRole('button', { name: '“Yapılacaklar” listesini arşivle' }),
      page.getByRole('button', { name: '“Birinci kart” kartının işlemleri' }),
      page.getByRole('button', { name: '“Yapılacaklar” listesine kart ekle' }),
      page.getByRole('button', { name: 'Başka liste ekle' }),
    ];
    for (const target of targets) {
      const box = await target.boundingBox();
      expect(box, `${target}`).not.toBeNull();
      expect(box?.width, `${target} width`).toBeGreaterThanOrEqual(43.5);
      expect(box?.height, `${target} height`).toBeGreaterThanOrEqual(43.5);
    }
  });
});

test('a board of another user shows the not found page', async ({ page }) => {
  await signUp(page, 'Pano Testçi');
  await page.goto('/boards/00000000-0000-4000-8000-000000000000');

  await expect(page.getByRole('heading', { level: 1, name: 'Pano bulunamadı' })).toBeVisible();
});
