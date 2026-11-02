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

/**
 * Creates a board with lists through the API and returns the board id.
 * `cards` maps a list title to the titles of the cards to add to it, in order.
 */
export async function seedBoard(
  page: Page,
  token: string,
  title: string,
  lists: string[] = [],
  cards: Record<string, string[]> = {},
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
    const { id: listId } = (await res.json()) as { id: string };
    for (const card of cards[list] ?? []) {
      const created = await page.request.post(`/api/v1/lists/${listId}/cards`, {
        headers,
        data: { title: card },
      });
      expect(created.ok()).toBe(true);
    }
  }
  return id;
}

/**
 * dnd-kit's keyboard sensor starts listening for arrow keys one task after an
 * item is picked up. A person never presses that fast, but a test can, so it
 * waits for that task before steering.
 */
export async function keyboardDragReady(page: Page): Promise<void> {
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
}
