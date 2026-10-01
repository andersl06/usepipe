import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newBlock, attendanceNewBlock, type Mapa } from '../src/pages/builder/model.ts';
import { addChips, splitChipText } from '@pipe/ui/chip-values';
import {
  draftToApi,
  newRuleDraft,
  nextRuleName,
  ruleDraftState,
  ruleToDraft,
  filterQueues,
  hasAttendanceBlock,
  pageQueues,
  queueNameError,
  queueRenameError,
  queueRules,
  queuesPanelReducer,
  renameBlockReason,
} from '../src/pages/builder/queues-panel.ts';
import type { QueueRule } from '../src/lib/rule-queue.ts';

test('hasAttendanceBlock: false com um mapa sem bloco de atendimento', () => {
  const mapa: Mapa = { inicio: newBlock({}, { top: 0, left: 0 }, 'inicio') };
  assert.equal(hasAttendanceBlock(mapa), false);
});

test('hasAttendanceBlock: true com pelo menos um bloco de atendimento', () => {
  const humano = attendanceNewBlock({}, { top: 0, left: 0 });
  const mapa: Mapa = { inicio: newBlock({}, { top: 0, left: 0 }, 'inicio'), [humano.id]: humano };
  assert.equal(hasAttendanceBlock(mapa), true);
});

test('queueNameError: nome vazio', () => {
  assert.equal(queueNameError('', []), 'Você precisa dar um nome para essa fila');
  assert.equal(queueNameError('   ', []), 'Você precisa dar um nome para essa fila');
});

test('queueNameError: nome repetido, sem diferenciar maiúsculas', () => {
  assert.equal(queueNameError('suporte', [{ name: 'Suporte' }]), 'Já existe uma fila com esse nome.');
});

test('queueNameError: DIRECT_TRANSFER é reservado', () => {
  assert.equal(queueNameError('DIRECT_TRANSFER', []), 'reservado');
  assert.equal(queueNameError('direct_transfer', []), 'reservado');
});

test('queueNameError: nome válido não gera erro', () => {
  assert.equal(queueNameError('Cobrança', [{ name: 'Suporte' }]), null);
});

test('queueNameError: espaços nas pontas não contam', () => {
  assert.equal(queueNameError('  Suporte  ', [{ name: 'Suporte' }]), 'Já existe uma fila com esse nome.');
});

test('filterQueues: casa por nome sem diferenciar maiúsculas', () => {
  const filas = [{ name: 'Suporte' }, { name: 'Financeiro' }];
  assert.deepEqual(filterQueues(filas, 'sup'), [{ name: 'Suporte' }]);
});

test('filterQueues: termo vazio devolve tudo', () => {
  const filas = [{ name: 'Suporte' }, { name: 'Financeiro' }];
  assert.deepEqual(filterQueues(filas, '  '), filas);
});

test('pageQueues: 100 por página', () => {
  const filas = Array.from({ length: 150 }, (_, i) => ({ name: `Fila ${i}` }));
  const pagina1 = pageQueues(filas, 1);
  assert.equal(pagina1.visiveis.length, 100);
  assert.equal(pagina1.total, 150);
  assert.equal(pagina1.temMais, true);

  const pagina2 = pageQueues(filas, 2);
  assert.equal(pagina2.visiveis.length, 150);
  assert.equal(pagina2.temMais, false);
});

test('queuesPanelReducer: lista -> abrirCriar -> criar', () => {
  const estado = queuesPanelReducer({ modo: 'lista' }, { tipo: 'abrirCriar' });
  assert.deepEqual(estado, { modo: 'criar' });
});

test('queuesPanelReducer: criada(id) -> regras(id)', () => {
  const estado = queuesPanelReducer({ modo: 'criar' }, { tipo: 'criada', id: 'f1' });
  assert.deepEqual(estado, { modo: 'regras', id: 'f1' });
});

test('queuesPanelReducer: editar(id) -> regras(id)', () => {
  const estado = queuesPanelReducer({ modo: 'lista' }, { tipo: 'editar', id: 'f2' });
  assert.deepEqual(estado, { modo: 'regras', id: 'f2' });
});

test('queuesPanelReducer: voltar -> lista', () => {
  const estado = queuesPanelReducer({ modo: 'regras', id: 'f2' }, { tipo: 'voltar' });
  assert.deepEqual(estado, { modo: 'lista' });
});

function regra(over: Partial<QueueRule>): QueueRule {
  return {
    id: 'r1',
    name: 'Regra',
    order: 0,
    combiner: 'e',
    queueDestinationId: 'f1',
    queueDestinationName: 'Fila',
    active: true,
    conditions: [],
    ...over,
  };
}

test('queueRules: só as regras da fila pedida, ordenadas por order', () => {
  const regras = [
    regra({ id: 'a', queueDestinationId: 'f1', order: 2 }),
    regra({ id: 'b', queueDestinationId: 'f2', order: 0 }),
    regra({ id: 'c', queueDestinationId: 'f1', order: 1 }),
  ];
  assert.deepEqual(
    queueRules(regras, 'f1').map((r) => r.id),
    ['c', 'a'],
  );
});

test('renameBlockReason: null com 0 atendentes, 0 regras e permissão', () => {
  assert.equal(renameBlockReason({ agents: [] }, 0, true), null);
});

test('renameBlockReason: atendentes tem prioridade sobre regras e permissão', () => {
  assert.equal(renameBlockReason({ agents: [{}] }, 1, false), 'atendentes');
});

test('renameBlockReason: regras quando não há atendentes', () => {
  assert.equal(renameBlockReason({ agents: [] }, 1, true), 'regras');
});

test('renameBlockReason: permissão só quando não há atendentes nem regras', () => {
  assert.equal(renameBlockReason({ agents: [] }, 0, false), 'permissao');
});

test('queueRenameError: nome curto', () => {
  assert.equal(queueRenameError('ab', []), 'Esse campo deve ter no mínimo 3 caracteres.');
});

test('queueRenameError: nome repetido usa o mesmo texto de queueNameError', () => {
  assert.equal(
    queueRenameError('Suporte', [{ name: 'Suporte' }]),
    queueNameError('Suporte', [{ name: 'Suporte' }]),
  );
});

test('queueRenameError: nome válido não gera erro', () => {
  assert.equal(queueRenameError('Cobrança', [{ name: 'Suporte' }]), null);
});

test('splitChipText: vírgula, | e ; fecham chips; o resto continua digitado', () => {
  assert.deepEqual(splitChipText('boleto, pix|cartão;  ;fat'), { chips: ['boleto', 'pix', 'cartão'], rest: 'fat' });
  assert.deepEqual(splitChipText('sem delimitador'), { chips: [], rest: 'sem delimitador' });
});

test('addChips: ignora vazio e repetido', () => {
  assert.deepEqual(addChips(['a'], [' a ', '', 'b', 'b']), ['a', 'b']);
});

test('nextRuleName: sequencial e pula nome já usado', () => {
  assert.equal(nextRuleName([]), 'Regra 1');
  assert.equal(nextRuleName([{ name: 'Regra 1' }]), 'Regra 2');
  assert.equal(nextRuleName([{ name: 'Outra' }, { name: 'Regra 3' }]), 'Regra 4');
});

test('ruleDraftState: Confirmar desabilitado com valor vazio', () => {
  const draft = newRuleDraft([]);
  const estado = ruleDraftState(draft);
  assert.deepEqual(estado.valuesMissing, [true]);
  assert.equal(estado.confirmDisabled, true);
  draft.conditions[0]!.values = ['boleto'];
  assert.equal(ruleDraftState(draft).confirmDisabled, false);
});

test('ruleDraftState: Extras Contato exige a propriedade', () => {
  const draft = newRuleDraft([]);
  draft.conditions[0] = { source: 'Contact.Extras', extraKey: '', comparison: 'Equals', values: ['ouro'] };
  assert.equal(ruleDraftState(draft).confirmDisabled, true);
  draft.conditions[0].extraKey = 'plano';
  assert.equal(ruleDraftState(draft).confirmDisabled, false);
  assert.deepEqual(draftToApi(draft)?.conditions, [{ campo: 'contato.atributos.plano', operador: 'igual', value: 'ouro' }]);
});

test('draftToApi: uma condição com vários chips vira OU; negada vira E', () => {
  const draft = newRuleDraft([]);
  draft.conditions[0]!.values = ['boleto', 'pix'];
  assert.deepEqual(draftToApi(draft), {
    combiner: 'ou',
    conditions: [
      { campo: 'mensagem', operador: 'contem', value: 'boleto' },
      { campo: 'mensagem', operador: 'contem', value: 'pix' },
    ],
  });
  draft.conditions[0]!.comparison = 'NotContains';
  assert.equal(draftToApi(draft)?.combiner, 'e');
});

test('draftToApi: E com várias condições não guarda "qualquer um" de chips', () => {
  const draft = newRuleDraft([]);
  draft.conditions = [
    { source: 'Message', extraKey: '', comparison: 'Contains', values: ['boleto', 'pix'] },
    { source: 'Contact.Name', extraKey: '', comparison: 'Equals', values: ['Ana'] },
  ];
  assert.equal(draftToApi(draft), null);
  assert.equal(ruleDraftState(draft).confirmDisabled, true);
});

test('ruleToDraft -> draftToApi preserva a regra guardada', () => {
  const regra: QueueRule = {
    id: 'r1',
    name: 'Cobrança',
    order: 0,
    combiner: 'ou',
    queueDestinationId: 'f1',
    queueDestinationName: 'Financeiro',
    active: true,
    conditions: [
      { field: 'mensagem', operator: 'contem', value: 'boleto' },
      { field: 'mensagem', operator: 'contem', value: 'pix' },
    ],
  };
  const draft = ruleToDraft(regra);
  assert.equal(draft.conditions.length, 1);
  assert.deepEqual(draft.conditions[0]!.values, ['boleto', 'pix']);
  assert.deepEqual(draftToApi(draft), {
    combiner: 'ou',
    conditions: regra.conditions.map((c) => ({ campo: c.field, operador: c.operator, value: c.value })),
  });

  const mista: QueueRule = {
    ...regra,
    conditions: [
      { field: 'contato.telefone', operator: 'igual', value: '5511' },
      { field: 'mensagem', operator: 'nao_contem', value: 'spam' },
    ],
  };
  const d2 = ruleToDraft(mista);
  assert.equal(d2.conditions[0]!.source, 'contato.telefone');
  assert.deepEqual(draftToApi(d2), {
    combiner: 'ou',
    conditions: mista.conditions.map((c) => ({ campo: c.field, operador: c.operator, value: c.value })),
  });
});

test('withFlow anexa flowId codificado', async () => {
  const { withFlow } = await import('../src/lib/flow-scope.ts');
  assert.equal(withFlow('/v1/management/agents/queues', 'f1'), '/v1/management/agents/queues?flowId=f1');
  assert.equal(withFlow('/x?a=1', 'f1'), '/x?a=1&flowId=f1');
  assert.equal(withFlow('/x', 'a b'), '/x?flowId=a%20b');
});
