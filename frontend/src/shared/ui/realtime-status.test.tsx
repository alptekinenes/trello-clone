import { act, fireEvent, render, screen } from '@testing-library/react';
import { REALTIME_UNAUTHORIZED } from '@trello/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeRealtime } from '../../test/fake-realtime';
import { RECONNECT_GRACE_MS, RESTORED_MS } from '../hooks/use-realtime-indicator';
import { setAuthHandlers } from '../lib/http';
import { realtime } from '../lib/realtime-client';
import { useRealtimeStore } from '../store/realtime-store';
import { RealtimeStatus } from './realtime-status';

const RECONNECTING = 'Bağlantı koptu. Yeniden bağlanılıyor…';
const OFFLINE = 'Canlı güncellemeler kapalı.';

const RESTORED = 'Bağlantı yeniden kuruldu.';

const status = () => useRealtimeStore.getState().status;

/** The message is in the screen-reader region and in the visible pill; this is the visible one. */
const pillText = (text: string) =>
  screen.queryAllByText(text).find((element) => element.getAttribute('aria-hidden') === 'true');

/**
 * The token refresh answers `answers` in turn, then keeps answering the last one. `null` means
 * the session is gone (the token is cleared, as `features/auth/session.ts` does on a 401).
 */
function signIn(...answers: (string | null)[]) {
  let call = 0;
  let token: string | null = 't1';
  const refreshAccessToken = vi.fn(async () => {
    const fresh = answers[Math.min(call, answers.length - 1)] ?? null;
    call += 1;
    token = fresh;
    return fresh;
  });
  setAuthHandlers({ getAccessToken: () => token, refreshAccessToken });
  return { refreshAccessToken };
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

async function settle() {
  await act(async () => {});
}

function connected() {
  realtime.start();
  fakeRealtime.connect();
}

/** A refused token with no way to get a new one ends in `offline`. */
async function goOffline() {
  fakeRealtime.rejectHandshake(REALTIME_UNAUTHORIZED);
  await settle();
  expect(status()).toBe('offline');
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RealtimeStatus', () => {
  it('keeps an empty status region in the DOM and draws nothing while idle, connecting or connected', () => {
    signIn(null);
    render(<RealtimeStatus />);
    const region = screen.getByRole('status');
    expect(region).toBeEmptyDOMElement();

    realtime.start();
    expect(status()).toBe('connecting');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();

    fakeRealtime.connect();
    expect(screen.getByRole('status')).toBe(region);
    expect(region).toBeEmptyDOMElement();
  });

  it('hides a reconnect for the first 3 seconds, then announces it in the same region', () => {
    signIn(null);
    render(<RealtimeStatus />);
    const region = screen.getByRole('status');
    connected();

    fakeRealtime.drop('transport close');
    expect(status()).toBe('reconnecting');
    advance(RECONNECT_GRACE_MS - 1);
    expect(screen.queryByText(RECONNECTING)).not.toBeInTheDocument();

    advance(1);
    expect(screen.getByRole('status')).toBe(region);
    expect(region).toHaveTextContent(RECONNECTING);
    expect(screen.queryByRole('button', { name: 'Yeniden bağlan' })).not.toBeInTheDocument();
  });

  it('never shows a drop that heals within 3 seconds, not even later', () => {
    signIn(null);
    render(<RealtimeStatus />);
    connected();

    fakeRealtime.drop('transport close');
    advance(RECONNECT_GRACE_MS - 500);
    fakeRealtime.connect();
    advance(RECONNECT_GRACE_MS * 2);

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('disappears once connected again and waits another 3 seconds for the next drop', () => {
    signIn(null);
    render(<RealtimeStatus />);
    connected();
    fakeRealtime.drop('transport close');
    advance(RECONNECT_GRACE_MS);
    expect(pillText(RECONNECTING)).toBeInTheDocument();

    fakeRealtime.connect();
    expect(pillText(RECONNECTING)).toBeUndefined();
    expect(screen.getByRole('status')).toHaveTextContent(RESTORED);
    advance(RESTORED_MS);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();

    fakeRealtime.drop('ping timeout');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    advance(RECONNECT_GRACE_MS);
    expect(pillText(RECONNECTING)).toBeInTheDocument();
  });

  it('stops the spinner for people who prefer reduced motion and hides the icon from screen readers', () => {
    signIn(null);
    render(<RealtimeStatus />);
    connected();
    fakeRealtime.drop('transport close');
    advance(RECONNECT_GRACE_MS);

    const icon = pillText(RECONNECTING)?.querySelector('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).toHaveClass('animate-spin', 'motion-reduce:animate-none');
  });

  it('shows offline at once, with a warning tone and a retry button', async () => {
    signIn(null);
    render(<RealtimeStatus />);
    connected();

    await goOffline();

    expect(pillText(OFFLINE)).toHaveClass('text-warning');
    expect(screen.getByRole('button', { name: 'Yeniden bağlan' })).toBeInTheDocument();
  });

  it('shows offline immediately even when it follows an unrevealed reconnect', async () => {
    signIn(null);
    render(<RealtimeStatus />);
    connected();
    fakeRealtime.drop('transport close');
    advance(RECONNECT_GRACE_MS - 1000);
    expect(screen.queryByText(RECONNECTING)).not.toBeInTheDocument();

    await goOffline();

    expect(pillText(OFFLINE)).toBeInTheDocument();
  });

  it('retries from the button, keeps showing progress and clears once connected', async () => {
    const { refreshAccessToken } = signIn(null, 't2');
    render(<RealtimeStatus />);
    connected();
    await goOffline();
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Yeniden bağlan' }));
    expect(status()).toBe('reconnecting');
    // Visible at once: no second grace period after an outage the user already saw.
    expect(screen.getByRole('status')).toHaveTextContent(RECONNECTING);
    expect(screen.queryByRole('button', { name: 'Yeniden bağlan' })).not.toBeInTheDocument();
    // The button is gone, so the focus moves to the pill instead of falling back to the page.
    expect(document.activeElement).toBe(pillText(RECONNECTING)?.parentElement);

    await settle();
    expect(refreshAccessToken).toHaveBeenCalledTimes(2);
    expect(fakeRealtime.socket.handshakeTokens.at(-1)).toBe('t2');
    fakeRealtime.connect();

    expect(status()).toBe('connected');
    expect(pillText(RECONNECTING)).toBeUndefined();
    expect(screen.getByRole('status')).toHaveTextContent(RESTORED);
  });

  it('goes back to the offline message when the retry fails', async () => {
    signIn(null);
    render(<RealtimeStatus />);
    connected();
    await goOffline();

    fireEvent.click(screen.getByRole('button', { name: 'Yeniden bağlan' }));
    await settle();

    expect(status()).toBe('offline');
    expect(pillText(OFFLINE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yeniden bağlan' })).toBeEnabled();
  });
});
