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

describe('ChatwootService - listMessage and listResponseMessage formatting', () => {
  const service = buildService();

  describe('listMessage formatting', () => {
    it('formats conversation #74 survey list message cleanly without "Unknown", "undefined", or JSON IDs', () => {
      const msg = {
        listMessage: {
          description: 'Você pode me contar como foi esse atendimento? 😊',
          sections: [
            {
              rows: [
                {
                  title: '😃 Ótimo',
                  rowId:
                    '{"button":" Ótimo","r":"1","entities":"{\\"entity\\":{\\"@class\\":\\"StringEntity\\",\\"value\\":\\"8J+YgCDDk3RpbW8=\\"}}","intent":"SOMETHING_ENCODED"}',
                },
                {
                  title: '🙂 Bom',
                  rowId:
                    '{"button":" Bom","r":"2","entities":"{\\"entity\\":{\\"@class\\":\\"StringEntity\\",\\"value\\":\\"8J+ZgiBCb20=\\"}}","intent":"SOMETHING_ENCODED"}',
                },
                {
                  title: '😐 Neutro',
                  rowId:
                    '{"button":" Neutro","r":"3","entities":"{\\"entity\\":{\\"@class\\":\\"StringEntity\\",\\"value\\":\\"8J+YkSBOZXV0cm8=\\"}}","intent":"SOMETHING_ENCODED"}',
                },
                {
                  title: '🙁 Ruim',
                  rowId:
                    '{"button":" Ruim","r":"4","entities":"{\\"entity\\":{\\"@class\\":\\"StringEntity\\",\\"value\\":\\"8J+ZgSBSdWlt\\"}}","intent":"SOMETHING_ENCODED"}',
                },
                {
                  title: '😞 Péssimo',
                  rowId:
                    '{"button":" Péssimo","r":"5","entities":"{\\"entity\\":{\\"@class\\":\\"StringEntity\\",\\"value\\":\\"8J+YoCBQw6lzc2ltbw==\\"}}","intent":"SOMETHING_ENCODED"}',
                },
              ],
            },
          ],
        },
      };

      const result = service.getConversationMessage(msg);

      expect(result).not.toContain('Unknown');
      expect(result).not.toContain('undefined');
      expect(result).not.toContain('SOMETHING_ENCODED');
      expect(result).not.toContain('{"button"');
      expect(result).not.toContain('Section 1');

      const expected = [
        'Você pode me contar como foi esse atendimento? 😊',
        '',
        '1. 😃 Ótimo',
        '2. 🙂 Bom',
        '3. 😐 Neutro',
        '4. 🙁 Ruim',
        '5. 😞 Péssimo',
      ].join('\n');

      expect(result).toBe(expected);
    });

    it('formats multi-section list with title, descriptions, and footer', () => {
      const msg = {
        listMessage: {
          title: 'Atendimento Financeiro',
          description: 'Escolha o assunto desejado:',
          footerText: 'Horário de atendimento: 08h às 18h',
          sections: [
            {
              title: 'Boletos',
              rows: [{ title: '2ª via de boleto', description: 'Emissão imediata' }, { title: 'Negociação' }],
            },
            {
              title: 'Outros',
              rows: [{ title: 'Falar com atendente' }],
            },
          ],
        },
      };

      const result = service.getConversationMessage(msg);

      expect(result).not.toContain('Unknown');
      expect(result).not.toContain('undefined');
      expect(result).toContain('*Atendimento Financeiro*');
      expect(result).toContain('Escolha o assunto desejado:');
      expect(result).toContain('*Boletos*');
      expect(result).toContain('1. 2ª via de boleto\n   _Emissão imediata_');
      expect(result).toContain('2. Negociação');
      expect(result).toContain('*Outros*');
      expect(result).toContain('3. Falar com atendente');
      expect(result).toContain('_Horário de atendimento: 08h às 18h_');
    });

    it('formats list with fallback title when both title and description are missing', () => {
      const msg = {
        listMessage: {
          sections: [
            {
              rows: [{ title: 'Opção A' }, { title: 'Opção B' }],
            },
          ],
        },
      };

      const result = service.getConversationMessage(msg);

      expect(result).not.toContain('Unknown');
      expect(result).toContain('*Menu*');
      expect(result).toContain('1. Opção A');
      expect(result).toContain('2. Opção B');
    });
  });

  describe('listResponseMessage formatting', () => {
    it('formats user response with title cleanly without headers or JSON IDs', () => {
      const msg = {
        listResponseMessage: {
          title: '😃 Ótimo',
          singleSelectReply: {
            selectedRowId: '{"button":" Ótimo","r":"1"}',
          },
        },
      };

      const result = service.getConversationMessage(msg);

      expect(result).toBe('😃 Ótimo');
      expect(result).not.toContain('Unknown');
      expect(result).not.toContain('List Response');
      expect(result).not.toContain('selectedRowId');
    });

    it('formats user response with title and description', () => {
      const msg = {
        listResponseMessage: {
          title: 'Opção 1',
          description: 'Segunda via de conta',
        },
      };

      const result = service.getConversationMessage(msg);

      expect(result).toBe('Opção 1\n_Segunda via de conta_');
      expect(result).not.toContain('Unknown');
    });

    it('recovers button title from JSON rowId when title is absent', () => {
      const msg = {
        listResponseMessage: {
          singleSelectReply: {
            selectedRowId: '{"button":"Atendimento Especial"}',
          },
        },
      };

      const result = service.getConversationMessage(msg);

      expect(result).toBe('Atendimento Especial');
      expect(result).not.toContain('{');
    });
  });
});
