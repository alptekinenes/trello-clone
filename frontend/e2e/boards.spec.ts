import { expect, test, type Page } from '@playwright/test';

/* Needs the backend and its database (the Playwright config starts both dev servers). */

/** Registers through the API; the refresh cookie lands in the page's browser context. */
async function signUp(page: Page) {
  const email = `e2e-boards-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const res = await page.request.post('/api/v1/auth/register', {
    data: { email, password: 'secret-password', name: 'Pano Testçi' },
  });
  expect(res.ok()).toBe(true);
}

test('create, open, rename and delete a board', async ({ page }) => {
  await signUp(page);
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
  await signUp(page);
  await page.goto('/boards');

  const opener = page.getByRole('button', { name: 'Yeni pano oluştur' });
  await opener.click();
  await expect(page.getByRole('dialog', { name: 'Pano oluştur' })).toBeVisible();
  await expect(page.getByLabel('Pano adı')).toBeFocused();

  await page.keyboard.press('Escape');

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('a board of another user shows the not found page', async ({ page }) => {
  await signUp(page);
  await page.goto('/boards/00000000-0000-4000-8000-000000000000');

  await expect(page.getByRole('heading', { level: 1, name: 'Pano bulunamadı' })).toBeVisible();
});
