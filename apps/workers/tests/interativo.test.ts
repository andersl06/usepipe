import { describe, expect, it } from 'vitest';
import { conteudoDaPergunta, formatOfQuestion, preferencesInteractiveOf } from '../src/whatsapp/interativo.js';
import { montarCorpo } from '../src/whatsapp/real.js';

const ligado = { quickReply: true, menu: true };
const credentials = { phoneNumberId: '1', tokenAccess: 't' };

describe('Turn flow questions into interactive messages', () => {
  it('Choose buttons for up to three options, a list for up to ten, and text otherwise', () => {
    expect(formatOfQuestion(3, ligado)).toBe('botoes');
    expect(formatOfQuestion(4, ligado)).toBe('lista');
    expect(formatOfQuestion(11, ligado)).toBe('texto');
    expect(formatOfQuestion(2, { quickReply: false, menu: true })).toBe('lista');
    expect(formatOfQuestion(2, { quickReply: false, menu: false })).toBe('texto');
    expect(preferencesInteractiveOf(null)).toEqual(ligado);
    expect(preferencesInteractiveOf({ preferencias: { menu: false } })).toEqual({ quickReply: true, menu: false });
  });

  it('Fall back to text for long or duplicate options or an empty question', () => {
    expect(conteudoDaPergunta({ texto: 'Oi', opcoes: ['a'.repeat(21)] }, ligado)).toBeNull();
    expect(conteudoDaPergunta({ texto: 'Oi', opcoes: ['Sim', 'Sim'] }, ligado)).toBeNull();
    expect(conteudoDaPergunta({ texto: '  ', opcoes: ['Sim'] }, ligado)).toBeNull();
    // A 21-character option cannot fit a button but can fit a list row (24); only when rendered as a list.
    const quatro = ['a'.repeat(22), 'b', 'c', 'd'];
    expect(conteudoDaPergunta({ texto: 'Oi', opcoes: quatro }, ligado)).toMatchObject({ format: 'lista' });
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
