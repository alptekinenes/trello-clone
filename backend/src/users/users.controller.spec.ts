import { UnauthorizedException } from '@nestjs/common';
import type { UserDto } from '@trello/contracts';
import { UsersController } from './users.controller.js';
import type { UsersService } from './users.service.js';

const CURRENT = { id: 'user-1', email: 'ayse@example.com' };
const USER: UserDto = { id: 'user-1', email: 'ayse@example.com', name: 'Ayşe', avatarUrl: null };

function setup() {
  const users = { findById: vi.fn().mockResolvedValue(USER), update: vi.fn().mockResolvedValue(USER) };
  return { controller: new UsersController(users as unknown as UsersService), users };
}

describe('UsersController', () => {
  it('me returns the current user', async () => {
    const { controller, users } = setup();
    await expect(controller.me(CURRENT)).resolves.toEqual(USER);
    expect(users.findById).toHaveBeenCalledWith('user-1');
  });

  it('me fails with 401 when the account no longer exists', async () => {
    const { controller, users } = setup();
    users.findById.mockResolvedValue(null);
    await expect(controller.me(CURRENT)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('updateMe only updates the current user', async () => {
    const { controller, users } = setup();
    await controller.updateMe(CURRENT, { name: 'Yeni Ad' });
    expect(users.update).toHaveBeenCalledWith('user-1', { name: 'Yeni Ad' });
  });

  it('updateMe fails with 401 when the account no longer exists', async () => {
    const { controller, users } = setup();
    users.update.mockResolvedValue(null);
    await expect(controller.updateMe(CURRENT, { name: 'Yeni Ad' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
