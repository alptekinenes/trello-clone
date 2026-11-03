import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode, type CreateInvitationResponse } from '@trello/contracts';
import { hashToken } from '../common/crypto/opaque-token.js';
import type { MailService } from '../mail/mail.service.js';
import { toBoardSummary } from '../boards/board.mapper.js';
import { MEMBER_SELECT } from '../members/member.mapper.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { EventOrigin } from '../realtime/event-origin.js';
import type { RealtimeService } from '../realtime/realtime.service.js';
import { INVITATION_ORDER, INVITATION_SELECT } from './invitation.mapper.js';
import { InvitationsService } from './invitations.service.js';

const BOARD = 'board-1';
const ORIGIN: EventOrigin = { actorId: 'owner-1', socketId: 'socket-1' };
const BOARD_ROW = {
  id: BOARD,
  title: 'Yol haritası',
  background: 'blue',
  updatedAt: new Date('2026-11-02T09:00:00.000Z'),
};
const NOW = new Date('2026-11-02T10:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const APP_URL = 'https://app.example.com';

const OWNER = { userId: 'owner-1', role: 'OWNER' as const };
const ADMIN = { userId: 'admin-1', role: 'ADMIN' as const };

const INVITATION_ROW = {
  id: 'inv-1',
  boardId: BOARD,
  email: 'davetli@example.com',
  role: 'MEMBER' as const,
  expiresAt: new Date(NOW.getTime() + 7 * DAY_MS),
  invitedBy: { id: OWNER.userId, name: 'Sahip' },
  board: { title: 'Yol haritası' },
};

const MEMBER_ROW = {
  role: 'MEMBER' as const,
  joinedAt: new Date('2026-11-02T10:00:00.000Z'),
  user: { id: 'user-2', name: 'Mehmet', email: 'mehmet@example.com', avatarUrl: null },
};

interface ExistingRow {
  role: 'ADMIN' | 'MEMBER';
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED';
  expiresAt: Date;
}

/** An invitation already stored for the address; waits for a week unless told otherwise. */
function stored(
  status: ExistingRow['status'],
  role: ExistingRow['role'] = 'MEMBER',
  expiresAt: Date = new Date(NOW.getTime() + 7 * DAY_MS),
): ExistingRow {
  return { role, status, expiresAt };
}

interface Options {
  boardExists?: boolean;
  registeredUserId?: string | null;
  createdCount?: number;
  existing?: ExistingRow | null;
}

function setup({
  boardExists = true,
  registeredUserId = null,
  createdCount = 1,
  existing = null,
}: Options = {}) {
  const events: string[] = [];
  const tx = {
    $queryRaw: vi.fn(() => {
      events.push('lock');
      return Promise.resolve(boardExists ? [{ id: BOARD }] : []);
    }),
    user: {
      findUnique: vi.fn().mockResolvedValue(registeredUserId ? { id: registeredUserId } : null),
    },
    boardMember: {
      createMany: vi.fn().mockResolvedValue({ count: createdCount }),
      findUniqueOrThrow: vi.fn().mockResolvedValue(MEMBER_ROW),
    },
    board: { findUniqueOrThrow: vi.fn().mockResolvedValue(BOARD_ROW) },
    invitation: {
      upsert: vi.fn().mockResolvedValue(INVITATION_ROW),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findFirst: vi.fn().mockResolvedValue(existing),
      findUnique: vi.fn().mockResolvedValue(existing),
      update: vi.fn().mockResolvedValue(undefined),
    },
  };
  const prisma = {
    invitation: { findMany: vi.fn().mockResolvedValue([INVITATION_ROW]) },
    $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => {
      const result = await fn(tx);
      events.push('commit');
      return result;
    }),
  };
  const mail = {
    sendInvitation: vi.fn(() => {
      events.push('mail');
      return Promise.resolve();
    }),
  };
  const realtime = {
    toBoard: vi.fn(() => events.push('toBoard')),
    toUsers: vi.fn(() => events.push('toUsers')),
  };
  const service = new InvitationsService(
    prisma as unknown as PrismaService,
    mail as unknown as MailService,
    realtime as unknown as RealtimeService,
    new ConfigService({ APP_URL }),
  );
  return { service, tx, prisma, mail, realtime, events };
}

function codeOf(error: unknown): unknown {
  return (error as { getResponse: () => { code: string } }).getResponse().code;
}

function createdOf(result: CreateInvitationResponse) {
  if (result.result !== 'INVITATION_CREATED') throw new Error('Expected INVITATION_CREATED');
  return result;
}

describe('InvitationsService', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('create', () => {
    it('refuses an admin inviting an admin before touching the database', async () => {
      const { service, prisma } = setup();

      const error = await service
        .create(BOARD, ADMIN, { email: 'a@example.com', role: 'ADMIN' }, ORIGIN)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect(codeOf(error)).toBe(ErrorCode.FORBIDDEN);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('lets an admin invite a member and the owner invite an admin', async () => {
      const { service } = setup();
      await expect(
        service.create(BOARD, ADMIN, { email: 'a@example.com', role: 'MEMBER' }, ORIGIN),
      ).resolves.toMatchObject({ result: 'INVITATION_CREATED' });
      await expect(
        service.create(BOARD, OWNER, { email: 'a@example.com', role: 'ADMIN' }, ORIGIN),
      ).resolves.toMatchObject({ result: 'INVITATION_CREATED' });
    });

    it('takes the board lock before anything else in the transaction', async () => {
      const { service, tx, events } = setup();

      await service.create(BOARD, OWNER, { email: 'a@example.com', role: 'MEMBER' }, ORIGIN);

      expect(events[0]).toBe('lock');
      expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        tx.user.findUnique.mock.invocationCallOrder[0],
      );
    });

    it('answers 404 when the board is gone', async () => {
      const { service, tx } = setup({ boardExists: false });

      const error = await service
        .create(BOARD, OWNER, { email: 'a@example.com', role: 'MEMBER' }, ORIGIN)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).message).toBe('Board not found');
      expect(tx.user.findUnique).not.toHaveBeenCalled();
    });

    it('normalizes the email before looking the user up', async () => {
      const { service, tx } = setup();

      await service.create(BOARD, OWNER, { email: '  B@Example.COM ', role: 'MEMBER' }, ORIGIN);

      expect(tx.user.findUnique.mock.calls[0][0].where).toEqual({ email: 'b@example.com' });
      expect(tx.invitation.upsert.mock.calls[0][0].where).toEqual({
        boardId_email: { boardId: BOARD, email: 'b@example.com' },
      });
    });

    describe('over a waiting invitation for the same address', () => {
      const waitingAdmin = stored('PENDING', 'ADMIN');

      it("refuses an admin replacing the owner's admin invitation and sends nothing", async () => {
        const { service, tx, mail } = setup({ existing: waitingAdmin });

        const error = await service
          .create(BOARD, ADMIN, { email: 'a@example.com', role: 'MEMBER' }, ORIGIN)
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ForbiddenException);
        expect(codeOf(error)).toBe(ErrorCode.FORBIDDEN);
        expect(tx.invitation.upsert).not.toHaveBeenCalled();
        expect(mail.sendInvitation).not.toHaveBeenCalled();
      });

      it('refuses an admin settling it by adding the now registered user', async () => {
        const { service, tx } = setup({ registeredUserId: 'user-2', existing: waitingAdmin });

        const error = await service
          .create(BOARD, ADMIN, { email: 'mehmet@example.com', role: 'MEMBER' }, ORIGIN)
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ForbiddenException);
        expect(tx.boardMember.createMany).not.toHaveBeenCalled();
        expect(tx.invitation.updateMany).not.toHaveBeenCalled();
      });

      it('checks under the board lock, after reading the stored invitation', async () => {
        const { service, tx } = setup({ existing: waitingAdmin });

        await service
          .create(BOARD, ADMIN, { email: 'a@example.com', role: 'MEMBER' }, ORIGIN)
          .catch((e: unknown) => e);

        expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
          tx.invitation.findUnique.mock.invocationCallOrder[0],
        );
        expect(tx.invitation.findUnique.mock.calls[0][0]).toEqual({
          where: { boardId_email: { boardId: BOARD, email: 'a@example.com' } },
          select: { role: true, status: true, expiresAt: true },
        });
      });

      it('lets the owner replace it', async () => {
        const { service, tx } = setup({ existing: waitingAdmin });

        await service.create(BOARD, OWNER, { email: 'a@example.com', role: 'MEMBER' }, ORIGIN);

        expect(tx.invitation.upsert).toHaveBeenCalledOnce();
      });

      it('lets an admin replace a waiting member invitation', async () => {
        const { service, tx } = setup({ existing: stored('PENDING', 'MEMBER') });

        await service.create(BOARD, ADMIN, { email: 'a@example.com', role: 'MEMBER' }, ORIGIN);

        expect(tx.invitation.upsert).toHaveBeenCalledOnce();
      });

      it.each([
        ['revoked', stored('REVOKED', 'ADMIN')],
        ['accepted', stored('ACCEPTED', 'ADMIN')],
        ['expired', stored('PENDING', 'ADMIN', new Date(NOW.getTime() - 1000))],
      ])('lets an admin replace an admin invitation that is %s', async (_, existing) => {
        const { service, tx } = setup({ existing });

        await service.create(BOARD, ADMIN, { email: 'a@example.com', role: 'MEMBER' }, ORIGIN);

        expect(tx.invitation.upsert).toHaveBeenCalledOnce();
      });
    });

    describe('for a registered address', () => {
      it('adds the member with the invited role and sends no mail', async () => {
        const { service, tx, mail } = setup({ registeredUserId: 'user-2' });

        const result = await service.create(BOARD, OWNER, {
          email: 'mehmet@example.com',
          role: 'ADMIN',
        }, ORIGIN);

        expect(tx.boardMember.createMany).toHaveBeenCalledWith({
          data: [{ boardId: BOARD, userId: 'user-2', role: 'ADMIN' }],
          skipDuplicates: true,
        });
        expect(tx.boardMember.findUniqueOrThrow).toHaveBeenCalledWith({
          where: { boardId_userId: { boardId: BOARD, userId: 'user-2' } },
          select: MEMBER_SELECT,
        });
        expect(result).toEqual({
          result: 'MEMBER_ADDED',
          member: {
            userId: 'user-2',
            name: 'Mehmet',
            email: 'mehmet@example.com',
            avatarUrl: null,
            role: 'MEMBER',
            joinedAt: '2026-11-02T10:00:00.000Z',
          },
        });
        expect(tx.invitation.upsert).not.toHaveBeenCalled();
        expect(mail.sendInvitation).not.toHaveBeenCalled();
      });

      it('marks a pending invitation for the same address as accepted', async () => {
        const { service, tx } = setup({ registeredUserId: 'user-2' });

        await service.create(BOARD, OWNER, { email: 'mehmet@example.com', role: 'MEMBER' }, ORIGIN);

        expect(tx.invitation.updateMany).toHaveBeenCalledWith({
          where: { boardId: BOARD, email: 'mehmet@example.com', status: 'PENDING' },
          data: { status: 'ACCEPTED', acceptedAt: NOW },
        });
      });

      it('answers 409 ALREADY_MEMBER when the membership exists', async () => {
        const { service, tx } = setup({ registeredUserId: 'user-2', createdCount: 0 });

        const error = await service
          .create(BOARD, OWNER, { email: 'mehmet@example.com', role: 'MEMBER' }, ORIGIN)
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ConflictException);
        expect(codeOf(error)).toBe(ErrorCode.ALREADY_MEMBER);
        expect(tx.invitation.updateMany).not.toHaveBeenCalled();
      });
    });

    describe('for an unregistered address', () => {
      it('stores only the hash of the token it returns in the link', async () => {
        const { service, tx } = setup();

        const result = createdOf(
          await service.create(BOARD, OWNER, { email: 'a@example.com', role: 'MEMBER' }, ORIGIN),
        );

        const token = result.inviteUrl.slice(`${APP_URL}/invitations/`.length);
        expect(result.inviteUrl).toBe(`${APP_URL}/invitations/${token}`);
        expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

        const args = tx.invitation.upsert.mock.calls[0][0];
        expect(args.create.tokenHash).toBe(hashToken(token));
        expect(args.update.tokenHash).toBe(hashToken(token));
        expect(JSON.stringify(args)).not.toContain(token);
      });

      it('expires seven days from now and resets the row when re-inviting', async () => {
        const { service, tx } = setup();

        await service.create(BOARD, OWNER, { email: 'a@example.com', role: 'ADMIN' }, ORIGIN);

        const args = tx.invitation.upsert.mock.calls[0][0];
        const expiresAt = new Date(NOW.getTime() + 7 * DAY_MS);
        expect(args.create).toMatchObject({
          boardId: BOARD,
          email: 'a@example.com',
          role: 'ADMIN',
          invitedById: OWNER.userId,
          expiresAt,
        });
        expect(args.update).toMatchObject({
          role: 'ADMIN',
          invitedById: OWNER.userId,
          expiresAt,
          status: 'PENDING',
          acceptedAt: null,
        });
        expect(args.select).toBe(INVITATION_SELECT);
      });

      it('returns the invitation without any token field', async () => {
        const { service } = setup();

        const result = createdOf(
          await service.create(BOARD, OWNER, { email: 'a@example.com', role: 'MEMBER' }, ORIGIN),
        );

        expect(result.invitation).toEqual({
          id: 'inv-1',
          boardId: BOARD,
          email: 'davetli@example.com',
          role: 'MEMBER',
          invitedBy: { userId: OWNER.userId, name: 'Sahip' },
          expiresAt: new Date(NOW.getTime() + 7 * DAY_MS).toISOString(),
        });
      });

      it('sends the mail after the transaction commits', async () => {
        const { service, mail, events } = setup();

        const result = createdOf(
          await service.create(BOARD, OWNER, { email: 'a@example.com', role: 'MEMBER' }, ORIGIN),
        );

        expect(events).toEqual(['lock', 'commit', 'mail']);
        expect(mail.sendInvitation).toHaveBeenCalledWith({
          to: 'davetli@example.com',
          boardTitle: 'Yol haritası',
          inviterName: 'Sahip',
          inviteUrl: result.inviteUrl,
          expiresAt: INVITATION_ROW.expiresAt,
        });
      });

      it('still succeeds when the mail fails, and never logs the link', async () => {
        const { service, mail } = setup();
        const errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        mail.sendInvitation.mockRejectedValue(new Error('smtp down'));

        const result = createdOf(
          await service.create(BOARD, OWNER, { email: 'a@example.com', role: 'MEMBER' }, ORIGIN),
        );

        const token = result.inviteUrl.slice(`${APP_URL}/invitations/`.length);
        expect(result.result).toBe('INVITATION_CREATED');
        expect(errorLog).toHaveBeenCalledOnce();
        const logged = String(errorLog.mock.calls[0][0]);
        expect(logged).toContain('inv-1');
        expect(logged).not.toContain(token);
      });
    });
  });

  describe('listPending', () => {
    it('asks for unexpired pending invitations, newest first', async () => {
      const { service, prisma } = setup();

      const result = await service.listPending(BOARD);

      expect(prisma.invitation.findMany).toHaveBeenCalledWith({
        where: { boardId: BOARD, status: 'PENDING', expiresAt: { gt: NOW } },
        select: INVITATION_SELECT,
        orderBy: [...INVITATION_ORDER],
      });
      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty('tokenHash');
    });
  });

  describe('revoke', () => {
    it('locks the board, then revokes a pending invitation', async () => {
      const { service, tx, events } = setup({ existing: stored('PENDING') });

      await service.revoke(BOARD, 'inv-1', 'ADMIN');

      expect(events[0]).toBe('lock');
      expect(tx.invitation.findFirst).toHaveBeenCalledWith({
        where: { id: 'inv-1', boardId: BOARD },
        select: { role: true, status: true, expiresAt: true },
      });
      expect(tx.invitation.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { status: 'REVOKED' },
      });
    });

    it('does nothing when it is already revoked', async () => {
      const { service, tx } = setup({ existing: stored('REVOKED') });

      await expect(service.revoke(BOARD, 'inv-1', 'ADMIN')).resolves.toBeUndefined();

      expect(tx.invitation.update).not.toHaveBeenCalled();
    });

    it('answers 409 INVITATION_USED for an accepted invitation', async () => {
      const { service, tx } = setup({ existing: stored('ACCEPTED') });

      const error = await service.revoke(BOARD, 'inv-1', 'ADMIN').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(codeOf(error)).toBe(ErrorCode.INVITATION_USED);
      expect(tx.invitation.update).not.toHaveBeenCalled();
    });

    it('answers 404 for an invitation of another board or a missing one', async () => {
      const { service, tx } = setup({ existing: null });

      await expect(service.revoke(BOARD, 'inv-9', 'ADMIN')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(tx.invitation.findFirst.mock.calls[0][0].where).toEqual({
        id: 'inv-9',
        boardId: BOARD,
      });
    });

    it('answers 404 when the board is gone', async () => {
      const { service, tx } = setup({ boardExists: false });

      const error = await service.revoke(BOARD, 'inv-1', 'ADMIN').catch((e: unknown) => e);

      expect((error as NotFoundException).message).toBe('Board not found');
      expect(tx.invitation.findFirst).not.toHaveBeenCalled();
    });

    it('refuses an admin cancelling a waiting admin invitation, but lets the owner', async () => {
      const waiting = stored('PENDING', 'ADMIN');
      const denied = setup({ existing: waiting });
      const allowed = setup({ existing: waiting });

      const error = await denied.service.revoke(BOARD, 'inv-1', 'ADMIN').catch((e: unknown) => e);
      await allowed.service.revoke(BOARD, 'inv-1', 'OWNER');

      expect(error).toBeInstanceOf(ForbiddenException);
      expect(codeOf(error)).toBe(ErrorCode.FORBIDDEN);
      expect(denied.tx.invitation.update).not.toHaveBeenCalled();
      expect(allowed.tx.invitation.update).toHaveBeenCalledOnce();
    });

    it('lets an admin cancel a waiting member invitation', async () => {
      const { service, tx } = setup({ existing: stored('PENDING', 'MEMBER') });

      await service.revoke(BOARD, 'inv-1', 'ADMIN');

      expect(tx.invitation.update).toHaveBeenCalledOnce();
    });

    it('lets an admin cancel an admin invitation that has already expired', async () => {
      const expired = stored('PENDING', 'ADMIN', new Date(NOW.getTime() - 1000));
      const { service, tx } = setup({ existing: expired });

      await service.revoke(BOARD, 'inv-1', 'ADMIN');

      expect(tx.invitation.update).toHaveBeenCalledOnce();
    });
  });

  describe('realtime (create)', () => {
    it('tells the board and the new member after the commit when a registered address is added', async () => {
      const { service, realtime, events } = setup({ registeredUserId: 'user-2' });

      const result = await service.create(
        BOARD,
        OWNER,
        { email: 'mehmet@example.com', role: 'ADMIN' },
        ORIGIN,
      );

      expect(events.indexOf('commit')).toBeLessThan(events.indexOf('toBoard'));
      expect(events.indexOf('commit')).toBeLessThan(events.indexOf('toUsers'));
      expect(realtime.toBoard).toHaveBeenCalledOnce();
      expect(realtime.toBoard).toHaveBeenCalledWith(BOARD, ORIGIN, [
        { type: 'member:added', data: expect.objectContaining({ userId: 'user-2' }) },
      ]);
      expect(realtime.toUsers).toHaveBeenCalledOnce();
      expect(realtime.toUsers).toHaveBeenCalledWith(['user-2'], BOARD, ORIGIN, {
        type: 'membership:added',
        // The invited role, not the actor's.
        data: { ...toBoardSummary(BOARD_ROW, 'ADMIN') },
      });
      // The response stays what it was: no board in it.
      expect(Object.keys(result).sort()).toEqual(['member', 'result']);
    });

    it('broadcasts nothing for an address without an account, and no event mentions the token', async () => {
      const { service, realtime } = setup({ registeredUserId: null });

      await service.create(BOARD, OWNER, { email: 'yeni@example.com', role: 'MEMBER' }, ORIGIN);

      expect(realtime.toBoard).not.toHaveBeenCalled();
      expect(realtime.toUsers).not.toHaveBeenCalled();
    });

    it('broadcasts nothing when the user is already a member', async () => {
      const { service, realtime } = setup({ registeredUserId: 'user-2', createdCount: 0 });

      await expect(
        service.create(BOARD, OWNER, { email: 'mehmet@example.com', role: 'MEMBER' }, ORIGIN),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(realtime.toBoard).not.toHaveBeenCalled();
      expect(realtime.toUsers).not.toHaveBeenCalled();
    });

    it('broadcasts nothing when the role is refused', async () => {
      const { service, realtime } = setup({ registeredUserId: 'user-2' });

      await expect(
        service.create(BOARD, ADMIN, { email: 'mehmet@example.com', role: 'ADMIN' }, ORIGIN),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(realtime.toBoard).not.toHaveBeenCalled();
      expect(realtime.toUsers).not.toHaveBeenCalled();
    });
  });

  describe('realtime (revoke)', () => {
    it('broadcasts nothing', async () => {
      const { service, realtime } = setup({ existing: stored('PENDING') });

      await service.revoke(BOARD, 'inv-1', 'OWNER');

      expect(realtime.toBoard).not.toHaveBeenCalled();
      expect(realtime.toUsers).not.toHaveBeenCalled();
    });
  });
});

const ACCEPTED_MEMBER_ROW = {
  role: 'ADMIN' as const,
  joinedAt: new Date('2026-11-02T10:00:00.000Z'),
  user: { id: 'user-9', name: 'Davetli', email: 'davetli@example.com', avatarUrl: null },
};

const TOKEN = 'A'.repeat(43);
const TOKEN_HASH = hashToken(TOKEN);
const USER_ID = 'user-9';

type StoredStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED';

interface TokenOptions {
  /** The invitation behind the token; null means no row has that hash. */
  stored?: { status?: StoredStatus; expiresAt?: Date; email?: string } | null;
  /** The row the second (locked) read finds; defaults to `stored`. */
  reread?: 'same' | null;
  boardExists?: boolean;
  accountEmail?: string | null;
  isMember?: boolean;
  /** What createMany reports; 0 means the user became a member some other way meanwhile. */
  createdCount?: number;
}

function setupToken({
  stored = {},
  reread = 'same',
  boardExists = true,
  accountEmail = 'davetli@example.com',
  isMember = false,
  createdCount = 1,
}: TokenOptions = {}) {
  const row = stored
    ? {
        id: 'inv-1',
        boardId: BOARD,
        email: stored.email ?? 'davetli@example.com',
        role: 'ADMIN' as const,
        status: stored.status ?? 'PENDING',
        expiresAt: stored.expiresAt ?? new Date(NOW.getTime() + DAY_MS),
      }
    : null;
  const preview = row && {
    ...row,
    invitedBy: { name: 'Sahip' },
    board: { title: 'Yol haritası' },
  };

  const realtime = { toBoard: vi.fn(), toUsers: vi.fn() };
  // How many broadcasts had been made when the transaction callback returned.
  const inTransaction = { broadcasts: -1 };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue(boardExists ? [{ id: BOARD }] : []),
    user: { findUnique: vi.fn().mockResolvedValue(accountEmail ? { email: accountEmail } : null) },
    boardMember: {
      createMany: vi.fn().mockResolvedValue({ count: createdCount }),
      findUnique: vi.fn().mockResolvedValue(isMember ? { userId: USER_ID } : null),
      findUniqueOrThrow: vi.fn().mockResolvedValue(ACCEPTED_MEMBER_ROW),
    },
    board: { findUniqueOrThrow: vi.fn().mockResolvedValue(BOARD_ROW) },
    invitation: {
      findUnique: vi.fn().mockResolvedValue(reread === 'same' ? row : null),
      update: vi.fn().mockResolvedValue(undefined),
    },
  };
  const prisma = {
    invitation: {
      findUnique: vi.fn().mockResolvedValue(
        // Preview reads the full preview columns; accept's first read only needs the board.
        preview,
      ),
    },
    $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => {
      const result = await fn(tx);
      inTransaction.broadcasts = realtime.toBoard.mock.calls.length + realtime.toUsers.mock.calls.length;
      return result;
    }),
  };
  const service = new InvitationsService(
    prisma as unknown as PrismaService,
    { sendInvitation: vi.fn() } as unknown as MailService,
    realtime as unknown as RealtimeService,
    new ConfigService({ APP_URL }),
  );
  return { service, tx, prisma, realtime, inTransaction };
}

describe('InvitationsService by token', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('preview', () => {
    it('returns exactly the preview fields', async () => {
      const { service, prisma } = setupToken();

      await expect(service.preview(TOKEN)).resolves.toEqual({
        boardTitle: 'Yol haritası',
        inviterName: 'Sahip',
        email: 'davetli@example.com',
        role: 'ADMIN',
        expiresAt: new Date(NOW.getTime() + DAY_MS).toISOString(),
      });
      expect(prisma.invitation.findUnique.mock.calls[0][0].where).toEqual({
        tokenHash: TOKEN_HASH,
      });
    });

    it.each(['abc', '', 'A'.repeat(42), 'A'.repeat(44), `${'A'.repeat(42)}+`])(
      'answers 404 for the malformed token %j without a lookup',
      async (token) => {
        const { service, prisma } = setupToken();

        await expect(service.preview(token)).rejects.toBeInstanceOf(NotFoundException);

        expect(prisma.invitation.findUnique).not.toHaveBeenCalled();
      },
    );

    it('answers 404 for an unknown token', async () => {
      const { service } = setupToken({ stored: null });
      await expect(service.preview(TOKEN)).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each([
      ['REVOKED', ErrorCode.INVITATION_REVOKED],
      ['ACCEPTED', ErrorCode.INVITATION_USED],
    ] as const)('answers 410 for a %s invitation', async (status, code) => {
      const { service } = setupToken({ stored: { status } });

      const error = await service.preview(TOKEN).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(GoneException);
      expect(codeOf(error)).toBe(code);
    });

    it('answers 410 INVITATION_EXPIRED exactly at the expiry time', async () => {
      const { service } = setupToken({ stored: { expiresAt: NOW } });

      const error = await service.preview(TOKEN).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(GoneException);
      expect(codeOf(error)).toBe(ErrorCode.INVITATION_EXPIRED);
    });

    it('reports a revoked invitation as revoked even when it is also expired', async () => {
      const { service } = setupToken({
        stored: { status: 'REVOKED', expiresAt: new Date(NOW.getTime() - DAY_MS) },
      });

      const error = await service.preview(TOKEN).catch((e: unknown) => e);

      expect(codeOf(error)).toBe(ErrorCode.INVITATION_REVOKED);
    });
  });

  describe('accept', () => {
    it('locks the board first, reads again under the lock and adds the member', async () => {
      const { service, tx } = setupToken();

      await expect(service.accept(TOKEN, USER_ID, ORIGIN)).resolves.toEqual({ boardId: BOARD });

      expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        tx.invitation.findUnique.mock.invocationCallOrder[0],
      );
      expect(tx.invitation.findUnique.mock.calls[0][0].where).toEqual({ tokenHash: TOKEN_HASH });
      expect(tx.boardMember.createMany).toHaveBeenCalledWith({
        data: [{ boardId: BOARD, userId: USER_ID, role: 'ADMIN' }],
        skipDuplicates: true,
      });
      expect(tx.invitation.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { status: 'ACCEPTED', acceptedAt: NOW },
      });
    });

    it.each(['abc', 'A'.repeat(44)])('answers 404 for the malformed token %j', async (token) => {
      const { service, prisma } = setupToken();

      await expect(service.accept(token, USER_ID, ORIGIN)).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.invitation.findUnique).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('answers 404 for an unknown token without opening a transaction', async () => {
      const { service, prisma } = setupToken({ stored: null });

      await expect(service.accept(TOKEN, USER_ID, ORIGIN)).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('answers 404 when the board was deleted in the meantime', async () => {
      const { service, tx } = setupToken({ boardExists: false });

      await expect(service.accept(TOKEN, USER_ID, ORIGIN)).rejects.toBeInstanceOf(NotFoundException);

      expect(tx.invitation.findUnique).not.toHaveBeenCalled();
    });

    it('answers 404 when a re-invite replaced the token before the lock was granted', async () => {
      const { service, tx } = setupToken({ reread: null });

      await expect(service.accept(TOKEN, USER_ID, ORIGIN)).rejects.toBeInstanceOf(NotFoundException);

      expect(tx.boardMember.createMany).not.toHaveBeenCalled();
    });

    it('answers 401 when the account no longer exists', async () => {
      const { service } = setupToken({ accountEmail: null });
      await expect(service.accept(TOKEN, USER_ID, ORIGIN)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('answers 410 INVITATION_REVOKED', async () => {
      const { service, tx } = setupToken({ stored: { status: 'REVOKED' } });

      const error = await service.accept(TOKEN, USER_ID, ORIGIN).catch((e: unknown) => e);

      expect(codeOf(error)).toBe(ErrorCode.INVITATION_REVOKED);
      expect(tx.boardMember.createMany).not.toHaveBeenCalled();
    });

    it('answers 410 INVITATION_EXPIRED', async () => {
      const { service, tx } = setupToken({ stored: { expiresAt: NOW } });

      const error = await service.accept(TOKEN, USER_ID, ORIGIN).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(GoneException);
      expect(codeOf(error)).toBe(ErrorCode.INVITATION_EXPIRED);
      expect(tx.boardMember.createMany).not.toHaveBeenCalled();
    });

    it('answers 403 EMAIL_MISMATCH for another account and changes nothing', async () => {
      const { service, tx } = setupToken({ accountEmail: 'baska@example.com' });

      const error = await service.accept(TOKEN, USER_ID, ORIGIN).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect(codeOf(error)).toBe(ErrorCode.EMAIL_MISMATCH);
      expect(tx.boardMember.createMany).not.toHaveBeenCalled();
      expect(tx.invitation.update).not.toHaveBeenCalled();
    });

    it('is idempotent for the matching account that is still a member', async () => {
      const { service, tx } = setupToken({ stored: { status: 'ACCEPTED' }, isMember: true });

      await expect(service.accept(TOKEN, USER_ID, ORIGIN)).resolves.toEqual({ boardId: BOARD });

      expect(tx.boardMember.createMany).not.toHaveBeenCalled();
      expect(tx.invitation.update).not.toHaveBeenCalled();
    });

    it('answers 410 INVITATION_USED when an accepted invitation is used by a non-member', async () => {
      const { service } = setupToken({ stored: { status: 'ACCEPTED' }, isMember: false });

      const error = await service.accept(TOKEN, USER_ID, ORIGIN).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(GoneException);
      expect(codeOf(error)).toBe(ErrorCode.INVITATION_USED);
    });

    it('answers 410 INVITATION_USED when another account uses an accepted invitation', async () => {
      const { service } = setupToken({
        stored: { status: 'ACCEPTED' },
        accountEmail: 'baska@example.com',
        isMember: true,
      });

      const error = await service.accept(TOKEN, USER_ID, ORIGIN).catch((e: unknown) => e);

      expect(codeOf(error)).toBe(ErrorCode.INVITATION_USED);
    });
  });

  describe('realtime', () => {
    it('tells the board and the new member after the commit, with the invited role', async () => {
      const { service, realtime, inTransaction } = setupToken();

      await expect(service.accept(TOKEN, USER_ID, ORIGIN)).resolves.toEqual({ boardId: BOARD });

      expect(inTransaction.broadcasts).toBe(0);
      expect(realtime.toBoard).toHaveBeenCalledOnce();
      expect(realtime.toBoard).toHaveBeenCalledWith(BOARD, ORIGIN, [
        {
          type: 'member:added',
          data: expect.objectContaining({ userId: USER_ID, role: 'ADMIN' }),
        },
      ]);
      expect(realtime.toUsers).toHaveBeenCalledOnce();
      expect(realtime.toUsers).toHaveBeenCalledWith([USER_ID], BOARD, ORIGIN, {
        type: 'membership:added',
        data: toBoardSummary(BOARD_ROW, 'ADMIN'),
      });
    });

    it('broadcasts nothing when the user was already a member (idempotent accept)', async () => {
      const { service, realtime } = setupToken({ stored: { status: 'ACCEPTED' }, isMember: true });

      await expect(service.accept(TOKEN, USER_ID, ORIGIN)).resolves.toEqual({ boardId: BOARD });

      expect(realtime.toBoard).not.toHaveBeenCalled();
      expect(realtime.toUsers).not.toHaveBeenCalled();
    });

    it('broadcasts nothing when the membership already existed and no row was created', async () => {
      const { service, realtime } = setupToken({ createdCount: 0 });

      await expect(service.accept(TOKEN, USER_ID, ORIGIN)).resolves.toEqual({ boardId: BOARD });

      expect(realtime.toBoard).not.toHaveBeenCalled();
      expect(realtime.toUsers).not.toHaveBeenCalled();
    });

    it('broadcasts nothing when the invitation cannot be used', async () => {
      const { service, realtime } = setupToken({ accountEmail: 'baska@example.com' });

      await expect(service.accept(TOKEN, USER_ID, ORIGIN)).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      expect(realtime.toBoard).not.toHaveBeenCalled();
      expect(realtime.toUsers).not.toHaveBeenCalled();
    });
  });
});

