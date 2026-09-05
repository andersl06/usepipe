import { describe, expect, it } from 'vitest';

import {
  MAX_CARACTERES_POR_MENSAGEM_PADRAO,
  carimboDeHora,
  corpoDaMensagem,
  montarTranscricao,
  rotuloDoAutor,
  type MensagemTranscricao,
} from './index.js';

function msg(parcial: Partial<MensagemTranscricao> & { id: string }): MensagemTranscricao {
  return {
    criadaEm: new Date('2026-03-02T14:07:00Z'),
    direcao: 'entrada',
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
  it('usa o nome quando tem, e o papel quando não tem', () => {
    expect(rotuloDoAutor(msg({ id: 'a', autorTipo: 'contato', autorNome: 'Marcos' }))).toBe(
      'Marcos',
    );
    expect(rotuloDoAutor(msg({ id: 'a', autorTipo: 'contato' }))).toBe('Cliente');
    expect(rotuloDoAutor(msg({ id: 'a', autorTipo: 'atendente' }))).toBe('Atendente');
    expect(rotuloDoAutor(msg({ id: 'a', autorTipo: 'bot' }))).toBe('Bot');
    // Sistema nunca herda nome de gente: é o próprio produto falando.
    expect(rotuloDoAutor(msg({ id: 'a', autorTipo: 'sistema', autorNome: 'Rafael' }))).toBe(
      'Sistema',
    );
  });
});

describe('corpo da mensagem', () => {
  it('usa o texto transcrito do áudio quando existe', () => {
    const corpo = corpoDaMensagem(
      msg({
        id: 'a',
        tipo: 'audio',
        conteudo: null,
        anexo: { duracaoSeg: 18, transcricao: 'bom dia, queria a segunda via' },
      }),
    );
    expect(corpo).toBe('(áudio de 18s, transcrito) bom dia, queria a segunda via');
  });

  it('marca áudio sem transcrição em vez de deixá-lo virar silêncio', () => {
    const corpo = corpoDaMensagem(
      msg({ id: 'a', tipo: 'audio', conteudo: null, anexo: { duracaoSeg: 34 } }),
    );
    expect(corpo).toContain('NÃO TRANSCRITO');
    expect(corpo).toContain('34s');
  });

  it('diz quando nem a duração do áudio veio', () => {
    expect(corpoDaMensagem(msg({ id: 'a', tipo: 'audio', conteudo: null }))).toContain(
      'duração desconhecida',
    );
  });

  it('descreve mídia com nome de arquivo e legenda', () => {
    expect(
      corpoDaMensagem(
        msg({
          id: 'a',
          tipo: 'imagem',
          conteudo: 'olha como chegou',
          anexo: { nomeArquivo: 'tela.jpg' },
        }),
      ),
    ).toBe('(imagem: tela.jpg) olha como chegou');
    expect(corpoDaMensagem(msg({ id: 'a', tipo: 'documento', conteudo: null }))).toBe(
      '(documento, sem legenda)',
    );
  });

  it('não deixa mensagem vazia sumir', () => {
    expect(corpoDaMensagem(msg({ id: 'a', conteudo: '   ' }))).toBe('(mensagem vazia)');
  });
});

describe('montagem da transcrição', () => {
  it('ordena por tempo, numera e indexa cada linha', () => {
    const t = montarTranscricao([
      msg({ id: 'b', criadaEm: new Date('2026-03-02T14:10:00Z'), conteudo: 'segunda' }),
      msg({ id: 'a', criadaEm: new Date('2026-03-02T14:05:00Z'), conteudo: 'primeira' }),
    ]);
    expect(t.linhas.map((l) => l.mensagemId)).toEqual(['a', 'b']);
    expect(t.indice).toEqual({ m1: 'a', m2: 'b' });
    expect(t.texto.split('\n')[0]).toBe('[m1] 02/03 14:05 Cliente: primeira');
    expect(t.truncada).toBe(false);
  });

  it('marca nota interna', () => {
    const t = montarTranscricao([
      msg({
        id: 'a',
        direcao: 'interna',
        autorTipo: 'atendente',
        autorNome: 'Diego',
        conteudo: 'abri o RMA',
      }),
    ]);
    expect(t.texto).toBe('[m1] 02/03 14:07 Diego (nota interna): abri o RMA');
  });

  it('colapsa quebras de linha para a transcrição continuar uma linha por mensagem', () => {
    const t = montarTranscricao([msg({ id: 'a', conteudo: 'linha um\nlinha dois' })]);
    expect(t.texto.split('\n')).toHaveLength(1);
    expect(t.texto).toContain('linha um linha dois');
  });

  it('corta mensagem gigante individualmente, sem estourar a linha', () => {
    const t = montarTranscricao([msg({ id: 'a', conteudo: 'x'.repeat(9_000) })]);
    expect(t.texto.length).toBeLessThan(MAX_CARACTERES_POR_MENSAGEM_PADRAO + 100);
    expect(t.texto.endsWith('…(cortado)')).toBe(true);
  });
});

describe('truncamento', () => {
  const muitas = Array.from({ length: 200 }, (_, i) =>
    msg({
      id: `m${i}`,
      criadaEm: new Date(Date.UTC(2026, 2, 2, 10, i)),
      conteudo: `mensagem número ${i} ${'z'.repeat(200)}`,
    }),
  );

  it('não trunca o que cabe', () => {
    const t = montarTranscricao(muitas.slice(0, 3));
    expect(t.truncada).toBe(false);
    expect(t.mensagensOmitidas).toBe(0);
    expect(t.linhas).toHaveLength(3);
  });

  it('preserva início e fim, que é onde está a informação', () => {
    const t = montarTranscricao(muitas, { maxCaracteres: 4_000 });
    expect(t.truncada).toBe(true);
    expect(t.totalMensagens).toBe(200);
    expect(t.mensagensOmitidas).toBeGreaterThan(0);
    // A primeira e a última mensagem sobrevivem sempre.
    expect(t.linhas[0]!.mensagemId).toBe('m0');
    expect(t.linhas.at(-1)!.mensagemId).toBe('m199');
    expect(t.texto).toContain(
      `[… ${t.mensagensOmitidas} mensagens omitidas do meio da conversa …]`,
    );
  });

  it('respeita o orçamento de caracteres com folga da marca de corte', () => {
    const t = montarTranscricao(muitas, { maxCaracteres: 4_000 });
    expect(t.texto.length).toBeLessThanOrEqual(4_000 + 100);
  });

  it('reserva ao fim mais espaço que ao início: o desfecho pesa mais', () => {
    const t = montarTranscricao(muitas, { maxCaracteres: 4_000, fracaoInicio: 0.4 });
    const marca = t.texto.split('\n').findIndex((l) => l.startsWith('[…'));
    const doInicio = marca;
    const doFim = t.linhas.length - marca;
    expect(doFim).toBeGreaterThan(doInicio);
  });

  it('as contas fecham: início + fim + omitidas = total', () => {
    const t = montarTranscricao(muitas, { maxCaracteres: 4_000 });
    expect(t.linhas.length + t.mensagensOmitidas).toBe(t.totalMensagens);
  });

  it('só indexa o que sobrou — rótulo de mensagem omitida não pode ser citado como evidência', () => {
    const t = montarTranscricao(muitas, { maxCaracteres: 4_000 });
    expect(Object.keys(t.indice)).toHaveLength(t.linhas.length);
    for (const linha of t.linhas) expect(t.indice[linha.rotulo]).toBe(linha.mensagemId);
  });

  it('conversa de duas mensagens nunca é truncada, por maior que seja', () => {
    const t = montarTranscricao(muitas.slice(0, 2), { maxCaracteres: 10 });
    expect(t.truncada).toBe(false);
    expect(t.linhas).toHaveLength(2);
  });
});
