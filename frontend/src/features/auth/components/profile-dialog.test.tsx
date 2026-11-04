import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UpdateMeRequest } from '@trello/contracts';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError, testUser } from '../../../test/fixtures';
import { server } from '../../../test/msw-server';
import { renderWithProviders } from '../../../test/render';
import { boardKeys } from '../../boards';
import { useAuthStore } from '../store/auth-store';
import { ProfileDialog } from './profile-dialog';

beforeEach(() => {
  useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
});

function setup() {
  const onClose = vi.fn();
  renderWithProviders(<ProfileDialog user={testUser} onClose={onClose} />);
  return { onClose, user: userEvent.setup() };
}

describe('ProfileDialog', () => {
  it('saves the new name, updates the signed-in user and closes', async () => {
    let body: UpdateMeRequest | null = null;
    server.use(
      http.patch('*/api/v1/users/me', async ({ request }) => {
        body = (await request.json()) as UpdateMeRequest;
        return HttpResponse.json({ ...testUser, name: 'Ayşe Demir' });
      }),
    );
    const { onClose, user } = setup();

    const name = screen.getByLabelText('Ad soyad');
    await user.clear(name);
    await user.type(name, '  Ayşe Demir ');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(body).toEqual({ name: 'Ayşe Demir', avatarUrl: null });
    expect(useAuthStore.getState().user?.name).toBe('Ayşe Demir');
  });

  it('refreshes the cached boards so member names and avatars are not stale', async () => {
    server.use(http.patch('*/api/v1/users/me', () => HttpResponse.json({ ...testUser, name: 'Ayşe Demir' })));
    const onClose = vi.fn();
    const { queryClient } = renderWithProviders(<ProfileDialog user={testUser} onClose={onClose} />);
    queryClient.setQueryData(boardKeys.detail('board-1'), { stale: true });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Ad soyad'), 'x');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(queryClient.getQueryState(boardKeys.detail('board-1'))?.isInvalidated).toBe(true);
  });

  it('sends an https avatar address as typed', async () => {
    let body: UpdateMeRequest | null = null;
    server.use(
      http.patch('*/api/v1/users/me', async ({ request }) => {
        body = (await request.json()) as UpdateMeRequest;
        return HttpResponse.json(testUser);
      }),
    );
    const { onClose, user } = setup();

    await user.type(screen.getByLabelText('Avatar adresi'), 'https://example.com/a.png');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(body).toEqual({ name: testUser.name, avatarUrl: 'https://example.com/a.png' });
  });

  it('shows field errors and does not call the server', async () => {
    let called = false;
    server.use(
      http.patch('*/api/v1/users/me', () => {
        called = true;
        return HttpResponse.json(testUser);
      }),
    );
    const { user } = setup();

    await user.clear(screen.getByLabelText('Ad soyad'));
    await user.type(screen.getByLabelText('Avatar adresi'), 'http://example.com/a.png');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    const name = await screen.findByLabelText('Ad soyad');
    expect(name).toHaveAccessibleDescription('Adını gir.');
    expect(name).toBeInvalid();
    expect(screen.getByLabelText('Avatar adresi')).toHaveAccessibleDescription(
      /https:\/\/ ile başlayan geçerli bir adres gir\./,
    );
    expect(called).toBe(false);
  });

  it('shows the server error and keeps the dialog open', async () => {
    server.use(http.patch('*/api/v1/users/me', () => apiError(400, 'VALIDATION_FAILED', 'Hatalı')));
    const { onClose, user } = setup();

    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user?.name).toBe(testUser.name);
  });

  it('closes without saving on Vazgeç', async () => {
    const { onClose, user } = setup();

    await user.click(screen.getByRole('button', { name: 'Vazgeç' }));

    expect(onClose).toHaveBeenCalled();
  });
});
