import { describe, expect, it } from 'vitest';
import { useCardDetailStore } from './card-detail-store';

const state = () => useCardDetailStore.getState();

describe('card detail store: gone card', () => {
  it('remembers which card was deleted', () => {
    state().open('card-1');
    state().markGone('card-1');
    expect(state().goneCardId).toBe('card-1');
  });

  it('forgets it when a dialog opens or resets', () => {
    state().markGone('card-1');
    state().open('card-2');
    expect(state().goneCardId).toBeNull();

    state().markGone('card-2');
    state().reset();
    expect(state().goneCardId).toBeNull();
  });
});

describe('card detail store: feed details', () => {
  it('starts hidden and toggles', () => {
    expect(state().showFeedDetails).toBe(false);
    state().toggleFeedDetails();
    expect(state().showFeedDetails).toBe(true);
    state().toggleFeedDetails();
    expect(state().showFeedDetails).toBe(false);
  });

  it('keeps the choice when a dialog opens, resets or another card opens', () => {
    state().toggleFeedDetails();
    state().open('card-1');
    state().reset();
    state().open('card-2');
    expect(state().showFeedDetails).toBe(true);
    state().toggleFeedDetails();
  });
});
