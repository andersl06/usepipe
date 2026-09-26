import { describe, expect, it } from 'vitest';
import { POLICY_MEDIA_DEFAULT, validateMedia } from '../src/whatsapp/media.js';
import {
  ParameterMissingError,
  assembleComponents,
  positionOfVariable,
  positionsOfBody,
} from '../src/whatsapp/template.js';
import { esperaMs } from '../src/delivery.js';

const MB = 1024 * 1024;

describe('Validate media types and sizes against Blip rules ?1.6', () => {
  const casos = [
    { nome: 'jpeg passa', midia: { tipo: 'imagem', mime: 'image/jpeg', bytes: 900_000 }, erro: null },
    { nome: 'mime com charset passa', midia: { tipo: 'imagem', mime: 'image/png; charset=binary', bytes: 10 }, erro: null },
    { nome: 'bmp não está na lista', midia: { tipo: 'imagem', mime: 'image/bmp', bytes: 10 }, erro: 'midia_formato_recusado' },
    { nome: 'executável não é documento', midia: { tipo: 'documento', mime: 'application/x-msdownload', bytes: 10 }, erro: 'midia_formato_recusado' },
    { nome: 'pdf de 99 MB passa', midia: { tipo: 'documento', mime: 'application/pdf', bytes: 99 * MB }, erro: null },
    { nome: 'pdf de 101 MB estoura', midia: { tipo: 'documento', mime: 'application/pdf', bytes: 101 * MB }, erro: 'midia_grande_demais' },
    { nome: 'vídeo de 17 MB estoura', midia: { tipo: 'video', mime: 'video/mp4', bytes: 17 * MB }, erro: 'midia_grande_demais' },
    { nome: 'áudio de 15 MB passa', midia: { tipo: 'audio', mime: 'audio/ogg', bytes: 15 * MB }, erro: null },
    // Blip documents no image size ceiling, and the research rule is not to guess one.
    { nome: 'imagem grande passa por falta de limite documentado', midia: { tipo: 'imagem', mime: 'image/png', bytes: 500 * MB }, erro: null },
  ] as const;

  for (const caso of casos) {
    it(caso.nome, () => {
      const falha = validateMedia(caso.midia);
      expect(falha?.codigo ?? null).toBe(caso.erro);
    });
  }

  it('a política é parâmetro, não constante fechada', () => {
    const restrita = {
      formatos: { ...POLICY_MEDIA_DEFAULT.formatos, imagem: ['image/png'] },
      tamanhoMaximoBytes: POLICY_MEDIA_DEFAULT.tamanhoMaximoBytes,
    };
    expect(validateMedia({ tipo: 'imagem', mime: 'image/jpeg', bytes: 1 }, restrita)?.codigo).toBe(
      'midia_formato_recusado',
    );
  });
});

describe('Shift body parameter positions when a template has header media', () => {
  const withoutMedia = {
    nome: 'aviso',
    idioma: 'pt_BR',
    cabecalhoTipo: 'nenhum',
    variaveis: ['nome', 'protocolo'],
  } as const;

  const withMedia = { ...withoutMedia, cabecalhoTipo: 'imagem' } as const;

  it('Keep `{{1}}` at position one without header media', () => {
    expect(positionOfVariable(1, 'nenhum')).toBe(1);
    expect(positionOfVariable(2, 'nenhum')).toBe(2);
    expect(positionOfVariable(1, 'texto')).toBe(1);
  });

  it('Offset body parameter positions by one for a media header', () => {
    expect(positionOfVariable(1, 'imagem')).toBe(2);
    expect(positionOfVariable(2, 'video')).toBe(3);
    expect(positionOfVariable(1, 'documento')).toBe(2);
  });

  it('Map each body variable to its expected parameter position', () => {
    expect([...positionsOfBody(withoutMedia)]).toEqual([
      [1, 'nome'],
      [2, 'protocolo'],
    ]);
    expect([...positionsOfBody(withMedia)]).toEqual([
      [2, 'nome'],
      [3, 'protocolo'],
    ]);
  });

  it('Build template components without header media', () => {
    expect(assembleComponents(withoutMedia, { '1': 'Ana', '2': 'A-42' })).toEqual([
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Ana' },
          { type: 'text', text: 'A-42' },
        ],
      },
    ]);
  });

  it('Put header media in position one and shift body parameters', () => {
    expect(
      assembleComponents(withMedia, { '1': 'https://cdn/x.png', '2': 'Ana', '3': 'A-42' }),
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

  it('Reject unshifted parameter numbers when header media occupies position one', () => {
    // This is the documented error: the operator numbers body values 1 and 2, but media takes
    // position 1, so the client could receive a protocol number instead of a name. Here it throws.
    expect(() => assembleComponents(withMedia, { '1': 'Ana', '2': 'A-42' })).toThrow(
      ParameterMissingError,
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
