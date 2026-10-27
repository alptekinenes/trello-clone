import { expect, test } from '@playwright/test';

/* Needs the backend and its database (the Playwright config starts both dev servers). */

test('a new user registers, signs out and signs back in', async ({ page }) => {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = 'secret-password';

  await page.goto('/register');
  await page.getByLabel('Ad soyad').fill('Deneme Kullanıcı');
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Parola').fill(password);
  await page.getByRole('button', { name: 'Kayıt ol' }).click();

  await expect(page).toHaveURL('/boards');
  await expect(page.getByRole('heading', { level: 1, name: 'Panolarım' })).toBeVisible();
  await expect(page.getByText('Deneme Kullanıcı')).toBeVisible();

  // The session survives a reload through the refresh cookie.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Panolarım' })).toBeVisible();

  await page.getByRole('button', { name: 'Çıkış yap' }).click();
  await expect(page).toHaveURL('/login');

  // After logout a reload does not restore the session.
  await page.reload();
  await expect(page).toHaveURL('/login');

  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Parola').fill('wrong-password');
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL('/login');

  await page.getByLabel('Parola').fill(password);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page).toHaveURL('/boards');
  await expect(page.getByText('Deneme Kullanıcı')).toBeVisible();
});

test('registering with a taken email shows a field error', async ({ page, request }) => {
  const email = `e2e-taken-${Date.now()}@example.com`;
  await request.post('/api/v1/auth/register', {
    data: { email, password: 'secret-password', name: 'İlk Kullanıcı' },
  });

  await page.goto('/register');
  await page.getByLabel('Ad soyad').fill('İkinci Kullanıcı');
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Parola').fill('secret-password');
  await page.getByRole('button', { name: 'Kayıt ol' }).click();

  await expect(page.getByLabel('E-posta')).toHaveAttribute('aria-invalid', 'true');
  await expect(page).toHaveURL('/register');
});
