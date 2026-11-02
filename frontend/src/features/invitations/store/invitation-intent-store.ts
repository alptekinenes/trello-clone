import { create } from 'zustand';
import { onSignOut } from '../../auth';

interface InvitationIntentState {
  /** The invitation whose page the user left on purpose to sign in or sign up. */
  token: string | null;
  remember: (token: string) => void;
  /** True once, and only for the remembered invitation; then it is forgotten. */
  consume: (token: string) => boolean;
  forget: () => void;
}

/**
 * Memory only, by design: it is the user's own click on the invitation page that makes the
 * page accept after signing in. A link someone else sent, a reload or a second tab has no
 * intent, so the user has to press "Daveti kabul et" themselves.
 */
export const useInvitationIntentStore = create<InvitationIntentState>()((set, get) => ({
  token: null,
  remember: (token) => set({ token }),
  consume: (token) => {
    if (get().token !== token) return false;
    set({ token: null });
    return true;
  },
  forget: () => set({ token: null }),
}));

// The click that left the intent belongs to the person who made it. Once they sign out, the
// next person to sign in (or the same one, much later) has made no such click.
onSignOut(() => useInvitationIntentStore.getState().forget());

/** Test helper. */
export function resetInvitationIntent(): void {
  useInvitationIntentStore.setState({ token: null });
}
