import type { RealtimeMessage } from '@trello/contracts';
import { describe, expect, it } from 'vitest';
import { asBoardEvent, asUserEvent } from './realtime-message';

const envelope = { boardId: 'B', actorId: 'u', emittedAt: '' };

describe('asBoardEvent', () => {
  it('gives board-room events back and nothing for user-room events', () => {
    const board: RealtimeMessage = { ...envelope, type: 'list:deleted', data: { id: 'L' } };
    const user: RealtimeMessage = { ...envelope, type: 'board:deleted', data: { boardId: 'B' } };

    expect(asBoardEvent(board)).toBe(board);
    expect(asBoardEvent(user)).toBeNull();
  });
});

describe('asUserEvent', () => {
  it('gives user-room events back and nothing for board-room events', () => {
    const board: RealtimeMessage = { ...envelope, type: 'list:deleted', data: { id: 'L' } };
    const user: RealtimeMessage = { ...envelope, type: 'board:deleted', data: { boardId: 'B' } };

    expect(asUserEvent(user)).toBe(user);
    expect(asUserEvent(board)).toBeNull();
  });
});
