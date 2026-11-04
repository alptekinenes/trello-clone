import { expect, type Page, test } from '@playwright/test';
import {
  apiAssignLabel,
  apiInvite,
  apiPatchCard,
  apiSetBoardBackground,
  expectNoA11yViolations,
  openAccountMenu,
  seedBoard,
  seedCard,
  seedChecklist,
  seedLabel,
  signUp,
  signUpAs,
} from './helpers.js';

/*
 * Accessibility audit: every screen is scanned with axe (WCAG 2.2 AA) in the light and the dark
 * theme and on a 320 px wide screen. The theme follows `prefers-color-scheme`, so the browser's
 * colour scheme is what switches it. Animations are off (`reducedMotion`) so that a dialog that is
 * still fading in cannot give a contrast reading mid-transition.
 * Needs the backend and its database (the Playwright config starts both dev servers).
 */

const HOUR = 60 * 60 * 1000;
const BOARD_TITLE = 'Erişilebilirlik panosu';
const CARD_TITLE = 'Rapor hazırla';

const MODES = [
  { name: 'light theme', colorScheme: 'light', viewport: { width: 1280, height: 800 } },
  { name: 'dark theme', colorScheme: 'dark', viewport: { width: 1280, height: 800 } },
  { name: 'light theme at 320 px', colorScheme: 'light', viewport: { width: 320, height: 640 } },
  { name: 'dark theme at 320 px', colorScheme: 'dark', viewport: { width: 320, height: 640 } },
] as const;

type Mode = (typeof MODES)[number];

interface Seeded {
  token: string;
  boardId: string;
  cardId: string;
}

/**
 * A signed-in user with a board that shows every kind of content: three lists, cards with a
 * label, a due date in each state, a description and a checklist, plus an archived card.
 */
async function seedRichBoard(page: Page, background = 'blue'): Promise<Seeded> {
  const token = await signUp(page, 'Ayşe Erişilebilir');
  const boardId = await seedBoard(page, token, BOARD_TITLE, ['Yapılacaklar', 'Devam ediyor', 'Bitti'], {
    'Devam ediyor': ['Tasarım gözden geçirme'],
  });
  const cardId = await seedCard(page, token, boardId, 'Yapılacaklar', CARD_TITLE);
  const late = await seedCard(page, token, boardId, 'Yapılacaklar', 'Gecikmiş iş');
  const done = await seedCard(page, token, boardId, 'Bitti', 'Tamamlanmış iş');
  const archived = await seedCard(page, token, boardId, 'Bitti', 'Arşivlenmiş iş');

  const urgent = await seedLabel(page, token, boardId, 'Acil', 'RED');
  const later = await seedLabel(page, token, boardId, 'Sonra', 'BLUE');
  await apiAssignLabel(page, token, cardId, urgent);
  await apiAssignLabel(page, token, cardId, later);
  await apiPatchCard(page, token, cardId, {
    description: 'Çeyrek sonu raporunu hazırla ve ekiple paylaş.',
    dueDate: new Date(Date.now() + 2 * HOUR).toISOString(),
  });
  await apiPatchCard(page, token, late, { dueDate: new Date(Date.now() - 2 * HOUR).toISOString() });
  await apiPatchCard(page, token, done, {
    dueDate: new Date(Date.now() - 2 * HOUR).toISOString(),
    dueComplete: true,
  });
  await seedChecklist(page, token, cardId, 'Hazırlık', ['Verileri topla', 'Taslağı yaz']);
  await apiPatchCard(page, token, archived, { archived: true });
  if (background !== 'blue') await apiSetBoardBackground(page, token, boardId, background);
  return { token, boardId, cardId };
}

async function openRichBoard(page: Page, background?: string): Promise<Seeded> {
  const seeded = await seedRichBoard(page, background);
  await page.goto(`/boards/${seeded.boardId}`);
  await expect(page.getByRole('heading', { level: 1, name: BOARD_TITLE })).toBeVisible();
  await expect(page.getByText(CARD_TITLE)).toBeVisible();
  return seeded;
}

/** Opens a board toolbar dialog ("Üyeler", "Etiketler", "Arşiv", "Arka plan") and waits for it. */
async function openToolbarDialog(page: Page, button: string, dialog: string): Promise<void> {
  await page.getByRole('button', { name: button, exact: true }).click();
  await expect(page.getByRole('dialog', { name: dialog })).toBeVisible();
}

const BACKGROUNDS = ['blue', 'green', 'orange', 'red', 'purple', 'pink', 'lime', 'sky', 'grey'];

function defineScreens(mode: Mode): void {
  test.describe(mode.name, () => {
    test.use({
      colorScheme: mode.colorScheme,
      viewport: mode.viewport,
      reducedMotion: 'reduce',
    });

    test('login page', async ({ page }) => {
      await page.goto('/login');
      await expect(page.getByRole('button', { name: 'Giriş yap' })).toBeVisible();
      await expectNoA11yViolations(page);
    });

    test('register page', async ({ page }) => {
      await page.goto('/register');
      await expect(page.getByRole('button', { name: 'Kayıt ol' })).toBeVisible();
      await expectNoA11yViolations(page);
    });

    test('register page with validation errors', async ({ page }) => {
      await page.goto('/register');
      await page.getByRole('button', { name: 'Kayıt ol' }).click();
      await expect(page.getByRole('textbox', { name: 'Ad soyad' })).toHaveAttribute('aria-invalid', 'true');
      await expect(page.getByText('Adını gir.')).toBeVisible();
      await expectNoA11yViolations(page);
    });

    test('empty boards page', async ({ page }) => {
      await signUp(page, 'Ayşe Erişilebilir');
      await page.goto('/boards');
      await expect(page.getByText(/Henüz bir panon yok/)).toBeVisible();
      await expectNoA11yViolations(page);
    });

    test('boards page with boards of different backgrounds', async ({ page }) => {
      const token = await signUp(page, 'Ayşe Erişilebilir');
      for (const background of BACKGROUNDS) {
        const boardId = await seedBoard(page, token, `Pano ${background}`);
        await apiSetBoardBackground(page, token, boardId, background);
      }
      await page.goto('/boards');
      await expect(page.getByRole('link', { name: 'Pano lime' })).toBeVisible();
      await expectNoA11yViolations(page);
    });

    test('create board dialog', async ({ page }) => {
      await signUp(page, 'Ayşe Erişilebilir');
      await page.goto('/boards');
      await page.getByRole('button', { name: 'Yeni pano oluştur' }).click();
      await expect(page.getByRole('dialog', { name: 'Pano oluştur' })).toBeVisible();
      await expectNoA11yViolations(page);
    });

    test('account menu open', async ({ page }) => {
      await signUp(page, 'Ayşe Erişilebilir');
      await page.goto('/boards');
      await openAccountMenu(page);
      await expectNoA11yViolations(page);
    });

    for (const background of BACKGROUNDS) {
      test(`board page with the ${background} background`, async ({ page }) => {
        await openRichBoard(page, background);
        await expectNoA11yViolations(page);
      });
    }

    test('card detail dialog', async ({ page }) => {
      const { boardId, cardId } = await seedRichBoard(page);
      await page.goto(`/boards/${boardId}/c/${cardId}`);
      await expect(page.getByRole('dialog', { name: CARD_TITLE })).toBeVisible();
      await expect(page.getByText('Verileri topla')).toBeVisible();
      await expectNoA11yViolations(page);
    });

    test('members dialog with a pending invitation', async ({ page }) => {
      const { token, boardId } = await seedRichBoard(page);
      await apiInvite(page, token, boardId, 'davetli-kisi@example.com');
      await page.goto(`/boards/${boardId}`);
      await openToolbarDialog(page, 'Üyeler', 'Pano üyeleri');
      await expect(page.getByText('davetli-kisi@example.com')).toBeVisible();
      await expectNoA11yViolations(page);
    });

    test('labels dialog', async ({ page }) => {
      await openRichBoard(page);
      await openToolbarDialog(page, 'Etiketler', 'Etiketler');
      await expectNoA11yViolations(page);
    });

    test('archive dialog', async ({ page }) => {
      await openRichBoard(page);
      await openToolbarDialog(page, 'Arşiv', 'Arşiv');
      await expect(page.getByText('Arşivlenmiş iş')).toBeVisible();
      await expectNoA11yViolations(page);
    });

    test('background dialog', async ({ page }) => {
      await openRichBoard(page);
      await openToolbarDialog(page, 'Arka plan', 'Arka plan');
      await expectNoA11yViolations(page);
    });

    test('card actions dialog', async ({ page }) => {
      await openRichBoard(page);
      await page.getByRole('button', { name: `“${CARD_TITLE}” kartının işlemleri` }).click();
      await expect(page.getByRole('dialog', { name: 'Kart işlemleri' })).toBeVisible();
      await expectNoA11yViolations(page);
    });

    test('delete board confirmation dialog', async ({ page }) => {
      await openRichBoard(page);
      await page.getByRole('button', { name: 'Panoyu sil' }).click();
      await expect(page.getByRole('dialog', { name: 'Pano silinsin mi?' })).toBeVisible();
      await expectNoA11yViolations(page);
    });

    test('invitation page for a signed-out visitor', async ({ page, browser, baseURL }) => {
      const { token, boardId } = await seedRichBoard(page);
      const inviteUrl = await apiInvite(page, token, boardId, 'yeni-davetli@example.com');
      const visitorContext = await browser.newContext({
        baseURL,
        locale: 'tr-TR',
        colorScheme: mode.colorScheme,
        viewport: mode.viewport,
        reducedMotion: 'reduce',
      });
      try {
        const visitor = await visitorContext.newPage();
        await visitor.goto(new URL(inviteUrl ?? '').pathname);
        await expect(visitor.getByRole('heading', { level: 1, name: 'Panoya davet' })).toBeVisible();
        await expectNoA11yViolations(visitor);
      } finally {
        await visitorContext.close();
      }
    });

    test('invitation page for a signed-in invitee', async ({ page, browser, baseURL }) => {
      const { token, boardId } = await seedRichBoard(page);
      const inviteeContext = await browser.newContext({
        baseURL,
        locale: 'tr-TR',
        colorScheme: mode.colorScheme,
        viewport: mode.viewport,
        reducedMotion: 'reduce',
      });
      try {
        const invitee = await inviteeContext.newPage();
        const { email } = await signUpAs(invitee, 'Burak Davetli');
        const inviteUrl = await apiInvite(page, token, boardId, `yeni-${email}`);
        // A signed-in person with another address sees the mismatch view.
        await invitee.goto(new URL(inviteUrl ?? '').pathname);
        await expect(invitee.getByRole('main')).toContainText(email);
        await expectNoA11yViolations(invitee);
      } finally {
        await inviteeContext.close();
      }
    });

    test('invitation page for a link that no longer works', async ({ page }) => {
      await page.goto('/invitations/abc');
      await expect(page.getByRole('heading', { level: 1, name: 'Davet kullanılamıyor' })).toBeVisible();
      await expectNoA11yViolations(page);
    });

    test('board not found page', async ({ page }) => {
      await signUp(page, 'Ayşe Erişilebilir');
      await page.goto('/boards/00000000-0000-4000-8000-000000000000');
      await expect(page.getByRole('heading', { level: 1, name: 'Pano bulunamadı' })).toBeVisible();
      await expectNoA11yViolations(page);
    });

    test('404 page for a signed-out visitor', async ({ page }) => {
      await page.goto('/bu-sayfa-yok');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoA11yViolations(page);
    });

    test('404 page for a signed-in user', async ({ page }) => {
      await signUp(page, 'Ayşe Erişilebilir');
      await page.goto('/bu-sayfa-yok');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoA11yViolations(page);
    });
  });
}

for (const mode of MODES) defineScreens(mode);
