import { CacheService } from '@api/services/cache.service';
import { Logger } from '@config/logger.config';
import ChatwootClient from '@figuro/chatwoot-sdk';

const logger = new Logger('ChatwootDeliveryService');

/**
 * Guards outbound Chatwoot -> WhatsApp delivery against duplicate webhook deliveries and
 * reports permanent send failures back onto the original Chatwoot message instead of a
 * private note, so the message stays retryable and unread counts/automations stay untouched.
 */
export class ChatwootDeliveryService {
  constructor(private readonly cache: CacheService) {}

  private buildDeliveryKey(instanceName: string, chatwootMessageId: number | string, operation: string): string {
    return `chatwoot-outbound-delivery:${instanceName}:${chatwootMessageId}:${operation}`;
  }

  /**
   * Atomically claims the right to process a given (instance, chatwootMessageId, operation)
   * exactly once. A retried/duplicated Chatwoot webhook for the same message resolves to
   * `false`, so the caller can acknowledge the webhook without sending to WhatsApp again.
   */
  public async claim(
    instanceName: string,
    chatwootMessageId: number | string,
    operation: string,
    ttlSeconds = 300,
  ): Promise<boolean> {
    if (!chatwootMessageId) {
      // Without a stable message id we cannot deduplicate; fail open rather than block sends.
      return true;
    }

    return this.cache.setNX(this.buildDeliveryKey(instanceName, chatwootMessageId, operation), true, ttlSeconds);
  }

  /**
   * Marks the original Chatwoot message as failed via the authenticated Application API
   * instead of creating a private note. Keeps the message content/attachments intact so the
   * agent can retry, and never creates a second, unrelated message.
   */
  public async reportFailure(
    client: ChatwootClient,
    accountId: number,
    conversationId: number,
    chatwootMessageId: number,
    externalError: string,
  ): Promise<void> {
    if (!client || !accountId || !conversationId || !chatwootMessageId) {
      return;
    }

    try {
      await client.messages.update({
        accountId,
        conversationId,
        messageId: chatwootMessageId,
        data: { status: 'failed', external_error: externalError } as any,
      });
    } catch (error) {
      logger.error(error);
    }
  }
}
