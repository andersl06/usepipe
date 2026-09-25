import { describe, expect, it } from 'vitest';
import { conteudoDaPergunta, formatOfPergunta, preferencesInteractiveOf } from '../src/whatsapp/interativo.js';
import { montarCorpo } from '../src/whatsapp/real.js';

const ligado = { quickReply: true, menu: true };
const credentials = { phoneNumberId: '1', tokenAcesso: 't' };

describe('pergunta do fluxo como mensagem interativa', () => {
  it('régua da origem: até 3 botões, até 10 lista, senão texto; interruptores nascem ligados', () => {
    expect(formatOfPergunta(3, ligado)).toBe('botoes');
    expect(formatOfPergunta(4, ligado)).toBe('lista');
    expect(formatOfPergunta(11, ligado)).toBe('texto');
    expect(formatOfPergunta(2, { quickReply: false, menu: true })).toBe('lista');
    expect(formatOfPergunta(2, { quickReply: false, menu: false })).toBe('texto');
    expect(preferencesInteractiveOf(null)).toEqual(ligado);
    expect(preferencesInteractiveOf({ preferencias: { menu: false } })).toEqual({ quickReply: true, menu: false });
  });

  it('opção longa, repetida ou corpo vazio cai para texto em vez de cortar', () => {
    expect(conteudoDaPergunta({ texto: 'Oi', opcoes: ['a'.repeat(21)] }, ligado)).toBeNull();
    expect(conteudoDaPergunta({ texto: 'Oi', opcoes: ['Sim', 'Sim'] }, ligado)).toBeNull();
    expect(conteudoDaPergunta({ texto: '  ', opcoes: ['Sim'] }, ligado)).toBeNull();
    // 21 caracteres não cabem em botão, mas cabem em linha de lista (24) — só quando vira lista.
    const quatro = ['a'.repeat(22), 'b', 'c', 'd'];
    expect(conteudoDaPergunta({ texto: 'Oi', opcoes: quatro }, ligado)).toMatchObject({ formato: 'lista' });
  });

  it('corpo da Cloud API: botões de resposta e lista com uma seção', () => {
    const buttons = conteudoDaPergunta({ texto: 'Como ajudar?', opcoes: ['Financeiro', 'Suporte'] }, ligado)!;
    expect(montarCorpo({ para: '55', conteudo: buttons, credentials })).toMatchObject({
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: 'Como ajudar?' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: '1', title: 'Financeiro' } },
            { type: 'reply', reply: { id: '2', title: 'Suporte' } },
          ],
        },
      },
    });
    const lista = conteudoDaPergunta({ texto: 'Escolha', opcoes: ['a', 'b', 'c', 'd'] }, ligado)!;
    expect(montarCorpo({ para: '55', conteudo: lista, credentials })).toMatchObject({
      interactive: {
        type: 'list',
        action: { button: 'Ver opções', sections: [{ rows: [{ id: '1', title: 'a' }, {}, {}, { id: '4', title: 'd' }] }] },
      },
    });
  });
});
