// eslint-disable-next-line simple-import-sort/imports
import { request as chatwootRequest } from '@figuro/chatwoot-sdk/dist/core/request';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatwootService } from './chatwoot.service';

vi.mock('@figuro/chatwoot-sdk/dist/core/request', () => ({
  request: vi.fn(),
}));

const buildService = () => {
  const claimedKeys = new Set<string>();
  const cache = {
    setNX: vi.fn(async (key: string) => {
      if (claimedKeys.has(key)) return false;
      claimedKeys.add(key);
      return true;
    }),
  } as any;
  const waMonitor = { waInstances: {} } as any;
  const configService = {} as any;
  const prismaRepository = {} as any;

  const service = new ChatwootService(waMonitor, configService, prismaRepository, cache);
  (service as any).provider = { accountId: 42, token: 'token', url: 'https://cw.example' };

  return { service, waMonitor };
};

describe('ChatwootService reaction bridge', () => {
  const instance = { instanceName: 'my-instance' } as any;

  beforeEach(() => {
    vi.mocked(chatwootRequest).mockReset();
    vi.mocked(chatwootRequest).mockResolvedValue({});
  });

  describe('outbound: agent reaction (Chatwoot) -> WhatsApp', () => {
    const targetKey = { id: 'WA-KEY-1', remoteJid: '123@s.whatsapp.net', fromMe: false };

    const buildReactionBody = (overrides: Record<string, any> = {}) => ({
      id: 555,
      event: 'message_reaction_created',
      actor_type: 'User',
      emoji: '👍',
      message_id: 10,
      source_id: `WAID:${targetKey.id}`,
      ...overrides,
    });

    it('invokes reactionMessage with the target WhatsApp key and emoji', async () => {
      const { service, waMonitor } = buildService();
      const reactionMessage = vi.fn().mockResolvedValue({});
      waMonitor.waInstances[instance.instanceName] = { reactionMessage };
      vi.spyOn(service as any, 'getMessageByKeyId').mockResolvedValue({ key: targetKey });

      await (service as any).handleReactionWebhook(instance, buildReactionBody());

      expect(reactionMessage).toHaveBeenCalledWith({ key: targetKey, reaction: '👍' });
    });

    it('sends an empty reaction for message_reaction_deleted', async () => {
      const { service, waMonitor } = buildService();
      const reactionMessage = vi.fn().mockResolvedValue({});
      waMonitor.waInstances[instance.instanceName] = { reactionMessage };
      vi.spyOn(service as any, 'getMessageByKeyId').mockResolvedValue({ key: targetKey });

      await (service as any).handleReactionWebhook(
        instance,
        buildReactionBody({ event: 'message_reaction_deleted', emoji: '👍' }),
      );

      expect(reactionMessage).toHaveBeenCalledWith({ key: targetKey, reaction: '' });
    });

    it('does not relay a contact-originated reaction back to WhatsApp (would echo)', async () => {
      const { service, waMonitor } = buildService();
      const reactionMessage = vi.fn();
      waMonitor.waInstances[instance.instanceName] = { reactionMessage };

      await (service as any).handleReactionWebhook(instance, buildReactionBody({ actor_type: 'Contact' }));

      expect(reactionMessage).not.toHaveBeenCalled();
    });

    it('invokes the provider once for a duplicate delivery id', async () => {
      const { service, waMonitor } = buildService();
      const reactionMessage = vi.fn().mockResolvedValue({});
      waMonitor.waInstances[instance.instanceName] = { reactionMessage };
      vi.spyOn(service as any, 'getMessageByKeyId').mockResolvedValue({ key: targetKey });

      const body = buildReactionBody();
      await (service as any).handleReactionWebhook(instance, body);
      await (service as any).handleReactionWebhook(instance, body);

      expect(reactionMessage).toHaveBeenCalledTimes(1);
    });

    it('acknowledges without sending when the target WhatsApp key cannot be resolved', async () => {
      const { service, waMonitor } = buildService();
      const reactionMessage = vi.fn();
      waMonitor.waInstances[instance.instanceName] = { reactionMessage };
      vi.spyOn(service as any, 'getMessageByKeyId').mockResolvedValue(null);

      await expect((service as any).handleReactionWebhook(instance, buildReactionBody())).resolves.not.toThrow();
      expect(reactionMessage).not.toHaveBeenCalled();
    });

    it('acknowledges without sending when the message has no source_id yet', async () => {
      const { service, waMonitor } = buildService();
      const reactionMessage = vi.fn();
      waMonitor.waInstances[instance.instanceName] = { reactionMessage };

      await (service as any).handleReactionWebhook(instance, buildReactionBody({ source_id: undefined }));

      expect(reactionMessage).not.toHaveBeenCalled();
    });

    // The HTTP webhook route builds `instance` from the URL's :instanceName param alone
    // (see ChatwootRouter -> RouterBroker#dataValidate), so instanceId is missing until this
    // handler fills it in. Regression for the bug where getMessageByKeyId's `instanceId`
    // predicate silently matched nothing because that fill-in step was skipped.
    it('resolves instanceId from the running instance before looking up the target message', async () => {
      const { service, waMonitor } = buildService();
      const routeInstance = { instanceName: 'my-instance' } as any;
      const reactionMessage = vi.fn().mockResolvedValue({});
      waMonitor.waInstances[routeInstance.instanceName] = { reactionMessage, instanceId: 'resolved-instance-id' };
      const getMessageByKeyId = vi.spyOn(service as any, 'getMessageByKeyId').mockResolvedValue({ key: targetKey });

      await (service as any).handleReactionWebhook(routeInstance, buildReactionBody());

      expect(routeInstance.instanceId).toBe('resolved-instance-id');
      expect(getMessageByKeyId).toHaveBeenCalledWith(
        expect.objectContaining({ instanceId: 'resolved-instance-id' }),
        targetKey.id,
      );
    });
  });

  describe('inbound: WhatsApp contact reaction -> Chatwoot', () => {
    const reactionMessage = { key: { id: 'WA-KEY-2', remoteJid: '123@s.whatsapp.net', fromMe: false }, text: '👍' };

    it('calls the Chatwoot reaction endpoint and never creates a message', async () => {
      const { service } = buildService();
      vi.spyOn(service as any, 'getMessageByKeyId').mockResolvedValue({
        chatwootMessageId: 77,
        chatwootConversationId: 88,
      });
      const createMessage = vi.spyOn(service as any, 'createMessage');

      await (service as any).handleInboundContactReaction(instance, reactionMessage);

      expect(chatwootRequest).toHaveBeenCalledWith(
        expect.objectContaining({ basePath: 'https://cw.example' }),
        expect.objectContaining({
          method: 'PUT',
          url: '/api/v1/accounts/42/conversations/88/messages/77/reaction',
          body: { emoji: '👍', message_type: 'incoming' },
        }),
      );
      expect(createMessage).not.toHaveBeenCalled();
    });

    it('sends an empty emoji to remove the reaction when text is empty', async () => {
      const { service } = buildService();
      vi.spyOn(service as any, 'getMessageByKeyId').mockResolvedValue({
        chatwootMessageId: 77,
        chatwootConversationId: 88,
      });

      await (service as any).handleInboundContactReaction(instance, { ...reactionMessage, text: '' });

      expect(chatwootRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ body: { emoji: '', message_type: 'incoming' } }),
      );
    });

    it('acknowledges an unknown parent without retrying or creating a message', async () => {
      const { service } = buildService();
      vi.spyOn(service as any, 'getMessageByKeyId').mockResolvedValue(null);
      const createMessage = vi.spyOn(service as any, 'createMessage');

      await expect((service as any).handleInboundContactReaction(instance, reactionMessage)).resolves.not.toThrow();

      expect(chatwootRequest).not.toHaveBeenCalled();
      expect(createMessage).not.toHaveBeenCalled();
    });
  });

  describe('eventWhatsapp: reaction echo from a self-sent reaction (messages.upsert)', () => {
    // WhatsApp echoes back a reaction this instance itself just sent as an ordinary
    // messages.upsert event (fromMe: true) — same shape as a contact's own reaction. Relaying
    // that echo would double-count: once when the agent's reaction was created via the
    // dashboard, and again here as a phantom Contact-actor reaction on the same message.
    const buildUpsertBody = (fromMe: boolean) => ({
      key: { id: 'WA-KEY-3', remoteJid: '123@s.whatsapp.net', fromMe },
      message: {
        reactionMessage: { key: { id: 'WA-KEY-1', fromMe: false, remoteJid: '123@s.whatsapp.net' }, text: '👍' },
      },
    });

    const mockCommonDeps = (service: any) => {
      vi.spyOn(service, 'clientCw').mockResolvedValue({});
      vi.spyOn(service, 'createConversation').mockResolvedValue({ id: 1 });
      vi.spyOn(service, 'getConversationMessage').mockReturnValue(undefined);
      vi.spyOn(service as any, 'isMediaMessage').mockReturnValue(false);
      vi.spyOn(service as any, 'getAdsMessage').mockReturnValue(undefined);
      vi.spyOn(service as any, 'isInteractiveButtonMessage').mockReturnValue(false);
    };

    it('does not relay the echo of the instance own reaction to Chatwoot', async () => {
      const { service, waMonitor } = buildService();
      waMonitor.waInstances[instance.instanceName] = {};
      mockCommonDeps(service);
      const handleInboundContactReaction = vi.spyOn(service as any, 'handleInboundContactReaction');

      await service.eventWhatsapp('messages.upsert', instance, buildUpsertBody(true));

      expect(handleInboundContactReaction).not.toHaveBeenCalled();
    });

    it('still relays a genuine contact reaction (fromMe: false)', async () => {
      const { service, waMonitor } = buildService();
      waMonitor.waInstances[instance.instanceName] = {};
      mockCommonDeps(service);
      const handleInboundContactReaction = vi
        .spyOn(service as any, 'handleInboundContactReaction')
        .mockResolvedValue(undefined);

      await service.eventWhatsapp('messages.upsert', instance, buildUpsertBody(false));

      expect(handleInboundContactReaction).toHaveBeenCalledTimes(1);
    });
  });
});
