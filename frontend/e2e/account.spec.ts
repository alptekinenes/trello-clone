import { expect, test } from '@playwright/test';
import { openAccountMenu, signOut, signUp } from './helpers.js';

/* Needs the backend and its database (the Playwright config starts both dev servers). */

const THEME = 'document.documentElement.dataset.theme';

test('the theme chosen in the account menu survives a reload', async ({ page }) => {
  await signUp(page);
  await page.goto('/boards');

  await openAccountMenu(page);
  await page.getByRole('menuitemradio', { name: 'Koyu' }).click();
  expect(await page.evaluate(THEME)).toBe('dark');
  await expect(page.getByRole('button', { name: 'Hesap menüsü' })).toBeFocused();

  await page.reload();
  expect(await page.evaluate(THEME)).toBe('dark');
  await openAccountMenu(page);
  await expect(page.getByRole('menuitemradio', { name: 'Koyu' })).toBeChecked();
});

test('the profile name can be changed', async ({ page }) => {
  await signUp(page, 'Eski Ad');
  await page.goto('/boards');

  await openAccountMenu(page);
  await page.getByRole('menuitem', { name: 'Profil' }).click();
  const dialog = page.getByRole('dialog', { name: 'Profil' });
  await dialog.getByLabel('Ad soyad').fill('Yeni Ad');
  await dialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(dialog).toBeHidden();

  await openAccountMenu(page);
  await expect(page.getByRole('menu', { name: 'Hesap menüsü' })).toContainText('Yeni Ad');

  await page.reload();
  await openAccountMenu(page);
  await expect(page.getByRole('menu', { name: 'Hesap menüsü' })).toContainText('Yeni Ad');
});

test('the shortcuts dialog opens from the menu and Escape closes it', async ({ page }) => {
  await signUp(page);
  await page.goto('/boards');

  await openAccountMenu(page);
  await page.getByRole('menuitem', { name: 'Klavye kısayolları' }).click();
  await expect(page.getByRole('dialog', { name: 'Klavye kısayolları' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Hesap menüsü' })).toBeFocused();
});

test('the header button creates a board and the menu signs out', async ({ page }) => {
  await signUp(page);
  await page.goto('/boards');

  await page.getByRole('button', { name: 'Yeni pano', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Pano oluştur' });
  await dialog.getByLabel('Pano adı').fill('Üst çubuktan');
  await dialog.getByRole('button', { name: 'Oluştur' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Üst çubuktan' })).toBeVisible();

  await signOut(page);
  await expect(page).toHaveURL('/login');
});
