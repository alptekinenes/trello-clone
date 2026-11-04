import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { useThemeStore } from '../../../shared/lib/theme';
import { testUser } from '../../../test/fixtures';
import { server } from '../../../test/msw-server';
import { renderWithProviders } from '../../../test/render';
import { useAuthStore } from '../store/auth-store';
import { AccountMenu } from './account-menu';

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
  useThemeStore.setState({ preference: 'system' });
  useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
});

const trigger = () => screen.getByRole('button', { name: 'Hesap menüsü' });

async function openMenu() {
  const user = userEvent.setup();
  renderWithProviders(<AccountMenu />);
  await user.click(trigger());
  return user;
}

describe('AccountMenu', () => {
  it('renders nothing for a signed-out visitor', () => {
    useAuthStore.getState().clearSession();
    renderWithProviders(<AccountMenu />);
    expect(screen.queryByRole('button', { name: 'Hesap menüsü' })).not.toBeInTheDocument();
  });

  it('shows the name and email and the account actions when opened', async () => {
    await openMenu();

    const menu = screen.getByRole('menu', { name: 'Hesap menüsü' });
    expect(within(menu).getByText(testUser.name)).toBeInTheDocument();
    expect(within(menu).getByText(testUser.email)).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Profil' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Klavye kısayolları' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Çıkış yap' })).toBeInTheDocument();
  });

  it('changes the theme from the Tema group and reflects it on the document', async () => {
    const user = await openMenu();

    const group = screen.getByRole('group', { name: 'Tema' });
    expect(within(group).getByRole('menuitemradio', { name: 'Sistem' })).toBeChecked();

    await user.click(within(group).getByRole('menuitemradio', { name: 'Koyu' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem('theme')).toBe('dark');
    expect(trigger()).toHaveFocus();

    await user.click(trigger());
    expect(screen.getByRole('menuitemradio', { name: 'Koyu' })).toBeChecked();
    await user.click(screen.getByRole('menuitemradio', { name: 'Açık' }));
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('lists the keyboard shortcuts and closes them', async () => {
    const user = await openMenu();

    await user.click(screen.getByRole('menuitem', { name: 'Klavye kısayolları' }));
    const dialog = screen.getByRole('dialog', { name: 'Klavye kısayolları' });
    expect(within(dialog).getByText('Taşımadan vazgeçer')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Kapat' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the profile dialog with the current values', async () => {
    const user = await openMenu();

    await user.click(screen.getByRole('menuitem', { name: 'Profil' }));

    const dialog = screen.getByRole('dialog', { name: 'Profil' });
    expect(within(dialog).getByLabelText('Ad soyad')).toHaveValue(testUser.name);
  });

  it('signs out from the menu', async () => {
    let loggedOut = false;
    server.use(
      http.post('*/api/v1/auth/logout', () => {
        loggedOut = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = await openMenu();

    await user.click(screen.getByRole('menuitem', { name: 'Çıkış yap' }));

    await waitFor(() => expect(useAuthStore.getState().status).toBe('anonymous'));
    expect(loggedOut).toBe(true);
  });
});
