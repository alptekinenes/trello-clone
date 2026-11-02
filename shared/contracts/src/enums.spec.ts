import { describe, expect, it } from 'vitest';
import { LABEL_COLORS, LabelColor } from './enums.js';

describe('LABEL_COLORS', () => {
  it('lists every label color once, in enum order', () => {
    expect(LABEL_COLORS).toEqual([
      'GREEN',
      'YELLOW',
      'ORANGE',
      'RED',
      'PURPLE',
      'BLUE',
      'SKY',
      'LIME',
      'PINK',
      'BLACK',
    ]);
    expect(new Set(LABEL_COLORS).size).toBe(Object.keys(LabelColor).length);
  });
});
