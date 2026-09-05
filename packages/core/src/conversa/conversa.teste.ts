import { describe, expect, it } from 'vitest';

import {
  ESTADOS_CONVERSA,
  TransicaoEntregaInvalidaError,
  TransicaoInvalidaError,
  aplicarEvento,
  estadoAlvoDoEvento,
  reproduzirEventos,
  tentarAplicarEvento,
  tentarTransitar,
  transicaoEntregaPermitida,
  transicaoPermitida,
  transitar,
  transitarEntrega,
  type EstadoConversa,
  type EstadoEntrega,
} from './index.js';
import type { TipoEvento } from '../metricas/eventos.js';

/**
 * Tabela completa das 25 combinações do diagrama da §8.
 * `true` = aresta que existe no desenho; todo o resto tem de ser recusado.
 */
const PERMITIDAS: [EstadoConversa, EstadoConversa][] = [
  ['na_fila', 'atribuida'],
  ['na_fila', 'encerrada'],
  ['atribuida', 'em_atendimento'],
  ['atribuida', 'encerrada'],
  ['em_atendimento', 'em_espera'],
  ['em_atendimento', 'encerrada'],
  ['em_espera', 'em_atendimento'],
  ['em_espera', 'encerrada'],
  ['encerrada', 'na_fila'],
];

function ehPermitida(de: EstadoConversa, para: EstadoConversa): boolean {
  return PERMITIDAS.some(([d, p]) => d === de && p === para);
}

describe('tabela de transições da conversa', () => {
  for (const de of ESTADOS_CONVERSA) {
    for (const para of ESTADOS_CONVERSA) {
      const esperado = ehPermitida(de, para);
      it(`${de} → ${para} ${esperado ? 'é permitida' : 'é recusada'}`, () => {
        expect(transicaoPermitida(de, para)).toBe(esperado);
      });
    }
  }

  it('nenhum estado transita para si mesmo', () => {
    for (const estado of ESTADOS_CONVERSA) {
      expect(transicaoPermitida(estado, estado)).toBe(false);
    }
  });

  it('transferência não é aresta: sai por encerrada e abre conversa nova', () => {
    expect(transicaoPermitida('atribuida', 'na_fila')).toBe(false);
    expect(transicaoPermitida('em_atendimento', 'na_fila')).toBe(false);
    expect(transicaoPermitida('atribuida', 'encerrada')).toBe(true);
  });
});

describe('transitar', () => {
  it('devolve o estado novo quando a transição existe', () => {
    expect(transitar('na_fila', 'atribuida')).toBe('atribuida');
  });

  it('lança erro tipado quando não existe', () => {
    expect(() => transitar('encerrada', 'em_atendimento')).toThrow(TransicaoInvalidaError);
    try {
      transitar('encerrada', 'em_atendimento');
      expect.unreachable('deveria ter lançado');
    } catch (erro) {
      expect(erro).toBeInstanceOf(TransicaoInvalidaError);
      const tipado = erro as TransicaoInvalidaError;
      expect(tipado.codigo).toBe('transicao_invalida');
      expect(tipado.de).toBe('encerrada');
      expect(tipado.para).toBe('em_atendimento');
      expect(tipado.message).toContain('encerrada');
    }
  });

  it('versão sem exceção devolve o erro no resultado', () => {
    expect(tentarTransitar('na_fila', 'atribuida')).toEqual({ ok: true, estado: 'atribuida' });
    const recusa = tentarTransitar('na_fila', 'em_espera');
    expect(recusa.ok).toBe(false);
    if (!recusa.ok) expect(recusa.erro).toBeInstanceOf(TransicaoInvalidaError);
  });
});

describe('estado alvo de cada evento', () => {
  const casos: [TipoEvento, EstadoConversa | null][] = [
    ['criada', 'na_fila'],
    ['enfileirada', 'na_fila'],
    ['atribuida', 'atribuida'],
    ['reatribuida', 'atribuida'],
    ['primeira_resposta', 'em_atendimento'],
    ['espera_iniciada', 'em_espera'],
    ['espera_encerrada', 'em_atendimento'],
    ['encerrada', 'encerrada'],
    ['reaberta', 'na_fila'],
    ['mensagem_entrada', null],
    ['mensagem_saida', null],
    ['transferida_fila', null],
    ['sla_alertado', null],
    ['sla_estourado', null],
    ['avaliada', null],
    ['pesquisa_respondida', null],
  ];

  for (const [tipo, esperado] of casos) {
    it(`${tipo} → ${esperado ?? 'não mexe no estado'}`, () => {
      expect(estadoAlvoDoEvento(tipo)).toBe(esperado);
    });
  }
});

describe('aplicar evento', () => {
  const caminhoFeliz: { de: EstadoConversa; tipo: TipoEvento; para: EstadoConversa }[] = [
    { de: 'na_fila', tipo: 'atribuida', para: 'atribuida' },
    { de: 'atribuida', tipo: 'primeira_resposta', para: 'em_atendimento' },
    { de: 'em_atendimento', tipo: 'espera_iniciada', para: 'em_espera' },
    { de: 'em_espera', tipo: 'espera_encerrada', para: 'em_atendimento' },
    { de: 'em_atendimento', tipo: 'encerrada', para: 'encerrada' },
    { de: 'encerrada', tipo: 'reaberta', para: 'na_fila' },
    { de: 'na_fila', tipo: 'encerrada', para: 'encerrada' },
  ];

  for (const caso of caminhoFeliz) {
    it(`${caso.de} + ${caso.tipo} = ${caso.para}`, () => {
      expect(aplicarEvento(caso.de, { tipo: caso.tipo })).toEqual({ estado: caso.para, mudou: true });
    });
  }

  it('evento que não mapeia estado nunca muda estado', () => {
    for (const estado of ESTADOS_CONVERSA) {
      expect(aplicarEvento(estado, { tipo: 'mensagem_entrada' })).toEqual({ estado, mudou: false });
      expect(aplicarEvento(estado, { tipo: 'sla_alertado' })).toEqual({ estado, mudou: false });
    }
  });

  it('reentrega de webhook é idempotente, não vira exceção', () => {
    expect(aplicarEvento('encerrada', { tipo: 'encerrada' })).toEqual({
      estado: 'encerrada',
      mudou: false,
    });
    expect(aplicarEvento('em_espera', { tipo: 'espera_iniciada' })).toEqual({
      estado: 'em_espera',
      mudou: false,
    });
  });

  describe('evento do cliente não leva a conversa a estado inválido', () => {
    const recusas: { nome: string; de: EstadoConversa; tipo: TipoEvento }[] = [
      { nome: 'fluxo tenta pôr em espera uma conversa já encerrada', de: 'encerrada', tipo: 'espera_iniciada' },
      { nome: 'resposta em conversa que ainda está na fila', de: 'na_fila', tipo: 'primeira_resposta' },
      { nome: 'fim de espera em conversa que nunca esteve em atendimento', de: 'na_fila', tipo: 'espera_encerrada' },
      { nome: 'atribuição de conversa já encerrada', de: 'encerrada', tipo: 'atribuida' },
      { nome: 'conversa encerrada não volta a atender sem reabrir', de: 'encerrada', tipo: 'espera_encerrada' },
      { nome: 'reabertura de conversa que está em atendimento', de: 'em_atendimento', tipo: 'reaberta' },
    ];

    for (const caso of recusas) {
      it(caso.nome, () => {
        expect(() => aplicarEvento(caso.de, { tipo: caso.tipo })).toThrow(TransicaoInvalidaError);
        const tentativa = tentarAplicarEvento(caso.de, { tipo: caso.tipo });
        expect(tentativa.ok).toBe(false);
        if (!tentativa.ok) {
          expect(tentativa.erro.de).toBe(caso.de);
          expect(tentativa.erro.evento).toBe(caso.tipo);
        }
      });
    }
  });

  it('reproduz um ciclo de vida inteiro', () => {
    const ciclo: TipoEvento[] = [
      'criada',
      'mensagem_entrada',
      'atribuida',
      'primeira_resposta',
      'mensagem_entrada',
      'espera_iniciada',
      'espera_encerrada',
      'sla_alertado',
      'encerrada',
      'pesquisa_respondida',
    ];
    expect(reproduzirEventos(ciclo.map((tipo) => ({ tipo })))).toBe('encerrada');
  });

  it('reaberta volta para a fila e o ciclo recomeça', () => {
    const ciclo: TipoEvento[] = ['criada', 'atribuida', 'encerrada', 'reaberta', 'atribuida'];
    expect(reproduzirEventos(ciclo.map((tipo) => ({ tipo })))).toBe('atribuida');
  });
});

describe('máquina da mensagem de saída', () => {
  const permitidas: [EstadoEntrega, EstadoEntrega][] = [
    ['pendente', 'enviando'],
    ['enviando', 'enviada'],
    ['enviando', 'falhou'],
    ['enviada', 'entregue'],
    ['enviada', 'lida'],
    ['enviada', 'falhou'],
    ['entregue', 'lida'],
    ['falhou', 'pendente'],
  ];

  const todos: EstadoEntrega[] = ['pendente', 'enviando', 'enviada', 'entregue', 'lida', 'falhou'];

  for (const de of todos) {
    for (const para of todos) {
      const esperado = permitidas.some(([d, p]) => d === de && p === para);
      it(`${de} → ${para} ${esperado ? 'é permitida' : 'é recusada'}`, () => {
        expect(transicaoEntregaPermitida(de, para)).toBe(esperado);
      });
    }
  }

  it('reenviar tira do falhou e devolve à fila de saída', () => {
    expect(transitarEntrega('falhou', 'pendente')).toBe('pendente');
  });

  it('lida é terminal', () => {
    expect(() => transitarEntrega('lida', 'entregue')).toThrow(TransicaoEntregaInvalidaError);
  });
});
