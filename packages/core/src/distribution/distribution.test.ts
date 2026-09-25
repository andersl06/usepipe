import { describe, expect, it } from 'vitest';

import {
  cargaPonderada,
  escolherAgent,
  elegivel,
  motivoInelegivel,
  vagas,
  type AgentDisponivel,
  type MotivoInelegivel,
} from './index.js';

function em(relogio: string): Date {
  return new Date(`2026-03-02T${relogio}Z`);
}

function agent(parcial: Partial<AgentDisponivel> & { id: string }): AgentDisponivel {
  return {
    state: 'online',
    queues: ['suporte'],
    limiteSimultaneo: 5,
    ativas: 0,
    aguardandoAgent: 0,
    withoutFirstResposta: 0,
    ultimaAssignmentIn: em('10:00:00'),
    ...parcial,
  };
}

const QUEUE = { queueId: 'suporte' };

describe('carga ponderada', () => {
  const casos: {
    nome: string;
    ativas: number;
    aguardandoAgent: number;
    esperado: number;
  }[] = [
    // Peso 2 para conversa que aguarda o atendente, 1 para a que aguarda o cliente.
    { nome: 'sem conversa nenhuma', ativas: 0, aguardandoAgent: 0, esperado: 0 },
    { nome: '4 ativas, 1 quente: 1×2 + 3×1', ativas: 4, aguardandoAgent: 1, esperado: 5 },
    { nome: '3 ativas, 2 quentes: 2×2 + 1×1', ativas: 3, aguardandoAgent: 2, esperado: 5 },
    { nome: '10 paradas pesam menos que 10 quentes', ativas: 10, aguardandoAgent: 0, esperado: 10 },
    { nome: '10 quentes', ativas: 10, aguardandoAgent: 10, esperado: 20 },
    { nome: 'dado inconsistente não gera carga negativa', ativas: 2, aguardandoAgent: 9, esperado: 4 },
  ];

  for (const caso of casos) {
    it(caso.nome, () => {
      expect(
        cargaPonderada(
          agent({ id: 'a', ativas: caso.ativas, aguardandoAgent: caso.aguardandoAgent }),
        ),
      ).toBe(caso.esperado);
    });
  }

  it('aceita pesos configurados pelo tenant', () => {
    const a = agent({ id: 'a', ativas: 4, aguardandoAgent: 2 });
    expect(cargaPonderada(a, { pesoAguardandoAgent: 3, pesoAguardandoCliente: 1 })).toBe(8);
  });
});

describe('eligibility (§7)', () => {
  const casos: { nome: string; agent: AgentDisponivel; motivo: MotivoInelegivel | null }[] = [
    { nome: 'online, na fila e com vaga', agent: agent({ id: 'ok', ativas: 2 }), motivo: null },
    { nome: 'não pertence à fila', agent: agent({ id: 'x', queues: ['vendas'] }), motivo: 'fora_da_fila' },
    { nome: 'em pausa', agent: agent({ id: 'x', state: 'pausa' }), motivo: 'nao_esta_online' },
    { nome: 'invisível', agent: agent({ id: 'x', state: 'invisivel' }), motivo: 'nao_esta_online' },
    { nome: 'offline', agent: agent({ id: 'x', state: 'offline' }), motivo: 'nao_esta_online' },
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
    const acumulador = agent({ id: 'x', ativas: 1, withoutFirstResposta: 3 });
    expect(motivoInelegivel(acumulador, { ...QUEUE, tetoWithoutFirstResposta: 3 })).toBe(
      'teto_sem_primeira_resposta',
    );
    expect(motivoInelegivel(acumulador, { ...QUEUE, tetoWithoutFirstResposta: 4 })).toBeNull();
    // Sem teto configurado, a regra não se aplica.
    expect(motivoInelegivel(acumulador, QUEUE)).toBeNull();
    expect(motivoInelegivel(acumulador, { ...QUEUE, tetoWithoutFirstResposta: null })).toBeNull();
  });

  it('vagas nunca é negativo', () => {
    expect(vagas(agent({ id: 'x', limiteSimultaneo: 3, ativas: 9 }))).toBe(0);
    expect(vagas(agent({ id: 'x', limiteSimultaneo: 3, ativas: 1 }))).toBe(2);
  });
});

describe('choice by load', () => {
  it('1º critério: menor carga ponderada', () => {
    const a1 = agent({ id: 'a1', ativas: 4, aguardandoAgent: 1 }); // carga 5
    const a2 = agent({ id: 'a2', ativas: 3, aguardandoAgent: 2 }); // carga 5
    const a3 = agent({ id: 'a3', ativas: 2, aguardandoAgent: 2 }); // carga 4
    const escolha = escolherAgent([a1, a2, a3], QUEUE);
    expect(escolha.escolhido?.id).toBe('a3');
    expect(escolha.elegiveis.map((a) => a.id)).toEqual(['a3', 'a1', 'a2']);
  });

  it('2nd criterion: a tie on load goes to whoever has gone longest without receiving one', () => {
    const a1 = agent({ id: 'a1', ativas: 4, aguardandoAgent: 1, ultimaAssignmentIn: em('10:00:00') });
    const a2 = agent({ id: 'a2', ativas: 3, aguardandoAgent: 2, ultimaAssignmentIn: em('09:00:00') });
    expect(escolherAgent([a1, a2], QUEUE).escolhido?.id).toBe('a2');
  });

  it('whoever never received a conversation wins the tiebreak by idle time', () => {
    const a1 = agent({ id: 'a1', ativas: 2, ultimaAssignmentIn: em('08:00:00') });
    const novato = agent({ id: 'z9', ativas: 2, ultimaAssignmentIn: null });
    expect(escolherAgent([a1, novato], QUEUE).escolhido?.id).toBe('z9');
  });

  it('3rd criterion: a persistent tie is resolved by identifier, stably', () => {
    const a = agent({ id: 'aaa', ativas: 2, aguardandoAgent: 1, ultimaAssignmentIn: em('09:30:00') });
    const b = agent({ id: 'bbb', ativas: 2, aguardandoAgent: 1, ultimaAssignmentIn: em('09:30:00') });
    expect(escolherAgent([a, b], QUEUE).escolhido?.id).toBe('aaa');
    // A ordem da entrada não pode mudar o resultado.
    expect(escolherAgent([b, a], QUEUE).escolhido?.id).toBe('aaa');
  });

  it('picks no one when no one is eligible, and says why', () => {
    const escolha = escolherAgent(
      [
        agent({ id: 'a1', state: 'pausa' }),
        agent({ id: 'a2', queues: ['vendas'] }),
        agent({ id: 'a3', limiteSimultaneo: 2, ativas: 2 }),
        agent({ id: 'a4', withoutFirstResposta: 5 }),
      ],
      { ...QUEUE, tetoWithoutFirstResposta: 5 },
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
    expect(escolherAgent([], QUEUE)).toEqual({ escolhido: null, elegiveis: [], descartados: [] });
  });

  it('ten idle conversations are not worth the same as ten hot ones', () => {
    const parado = agent({ id: 'parado', limiteSimultaneo: 20, ativas: 10, aguardandoAgent: 0 });
    const quente = agent({ id: 'quente', limiteSimultaneo: 20, ativas: 6, aguardandoAgent: 6 });
    // carga do parado = 10; carga do quente = 12. O rodízio por "menos tickets"
    // escolheria o quente (6 < 10); a carga real escolhe o parado.
    expect(escolherAgent([parado, quente], QUEUE).escolhido?.id).toBe('parado');
  });
});
