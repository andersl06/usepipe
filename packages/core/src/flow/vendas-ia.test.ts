/**
 * The Pipe landing page sales assistant (`apps/site/flows/vendas-ia.json`): the file imports clean
 * and, with a FAKE model provider (no network, no real LLM), answers a question, asks for the
 * visitor's data and then hands off to the Desk in the queue named `Especialista`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { agentSettings, type AgentModelRequest, type AgentModelResponse } from './ai-agent.js';
import { createInbound, type Context, type DeskUnavailableStatus, type OutputMessage } from './context.js';
import { blipReadFlow, importReport } from './editor.js';
import { processInbound } from './manager.js';
import { flowErrors, validateFlow } from './modelos.js';

const AGENT = 'ai-agent:vendas-pipe';
const raw: unknown = JSON.parse(
  readFileSync(new URL('../../../../apps/site/flows/vendas-ia.json', import.meta.url), 'utf8'),
);
const reply = (text: string | null, toolCalls: AgentModelResponse['toolCalls'] = []): AgentModelResponse => ({
  text, toolCalls, stopReason: toolCalls.length ? 'tool_use' : 'end', model: 'fake',
});

function harness(model: (request: AgentModelRequest, call: number) => AgentModelResponse | Error) {
  const flow = blipReadFlow(raw, 'vendas-ia');
  const sent: OutputMessage[] = [];
  const requests: AgentModelRequest[] = [];
  const merges: unknown[] = [];
  const forwards: { settings: unknown; unavailableWhen?: readonly DeskUnavailableStatus[] }[] = [];
  const variables: Record<string, string> = {};
  const run = async (text: string, id: string): Promise<void> => {
    const context: Context = {
      user: 'visitante-1',
      flow,
      inbound: createInbound({ id, tipo: 'text/plain', conteudo: text }),
      variables,
      inboundContext: new Map(),
      contact: { name: 'Visitante' },
      services: {
        send: async (m) => { sent.push(m); },
        registerEvent: async () => {},
        mergeContact: async (fields) => { merges.push(fields); },
        forwardForAttendance: async (p) => { forwards.push(p); return { id: 'ticket-1', status: 'Waiting' }; },
        callAgentModel: async (request) => {
          requests.push(JSON.parse(JSON.stringify(request)) as AgentModelRequest);
          const out = model(request, requests.length);
          if (out instanceof Error) throw out;
          return out;
        },
      },
    };
    await processInbound(context);
  };
  return { flow, sent, requests, merges, forwards, variables, run };
}

describe('vendas-ia flow (fake provider)', () => {
  it('imports without unsupported actions or validation errors', () => {
    const flow = blipReadFlow(raw, 'vendas-ia');
    expect(() => validateFlow(flow)).not.toThrow();
    expect(flowErrors(flow)).toEqual([]);
    const report = importReport(flow);
    expect(report.naoSuportado).toEqual({});
    expect(report.actions).toMatchObject({ ForwardToAgent: 1, ForwardToDesk: 1, MergeContact: 1 });
  });

  it('configures the agent with the specialist handoff, memory and a prompt with the marked price block', () => {
    const state = blipReadFlow(raw, 'x').states.find((s) => s.id === AGENT)!;
    const config = agentSettings(state.inputActions![0]!.settings as Record<string, unknown>);
    expect(config.handoffs.map((h) => h.name)).toEqual(['falar_com_especialista']);
    expect(config.memoryLength).toBe(10);
    expect(config.system).toContain('handoff_falar_com_especialista');
    // The proposed prices live in one marked block, easy to edit before launch.
    expect(config.system).toContain('PRECOS - CONFIRMAR ANTES DO LANCAMENTO');
    expect(config.system).toContain('R$ 199');
    expect(config.system).toContain('7 dias de teste');
    expect(config.system).toContain('R$ 0,30');
  });

  it('welcomes, answers a question, collects the data and forwards to the Desk queue Especialista', async () => {
    const h = harness((_request, call) => {
      if (call === 1) return reply('O Pipe junta WhatsApp, Instagram, Messenger, chat do site e e-mail numa fila só.');
      if (call === 2) return reply('Pode me dizer seu nome e um e-mail ou WhatsApp?');
      return reply('Já estou chamando um especialista.', [
        { id: 'c1', name: 'handoff_falar_com_especialista', arguments: { nome: 'Ana', contato: 'ana@exemplo.test', motivo: 'Quer uma demonstração' } },
      ]);
    });

    await h.run('Quais canais o Pipe atende?', 'm1');
    const texts = () => h.sent.map((m) => m.conteudo);
    expect(texts()[0]).toContain('assistente do Pipe');
    expect(texts()[1]).toContain('fila só');
    expect(h.requests[0]!.messages).toEqual([{ role: 'user', content: 'Quais canais o Pipe atende?' }]);
    expect(h.requests[0]!.tools.map((t) => t.name)).toEqual(['handoff_falar_com_especialista']);
    expect(h.variables['stateId@vendas-ia']).toBe(AGENT);

    await h.run('Quero uma demonstração', 'm2');
    expect(texts()).toContain('Pode me dizer seu nome e um e-mail ou WhatsApp?');
    expect(h.forwards).toHaveLength(0);

    await h.run('Sou a Ana, ana@exemplo.test', 'm3');
    expect(h.merges).toEqual([
      { extras: { teams: 'Especialista', lead_nome: 'Ana', lead_contato: 'ana@exemplo.test', lead_motivo: 'Quer uma demonstração' } },
    ]);
    expect(h.forwards).toHaveLength(1);
    expect(h.variables['desk_forwardToDeskState_status']).toBe('Success');
    expect(h.variables['stateId@vendas-ia']).toBe('desk:especialista');
    expect(texts().at(-1)).toContain('especialista responde por aqui');
  });

  it('a provider failure shows the friendly fallback offering the specialist and keeps the flow alive', async () => {
    const h = harness(() => new Error('401'));
    await h.run('Oi', 'm1');
    expect(h.variables['stateId@vendas-ia']).toBe('erro-ia');
    expect(h.sent.at(-1)!.conteudo).toContain('especialista');
    expect(h.forwards).toHaveLength(0);
  });

  it('after a provider failure, asking for a specialist still reaches the Desk without the model', async () => {
    const h = harness(() => new Error('401'));
    await h.run('Oi', 'm1');
    await h.run('quero falar com um especialista', 'm2');
    expect(h.forwards).toHaveLength(1);
    expect(h.variables['stateId@vendas-ia']).toBe('desk:especialista');
  });
});
