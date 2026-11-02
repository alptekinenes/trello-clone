import { isInvitationToken, type InvitationPreviewDto } from '@trello/contracts';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { showToast } from '../../../shared/store/toast-store';
import { useAuthStatus, useCurrentUser, useLogout } from '../../auth';
import { useAcceptInvitation } from '../api/use-accept-invitation';
import { useInvitationPreview } from '../api/use-invitation-preview';
import {
  INVITATION_NOT_FOUND_MESSAGE,
  invitationErrorMessage,
  isInvitationUnusable,
} from '../lib/invitation-error-message';
import { useInvitationIntentStore } from '../store/invitation-intent-store';

/** Who is looking at the invitation, relative to the address it was sent to. */
export type InvitationViewer = 'checking' | 'anonymous' | 'match' | 'mismatch';

export type InvitationView =
  /** The token cannot be one, or the server does not know it, or it is no longer usable. */
  | { kind: 'unavailable'; message: string }
  | { kind: 'loading' }
  /** The preview could not be loaded for a reason a retry may fix. */
  | { kind: 'failed'; message: string }
  | { kind: 'joining' }
  | { kind: 'ready'; preview: InvitationPreviewDto; viewer: InvitationViewer };

const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * State of the invitation page, derived from the preview, the session and the accept
 * request. Coming back from signing in with the intent the user left behind accepts
 * once, by itself; in every other case the user presses the button.
 */
export function useInvitationPage(token: string) {
  const navigate = useNavigate();
  const status = useAuthStatus();
  const user = useCurrentUser();
  const logout = useLogout();
  const acceptInvitation = useAcceptInvitation(token);
  const previewQuery = useInvitationPreview(token, !acceptInvitation.isSuccess);
  const preview = previewQuery.data;
  const viewer: InvitationViewer =
    status === 'anonymous'
      ? 'anonymous'
      : status === 'unknown' || !user || !preview
        ? 'checking'
        : sameEmail(user.email, preview.email)
          ? 'match'
          : 'mismatch';

  function accept() {
    // Read before the request: the preview goes away once the invitation is accepted.
    const boardTitle = preview?.boardTitle ?? '';
    acceptInvitation.mutate(undefined, {
      onSuccess: ({ boardId }) => {
        showToast(`“${boardTitle}” panosuna katıldın.`);
        navigate(`/boards/${encodeURIComponent(boardId)}`, { replace: true });
      },
    });
  }

  // Back from signing in on the user's own request. consume() answers true once, which
  // also keeps a StrictMode double run from sending the request twice.
  useEffect(() => {
    if (viewer !== 'match') return;
    if (useInvitationIntentStore.getState().consume(token)) accept();
  });

  function view(): InvitationView {
    if (acceptInvitation.isSuccess) return { kind: 'joining' };
    if (!isInvitationToken(token)) {
      return { kind: 'unavailable', message: INVITATION_NOT_FOUND_MESSAGE };
    }
    if (previewQuery.error) {
      const message = invitationErrorMessage(previewQuery.error);
      return isInvitationUnusable(previewQuery.error)
        ? { kind: 'unavailable', message }
        : { kind: 'failed', message };
    }
    if (!preview) return { kind: 'loading' };
    return { kind: 'ready', preview, viewer };
  }

  const acceptError = acceptInvitation.error;
  return {
    view: view(),
    isLoggedIn: status === 'authenticated',
    user,
    accept,
    isAccepting: acceptInvitation.isPending,
    acceptError: acceptError ? invitationErrorMessage(acceptError) : null,
    /** The server turned the invitation down for good; pressing again would not help. */
    acceptRefused: acceptError ? isInvitationUnusable(acceptError) : false,
    retryPreview: () => void previewQuery.refetch(),
    isRetrying: previewQuery.isRefetching,
    rememberIntent: () => useInvitationIntentStore.getState().remember(token),
    logout: () => logout.mutate(),
    isLoggingOut: logout.isPending,
  };
}
