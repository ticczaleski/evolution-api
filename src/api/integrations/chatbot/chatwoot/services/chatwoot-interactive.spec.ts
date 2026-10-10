import { describe, expect, it } from 'vitest';

import { ChatwootService } from './chatwoot.service';

const buildService = () => {
  const service = new ChatwootService(
    { waInstances: {} } as any,
    {} as any,
    {} as any,
    { get: async () => null, set: async () => null, delete: async () => 0 } as any,
  );
  return service;
};

describe('ChatwootService - parseChatwootOutgoingMessage (Interactive Messages)', () => {
  const service = buildService();
  const testChatId = '555599999999';

  describe('Standard Text Messages', () => {
    it('returns type "text" when message has no interactive attributes', () => {
      const body = {
        id: 101,
        content: 'Olá! Como posso ajudar você hoje?',
        content_type: 'text',
      };

      const result = service.parseChatwootOutgoingMessage(body, testChatId, body.content);

      expect(result.type).toBe('text');
      expect(result.textData).toBeDefined();
      expect(result.textData?.number).toBe(testChatId);
      expect(result.textData?.text).toBe('Olá! Como posso ajudar você hoje?');
      expect(result.buttonsData).toBeUndefined();
      expect(result.listData).toBeUndefined();
    });
  });

  describe('Chatwoot input_select (Single Select / Options)', () => {
    it('converts <= 3 options into native quick reply buttons', () => {
      const body = {
        id: 102,
        content: 'Você confirma o recebimento do pedido?',
        content_type: 'input_select',
        content_attributes: {
          items: [
            { title: 'Sim, recebi tudo certo', value: 'sim' },
            { title: 'Não, houve problema', value: 'nao' },
          ],
        },
      };

      const result = service.parseChatwootOutgoingMessage(body, testChatId, body.content);

      expect(result.type).toBe('buttons');
      expect(result.buttonsData).toBeDefined();
      expect(result.buttonsData?.number).toBe(testChatId);
      expect(result.buttonsData?.title).toBe('Você confirma o recebimento do pedido?');
      expect(result.buttonsData?.buttons).toHaveLength(2);
      expect(result.buttonsData?.buttons[0]).toEqual({
        type: 'reply',
        displayText: 'Sim, recebi tudo certo',
        id: 'sim',
      });
      expect(result.buttonsData?.buttons[1]).toEqual({
        type: 'reply',
        displayText: 'Não, houve problema',
        id: 'nao',
      });

      // Verify fallback text is present in case interactive dispatch fails
      expect(result.fallbackTextData?.text).toContain('Você confirma o recebimento do pedido?');
      expect(result.fallbackTextData?.text).toContain('1. Sim, recebi tudo certo');
      expect(result.fallbackTextData?.text).toContain('2. Não, houve problema');
    });

    it('converts > 3 options into native list drawer menu (SendListDto)', () => {
      const body = {
        id: 103,
        content: 'Avalie o nosso atendimento:',
        content_type: 'input_select',
        content_attributes: {
          button_text: 'Avaliar agora',
          items: [
            { title: '😃 Ótimo', value: '5', description: 'Excelente atendimento' },
            { title: '🙂 Bom', value: '4' },
            { title: '😐 Neutro', value: '3' },
            { title: '🙁 Ruim', value: '2' },
            { title: '😞 Péssimo', value: '1', description: 'Não fui atendido' },
          ],
        },
      };

      const result = service.parseChatwootOutgoingMessage(body, testChatId, body.content);

      expect(result.type).toBe('list');
      expect(result.listData).toBeDefined();
      expect(result.listData?.number).toBe(testChatId);
      expect(result.listData?.title).toBe('Avalie o nosso atendimento:');
      expect(result.listData?.buttonText).toBe('Avaliar agora');
      expect(result.listData?.sections).toHaveLength(1);

      const rows = result.listData?.sections[0].rows || [];
      expect(rows).toHaveLength(5);
      expect(rows[0]).toEqual({
        title: '😃 Ótimo',
        description: 'Excelente atendimento',
        rowId: '5',
      });
      expect(rows[4]).toEqual({
        title: '😞 Péssimo',
        description: 'Não fui atendido',
        rowId: '1',
      });

      // Verify numbered fallback
      expect(result.fallbackTextData?.text).toContain('1. 😃 Ótimo - Excelente atendimento');
      expect(result.fallbackTextData?.text).toContain('5. 😞 Péssimo - Não fui atendido');
    });
  });

  describe('Explicit content_attributes.buttons', () => {
    it('handles CTA buttons (url and call)', () => {
      const body = {
        id: 104,
        content: 'Acesse nossos canais oficiais:',
        content_attributes: {
          buttons: [
            { type: 'url', text: 'Portal CCZaleski', url: 'https://cczaleski.com.br' },
            { type: 'call', text: 'Central Telefônica', phoneNumber: '+555531880000' },
          ],
        },
      };

      const result = service.parseChatwootOutgoingMessage(body, testChatId, body.content);

      expect(result.type).toBe('buttons');
      expect(result.buttonsData?.buttons).toHaveLength(2);
      expect(result.buttonsData?.buttons[0]).toEqual({
        type: 'url',
        displayText: 'Portal CCZaleski',
        url: 'https://cczaleski.com.br',
      });
      expect(result.buttonsData?.buttons[1]).toEqual({
        type: 'call',
        displayText: 'Central Telefônica',
        phoneNumber: '+555531880000',
      });
    });

    it('handles PIX button', () => {
      const body = {
        id: 105,
        content: 'Chave PIX para pagamento:',
        content_attributes: {
          buttons: [
            {
              type: 'pix',
              name: 'Centro de Compras Zaleski',
              key: '02816301000109',
              keyType: 'cnpj',
            },
          ],
        },
      };

      const result = service.parseChatwootOutgoingMessage(body, testChatId, body.content);

      expect(result.type).toBe('buttons');
      expect(result.buttonsData?.buttons).toHaveLength(1);
      expect(result.buttonsData?.buttons[0]).toEqual({
        type: 'pix',
        name: 'Centro de Compras Zaleski',
        key: '02816301000109',
        keyType: 'cnpj',
        currency: 'BRL',
      });
    });

    it('gracefully converts > 3 reply buttons into a list drawer menu to prevent WhatsApp API errors', () => {
      const body = {
        id: 106,
        content: 'Escolha seu setor:',
        content_attributes: {
          buttons: [
            { text: 'Açougue', id: 'sec_acougue' },
            { text: 'Padaria', id: 'sec_padaria' },
            { text: 'Hortifruti', id: 'sec_horti' },
            { text: 'Bazar', id: 'sec_bazar' },
          ],
        },
      };

      const result = service.parseChatwootOutgoingMessage(body, testChatId, body.content);

      // WhatsApp limits quick reply buttons to max 3. 4 buttons must automatically become list.
      expect(result.type).toBe('list');
      expect(result.listData?.sections[0].rows).toHaveLength(4);
      expect(result.listData?.sections[0].rows[0].title).toBe('Açougue');
      expect(result.listData?.sections[0].rows[0].rowId).toBe('sec_acougue');
    });
  });

  describe('Text Commands & Block Syntax for Chatwoot Agents', () => {
    it('parses single line command /botoes with <= 3 options into buttons', () => {
      const body = {
        id: 107,
        content: '/botoes Como podemos ajudar? | Suporte TI | Dúvidas ERP | Falar com Atendente',
        content_type: 'text',
      };

      const result = service.parseChatwootOutgoingMessage(body, testChatId, body.content);

      expect(result.type).toBe('buttons');
      expect(result.buttonsData?.title).toBe('Como podemos ajudar?');
      expect(result.buttonsData?.buttons).toHaveLength(3);
      expect(result.buttonsData?.buttons[0].displayText).toBe('Suporte TI');
      expect(result.buttonsData?.buttons[1].displayText).toBe('Dúvidas ERP');
      expect(result.buttonsData?.buttons[2].displayText).toBe('Falar com Atendente');
      expect(result.fallbackTextData?.text).toContain('1. Suporte TI');
    });

    it('parses single line command /lista into list drawer menu', () => {
      const body = {
        id: 108,
        content: '/lista Menu de Serviços TI | Abertura GLPI | Consulta GLPI | Suporte PDV | Balanças',
        content_type: 'text',
      };

      const result = service.parseChatwootOutgoingMessage(body, testChatId, body.content);

      expect(result.type).toBe('list');
      expect(result.listData?.title).toBe('Menu de Serviços TI');
      expect(result.listData?.sections[0].rows).toHaveLength(4);
      expect(result.listData?.sections[0].rows[0].title).toBe('Abertura GLPI');
      expect(result.listData?.sections[0].rows[3].title).toBe('Balanças');
    });

    it('parses block syntax [botoes]...[/botoes] into buttons', () => {
      const body = {
        id: 109,
        content: `[botoes: Confirmação de Visita Técnica]
- Sim, confirmo
- Não, reagendar
[/botoes]`,
        content_type: 'text',
      };

      const result = service.parseChatwootOutgoingMessage(body, testChatId, body.content);

      expect(result.type).toBe('buttons');
      expect(result.buttonsData?.title).toBe('Confirmação de Visita Técnica');
      expect(result.buttonsData?.buttons).toHaveLength(2);
      expect(result.buttonsData?.buttons[0].displayText).toBe('Sim, confirmo');
      expect(result.buttonsData?.buttons[1].displayText).toBe('Não, reagendar');
    });

    it('parses block syntax [lista]...[/lista] with descriptions into list menu', () => {
      const body = {
        id: 110,
        content: `[lista: Menu Central da TI]
1. GLPI Chamados - Abrir ou consultar tickets
2. Suporte PDVs - Problemas em caixas e self-checkouts
3. Balanças Toledo - Calibração e impressão
4. Rede e Wi-Fi - Lentidão ou quedas
[/lista]`,
        content_type: 'text',
      };

      const result = service.parseChatwootOutgoingMessage(body, testChatId, body.content);

      expect(result.type).toBe('list');
      expect(result.listData?.title).toBe('Menu Central da TI');
      expect(result.listData?.sections[0].rows).toHaveLength(4);
      expect(result.listData?.sections[0].rows[0].title).toBe('GLPI Chamados');
      expect(result.listData?.sections[0].rows[0].description).toBe('Abrir ou consultar tickets');
      expect(result.listData?.sections[0].rows[1].title).toBe('Suporte PDVs');
    });
  });
});

