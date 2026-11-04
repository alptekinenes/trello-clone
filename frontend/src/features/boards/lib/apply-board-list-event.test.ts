import type { UserEvent } from '@trello/contracts';
import { describe, expect, it } from 'vitest';
import { boardSummary } from '../../../test/fixtures';
import { applyBoardListEvent } from './apply-board-list-event';

const A = boardSummary({ id: 'A', title: 'A' });
const B = boardSummary({ id: 'B', title: 'B' });

function message(type: 'membership:added', data: typeof A): UserEvent;
function message(type: 'membership:removed' | 'board:deleted', data: { boardId: string }): UserEvent;
function message(type: string, data: unknown): UserEvent {
  return { type, data } as UserEvent;
}

describe('applyBoardListEvent', () => {
  it('puts a new board first', () => {
    const added = boardSummary({ id: 'C', title: 'C' });
    expect(applyBoardListEvent([A, B], message('membership:added', added))).toEqual([added, A, B]);
  });

  it('replaces a board that is already listed, in place', () => {
    const renamed = { ...B, title: 'Yeni ad', myRole: 'ADMIN' as const };
    expect(applyBoardListEvent([A, B], message('membership:added', renamed))).toEqual([A, renamed]);
  });

  it('applying the same addition twice equals applying it once', () => {
    const added = boardSummary({ id: 'C' });
    const once = applyBoardListEvent([A], message('membership:added', added));
    expect(applyBoardListEvent(once, message('membership:added', added))).toEqual(once);
  });

  it.each(['membership:removed', 'board:deleted'] as const)('%s takes the board off the list', (type) => {
    expect(applyBoardListEvent([A, B], message(type, { boardId: 'A' }))).toEqual([B]);
  });

  it.each(['membership:removed', 'board:deleted'] as const)(
    '%s for an unknown board returns the same array',
    (type) => {
      const boards = [A, B];
      expect(applyBoardListEvent(boards, message(type, { boardId: 'Z' }))).toBe(boards);
    },
  );
});
