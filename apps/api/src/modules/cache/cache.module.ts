import { Module } from '@nestjs/common';
import { CacheService } from './cache/cache.service';
import { MemoryCacheAdapter } from './memory-cache.adapter';
import { CACHE_PORT } from './cache.port';

@Module({
  providers: [
    MemoryCacheAdapter,
    CacheService,
    {
      provide: CACHE_PORT,
      useExisting: CacheService,
    },
  ],
  exports: [CACHE_PORT, CacheService],
})
export class CacheModule {}
