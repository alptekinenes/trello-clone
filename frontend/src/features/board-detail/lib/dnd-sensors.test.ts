import { describe, expect, it } from 'vitest';
import { startsInEditable } from './dnd-sensors';

describe('startsInEditable', () => {
  it('blocks drags that start in text fields or marked areas', () => {
    document.body.innerHTML = `
      <div id="handle"><span id="title">Liste</span>
        <input id="input" /><textarea id="area"></textarea>
        <div data-no-dnd><button id="inside">x</button></div>
      </div>`;
    const el = (id: string) => document.getElementById(id);

    expect(startsInEditable(el('input'))).toBe(true);
    expect(startsInEditable(el('area'))).toBe(true);
    expect(startsInEditable(el('inside'))).toBe(true);
    expect(startsInEditable(el('title'))).toBe(false);
    expect(startsInEditable(el('handle'))).toBe(false);
    expect(startsInEditable(null)).toBe(false);
  });
});
