import { describe, expect, it } from 'vitest';
import { createInbound } from './context.js';
import type { Context, OutputMessage } from './context.js';
import {
  converterDoEditor,
  ehExportDoEditor,
  blipReadFlow,
  importReport,
  engineContentErrors,
  CONTEUDOS_SUPORTADOS,
} from './editor.js';
import type { ExportDoEditor } from './editor.js';
import { processInbound } from './manager.js';
import { validateFlow, flowErrors } from './modelos.js';
import type { FlowBlip } from './modelos.js';
import fixture from './fixtures/editor-sintetico.json' with { type: 'json' };

/** Synthetic fixture in Builder editor format; contains no customer flow. */
const exportado = fixture as unknown as ExportDoEditor;
const copia = (): ExportDoEditor => JSON.parse(JSON.stringify(exportado)) as ExportDoEditor;

describe('importador do export do editor da Blip', () => {
  const flow = converterDoEditor(exportado, 'f1');
  const state = (id: string) => flow.states.find((s) => s.id === id)!;

  it('recognizes both the editor\'s export and the published flow', () => {
    expect(ehExportDoEditor(exportado)).toBe(true);
    expect(ehExportDoEditor({ settings: { flow: flow } })).toBe(false);
  });

  it('converts to the published format, and the result passes the engine\'s validation', () => {
    expect(flow.states).toHaveLength(7);
    expect(() => validateFlow(flow)).not.toThrow();
  });

  it('the entry action comes before the content, and input becomes `input`', () => {
    expect(state('boas-vindas').inputActions!.map((a) => a.type)).toEqual([
      'TrackEvent',
      'SendMessage',
      'SendMessage',
    ]);
    expect(state('boas-vindas').input).toEqual({ bypass: false, variable: 'nome' });
  });

  it('outputs with a condition in order, and the default output last, without a condition', () => {
    expect(state('menu').outputs).toEqual([
      {
        order: 0,
        stateId: 'financeiro',
        conditions: [{ source: 'input', comparison: 'equals', values: ['1', 'Financeiro'] }],
      },
      {
        order: 1,
        stateId: 'desk:suporte',
        conditions: [{ source: 'input', comparison: 'equals', values: ['2', 'Suporte'] }],
      },
      { order: 2, stateId: 'nao-entendi' },
    ]);
  });

  it('an output with no destination (a freshly created attendance block) does not become a transition', () => {
    const e = copia();
    const desk = e.flow['desk:suporte']!;
    desk.$conditionOutputs = [
      { $isDeskOutput: true, conditions: [{ source: 'context', variable: 'x', values: ['1'] }] },
      { stateId: '', conditions: [] },
      ...desk.$conditionOutputs!,
    ];
    const convertido = converterDoEditor(e, 'f1');
    const saidas = convertido.states.find((s) => s.id === 'desk:suporte')!.outputs!;
    expect(saidas.map((s) => s.stateId)).toEqual(['pos-atendimento', 'nao-entendi', 'onboarding']);
    expect(saidas.map((s) => s.order)).toEqual([0, 1, 2]);
    expect(() => validateFlow(convertido)).not.toThrow();
  });

  it('as chaves do editor ($invalid, $cardContent, $connId…) não passam, e $title vira name', () => {
    const texto = JSON.stringify(flow);
    for (const key of [
      '$invalid',
      '$cardContent',
      '$connId',
      '$typeOfContent',
      'typeOfStateId',
    ]) {
      expect(texto).not.toContain(key);
    }
    expect(state('menu')['name']).toBe('Menu');
    expect(state('menu').outputActions![0]).toMatchObject({
      id: 's1',
      $title: 'Guarda a opção',
      type: 'SetVariable',
    });
  });

  it('the published version is read as-is (identity), only with the importer\'s id', () => {
    const publicado: FlowBlip = { id: 'outro', states: flow.states };
    expect(blipReadFlow({ settings: { flow: publicado } }, 'meu').states).toBe(flow.states);
    expect(blipReadFlow(publicado, 'meu').id).toBe('meu');
    expect(() => blipReadFlow({ nada: 1 }, 'x')).toThrow('não é um fluxo da Blip');
  });

  it('report: the synthetic flow has nothing outside of support', () => {
    const r = importReport(flow);
    expect(r.estados).toBe(7);
    expect(r.saidas).toBe(11);
    expect(r.naoSuportado).toEqual({});
    expect(r.semEfeito).toEqual({
      'conteudo:application/vnd.lime.chatstate+json': 1,
      'acao:LeavingFromDesk': 1,
    });
    expect(r.actions['SendMessage']).toBe(6);
  });

  it('report: lists by type what Pipe does not execute, without discarding anything', () => {
    const e = copia();
    const menu = e.flow['menu']!;
    menu.$enteringCustomActions = [
      { type: 'TrackContactsJourney', settings: { stepName: 'x' } },
      { type: 'ProcessHttp', settings: { uri: 'https://exemplo.invalido', method: 'GET' } },
      { type: 'ProcessHttp', settings: { uri: 'https://exemplo.invalido', method: 'POST' } },
    ];
    menu.$contentActions![1]!.input!['expiration'] = '00:10:00';
    menu.$contentActions!.unshift({
      action: {
        type: 'SendMessage',
        settings: { type: 'text/plain', content: 'Hoje é {{calendar.date}}' },
      },
    });
    menu.$contentActions!.unshift({
      action: { type: 'SendRawMessage', settings: { type: 'application/json', rawContent: '{}' } },
    });
    const convertido = converterDoEditor(e, 'f1');
    expect(importReport(convertido).naoSuportado).toEqual({
      'acao:TrackContactsJourney': 1,
      'conteudo:application/json': 1,
      'entrada:expiracao': 1,
      'variavel:calendar': 1,
    });
    // Unsupported content stays in the flow; conversion silently drops nothing.
    expect(
      convertido.states.find((s) => s.id === 'menu')!.inputActions!.map((a) => a.type),
    ).toEqual([
      'TrackContactsJourney',
      'ProcessHttp',
      'ProcessHttp',
      'SendRawMessage',
      'SendMessage',
      'SendMessage',
    ]);
  });
});

describe('the imported flow running in the engine', () => {
  const flow = converterDoEditor(exportado, 'f1');
  const variables: Record<string, string> = {};
  const enviadas: OutputMessage[] = [];
  const attendances: unknown[] = [];

  const login = async (conteudo: unknown, tipo = 'text/plain') => {
    enviadas.length = 0;
    const context: Context = {
      user: 'contato-1',
      flow,
      inbound: createInbound({ id: String(Math.random()), tipo, conteudo }),
      variables,
      inboundContext: new Map(),
      services: {
        send: async (m) => void enviadas.push(m),
        forwardForAttendance: async (p) => (attendances.push(p), { id: 'conversa-1' }),
        registerEvent: async () => {},
      },
    };
    await processInbound(context);
    return enviadas
      .filter((m) => m.tipo !== 'application/vnd.lime.chatstate+json')
      .map((m) => m.conteudo);
  };

  it('hi -> asks for the name; name -> menu with the variable; 2 -> attendance with the context kept', async () => {
    expect(await login('oi')).toEqual(['Olá! Qual é o seu nome?']);
    const menu = await login('Ana');
    expect(menu).toHaveLength(1);
    expect((menu[0] as { text: string }).text).toBe('Prazer, Ana. Como posso ajudar?');
    expect(await login('2')).toEqual([]);
    expect(attendances).toHaveLength(1);
    expect(variables).toMatchObject({
      nome: 'Ana',
      opcao: '2',
      desk_forwardToDeskState_status: 'Success',
      'stateId@f1': 'desk:suporte',
    });
  });

  it('the end of attendance unblocks the block and moves to the configured block', async () => {
    expect(
      await login(
        { id: 'conversa-1', status: 'ClosedAttendant' },
        'application/vnd.iris.ticket+json',
      ),
    ).toEqual(['Seu atendimento foi encerrado. Posso ajudar em algo mais?']);
    expect(variables['stateId@f1']).toBe('pos-atendimento');
  });

  it('resposta fora do menu cai no "não entendi" e volta ao menu', async () => {
    const saida = await login('qualquer coisa');
    // `pos-atendimento` → `menu` default exit sends the menu and waits.
    expect((saida[0] as { text: string }).text).toContain('Como posso ajudar?');
    const errado = await login('3');
    expect(errado[0]).toBe('Não entendi. Responda 1 ou 2.');
    expect(variables['stateId@f1']).toBe('menu');
  });
});

describe('media content', () => {
  const MEDIA_LINK = 'application/vnd.lime.media-link+json';
  const settingsMedia = (uri: string | undefined, type: string, size?: number): unknown => ({
    type: MEDIA_LINK,
    content: {
      ...(uri !== undefined ? { uri } : {}),
      type,
      ...(size !== undefined ? { size } : {}),
    },
  });
  const missingUri = ["O campo 'uri' é obrigatório no conteúdo de mídia."];
  const MEDIA_FORMATS_IMAGEM =
    'image/gif, image/jpeg, image/jpg, image/jfif, image/png, image/svg+xml, image/tiff, image/vnd.dwg, image/webp';

  // Figurinha: the reference does not distinguish it from other media-link content beyond
  // the file's MIME (`ref/inventario-conteudo.md`, seção Figurinha), so it validates as `imagem`.
  it('accepts a sticker with an accepted image MIME', () => {
    expect(
      engineContentErrors(MEDIA_LINK, settingsMedia('https://cdn.exemplo.com/fig.webp', 'image/webp')),
    ).toEqual([]);
  });
  it('rejects a sticker without uri', () => {
    expect(engineContentErrors(MEDIA_LINK, settingsMedia(undefined, 'image/webp'))).toEqual(missingUri);
  });
  it('rejects a sticker with an unsupported image format', () => {
    expect(
      engineContentErrors(MEDIA_LINK, settingsMedia('https://cdn.exemplo.com/fig.bmp', 'image/bmp')),
    ).toEqual(['Formato image/bmp não é aceito para imagem. Aceitos: ' + MEDIA_FORMATS_IMAGEM + '.']);
  });

  it('accepts audio within the accepted format and size', () => {
    expect(
      engineContentErrors(MEDIA_LINK, settingsMedia('https://cdn.exemplo.com/audio.mp3', 'audio/mp3', 1_000_000)),
    ).toEqual([]);
  });
  it('rejects audio without uri', () => {
    expect(engineContentErrors(MEDIA_LINK, settingsMedia(undefined, 'audio/mp3'))).toEqual(missingUri);
  });
  it('rejects audio over the 16 MB ceiling documented for the type', () => {
    expect(
      engineContentErrors(
        MEDIA_LINK,
        settingsMedia('https://cdn.exemplo.com/audio.mp3', 'audio/mp3', 17 * 1024 * 1024),
      ),
    ).toEqual(['Arquivo de 17,0 MB passa do limite de 16,0 MB para audio.']);
  });

  it('accepts an image in an accepted format', () => {
    expect(
      engineContentErrors(MEDIA_LINK, settingsMedia('https://cdn.exemplo.com/foto.png', 'image/png')),
    ).toEqual([]);
  });
  it('rejects an image without uri', () => {
    expect(engineContentErrors(MEDIA_LINK, settingsMedia(undefined, 'image/png'))).toEqual(missingUri);
  });
  it('rejects an image in an unsupported format (no size ceiling documented for images)', () => {
    expect(
      engineContentErrors(MEDIA_LINK, settingsMedia('https://cdn.exemplo.com/foto.bmp', 'image/bmp'))[0],
    ).toContain('Formato image/bmp não é aceito para imagem.');
  });

  it('accepts video within the accepted format and size', () => {
    expect(
      engineContentErrors(
        MEDIA_LINK,
        settingsMedia('https://cdn.exemplo.com/video.mp4', 'video/mp4', 10 * 1024 * 1024),
      ),
    ).toEqual([]);
  });
  it('rejects video without uri', () => {
    expect(engineContentErrors(MEDIA_LINK, settingsMedia(undefined, 'video/mp4'))).toEqual(missingUri);
  });
  it('rejects video over the 16 MB ceiling documented for the type', () => {
    expect(
      engineContentErrors(
        MEDIA_LINK,
        settingsMedia('https://cdn.exemplo.com/video.mp4', 'video/mp4', 20 * 1024 * 1024),
      ),
    ).toEqual(['Arquivo de 20,0 MB passa do limite de 16,0 MB para video.']);
  });

  it('accepts a document within the accepted format and size', () => {
    expect(
      engineContentErrors(
        MEDIA_LINK,
        settingsMedia('https://cdn.exemplo.com/doc.pdf', 'application/pdf', 50 * 1024 * 1024),
      ),
    ).toEqual([]);
  });
  it('rejects a document without uri', () => {
    expect(engineContentErrors(MEDIA_LINK, settingsMedia(undefined, 'application/pdf'))).toEqual(missingUri);
  });
  it('rejects a document over the 100 MB ceiling documented for the type', () => {
    expect(
      engineContentErrors(
        MEDIA_LINK,
        settingsMedia('https://cdn.exemplo.com/doc.pdf', 'application/pdf', 120 * 1024 * 1024),
      ),
    ).toEqual(['Arquivo de 120,0 MB passa do limite de 100,0 MB para documento.']);
  });

  it('a MIME outside the catalog stays refused', () => {
    expect(CONTEUDOS_SUPORTADOS.has('application/vnd.lime.collection+json')).toBe(false);
    expect(CONTEUDOS_SUPORTADOS.has(MEDIA_LINK)).toBe(true);
  });

  const flowWith = (settings: unknown): FlowBlip => ({
    id: 'f1',
    states: [
      {
        id: 'raiz',
        root: true,
        input: {},
        inputActions: [{ type: 'SendMessage', settings }],
        outputs: [],
      },
    ],
  });

  it('a flow with valid media settings publishes without error', () => {
    expect(
      flowErrors(flowWith(settingsMedia('https://cdn.exemplo.com/foto.png', 'image/png'))),
    ).toEqual([]);
  });

  it('a flow missing a required media field is refused at publish with the literal message', () => {
    expect(flowErrors(flowWith(settingsMedia(undefined, 'image/png')))).toEqual([
      { stateId: 'raiz', message: missingUri[0] },
    ]);
  });

  it('a flow exceeding a documented media limit is refused at publish with the literal message', () => {
    expect(
      flowErrors(
        flowWith(settingsMedia('https://cdn.exemplo.com/doc.pdf', 'application/pdf', 120 * 1024 * 1024)),
      ),
    ).toEqual([
      { stateId: 'raiz', message: 'Arquivo de 120,0 MB passa do limite de 100,0 MB para documento.' },
    ]);
  });
});

describe('interactive content', () => {
  it('accepts every confirmed interactive MIME and validates web links and locations', () => {
    expect(CONTEUDOS_SUPORTADOS).toEqual(
      expect.objectContaining({
        has: expect.any(Function),
      }),
    );
    for (const mime of [
      'application/vnd.lime.chatstate+json',
      'application/vnd.lime.input+json',
      'application/vnd.lime.location+json',
      'application/vnd.lime.web-link+json',
      'application/vnd.lime.select+json',
    ]) {
      expect(CONTEUDOS_SUPORTADOS.has(mime)).toBe(true);
    }
    expect(
      engineContentErrors('application/vnd.lime.web-link+json', {
        content: { uri: 'http://example.com' },
      }),
    ).toEqual(['A URL do web link deve usar https.']);
    expect(
      engineContentErrors('application/vnd.lime.location+json', {
        content: { latitude: -91, longitude: 0 },
      }),
    ).toEqual(['A latitude deve estar entre -90 e 90.']);
  });
});

describe('dynamic content', () => {
  it('accepts the HTTP, dynamic, and satisfaction-survey envelopes at publish time', () => {
    for (const mime of [
      'application/vnd.pipe.http-content+json',
      'application/vnd.pipe.dynamic-content+json',
      'application/vnd.lime.satisfaction-survey+json',
    ]) {
      expect(CONTEUDOS_SUPORTADOS.has(mime)).toBe(true);
    }
  });
});
