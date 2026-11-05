import { expect, type Locator, type Page, test } from '@playwright/test';
import {
  apiAssignLabel,
  apiInvite,
  apiPatchCard,
  keyboardDragReady,
  localDateTime,
  openBoardMenuItem,
  registerUser,
  seedBoard,
  seedCard,
  seedChecklist,
  seedLabel,
  signUp,
} from './helpers.js';

/* Needs the backend and its database (the Playwright config starts both dev servers). */

const HOUR = 60 * 60 * 1000;
const CARD_URL = /\/boards\/[^/]+\/c\/[^/]+$/;

interface CardJson {
  description: string | null;
  dueDate: string | null;
  dueComplete: boolean;
  labelIds: string[];
  completedAt: string | null;
  coverColor: string | null;
  memberIds: string[];
  checklists: { id: string; title: string; items: { content: string; isCompleted: boolean }[] }[];
}

interface Seeded {
  token: string;
  boardId: string;
}

async function openBoard(
  page: Page,
  lists: string[],
  cards: Record<string, string[]> = {},
): Promise<Seeded> {
  const token = await signUp(page);
  const boardId = await seedBoard(page, token, 'Detay testi', lists, cards);
  await page.goto(`/boards/${boardId}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Detay testi' })).toBeVisible();
  return { token, boardId };
}

/** Creates a board with one card and returns the ids; the test decides when to open it. */
async function seedOneCard(page: Page, title = 'Kart') {
  const token = await signUp(page);
  const boardId = await seedBoard(page, token, 'Detay testi', ['Yapılacaklar']);
  const cardId = await seedCard(page, token, boardId, 'Yapılacaklar', title);
  return { token, boardId, cardId };
}

async function getCard(page: Page, token: string, cardId: string): Promise<CardJson> {
  const res = await page.request.get(`/api/v1/cards/${cardId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok()).toBe(true);
  return (await res.json()) as CardJson;
}

const tile = (page: Page, title: string) =>
  page.locator('[aria-roledescription="sıralanabilir kart"]', { hasText: title });

const cardDialog = (page: Page, title: string) => page.getByRole('dialog', { name: title });

const sideButton = (dialog: Locator, name: string) =>
  dialog.getByRole('group', { name: 'Kart işlemleri' }).getByRole('button', { name, exact: true });

/** "Arşivle" lives in the dialog's top bar menu. */
async function archiveFromMenu(dialog: Locator) {
  await dialog.getByRole('button', { name: 'Kart menüsü' }).click();
  await dialog.getByRole('menuitem', { name: 'Arşivle' }).click();
}

const dueInput = (dialog: Locator) => dialog.locator('input[type="datetime-local"]');

const checklistItems = (dialog: Locator, checklist: string) =>
  dialog.getByRole('list', { name: `“${checklist}” öğeleri` }).getByRole('checkbox');

/** Item texts of a checklist, top to bottom. */
async function itemTexts(dialog: Locator, checklist: string): Promise<string[]> {
  return checklistItems(dialog, checklist).evaluateAll((boxes) =>
    boxes.map((box) => box.getAttribute('aria-label') ?? ''),
  );
}

/** Checklist titles of the card, top to bottom (read from their "move up" buttons). */
async function checklistTitles(dialog: Locator): Promise<string[]> {
  return dialog.getByRole('button', { name: /checklist'ini yukarı taşı$/ }).evaluateAll((buttons) =>
    buttons.map((button) => /^“(.*)” checklist'ini/.exec(button.getAttribute('aria-label') ?? '')?.[1] ?? ''),
  );
}

/** Presses the mouse on `source`, moves in steps to the centre of `target` and releases. */
async function dragTo(page: Page, source: Locator, target: Locator) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('drag source or target is not visible');

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
  await page.mouse.up();
}

test('card tile shows label, due badge, description and checklist progress; everything survives a reload', async ({
  page,
}) => {
  // New boards come with an unnamed label per color, so "Yeşil etiket" exists already.
  const { token } = await openBoard(page, ['Yapılacaklar'], { Yapılacaklar: ['Rapor'] });

  await tile(page, 'Rapor').click();
  await expect(page).toHaveURL(CARD_URL);
  const cardId = page.url().split('/').pop() ?? '';
  const dialog = cardDialog(page, 'Rapor');
  await expect(dialog).toBeVisible();

  await sideButton(dialog, 'Etiketler').click();
  // The change is optimistic but asynchronous, so check() would read the box too early.
  await dialog.getByRole('checkbox', { name: 'Yeşil etiket' }).click();
  await expect(dialog.getByRole('checkbox', { name: 'Yeşil etiket' })).toBeChecked();
  await expect(dialog.getByRole('list', { name: 'Kartın etiketleri' })).toContainText('Yeşil etiket');
  await dialog.getByRole('button', { name: 'Tamam' }).click();
  await expect(sideButton(dialog, 'Etiketler')).toBeFocused();

  await sideButton(dialog, 'Son tarih').click();
  await dueInput(dialog).fill(localDateTime(2 * HOUR));
  await dialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(dialog.getByRole('checkbox', { name: 'Tamamlandı' })).toBeVisible();

  await dialog.getByRole('button', { name: 'Daha ayrıntılı bir açıklama ekle…' }).click();
  await dialog.getByRole('textbox', { name: 'Açıklama' }).fill('İlk satır\nİkinci satır');
  await dialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(dialog.getByRole('button', { name: 'Açıklamayı düzenle' })).toBeVisible();

  await sideButton(dialog, 'Checklist').click();
  const title = dialog.getByRole('textbox', { name: 'Checklist başlığı' });
  await title.fill('Hazırlık');
  await title.press('Enter');
  await dialog.getByRole('button', { name: '“Hazırlık” checklist\'ine öğe ekle' }).click();
  const composer = dialog.getByRole('textbox', { name: 'Yeni öğe' });
  await composer.fill('Birinci');
  await composer.press('Enter');
  await expect(dialog.getByRole('checkbox', { name: 'Birinci' })).toBeVisible();
  await composer.fill('İkinci');
  await composer.press('Enter');
  await expect(dialog.getByRole('checkbox', { name: 'İkinci' })).toBeVisible();
  await dialog.getByRole('checkbox', { name: 'Birinci' }).click();
  await expect(dialog.getByRole('progressbar')).toHaveAttribute(
    'aria-valuetext',
    "2 öğeden 1'si tamamlandı",
  );

  await dialog.getByRole('button', { name: 'Kapat' }).click();
  await expect(dialog).toBeHidden();

  const badges = async () => {
    const card = tile(page, 'Rapor');
    await expect(card.getByRole('list', { name: 'Etiketler' })).toContainText('Yeşil etiket');
    await expect(card).toContainText('yaklaşıyor');
    await expect(card).toContainText('1/2');
    await expect(card).toContainText('Açıklaması var');
  };
  await badges();

  // The last mutations must have reached the server before reloading.
  await expect
    .poll(async () => {
      const saved = await getCard(page, token, cardId);
      return {
        labels: saved.labelIds.length,
        due: saved.dueDate !== null,
        description: saved.description,
        done: saved.checklists[0]?.items.filter((item) => item.isCompleted).length,
        total: saved.checklists[0]?.items.length,
      };
    })
    .toEqual({ labels: 1, due: true, description: 'İlk satır\nİkinci satır', done: 1, total: 2 });
  await page.reload();
  await badges();
});

test('opening a card by URL shows its dialog; Escape returns to the board without a history entry', async ({
  page,
}) => {
  const { boardId, cardId } = await seedOneCard(page, 'Paylaşılan kart');

  await page.goto(`/boards/${boardId}/c/${cardId}`);
  const dialog = cardDialog(page, 'Paylaşılan kart');
  await expect(dialog).toBeVisible();
  const historyLength = await page.evaluate<number>('history.length');

  await page.keyboard.press('Escape');

  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(`/boards/${boardId}`);
  await expect(tile(page, 'Paylaşılan kart')).toBeFocused();
  // The card URL was replaced, not left behind for "back" to reopen.
  expect(await page.evaluate<number>('history.length')).toBe(historyLength);
  await page.goBack();
  await expect(page).not.toHaveURL(/\/c\//);
});

test('a card opened by URL without a cache keeps the focus in the dialog when it finishes loading', async ({
  page,
}) => {
  const { boardId, cardId } = await seedOneCard(page, 'Önbelleksiz kart');

  await page.goto(`/boards/${boardId}/c/${cardId}`);
  const dialog = cardDialog(page, 'Önbelleksiz kart');
  await expect(dialog.getByRole('button', { name: /^Liste:/ })).toBeVisible();

  await expect(dialog.getByRole('button', { name: 'Kapat' })).toBeFocused();
});

test('a card opened from the board closes back to the board with Enter, Escape and Kapat, returning focus to the tile', async ({
  page,
}) => {
  await openBoard(page, ['Yapılacaklar'], { Yapılacaklar: ['A', 'B'] });
  const dialog = cardDialog(page, 'B');

  await tile(page, 'B').focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(CARD_URL);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/\/c\//);
  await expect(tile(page, 'B')).toBeFocused();

  await tile(page, 'A').click();
  await expect(cardDialog(page, 'A')).toBeVisible();
  await cardDialog(page, 'A').getByRole('button', { name: 'Kapat' }).click();
  await expect(cardDialog(page, 'A')).toBeHidden();
  await expect(tile(page, 'A')).toBeFocused();

  // Enter opens the card, but Space still picks it up for a keyboard move.
  await page.keyboard.press('Space');
  await expect(
    page.getByText('“A” kartı tutuldu. “Yapılacaklar” listesinde 1. sırada.', { exact: true }),
  ).toBeAttached();
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/\/c\//);
});

test('archiving from the dialog moves focus to the next card, or to "Kart ekle" for the only card', async ({
  page,
}) => {
  await openBoard(page, ['Yapılacaklar', 'Tek'], { Yapılacaklar: ['A', 'B', 'C'], Tek: ['X'] });

  await tile(page, 'B').click();
  await archiveFromMenu(cardDialog(page, 'B'));
  await expect(cardDialog(page, 'B')).toBeHidden();
  await expect(page.getByText('“B” kartı arşivlendi.')).toBeVisible();
  await expect(tile(page, 'B')).toHaveCount(0);
  await expect(tile(page, 'C')).toBeFocused();
  await expect(page).not.toHaveURL(/\/c\//);

  await tile(page, 'X').click();
  await archiveFromMenu(cardDialog(page, 'X'));
  await expect(tile(page, 'X')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '“Tek” listesine kart ekle' })).toBeFocused();
});

test('the list selector moves the card to the end of another list with the keyboard and persists', async ({
  page,
}) => {
  const { token, boardId } = await openBoard(page, ['Yapılacaklar', 'Bitti'], {
    Yapılacaklar: ['A'],
    Bitti: ['B'],
  });
  await tile(page, 'A').click();
  const dialog = cardDialog(page, 'A');
  const selector = dialog.getByRole('button', { name: 'Liste: Yapılacaklar' });

  await selector.focus();
  await page.keyboard.press('ArrowDown');
  await expect(dialog.getByRole('menuitemradio', { name: 'Yapılacaklar' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');

  await expect(dialog.getByRole('button', { name: 'Liste: Bitti' })).toBeFocused();
  await expect(dialog.getByText('Kart “Bitti” listesine taşındı.')).toBeAttached();
  await dialog.getByRole('button', { name: 'Kapat' }).click();
  await expect(
    page
      .getByRole('list', { name: '“Bitti” kartları' })
      .locator('[aria-roledescription="sıralanabilir kart"]'),
  ).toHaveText([/B/, /A/]);
  await expect(tile(page, 'A')).toBeFocused();

  await page.reload();
  await expect(tile(page, 'A')).toBeVisible();
  await expect
    .poll(async () => {
      const res = await page.request.get(`/api/v1/boards/${boardId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const board = (await res.json()) as { lists: { id: string; title: string }[]; cards: { title: string; listId: string }[] };
      const done = board.lists.find((list) => list.title === 'Bitti');
      return board.cards.filter((card) => card.listId === done?.id).map((card) => card.title);
    })
    .toEqual(['B', 'A']);
});

test('Escape closes the card menu first and the dialog only on the next press', async ({ page }) => {
  const { boardId, cardId } = await seedOneCard(page, 'Menü');
  await page.goto(`/boards/${boardId}/c/${cardId}`);
  const dialog = cardDialog(page, 'Menü');
  const trigger = dialog.getByRole('button', { name: 'Kart menüsü' });

  await trigger.click();
  await expect(dialog.getByRole('menuitem', { name: 'Arşivle' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog.getByRole('menu')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(dialog).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/\/c\//);
});

test('dragging a card to another list and releasing does not open the card dialog', async ({
  page,
}) => {
  await openBoard(page, ['Yapılacaklar', 'Bitti'], { Yapılacaklar: ['A'], Bitti: ['B'] });
  const boardUrl = page.url();

  await dragTo(page, tile(page, 'A'), tile(page, 'B'));

  await expect(
    page
      .getByRole('list', { name: '“Bitti” kartları' })
      .locator('[aria-roledescription="sıralanabilir kart"]'),
  ).toHaveCount(2);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(page.url()).toBe(boardUrl);
});

test('badge states: soon, overdue and done show on the tile, and "Tamamlandı" changes the state', async ({
  page,
}) => {
  const { token, boardId } = await openBoard(page, ['Yapılacaklar']);
  const soon = await seedCard(page, token, boardId, 'Yapılacaklar', 'Yaklaşan');
  const late = await seedCard(page, token, boardId, 'Yapılacaklar', 'Geciken');
  const done = await seedCard(page, token, boardId, 'Yapılacaklar', 'Biten');
  await apiPatchCard(page, token, soon, { dueDate: new Date(Date.now() + 2 * HOUR).toISOString() });
  await apiPatchCard(page, token, late, { dueDate: new Date(Date.now() - 2 * HOUR).toISOString() });
  await apiPatchCard(page, token, done, { dueDate: new Date(Date.now() - 2 * HOUR).toISOString() });
  await apiPatchCard(page, token, done, { dueComplete: true });
  await page.reload();

  await expect(tile(page, 'Yaklaşan')).toContainText('yaklaşıyor');
  await expect(tile(page, 'Geciken')).toContainText('gecikti');
  await expect(tile(page, 'Biten')).toContainText('tamamlandı');

  await tile(page, 'Geciken').click();
  const dialog = cardDialog(page, 'Geciken');
  await dialog.getByRole('checkbox', { name: 'Tamamlandı' }).click();
  await expect(dialog.getByRole('checkbox', { name: 'Tamamlandı' })).toBeChecked();
  await dialog.getByRole('button', { name: 'Kapat' }).click();
  await expect(tile(page, 'Geciken')).toContainText('tamamlandı');
  await expect(tile(page, 'Geciken')).not.toContainText('gecikti');
  await expect.poll(async () => (await getCard(page, token, late)).dueComplete).toBe(true);
});

test('a due date typed in local time comes back as the same local time after a reload', async ({
  page,
}) => {
  const { token, boardId, cardId } = await seedOneCard(page, 'Zamanlı');
  await page.goto(`/boards/${boardId}/c/${cardId}`);
  const dialog = cardDialog(page, 'Zamanlı');
  const wanted = localDateTime(30 * HOUR);

  await sideButton(dialog, 'Son tarih').click();
  await expect(dueInput(dialog)).toBeFocused();
  await dueInput(dialog).fill(wanted);
  await dialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(dueInput(dialog)).toHaveCount(0);
  await expect(sideButton(dialog, 'Son tarih')).toBeFocused();
  await expect
    .poll(async () => (await getCard(page, token, cardId)).dueDate)
    .toBe(new Date(wanted).toISOString());

  await page.reload();
  await sideButton(cardDialog(page, 'Zamanlı'), 'Son tarih').click();
  await expect(dueInput(cardDialog(page, 'Zamanlı'))).toHaveValue(wanted);
});

test('Escape inside an open section cancels that section and keeps the dialog open', async ({
  page,
}) => {
  const { token, boardId, cardId } = await seedOneCard(page, 'Bölümler');
  const label = await seedLabel(page, token, boardId, 'Acil', 'RED');
  await apiAssignLabel(page, token, cardId, label);
  await apiPatchCard(page, token, cardId, { description: 'Mevcut açıklama' });
  await seedChecklist(page, token, cardId, 'Hazırlık', ['Madde']);
  await page.goto(`/boards/${boardId}/c/${cardId}`);
  const dialog = cardDialog(page, 'Bölümler');
  await expect(dialog.getByRole('checkbox', { name: 'Madde' })).toBeVisible();
  const stillOpen = async () => {
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(CARD_URL);
  };

  // Description.
  await dialog.getByRole('button', { name: 'Açıklamayı düzenle' }).click();
  const description = dialog.getByRole('textbox', { name: 'Açıklama' });
  await description.fill('Yarım kalan');
  await description.press('Escape');
  await expect(description).toHaveCount(0);
  await expect(dialog.getByText('Mevcut açıklama')).toBeVisible();
  await stillOpen();

  // Due date.
  await sideButton(dialog, 'Son tarih').click();
  await dueInput(dialog).press('Escape');
  await expect(dueInput(dialog)).toHaveCount(0);
  await expect(sideButton(dialog, 'Son tarih')).toBeFocused();
  await stillOpen();

  // Labels.
  await sideButton(dialog, 'Etiketler').click();
  await dialog.getByRole('checkbox', { name: 'Acil' }).press('Escape');
  await expect(dialog.getByRole('checkbox', { name: 'Acil' })).toHaveCount(0);
  await expect(sideButton(dialog, 'Etiketler')).toBeFocused();
  await stillOpen();

  // New checklist title.
  await sideButton(dialog, 'Checklist').click();
  const newTitle = dialog.getByRole('textbox', { name: 'Checklist başlığı' });
  await newTitle.press('Escape');
  await expect(newTitle).toHaveCount(0);
  await expect(sideButton(dialog, 'Checklist')).toBeFocused();
  await stillOpen();

  // Renaming a checklist.
  await dialog.getByRole('heading', { level: 3, name: 'Hazırlık' }).getByRole('button').click();
  const rename = dialog.getByRole('textbox', { name: 'Checklist başlığı' });
  await rename.press('Escape');
  await expect(rename).toHaveCount(0);
  await stillOpen();

  // Editing an item.
  await dialog.getByRole('button', { name: 'Madde', exact: true }).click();
  const edit = dialog.getByRole('textbox', { name: 'Öğe metni' });
  await edit.press('Escape');
  await expect(edit).toHaveCount(0);
  await stillOpen();

  // Item composer.
  const addItem = dialog.getByRole('button', { name: "“Hazırlık” checklist'ine öğe ekle" });
  await addItem.click();
  const composer = dialog.getByRole('textbox', { name: 'Yeni öğe' });
  await composer.press('Escape');
  await expect(composer).toHaveCount(0);
  await expect(addItem).toBeFocused();
  await stillOpen();

  // Nothing was saved by cancelling.
  const saved = await getCard(page, token, cardId);
  expect(saved.description).toBe('Mevcut açıklama');
  expect(saved.dueDate).toBeNull();
  expect(saved.checklists).toHaveLength(1);
});

test('deleting a label while a card using it is open removes its chip in the dialog and on the tile', async ({
  page,
}) => {
  const { token, boardId, cardId } = await seedOneCard(page, 'Etiketli');
  const acil = await seedLabel(page, token, boardId, 'Acil', 'RED');
  await seedLabel(page, token, boardId, 'Sonra', 'BLUE');
  await apiAssignLabel(page, token, cardId, acil);
  await page.goto(`/boards/${boardId}`);
  await expect(tile(page, 'Etiketli').getByRole('list', { name: 'Etiketler' })).toContainText('Acil');

  await tile(page, 'Etiketli').click();
  const dialog = cardDialog(page, 'Etiketli');
  const chips = dialog.getByRole('list', { name: 'Kartın etiketleri' });
  await expect(chips).toContainText('Acil');
  await sideButton(dialog, 'Etiketler').click();
  await dialog.getByRole('button', { name: 'Etiketleri düzenle' }).click();
  await dialog.getByRole('button', { name: '“Acil” etiketini düzenle' }).click();
  await dialog.getByRole('button', { name: 'Sil', exact: true }).click();

  // Escape in the confirmation closes only the confirmation.
  const confirm = page.getByRole('dialog', { name: 'Etiket silinsin mi?' });
  await expect(confirm).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(confirm).toBeHidden();
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(CARD_URL);

  await dialog.getByRole('button', { name: 'Sil', exact: true }).click();
  await confirm.getByRole('button', { name: 'Etiketi sil' }).click();
  await expect(confirm).toBeHidden();
  await expect(dialog.getByRole('button', { name: '“Acil” etiketini düzenle' })).toHaveCount(0);
  await expect(chips).toHaveCount(0);
  await expect(tile(page, 'Etiketli').getByText('Acil')).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Kapat' }).click();
  await expect(tile(page, 'Etiketli').getByRole('list', { name: 'Etiketler' })).toHaveCount(0);
  expect((await getCard(page, token, cardId)).labelIds).toEqual([]);
});

test('manage board labels from the header: create, assign, rename, delete', async ({ page }) => {
  await openBoard(page, ['Yapılacaklar'], { Yapılacaklar: ['Kart'] });

  await openBoardMenuItem(page, 'Etiketler');
  const manager = page.getByRole('dialog', { name: 'Etiketler' });
  await manager.getByRole('button', { name: 'Yeni etiket' }).click();
  await manager.getByRole('textbox', { name: 'Etiket adı' }).fill('Acil');
  // The radio input is visually hidden (the swatch next to it is what people click).
  await manager.getByRole('radio', { name: 'Kırmızı' }).check({ force: true });
  await manager.getByRole('button', { name: 'Kaydet' }).click();
  await expect(manager.getByRole('list', { name: 'Pano etiketleri' })).toContainText('Acil');
  await manager.getByRole('button', { name: 'Kapat' }).click();

  await tile(page, 'Kart').click();
  const dialog = cardDialog(page, 'Kart');
  await sideButton(dialog, 'Etiketler').click();
  await dialog.getByRole('checkbox', { name: 'Acil' }).click();
  await expect(dialog.getByRole('checkbox', { name: 'Acil' })).toBeChecked();
  await dialog.getByRole('button', { name: 'Kapat' }).click();
  await expect(tile(page, 'Kart').getByRole('list', { name: 'Etiketler' })).toContainText('Acil');

  await openBoardMenuItem(page, 'Etiketler');
  await manager.getByRole('button', { name: '“Acil” etiketini düzenle' }).click();
  await manager.getByRole('textbox', { name: 'Etiket adı' }).fill('Çok acil');
  await manager.getByRole('button', { name: 'Kaydet' }).click();
  await expect(manager.getByRole('list', { name: 'Pano etiketleri' })).toContainText('Çok acil');
  await manager.getByRole('button', { name: 'Kapat' }).click();
  await expect(tile(page, 'Kart').getByRole('list', { name: 'Etiketler' })).toContainText(
    'Çok acil',
  );

  await openBoardMenuItem(page, 'Etiketler');
  await manager.getByRole('button', { name: '“Çok acil” etiketini düzenle' }).click();
  await manager.getByRole('button', { name: 'Sil', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Etiket silinsin mi?' })
    .getByRole('button', { name: 'Etiketi sil' })
    .click();
  await expect(manager.getByRole('button', { name: '“Çok acil” etiketini düzenle' })).toHaveCount(0);
  await manager.getByRole('button', { name: 'Kapat' }).click();
  await expect(tile(page, 'Kart').getByRole('list', { name: 'Etiketler' })).toHaveCount(0);
});

test('deleting a checklist returns focus to the "Checklist" button', async ({ page }) => {
  const { token, boardId, cardId } = await seedOneCard(page, 'Silme');
  await seedChecklist(page, token, cardId, 'Eski', ['Bir', 'İki']);
  await page.goto(`/boards/${boardId}/c/${cardId}`);
  const dialog = cardDialog(page, 'Silme');

  await dialog.getByRole('button', { name: "“Eski” checklist'ini sil" }).click();
  const confirm = page.getByRole('dialog', { name: 'Checklist silinsin mi?' });
  await expect(confirm).toContainText('2 öğe silinecek');
  await confirm.getByRole('button', { name: "Checklist'i sil" }).click();

  await expect(confirm).toBeHidden();
  await expect(dialog.getByRole('heading', { level: 3, name: 'Eski' })).toHaveCount(0);
  await expect(sideButton(dialog, 'Checklist')).toBeFocused();
  expect((await getCard(page, token, cardId)).checklists).toEqual([]);
});

test('moving checklists up and down keeps focus on the button and the order after a reload', async ({
  page,
}) => {
  const { token, boardId, cardId } = await seedOneCard(page, 'Sıra');
  for (const title of ['A', 'B', 'C']) await seedChecklist(page, token, cardId, title);
  await page.goto(`/boards/${boardId}/c/${cardId}`);
  const dialog = cardDialog(page, 'Sıra');
  await expect.poll(() => checklistTitles(dialog)).toEqual(['A', 'B', 'C']);

  const down = dialog.getByRole('button', { name: "“A” checklist'ini aşağı taşı" });
  await down.click();
  await expect.poll(() => checklistTitles(dialog)).toEqual(['B', 'A', 'C']);
  await expect(down).toBeFocused();
  await expect(dialog.getByText("“A” checklist'i 2. sıraya taşındı.")).toBeAttached();

  const up = dialog.getByRole('button', { name: "“C” checklist'ini yukarı taşı" });
  await up.click();
  await expect.poll(() => checklistTitles(dialog)).toEqual(['B', 'C', 'A']);
  await expect(up).toBeFocused();

  await expect
    .poll(async () => (await getCard(page, token, cardId)).checklists.map((item) => item.title))
    .toEqual(['B', 'C', 'A']);
  await page.reload();
  await expect.poll(() => checklistTitles(cardDialog(page, 'Sıra'))).toEqual(['B', 'C', 'A']);
});

test('drag an item with the mouse into another checklist without ticking it', async ({ page }) => {
  const { token, boardId, cardId } = await seedOneCard(page, 'Fare');
  await seedChecklist(page, token, cardId, 'A', ['a1', 'a2']);
  await seedChecklist(page, token, cardId, 'B', ['b1']);
  await page.goto(`/boards/${boardId}/c/${cardId}`);
  const dialog = cardDialog(page, 'Fare');
  await expect.poll(() => itemTexts(dialog, 'B')).toEqual(['b1']);

  // Pressing on the item's text and releasing elsewhere must neither tick it nor open its editor.
  await dragTo(
    page,
    dialog.getByRole('list', { name: '“A” öğeleri' }).getByRole('listitem').first(),
    dialog.getByRole('list', { name: '“B” öğeleri' }).getByRole('listitem').first(),
  );

  await expect.poll(() => itemTexts(dialog, 'A')).toEqual(['a2']);
  await expect.poll(() => itemTexts(dialog, 'B')).toHaveLength(2);
  await expect(dialog.getByRole('checkbox', { name: 'a1' })).not.toBeChecked();
  await expect(dialog.getByRole('textbox', { name: 'Öğe metni' })).toHaveCount(0);
  await expect(dialog).toBeVisible();

  const moved = await itemTexts(dialog, 'B');
  await expect
    .poll(async () => {
      const saved = await getCard(page, token, cardId);
      return saved.checklists.map((item) => item.items.map((entry) => entry.content));
    })
    .toEqual([['a2'], moved]);
  await page.reload();
  await expect.poll(() => itemTexts(cardDialog(page, 'Fare'), 'B')).toEqual(moved);
  await expect(cardDialog(page, 'Fare').getByRole('checkbox', { name: 'a1' })).not.toBeChecked();
});

test('move items with the keyboard within a checklist, across checklists and into an empty one', async ({
  page,
}) => {
  const { token, boardId, cardId } = await seedOneCard(page, 'Klavye');
  await seedChecklist(page, token, cardId, 'A', ['a1', 'a2']);
  await seedChecklist(page, token, cardId, 'B', ['b1']);
  await seedChecklist(page, token, cardId, 'Boş');
  await page.goto(`/boards/${boardId}/c/${cardId}`);
  const dialog = cardDialog(page, 'Klavye');
  await expect.poll(() => itemTexts(dialog, 'B')).toEqual(['b1']);
  const announced = (text: string | RegExp) =>
    expect(dialog.getByText(text, typeof text === 'string' ? { exact: true } : {})).toBeAttached();

  // Within a checklist.
  await dialog.getByRole('button', { name: '“a1” öğesini taşı' }).focus();
  await page.keyboard.press('Space');
  await announced("“a1” öğesi tutuldu. “A” checklist'inde 1. sırada.");
  await keyboardDragReady(page);
  await page.keyboard.press('ArrowDown');
  await announced("“a1” öğesi “A” checklist'inde 2. sıraya geldi.");
  await page.keyboard.press('Space');
  await announced("“a1” öğesi “A” checklist'inde 2. sıraya bırakıldı.");
  await expect.poll(() => itemTexts(dialog, 'A')).toEqual(['a2', 'a1']);
  await expect(dialog.getByRole('button', { name: '“a1” öğesini taşı' })).toBeFocused();
  await expect(dialog).toBeVisible();

  // Into the next checklist.
  await page.keyboard.press('Space');
  await announced("“a1” öğesi tutuldu. “A” checklist'inde 2. sırada.");
  await keyboardDragReady(page);
  await page.keyboard.press('ArrowDown');
  await announced(/“a1” öğesi “B” checklist'inde \d\. sıraya geldi\./);
  await page.keyboard.press('Space');
  await announced(/“a1” öğesi “B” checklist'inde \d\. sıraya bırakıldı\./);
  await expect.poll(() => itemTexts(dialog, 'A')).toEqual(['a2']);
  await expect.poll(() => itemTexts(dialog, 'B')).toHaveLength(2);

  // Into the empty checklist: from the last item of B, one step down.
  const last = (await itemTexts(dialog, 'B')).at(-1) ?? '';
  await dialog.getByRole('button', { name: `“${last}” öğesini taşı` }).focus();
  await page.keyboard.press('Space');
  await announced(new RegExp(`“${last}” öğesi tutuldu\\.`));
  await keyboardDragReady(page);
  await page.keyboard.press('ArrowDown');
  await announced(`“${last}” öğesi “Boş” checklist'inde 1. sıraya geldi.`);
  await page.keyboard.press('Space');
  await announced(`“${last}” öğesi “Boş” checklist'inde 1. sıraya bırakıldı.`);
  await expect.poll(() => itemTexts(dialog, 'Boş')).toEqual([last]);

  const order = async (view: Locator) => ({
    A: await itemTexts(view, 'A'),
    B: await itemTexts(view, 'B'),
    Boş: await itemTexts(view, 'Boş'),
  });
  const expected = await order(dialog);
  expect(expected.A).toEqual(['a2']);
  await expect
    .poll(async () => {
      const saved = await getCard(page, token, cardId);
      return Object.fromEntries(
        saved.checklists.map((item) => [item.title, item.items.map((entry) => entry.content)]),
      );
    })
    .toEqual(expected);
  await page.reload();
  await expect.poll(() => order(cardDialog(page, 'Klavye'))).toEqual(expected);
});

test('the archived banner stays clear of the close button and restores the card', async ({
  page,
}) => {
  const { token, boardId, cardId } = await seedOneCard(page, 'Arşivli');
  await apiPatchCard(page, token, cardId, { archived: true });
  await page.goto(`/boards/${boardId}/c/${cardId}`);
  const dialog = cardDialog(page, 'Arşivli');
  const restore = dialog.getByRole('button', { name: 'Geri yükle' });
  await expect(restore).toBeVisible();

  const close = await dialog.getByRole('button', { name: 'Kapat', exact: true }).boundingBox();
  const target = await restore.boundingBox();
  expect(close && target).toBeTruthy();
  if (close && target) {
    const overlaps =
      target.x < close.x + close.width &&
      close.x < target.x + target.width &&
      target.y < close.y + close.height &&
      close.y < target.y + target.height;
    expect(overlaps).toBe(false);
  }

  await restore.click();
  await expect(dialog.getByText('Bu kart arşivde.')).toBeHidden();
  await expect(tile(page, 'Arşivli')).toBeVisible();
});

const MEMBER_NAME = 'Burak Üye';

/** The radio inputs of the cover picker are visually hidden; the swatch next to them is what people click. */
const swatch = (dialog: Locator, name: string) => dialog.getByTitle(name, { exact: true });

async function getWatchedIds(page: Page, token: string, boardId: string): Promise<string[]> {
  const res = await page.request.get(`/api/v1/boards/${boardId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { myWatchedCardIds: string[] }).myWatchedCardIds;
}

test('assigning and removing a card member shows on the dialog and the tile, and survives a reload', async ({
  page,
  request,
}) => {
  const { token, boardId, cardId } = await seedOneCard(page, 'Üyeli kart');
  const second = await registerUser(request, MEMBER_NAME);
  await apiInvite(page, token, boardId, second.email);
  await page.goto(`/boards/${boardId}/c/${cardId}`);
  const dialog = cardDialog(page, 'Üyeli kart');
  await expect(sideButton(dialog, 'Üyeler')).toBeVisible();
  await expect(dialog.getByRole('list', { name: 'Kartın üyeleri' })).toHaveCount(0);

  await sideButton(dialog, 'Üyeler').click();
  const picker = dialog.getByRole('group', { name: 'Pano üyeleri' });
  await expect(picker.getByRole('checkbox')).toHaveCount(2);
  await picker.getByRole('checkbox', { name: MEMBER_NAME }).click();
  await expect(picker.getByRole('checkbox', { name: MEMBER_NAME })).toBeChecked();
  await expect(dialog.getByRole('list', { name: 'Kartın üyeleri' })).toContainText(MEMBER_NAME);
  await dialog.getByRole('button', { name: 'Tamam' }).click();
  await expect(sideButton(dialog, 'Üyeler')).toBeFocused();

  await dialog.getByRole('button', { name: 'Kapat' }).click();
  await expect(tile(page, 'Üyeli kart').getByRole('list', { name: 'Kart üyeleri' })).toContainText(
    MEMBER_NAME,
  );
  await expect
    .poll(async () => (await getCard(page, token, cardId)).memberIds)
    .toEqual([second.userId]);

  await page.reload();
  await expect(tile(page, 'Üyeli kart').getByRole('list', { name: 'Kart üyeleri' })).toContainText(
    MEMBER_NAME,
  );
  await tile(page, 'Üyeli kart').click();
  await expect(dialog.getByRole('list', { name: 'Kartın üyeleri' })).toContainText(MEMBER_NAME);

  await sideButton(dialog, 'Üyeler').click();
  await dialog.getByRole('checkbox', { name: MEMBER_NAME }).click();
  await expect(dialog.getByRole('checkbox', { name: MEMBER_NAME })).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Tamam' }).click();
  await expect(dialog.getByRole('list', { name: 'Kartın üyeleri' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Kapat' }).click();
  await expect(tile(page, 'Üyeli kart').getByRole('list', { name: 'Kart üyeleri' })).toHaveCount(0);
  await expect.poll(async () => (await getCard(page, token, cardId)).memberIds).toEqual([]);
});

test('Escape closes the members panel without closing the dialog and returns focus to "Üyeler"', async ({
  page,
}) => {
  const { boardId, cardId } = await seedOneCard(page, 'Klavyeli');
  await page.goto(`/boards/${boardId}/c/${cardId}`);
  const dialog = cardDialog(page, 'Klavyeli');

  await sideButton(dialog, 'Üyeler').click();
  await expect(dialog.getByRole('checkbox', { name: 'E2E Kullanıcı' })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(dialog.getByRole('checkbox', { name: 'E2E Kullanıcı' })).toBeChecked();
  await page.keyboard.press('Escape');

  await expect(dialog.getByRole('group', { name: 'Pano üyeleri' })).toHaveCount(0);
  await expect(sideButton(dialog, 'Üyeler')).toBeFocused();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('list', { name: 'Kartın üyeleri' })).toContainText('E2E Kullanıcı');
});

test('completing a card checks its box, marks the tile and survives a reload; unchecking clears it', async ({
  page,
}) => {
  const { token, boardId, cardId } = await seedOneCard(page, 'Bitecek kart');
  await page.goto(`/boards/${boardId}/c/${cardId}`);
  const dialog = cardDialog(page, 'Bitecek kart');
  const toggle = dialog.getByRole('checkbox', { name: 'Kartı tamamla' });
  const toggleLabel = dialog.locator('label').filter({ hasText: 'Kartı tamamla' });
  await expect(toggle).not.toBeChecked();

  await toggleLabel.click();
  await expect(toggle).toBeChecked();
  await dialog.getByRole('button', { name: 'Kapat' }).click();
  await expect(tile(page, 'Bitecek kart')).toContainText('Kart tamamlandı');
  await expect.poll(async () => (await getCard(page, token, cardId)).completedAt).not.toBeNull();

  await page.reload();
  await expect(tile(page, 'Bitecek kart')).toContainText('Kart tamamlandı');
  await tile(page, 'Bitecek kart').click();
  await expect(toggle).toBeChecked();

  await toggleLabel.click();
  await expect(toggle).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Kapat' }).click();
  await expect(tile(page, 'Bitecek kart')).not.toContainText('Kart tamamlandı');
  await expect.poll(async () => (await getCard(page, token, cardId)).completedAt).toBeNull();
});

test('picking a cover color paints the dialog and the tile; "Kapak yok" removes it; arrow keys move the choice', async ({
  page,
}) => {
  const { token, boardId, cardId } = await seedOneCard(page, 'Kapaklı kart');
  await page.goto(`/boards/${boardId}/c/${cardId}`);
  const dialog = cardDialog(page, 'Kapaklı kart');
  const cover = dialog.getByTestId('card-cover');
  await expect(cover).toHaveCount(0);

  await sideButton(dialog, 'Kapak').click();
  const red = dialog.getByRole('radio', { name: 'Kırmızı' });
  await swatch(dialog, 'Kırmızı').click();
  await expect(red).toBeChecked();
  await expect(cover).toHaveClass(/bg-label-red/);
  await expect.poll(async () => (await getCard(page, token, cardId)).coverColor).toBe('RED');

  await red.focus();
  await page.keyboard.press('ArrowRight');
  await expect(red).not.toBeChecked();
  await expect(cover).not.toHaveClass(/bg-label-red/);
  await expect.poll(async () => (await getCard(page, token, cardId)).coverColor).not.toBe('RED');

  await page.keyboard.press('ArrowLeft');
  await expect(red).toBeChecked();
  await dialog.getByRole('button', { name: 'Tamam' }).click();
  await expect(sideButton(dialog, 'Kapak')).toBeFocused();
  await dialog.getByRole('button', { name: 'Kapat' }).click();
  await expect(tile(page, 'Kapaklı kart').locator('.bg-label-red')).toHaveCount(1);
  await expect.poll(async () => (await getCard(page, token, cardId)).coverColor).toBe('RED');

  await page.reload();
  await expect(tile(page, 'Kapaklı kart').locator('.bg-label-red')).toHaveCount(1);
  await tile(page, 'Kapaklı kart').click();
  await expect(cover).toHaveClass(/bg-label-red/);

  await sideButton(dialog, 'Kapak').click();
  await swatch(dialog, 'Kapak yok').click();
  await expect(cover).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Kapat' }).click();
  await expect(tile(page, 'Kapaklı kart').locator('.bg-label-red')).toHaveCount(0);
  await expect.poll(async () => (await getCard(page, token, cardId)).coverColor).toBeNull();
});

test('watching a card toggles "Kartı izle", shows the eye on the tile and survives a reload', async ({
  page,
}) => {
  const { token, boardId, cardId } = await seedOneCard(page, 'İzlenecek kart');
  await page.goto(`/boards/${boardId}/c/${cardId}`);
  const dialog = cardDialog(page, 'İzlenecek kart');
  const watch = dialog.getByRole('button', { name: 'Kartı izle' });
  await expect(watch).toHaveAttribute('aria-pressed', 'false');

  await watch.click();
  await expect(watch).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'Kapat' }).click();
  await expect(tile(page, 'İzlenecek kart')).toContainText('İzliyorsun');
  await expect.poll(() => getWatchedIds(page, token, boardId)).toEqual([cardId]);

  await page.reload();
  await expect(tile(page, 'İzlenecek kart')).toContainText('İzliyorsun');
  await tile(page, 'İzlenecek kart').click();
  await expect(watch).toHaveAttribute('aria-pressed', 'true');

  await watch.click();
  await expect(watch).toHaveAttribute('aria-pressed', 'false');
  await dialog.getByRole('button', { name: 'Kapat' }).click();
  await expect(tile(page, 'İzlenecek kart')).not.toContainText('İzliyorsun');
  await expect.poll(() => getWatchedIds(page, token, boardId)).toEqual([]);
});
