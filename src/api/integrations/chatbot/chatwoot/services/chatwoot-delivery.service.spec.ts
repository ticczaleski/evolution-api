import { CacheService } from '@api/services/cache.service';
import { describe, expect, it, vi } from 'vitest';

import { ChatwootDeliveryService } from './chatwoot-delivery.service';

describe('ChatwootDeliveryService', () => {
  describe('claim', () => {
    it('claims a (instance, message, operation) tuple only once', async () => {
      const cache = {
        setNX: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
      } as unknown as CacheService;
      const delivery = new ChatwootDeliveryService(cache);

      const first = await delivery.claim('instance-1', 42, 'send');
      const second = await delivery.claim('instance-1', 42, 'send');

      expect(first).toBe(true);
      expect(second).toBe(false);
      expect(cache.setNX).toHaveBeenCalledTimes(2);
      expect(cache.setNX).toHaveBeenNthCalledWith(1, 'chatwoot-outbound-delivery:instance-1:42:send', true, 300);
    });

    it('fails open when there is no stable message id to key on', async () => {
      const cache = { setNX: vi.fn() } as unknown as CacheService;
      const delivery = new ChatwootDeliveryService(cache);

      const claimed = await delivery.claim('instance-1', undefined as unknown as number, 'send');

      expect(claimed).toBe(true);
      expect(cache.setNX).not.toHaveBeenCalled();
    });
  });

  describe('reportFailure', () => {
    it('updates the original message to failed with the external error, and never creates a message', async () => {
      const update = vi.fn().mockResolvedValue({});
      const create = vi.fn();
      const client = { messages: { update, create } } as any;
      const delivery = new ChatwootDeliveryService({} as CacheService);

      await delivery.reportFailure(client, 7, 99, 123, 'number not on whatsapp');

      expect(update).toHaveBeenCalledWith({
        accountId: 7,
        conversationId: 99,
        messageId: 123,
        data: { status: 'failed', external_error: 'number not on whatsapp' },
      });
      expect(create).not.toHaveBeenCalled();
    });

    it('does nothing when the message id is missing', async () => {
      const update = vi.fn();
      const client = { messages: { update } } as any;
      const delivery = new ChatwootDeliveryService({} as CacheService);

      await delivery.reportFailure(client, 7, 99, undefined as unknown as number, 'error');

      expect(update).not.toHaveBeenCalled();
    });

    it('swallows update errors instead of throwing, so the webhook can still be acknowledged', async () => {
      const update = vi.fn().mockRejectedValue(new Error('network blip'));
      const client = { messages: { update } } as any;
      const delivery = new ChatwootDeliveryService({} as CacheService);

      await expect(delivery.reportFailure(client, 7, 99, 123, 'error')).resolves.toBeUndefined();
    });
  });

  describe('registerExternalId', () => {
    it('sets source_id on the original message via the Application API', async () => {
      const update = vi.fn().mockResolvedValue({});
      const client = { messages: { update } } as any;
      const delivery = new ChatwootDeliveryService({} as CacheService);

      await delivery.registerExternalId(client, 7, 99, 123, 'WAID:abc123');

      expect(update).toHaveBeenCalledWith({
        accountId: 7,
        conversationId: 99,
        messageId: 123,
        data: { source_id: 'WAID:abc123' },
      });
    });

    it('does nothing when the external id is missing', async () => {
      const update = vi.fn();
      const client = { messages: { update } } as any;
      const delivery = new ChatwootDeliveryService({} as CacheService);

      await delivery.registerExternalId(client, 7, 99, 123, '');

      expect(update).not.toHaveBeenCalled();
    });

    it('swallows update errors instead of throwing', async () => {
      const update = vi.fn().mockRejectedValue(new Error('network blip'));
      const client = { messages: { update } } as any;
      const delivery = new ChatwootDeliveryService({} as CacheService);

      await expect(delivery.registerExternalId(client, 7, 99, 123, 'WAID:abc123')).resolves.toBeUndefined();
    });
  });
});
