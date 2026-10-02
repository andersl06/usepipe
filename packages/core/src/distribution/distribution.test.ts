import { describe, expect, it } from 'vitest';

import {
  cargaPonderada,
  chooseAgent,
  elegivel,
  motivoInelegivel,
  vagas,
  type AgentAvailable,
  type MotivoInelegivel,
} from './index.js';

function em(relogio: string): Date {
  return new Date(`2026-03-02T${relogio}Z`);
}

function agent(parcial: Partial<AgentAvailable> & { id: string }): AgentAvailable {
  return {
    state: 'Online',
    queues: ['suporte'],
    limiteSimultaneo: 5,
    ativas: 0,
    waitingAgent: 0,
    withoutFirstResponse: 0,
    lastAssignmentIn: em('10:00:00'),
    ...parcial,
  };
}

const QUEUE = { queueId: 'suporte' };

describe('carga ponderada', () => {
  const casos: {
    nome: string;
    ativas: number;
    waitingAgent: number;
    esperado: number;
  }[] = [
    { nome: 'sem conversa nenhuma', ativas: 0, waitingAgent: 0, esperado: 0 },
    { nome: '4 ativas, 1 quente: 1×2 + 3×1', ativas: 4, waitingAgent: 1, esperado: 5 },
    { nome: '3 ativas, 2 quentes: 2×2 + 1×1', ativas: 3, waitingAgent: 2, esperado: 5 },
    { nome: '10 paradas pesam menos que 10 quentes', ativas: 10, waitingAgent: 0, esperado: 10 },
    { nome: '10 quentes', ativas: 10, waitingAgent: 10, esperado: 20 },
    { nome: 'dado inconsistente não gera carga negativa', ativas: 2, waitingAgent: 9, esperado: 4 },
  ];

  for (const caso of casos) {
    it(caso.nome, () => {
      expect(
        cargaPonderada(
          agent({ id: 'a', ativas: caso.ativas, waitingAgent: caso.waitingAgent }),
        ),
      ).toBe(caso.esperado);
    });
  }

  it('aceita pesos configurados pelo tenant', () => {
    const a = agent({ id: 'a', ativas: 4, waitingAgent: 2 });
    expect(cargaPonderada(a, { weightWaitingAgent: 3, pesoAguardandoCliente: 1 })).toBe(8);
  });
});

describe('eligibility (§7)', () => {
  const casos: { nome: string; agent: AgentAvailable; motivo: MotivoInelegivel | null }[] = [
    { nome: 'online, na fila e com vaga', agent: agent({ id: 'ok', ativas: 2 }), motivo: null },
    { nome: 'não pertence à fila', agent: agent({ id: 'x', queues: ['vendas'] }), motivo: 'fora_da_fila' },
    { nome: 'em pausa', agent: agent({ id: 'x', state: 'Pause' }), motivo: 'nao_esta_online' },
    { nome: 'invisível', agent: agent({ id: 'x', state: 'Invisible' }), motivo: 'nao_esta_online' },
    { nome: 'offline', agent: agent({ id: 'x', state: 'Offline' }), motivo: 'nao_esta_online' },
    { nome: 'sem vaga: ativas igual ao limite', agent: agent({ id: 'x', limiteSimultaneo: 5, ativas: 5 }), motivo: 'sem_vaga' },
    { nome: 'estourou o limite', agent: agent({ id: 'x', limiteSimultaneo: 5, ativas: 7 }), motivo: 'sem_vaga' },
    { nome: 'última vaga ainda serve', agent: agent({ id: 'x', limiteSimultaneo: 5, ativas: 4 }), motivo: null },
  ];

  for (const caso of casos) {
    it(caso.nome, () => {
      expect(motivoInelegivel(caso.agent, QUEUE)).toBe(caso.motivo);
      expect(elegivel(caso.agent, QUEUE)).toBe(caso.motivo === null);
    });
  }

  it('the second ceiling: assigned conversations without a first response', () => {
    const acumulador = agent({ id: 'x', ativas: 1, withoutFirstResponse: 3 });
    expect(motivoInelegivel(acumulador, { ...QUEUE, ceilingWithoutFirstResponse: 3 })).toBe(
      'teto_sem_primeira_resposta',
    );
    expect(motivoInelegivel(acumulador, { ...QUEUE, ceilingWithoutFirstResponse: 4 })).toBeNull();
    expect(motivoInelegivel(acumulador, QUEUE)).toBeNull();
    expect(motivoInelegivel(acumulador, { ...QUEUE, ceilingWithoutFirstResponse: null })).toBeNull();
  });

  it('vagas nunca é negativo', () => {
    expect(vagas(agent({ id: 'x', limiteSimultaneo: 3, ativas: 9 }))).toBe(0);
    expect(vagas(agent({ id: 'x', limiteSimultaneo: 3, ativas: 1 }))).toBe(2);
  });
});

describe('choice by load', () => {
  it('1º critério: menor carga ponderada', () => {
    const a1 = agent({ id: 'a1', ativas: 4, waitingAgent: 1 }); // carga 5
    const a2 = agent({ id: 'a2', ativas: 3, waitingAgent: 2 }); // carga 5
    const a3 = agent({ id: 'a3', ativas: 2, waitingAgent: 2 }); // carga 4
    const escolha = chooseAgent([a1, a2, a3], QUEUE);
    expect(escolha.escolhido?.id).toBe('a3');
    expect(escolha.elegiveis.map((a) => a.id)).toEqual(['a3', 'a1', 'a2']);
  });

  it('2nd criterion: a tie on load goes to whoever has gone longest without receiving one', () => {
    const a1 = agent({ id: 'a1', ativas: 4, waitingAgent: 1, lastAssignmentIn: em('10:00:00') });
    const a2 = agent({ id: 'a2', ativas: 3, waitingAgent: 2, lastAssignmentIn: em('09:00:00') });
    expect(chooseAgent([a1, a2], QUEUE).escolhido?.id).toBe('a2');
  });

  it('whoever never received a conversation wins the tiebreak by idle time', () => {
    const a1 = agent({ id: 'a1', ativas: 2, lastAssignmentIn: em('08:00:00') });
    const novato = agent({ id: 'z9', ativas: 2, lastAssignmentIn: null });
    expect(chooseAgent([a1, novato], QUEUE).escolhido?.id).toBe('z9');
  });

  it('3rd criterion: a persistent tie is resolved by identifier, stably', () => {
    const a = agent({ id: 'aaa', ativas: 2, waitingAgent: 1, lastAssignmentIn: em('09:30:00') });
    const b = agent({ id: 'bbb', ativas: 2, waitingAgent: 1, lastAssignmentIn: em('09:30:00') });
    expect(chooseAgent([a, b], QUEUE).escolhido?.id).toBe('aaa');
    expect(chooseAgent([b, a], QUEUE).escolhido?.id).toBe('aaa');
  });

  it('picks no one when no one is eligible, and says why', () => {
    const escolha = chooseAgent(
      [
        agent({ id: 'a1', state: 'Pause' }),
        agent({ id: 'a2', queues: ['vendas'] }),
        agent({ id: 'a3', limiteSimultaneo: 2, ativas: 2 }),
        agent({ id: 'a4', withoutFirstResponse: 5 }),
      ],
      { ...QUEUE, ceilingWithoutFirstResponse: 5 },
    );
    expect(escolha.escolhido).toBeNull();
    expect(escolha.elegiveis).toEqual([]);
    expect(escolha.descartados).toEqual([
      { agentId: 'a1', motivo: 'nao_esta_online' },
      { agentId: 'a2', motivo: 'fora_da_fila' },
      { agentId: 'a3', motivo: 'sem_vaga' },
      { agentId: 'a4', motivo: 'teto_sem_primeira_resposta' },
    ]);
  });

  it('lista vazia não quebra', () => {
    expect(chooseAgent([], QUEUE)).toEqual({ escolhido: null, elegiveis: [], descartados: [] });
  });

  it('ten idle conversations are not worth the same as ten hot ones', () => {
    const parado = agent({ id: 'parado', limiteSimultaneo: 20, ativas: 10, waitingAgent: 0 });
    const quente = agent({ id: 'quente', limiteSimultaneo: 20, ativas: 6, waitingAgent: 6 });
    // Idle agent load is 10; busy agent load is 12. Round-robin by fewer tickets would pick the busy agent (6 < 10); actual load picks the idle agent.
    // escolheria o quente (6 < 10); a carga real escolhe o parado.
    expect(chooseAgent([parado, quente], QUEUE).escolhido?.id).toBe('parado');
  });
});

describe('modo de distribuição', () => {
  it('mais_tempo_sem_receber prefere quem está há mais tempo parado, mesmo com mais carga', () => {
    const parado = agent({ id: 'a', ativas: 3, lastAssignmentIn: em('08:00:00') });
    const folgado = agent({ id: 'b', ativas: 0, lastAssignmentIn: em('11:00:00') });
    expect(chooseAgent([parado, folgado], QUEUE).escolhido?.id).toBe('b');
    expect(chooseAgent([parado, folgado], { ...QUEUE, mode: 'menos_ativos' }).escolhido?.id).toBe('b');
    expect(chooseAgent([parado, folgado], { ...QUEUE, mode: 'mais_tempo_sem_receber' }).escolhido?.id).toBe('a');
  });

  it('mais_tempo_sem_receber desempata pela menor carga', () => {
    const cheio = agent({ id: 'a', ativas: 3, lastAssignmentIn: em('08:00:00') });
    const vazio = agent({ id: 'b', ativas: 1, lastAssignmentIn: em('08:00:00') });
    expect(chooseAgent([cheio, vazio], { ...QUEUE, mode: 'mais_tempo_sem_receber' }).escolhido?.id).toBe('b');
  });
});
