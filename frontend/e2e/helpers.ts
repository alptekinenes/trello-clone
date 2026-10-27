import { expect, type Page } from '@playwright/test';

/**
 * Registers a fresh user through the API. The refresh cookie lands in the
 * page's browser context, so the app restores the session on load.
 * Returns an access token for seeding data through the API.
 */
export async function signUp(page: Page, name = 'E2E Kullanıcı'): Promise<string> {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const res = await page.request.post('/api/v1/auth/register', {
    data: { email, password: 'secret-password', name },
  });
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { accessToken: string };
  return body.accessToken;
}

/** Creates a board with lists through the API and returns the board id. */
export async function seedBoard(
  page: Page,
  token: string,
  title: string,
  lists: string[] = [],
): Promise<string> {
  const headers = { Authorization: `Bearer ${token}` };
  const board = await page.request.post('/api/v1/boards', { headers, data: { title } });
  expect(board.ok()).toBe(true);
  const { id } = (await board.json()) as { id: string };
  for (const list of lists) {
    const res = await page.request.post(`/api/v1/boards/${id}/lists`, {
      headers,
      data: { title: list },
    });
    expect(res.ok()).toBe(true);
  }
  return id;
}
