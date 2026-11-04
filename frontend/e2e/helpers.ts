import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import pg from 'pg';

const { Client } = pg;

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

/** Changes the background of a board through the API (`blue`, `lime`, `sky`...). */
export async function apiSetBoardBackground(
  page: Page,
  token: string,
  boardId: string,
  background: string,
): Promise<void> {
  const res = await page.request.patch(`/api/v1/boards/${boardId}`, {
    headers: authHeaders(token),
    data: { background },
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

/** Adds an item to a checklist through the API and returns its id. */
export async function apiAddChecklistItem(
  page: Page,
  token: string,
  checklistId: string,
  content: string,
): Promise<string> {
  const res = await page.request.post(`/api/v1/checklists/${checklistId}/items`, {
    headers: authHeaders(token),
    data: { content },
  });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { id: string }).id;
}

/** Ticks or unticks a checklist item through the API. */
export async function apiSetItemCompleted(
  page: Page,
  token: string,
  itemId: string,
  isCompleted: boolean,
): Promise<void> {
  const res = await page.request.patch(`/api/v1/checklist-items/${itemId}`, {
    headers: authHeaders(token),
    data: { isCompleted },
  });
  expect(res.ok()).toBe(true);
}

/** Deletes a card for good through the API. */
export async function apiDeleteCard(page: Page, token: string, cardId: string): Promise<void> {
  const res = await page.request.delete(`/api/v1/cards/${cardId}`, { headers: authHeaders(token) });
  expect(res.status()).toBe(204);
}

/** Local "YYYY-MM-DDTHH:mm" for a datetime-local input, `offsetMs` from now (browser and test share the zone). */
export function localDateTime(offsetMs: number): string {
  const date = new Date(Date.now() + offsetMs);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** A mailbox nobody has registered with; the prefix makes a test's addresses easy to tell apart. */
export function freshEmail(prefix = 'e2e'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/** Password of every user `signUpAs` creates. */
export const PASSWORD = 'secret-password';

/**
 * Registers a user through the API like `signUp`, with a name and (optionally) an email of
 * the test's choosing. Returns the access token and the address that was registered.
 */
export async function signUpAs(
  page: Page,
  name: string,
  email: string = freshEmail(),
): Promise<{ token: string; email: string }> {
  const res = await page.request.post('/api/v1/auth/register', {
    data: { email, password: PASSWORD, name },
  });
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { accessToken: string };
  return { token: body.accessToken, email };
}

/**
 * Invites an address through the API. Returns the invite URL when the address was not
 * registered (an invitation was created), or null when the user was added at once.
 */
export async function apiInvite(
  page: Page,
  token: string,
  boardId: string,
  email: string,
  role: 'MEMBER' | 'ADMIN' = 'MEMBER',
): Promise<string | null> {
  const res = await page.request.post(`/api/v1/boards/${boardId}/invitations`, {
    headers: authHeaders(token),
    data: { email, role },
  });
  expect(res.status()).toBe(201);
  const body = (await res.json()) as { result: string; inviteUrl?: string };
  return body.result === 'INVITATION_CREATED' ? (body.inviteUrl ?? null) : null;
}

/** The part of an invite URL the app serves, e.g. `/invitations/<token>`. */
export function inviteTokenPath(inviteUrl: string): string {
  return new URL(inviteUrl).pathname;
}

/**
 * `DATABASE_URL` of the backend the tests run against. Resolved like the backend does it
 * (@nestjs/config): a variable in the environment wins over backend/.env, which the
 * backend that Playwright starts inherits from the same environment.
 */
function databaseUrl(): string {
  const raw = process.env.DATABASE_URL ?? readBackendEnv().DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL is not set in the environment or in backend/.env');
  // pg takes a plain connection string; Prisma's `schema` parameter is not part of one.
  const url = new URL(raw);
  url.searchParams.delete('schema');
  return url.toString();
}

function readBackendEnv(): Record<string, string | undefined> {
  const path = fileURLToPath(new URL('../../backend/.env', import.meta.url));
  return parseEnv(readFileSync(path, 'utf8'));
}

/**
 * Lets an invitation lapse the only way possible: no endpoint ends one early, and waiting
 * seven days is not an option. The column is a timestamp without zone that Prisma fills in
 * UTC, hence the explicit zone. Touches only the pending invitation of this address.
 */
export async function expireInvitation(boardId: string, email: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    const result = await client.query(
      `UPDATE "Invitation" SET "expiresAt" = (now() AT TIME ZONE 'UTC') - interval '1 minute' WHERE "boardId" = $1 AND "email" = $2`,
      [boardId, email.toLowerCase()],
    );
    expect(result.rowCount).toBe(1);
  } finally {
    await client.end();
  }
}

/** WCAG 2.0, 2.1 and 2.2 levels A and AA. */
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const CARD_TILE = 'aria-roledescription="sıralanabilir kart"';

/**
 * Scans the page with axe against WCAG 2.2 AA. Violations of impact `critical` or `serious`
 * fail the test; the message names the rule and the elements so the report is actionable.
 *
 * One deliberate exception: `label-content-name-mismatch` (an experimental rule) on card tiles.
 * A tile is named by its title only and the due date, checklist progress and labels are its
 * description (`aria-describedby`), so the visible badge text is not part of the name. The
 * title is what a person says to pick the card, so this is accepted as a false positive; the
 * rule still applies to every other element.
 */
export async function expectNoA11yViolations(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze();
  const blocking = violations
    .map((violation) =>
      violation.id === 'label-content-name-mismatch'
        ? { ...violation, nodes: violation.nodes.filter((node) => !node.html.includes(CARD_TILE)) }
        : violation,
    )
    .filter(
      (violation) =>
        (violation.impact === 'critical' || violation.impact === 'serious') &&
        violation.nodes.length > 0,
    );
  const report = blocking.map(
    (violation) =>
      `${violation.id} (${violation.impact}): ${violation.help}\n` +
      violation.nodes
        .map((node) => `  - ${node.target.join(' ')}\n    ${node.failureSummary?.replace(/\n/g, '\n    ')}`)
        .join('\n'),
  );
  expect(report, report.join('\n')).toEqual([]);
}

/*
 * Realtime: the page's socket.io frames are the only deterministic signal that the connection
 * is up and the board room joined. Nothing in the UI says so (and a test must not sleep).
 */

/** A first load of the app can wait on a cold dev server and busy workers; this is not a speed test. */
const PAGE_LOAD_TIMEOUT = 20_000;

const socketFrames = new WeakMap<Page, string[]>();

/** `40/realtime,{"sid":…}`: the server accepted the connection to the namespace. */
const CONNECTED_FRAME = /^40\/realtime,/;
/** `43/realtime,<id>[{"ok":true}]`: the ack of a successful `board:join`. */
const JOINED_FRAME = /^43\/realtime,\d+\[\{"ok":true\}\]/;

/** Starts recording the text frames the page receives on its socket.io connection. Call before navigating. */
export function watchRealtime(page: Page): void {
  const frames: string[] = [];
  socketFrames.set(page, frames);
  page.on('websocket', (socket) => {
    if (!socket.url().includes('/socket.io/')) return;
    socket.on('framereceived', ({ payload }) => {
      if (typeof payload === 'string') frames.push(payload);
    });
  });
}

function recordedFrames(page: Page): string[] {
  const frames = socketFrames.get(page);
  if (!frames) throw new Error('watchRealtime(page) was not called before navigating');
  return frames;
}

/** Waits until the page has received a frame matching `pattern` at least `count` times since watching began. */
export async function expectFrame(page: Page, pattern: RegExp, count = 1): Promise<void> {
  await expect
    .poll(() => recordedFrames(page).filter((frame) => pattern.test(frame)).length, {
      message: `socket frames matching ${pattern}`,
      timeout: PAGE_LOAD_TIMEOUT,
    })
    .toBeGreaterThanOrEqual(count);
}

/** Opens a board and waits until its socket joined the board room (`joins` counts from the first page load). */
export async function openBoardAs(page: Page, boardId: string, title: string, joins = 1): Promise<void> {
  if (!socketFrames.has(page)) watchRealtime(page);
  await page.goto(`/boards/${boardId}`);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible({
    timeout: PAGE_LOAD_TIMEOUT,
  });
  await expectFrame(page, JOINED_FRAME, joins);
}

/** Opens the boards page and waits until the socket is connected (its user room is joined). */
export async function openBoardsPageAs(page: Page): Promise<void> {
  if (!socketFrames.has(page)) watchRealtime(page);
  await page.goto('/boards');
  await expect(page.getByRole('heading', { level: 1, name: 'Panolarım' })).toBeVisible({
    timeout: PAGE_LOAD_TIMEOUT,
  });
  await expectFrame(page, CONNECTED_FRAME);
}
