import { describe, expect, it } from 'vitest';
import { useAuthStore } from '../../auth/store/auth-store';
import { testUser } from '../../../test/fixtures';
import { resetInvitationIntent, useInvitationIntentStore } from './invitation-intent-store';

describe('invitation intent store', () => {
  it('is consumed once, by the invitation it was remembered for', () => {
    const { remember, consume } = useInvitationIntentStore.getState();
    remember('token-a');

    expect(consume('token-a')).toBe(true);
    expect(consume('token-a')).toBe(false);
  });

  it('is not consumed by another invitation, and stays for the right one', () => {
    const { remember, consume } = useInvitationIntentStore.getState();
    remember('token-a');

    expect(consume('token-b')).toBe(false);
    expect(consume('token-a')).toBe(true);
  });

  it('starts out empty, and remembering again replaces the invitation', () => {
    const { remember, consume } = useInvitationIntentStore.getState();
    expect(consume('token-a')).toBe(false);

    remember('token-a');
    remember('token-b');

    expect(consume('token-a')).toBe(false);
    expect(consume('token-b')).toBe(true);
  });

  it('can be reset', () => {
    useInvitationIntentStore.getState().remember('token-a');

    resetInvitationIntent();

    expect(useInvitationIntentStore.getState().consume('token-a')).toBe(false);
  });

  it('is forgotten when the user signs out', () => {
    useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
    useInvitationIntentStore.getState().remember('token-a');

    useAuthStore.getState().clearSession();

    expect(useInvitationIntentStore.getState().token).toBeNull();
    expect(useInvitationIntentStore.getState().consume('token-a')).toBe(false);
  });

  it('survives the session check at page load, which is no sign-out', () => {
    useInvitationIntentStore.getState().remember('token-a');

    useAuthStore.getState().clearSession();

    expect(useInvitationIntentStore.getState().consume('token-a')).toBe(true);
  });

  it('survives a sign-in', () => {
    useInvitationIntentStore.getState().remember('token-a');

    useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });

    expect(useInvitationIntentStore.getState().consume('token-a')).toBe(true);
  });
});
