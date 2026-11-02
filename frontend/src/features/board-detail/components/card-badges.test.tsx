import { screen, within } from '@testing-library/react';
import type { CardSummaryDto, LabelDto } from '@trello/contracts';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOARD_ID, boardDetail, testCard, testLists, testUser } from '../../../test/fixtures';
import { server } from '../../../test/msw-server';
import { renderApp } from '../../../test/render';
import { useAuthStore } from '../../auth/store/auth-store';

const NOW = '2026-11-05T12:00:00.000Z';
const [list] = testLists('Yapılacaklar');

const LABELS: LabelDto[] = [
  { id: 'label-red', boardId: BOARD_ID, name: 'Acil', color: 'RED' },
  { id: 'label-green', boardId: BOARD_ID, name: '', color: 'GREEN' },
];

async function openBoardWith(card: Partial<CardSummaryDto>) {
  useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
  const detail = boardDetail(
    'OWNER',
    'Pano',
    [list],
    [testCard({ id: 'card-1', listId: list.id, title: 'Rapor', ...card })],
    LABELS,
  );
  server.use(http.get(`*/api/v1/boards/${BOARD_ID}`, () => HttpResponse.json(detail)));
  renderApp(`/boards/${BOARD_ID}`);
  await screen.findByRole('button', { name: 'Rapor' });
  return screen.getByRole('button', { name: 'Rapor' });
}

afterEach(() => vi.useRealTimers());

describe('card tile badges', () => {
  it('shows nothing extra on a plain card', async () => {
    const tile = await openBoardWith({});

    expect(tile).toHaveTextContent(/^Rapor$/);
  });

  it('shows labels by name, and a nameless label by its color', async () => {
    const tile = await openBoardWith({ labelIds: ['label-red', 'label-green'] });

    const chips = within(tile).getByRole('list', { name: 'Etiketler' });
    expect(within(chips).getByText('Acil')).toHaveClass('bg-label-red');
    expect(within(chips).getByText('Yeşil etiket')).toBeInTheDocument();
  });

  it('ignores label ids that are no longer on the board', async () => {
    const tile = await openBoardWith({ labelIds: ['label-gone'] });

    expect(within(tile).queryByRole('list', { name: 'Etiketler' })).not.toBeInTheDocument();
  });

  it.each([
    ['2026-11-04T09:00:00.000Z', false, 'gecikti', 'text-danger'],
    ['2026-11-05T18:00:00.000Z', false, 'yaklaşıyor', 'text-warning'],
    ['2026-11-04T09:00:00.000Z', true, 'tamamlandı', 'text-success'],
    ['2026-11-20T09:00:00.000Z', false, null, 'text-fg-muted'],
  ])('shows the due date %s (complete: %s)', async (dueDate, dueComplete, state, tone) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(NOW));
    const tile = await openBoardWith({ dueDate, dueComplete });

    const badge = within(tile).getByText(/Son tarih:/).parentElement;
    expect(badge).toHaveClass(tone);
    if (state) expect(badge).toHaveTextContent(state);
    else expect(badge).not.toHaveTextContent(/gecikti|yaklaşıyor|tamamlandı/);
  });

  it('marks cards that have a description', async () => {
    const tile = await openBoardWith({ hasDescription: true });

    expect(within(tile).getByText('Açıklaması var')).toBeInTheDocument();
  });

  it('counts done checklist items without a success tone', async () => {
    const tile = await openBoardWith({ checklistTotal: 5, checklistDone: 2 });
    expect(within(tile).getByText('2/5').parentElement).not.toHaveClass('text-success');
  });

  it('shows a finished checklist in the success tone', async () => {
    const tile = await openBoardWith({ checklistTotal: 3, checklistDone: 3 });
    expect(within(tile).getByText('3/3').parentElement).toHaveClass('text-success');
  });

  it('keeps the card named by its title only', async () => {
    const tile = await openBoardWith({
      labelIds: ['label-red'],
      hasDescription: true,
      checklistTotal: 2,
      checklistDone: 1,
    });

    expect(tile).toHaveAccessibleName('Rapor');
    expect(tile).toHaveAccessibleDescription(/Acil.*Açıklaması var.*Checklist: 2 öğeden 1 tanesi/);
  });
});
