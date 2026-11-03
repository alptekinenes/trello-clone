import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { type BoardRole, ErrorCode } from '@trello/contracts';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { EventOrigin } from '../realtime/event-origin.js';
import type { RealtimeService } from '../realtime/realtime.service.js';
import { MEMBER_SELECT } from './member.mapper.js';
import { MembersService } from './members.service.js';

const BOARD = 'board-1';
const ORIGIN: EventOrigin = { actorId: 'user-1', socketId: 'socket-1' };
const ROW = {
  role: 'ADMIN',
  joinedAt: new Date('2026-10-01T10:00:00.000Z'),
  user: { id: 'user-2', name: 'Mehmet', email: 'mehmet@example.com', avatarUrl: null },
};

function setup(targetRole: BoardRole | null = 'MEMBER') {
  const boardMember = {
    findUnique: vi.fn().mockResolvedValue(targetRole ? { role: targetRole } : null),
    findMany: vi.fn().mockResolvedValue([ROW]),
    update: vi.fn().mockResolvedValue(ROW),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  const calls: string[] = [];
  const realtime = {
    removeUserFromBoard: vi.fn(() => calls.push('removeUserFromBoard')),
    toBoard: vi.fn(() => calls.push('toBoard')),
    toUsers: vi.fn(() => calls.push('toUsers')),
  };
  const service = new MembersService(
    { boardMember } as unknown as PrismaService,
    realtime as unknown as RealtimeService,
  );
  return { service, realtime, calls, boardMember };
}

function codeOf(error: unknown): unknown {
  return (error as { getResponse: () => { code: string } }).getResponse().code;
}

describe('MembersService', () => {
  it('list maps rows to MemberDto', async () => {
    const { service, boardMember } = setup();

    await expect(service.list(BOARD)).resolves.toEqual([
      {
        userId: 'user-2',
        name: 'Mehmet',
        email: 'mehmet@example.com',
        avatarUrl: null,
        role: 'ADMIN',
        joinedAt: '2026-10-01T10:00:00.000Z',
      },
    ]);
    expect(boardMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { boardId: BOARD }, select: MEMBER_SELECT }),
    );
  });

  describe('updateRole', () => {
    it('updates a member', async () => {
      const { service, boardMember } = setup('MEMBER');

      await service.updateRole(BOARD, 'user-2', 'ADMIN', ORIGIN);

      expect(boardMember.update).toHaveBeenCalledWith({
        where: { boardId_userId: { boardId: BOARD, userId: 'user-2' } },
        data: { role: 'ADMIN' },
        select: MEMBER_SELECT,
      });
    });

    it('refuses to change the owner', async () => {
      const { service, boardMember } = setup('OWNER');

      const error = await service
        .updateRole(BOARD, 'owner', 'MEMBER', ORIGIN)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(codeOf(error)).toBe(ErrorCode.CANNOT_CHANGE_OWNER);
      expect(boardMember.update).not.toHaveBeenCalled();
    });

    it('throws 404 when the user is not a member', async () => {
      const { service } = setup(null);
      await expect(service.updateRole(BOARD, 'nobody', 'ADMIN', ORIGIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    const owner = { userId: 'owner', role: 'OWNER' as const };
    const admin = { userId: 'admin', role: 'ADMIN' as const };
    const member = { userId: 'member', role: 'MEMBER' as const };

    it.each([
      ['a member leaves', member, 'member', 'MEMBER'],
      ['an admin leaves', admin, 'admin', 'ADMIN'],
      ['an admin removes a member', admin, 'other', 'MEMBER'],
      ['the owner removes an admin', owner, 'other', 'ADMIN'],
      ['the owner removes a member', owner, 'other', 'MEMBER'],
    ] as const)('allows: %s', async (_, actor, targetId, targetRole) => {
      const { service, boardMember } = setup(targetRole);

      await service.remove(BOARD, actor, targetId, ORIGIN);

      expect(boardMember.delete).toHaveBeenCalledWith({
        where: { boardId_userId: { boardId: BOARD, userId: targetId } },
      });
    });

    it.each([
      ['a member removes another member', member, 'other', 'MEMBER'],
      ['an admin removes another admin', admin, 'other', 'ADMIN'],
      ['an admin removes the owner', admin, 'owner', 'OWNER'],
    ] as const)('forbids: %s', async (_, actor, targetId, targetRole) => {
      const { service, boardMember } = setup(targetRole);

      await expect(service.remove(BOARD, actor, targetId, ORIGIN)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(boardMember.delete).not.toHaveBeenCalled();
    });

    it('does not let the owner leave', async () => {
      const { service, boardMember } = setup('OWNER');

      const error = await service.remove(BOARD, owner, 'owner', ORIGIN).catch((e: unknown) => e);

      expect(codeOf(error)).toBe(ErrorCode.OWNER_CANNOT_LEAVE);
      expect(boardMember.delete).not.toHaveBeenCalled();
    });

    it('throws 404 when the target is not a member', async () => {
      const { service } = setup(null);
      await expect(service.remove(BOARD, owner, 'nobody', ORIGIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('realtime', () => {
    it('updateRole broadcasts member:updated with the member', async () => {
      const { service, realtime } = setup('MEMBER');

      const member = await service.updateRole(BOARD, 'user-2', 'ADMIN', ORIGIN);

      expect(realtime.toBoard).toHaveBeenCalledOnce();
      expect(realtime.toBoard).toHaveBeenCalledWith(BOARD, ORIGIN, [
        { type: 'member:updated', data: member },
      ]);
    });

    it('updateRole broadcasts nothing for the owner', async () => {
      const { service, realtime } = setup('OWNER');

      await expect(service.updateRole(BOARD, 'owner', 'MEMBER', ORIGIN)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(realtime.toBoard).not.toHaveBeenCalled();
    });

    it('remove takes the sockets out of the room, then tells the board, then the user', async () => {
      const { service, realtime, calls } = setup('MEMBER');

      await service.remove(BOARD, { userId: 'owner', role: 'OWNER' }, 'user-2', ORIGIN);

      expect(calls).toEqual(['removeUserFromBoard', 'toBoard', 'toUsers']);
      expect(realtime.removeUserFromBoard).toHaveBeenCalledWith(BOARD, 'user-2');
      expect(realtime.toBoard).toHaveBeenCalledWith(BOARD, ORIGIN, [
        { type: 'member:removed', data: { userId: 'user-2' } },
      ]);
      expect(realtime.toUsers).toHaveBeenCalledWith(['user-2'], BOARD, ORIGIN, {
        type: 'membership:removed',
        data: { boardId: BOARD },
      });
    });

    it('remove sends the same three steps when a member leaves', async () => {
      const { service, calls } = setup('MEMBER');

      await service.remove(BOARD, { userId: 'member', role: 'MEMBER' }, 'member', ORIGIN);

      expect(calls).toEqual(['removeUserFromBoard', 'toBoard', 'toUsers']);
    });

    it('remove touches no room when the delete fails or the removal is refused', async () => {
      const failing = setup('MEMBER');
      failing.boardMember.delete.mockRejectedValue(new Error('boom'));
      await expect(
        failing.service.remove(BOARD, { userId: 'owner', role: 'OWNER' }, 'user-2', ORIGIN),
      ).rejects.toThrow('boom');
      expect(failing.calls).toEqual([]);

      const refused = setup('OWNER');
      await expect(
        refused.service.remove(BOARD, { userId: 'owner', role: 'OWNER' }, 'owner', ORIGIN),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(refused.calls).toEqual([]);
    });
  });
});
