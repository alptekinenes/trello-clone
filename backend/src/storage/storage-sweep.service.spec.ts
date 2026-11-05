import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service.js';
import { StorageSweepService } from './storage-sweep.service.js';
import type { StorageService } from './storage.service.js';

const NOW = new Date('2026-11-05T12:00:00.000Z');
const HOUR = 3_600_000;

interface Options {
  /** Keys the storage lists (the fake already applies the cutoff it is given). */
  listed?: string[];
  withRow?: string[];
  minutes?: number;
}

function setup({ listed = [], withRow = [], minutes = 60 }: Options = {}) {
  const deleteQuietly = vi.fn().mockResolvedValue(undefined);
  const listOlderThan = vi.fn(async function* (_cutoff: Date) {
    await Promise.resolve();
    yield* listed;
  });
  const findMany = vi.fn(({ where }: { where: { storageKey: { in: string[] } } }) =>
    Promise.resolve(
      where.storageKey.in.filter((key) => withRow.includes(key)).map((storageKey) => ({ storageKey })),
    ),
  );
  const config = { get: () => minutes } as unknown as ConfigService;
  const service = new StorageSweepService(
    config,
    { listOlderThan, deleteQuietly } as unknown as StorageService,
    { attachment: { findMany } } as unknown as PrismaService,
  );
  return { service, deleteQuietly, listOlderThan, findMany };
}

describe('StorageSweepService.sweepOnce', () => {
  it('deletes only the old files that no attachment row points at', async () => {
    const { service, deleteQuietly, listOlderThan } = setup({
      listed: ['orphan-1', 'kept', 'orphan-2'],
      withRow: ['kept'],
    });

    const removed = await service.sweepOnce(NOW);

    expect(removed).toBe(2);
    expect(deleteQuietly).toHaveBeenCalledWith(['orphan-1', 'orphan-2']);
    expect(listOlderThan).toHaveBeenCalledWith(new Date(NOW.getTime() - HOUR));
  });

  it('deletes nothing when every file has a row, and does not ask for files it was not given', async () => {
    const { service, deleteQuietly, findMany } = setup({ listed: ['a', 'b'], withRow: ['a', 'b'] });

    expect(await service.sweepOnce(NOW)).toBe(0);
    expect(deleteQuietly).toHaveBeenCalledWith([]);
    expect(findMany).toHaveBeenCalledOnce();

    const empty = setup();
    expect(await empty.service.sweepOnce(NOW)).toBe(0);
    expect(empty.findMany).not.toHaveBeenCalled();
  });

  it('looks the keys up in groups of 500', async () => {
    const listed = Array.from({ length: 1200 }, (_, i) => `key-${i}`);
    const { service, findMany, deleteQuietly } = setup({ listed });

    expect(await service.sweepOnce(NOW)).toBe(1200);

    expect(findMany).toHaveBeenCalledTimes(3);
    expect(findMany.mock.calls.map(([args]) => args.where.storageKey.in.length)).toEqual([
      500, 500, 200,
    ]);
    expect(deleteQuietly).toHaveBeenCalledTimes(3);
  });
});

describe('StorageSweepService.run', () => {
  it('never runs two rounds at once', async () => {
    const { service, listOlderThan } = setup({ listed: ['a'] });

    await Promise.all([service.run(NOW), service.run(NOW)]);

    expect(listOlderThan).toHaveBeenCalledOnce();
    await service.run(NOW);
    expect(listOlderThan).toHaveBeenCalledTimes(2);
  });

  it('swallows a failing round so the timer keeps going', async () => {
    const { service, listOlderThan } = setup();
    listOlderThan.mockImplementationOnce(() => {
      throw new Error('disk gone');
    });

    await expect(service.run(NOW)).resolves.toBeUndefined();
    await service.run(NOW);
    expect(listOlderThan).toHaveBeenCalledTimes(2);
  });
});

describe('StorageSweepService timers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts a round a minute after boot and then once per interval, until destroyed', async () => {
    const { service, listOlderThan } = setup({ minutes: 10 });

    service.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(59_000);
    expect(listOlderThan).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_000);
    expect(listOlderThan).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(listOlderThan).toHaveBeenCalledTimes(2);

    service.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(listOlderThan).toHaveBeenCalledTimes(2);
  });

  it('starts no timer when the interval is 0', async () => {
    const { service, listOlderThan } = setup({ minutes: 0 });

    service.onApplicationBootstrap();

    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(24 * 60 * 60_000);
    expect(listOlderThan).not.toHaveBeenCalled();
  });
});
