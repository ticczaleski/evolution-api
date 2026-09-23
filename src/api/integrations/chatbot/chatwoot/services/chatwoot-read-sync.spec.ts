// eslint-disable-next-line simple-import-sort/imports
import { request as chatwootRequest } from '@figuro/chatwoot-sdk/dist/core/request';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatwootService } from './chatwoot.service';

vi.mock('@figuro/chatwoot-sdk/dist/core/request', () => ({
  request: vi.fn(),
}));

const buildService = () => {
  const waMonitor = { waInstances: {} } as any;
  const prismaRepository = {
    message: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  } as any;

  const service = new ChatwootService(waMonitor, {} as any, prismaRepository, {} as any);
  (service as any).provider = { accountId: 42, token: 'token', url: 'https://cw.example' };

  return { service, prismaRepository };
};

describe('ChatwootService read sync', () => {
  const instance = { instanceName: 'my-instance', instanceId: 'inst-1' } as any;

  beforeEach(() => {
    vi.mocked(chatwootRequest).mockReset();
    vi.mocked(chatwootRequest).mockResolvedValue({});
  });

  describe('WhatsApp read-self -> Chatwoot conversation seen', () => {
    const key = (id: string) => ({ id, remoteJid: '5555@s.whatsapp.net', fromMe: false });

    it('marks each affected conversation seen once, even with several read keys in it', async () => {
      const { service } = buildService();
      const conversationByKey: Record<string, number> = { A: 7, B: 7, C: 9 };
      vi.spyOn(service as any, 'getMessageByKeyId').mockImplementation(async (_instance, id: string) => ({
        chatwootConversationId: conversationByKey[id],
      }));

      await (service as any).markConversationsSeenFromWhatsapp(instance, [key('A'), key('B'), key('C')]);

      const urls = vi.mocked(chatwootRequest).mock.calls.map(([, options]) => (options as any).url);
      expect(urls).toEqual([
        '/api/v1/accounts/42/conversations/7/update_last_seen',
        '/api/v1/accounts/42/conversations/9/update_last_seen',
      ]);
      expect(vi.mocked(chatwootRequest).mock.calls.every(([, options]) => (options as any).method === 'POST')).toBe(
        true,
      );
    });

    it('does nothing for messages that were never bridged to a Chatwoot conversation', async () => {
      const { service } = buildService();
      vi.spyOn(service as any, 'getMessageByKeyId').mockResolvedValue(null);

      await (service as any).markConversationsSeenFromWhatsapp(instance, [key('A')]);

      expect(chatwootRequest).not.toHaveBeenCalled();
    });

    it('keeps marking the other conversations when one Chatwoot call fails', async () => {
      const { service } = buildService();
      const conversationByKey: Record<string, number> = { A: 7, C: 9 };
      vi.spyOn(service as any, 'getMessageByKeyId').mockImplementation(async (_instance, id: string) => ({
        chatwootConversationId: conversationByKey[id],
      }));
      vi.mocked(chatwootRequest).mockRejectedValueOnce(new Error('boom'));

      await expect(
        (service as any).markConversationsSeenFromWhatsapp(instance, [key('A'), key('C')]),
      ).resolves.not.toThrow();

      expect(chatwootRequest).toHaveBeenCalledTimes(2);
    });
  });

  describe('agent reply (Chatwoot) -> WhatsApp read receipts', () => {
    const storedMessage = (id: string, keyId: string) => ({
      id,
      key: { id: keyId, remoteJid: '5555@s.whatsapp.net', fromMe: false },
    });

    it("looks up only the replied conversation's unread contact messages, newest first", async () => {
      const { service, prismaRepository } = buildService();

      await (service as any).markConversationReadOnWhatsapp(instance, { markMessageAsRead: vi.fn() }, 7);

      expect(prismaRepository.message.findMany).toHaveBeenCalledWith({
        where: {
          instanceId: 'inst-1',
          chatwootConversationId: 7,
          key: { path: ['fromMe'], equals: false },
          OR: [{ chatwootIsRead: null }, { chatwootIsRead: false }],
        },
        orderBy: { messageTimestamp: 'desc' },
        take: 50,
      });
    });

    it('sends read receipts for those messages and flags them read', async () => {
      const { service, prismaRepository } = buildService();
      prismaRepository.message.findMany.mockResolvedValue([storedMessage('m2', 'K2'), storedMessage('m1', 'K1')]);
      const markMessageAsRead = vi.fn().mockResolvedValue({});

      await (service as any).markConversationReadOnWhatsapp(instance, { markMessageAsRead }, 7);

      expect(markMessageAsRead).toHaveBeenCalledWith({
        readMessages: [
          { id: 'K2', fromMe: false, remoteJid: '5555@s.whatsapp.net' },
          { id: 'K1', fromMe: false, remoteJid: '5555@s.whatsapp.net' },
        ],
      });
      expect(prismaRepository.message.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['m2', 'm1'] } },
        data: { chatwootIsRead: true },
      });
    });

    it('sends nothing when the conversation has no unread contact messages', async () => {
      const { service, prismaRepository } = buildService();
      const markMessageAsRead = vi.fn();

      await (service as any).markConversationReadOnWhatsapp(instance, { markMessageAsRead }, 7);

      expect(markMessageAsRead).not.toHaveBeenCalled();
      expect(prismaRepository.message.updateMany).not.toHaveBeenCalled();
    });

    it('leaves messages unflagged when WhatsApp rejects the receipts, so a later reply retries', async () => {
      const { service, prismaRepository } = buildService();
      prismaRepository.message.findMany.mockResolvedValue([storedMessage('m1', 'K1')]);
      const markMessageAsRead = vi.fn().mockRejectedValue(new Error('offline'));

      await expect(
        (service as any).markConversationReadOnWhatsapp(instance, { markMessageAsRead }, 7),
      ).resolves.not.toThrow();

      expect(prismaRepository.message.updateMany).not.toHaveBeenCalled();
    });
  });
});
