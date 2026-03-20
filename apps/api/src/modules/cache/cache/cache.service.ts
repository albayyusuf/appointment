import { Injectable } from '@nestjs/common';
import { CachePort } from '../cache.port';
import { MemoryCacheAdapter } from '../memory-cache.adapter';

@Injectable()
export class CacheService implements CachePort {
  constructor(private readonly adapter: MemoryCacheAdapter) {}

  get<T>(key: string): Promise<T | null> {
    return this.adapter.get<T>(key);
  }

  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    return this.adapter.set<T>(key, value, ttlSeconds);
  }

  del(key: string): Promise<void> {
    return this.adapter.del(key);
  }
}
