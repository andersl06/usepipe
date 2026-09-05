import { describe, expect, it } from 'vitest';
import { POLITICA_MIDIA_PADRAO, validarMidia } from '../src/whatsapp/midia.js';
import {
  ParametroFaltandoErro,
  montarComponentes,
  posicaoDeVariavel,
  posicoesDoCorpo,
} from '../src/whatsapp/template.js';
import { esperaMs } from '../src/entrega.js';

const MB = 1024 * 1024;

describe('validação de mídia (regras-blip §1.6)', () => {
  const casos = [
    { nome: 'jpeg passa', midia: { tipo: 'imagem', mime: 'image/jpeg', bytes: 900_000 }, erro: null },
    { nome: 'mime com charset passa', midia: { tipo: 'imagem', mime: 'image/png; charset=binary', bytes: 10 }, erro: null },
    { nome: 'bmp não está na lista', midia: { tipo: 'imagem', mime: 'image/bmp', bytes: 10 }, erro: 'midia_formato_recusado' },
    { nome: 'executável não é documento', midia: { tipo: 'documento', mime: 'application/x-msdownload', bytes: 10 }, erro: 'midia_formato_recusado' },
    { nome: 'pdf de 99 MB passa', midia: { tipo: 'documento', mime: 'application/pdf', bytes: 99 * MB }, erro: null },
    { nome: 'pdf de 101 MB estoura', midia: { tipo: 'documento', mime: 'application/pdf', bytes: 101 * MB }, erro: 'midia_grande_demais' },
    { nome: 'vídeo de 17 MB estoura', midia: { tipo: 'video', mime: 'video/mp4', bytes: 17 * MB }, erro: 'midia_grande_demais' },
    { nome: 'áudio de 15 MB passa', midia: { tipo: 'audio', mime: 'audio/ogg', bytes: 15 * MB }, erro: null },
    // Imagem não tem teto documentado na Blip, e a regra do levantamento é não estimar.
    { nome: 'imagem grande passa por falta de limite documentado', midia: { tipo: 'imagem', mime: 'image/png', bytes: 500 * MB }, erro: null },
  ] as const;

  for (const caso of casos) {
    it(caso.nome, () => {
      const falha = validarMidia(caso.midia);
      expect(falha?.codigo ?? null).toBe(caso.erro);
    });
  }

  it('a política é parâmetro, não constante fechada', () => {
    const restrita = {
      formatos: { ...POLITICA_MIDIA_PADRAO.formatos, imagem: ['image/png'] },
      tamanhoMaximoBytes: POLITICA_MIDIA_PADRAO.tamanhoMaximoBytes,
    };
    expect(validarMidia({ tipo: 'imagem', mime: 'image/jpeg', bytes: 1 }, restrita)?.codigo).toBe(
      'midia_formato_recusado',
    );
  });
});

describe('deslocamento de parâmetro por mídia no cabeçalho (regras-blip §1.4)', () => {
  const semMidia = {
    nome: 'aviso',
    idioma: 'pt_BR',
    cabecalhoTipo: 'nenhum',
    variaveis: ['nome', 'protocolo'],
  } as const;

  const comMidia = { ...semMidia, cabecalhoTipo: 'imagem' } as const;

  it('sem mídia, {{1}} é a posição 1', () => {
    expect(posicaoDeVariavel(1, 'nenhum')).toBe(1);
    expect(posicaoDeVariavel(2, 'nenhum')).toBe(2);
    expect(posicaoDeVariavel(1, 'texto')).toBe(1);
  });

  it('com mídia no cabeçalho, tudo desliza +1', () => {
    expect(posicaoDeVariavel(1, 'imagem')).toBe(2);
    expect(posicaoDeVariavel(2, 'video')).toBe(3);
    expect(posicaoDeVariavel(1, 'documento')).toBe(2);
  });

  it('o mapa de posições mostra onde cada variável vai', () => {
    expect([...posicoesDoCorpo(semMidia)]).toEqual([
      [1, 'nome'],
      [2, 'protocolo'],
    ]);
    expect([...posicoesDoCorpo(comMidia)]).toEqual([
      [2, 'nome'],
      [3, 'protocolo'],
    ]);
  });

  it('monta os componentes sem mídia', () => {
    expect(montarComponentes(semMidia, { '1': 'Ana', '2': 'A-42' })).toEqual([
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Ana' },
          { type: 'text', text: 'A-42' },
        ],
      },
    ]);
  });

  it('monta os componentes com mídia na posição 1 e o corpo deslocado', () => {
    expect(
      montarComponentes(comMidia, { '1': 'https://cdn/x.png', '2': 'Ana', '3': 'A-42' }),
    ).toEqual([
      { type: 'header', parameters: [{ type: 'image', image: { link: 'https://cdn/x.png' } }] },
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Ana' },
          { type: 'text', text: 'A-42' },
        ],
      },
    ]);
  });

  it('numerar como se não houvesse mídia falha alto, e não em silêncio', () => {
    // Este é o erro que a pesquisa descreve: o operador numera 1 e 2, a mídia rouba
    // o 1, e o cliente recebe o protocolo no lugar do nome. Aqui vira exceção.
    expect(() => montarComponentes(comMidia, { '1': 'Ana', '2': 'A-42' })).toThrow(
      ParametroFaltandoErro,
    );
  });
});

describe('espera crescente da retentativa', () => {
  it('cresce a cada tentativa e respeita o teto', () => {
    const semSorteio = () => 0.5;
    const esperas = [1, 2, 3, 4, 5].map((t) => esperaMs(t, semSorteio));
    for (let i = 1; i < esperas.length; i += 1) {
      expect(esperas[i]).toBeGreaterThanOrEqual(esperas[i - 1] as number);
    }
    expect(esperaMs(1, semSorteio)).toBe(5_000);
    expect(esperaMs(2, semSorteio)).toBe(10_000);
    expect(esperaMs(40, semSorteio)).toBe(15 * 60_000);
  });
});
