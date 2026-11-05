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
    boardIdOfCard: vi.fn().mockResolvedValue('board-of-card'),
    boardIdOfChecklist: vi.fn().mockResolvedValue('board-of-checklist'),
    boardIdOfChecklistItem: vi.fn().mockResolvedValue('board-of-item'),
    boardIdOfLabel: vi.fn().mockResolvedValue('board-of-label'),
    boardIdOfComment: vi.fn().mockResolvedValue('board-of-comment'),
    boardIdOfAttachment: vi.fn().mockResolvedValue('board-of-attachment'),
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

  it('resolves the board from :cardId and reports a missing card', async () => {
    const { guard, access } = setup('MEMBER');
    const request: Partial<BoardRequest> = { user: USER, params: { cardId: 'card-1' } };

    await guard.canActivate(createContext(request));

    expect(access.boardIdOfCard).toHaveBeenCalledWith('card-1');
    expect(access.boardIdOfList).not.toHaveBeenCalled();
    expect(access.requireRole.mock.calls[0][0]).toBe('board-of-card');
    expect(notFoundMessage(access.requireRole.mock.calls[0][3])).toBe('Card not found');
    expect(request.boardAccess).toEqual({ boardId: 'board-of-card', role: 'ADMIN' });
  });

  it('resolves the board from :checklistId and reports a missing checklist', async () => {
    const { guard, access } = setup('MEMBER');
    const request: Partial<BoardRequest> = { user: USER, params: { checklistId: 'cl-1' } };

    await guard.canActivate(createContext(request));

    expect(access.boardIdOfChecklist).toHaveBeenCalledWith('cl-1');
    expect(access.requireRole.mock.calls[0][0]).toBe('board-of-checklist');
    expect(notFoundMessage(access.requireRole.mock.calls[0][3])).toBe('Checklist not found');
    expect(request.boardAccess).toEqual({ boardId: 'board-of-checklist', role: 'ADMIN' });
  });

  it('resolves the board from :itemId and reports a missing item', async () => {
    const { guard, access } = setup('MEMBER');
    const request: Partial<BoardRequest> = { user: USER, params: { itemId: 'item-1' } };

    await guard.canActivate(createContext(request));

    expect(access.boardIdOfChecklistItem).toHaveBeenCalledWith('item-1');
    expect(access.requireRole.mock.calls[0][0]).toBe('board-of-item');
    expect(notFoundMessage(access.requireRole.mock.calls[0][3])).toBe('Checklist item not found');
    expect(request.boardAccess).toEqual({ boardId: 'board-of-item', role: 'ADMIN' });
  });

  it('resolves the board from :labelId and reports a missing label', async () => {
    const { guard, access } = setup('MEMBER');
    const request: Partial<BoardRequest> = { user: USER, params: { labelId: 'label-1' } };

    await guard.canActivate(createContext(request));

    expect(access.boardIdOfLabel).toHaveBeenCalledWith('label-1');
    expect(access.requireRole.mock.calls[0][0]).toBe('board-of-label');
    expect(notFoundMessage(access.requireRole.mock.calls[0][3])).toBe('Label not found');
    expect(request.boardAccess).toEqual({ boardId: 'board-of-label', role: 'ADMIN' });
  });

  it('resolves the board from :commentId and reports a missing comment', async () => {
    const { guard, access } = setup('MEMBER');
    const request: Partial<BoardRequest> = { user: USER, params: { commentId: 'comment-1' } };

    await guard.canActivate(createContext(request));

    expect(access.boardIdOfComment).toHaveBeenCalledWith('comment-1');
    expect(access.requireRole.mock.calls[0][0]).toBe('board-of-comment');
    expect(notFoundMessage(access.requireRole.mock.calls[0][3])).toBe('Comment not found');
    expect(request.boardAccess).toEqual({ boardId: 'board-of-comment', role: 'ADMIN' });
  });

  it('resolves the board from :attachmentId and reports a missing attachment', async () => {
    const { guard, access } = setup('MEMBER');
    const request: Partial<BoardRequest> = {
      user: USER,
      params: { attachmentId: 'attachment-1' },
    };

    await guard.canActivate(createContext(request));

    expect(access.boardIdOfAttachment).toHaveBeenCalledWith('attachment-1');
    expect(access.requireRole.mock.calls[0][0]).toBe('board-of-attachment');
    expect(notFoundMessage(access.requireRole.mock.calls[0][3])).toBe('Attachment not found');
    expect(request.boardAccess).toEqual({ boardId: 'board-of-attachment', role: 'ADMIN' });
  });

  it('lets the card win when a route has both :cardId and :labelId', async () => {
    const { guard, access } = setup('MEMBER');
    const request: Partial<BoardRequest> = {
      user: USER,
      params: { labelId: 'label-1', cardId: 'card-1' },
    };

    await guard.canActivate(createContext(request));

    expect(access.boardIdOfCard).toHaveBeenCalledWith('card-1');
    expect(access.boardIdOfLabel).not.toHaveBeenCalled();
    expect(request.boardAccess).toEqual({ boardId: 'board-of-card', role: 'ADMIN' });
  });

  it('lets the checklist win over the item when a route has both', async () => {
    const { guard, access } = setup('MEMBER');
    const request: Partial<BoardRequest> = {
      user: USER,
      params: { itemId: 'item-1', checklistId: 'cl-1' },
    };

    await guard.canActivate(createContext(request));

    expect(access.boardIdOfChecklist).toHaveBeenCalledWith('cl-1');
    expect(access.boardIdOfChecklistItem).not.toHaveBeenCalled();
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
