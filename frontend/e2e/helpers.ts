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

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Id of the list with this title on a board. */
export async function listIdOf(
  page: Page,
  token: string,
  boardId: string,
  listTitle: string,
): Promise<string> {
  const res = await page.request.get(`/api/v1/boards/${boardId}`, { headers: authHeaders(token) });
  expect(res.ok()).toBe(true);
  const { lists } = (await res.json()) as { lists: { id: string; title: string }[] };
  const list = lists.find((item) => item.title === listTitle);
  if (!list) throw new Error(`list "${listTitle}" not found`);
  return list.id;
}

/** Adds a card to the end of a list through the API and returns its id. */
export async function seedCard(
  page: Page,
  token: string,
  boardId: string,
  listTitle: string,
  title: string,
): Promise<string> {
  const listId = await listIdOf(page, token, boardId, listTitle);
  const res = await page.request.post(`/api/v1/lists/${listId}/cards`, {
    headers: authHeaders(token),
    data: { title },
  });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { id: string }).id;
}

/** Changes a card through the API (description, dueDate, dueComplete, title). */
export async function apiPatchCard(
  page: Page,
  token: string,
  cardId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const res = await page.request.patch(`/api/v1/cards/${cardId}`, {
    headers: authHeaders(token),
    data,
  });
  expect(res.ok()).toBe(true);
}

/** Creates a board label through the API and returns its id. */
export async function seedLabel(
  page: Page,
  token: string,
  boardId: string,
  name: string,
  color: string,
): Promise<string> {
  const res = await page.request.post(`/api/v1/boards/${boardId}/labels`, {
    headers: authHeaders(token),
    data: { name, color },
  });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { id: string }).id;
}

/** Puts a label on a card through the API. */
export async function apiAssignLabel(
  page: Page,
  token: string,
  cardId: string,
  labelId: string,
): Promise<void> {
  const res = await page.request.put(`/api/v1/cards/${cardId}/labels/${labelId}`, {
    headers: authHeaders(token),
  });
  expect(res.ok()).toBe(true);
}

/** Adds a checklist with items to a card through the API and returns the checklist id. */
export async function seedChecklist(
  page: Page,
  token: string,
  cardId: string,
  title: string,
  items: string[] = [],
): Promise<string> {
  const res = await page.request.post(`/api/v1/cards/${cardId}/checklists`, {
    headers: authHeaders(token),
    data: { title },
  });
  expect(res.ok()).toBe(true);
  const { id } = (await res.json()) as { id: string };
  for (const content of items) {
    const created = await page.request.post(`/api/v1/checklists/${id}/items`, {
      headers: authHeaders(token),
      data: { content },
    });
    expect(created.ok()).toBe(true);
  }
  return id;
}

/** Local "YYYY-MM-DDTHH:mm" for a datetime-local input, `offsetMs` from now (browser and test share the zone). */
export function localDateTime(offsetMs: number): string {
  const date = new Date(Date.now() + offsetMs);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
