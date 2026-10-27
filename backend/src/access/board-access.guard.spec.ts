import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BOARD_ROLE_KEY, BoardAccessGuard, type BoardRequest } from './board-access.guard.js';
import type { BoardAccessService } from './board-access.service.js';

function createContext(request: Partial<BoardRequest>): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function setup(minRole: string | undefined) {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) =>
    key === BOARD_ROLE_KEY ? minRole : undefined,
  );
  const access = { requireRole: vi.fn().mockResolvedValue('ADMIN') };
  const guard = new BoardAccessGuard(reflector, access as unknown as BoardAccessService);
  return { guard, access };
}

const USER = { id: 'user-1', email: 'ayse@example.com' };

describe('BoardAccessGuard', () => {
  it('checks the :boardId param against the required role and stores the role', async () => {
    const { guard, access } = setup('MEMBER');
    const request: Partial<BoardRequest> = { user: USER, params: { boardId: 'board-1' } };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);

    expect(access.requireRole).toHaveBeenCalledWith('board-1', 'user-1', 'MEMBER');
    expect(request.boardRole).toBe('ADMIN');
  });

  it('denies a route without a required role instead of allowing it', async () => {
    const { guard, access } = setup(undefined);

    await expect(
      guard.canActivate(createContext({ user: USER, params: { boardId: 'board-1' } })),
    ).resolves.toBe(false);
    expect(access.requireRole).not.toHaveBeenCalled();
  });

  it('requires an authenticated user', async () => {
    const { guard } = setup('MEMBER');
    await expect(
      guard.canActivate(createContext({ params: { boardId: 'board-1' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('passes an empty id when the route has no :boardId, which resolves to not found', async () => {
    const { guard, access } = setup('MEMBER');
    await guard.canActivate(createContext({ user: USER, params: {} }));
    expect(access.requireRole).toHaveBeenCalledWith('', 'user-1', 'MEMBER');
  });
});
