import { expect, test } from '@playwright/test';

test('signed-out visitors are sent from home to the login page', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('Trello Klonu');
  await expect(page).toHaveURL('/login');
  await expect(page.getByRole('heading', { level: 1, name: 'Giriş yap' })).toBeVisible();
});

test('login form validates in the browser', async ({ page }) => {
  await page.goto('/login');

  await page.getByRole('button', { name: 'Giriş yap' }).click();

  await expect(page.getByText('E-posta adresini gir.')).toBeVisible();
  await expect(page.getByText('Parolanı gir.')).toBeVisible();
  await expect(page.getByLabel('E-posta')).toBeFocused();
});

test('login and register pages link to each other', async ({ page }) => {
  await page.goto('/login');

  await page.getByRole('link', { name: 'Kayıt ol' }).click();
  await expect(page).toHaveURL('/register');
  await expect(page.getByRole('heading', { level: 1, name: 'Hesap oluştur' })).toBeVisible();

  await page.getByRole('link', { name: 'Giriş yap' }).click();
  await expect(page).toHaveURL('/login');
});

test('unknown paths show the not found page', async ({ page }) => {
  await page.goto('/yok-boyle-bir-sayfa');

  await expect(page.getByRole('heading', { level: 1, name: 'Sayfa bulunamadı' })).toBeVisible();
  await page.getByRole('link', { name: 'Ana sayfaya dön' }).click();
  await expect(page).toHaveURL('/login');
});
