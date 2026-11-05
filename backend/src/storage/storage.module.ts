import { Module } from '@nestjs/common';
import { LocalDiskStorage } from './local-disk.storage.js';
import { StorageSweepService } from './storage-sweep.service.js';
import { StorageService } from './storage.service.js';

@Module({
  providers: [{ provide: StorageService, useClass: LocalDiskStorage }, StorageSweepService],
  exports: [StorageService],
})
export class StorageModule {}
