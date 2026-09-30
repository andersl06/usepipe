import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agentSettings, agentToolbox, converterDoEditor, validateFlow } from '@pipe/core';
import type { ExportDoEditor, FlowBlip, Settings } from '@pipe/core';
import { duplicateBlock, newBlock } from '../src/pages/builder/model.ts';
import type { Block, Mapa } from '../src/pages/builder/model.ts';
import {
  AGENT_MESSAGES,
  HANDOFF_NAME_VARIABLE,
  addHandoff,
  agentHandoffs,
  agentInstructions,
  agentMemory,
  agentModelView,
  agentOutput,
  agentSettingsOf,
  aiAgentErrors,
  errorOutputIndex,
  handoffOutputIndex,
  hasAiAgent,
  isAiAgentBlock,
  newAiAgentBlock,
  newTool,
  otherAgentOutputs,
  removeHandoff,
  renameHandoff,
  setAgentInstructions,
  setAgentKeySecret,
  setAgentMaxTokens,
  setAgentMemory,
  setAgentModel,
  setAgentOutput,
  setAgentProvider,
  setAgentTemperature,
  setErrorDestination,
  setHandoffDescription,
  setHandoffDestination,
  setHandoffParameters,
  temperatureAccepted,
  toolErrors,
  withToolDescription,
  withToolSchema,
} from '../src/pages/builder/ai-agent-block.ts';
import { blockMarks } from '../src/pages/builder/error-marks.ts';
import { exportText, validateImport } from '../src/pages/builder/import-exportar.ts';
import { actionsOfGroup } from '../src/pages/builder/actions-of-block.ts';

const base = (): Mapa => ({
  onboarding: { ...newBlock({}, { top: 0, left: 0 }, 'onboarding'), root: true, $title: 'Início' },
  fallback: { ...newBlock({}, { top: 0, left: 300 }, 'fallback'), $title: 'Exceções' },
});

/** A complete agent: instructions, a handoff to `fallback`, and one SetVariable tool. */
function configured(mapa: Mapa): Block {
  let block = newAiAgentBlock(mapa, { top: 100, left: 100 }, 'a1');
  block = setAgentInstructions(block, ['Você é o assistente da loja.']);
  const r = addHandoff(block, 'h1');
  assert.ok(r.ok);
  block = renameHandoff(r.block, 0, 'falar_com_humano');
  block = setHandoffDescription(block, 0, 'Quando o cliente pedir um atendente');
  block = setHandoffDestination(block, 0, 'fallback');
  const tool = withToolDescription(
    { ...newTool(block, 'SetVariable', 't1'), $title: 'salvar_email', settings: { variable: 'email', value: '{{aiagent.parameters@email}}' } },
    'Guarda o e-mail informado pelo cliente',
  );
  const schema = withToolSchema(tool, JSON.stringify({ type: 'object', properties: { email: { type: 'string' } } }));
  assert.ok(schema.ok);
  return { ...block, $localCustomActions: [schema.acao] };
}

test('newAiAgentBlock has Blip\'s agent shape: ForwardToAgent, waiting input, LeavingFromAgent, exception exit, self default', () => {
  const b = newAiAgentBlock(base(), { top: 10, left: 10 }, 'x');
  assert.equal(b.id, 'ai-agent:x');
  assert.equal(b.$title, 'Novo Agente');
  assert.ok(isAiAgentBlock(b));
  assert.equal(b.$enteringCustomActions![0]!.type, 'ForwardToAgent');
  assert.equal(b.$afterStateChangedActions![0]!.type, 'LeavingFromAgent');
  const input = b.$contentActions!.find((c) => c.input)!.input!;
  assert.equal(input.bypass, false);
  assert.deepEqual(input.conditions![0]!.values, ['Success']);
  assert.equal(input.conditions![0]!.variable, 'agent_forwardToAgentState_status');
  assert.equal(b.$defaultOutput?.stateId, 'ai-agent:x');
  const erro = b.$conditionOutputs![errorOutputIndex(b)]!;
  assert.equal(erro.stateId, 'fallback');
  assert.equal(erro['$isAgentDefaultOutput'], true);
  assert.deepEqual(b.$localCustomActions, []);
  const view = agentModelView(b);
  assert.equal(view.provider, 'anthropic');
  assert.equal(view.effectiveModel, 'claude-sonnet-5');
  assert.equal(view.effectiveApiKeySecret, 'ANTHROPIC_API_KEY');
  assert.deepEqual(agentMemory(b), { enabled: true, length: 50 });
  assert.equal(agentOutput(b).forward, true);
  // Empty instructions are the only problem of a fresh block.
  assert.deepEqual(aiAgentErrors(b), [AGENT_MESSAGES.instrucoesVazias]);
  assert.equal(blockMarks(b, { ...base(), [b.id]: b }).node, true);
});

test('provider switch moves the default model and key secret; a custom secret stays', () => {
  let b = newAiAgentBlock(base(), { top: 0, left: 0 }, 'p');
  b = setAgentProvider(b, 'openai');
  assert.equal(agentModelView(b).model, 'gpt-4.1');
  assert.equal(agentModelView(b).effectiveApiKeySecret, 'OPENAI_API_KEY');
  b = setAgentKeySecret(b, 'CHAVE_OPENAI_LOJA');
  b = setAgentProvider(b, 'anthropic');
  assert.equal(agentModelView(b).model, 'claude-sonnet-5');
  assert.equal(agentModelView(b).apiKeySecret, 'CHAVE_OPENAI_LOJA');
  // Typing the provider's default name stores nothing, so it keeps following the provider.
  b = setAgentKeySecret(b, 'ANTHROPIC_API_KEY');
  assert.equal(agentModelView(b).apiKeySecret, '');
  // A model of the chosen provider is kept on switch back.
  b = setAgentModel(b, 'claude-opus-5');
  b = setAgentProvider(b, 'anthropic');
  assert.equal(agentModelView(b).model, 'claude-opus-5');
});

test('temperature is accepted only where @pipe/ai sends it; numbers are validated', () => {
  assert.equal(temperatureAccepted('anthropic', 'claude-sonnet-5'), false);
  assert.equal(temperatureAccepted('anthropic', 'claude-sonnet-4-5'), true);
  assert.equal(temperatureAccepted('openai', 'gpt-4.1'), true);
  assert.equal(temperatureAccepted('openai', 'gpt-5-mini'), false);
  let b = setAgentInstructions(newAiAgentBlock(base(), { top: 0, left: 0 }, 't'), ['x']);
  b = setAgentMaxTokens(b, '9000');
  b = setAgentTemperature(b, '1,5');
  assert.equal(agentModelView(b).temperature, 1.5);
  assert.deepEqual(aiAgentErrors(b), [AGENT_MESSAGES.maxTokens, AGENT_MESSAGES.temperatura(1)]);
  b = setAgentProvider(b, 'openai');
  b = setAgentMaxTokens(b, '');
  assert.deepEqual(aiAgentErrors(b), []);
  assert.equal(agentModelView(b).maxTokens, null);
});

test('instructions keep other prompt entries; memory can be turned off, resized and back on', () => {
  let b = newAiAgentBlock(base(), { top: 0, left: 0 }, 'i');
  b = setAgentInstructions(b, ['Primeira', 'Segunda']);
  assert.deepEqual(agentInstructions(b), ['Primeira', 'Segunda']);
  const prompt = agentSettingsOf(b)['prompt'] as { type?: string; role?: string }[];
  // New entries go before the memory entry and carry both `role` (engine) and `type` (Blip).
  assert.deepEqual(prompt.map((p) => p.type), ['system', 'system', 'short-term-memory']);
  assert.deepEqual(prompt.map((p) => p.role), ['system', 'system', 'short-term-memory']);
  b = setAgentInstructions(b, ['Só uma']);
  assert.deepEqual(agentInstructions(b), ['Só uma']);
  b = setAgentMemory(b, true, '20');
  assert.deepEqual(agentMemory(b), { enabled: true, length: 20 });
  b = setAgentMemory(b, true, '500');
  assert.ok(aiAgentErrors(b).includes(AGENT_MESSAGES.memoria));
  b = setAgentMemory(b, false);
  assert.deepEqual(agentMemory(b), { enabled: false, length: null });
  b = setAgentMemory(b, true);
  assert.deepEqual(agentMemory(b), { enabled: true, length: 50 });
});

test('output variable is written where the engine reads it and where Blip shows it', () => {
  let b = setAgentInstructions(newAiAgentBlock(base(), { top: 0, left: 0 }, 'o'), ['x']);
  b = setAgentOutput(b, { saveVariable: true, variable: '' });
  assert.deepEqual(aiAgentErrors(b), [AGENT_MESSAGES.variavelVazia]);
  b = setAgentOutput(b, { variable: 'resposta.agente', forward: false });
  const output = agentSettingsOf(b)['output'] as { forward: Record<string, unknown>; variable: Record<string, unknown> };
  assert.deepEqual(output.variable, { enabled: true, name: 'resposta.agente' });
  assert.equal(output.forward['enabled'], false);
  assert.equal(output.forward['outputVariable'], 'resposta.agente');
  const engine = agentSettings(agentSettingsOf(b) as Settings);
  assert.equal(engine.outputVariable, 'resposta.agente');
  assert.equal(engine.forward, false);
  // A Blip block that only has `forward.outputVariable` reads as saving the variable.
  const blip = { ...b };
  const legacy = agentSettingsOf(blip);
  (legacy['output'] as Record<string, unknown>) = { forward: { enabled: true, outputVariable: 'x' } };
  assert.deepEqual(agentOutput({ ...blip, $enteringCustomActions: [{ type: 'ForwardToAgent', settings: legacy }] }), {
    forward: true,
    saveVariable: true,
    variable: 'x',
  });
});

test('handoffs add, rename, point and remove their named exit together', () => {
  let b = newAiAgentBlock(base(), { top: 0, left: 0 }, 'h');
  const r = addHandoff(b, 'o1');
  assert.ok(r.ok);
  b = r.block;
  assert.equal(agentHandoffs(b)[0]!.name, 'direcionamento_1');
  assert.equal(handoffOutputIndex(b, 'direcionamento_1'), 1);
  // No destination yet: the output is flagged like any other.
  assert.ok(blockMarks(b, { ...base(), [b.id]: b }).outputs.has(1));
  b = renameHandoff(b, 0, 'Fim');
  assert.ok(aiAgentErrors(b).includes(AGENT_MESSAGES.handoffInvalido));
  b = renameHandoff(b, 0, 'finalizar');
  const saida = b.$conditionOutputs![handoffOutputIndex(b, 'finalizar')]!;
  assert.deepEqual(saida.conditions!.find((c) => c.variable === HANDOFF_NAME_VARIABLE)!.values, ['finalizar']);
  assert.ok(aiAgentErrors(b).includes(AGENT_MESSAGES.handoffSemDescricao('finalizar')));
  const bad = setHandoffParameters(b, 0, '{ "type": ');
  assert.deepEqual(bad, { ok: false, error: AGENT_MESSAGES.schemaInvalido });
  const good = setHandoffParameters(b, 0, '{"motivo":"Por que o cliente quer sair"}');
  assert.ok(good.ok);
  b = setHandoffDestination(good.block, 0, 'fallback');
  assert.equal(b.$conditionOutputs![1]!.stateId, 'fallback');
  const r2 = addHandoff(b);
  assert.ok(r2.ok);
  assert.equal(agentHandoffs(r2.block)[1]!.name, 'direcionamento_1');
  b = removeHandoff(r2.block, 0);
  assert.deepEqual(agentHandoffs(b).map((h) => h.name), ['direcionamento_1']);
  assert.equal(handoffOutputIndex(b, 'finalizar'), -1);
  assert.equal(b.$conditionOutputs!.length, 2);
  // An imported handoff without its exit gets one when a destination is chosen.
  const semSaida = { ...b, $conditionOutputs: b.$conditionOutputs!.filter((_, i) => i !== 1) };
  assert.equal(agentHandoffs(semSaida)[0]!.output, -1);
  const comSaida = setHandoffDestination(semSaida, 0, 'fallback');
  assert.equal(comSaida.$conditionOutputs![handoffOutputIndex(comSaida, 'direcionamento_1')]!.stateId, 'fallback');
  // The exception output can be re-pointed, and is re-created when an import lacks it.
  const semErro = { ...comSaida, $conditionOutputs: comSaida.$conditionOutputs!.filter((_, i) => i !== errorOutputIndex(comSaida)) };
  assert.equal(errorOutputIndex(semErro), -1);
  assert.equal(setErrorDestination(semErro, 'onboarding').$conditionOutputs![0]!.stateId, 'onboarding');
  assert.deepEqual(otherAgentOutputs(comSaida), []);
});

test('tools: Blip name rules, description, object schema', () => {
  const b = newAiAgentBlock(base(), { top: 0, left: 0 }, 'f');
  const t = newTool(b, 'ProcessHttp', 'x');
  assert.equal(t.$title, 'ferramenta_1');
  assert.deepEqual(t['$inputSchema'], { type: 'object', properties: {} });
  assert.deepEqual(newTool({ ...b, $localCustomActions: [t] }, 'SetVariable').$title, 'ferramenta_2');
  assert.deepEqual(toolErrors({ ...t, $title: 'ab' }, [t]), [AGENT_MESSAGES.ferramentaCurta, AGENT_MESSAGES.ferramentaSemDescricao('ab')]);
  assert.ok(toolErrors({ ...t, $title: 'Salvar E-mail' }, [t]).includes(AGENT_MESSAGES.ferramentaInvalida));
  const d = withToolDescription(t, 'Consulta o pedido');
  assert.ok(toolErrors(d, [d, d]).includes(AGENT_MESSAGES.ferramentaRepetida));
  assert.deepEqual(withToolSchema(d, '[1]'), { ok: false, error: AGENT_MESSAGES.schemaInvalido });
  assert.deepEqual(withToolSchema(d, '{"type":"string"}'), { ok: false, error: AGENT_MESSAGES.schemaNaoObjeto });
  const vazio = withToolSchema(d, '');
  assert.ok(vazio.ok && (vazio.acao['$inputSchema'] as { type: string }).type === 'object');
  // Inside a subflow the tools menu leaves out ProcessContentAssistant, like the Ações menu.
  assert.ok(!actionsOfGroup('Executar', { inSubflow: true }).some((a) => a.tipo === 'ProcessContentAssistant'));
});

test('a Builder-made agent compiles, validates and is read by the engine as configured', () => {
  const mapa = base();
  const agent = configured(mapa);
  mapa['onboarding']!.$defaultOutput = { stateId: agent.id };
  mapa[agent.id] = agent;
  assert.deepEqual(aiAgentErrors(agent), []);
  assert.equal(blockMarks(agent, mapa).node, false);
  const flow: FlowBlip = converterDoEditor({ flow: mapa, globalActions: {} } as unknown as ExportDoEditor, 'bot');
  assert.doesNotThrow(() => validateFlow(flow));
  const state = flow.states.find((s) => s.id === agent.id)!;
  const forward = state.inputActions!.find((a) => a.type === 'ForwardToAgent')!;
  const config = agentSettings(forward.settings as Settings);
  assert.equal(config.provider, 'anthropic');
  assert.equal(config.model, 'claude-sonnet-5');
  assert.equal(config.system, 'Você é o assistente da loja.');
  assert.equal(config.memoryLength, 50);
  assert.deepEqual(config.handoffs.map((h) => h.name), ['falar_com_humano']);
  const box = agentToolbox(state, config);
  assert.deepEqual(box.tools.map((t) => t.name), ['salvar_email', 'handoff_falar_com_humano']);
  assert.deepEqual(box.tools[0]!.inputSchema, { type: 'object', properties: { email: { type: 'string' } } });
  assert.equal(box.tools[0]!.description, 'Guarda o e-mail informado pelo cliente');
  assert.equal(state.afterStateChangedActions?.[0]?.type, 'LeavingFromAgent');
});

test('Blip ForwardToAgent blocks survive import/export unchanged and are read by the panel', () => {
  const mapa = base();
  // A Blip-shaped agent block (`type` prompts, `forward.outputVariable`, extra Blip keys).
  const blip: Block = {
    ...configured(mapa),
    id: 'ai-agent:blip',
    stateVersion: '1.0.1',
    $toolActionsMapping: { builder: { uuid: 'u' } },
  };
  const settings = agentSettingsOf(blip);
  settings['prompt'] = [
    { type: 'system', content: 'Olá do Blip', promptId: 'p1' },
    { type: 'human', content: 'Exemplo', promptId: 'p2' },
    { type: 'short-term-memory', config: { length: 30 }, promptId: 'p3' },
  ];
  settings['contentSafety'] = { hate: { severity: 'High' } };
  settings['input'] = { audio: { enableInputForwarding: false } };
  mapa['onboarding']!.$defaultOutput = { stateId: 'ai-agent:blip' };
  mapa['ai-agent:blip'] = blip;
  const text = exportText(mapa, {});
  const back = validateImport(text);
  assert.ok(back.ok);
  assert.deepEqual(back.mapa['ai-agent:blip'], JSON.parse(JSON.stringify(blip)));
  const read = back.mapa['ai-agent:blip']!;
  assert.deepEqual(agentInstructions(read), ['Olá do Blip']);
  assert.deepEqual(agentMemory(read), { enabled: true, length: 30 });
  // Editing the instructions keeps the Blip extras and the other prompt entries.
  const edited = setAgentInstructions(read, ['Novo texto']);
  const s = agentSettingsOf(edited);
  assert.deepEqual(s['contentSafety'], { hate: { severity: 'High' } });
  assert.deepEqual((s['prompt'] as { type: string }[]).map((p) => p.type), ['system', 'human', 'short-term-memory']);
  assert.equal(edited['stateVersion'], '1.0.1');
});

test('duplicate keeps the ai-agent: prefix and the self default output; hasAiAgent finds agents', () => {
  const mapa = base();
  const agent = configured(mapa);
  mapa[agent.id] = agent;
  const copy = duplicateBlock(mapa, agent.id, 'copia');
  const dup = copy['ai-agent:copia']!;
  assert.ok(dup);
  assert.equal(dup.$defaultOutput?.stateId, 'ai-agent:copia');
  assert.equal(hasAiAgent(base()), false);
  assert.equal(hasAiAgent(base(), mapa), true);
});
