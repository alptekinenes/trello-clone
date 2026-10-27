import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { type BoardRole, ErrorCode } from '@trello/contracts';
import type { PrismaService } from '../prisma/prisma.service.js';
import { MEMBER_SELECT } from './member.mapper.js';
import { MembersService } from './members.service.js';

const BOARD = 'board-1';
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
  const service = new MembersService({ boardMember } as unknown as PrismaService);
  return { service, boardMember };
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

      await service.updateRole(BOARD, 'user-2', 'ADMIN');

      expect(boardMember.update).toHaveBeenCalledWith({
        where: { boardId_userId: { boardId: BOARD, userId: 'user-2' } },
        data: { role: 'ADMIN' },
        select: MEMBER_SELECT,
      });
    });

    it('refuses to change the owner', async () => {
      const { service, boardMember } = setup('OWNER');

      const error = await service.updateRole(BOARD, 'owner', 'MEMBER').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(codeOf(error)).toBe(ErrorCode.CANNOT_CHANGE_OWNER);
      expect(boardMember.update).not.toHaveBeenCalled();
    });

    it('throws 404 when the user is not a member', async () => {
      const { service } = setup(null);
      await expect(service.updateRole(BOARD, 'nobody', 'ADMIN')).rejects.toBeInstanceOf(
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

      await service.remove(BOARD, actor, targetId);

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

      await expect(service.remove(BOARD, actor, targetId)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(boardMember.delete).not.toHaveBeenCalled();
    });

    it('does not let the owner leave', async () => {
      const { service, boardMember } = setup('OWNER');

      const error = await service.remove(BOARD, owner, 'owner').catch((e: unknown) => e);

      expect(codeOf(error)).toBe(ErrorCode.OWNER_CANNOT_LEAVE);
      expect(boardMember.delete).not.toHaveBeenCalled();
    });

    it('throws 404 when the target is not a member', async () => {
      const { service } = setup(null);
      await expect(service.remove(BOARD, owner, 'nobody')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
