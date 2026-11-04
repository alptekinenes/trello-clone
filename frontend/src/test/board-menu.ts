import { screen } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

/** Opens the "Pano menüsü" in the board header and returns its menu element. */
export async function openBoardMenu(user: UserEvent): Promise<HTMLElement> {
  await user.click(await screen.findByRole('button', { name: 'Pano menüsü' }));
  return screen.findByRole('menu', { name: 'Pano menüsü' });
}

/** Opens the board menu and picks an item, as a person would. */
export async function selectBoardMenuItem(user: UserEvent, name: string): Promise<void> {
  await openBoardMenu(user);
  await user.click(screen.getByRole('menuitem', { name }));
}

/** Names of the items the board menu offers right now; leaves the menu closed again. */
export async function boardMenuItemNames(user: UserEvent): Promise<string[]> {
  const menu = await openBoardMenu(user);
  const names = Array.from(menu.querySelectorAll('[role="menuitem"]')).map(
    (item) => item.textContent ?? '',
  );
  await user.keyboard('{Escape}');
  return names;
}
