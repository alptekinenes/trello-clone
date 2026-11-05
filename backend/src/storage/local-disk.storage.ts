import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'node:fs';
import { mkdir, opendir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { STORAGE_KEY_PATTERN, StorageService, type StoredFile } from './storage.service.js';

/** Throws for anything but a server-made key, so user input can never become part of a path. */
function assertValidKey(key: string): void {
  if (!STORAGE_KEY_PATTERN.test(key)) throw new Error('Invalid storage key');
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/** Files in one flat directory (`UPLOAD_DIR`), named by their key without an extension. */
@Injectable()
export class LocalDiskStorage extends StorageService implements OnModuleInit {
  private readonly diskLogger = new Logger(LocalDiskStorage.name);
  private readonly root: string;

  constructor(config: ConfigService) {
    super();
    this.root = path.resolve(config.getOrThrow<string>('UPLOAD_DIR'));
  }

  /** The app does not start when the directory cannot be created. */
  async onModuleInit(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    this.diskLogger.log(`Storing attachments in ${this.root}`);
  }

  async put(key: string, body: Buffer): Promise<void> {
    assertValidKey(key);
    // 'wx': never overwrites an existing file.
    await writeFile(path.join(this.root, key), body, { flag: 'wx', mode: 0o600 });
  }

  async open(key: string): Promise<StoredFile | null> {
    assertValidKey(key);
    const file = path.join(this.root, key);
    try {
      const { size } = await stat(file);
      return { stream: createReadStream(file), size };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    assertValidKey(key);
    await rm(path.join(this.root, key), { force: true });
  }

  async *listOlderThan(cutoff: Date): AsyncIterable<string> {
    const dir = await opendir(this.root);
    for await (const entry of dir) {
      if (!entry.isFile() || !STORAGE_KEY_PATTERN.test(entry.name)) continue;
      try {
        const { mtime } = await stat(path.join(this.root, entry.name));
        if (mtime < cutoff) yield entry.name;
      } catch (error) {
        if (!isNotFound(error)) throw error;
      }
    }
  }
}
