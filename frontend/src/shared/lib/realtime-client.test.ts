import type { RealtimeMessage } from '@trello/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeRealtime } from '../../test/fake-realtime';
import { useRealtimeStore } from '../store/realtime-store';
import { setAuthHandlers } from './http';
import { HOLD_TIMEOUT_MS, JOIN_ACK_TIMEOUT_MS, RENEW_RETRY_DELAYS_MS, realtime } from './realtime-client';

const status = () => useRealtimeStore.getState().status;

/**
 * A refresh that answers `null` ends the session (the token goes away), like a 401 does in
 * `features/auth/session.ts`. Use `signInWithFlakyNetwork` for a refresh that fails on the network.
 */
function signInWithTokens(initial: string, refresh: () => Promise<string | null> = async () => null) {
  let token: string | null = initial;
  const refreshAccessToken = vi.fn(async () => {
    const fresh = await refresh();
    token = fresh;
    return fresh;
  });
  setAuthHandlers({ getAccessToken: () => token, refreshAccessToken });
  return {
    refreshAccessToken,
    /** What the HTTP layer does after its own 401. */
    rotate: (next: string) => {
      token = next;
    },
  };
}

/** Every refresh answers the next entry of `answers`: `'network'` fails but keeps the token, like a blip. */
function signInWithFlakyNetwork(...answers: (string | 'network')[]) {
  let token: string | null = 't1';
  let call = 0;
  const refreshAccessToken = vi.fn(async () => {
    const answer = answers[Math.min(call, answers.length - 1)] ?? 'network';
    call += 1;
    if (answer === 'network') return null;
    token = answer;
    return answer;
  });
  setAuthHandlers({ getAccessToken: () => token, refreshAccessToken });
  return {
    refreshAccessToken,
    /** What `session.ts` does when a refresh gets a 401 mid-session. */
    endSession: () => {
      token = null;
    },
  };
}

/** Lets the pending refresh promise settle without moving the fake clock. */
async function flush() {
  await vi.advanceTimersByTimeAsync(0);
}

function record(): RealtimeMessage[] {
  const received: RealtimeMessage[] = [];
  realtime.subscribe((message) => received.push(message));
  return received;
}

function emitCardDeleted(id: string) {
  fakeRealtime.serverEmit('card:deleted', { id, listId: 'L1' }, { boardId: 'B1' });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('connection lifecycle', () => {
  it('goes connecting, then connected, and idle after stop', () => {
    signInWithTokens('t1');
    expect(status()).toBe('idle');

    realtime.start();
    expect(status()).toBe('connecting');

    fakeRealtime.connect();
    expect(status()).toBe('connected');

    realtime.stop();
    expect(status()).toBe('idle');
  });

  it('start is idempotent', () => {
    signInWithTokens('t1');
    realtime.start();
    realtime.start();
    expect(fakeRealtime.socket.connectCalls).toBe(1);
  });

  it('sends the current access token in every handshake', () => {
    const tokens = signInWithTokens('t1');
    realtime.start();
    tokens.rotate('t2');
    fakeRealtime.socket.connect();
    expect(fakeRealtime.socket.handshakeTokens).toEqual(['t1', 't2']);
  });

  it('does not deliver events after stop', () => {
    signInWithTokens('t1');
    const received = record();
    realtime.start();
    fakeRealtime.connect();
    realtime.stop();

    fakeRealtime.socket.receive('card:deleted', {
      boardId: 'B1',
      actorId: 'u2',
      emittedAt: '',
      data: { id: 'c1', listId: 'L1' },
    });

    expect(received).toEqual([]);
  });

  it('reconnects by itself after a network drop and shows it', () => {
    signInWithTokens('t1');
    realtime.start();
    fakeRealtime.connect();

    fakeRealtime.drop('transport close');
    expect(status()).toBe('reconnecting');

    fakeRealtime.connect();
    expect(status()).toBe('connected');
  });

  it('shows reconnecting on a connect error that is not about the token', () => {
    signInWithTokens('t1');
    realtime.start();
    fakeRealtime.rejectHandshake('xhr poll error');
    expect(status()).toBe('reconnecting');
  });
});

describe('token renewal', () => {
  it('reconnects without a refresh when the HTTP layer already rotated the token', () => {
    const tokens = signInWithTokens('t1');
    realtime.start();
    fakeRealtime.connect();
    tokens.rotate('t2');

    fakeRealtime.drop('io server disconnect');

    expect(tokens.refreshAccessToken).not.toHaveBeenCalled();
    expect(fakeRealtime.socket.connectCalls).toBe(2);
    expect(fakeRealtime.socket.handshakeTokens).toEqual(['t1', 't2']);
  });

  it('refreshes the session when the token is the one the server just closed on', async () => {
    const tokens = signInWithTokens('t1', async () => 't2');
    realtime.start();
    fakeRealtime.connect();

    fakeRealtime.drop('io server disconnect');
    expect(status()).toBe('reconnecting');
    await vi.waitFor(() => expect(fakeRealtime.socket.connectCalls).toBe(2));

    expect(tokens.refreshAccessToken).toHaveBeenCalledOnce();
    expect(fakeRealtime.socket.handshakeTokens).toEqual(['t1', 't2']);
  });

  it('refreshes on UNAUTHORIZED and recovers when the new token is accepted', async () => {
    const tokens = signInWithTokens('t1', async () => 't2');
    realtime.start();

    fakeRealtime.rejectHandshake('UNAUTHORIZED');
    await vi.waitFor(() => expect(fakeRealtime.socket.connectCalls).toBe(2));
    fakeRealtime.connect();

    expect(status()).toBe('connected');
    expect(tokens.refreshAccessToken).toHaveBeenCalledOnce();
  });

  it('gives up after three refused handshakes in a row, with at most two refreshes', async () => {
    let counter = 0;
    const tokens = signInWithTokens('t1', async () => `t${(counter += 1) + 1}`);
    realtime.start();

    fakeRealtime.rejectHandshake('UNAUTHORIZED');
    await vi.waitFor(() => expect(fakeRealtime.socket.connectCalls).toBe(2));
    fakeRealtime.rejectHandshake('UNAUTHORIZED');
    await vi.waitFor(() => expect(fakeRealtime.socket.connectCalls).toBe(3));
    fakeRealtime.rejectHandshake('UNAUTHORIZED');

    expect(status()).toBe('offline');
    expect(tokens.refreshAccessToken).toHaveBeenCalledTimes(2);
    expect(fakeRealtime.socket.connectCalls).toBe(3);
  });

  it('goes offline when the session cannot be refreshed', async () => {
    signInWithTokens('t1', async () => null);
    realtime.start();
    fakeRealtime.connect();

    fakeRealtime.drop('io server disconnect');

    await vi.waitFor(() => expect(status()).toBe('offline'));
    expect(fakeRealtime.socket.connectCalls).toBe(1);
  });

  it('forgets a pending refresh when stopped meanwhile', async () => {
    let finishRefresh: (token: string) => void = () => undefined;
    signInWithTokens('t1', () => new Promise<string>((resolve) => (finishRefresh = resolve)));
    realtime.start();
    fakeRealtime.connect();
    fakeRealtime.drop('io server disconnect');

    realtime.stop();
    finishRefresh('t2');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fakeRealtime.socket.connectCalls).toBe(1);
    expect(status()).toBe('idle');
  });

  it('retry starts over after offline', async () => {
    const tokens = signInWithTokens('t1', async () => 't2');
    realtime.start();
    for (const expected of [2, 3]) {
      fakeRealtime.rejectHandshake('UNAUTHORIZED');
      await vi.waitFor(() => expect(fakeRealtime.socket.connectCalls).toBe(expected));
    }
    fakeRealtime.rejectHandshake('UNAUTHORIZED');
    expect(status()).toBe('offline');

    realtime.retry();
    await vi.waitFor(() => expect(fakeRealtime.socket.connectCalls).toBe(4));

    expect(tokens.refreshAccessToken).toHaveBeenCalledTimes(3);
    fakeRealtime.connect();
    expect(status()).toBe('connected');
  });

  it('retry does nothing unless offline', () => {
    signInWithTokens('t1');
    realtime.start();
    realtime.retry();
    expect(fakeRealtime.socket.connectCalls).toBe(1);
  });
});

describe('token renewal when the refresh fails on the network', () => {
  function dropWithExpiredToken() {
    realtime.start();
    fakeRealtime.connect();
    fakeRealtime.drop('io server disconnect');
  }

  it('stays reconnecting, retries after a pause and connects once the refresh works', async () => {
    vi.useFakeTimers();
    const network = signInWithFlakyNetwork('network', 't2');
    dropWithExpiredToken();
    await flush();

    expect(status()).toBe('reconnecting');
    expect(network.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(fakeRealtime.socket.connectCalls).toBe(1);

    await vi.advanceTimersByTimeAsync(RENEW_RETRY_DELAYS_MS[0] - 1);
    expect(network.refreshAccessToken).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(network.refreshAccessToken).toHaveBeenCalledTimes(2);
    expect(fakeRealtime.socket.handshakeTokens).toEqual(['t1', 't2']);
    fakeRealtime.connect();
    expect(status()).toBe('connected');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits longer after every failure, up to a ceiling, and never goes offline by itself', async () => {
    vi.useFakeTimers();
    const network = signInWithFlakyNetwork('network');
    dropWithExpiredToken();
    await flush();

    const ceiling = RENEW_RETRY_DELAYS_MS[RENEW_RETRY_DELAYS_MS.length - 1];
    const waits = [...RENEW_RETRY_DELAYS_MS, ceiling, ceiling];
    expect(waits).toEqual([1_000, 2_000, 5_000, 10_000, 10_000, 10_000]);
    let expectedCalls = 1;
    for (const wait of waits) {
      await vi.advanceTimersByTimeAsync(wait - 1);
      expect(network.refreshAccessToken).toHaveBeenCalledTimes(expectedCalls);
      await vi.advanceTimersByTimeAsync(1);
      expectedCalls += 1;
      expect(network.refreshAccessToken).toHaveBeenCalledTimes(expectedCalls);
      expect(status()).toBe('reconnecting');
    }
    expect(fakeRealtime.socket.connectCalls).toBe(1);
  });

  it('goes offline when the session ended while waiting', async () => {
    vi.useFakeTimers();
    const network = signInWithFlakyNetwork('network');
    dropWithExpiredToken();
    await flush();
    expect(status()).toBe('reconnecting');

    network.endSession();
    await vi.advanceTimersByTimeAsync(RENEW_RETRY_DELAYS_MS[0]);

    expect(status()).toBe('offline');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('goes offline at once when the refresh is refused and the session is gone', async () => {
    vi.useFakeTimers();
    signInWithTokens('t1', async () => null);
    dropWithExpiredToken();
    await flush();

    expect(status()).toBe('offline');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retries as soon as the browser reports it is online again', async () => {
    vi.useFakeTimers();
    const network = signInWithFlakyNetwork('network', 't2');
    dropWithExpiredToken();
    await flush();

    window.dispatchEvent(new Event('online'));
    await flush();

    expect(network.refreshAccessToken).toHaveBeenCalledTimes(2);
    expect(fakeRealtime.socket.connectCalls).toBe(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels the pending retry when stopped, as on sign-out', async () => {
    vi.useFakeTimers();
    const network = signInWithFlakyNetwork('network', 't2');
    dropWithExpiredToken();
    await flush();
    expect(vi.getTimerCount()).toBe(1);

    realtime.stop();
    expect(vi.getTimerCount()).toBe(0);
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(60_000);

    expect(network.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(fakeRealtime.socket.connectCalls).toBe(1);
    expect(status()).toBe('idle');
  });

  it('ignores a refresh that finishes after stop', async () => {
    vi.useFakeTimers();
    let finish: (value: null) => void = () => undefined;
    setAuthHandlers({
      getAccessToken: () => 't1',
      refreshAccessToken: () => new Promise<null>((resolve) => (finish = resolve)),
    });
    dropWithExpiredToken();

    realtime.stop();
    finish(null);
    await flush();

    expect(vi.getTimerCount()).toBe(0);
    expect(status()).toBe('idle');
  });

  it('lets a new renewal replace a pending retry', async () => {
    vi.useFakeTimers();
    const network = signInWithFlakyNetwork('network', 'network', 't3');
    dropWithExpiredToken();
    await flush();

    fakeRealtime.rejectHandshake('UNAUTHORIZED');
    await flush();
    expect(vi.getTimerCount()).toBe(1);
    expect(network.refreshAccessToken).toHaveBeenCalledTimes(2);
  });
});

describe('events', () => {
  it('delivers known events with their envelope and ignores unknown names', () => {
    signInWithTokens('t1');
    const received = record();
    realtime.start();
    fakeRealtime.connect();

    fakeRealtime.socket.receive('toString', { boardId: 'B1', actorId: 'u2', emittedAt: '', data: {} });
    fakeRealtime.socket.receive('made:up', { boardId: 'B1', actorId: 'u2', emittedAt: '', data: {} });
    fakeRealtime.socket.receive('card:deleted', 'not an envelope');
    emitCardDeleted('c1');

    expect(received).toEqual([
      {
        type: 'card:deleted',
        boardId: 'B1',
        actorId: 'someone-else',
        emittedAt: '2026-11-03T10:00:00.000Z',
        data: { id: 'c1', listId: 'L1' },
      },
    ]);
  });

  it('keeps delivering to the others when a listener throws', () => {
    signInWithTokens('t1');
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    realtime.subscribe(() => {
      throw new Error('boom');
    });
    const received = record();
    realtime.start();
    fakeRealtime.connect();

    emitCardDeleted('c1');

    expect(received).toHaveLength(1);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('stops delivering to an unsubscribed listener', () => {
    signInWithTokens('t1');
    const listener = vi.fn();
    const unsubscribe = realtime.subscribe(listener);
    realtime.start();
    fakeRealtime.connect();
    unsubscribe();

    emitCardDeleted('c1');

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('hold', () => {
  const ids = (received: RealtimeMessage[]) =>
    received.map((message) => (message.type === 'card:deleted' ? message.data.id : message.type));

  function startConnected() {
    signInWithTokens('t1');
    const received = record();
    realtime.start();
    fakeRealtime.connect();
    return received;
  }

  it('buffers events and releases them in order', () => {
    const received = startConnected();
    const release = realtime.hold();

    emitCardDeleted('a');
    emitCardDeleted('b');
    expect(received).toEqual([]);

    release();
    expect(ids(received)).toEqual(['a', 'b']);

    emitCardDeleted('c');
    expect(ids(received)).toEqual(['a', 'b', 'c']);
  });

  it('flushes only when the last of nested holds is released', () => {
    const received = startConnected();
    const first = realtime.hold();
    const second = realtime.hold();
    emitCardDeleted('a');

    first();
    expect(received).toEqual([]);
    second();
    expect(ids(received)).toEqual(['a']);
  });

  it('ignores a second release of the same hold', () => {
    const received = startConnected();
    const first = realtime.hold();
    const second = realtime.hold();
    emitCardDeleted('a');

    first();
    first();
    expect(received).toEqual([]);

    second();
    expect(ids(received)).toEqual(['a']);
  });

  it('releases a forgotten hold after two minutes and warns in development', () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const received = startConnected();
    realtime.hold();
    emitCardDeleted('a');

    vi.advanceTimersByTime(HOLD_TIMEOUT_MS - 1);
    expect(received).toEqual([]);
    vi.advanceTimersByTime(1);

    expect(ids(received)).toEqual(['a']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('drops held events on stop', () => {
    const received = startConnected();
    const release = realtime.hold();
    emitCardDeleted('a');

    realtime.stop();
    release();

    expect(received).toEqual([]);
  });

  it('queues events that arrive while the buffer is being flushed behind a new hold', () => {
    const received = startConnected();
    const release = realtime.hold();
    emitCardDeleted('a');
    emitCardDeleted('b');
    let second: (() => void) | undefined;
    realtime.subscribe(() => {
      second ??= realtime.hold();
    });

    release();

    expect(ids(received)).toEqual(['a']);
    second?.();
    expect(ids(received)).toEqual(['a', 'b']);
  });
});

describe('joining a board', () => {
  it('does not emit while not connected', async () => {
    signInWithTokens('t1');
    realtime.start();

    await expect(realtime.joinBoard('B1')).resolves.toEqual({ ok: false, code: 'INTERNAL_ERROR' });
    realtime.leaveBoard('B1');

    expect(fakeRealtime.joins).toEqual([]);
    expect(fakeRealtime.leaves).toEqual([]);
  });

  it('resolves with the server answer', async () => {
    signInWithTokens('t1');
    realtime.start();
    fakeRealtime.connect();

    await expect(realtime.joinBoard('B1')).resolves.toEqual({ ok: true });
    fakeRealtime.ackJoin(() => ({ ok: false, code: 'NOT_FOUND' }));
    await expect(realtime.joinBoard('B2')).resolves.toEqual({ ok: false, code: 'NOT_FOUND' });
    realtime.leaveBoard('B2');

    expect(fakeRealtime.joins).toEqual(['B1', 'B2']);
    expect(fakeRealtime.leaves).toEqual(['B2']);
  });

  it('gives INTERNAL_ERROR when the server does not answer in time', async () => {
    vi.useFakeTimers();
    signInWithTokens('t1');
    realtime.start();
    fakeRealtime.connect();
    fakeRealtime.ackJoin(() => null);

    const result = realtime.joinBoard('B1');
    vi.advanceTimersByTime(JOIN_ACK_TIMEOUT_MS);

    await expect(result).resolves.toEqual({ ok: false, code: 'INTERNAL_ERROR' });
  });
});

describe('socketId', () => {
  it('is the socket id only while connected', () => {
    signInWithTokens('t1');
    expect(realtime.socketId()).toBeNull();
    realtime.start();
    expect(realtime.socketId()).toBeNull();

    fakeRealtime.connect();
    expect(realtime.socketId()).toBe('fake-socket-id');

    fakeRealtime.drop('transport close');
    expect(realtime.socketId()).toBeNull();
  });
});
