import type { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LocalDiskStorage } from './local-disk.storage.js';
import { StorageService } from './storage.service.js';

let dir: string;
let storage: LocalDiskStorage;

async function read(stream: AsyncIterable<unknown>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks);
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'trello-storage-'));
  const config = { getOrThrow: () => dir } as unknown as ConfigService;
  storage = new LocalDiskStorage(config);
  await storage.onModuleInit();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('LocalDiskStorage', () => {
  it('puts, opens and deletes a file', async () => {
    const key = randomUUID();
    await storage.put(key, Buffer.from('merhaba'));

    const stored = await storage.open(key);
    expect(stored?.size).toBe(7);
    expect((await read(stored!.stream)).toString()).toBe('merhaba');
    expect(await readdir(dir)).toEqual([key]);

    await storage.delete(key);
    expect(await storage.open(key)).toBeNull();
  });

  it('never overwrites an existing file', async () => {
    const key = randomUUID();
    await storage.put(key, Buffer.from('ilk'));

    await expect(storage.put(key, Buffer.from('ikinci'))).rejects.toThrow();
    expect((await readFile(path.join(dir, key))).toString()).toBe('ilk');
  });

  it.each([
    '../x',
    '..\\x',
    'a/b',
    '',
    'not-a-uuid',
    randomUUID().toUpperCase(),
    `${randomUUID()}/..`,
  ])('rejects the key %j', async (key) => {
    await expect(storage.put(key, Buffer.from('x'))).rejects.toThrow('Invalid');
    await expect(storage.open(key)).rejects.toThrow('Invalid');
    await expect(storage.delete(key)).rejects.toThrow('Invalid');
    expect(await readdir(dir)).toEqual([]);
  });

  it('answers null for a missing file and does not fail deleting one', async () => {
    await expect(storage.open(randomUUID())).resolves.toBeNull();
    await expect(storage.delete(randomUUID())).resolves.toBeUndefined();
  });

  it('lists only key-named files older than the cutoff', async () => {
    const old = randomUUID();
    const fresh = randomUUID();
    await storage.put(old, Buffer.from('a'));
    await storage.put(fresh, Buffer.from('b'));
    await writeFile(path.join(dir, 'notes.txt'), 'not a key');
    const past = new Date(Date.now() - 2 * 3_600_000);
    await utimes(path.join(dir, old), past, past);
    await utimes(path.join(dir, 'notes.txt'), past, past);

    const found: string[] = [];
    for await (const key of storage.listOlderThan(new Date(Date.now() - 3_600_000))) {
      found.push(key);
    }
    expect(found).toEqual([old]);
  });
});

describe('StorageService.deleteQuietly', () => {
  class FailingStorage extends StorageService {
    readonly deleted: string[] = [];
    put(): Promise<void> {
      return Promise.resolve();
    }
    open(): Promise<null> {
      return Promise.resolve(null);
    }
    delete(key: string): Promise<void> {
      if (key === 'bad') return Promise.reject(new Error('EBUSY'));
      this.deleted.push(key);
      return Promise.resolve();
    }
    async *listOlderThan(): AsyncIterable<string> {
      await Promise.resolve();
      yield* [];
    }
  }

  it('keeps going after a failure and never throws', async () => {
    const failing = new FailingStorage();
    await expect(failing.deleteQuietly(['a', 'bad', 'c'])).resolves.toBeUndefined();
    expect(failing.deleted).toEqual(['a', 'c']);
  });
});
