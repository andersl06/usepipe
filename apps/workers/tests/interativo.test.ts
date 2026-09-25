import { describe, expect, it } from 'vitest';
import { conteudoDaPergunta, formatOfPergunta, preferencesInteractiveOf } from '../src/whatsapp/interativo.js';
import { montarCorpo } from '../src/whatsapp/real.js';

const ligado = { quickReply: true, menu: true };
const credentials = { phoneNumberId: '1', tokenAcesso: 't' };

describe('Turn flow questions into interactive messages', () => {
  it('Choose buttons for up to three options, a list for up to ten, and text otherwise', () => {
    expect(formatOfPergunta(3, ligado)).toBe('botoes');
    expect(formatOfPergunta(4, ligado)).toBe('lista');
    expect(formatOfPergunta(11, ligado)).toBe('texto');
    expect(formatOfPergunta(2, { quickReply: false, menu: true })).toBe('lista');
    expect(formatOfPergunta(2, { quickReply: false, menu: false })).toBe('texto');
    expect(preferencesInteractiveOf(null)).toEqual(ligado);
    expect(preferencesInteractiveOf({ preferencias: { menu: false } })).toEqual({ quickReply: true, menu: false });
  });

  it('Fall back to text for long or duplicate options or an empty question', () => {
    expect(conteudoDaPergunta({ texto: 'Oi', opcoes: ['a'.repeat(21)] }, ligado)).toBeNull();
    expect(conteudoDaPergunta({ texto: 'Oi', opcoes: ['Sim', 'Sim'] }, ligado)).toBeNull();
    expect(conteudoDaPergunta({ texto: '  ', opcoes: ['Sim'] }, ligado)).toBeNull();
    // 21 caracteres não cabem em botão, mas cabem em linha de lista (24) — só quando vira lista.
    const quatro = ['a'.repeat(22), 'b', 'c', 'd'];
    expect(conteudoDaPergunta({ texto: 'Oi', opcoes: quatro }, ligado)).toMatchObject({ formato: 'lista' });
  });

  it('Build Cloud API reply buttons and a single-section list', () => {
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
