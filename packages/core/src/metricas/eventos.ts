/**
 * Eventos de atendimento e os cinco carimbos de tempo.
 *
 * Fonte: `2026-09-05-metricas-atendimento.md` §1 e `2026-09-05-modelo-de-dados.md` §4.
 * Toda métrica deriva daqui — nunca de campo mutável da conversa.
 */

/** Catálogo de `evento_atendimento.tipo` (modelo de dados, §4). */
export type TipoEvento =
  | 'criada'
  | 'enfileirada'
  | 'atribuida'
  | 'reatribuida'
  | 'transferida_fila'
  | 'primeira_resposta'
  | 'mensagem_entrada'
  | 'mensagem_saida'
  | 'espera_iniciada'
  | 'espera_encerrada'
  | 'sla_alertado'
  | 'sla_estourado'
  | 'encerrada'
  | 'reaberta'
  | 'avaliada'
  | 'pesquisa_respondida';

/** Quem tirou a conversa da tela do atendente. */
export type EncerradaPor = 'atendente' | 'cliente' | 'inatividade' | 'transferencia';

export interface EventoAtendimento {
  conversaId: string;
  tipo: TipoEvento;
  em: Date;
  /** Atendente envolvido, quando houver. Em `mensagem_saida` distingue atendente de bot. */
  usuarioId?: string | null;
  filaId?: string | null;
  /** Em `encerrada`, carrega `encerradaPor`. */
  encerradaPor?: EncerradaPor | null;
}

/** Conversa como lista de eventos — a unidade de entrada de toda métrica. */
export interface ConversaEventos {
  conversaId: string;
  eventos: readonly EventoAtendimento[];
}

/** Os cinco carimbos de tempo da §1 da spec de métricas. */
export interface Marcos {
  conversaId: string;
  criadaEm: Date | null;
  atribuidaEm: Date | null;
  primeiraRespostaEm: Date | null;
  encerradaEm: Date | null;
  encerradaPor: EncerradaPor | null;
  /** Quantidade de atribuições — reatribuição grava evento novo, não sobrescreve o primeiro. */
  atribuicoes: number;
}

function ordenar(eventos: readonly EventoAtendimento[]): EventoAtendimento[] {
  // Ordenação estável por instante: eventos do mesmo milissegundo mantêm a ordem
  // de gravação, que é a ordem em que a `api` os emitiu.
  return eventos
    .map((evento, indice) => ({ evento, indice }))
    .sort((a, b) => a.evento.em.getTime() - b.evento.em.getTime() || a.indice - b.indice)
    .map(({ evento }) => evento);
}

/**
 * Deriva os cinco carimbos a partir dos eventos de uma conversa.
 *
 * Decisões onde a spec deixa margem:
 * - `criadaEm` usa `criada`; sem ela, cai para `enfileirada` — conversa que só
 *   existe a partir da fila continua tendo início.
 * - `atribuidaEm` é a **primeira** atribuição (§1: reatribuição não sobrescreve).
 * - `primeiraRespostaEm` usa o evento `primeira_resposta`; sem ele, cai para a
 *   primeira `mensagem_saida` **com `usuarioId`**, porque saída de bot não é
 *   resposta de atendente.
 * - `encerradaEm` é o **último** `encerrada`, para conversa reaberta e fechada
 *   de novo carimbar o fechamento que vale.
 */
export function derivarMarcos(conversa: ConversaEventos): Marcos {
  const eventos = ordenar(conversa.eventos);

  let criadaEm: Date | null = null;
  let enfileiradaEm: Date | null = null;
  let atribuidaEm: Date | null = null;
  let primeiraRespostaEm: Date | null = null;
  let primeiraSaidaDeAtendenteEm: Date | null = null;
  let encerradaEm: Date | null = null;
  let encerradaPor: EncerradaPor | null = null;
  let atribuicoes = 0;

  for (const evento of eventos) {
    switch (evento.tipo) {
      case 'criada':
        if (criadaEm === null) criadaEm = evento.em;
        break;
      case 'enfileirada':
        if (enfileiradaEm === null) enfileiradaEm = evento.em;
        break;
      case 'atribuida':
      case 'reatribuida':
        atribuicoes += 1;
        if (atribuidaEm === null) atribuidaEm = evento.em;
        break;
      case 'primeira_resposta':
        if (primeiraRespostaEm === null) primeiraRespostaEm = evento.em;
        break;
      case 'mensagem_saida':
        if (primeiraSaidaDeAtendenteEm === null && evento.usuarioId) {
          primeiraSaidaDeAtendenteEm = evento.em;
        }
        break;
      case 'encerrada':
        encerradaEm = evento.em;
        encerradaPor = evento.encerradaPor ?? null;
        break;
      case 'reaberta':
        encerradaEm = null;
        encerradaPor = null;
        break;
      default:
        break;
    }
  }

  return {
    conversaId: conversa.conversaId,
    criadaEm: criadaEm ?? enfileiradaEm,
    atribuidaEm,
    primeiraRespostaEm: primeiraRespostaEm ?? primeiraSaidaDeAtendenteEm,
    encerradaEm,
    encerradaPor,
    atribuicoes,
  };
}

export function derivarMarcosDeVarias(conversas: readonly ConversaEventos[]): Marcos[] {
  return conversas.map(derivarMarcos);
}

/**
 * Pares "mensagem do cliente → próxima mensagem do atendente" de uma conversa.
 *
 * Uma troca completa é uma entrada do cliente seguida, mais adiante na linha do
 * tempo, de uma saída do atendente. Entradas consecutivas do cliente contam como
 * **uma** troca: o relógio começa na primeira, que é quando o atendente passou a
 * dever resposta.
 */
export function intervalosDeResposta(conversa: ConversaEventos): number[] {
  const eventos = ordenar(conversa.eventos);
  const intervalos: number[] = [];
  let aguardandoDesde: Date | null = null;

  for (const evento of eventos) {
    if (evento.tipo === 'mensagem_entrada') {
      if (aguardandoDesde === null) aguardandoDesde = evento.em;
      continue;
    }
    const ehRespostaDeAtendente =
      (evento.tipo === 'mensagem_saida' && !!evento.usuarioId) || evento.tipo === 'primeira_resposta';
    if (ehRespostaDeAtendente && aguardandoDesde !== null) {
      intervalos.push((evento.em.getTime() - aguardandoDesde.getTime()) / 1000);
      aguardandoDesde = null;
    }
  }

  return intervalos;
}
