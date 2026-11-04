import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BoardRole } from '@trello/contracts';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { boardMenuItemNames, openBoardMenu, selectBoardMenuItem } from '../../../test/board-menu';
import { boardDetail } from '../../../test/fixtures';
import { renderWithProviders } from '../../../test/render';
import { BoardHeader } from './board-header';

function renderHeader(role: BoardRole) {
  renderWithProviders(
    <MemoryRouter>
      <BoardHeader detail={boardDetail(role)} />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

describe('BoardHeader share button and board menu', () => {
  it('opens the members dialog from a "Paylaş" button', async () => {
    const user = renderHeader('OWNER');

    await user.click(screen.getByRole('button', { name: 'Paylaş' }));

    expect(await screen.findByRole('dialog', { name: 'Pano üyeleri' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Üyeler' })).not.toBeInTheDocument();
  });

  it('shows a passive "Özel pano" indicator that is not a control', () => {
    renderHeader('MEMBER');

    const indicator = screen.getByText('Özel pano');
    expect(indicator.closest('button, a')).toBeNull();
    expect(indicator.parentElement).toHaveAttribute('title', 'Özel pano');
  });

  it.each([
    ['OWNER', ['Etiketler', 'Arşiv', 'Arka plan', 'Panoyu sil']],
    ['ADMIN', ['Etiketler', 'Arşiv', 'Arka plan']],
    ['MEMBER', ['Etiketler', 'Arşiv']],
  ] as const)('offers the %s these board menu items', async (role, expected) => {
    const user = renderHeader(role);

    expect(await boardMenuItemNames(user)).toEqual(expected);
  });

  it('no longer keeps the board actions as toolbar buttons', () => {
    renderHeader('OWNER');

    for (const name of ['Etiketler', 'Arşiv', 'Arka plan', 'Panoyu sil']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('moves between items with the arrow keys and closes on Escape with focus on the trigger', async () => {
    const user = renderHeader('OWNER');
    const trigger = screen.getByRole('button', { name: 'Pano menüsü' });
    trigger.focus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Etiketler' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Arşiv' })).toHaveFocus();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes the menu when it opens a dialog and leaves the trigger usable afterwards (focus return is covered in Playwright)', async () => {
    const user = renderHeader('OWNER');

    await selectBoardMenuItem(user, 'Etiketler');
    expect(await screen.findByRole('dialog', { name: 'Etiketler' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Kapat' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pano menüsü' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens the delete confirmation from the menu', async () => {
    const user = renderHeader('OWNER');

    await openBoardMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Panoyu sil' }));

    expect(await screen.findByRole('dialog', { name: 'Pano silinsin mi?' })).toBeInTheDocument();
  });
});
