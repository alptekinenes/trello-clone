import {
  ASSIGNABLE_BOARD_ROLES,
  type AssignableBoardRole,
  type BoardSummaryDto,
  type MemberDto,
} from '@trello/contracts';
import { useId, useRef } from 'react';
import { ROLE_LABEL } from '../../../shared/lib/board-role';
import { Avatar } from '../../../shared/ui/avatar';
import { Button } from '../../../shared/ui/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { FormAlert } from '../../../shared/ui/form-alert';
import { SelectField } from '../../../shared/ui/select-field';
import type { Announce } from '../hooks/use-dialog-status';
import { memberRemoveButtonId, useMemberActions } from '../hooks/use-member-actions';

type Actions = ReturnType<typeof useMemberActions>;

interface MemberRowProps {
  member: MemberDto;
  actions: Actions;
}

function MemberRow({ member, actions }: MemberRowProps) {
  const { isMe, canChangeRole, canRemove, canLeave } = actions.abilities(member);

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
      <div className="flex min-w-0 flex-1 basis-48 items-center gap-3">
        <Avatar person={{ ...member, id: member.userId }} decorative />
        <div className="min-w-0">
          <p className="text-sm font-medium break-words">
            {member.name}
            {isMe && <span className="font-normal text-fg-muted"> (sen)</span>}
          </p>
          <p className="text-xs break-all text-fg-muted">{member.email}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {canChangeRole ? (
          <SelectField
            label={`${member.name} rolü`}
            hideLabel
            value={member.role}
            onChange={(event) => actions.changeRole(member, event.target.value as AssignableBoardRole)}
          >
            {ASSIGNABLE_BOARD_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABEL[role]}
              </option>
            ))}
          </SelectField>
        ) : (
          <span className="text-sm text-fg-muted">{ROLE_LABEL[member.role]}</span>
        )}
        {canRemove && (
          <Button
            id={memberRemoveButtonId(member.userId)}
            variant="ghost"
            className="h-8 px-3"
            aria-label={`${member.name} kişisini panodan çıkar`}
            onClick={() => actions.askRemove(member)}
          >
            Çıkar
          </Button>
        )}
        {canLeave && (
          <Button variant="ghost" className="h-8 px-3" onClick={() => actions.askLeave(member)}>
            Panodan ayrıl
          </Button>
        )}
      </div>
    </li>
  );
}

interface MemberListProps {
  board: BoardSummaryDto;
  members: MemberDto[];
  announce: Announce;
}

/** The board's members with the actions the current user may take on each. */
export function MemberList({ board, members, announce }: MemberListProps) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const actions = useMemberActions({ board, members, headingRef, announce });
  const { confirming } = actions;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3 id={headingId} ref={headingRef} tabIndex={-1} className="text-sm font-semibold">
        Üyeler
      </h3>
      {actions.roleError && <FormAlert>{actions.roleError}</FormAlert>}
      <ul aria-labelledby={headingId} className="flex flex-col divide-y divide-line">
        {actions.rows.map((member) => (
          <MemberRow key={member.userId} member={member} actions={actions} />
        ))}
      </ul>
      {confirming?.kind === 'remove' && (
        <ConfirmDialog
          title="Üye çıkarılsın mı?"
          confirmLabel="Çıkar"
          onConfirm={actions.confirm}
          onCancel={actions.cancel}
          pending={actions.isConfirming}
          error={actions.confirmError}
        >
          <p>
            <strong className="text-fg">{confirming.member.name}</strong> panodan çıkarılacak.
            Tekrar erişmesi için yeniden davet edilmesi gerekir.
          </p>
        </ConfirmDialog>
      )}
      {confirming?.kind === 'leave' && (
        <ConfirmDialog
          title="Panodan ayrılınsın mı?"
          confirmLabel="Panodan ayrıl"
          onConfirm={actions.confirm}
          onCancel={actions.cancel}
          pending={actions.isConfirming}
          error={actions.confirmError}
        >
          <p>
            <strong className="text-fg">{board.title}</strong> panosundan ayrılacaksın. Tekrar
            katılmak için yeniden davet edilmen gerekir.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
