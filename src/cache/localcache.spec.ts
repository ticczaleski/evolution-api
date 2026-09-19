import { describe, expect, it, vi } from 'vitest';

import { LocalCache } from './localcache';

const configService = {
  get: vi.fn().mockReturnValue({ LOCAL: { TTL: 60 } }),
} as any;

describe('LocalCache.setNX', () => {
  it('claims a key only once, until it is deleted', async () => {
    const cache = new LocalCache(configService, `test-module-${Date.now()}-${Math.random()}`);

    const first = await cache.setNX('lock', true, 60);
    const second = await cache.setNX('lock', true, 60);

    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it('allows re-claiming after the key is deleted', async () => {
    const cache = new LocalCache(configService, `test-module-${Date.now()}-${Math.random()}`);

    await cache.setNX('lock', true, 60);
    await cache.delete('lock');

    const reclaimed = await cache.setNX('lock', true, 60);

    expect(reclaimed).toBe(true);
  });

  it('keeps claims isolated per module namespace', async () => {
    const cacheA = new LocalCache(configService, `module-a-${Date.now()}-${Math.random()}`);
    const cacheB = new LocalCache(configService, `module-b-${Date.now()}-${Math.random()}`);

    const claimA = await cacheA.setNX('same-key', true, 60);
    const claimB = await cacheB.setNX('same-key', true, 60);

    expect(claimA).toBe(true);
    expect(claimB).toBe(true);
  });
});
