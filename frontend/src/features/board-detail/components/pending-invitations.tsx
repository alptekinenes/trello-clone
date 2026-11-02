import type { BoardSummaryDto, InvitationDto } from '@trello/contracts';
import { useId, useRef } from 'react';
import { ROLE_LABEL } from '../../../shared/lib/board-role';
import { formatDueLong } from '../../../shared/lib/date';
import { Button } from '../../../shared/ui/button';
import { FormAlert } from '../../../shared/ui/form-alert';
import type { Announce } from '../hooks/use-dialog-status';
import type { useInviteForm } from '../hooks/use-invite-form';
import { revokeButtonId, usePendingInvitations } from '../hooks/use-pending-invitations';

interface InvitationRowProps {
  invitation: InvitationDto;
  /** False for an invitation the current user could not have made (an admin's view of an admin invitation). */
  canManage: boolean;
  resending: boolean;
  /** Another row is making a new link; one at a time. */
  resendBlocked: boolean;
  onResend: () => void;
  onRevoke: () => void;
}

function InvitationRow({
  invitation,
  canManage,
  resending,
  resendBlocked,
  onResend,
  onRevoke,
}: InvitationRowProps) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm font-medium break-all">{invitation.email}</p>
        <p className="text-xs text-fg-muted">
          {ROLE_LABEL[invitation.role]} · Son geçerlilik: {formatDueLong(invitation.expiresAt)}
        </p>
        <p className="text-xs break-words text-fg-muted">Davet eden: {invitation.invitedBy.name}</p>
      </div>
      {canManage ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            className="h-8 px-3"
            aria-label={`${invitation.email} için yeni bağlantı oluştur`}
            loading={resending}
            disabled={resendBlocked}
            onClick={onResend}
          >
            Yeni bağlantı
          </Button>
          <Button
            id={revokeButtonId(invitation.id)}
            variant="ghost"
            className="h-8 px-3"
            aria-label={`İptal et: ${invitation.email} daveti`}
            onClick={onRevoke}
          >
            İptal et
          </Button>
        </div>
      ) : (
        <p className="text-xs text-fg-muted">Yalnızca pano sahibi yönetebilir.</p>
      )}
    </li>
  );
}

interface PendingInvitationsProps {
  board: BoardSummaryDto;
  invite: ReturnType<typeof useInviteForm>;
  announce: Announce;
}

/** Invitations waiting to be accepted, for admins: hand over a new link or take one back. */
export function PendingInvitations({ board, invite, announce }: PendingInvitationsProps) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pending = usePendingInvitations({
    boardId: board.id,
    myRole: board.myRole,
    headingRef,
    announce,
  });
  const { invitations } = pending;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3 id={headingId} ref={headingRef} tabIndex={-1} className="text-sm font-semibold">
        Bekleyen davetler
      </h3>
      {pending.revokeError && <FormAlert>{pending.revokeError}</FormAlert>}
      {invite.resendError && <FormAlert>{invite.resendError}</FormAlert>}
      {pending.isLoading && <p className="text-sm text-fg-muted">Davetler yükleniyor…</p>}
      {pending.loadError && !invitations && (
        <div className="flex flex-col items-start gap-2">
          <FormAlert>{pending.loadError}</FormAlert>
          <Button variant="secondary" className="h-8 px-3" onClick={pending.retry} loading={pending.isRetrying}>
            Tekrar dene
          </Button>
        </div>
      )}
      {invitations?.length === 0 && <p className="text-sm text-fg-muted">Bekleyen davet yok.</p>}
      {invitations && invitations.length > 0 && (
        <ul aria-labelledby={headingId} className="flex flex-col divide-y divide-line">
          {invitations.map((invitation) => (
            <InvitationRow
              key={invitation.id}
              invitation={invitation}
              canManage={pending.canManage(invitation)}
              resendBlocked={invite.isResending}
              resending={invite.resendingEmail === invitation.email}
              onResend={() => invite.resend(invitation)}
              onRevoke={() => pending.revoke(invitation)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
