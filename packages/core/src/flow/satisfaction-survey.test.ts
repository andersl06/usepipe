import { describe, expect, it } from 'vitest';
import { createInbound } from './context.js';
import type { Context, OutputMessage } from './context.js';
import { processInbound } from './manager.js';
import type { Acao, State, FlowBlip } from './modelos.js';
import {
  SURVEY_CONTENT_TYPE,
  isSatisfactionSurveyState,
  interpretSatisfactionAnswer,
} from './satisfaction-survey.js';
import type { SatisfactionAnswer } from './satisfaction-survey.js';

const askSurvey: Acao = {
  type: 'SendMessage',
  settings: {
    type: SURVEY_CONTENT_TYPE,
    content: { type: '', scale: '1-5', question: 'De 1 a 5, como você avalia o atendimento?', score: '' },
  },
};

/** A `survey:` state as the Builder would export it: sends the question on entering, then waits for the reply. */
function surveyState(outputs: State['outputs'] = [], extra: Partial<State> = {}): State {
  return {
    id: 'survey:nota',
    inputActions: [askSurvey],
    input: { bypass: false, variable: 'nota.pesquisa' },
    outputs,
    ...extra,
  };
}

describe('isSatisfactionSurveyState', () => {
  it('recognizes a state whose entering actions send the native survey document', () => {
    expect(isSatisfactionSurveyState(surveyState())).toBe(true);
  });

  it('does not flag an ordinary question block', () => {
    const outro: State = {
      id: 'pergunta',
      inputActions: [{ type: 'SendMessage', settings: { type: 'text/plain', content: 'Qual seu nome?' } }],
      input: { bypass: false, variable: 'nome' },
    };
    expect(isSatisfactionSurveyState(outro)).toBe(false);
  });

  it('handles a state without inputActions', () => {
    expect(isSatisfactionSurveyState({ id: 'x' })).toBe(false);
    expect(isSatisfactionSurveyState(null)).toBe(false);
  });
});

describe('interpretSatisfactionAnswer', () => {
  it('returns null for a non-survey state', () => {
    const outro: State = { id: 'pergunta', inputActions: [] };
    expect(interpretSatisfactionAnswer(outro, '5')).toBeNull();
  });

  it('nota válida sozinha grava só a nota (so_nota)', () => {
    const answer = interpretSatisfactionAnswer(surveyState(), '5');
    expect(answer).toEqual<SatisfactionAnswer>({ rating: 5, comment: null, status: 'so_nota' });
  });

  it('nota + comentário grava os dois (completa)', () => {
    const answer = interpretSatisfactionAnswer(surveyState(), '4 atendimento rápido e educado');
    expect(answer).toEqual<SatisfactionAnswer>({
      rating: 4,
      comment: 'atendimento rápido e educado',
      status: 'completa',
    });
  });

  it('lê nota e comentário de uma resposta estruturada (canal que ecoa JSON)', () => {
    const answer = interpretSatisfactionAnswer(
      surveyState(),
      JSON.stringify({ score: 3, comment: 'poderia ser melhor' }),
    );
    expect(answer).toEqual<SatisfactionAnswer>({
      rating: 3,
      comment: 'poderia ser melhor',
      status: 'completa',
    });
  });

  it('entrada fora de 1-5 nunca grava nota inválida', () => {
    expect(interpretSatisfactionAnswer(surveyState(), '0')).toBeNull();
    expect(interpretSatisfactionAnswer(surveyState(), '9 ótimo')).toBeNull();
    expect(interpretSatisfactionAnswer(surveyState(), 'não quero responder')).toBeNull();
  });

  it('timeout/sem resposta grava o estado documentado sem nota nem comentário', () => {
    const answer = interpretSatisfactionAnswer(surveyState(), '', { timedOut: true });
    expect(answer).toEqual<SatisfactionAnswer>({ rating: null, comment: null, status: 'sem_resposta' });
  });

  it('timeout num estado que não é pesquisa não produz resposta', () => {
    const outro: State = { id: 'pergunta', inputActions: [] };
    expect(interpretSatisfactionAnswer(outro, '', { timedOut: true })).toBeNull();
  });
});

describe('engine wiring: the survey block records the answer and branches by the configured output', () => {
  const FLOW_ID = 'f-survey';

  function harness() {
    const respostas: SatisfactionAnswer[] = [];
    const enviadas: OutputMessage[] = [];
    return {
      respostas,
      enviadas,
      services: {
        async send(m: OutputMessage) {
          enviadas.push(m);
        },
        async forwardForAttendance() {
          return { id: 'atd-1', status: 'Open' };
        },
        async registerEvent() {
          /* no-op */
        },
        async recordSatisfactionAnswer(answer: SatisfactionAnswer) {
          respostas.push(answer);
        },
      },
    };
  }

  async function rodar(states: State[], conteudo: string, variables: Record<string, string> = {}) {
    const h = harness();
    const flow: FlowBlip = { id: FLOW_ID, states };
    const context: Context = {
      user: 'user@domain',
      flow,
      inbound: createInbound({ id: 'm1', tipo: 'text/plain', conteudo }),
      variables,
      inboundContext: new Map(),
      contact: null,
      services: h.services,
    };
    await processInbound(context);
    return h;
  }

  it('grava a resposta e segue a saída configurada pelo autor do fluxo para a nota recebida (D-09: sem categoria fixa)', async () => {
    const states: State[] = [
      surveyState(
        [
          {
            order: 0,
            stateId: 'promotor',
            conditions: [{ source: 'input', comparison: 'equals', values: ['5'] }],
          },
          { order: 1, stateId: 'outro' },
        ],
        { root: true },
      ),
      { id: 'promotor', input: { bypass: true } },
      { id: 'outro', input: { bypass: true } },
    ];
    const h = await rodar(states, '5', { [`stateId@${FLOW_ID}`]: 'survey:nota' });
    expect(h.respostas).toEqual([{ rating: 5, comment: null, status: 'so_nota' }]);
  });

  it('não grava nada quando o serviço não está implementado (opcional)', async () => {
    const states: State[] = [
      surveyState([{ order: 0, stateId: 'outro' }], { root: true }),
      { id: 'outro', input: { bypass: true } },
    ];
    const flow: FlowBlip = { id: FLOW_ID, states };
    const context: Context = {
      user: 'user@domain',
      flow,
      inbound: createInbound({ id: 'm1', tipo: 'text/plain', conteudo: '5' }),
      variables: { [`stateId@${FLOW_ID}`]: 'survey:nota' },
      inboundContext: new Map(),
      contact: null,
      services: {
        async send() {
          /* no-op */
        },
        async forwardForAttendance() {
          return { id: 'atd-1', status: 'Open' };
        },
        async registerEvent() {
          /* no-op */
        },
      },
    };
    await expect(processInbound(context)).resolves.toBeTruthy();
  });
});
