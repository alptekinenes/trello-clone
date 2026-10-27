import { ExecutionContext, NotFoundException, UnauthorizedException } from '@nestjs/common';
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
  const access = {
    requireRole: vi.fn().mockResolvedValue('ADMIN'),
    boardIdOfList: vi.fn().mockResolvedValue('board-of-list'),
  };
  const guard = new BoardAccessGuard(reflector, access as unknown as BoardAccessService);
  return { guard, access };
}

const USER = { id: 'user-1', email: 'ayse@example.com' };

function notFoundMessage(factory: unknown): string {
  const error = (factory as () => NotFoundException)();
  return (error.getResponse() as { message: string }).message;
}

describe('BoardAccessGuard', () => {
  it('checks the :boardId param against the required role and stores the access', async () => {
    const { guard, access } = setup('MEMBER');
    const request: Partial<BoardRequest> = { user: USER, params: { boardId: 'board-1' } };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);

    expect(access.requireRole).toHaveBeenCalledWith(
      'board-1',
      'user-1',
      'MEMBER',
      expect.any(Function),
    );
    expect(notFoundMessage(access.requireRole.mock.calls[0][3])).toBe('Board not found');
    expect(request.boardAccess).toEqual({ boardId: 'board-1', role: 'ADMIN' });
  });

  it('resolves the board from :listId and reports a missing list', async () => {
    const { guard, access } = setup('MEMBER');
    const request: Partial<BoardRequest> = { user: USER, params: { listId: 'list-1' } };

    await guard.canActivate(createContext(request));

    expect(access.boardIdOfList).toHaveBeenCalledWith('list-1');
    expect(access.requireRole.mock.calls[0][0]).toBe('board-of-list');
    expect(notFoundMessage(access.requireRole.mock.calls[0][3])).toBe('List not found');
    expect(request.boardAccess).toEqual({ boardId: 'board-of-list', role: 'ADMIN' });
  });

  it('denies a route without a required role instead of allowing it', async () => {
    const { guard, access } = setup(undefined);

    await expect(
      guard.canActivate(createContext({ user: USER, params: { boardId: 'board-1' } })),
    ).resolves.toBe(false);
    expect(access.requireRole).not.toHaveBeenCalled();
  });

  it('denies a route without a board or list param', async () => {
    const { guard, access } = setup('MEMBER');

    await expect(guard.canActivate(createContext({ user: USER, params: {} }))).resolves.toBe(
      false,
    );
    expect(access.requireRole).not.toHaveBeenCalled();
  });

  it('requires an authenticated user', async () => {
    const { guard } = setup('MEMBER');
    await expect(
      guard.canActivate(createContext({ params: { boardId: 'board-1' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
