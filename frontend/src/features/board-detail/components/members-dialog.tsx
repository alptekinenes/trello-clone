import { type BoardDetailDto, canInviteAs } from '@trello/contracts';
import { Dialog } from '../../../shared/ui/dialog';
import { useDialogStatus } from '../hooks/use-dialog-status';
import { useInviteForm } from '../hooks/use-invite-form';
import { InviteMemberForm } from './invite-member-form';
import { MemberList } from './member-list';
import { PendingInvitations } from './pending-invitations';

interface MembersDialogProps {
  detail: BoardDetailDto;
  onClose: () => void;
}

/** Everything about who is on the board: inviting, the members and pending invitations. */
export function MembersDialog({ detail, onClose }: MembersDialogProps) {
  const { board, members } = detail;
  // One live region for the whole dialog; its text changes, the element stays.
  const { status, announce } = useDialogStatus();
  // Held here, not in the form: "Yeni bağlantı" of a pending invitation fills the same link field.
  const invite = useInviteForm({ board, announce });
  const canInvite = canInviteAs(board.myRole, 'MEMBER');

  return (
    <Dialog title="Pano üyeleri" onClose={onClose} showCloseButton>
      <div className="flex flex-col gap-6">
        {/* Stays in the accessibility tree while empty (empty:sr-only), or the first message is not announced. */}
        <output
          className={
            status.silent
              ? 'sr-only'
              : 'sticky top-0 z-10 block rounded-md bg-surface-sunken px-3 py-2 text-sm text-fg shadow-card empty:sr-only'
          }
        >
          {/* A new element per announcement: the same text twice in a row is read out again. */}
          {status.text && <span key={status.id}>{status.text}</span>}
        </output>
        {canInvite && <InviteMemberForm invite={invite} announce={announce} />}
        <MemberList board={board} members={members} announce={announce} />
        {canInvite && <PendingInvitations board={board} invite={invite} announce={announce} />}
      </div>
    </Dialog>
  );
}
