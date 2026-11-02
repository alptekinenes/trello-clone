import { zodResolver } from '@hookform/resolvers/zod';
import {
  type BoardSummaryDto,
  canInviteAs,
  type CreateInvitationResponse,
  ErrorCode,
  type InvitationDto,
} from '@trello/contracts';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { flushSync } from 'react-dom';
import { apiErrorMessage } from '../../../shared/lib/api-error-message';
import { ApiError } from '../../../shared/lib/http';
import { useCreateInvitation } from '../api/use-board-invitations';
import {
  inviteSchema,
  type InviteFormOutput,
  type InviteFormValues,
} from '../schemas/invite-schemas';
import type { Announce } from './use-dialog-status';

export const INVITE_COPY_BUTTON_ID = 'invite-copy-link';

const ALREADY_MEMBER_MESSAGE = 'Bu kişi zaten panonun üyesi.';

/**
 * The link to hand over, for the address it was made for. Lives in this state only: the
 * server shows the link once (it keeps a hash), and nothing writes it anywhere else.
 */
export interface InviteLink {
  email: string;
  inviteUrl: string;
}

function isAlreadyMember(error: unknown): boolean {
  return error instanceof ApiError && error.code === ErrorCode.ALREADY_MEMBER;
}

interface UseInviteFormOptions {
  board: BoardSummaryDto;
  /** Text for the dialog's status region. */
  announce: Announce;
}

/**
 * Inviting by email: the form, what the answer leads to (a member was added, or a link
 * to hand over) and where the focus goes next. "Yeni bağlantı" on a pending invitation
 * (`resend`) goes the same way, so its link shows up in the form's link field.
 *
 * What an answer leads to is decided in the handlers of the mutation hooks, which run for
 * every request. Callbacks given to `mutate()` would be dropped when a newer request starts,
 * and a dropped answer means a link nobody sees for an invitation the server has renewed.
 */
export function useInviteForm({ board, announce }: UseInviteFormOptions) {
  const form = useForm<InviteFormValues, unknown, InviteFormOutput>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', role: 'MEMBER' },
  });
  const [link, setLink] = useState<InviteLink | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  // Only the owner may hand out the admin role; for everyone else the field is not shown.
  const canPickRole = canInviteAs(board.myRole, 'ADMIN');

  function showResult(response: CreateInvitationResponse, email: string) {
    if (response.result === 'MEMBER_ADDED') {
      announce(`${response.member.name} panoya eklendi.`);
      return;
    }
    flushSync(() => setLink({ email: response.invitation.email, inviteUrl: response.inviteUrl }));
    document.getElementById(INVITE_COPY_BUTTON_ID)?.focus();
    announce(`${email} için davet bağlantısı hazır.`);
  }

  const create = useCreateInvitation(board.id, {
    onSuccess: (response, { email }) => {
      // resetField keeps the field registered, so the focus below still finds it.
      form.resetField('email');
      showResult(response, email);
      if (response.result === 'MEMBER_ADDED') form.setFocus('email');
    },
    onError: (error) => {
      if (isAlreadyMember(error)) {
        form.setError('email', { message: ALREADY_MEMBER_MESSAGE }, { shouldFocus: true });
      } else {
        setFormError(apiErrorMessage(error));
      }
    },
  });
  // Its own mutation: "Yeni bağlantı" and the form do not cancel each other's results.
  const renew = useCreateInvitation(board.id, {
    onSuccess: (response, { email }) => showResult(response, email),
    onError: (error) =>
      setResendError(isAlreadyMember(error) ? ALREADY_MEMBER_MESSAGE : apiErrorMessage(error)),
  });

  const submit = form.handleSubmit((values) => {
    setFormError(null);
    create.mutate({ email: values.email, role: canPickRole ? values.role : 'MEMBER' });
  });

  function resend(invitation: InvitationDto) {
    // One at a time: the server renews the invitation with each request, so the link of an
    // earlier one would be dead, and shown or not, only the last one is any good.
    if (renew.isPending || !canInviteAs(board.myRole, invitation.role)) return;
    setResendError(null);
    renew.mutate({ email: invitation.email, role: invitation.role });
  }

  return {
    form,
    submit,
    canPickRole,
    isPending: create.isPending,
    formError,
    link,
    resend,
    resendError,
    /** True while a "Yeni bağlantı" request is on its way; the other buttons wait for it. */
    isResending: renew.isPending,
    /** The address a "Yeni bağlantı" request is on its way for, if any. */
    resendingEmail: renew.isPending ? renew.variables.email : null,
  };
}
