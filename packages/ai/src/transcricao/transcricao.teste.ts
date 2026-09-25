import { describe, expect, it } from 'vitest';

import {
  MAX_CARACTERES_BY_MESSAGE_DEFAULT,
  carimboDeHora,
  messageCorpo,
  montarTranscription,
  rotuloDoAutor,
  type MessageTranscription,
} from './index.js';

function msg(parcial: Partial<MessageTranscription> & { id: string }): MessageTranscription {
  return {
    criadaEm: new Date('2026-03-02T14:07:00Z'),
    direction: 'entrada',
    autorTipo: 'contato',
    tipo: 'texto',
    conteudo: 'oi',
    ...parcial,
  };
}

describe('carimbo de hora', () => {
  it('sai em dd/mm HH:MM e em UTC, sem fuso implícito', () => {
    expect(carimboDeHora(new Date('2026-03-02T14:07:33Z'))).toBe('02/03 14:07');
    expect(carimboDeHora(new Date('2026-12-31T23:59:00Z'))).toBe('31/12 23:59');
  });
});

describe('quem falou', () => {
  it('uses the name when there is one, and the role when there is not', () => {
    expect(rotuloDoAutor(msg({ id: 'a', autorTipo: 'contato', autorNome: 'Marcos' }))).toBe(
      'Marcos',
    );
    expect(rotuloDoAutor(msg({ id: 'a', autorTipo: 'contato' }))).toBe('Cliente');
    expect(rotuloDoAutor(msg({ id: 'a', autorTipo: 'agent' }))).toBe('Atendente');
    expect(rotuloDoAutor(msg({ id: 'a', autorTipo: 'bot' }))).toBe('Bot');
    // Sistema nunca herda nome de gente: é o próprio produto falando.
    expect(rotuloDoAutor(msg({ id: 'a', autorTipo: 'sistema', autorNome: 'Rafael' }))).toBe(
      'Sistema',
    );
  });
});

describe('message body', () => {
  it('usa o texto transcrito do áudio quando existe', () => {
    const corpo = messageCorpo(
      msg({
        id: 'a',
        tipo: 'audio',
        conteudo: null,
        attachment: { durationSeg: 18, transcription: 'bom dia, queria a segunda via' },
      }),
    );
    expect(corpo).toBe('(áudio de 18s, transcrito) bom dia, queria a segunda via');
  });

  it('flags audio without a transcript instead of letting it turn into silence', () => {
    const corpo = messageCorpo(
      msg({ id: 'a', tipo: 'audio', conteudo: null, attachment: { durationSeg: 34 } }),
    );
    expect(corpo).toContain('NÃO TRANSCRITO');
    expect(corpo).toContain('34s');
  });

  it('reports when even the audio duration is missing', () => {
    expect(messageCorpo(msg({ id: 'a', tipo: 'audio', conteudo: null }))).toContain(
      'duração desconhecida',
    );
  });

  it('describes media with file name and caption', () => {
    expect(
      messageCorpo(
        msg({
          id: 'a',
          tipo: 'imagem',
          conteudo: 'olha como chegou',
          attachment: { nameFile: 'tela.jpg' },
        }),
      ),
    ).toBe('(imagem: tela.jpg) olha como chegou');
    expect(messageCorpo(msg({ id: 'a', tipo: 'documento', conteudo: null }))).toBe(
      '(documento, sem legenda)',
    );
  });

  it('does not let an empty message disappear', () => {
    expect(messageCorpo(msg({ id: 'a', conteudo: '   ' }))).toBe('(mensagem vazia)');
  });
});

describe('transcript assembly', () => {
  it('sorts by time, numbers and indexes each line', () => {
    const t = montarTranscription([
      msg({ id: 'b', criadaEm: new Date('2026-03-02T14:10:00Z'), conteudo: 'segunda' }),
      msg({ id: 'a', criadaEm: new Date('2026-03-02T14:05:00Z'), conteudo: 'primeira' }),
    ]);
    expect(t.linhas.map((l) => l.messageId)).toEqual(['a', 'b']);
    expect(t.indice).toEqual({ m1: 'a', m2: 'b' });
    expect(t.texto.split('\n')[0]).toBe('[m1] 02/03 14:05 Cliente: primeira');
    expect(t.truncada).toBe(false);
  });

  it('marca nota interna', () => {
    const t = montarTranscription([
      msg({
        id: 'a',
        direction: 'interna',
        autorTipo: 'agent',
        autorNome: 'Diego',
        conteudo: 'abri o RMA',
      }),
    ]);
    expect(t.texto).toBe('[m1] 02/03 14:07 Diego (nota interna): abri o RMA');
  });

  it('collapses line breaks so the transcript stays one line per message', () => {
    const t = montarTranscription([msg({ id: 'a', conteudo: 'linha um\nlinha dois' })]);
    expect(t.texto.split('\n')).toHaveLength(1);
    expect(t.texto).toContain('linha um linha dois');
  });

  it('trims a giant message individually, without overflowing the line', () => {
    const t = montarTranscription([msg({ id: 'a', conteudo: 'x'.repeat(9_000) })]);
    expect(t.texto.length).toBeLessThan(MAX_CARACTERES_BY_MESSAGE_DEFAULT + 100);
    expect(t.texto.endsWith('…(cortado)')).toBe(true);
  });
});

describe('truncation', () => {
  const muitas = Array.from({ length: 200 }, (_, i) =>
    msg({
      id: `m${i}`,
      criadaEm: new Date(Date.UTC(2026, 2, 2, 10, i)),
      conteudo: `mensagem número ${i} ${'z'.repeat(200)}`,
    }),
  );

  it('não trunca o que cabe', () => {
    const t = montarTranscription(muitas.slice(0, 3));
    expect(t.truncada).toBe(false);
    expect(t.messagesOmitidas).toBe(0);
    expect(t.linhas).toHaveLength(3);
  });

  it('preserves the start and end, where the information is', () => {
    const t = montarTranscription(muitas, { maxCaracteres: 4_000 });
    expect(t.truncada).toBe(true);
    expect(t.totalMessages).toBe(200);
    expect(t.messagesOmitidas).toBeGreaterThan(0);
    // A primeira e a última mensagem sobrevivem sempre.
    expect(t.linhas[0]!.messageId).toBe('m0');
    expect(t.linhas.at(-1)!.messageId).toBe('m199');
    expect(t.texto).toContain(
      `[… ${t.messagesOmitidas} mensagens omitidas do meio da conversa …]`,
    );
  });

  it('respects the character budget with headroom from the cutoff marker', () => {
    const t = montarTranscription(muitas, { maxCaracteres: 4_000 });
    expect(t.texto.length).toBeLessThanOrEqual(4_000 + 100);
  });

  it('reserva ao fim mais espaço que ao início: o desfecho pesa mais', () => {
    const t = montarTranscription(muitas, { maxCaracteres: 4_000, fractionInicio: 0.4 });
    const marca = t.texto.split('\n').findIndex((l) => l.startsWith('[…'));
    const doInicio = marca;
    const doFim = t.linhas.length - marca;
    expect(doFim).toBeGreaterThan(doInicio);
  });

  it('the counts add up: start + end + omitted = total', () => {
    const t = montarTranscription(muitas, { maxCaracteres: 4_000 });
    expect(t.linhas.length + t.messagesOmitidas).toBe(t.totalMessages);
  });

  it('only indexes what remains — an omitted message\'s label cannot be cited as evidence', () => {
    const t = montarTranscription(muitas, { maxCaracteres: 4_000 });
    expect(Object.keys(t.indice)).toHaveLength(t.linhas.length);
    for (const linha of t.linhas) expect(t.indice[linha.rotulo]).toBe(linha.messageId);
  });

  it('a two-message conversation is never truncated, no matter how large', () => {
    const t = montarTranscription(muitas.slice(0, 2), { maxCaracteres: 10 });
    expect(t.truncada).toBe(false);
    expect(t.linhas).toHaveLength(2);
  });
});
