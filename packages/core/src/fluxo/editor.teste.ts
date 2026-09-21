import { describe, expect, it } from 'vitest';
import { criarEntrada } from './contexto.js';
import type { Contexto, MensagemDeSaida } from './contexto.js';
import {
  converterDoEditor,
  ehExportDoEditor,
  lerFluxoDaBlip,
  relatorioDaImportacao,
} from './editor.js';
import type { ExportDoEditor } from './editor.js';
import { processarEntrada } from './gerenciador.js';
import { validarFluxo } from './modelos.js';
import type { FluxoBlip } from './modelos.js';
import fixture from './fixtures/editor-sintetico.json' with { type: 'json' };

/** Fixture sintética, no formato do editor do Builder — nada de fluxo de cliente. */
const exportado = fixture as unknown as ExportDoEditor;
const copia = (): ExportDoEditor => JSON.parse(JSON.stringify(exportado)) as ExportDoEditor;

describe('importador do export do editor da Blip', () => {
  const fluxo = converterDoEditor(exportado, 'f1');
  const estado = (id: string) => fluxo.states.find((s) => s.id === id)!;

  it('reconhece o export do editor e o fluxo publicado', () => {
    expect(ehExportDoEditor(exportado)).toBe(true);
    expect(ehExportDoEditor({ settings: { flow: fluxo } })).toBe(false);
  });

  it('converte para o formato publicado, e o resultado passa na validação do motor', () => {
    expect(fluxo.states).toHaveLength(7);
    expect(() => validarFluxo(fluxo)).not.toThrow();
  });

  it('ação de entrada vem antes do conteúdo, e o input vira `input`', () => {
    expect(estado('boas-vindas').inputActions!.map((a) => a.type)).toEqual([
      'TrackEvent',
      'SendMessage',
      'SendMessage',
    ]);
    expect(estado('boas-vindas').input).toEqual({ bypass: false, variable: 'nome' });
  });

  it('saídas com condição em ordem e a saída padrão por último, sem condição', () => {
    expect(estado('menu').outputs).toEqual([
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

  it('saída sem destino (bloco de atendimento recém-criado) não vira transição', () => {
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
    expect(() => validarFluxo(convertido)).not.toThrow();
  });

  it('as chaves do editor ($invalid, $cardContent, $connId…) não passam, e $title vira name', () => {
    const texto = JSON.stringify(fluxo);
    for (const chave of [
      '$invalid',
      '$cardContent',
      '$connId',
      '$typeOfContent',
      'typeOfStateId',
    ]) {
      expect(texto).not.toContain(chave);
    }
    expect(estado('menu')['name']).toBe('Menu');
    expect(estado('menu').outputActions![0]).toMatchObject({
      id: 's1',
      $title: 'Guarda a opção',
      type: 'SetVariable',
    });
  });

  it('o publicado é lido como está (identidade), só com o id de quem importa', () => {
    const publicado: FluxoBlip = { id: 'outro', states: fluxo.states };
    expect(lerFluxoDaBlip({ settings: { flow: publicado } }, 'meu').states).toBe(fluxo.states);
    expect(lerFluxoDaBlip(publicado, 'meu').id).toBe('meu');
    expect(() => lerFluxoDaBlip({ nada: 1 }, 'x')).toThrow('não é um fluxo da Blip');
  });

  it('relatório: o fluxo sintético não tem nada fora do suporte', () => {
    const r = relatorioDaImportacao(fluxo);
    expect(r.estados).toBe(7);
    expect(r.saidas).toBe(11);
    expect(r.naoSuportado).toEqual({});
    expect(r.semEfeito).toEqual({
      'conteudo:application/vnd.lime.chatstate+json': 1,
      'acao:LeavingFromDesk': 1,
    });
    expect(r.acoes['SendMessage']).toBe(6);
  });

  it('relatório: lista por tipo o que o Pipe não executa, sem descartar nada', () => {
    const e = copia();
    const menu = e.flow['menu']!;
    menu.$enteringCustomActions = [
      { type: 'ExecuteScript', settings: { source: 'function run(){}', outputVariable: 'x' } },
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
    expect(relatorioDaImportacao(convertido).naoSuportado).toEqual({
      'acao:ExecuteScript': 1,
      'acao:ProcessHttp': 2,
      'conteudo:application/json': 1,
      'entrada:expiracao': 1,
      'variavel:calendar': 1,
    });
    // O que não é suportado continua no fluxo: nada some na conversão.
    expect(
      convertido.states.find((s) => s.id === 'menu')!.inputActions!.map((a) => a.type),
    ).toEqual([
      'ExecuteScript',
      'ProcessHttp',
      'ProcessHttp',
      'SendRawMessage',
      'SendMessage',
      'SendMessage',
    ]);
  });
});

describe('o fluxo importado rodando no motor', () => {
  const fluxo = converterDoEditor(exportado, 'f1');
  const variaveis: Record<string, string> = {};
  const enviadas: MensagemDeSaida[] = [];
  const atendimentos: unknown[] = [];

  const entrar = async (conteudo: unknown, tipo = 'text/plain') => {
    enviadas.length = 0;
    const contexto: Contexto = {
      usuario: 'contato-1',
      fluxo,
      entrada: criarEntrada({ id: String(Math.random()), tipo, conteudo }),
      variaveis,
      entradaContexto: new Map(),
      servicos: {
        enviar: async (m) => void enviadas.push(m),
        encaminharParaAtendimento: async (p) => (atendimentos.push(p), { id: 'conversa-1' }),
        registrarEvento: async () => {},
      },
    };
    await processarEntrada(contexto);
    return enviadas
      .filter((m) => m.tipo !== 'application/vnd.lime.chatstate+json')
      .map((m) => m.conteudo);
  };

  it('oi → pergunta o nome; nome → menu com a variável; 2 → atendimento com o contexto guardado', async () => {
    expect(await entrar('oi')).toEqual(['Olá! Qual é o seu nome?']);
    const menu = await entrar('Ana');
    expect(menu).toHaveLength(1);
    expect((menu[0] as { text: string }).text).toBe('Prazer, Ana. Como posso ajudar?');
    expect(await entrar('2')).toEqual([]);
    expect(atendimentos).toHaveLength(1);
    expect(variaveis).toMatchObject({
      nome: 'Ana',
      opcao: '2',
      desk_forwardToDeskState_status: 'Success',
      'stateId@f1': 'desk:suporte',
    });
  });

  it('o fim do atendimento destrava o bloco e segue para o bloco configurado', async () => {
    expect(
      await entrar(
        { id: 'conversa-1', status: 'ClosedAttendant' },
        'application/vnd.iris.ticket+json',
      ),
    ).toEqual(['Seu atendimento foi encerrado. Posso ajudar em algo mais?']);
    expect(variaveis['stateId@f1']).toBe('pos-atendimento');
  });

  it('resposta fora do menu cai no "não entendi" e volta ao menu', async () => {
    const saida = await entrar('qualquer coisa');
    // pos-atendimento → menu (saída padrão) manda o menu e espera.
    expect((saida[0] as { text: string }).text).toContain('Como posso ajudar?');
    const errado = await entrar('3');
    expect(errado[0]).toBe('Não entendi. Responda 1 ou 2.');
    expect(variaveis['stateId@f1']).toBe('menu');
  });
});
