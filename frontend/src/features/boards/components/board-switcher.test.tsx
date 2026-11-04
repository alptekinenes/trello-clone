import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BoardSummaryDto } from '@trello/contracts';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { useAuthStore } from '../../auth/store/auth-store';
import { fakeRealtime } from '../../../test/fake-realtime';
import { BOARD_ID, apiError, boardDetail, boardSummary, testUser } from '../../../test/fixtures';
import { server } from '../../../test/msw-server';
import { renderApp } from '../../../test/render';

const OTHER_ID = '33333333-3333-4333-8333-333333333333';

function openBoard(boards: BoardSummaryDto[] | 'error' | 'slow') {
  useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
  server.use(
    http.get('*/api/v1/boards', async () => {
      if (boards === 'error') return apiError(500, 'INTERNAL_ERROR');
      if (boards === 'slow') await delay('infinite');
      return HttpResponse.json(boards);
    }),
    http.get('*/api/v1/boards/:id', ({ params }) =>
      HttpResponse.json(
        params.id === OTHER_ID ? boardDetail('OWNER', 'Pazarlama') : boardDetail('OWNER'),
      ),
    ),
  );
  const view = renderApp(`/boards/${BOARD_ID}`);
  return { ...view, user: userEvent.setup() };
}

async function openSwitcher(user: ReturnType<typeof userEvent.setup>) {
  const nav = await screen.findByRole('navigation', { name: 'Pano gezintisi' });
  await user.click(within(nav).getByRole('button', { name: 'Pano değiştir' }));
  return screen.getByRole('menu', { name: 'Pano değiştir' });
}

describe('BoardSwitcher', () => {
  it('marks the current page in the bar and offers only working controls', async () => {
    openBoard([boardSummary()]);

    const nav = await screen.findByRole('navigation', { name: 'Pano gezintisi' });
    expect(within(nav).getByRole('link', { name: 'Pano' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getAllByRole('button')).toHaveLength(1);
    expect(within(nav).queryByText(/Inbox|Planlayıcı/)).not.toBeInTheDocument();
  });

  it('lists the boards with the current one checked, and a link to all boards', async () => {
    const { user } = openBoard([boardSummary(), boardSummary({ id: OTHER_ID, title: 'Pazarlama' })]);

    const menu = await openSwitcher(user);

    expect(await within(menu).findByRole('menuitemradio', { name: 'Yol haritası' })).toBeChecked();
    expect(within(menu).getByRole('menuitemradio', { name: 'Pazarlama' })).not.toBeChecked();
    expect(within(menu).getByRole('menuitem', { name: 'Tüm panolar' })).toBeInTheDocument();
  });

  it('goes to the chosen board and keeps focus on the trigger', async () => {
    const { user, router } = openBoard([
      boardSummary(),
      boardSummary({ id: OTHER_ID, title: 'Pazarlama' }),
    ]);

    const menu = await openSwitcher(user);
    await user.click(await within(menu).findByRole('menuitemradio', { name: 'Pazarlama' }));

    expect(router.state.location.pathname).toBe(`/boards/${OTHER_ID}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Pazarlama' })).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pano değiştir' })).toHaveFocus();
  });

  it('goes to /boards from "Tüm panolar"', async () => {
    const { user, router } = openBoard([boardSummary()]);

    const menu = await openSwitcher(user);
    await user.click(within(menu).getByRole('menuitem', { name: 'Tüm panolar' }));

    expect(router.state.location.pathname).toBe('/boards');
  });

  it('works by keyboard: arrow keys, Enter to choose, Escape gives focus back', async () => {
    const { user, router } = openBoard([
      boardSummary(),
      boardSummary({ id: OTHER_ID, title: 'Pazarlama' }),
    ]);
    const nav = await screen.findByRole('navigation', { name: 'Pano gezintisi' });
    const trigger = within(nav).getByRole('button', { name: 'Pano değiştir' });
    await screen.findByRole('heading', { level: 1, name: 'Yol haritası' });
    trigger.focus();

    await user.keyboard('{ArrowDown}');
    expect(await screen.findByRole('menuitemradio', { name: 'Yol haritası' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();

    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(router.state.location.pathname).toBe(`/boards/${OTHER_ID}`);
  });

  it('shows a loading note while the boards load', async () => {
    const { user } = openBoard('slow');

    const menu = await openSwitcher(user);

    expect(within(menu).getByText('Panolar yükleniyor…')).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Tüm panolar' })).toBeInTheDocument();
  });

  it('shows an empty note when the user has no boards', async () => {
    const { user } = openBoard([]);

    const menu = await openSwitcher(user);

    expect(await within(menu).findByText('Henüz bir panon yok.')).toBeInTheDocument();
  });

  it('shows the error with a retry item', async () => {
    const { user } = openBoard('error');

    const menu = await openSwitcher(user);

    expect(await within(menu).findByRole('menuitem', { name: 'Tekrar dene' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Tüm panolar' })).toBeInTheDocument();
  });

  it('shows a board the user is added to while the board is open', async () => {
    const { user } = openBoard([boardSummary()]);
    const menu = await openSwitcher(user);
    await within(menu).findByRole('menuitemradio', { name: 'Yol haritası' });
    fakeRealtime.connect();

    fakeRealtime.serverEmit(
      'membership:added',
      boardSummary({ id: OTHER_ID, title: 'Pazarlama', myRole: 'MEMBER' }),
      { boardId: OTHER_ID },
    );

    expect(await within(menu).findByRole('menuitemradio', { name: 'Pazarlama' })).toBeInTheDocument();
  });
});
