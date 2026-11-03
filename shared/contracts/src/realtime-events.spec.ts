import { describe, expect, it } from 'vitest';
import {
  BOARD_EVENT_NAMES,
  USER_EVENT_NAMES,
  isBoardEventName,
  isUserEventName,
} from './realtime-events.js';

const EVENT_NAME_PATTERN = /^[a-z-]+:[a-z-]+$/;

describe('realtime event names', () => {
  it('lists every name once', () => {
    expect(new Set(BOARD_EVENT_NAMES).size).toBe(BOARD_EVENT_NAMES.length);
    expect(new Set(USER_EVENT_NAMES).size).toBe(USER_EVENT_NAMES.length);
  });

  it('keeps board and user events apart', () => {
    const userNames = new Set<string>(USER_EVENT_NAMES);
    expect(BOARD_EVENT_NAMES.filter((name) => userNames.has(name))).toEqual([]);
  });

  it.each([...BOARD_EVENT_NAMES, ...USER_EVENT_NAMES])('%s follows entity:action', (name) => {
    expect(name).toMatch(EVENT_NAME_PATTERN);
  });
});

describe('isBoardEventName', () => {
  it('accepts board events only', () => {
    expect(isBoardEventName('card:moved')).toBe(true);
    expect(isBoardEventName('position:rebalanced')).toBe(true);
    expect(isBoardEventName('membership:added')).toBe(false);
    expect(isBoardEventName('card:unknown')).toBe(false);
  });

  it('does not treat inherited object members as events', () => {
    expect(isBoardEventName('toString')).toBe(false);
    expect(isBoardEventName('constructor')).toBe(false);
    expect(isBoardEventName('__proto__')).toBe(false);
  });
});

describe('isUserEventName', () => {
  it('accepts user events only', () => {
    expect(isUserEventName('membership:added')).toBe(true);
    expect(isUserEventName('board:deleted')).toBe(true);
    expect(isUserEventName('card:moved')).toBe(false);
    expect(isUserEventName('membership:unknown')).toBe(false);
  });

  it('does not treat inherited object members as events', () => {
    expect(isUserEventName('toString')).toBe(false);
    expect(isUserEventName('hasOwnProperty')).toBe(false);
  });
});
