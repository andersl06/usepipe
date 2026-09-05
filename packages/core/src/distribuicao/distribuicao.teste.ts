import { describe, expect, it } from 'vitest';

import {
  cargaPonderada,
  escolherAtendente,
  elegivel,
  motivoInelegivel,
  vagas,
  type AtendenteDisponivel,
  type MotivoInelegivel,
} from './index.js';

function em(relogio: string): Date {
  return new Date(`2026-03-02T${relogio}Z`);
}

function atendente(parcial: Partial<AtendenteDisponivel> & { id: string }): AtendenteDisponivel {
  return {
    estado: 'online',
    filas: ['suporte'],
    limiteSimultaneo: 5,
    ativas: 0,
    aguardandoAtendente: 0,
    semPrimeiraResposta: 0,
    ultimaAtribuicaoEm: em('10:00:00'),
    ...parcial,
  };
}

const FILA = { filaId: 'suporte' };

describe('carga ponderada', () => {
  const casos: {
    nome: string;
    ativas: number;
    aguardandoAtendente: number;
    esperado: number;
  }[] = [
    // Peso 2 para conversa que aguarda o atendente, 1 para a que aguarda o cliente.
    { nome: 'sem conversa nenhuma', ativas: 0, aguardandoAtendente: 0, esperado: 0 },
    { nome: '4 ativas, 1 quente: 1×2 + 3×1', ativas: 4, aguardandoAtendente: 1, esperado: 5 },
    { nome: '3 ativas, 2 quentes: 2×2 + 1×1', ativas: 3, aguardandoAtendente: 2, esperado: 5 },
    { nome: '10 paradas pesam menos que 10 quentes', ativas: 10, aguardandoAtendente: 0, esperado: 10 },
    { nome: '10 quentes', ativas: 10, aguardandoAtendente: 10, esperado: 20 },
    { nome: 'dado inconsistente não gera carga negativa', ativas: 2, aguardandoAtendente: 9, esperado: 4 },
  ];

  for (const caso of casos) {
    it(caso.nome, () => {
      expect(
        cargaPonderada(
          atendente({ id: 'a', ativas: caso.ativas, aguardandoAtendente: caso.aguardandoAtendente }),
        ),
      ).toBe(caso.esperado);
    });
  }

  it('aceita pesos configurados pelo tenant', () => {
    const a = atendente({ id: 'a', ativas: 4, aguardandoAtendente: 2 });
    expect(cargaPonderada(a, { pesoAguardandoAtendente: 3, pesoAguardandoCliente: 1 })).toBe(8);
  });
});

describe('elegibilidade (§7)', () => {
  const casos: { nome: string; atendente: AtendenteDisponivel; motivo: MotivoInelegivel | null }[] = [
    { nome: 'online, na fila e com vaga', atendente: atendente({ id: 'ok', ativas: 2 }), motivo: null },
    { nome: 'não pertence à fila', atendente: atendente({ id: 'x', filas: ['vendas'] }), motivo: 'fora_da_fila' },
    { nome: 'em pausa', atendente: atendente({ id: 'x', estado: 'pausa' }), motivo: 'nao_esta_online' },
    { nome: 'invisível', atendente: atendente({ id: 'x', estado: 'invisivel' }), motivo: 'nao_esta_online' },
    { nome: 'offline', atendente: atendente({ id: 'x', estado: 'offline' }), motivo: 'nao_esta_online' },
    { nome: 'sem vaga: ativas igual ao limite', atendente: atendente({ id: 'x', limiteSimultaneo: 5, ativas: 5 }), motivo: 'sem_vaga' },
    { nome: 'estourou o limite', atendente: atendente({ id: 'x', limiteSimultaneo: 5, ativas: 7 }), motivo: 'sem_vaga' },
    { nome: 'última vaga ainda serve', atendente: atendente({ id: 'x', limiteSimultaneo: 5, ativas: 4 }), motivo: null },
  ];

  for (const caso of casos) {
    it(caso.nome, () => {
      expect(motivoInelegivel(caso.atendente, FILA)).toBe(caso.motivo);
      expect(elegivel(caso.atendente, FILA)).toBe(caso.motivo === null);
    });
  }

  it('o segundo teto: conversas atribuídas sem primeira resposta', () => {
    const acumulador = atendente({ id: 'x', ativas: 1, semPrimeiraResposta: 3 });
    expect(motivoInelegivel(acumulador, { ...FILA, tetoSemPrimeiraResposta: 3 })).toBe(
      'teto_sem_primeira_resposta',
    );
    expect(motivoInelegivel(acumulador, { ...FILA, tetoSemPrimeiraResposta: 4 })).toBeNull();
    // Sem teto configurado, a regra não se aplica.
    expect(motivoInelegivel(acumulador, FILA)).toBeNull();
    expect(motivoInelegivel(acumulador, { ...FILA, tetoSemPrimeiraResposta: null })).toBeNull();
  });

  it('vagas nunca é negativo', () => {
    expect(vagas(atendente({ id: 'x', limiteSimultaneo: 3, ativas: 9 }))).toBe(0);
    expect(vagas(atendente({ id: 'x', limiteSimultaneo: 3, ativas: 1 }))).toBe(2);
  });
});

describe('escolha por carga', () => {
  it('1º critério: menor carga ponderada', () => {
    const a1 = atendente({ id: 'a1', ativas: 4, aguardandoAtendente: 1 }); // carga 5
    const a2 = atendente({ id: 'a2', ativas: 3, aguardandoAtendente: 2 }); // carga 5
    const a3 = atendente({ id: 'a3', ativas: 2, aguardandoAtendente: 2 }); // carga 4
    const escolha = escolherAtendente([a1, a2, a3], FILA);
    expect(escolha.escolhido?.id).toBe('a3');
    expect(escolha.elegiveis.map((a) => a.id)).toEqual(['a3', 'a1', 'a2']);
  });

  it('2º critério: empate na carga vai para quem está há mais tempo sem receber', () => {
    const a1 = atendente({ id: 'a1', ativas: 4, aguardandoAtendente: 1, ultimaAtribuicaoEm: em('10:00:00') });
    const a2 = atendente({ id: 'a2', ativas: 3, aguardandoAtendente: 2, ultimaAtribuicaoEm: em('09:00:00') });
    expect(escolherAtendente([a1, a2], FILA).escolhido?.id).toBe('a2');
  });

  it('quem nunca recebeu conversa ganha o desempate por tempo ocioso', () => {
    const a1 = atendente({ id: 'a1', ativas: 2, ultimaAtribuicaoEm: em('08:00:00') });
    const novato = atendente({ id: 'z9', ativas: 2, ultimaAtribuicaoEm: null });
    expect(escolherAtendente([a1, novato], FILA).escolhido?.id).toBe('z9');
  });

  it('3º critério: empate persistente resolve por identificador, de forma estável', () => {
    const a = atendente({ id: 'aaa', ativas: 2, aguardandoAtendente: 1, ultimaAtribuicaoEm: em('09:30:00') });
    const b = atendente({ id: 'bbb', ativas: 2, aguardandoAtendente: 1, ultimaAtribuicaoEm: em('09:30:00') });
    expect(escolherAtendente([a, b], FILA).escolhido?.id).toBe('aaa');
    // A ordem da entrada não pode mudar o resultado.
    expect(escolherAtendente([b, a], FILA).escolhido?.id).toBe('aaa');
  });

  it('não escolhe ninguém quando ninguém é elegível, e diz por quê', () => {
    const escolha = escolherAtendente(
      [
        atendente({ id: 'a1', estado: 'pausa' }),
        atendente({ id: 'a2', filas: ['vendas'] }),
        atendente({ id: 'a3', limiteSimultaneo: 2, ativas: 2 }),
        atendente({ id: 'a4', semPrimeiraResposta: 5 }),
      ],
      { ...FILA, tetoSemPrimeiraResposta: 5 },
    );
    expect(escolha.escolhido).toBeNull();
    expect(escolha.elegiveis).toEqual([]);
    expect(escolha.descartados).toEqual([
      { atendenteId: 'a1', motivo: 'nao_esta_online' },
      { atendenteId: 'a2', motivo: 'fora_da_fila' },
      { atendenteId: 'a3', motivo: 'sem_vaga' },
      { atendenteId: 'a4', motivo: 'teto_sem_primeira_resposta' },
    ]);
  });

  it('lista vazia não quebra', () => {
    expect(escolherAtendente([], FILA)).toEqual({ escolhido: null, elegiveis: [], descartados: [] });
  });

  it('dez conversas paradas não valem o mesmo que dez conversas quentes', () => {
    const parado = atendente({ id: 'parado', limiteSimultaneo: 20, ativas: 10, aguardandoAtendente: 0 });
    const quente = atendente({ id: 'quente', limiteSimultaneo: 20, ativas: 6, aguardandoAtendente: 6 });
    // carga do parado = 10; carga do quente = 12. O rodízio por "menos tickets"
    // escolheria o quente (6 < 10); a carga real escolhe o parado.
    expect(escolherAtendente([parado, quente], FILA).escolhido?.id).toBe('parado');
  });
});
