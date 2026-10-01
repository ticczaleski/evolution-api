import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatwootService } from './chatwoot.service';

const buildService = () => {
  const waMonitor = {
    waInstances: {
      'my-instance': {
        client: {
          groupMetadata: vi.fn(),
        },
        profilePicture: vi.fn().mockResolvedValue({ profilePictureUrl: null }),
      },
    },
  } as any;

  const prismaRepository = {
    message: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  } as any;

  const cache = {
    has: vi.fn().mockResolvedValue(false),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(true),
    delete: vi.fn().mockResolvedValue(true),
  } as any;

  const service = new ChatwootService(waMonitor, {} as any, prismaRepository, cache);
  (service as any).provider = {
    accountId: 42,
    token: 'token',
    url: 'https://cw.example',
    reopenConversation: true,
    conversationPending: false,
  };

  return { service, cache };
};

describe('ChatwootService reopenConversation', () => {
  const instance = { instanceName: 'my-instance', instanceId: 'inst-1' } as any;

  const body = {
    key: {
      remoteJid: '555591726903@s.whatsapp.net',
      fromMe: true,
      id: 'MSG-123',
    },
    pushName: 'TI Zaleski',
  };

  it('reopens a resolved conversation to "open" when reopenConversation is true and conversationPending is false', async () => {
    const { service } = buildService();
    const mockToggleStatus = vi.fn().mockResolvedValue({});

    const client = {
      conversations: {
        toggleStatus: mockToggleStatus,
        get: vi.fn(),
      },
      contacts: {
        listConversations: vi.fn().mockResolvedValue({
          payload: [
            {
              id: 68,
              inbox_id: 1,
              status: 'resolved',
              meta: { sender: { name: 'Rafael', identifier: '555591726903@s.whatsapp.net' } },
            },
          ],
        }),
      },
    };

    vi.spyOn(service as any, 'clientCw').mockResolvedValue(client);
    vi.spyOn(service as any, 'findContact').mockResolvedValue({ id: 548, name: 'Rafael' });
    vi.spyOn(service as any, 'getInbox').mockResolvedValue({ id: 1 });

    const conversationId = await service.createConversation(instance, body);

    expect(conversationId).toBe(68);
    expect(mockToggleStatus).toHaveBeenCalledWith({
      accountId: 42,
      conversationId: 68,
      data: { status: 'open' },
    });
  });

  it('sets status to "pending" when reopenConversation is true and conversationPending is true', async () => {
    const { service } = buildService();
    (service as any).provider.conversationPending = true;
    const mockToggleStatus = vi.fn().mockResolvedValue({});

    const client = {
      conversations: {
        toggleStatus: mockToggleStatus,
        get: vi.fn(),
      },
      contacts: {
        listConversations: vi.fn().mockResolvedValue({
          payload: [
            {
              id: 68,
              inbox_id: 1,
              status: 'resolved',
              meta: { sender: { name: 'Rafael', identifier: '555591726903@s.whatsapp.net' } },
            },
          ],
        }),
      },
    };

    vi.spyOn(service as any, 'clientCw').mockResolvedValue(client);
    vi.spyOn(service as any, 'findContact').mockResolvedValue({ id: 548, name: 'Rafael' });
    vi.spyOn(service as any, 'getInbox').mockResolvedValue({ id: 1 });

    const conversationId = await service.createConversation(instance, body);

    expect(conversationId).toBe(68);
    expect(mockToggleStatus).toHaveBeenCalledWith({
      accountId: 42,
      conversationId: 68,
      data: { status: 'pending' },
    });
  });

  it('reopens a resolved conversation found in cache', async () => {
    const { service, cache } = buildService();
    cache.has.mockResolvedValue(true);
    cache.get.mockResolvedValue(68);

    const mockToggleStatus = vi.fn().mockResolvedValue({});
    const client = {
      conversations: {
        get: vi.fn().mockResolvedValue({
          id: 68,
          status: 'resolved',
          meta: { sender: { name: 'Rafael', identifier: '555591726903@s.whatsapp.net' } },
        }),
        toggleStatus: mockToggleStatus,
      },
    };

    vi.spyOn(service as any, 'clientCw').mockResolvedValue(client);

    const conversationId = await service.createConversation(instance, body);

    expect(conversationId).toBe(68);
    expect(mockToggleStatus).toHaveBeenCalledWith({
      accountId: 42,
      conversationId: 68,
      data: { status: 'open' },
    });
  });
});
