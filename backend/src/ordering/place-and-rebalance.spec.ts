import { ConflictException } from '@nestjs/common';
import { POSITION_GAP } from '@trello/contracts';
import { placeAndRebalance } from './place-and-rebalance.js';

describe('placeAndRebalance', () => {
  it('returns the placement and writes nothing when there is room', async () => {
    const write = vi.fn();

    const placement = await placeAndRebalance(
      [
        { id: 'a', position: 1024 },
        { id: 'b', position: 2048 },
      ],
      {},
      write,
    );

    expect(placement).toEqual({ position: 2048 + POSITION_GAP, rebalanced: null });
    expect(write).not.toHaveBeenCalled();
  });

  it('writes the respread siblings and returns them for the broadcast', async () => {
    const write = vi.fn().mockResolvedValue(undefined);

    const placement = await placeAndRebalance(
      [
        { id: 'a', position: 1 },
        { id: 'b', position: 1 + 1e-7 },
      ],
      { afterId: 'a' },
      write,
    );

    expect(placement.position).toBe(2048);
    expect(placement.rebalanced).toEqual([
      { id: 'a', position: 1024 },
      { id: 'b', position: 3072 },
    ]);
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenCalledWith('a', 1024);
    expect(write).toHaveBeenCalledWith('b', 3072);
  });

  it('turns a stale anchor into a 409 and writes nothing', async () => {
    const write = vi.fn();

    await expect(
      placeAndRebalance([{ id: 'a', position: 1024 }], { afterId: 'gone' }, write),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(write).not.toHaveBeenCalled();
  });
});
