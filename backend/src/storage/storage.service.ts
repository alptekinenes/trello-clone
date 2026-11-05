import { Logger } from '@nestjs/common';
import type { Readable } from 'node:stream';

export interface StoredFile {
  stream: Readable;
  size: number;
}

/** Storage keys are server-made uuid v4 strings in lower case; this is the only accepted shape. */
export const STORAGE_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * DI token for the file store; one driver per process. Keys are server-made uuids, never user input.
 * The only driver is LocalDiskStorage; the interface keeps an object-store driver possible.
 */
export abstract class StorageService {
  private readonly logger = new Logger(StorageService.name);

  abstract put(key: string, body: Buffer, contentType: string): Promise<void>;

  /** The file, or null when it does not exist. */
  abstract open(key: string): Promise<StoredFile | null>;

  /** Deleting a file that does not exist is not an error. */
  abstract delete(key: string): Promise<void>;

  /** Keys of files last modified before `cutoff`, for the orphan sweep. */
  abstract listOlderThan(cutoff: Date): AsyncIterable<string>;

  /** For use after a commit: logs failures and never throws (the sweep retries later). */
  async deleteQuietly(keys: readonly string[]): Promise<void> {
    for (const key of keys) {
      try {
        await this.delete(key);
      } catch (error) {
        this.logger.warn(
          `Could not delete stored file ${key}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
