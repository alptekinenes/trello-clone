import { screen } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

/** Opens the "…" menu of a list column by the list's title and returns the menu element. */
export async function openListMenu(user: UserEvent, listTitle: string): Promise<HTMLElement> {
  const name = `“${listTitle}” listesinin işlemleri`;
  await user.click(await screen.findByRole('button', { name }));
  return screen.findByRole('menu', { name });
}

/** Opens a list's menu and picks an item, as a person would. */
export async function selectListMenuItem(
  user: UserEvent,
  listTitle: string,
  itemName: string,
): Promise<void> {
  await openListMenu(user, listTitle);
  await user.click(screen.getByRole('menuitem', { name: itemName }));
}
