import { expect, test } from '@playwright/test';

test('home page loads with the app header and heading', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('Trello Clone');
  await expect(page.getByRole('link', { name: 'Trello Clone' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Panolarına hoş geldin' })).toBeVisible();
});

test('unknown paths show the not found page', async ({ page }) => {
  await page.goto('/yok-boyle-bir-sayfa');

  await expect(page.getByRole('heading', { level: 1, name: 'Sayfa bulunamadı' })).toBeVisible();
  await page.getByRole('link', { name: 'Ana sayfaya dön' }).click();
  await expect(page).toHaveURL('/');
});
