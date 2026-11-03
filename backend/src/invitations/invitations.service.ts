import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type AcceptInvitationResponse,
  type BoardRole,
  canInviteAs,
  type CreateInvitationRequest,
  type CreateInvitationResponse,
  INVITATION_LIMITS,
  type InvitationDto,
  type InvitationPreviewDto,
  type InvitationStatus,
  isInvitationToken,
  type MemberDto,
} from '@trello/contracts';
import { boardNotFound, insufficientRole } from '../access/access.errors.js';
import { invalidAccessToken } from '../auth/auth.errors.js';
import { hashToken, newOpaqueToken } from '../common/crypto/opaque-token.js';
import type { Prisma } from '../generated/prisma/client.js';
import { BOARD_SELECT, type BoardRow, toBoardSummary } from '../boards/board.mapper.js';
import { MailService } from '../mail/mail.service.js';
import { MEMBER_SELECT, toMemberDto } from '../members/member.mapper.js';
import type { BoardActor } from '../members/members.service.js';
import { lockBoard } from '../ordering/locks.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { EventOrigin } from '../realtime/event-origin.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { normalizeEmail } from '../users/users.service.js';
import {
  assignableRole,
  INVITATION_ORDER,
  INVITATION_SELECT,
  type InvitationRow,
  PREVIEW_SELECT,
  type PreviewRow,
  toInvitationDto,
  toInvitationPreview,
} from './invitation.mapper.js';
import {
  alreadyMember,
  cannotInviteAs,
  emailMismatch,
  invitationExpired,
  invitationNotFound,
  invitationRevoked,
  invitationUsed,
} from './invitations.errors.js';

type Tx = Prisma.TransactionClient;

/** The columns needed to decide whether someone may replace or cancel an invitation. */
interface ExistingInvitation {
  role: BoardRole;
  status: InvitationStatus;
  expiresAt: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** A membership the transaction created, for the events that tell the others about it. */
interface NewMembership {
  member: MemberDto;
  board: BoardRow;
  role: BoardRole;
}

/** What the transaction decided; the response (and the mail) are built after it commits. */
type CreateOutcome =
  | { result: 'MEMBER_ADDED'; member: MemberDto; board: BoardRow }
  | { result: 'INVITATION_CREATED'; invitation: InvitationRow; token: string };

/**
 * Invites people to a board. Every write locks the board row first, so invitations,
 * acceptances and revocations on one board run one after another. Callers check
 * the board role first (BoardAccessGuard); every query here is scoped to the board.
 * A new membership is broadcast after the transaction committed. An invitation for
 * an address without an account, or its revocation, is not: the invited person is
 * not on the board yet, and the token must stay out of every event.
 */
@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly realtime: RealtimeService,
    config: ConfigService,
  ) {
    this.appUrl = config.getOrThrow<string>('APP_URL');
  }

  /**
   * A registered address becomes a member right away; any other address gets a
   * token (stored only as a hash) and the link comes back in this response only.
   * Inviting an address again replaces its token and extends its expiry, but only
   * for someone who may send the role of the invitation still waiting there.
   */
  async create(
    boardId: string,
    actor: BoardActor,
    input: CreateInvitationRequest,
    origin: EventOrigin,
  ): Promise<CreateInvitationResponse> {
    if (!canInviteAs(actor.role, input.role)) throw cannotInviteAs();

    const email = normalizeEmail(input.email);
    const now = new Date();

    const outcome = await this.prisma.$transaction(async (tx): Promise<CreateOutcome> => {
      if (!(await lockBoard(tx, boardId))) throw boardNotFound();
      const user = await tx.user.findUnique({ where: { email }, select: { id: true } });
      const existing = await tx.invitation.findUnique({
        where: { boardId_email: { boardId, email } },
        select: { role: true, status: true, expiresAt: true },
      });
      this.assertMayTouch(actor.role, existing, now);
      return user
        ? this.addMember(tx, boardId, user.id, email, input, now)
        : this.upsertInvitation(tx, boardId, actor, email, input, now);
    });

    if (outcome.result === 'MEMBER_ADDED') {
      const { member, board } = outcome;
      this.announceMembership(boardId, origin, { member, board, role: input.role });
      return { result: 'MEMBER_ADDED', member };
    }

    const inviteUrl = `${this.appUrl}/invitations/${outcome.token}`;
    await this.sendMail(outcome.invitation, inviteUrl);
    return {
      result: 'INVITATION_CREATED',
      invitation: toInvitationDto(outcome.invitation),
      inviteUrl,
    };
  }

  /** Invitations that can still be accepted, newest first. */
  async listPending(boardId: string): Promise<InvitationDto[]> {
    const rows = await this.prisma.invitation.findMany({
      where: { boardId, status: 'PENDING', expiresAt: { gt: new Date() } },
      select: INVITATION_SELECT,
      orderBy: [...INVITATION_ORDER],
    });
    return rows.map(toInvitationDto);
  }

  /**
   * Revoking twice is fine. An accepted invitation cannot be revoked (remove the
   * member instead). An expired but never accepted one can still be revoked. A
   * waiting invitation for a role the actor may not send is not theirs to cancel.
   */
  async revoke(boardId: string, invitationId: string, actorRole: BoardRole): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      if (!(await lockBoard(tx, boardId))) throw boardNotFound();
      const invitation = await tx.invitation.findFirst({
        where: { id: invitationId, boardId },
        select: { role: true, status: true, expiresAt: true },
      });
      if (!invitation) throw invitationNotFound();
      if (invitation.status === 'ACCEPTED') throw invitationUsed('conflict');
      if (invitation.status === 'REVOKED') return;
      this.assertMayTouch(actorRole, invitation, now);
      await tx.invitation.update({
        where: { id: invitationId },
        data: { status: 'REVOKED' },
      });
    });
  }

  /** What the invited person sees before signing in. Only the token holder can ask. */
  async preview(token: string): Promise<InvitationPreviewDto> {
    if (!isInvitationToken(token)) throw invitationNotFound();

    const row = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
      select: PREVIEW_SELECT,
    });
    if (!row) throw invitationNotFound();

    this.assertUsable(row, new Date());
    return toInvitationPreview(row);
  }

  /**
   * Makes the signed-in user a member with the invited role. The token and the
   * account's email must both match. Accepting again is fine while the user is
   * still a member; an existing membership keeps its role.
   */
  async accept(
    token: string,
    userId: string,
    origin: EventOrigin,
  ): Promise<AcceptInvitationResponse> {
    if (!isInvitationToken(token)) throw invitationNotFound();
    const tokenHash = hashToken(token);

    const found = await this.prisma.invitation.findUnique({
      where: { tokenHash },
      select: { boardId: true },
    });
    if (!found) throw invitationNotFound();

    const now = new Date();
    const { boardId, created } = await this.prisma.$transaction(async (tx) => {
      if (!(await lockBoard(tx, found.boardId))) throw invitationNotFound();

      // Read again under the lock: a re-invite may have replaced the token meanwhile.
      const invitation = await tx.invitation.findUnique({
        where: { tokenHash },
        select: { id: true, boardId: true, email: true, role: true, status: true, expiresAt: true },
      });
      if (!invitation) throw invitationNotFound();

      const user = await tx.user.findUnique({ where: { id: userId }, select: { email: true } });
      if (!user) throw invalidAccessToken();

      const emailMatches = user.email === invitation.email;
      const { boardId } = invitation;

      if (invitation.status === 'ACCEPTED') {
        const member = emailMatches && (await this.isMember(tx, boardId, userId));
        if (!member) throw invitationUsed('gone');
        return { boardId, created: null };
      }
      this.assertUsable(invitation, now);
      if (!emailMatches) throw emailMismatch();

      const { count } = await tx.boardMember.createMany({
        data: [{ boardId, userId, role: invitation.role }],
        skipDuplicates: true,
      });
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED', acceptedAt: now },
      });
      // Already a member (added another way meanwhile): nothing changed for the board.
      const created = count === 1 ? await this.readMembership(tx, boardId, userId) : null;
      return { boardId, created: created && { ...created, role: invitation.role } };
    });
    if (created) this.announceMembership(boardId, origin, created);
    return { boardId };
  }

  /** Tells the board's members about the new member, and the new member about the board. */
  private announceMembership(boardId: string, origin: EventOrigin, created: NewMembership): void {
    const { member, board, role } = created;
    this.realtime.toBoard(boardId, origin, [{ type: 'member:added', data: member }]);
    // The summary carries the recipient's own role only.
    this.realtime.toUsers([member.userId], boardId, origin, {
      type: 'membership:added',
      data: toBoardSummary(board, role),
    });
  }

  private async readMembership(
    tx: Tx,
    boardId: string,
    userId: string,
  ): Promise<{ member: MemberDto; board: BoardRow }> {
    const member = await tx.boardMember.findUniqueOrThrow({
      where: { boardId_userId: { boardId, userId } },
      select: MEMBER_SELECT,
    });
    const board = await tx.board.findUniqueOrThrow({ where: { id: boardId }, select: BOARD_SELECT });
    return { member: toMemberDto(member), board };
  }

  /** Revoked, accepted and expired invitations cannot be used, in that order of precedence. */
  private assertUsable(invitation: Pick<PreviewRow, 'status' | 'expiresAt'>, now: Date): void {
    if (invitation.status === 'REVOKED') throw invitationRevoked();
    if (invitation.status === 'ACCEPTED') throw invitationUsed('gone');
    if (invitation.expiresAt <= now) throw invitationExpired();
  }

  /**
   * A waiting invitation belongs to whoever may send its role: an admin cannot
   * overwrite, settle or cancel the owner's admin invitation. Dead rows (revoked,
   * accepted, expired) are free to replace. Call under the board lock, after reading the row.
   */
  private assertMayTouch(actorRole: BoardRole, existing: ExistingInvitation | null, now: Date): void {
    if (!existing || existing.status !== 'PENDING' || existing.expiresAt <= now) return;
    if (!canInviteAs(actorRole, assignableRole(existing.role))) throw insufficientRole();
  }

  private async isMember(tx: Tx, boardId: string, userId: string): Promise<boolean> {
    const member = await tx.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId } },
      select: { userId: true },
    });
    return member !== null;
  }

  private async addMember(
    tx: Tx,
    boardId: string,
    userId: string,
    email: string,
    input: CreateInvitationRequest,
    now: Date,
  ): Promise<CreateOutcome> {
    const { count } = await tx.boardMember.createMany({
      data: [{ boardId, userId, role: input.role }],
      skipDuplicates: true,
    });
    if (count === 0) throw alreadyMember();

    // An older link to this address would now do nothing useful; mark it used.
    await tx.invitation.updateMany({
      where: { boardId, email, status: 'PENDING' },
      data: { status: 'ACCEPTED', acceptedAt: now },
    });
    const { member, board } = await this.readMembership(tx, boardId, userId);
    return { result: 'MEMBER_ADDED', member, board };
  }

  private async upsertInvitation(
    tx: Tx,
    boardId: string,
    actor: BoardActor,
    email: string,
    input: CreateInvitationRequest,
    now: Date,
  ): Promise<CreateOutcome> {
    const token = newOpaqueToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(now.getTime() + INVITATION_LIMITS.TTL_DAYS * DAY_MS);

    const invitation = await tx.invitation.upsert({
      where: { boardId_email: { boardId, email } },
      create: {
        boardId,
        email,
        role: input.role,
        tokenHash,
        invitedById: actor.userId,
        expiresAt,
      },
      update: {
        role: input.role,
        tokenHash,
        invitedById: actor.userId,
        expiresAt,
        status: 'PENDING',
        acceptedAt: null,
      },
      select: INVITATION_SELECT,
    });
    return { result: 'INVITATION_CREATED', invitation, token };
  }

  /** The mail is best effort: the invitation exists and the link is in the response either way. */
  private async sendMail(invitation: InvitationRow, inviteUrl: string): Promise<void> {
    try {
      await this.mail.sendInvitation({
        to: invitation.email,
        boardTitle: invitation.board.title,
        inviterName: invitation.invitedBy.name,
        inviteUrl,
        expiresAt: invitation.expiresAt,
      });
    } catch (error) {
      // Log only the invitation id; the error text could echo the link.
      const kind = error instanceof Error ? error.name : 'unknown error';
      this.logger.error(`Sending the mail for invitation ${invitation.id} failed (${kind})`);
    }
  }
}
