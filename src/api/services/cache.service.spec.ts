import { ICache } from '@api/abstract/abstract.cache';
import { describe, expect, it, vi } from 'vitest';

import { CacheService } from './cache.service';

describe('CacheService.setNX', () => {
  it('delegates to the underlying cache engine', async () => {
    const engine = { setNX: vi.fn().mockResolvedValue(true) } as unknown as ICache;
    const cacheService = new CacheService(engine);

    const claimed = await cacheService.setNX('key', true, 30);

    expect(claimed).toBe(true);
    expect(engine.setNX).toHaveBeenCalledWith('key', true, 30);
  });

  it('fails open (claim succeeds) when caching is disabled', async () => {
    const cacheService = new CacheService(undefined as unknown as ICache);

    const claimed = await cacheService.setNX('key', true, 30);

    expect(claimed).toBe(true);
  });
});
