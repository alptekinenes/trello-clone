import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from './storage.service.js';

const FIRST_RUN_DELAY_MS = 60_000;
/** Files younger than this are never touched: an upload writes the file, then its row a moment later. */
const MIN_AGE_MS = 60 * 60_000;
const BATCH_SIZE = 500;

/**
 * Deletes stored files that no attachment row points at: left behind by a failed delete after a
 * commit, by a crash between the file write and the row, or by a file that was still open on Windows.
 * Safe to run on several instances against one directory (deleting twice is not an error).
 */
@Injectable()
export class StorageSweepService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(StorageSweepService.name);
  private firstRun: NodeJS.Timeout | undefined;
  private repeat: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  onApplicationBootstrap(): void {
    const minutes = this.config.get<number>('STORAGE_SWEEP_INTERVAL_MINUTES', 60);
    if (!(minutes > 0)) return;
    const intervalMs = minutes * 60_000;
    this.firstRun = setTimeout(() => {
      void this.run();
      this.repeat = setInterval(() => void this.run(), intervalMs);
      this.repeat.unref();
    }, FIRST_RUN_DELAY_MS);
    this.firstRun.unref();
  }

  onModuleDestroy(): void {
    clearTimeout(this.firstRun);
    clearInterval(this.repeat);
  }

  /** One round that never overlaps another and never throws. */
  async run(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const removed = await this.sweepOnce(now);
      if (removed > 0) this.logger.log(`Removed ${removed} orphaned file(s) from storage`);
    } catch (error) {
      this.logger.warn(
        `Storage sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  /** Returns how many orphaned files it tried to delete. */
  async sweepOnce(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - MIN_AGE_MS);
    let removed = 0;
    let batch: string[] = [];
    for await (const key of this.storage.listOlderThan(cutoff)) {
      batch.push(key);
      if (batch.length >= BATCH_SIZE) {
        removed += await this.removeOrphans(batch);
        batch = [];
      }
    }
    if (batch.length > 0) removed += await this.removeOrphans(batch);
    return removed;
  }

  private async removeOrphans(keys: string[]): Promise<number> {
    const known = await this.prisma.attachment.findMany({
      where: { storageKey: { in: keys } },
      select: { storageKey: true },
    });
    const withRow = new Set(known.map((row) => row.storageKey));
    const orphans = keys.filter((key) => !withRow.has(key));
    await this.storage.deleteQuietly(orphans);
    return orphans.length;
  }
}
