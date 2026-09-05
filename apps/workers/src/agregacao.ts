import { sql } from 'drizzle-orm';
import {
  contarEncerramentos,
  tempoAtePrimeiraResposta,
  tempoDeAtendimento,
  tempoNaFila,
} from '@pipe/core';
import type { ConversaEventos, EncerradaPor, EventoAtendimento, TipoEvento } from '@pipe/core';
import { bancoDono, noTenant } from './banco.js';

/**
 * Fila de agregação: fecha `metrica_diaria` do dia anterior.
 *
 * Toda métrica sai de `evento_atendimento`, nunca de campo mutável da conversa —
 * é o que permite recalcular o passado quando a definição de uma métrica muda
 * (modelo de dados §4). Por isso a rotina é **idempotente**: rodar de novo para o
 * mesmo dia sobrescreve a linha em vez de somar em cima.
 *
 * A matemática vive em `@pipe/core` e não é reescrita aqui. Este arquivo só traduz
 * linha de banco em `ConversaEventos` e resultado de métrica em coluna.
 */

/** Fuso do tenant decide onde o dia começa. Relatório em UTC mente para o cliente. */
const FUSO_PADRAO = process.env['PIPE_FUSO_PADRAO'] ?? 'America/Sao_Paulo';

export interface ResumoAgregacao {
  tenantId: string;
  dia: string;
  linhas: number;
}

/** `YYYY-MM-DD` do dia anterior ao instante dado, no fuso informado. */
export function diaAnterior(agora: Date = new Date(), fuso: string = FUSO_PADRAO): string {
  const hoje = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);
  const [ano, mes, dia] = hoje.split('-').map(Number);
  const anterior = new Date(Date.UTC(ano ?? 1970, (mes ?? 1) - 1, (dia ?? 1) - 1));
  return anterior.toISOString().slice(0, 10);
}

type LinhaEvento = {
  conversa_id: string;
  tipo: TipoEvento;
  em: Date | string;
  usuario_id: string | null;
  fila_id: string | null;
  dados: { encerradaPor?: EncerradaPor } | null;
};

/**
 * Agrega o dia para todos os tenants ativos. Roda de madrugada, uma vez por dia.
 * O `select` de tenants usa o papel dono; toda leitura de negócio, o da aplicação.
 */
export async function agregarDiaAnterior(agora: Date = new Date()): Promise<ResumoAgregacao[]> {
  const { rows: tenants } = await bancoDono().execute<{ id: string; fuso: string }>(
    sql`select id, fuso from tenant where ativo`,
  );

  const resumos: ResumoAgregacao[] = [];
  // Em série: cada tenant abre a própria transação.
  for (const tenant of tenants) {
    const dia = diaAnterior(agora, tenant.fuso || FUSO_PADRAO);
    resumos.push(await agregarDia(tenant.id, dia, tenant.fuso || FUSO_PADRAO));
  }
  return resumos;
}

export async function agregarDia(
  tenantId: string,
  dia: string,
  fuso: string = FUSO_PADRAO,
): Promise<ResumoAgregacao> {
  return noTenant(tenantId, async (tx) => {
    const { rows: eventos } = await tx.execute<LinhaEvento>(sql`
      select conversa_id, tipo, em, usuario_id, fila_id, dados
        from evento_atendimento
       where em >= (${dia}::date)::timestamp at time zone ${fuso}
         and em <  (${dia}::date + 1)::timestamp at time zone ${fuso}
       order by em
    `);

    const { rows: mensagens } = await tx.execute<{
      fila_id: string | null;
      atendente_id: string | null;
      direcao: string;
      total: string;
    }>(sql`
      select c.fila_id, c.atendente_id, m.direcao, count(*)::text as total
        from mensagem m
        join conversa c on c.id = m.conversa_id
       where m.criada_em >= (${dia}::date)::timestamp at time zone ${fuso}
         and m.criada_em <  (${dia}::date + 1)::timestamp at time zone ${fuso}
         and m.direcao in ('entrada', 'saida')
       group by c.fila_id, c.atendente_id, m.direcao
    `);

    const porConversa = agruparPorConversa(eventos);
    const linhas = montarLinhas(porConversa, mensagens);

    // Em série (nunca `Promise.all` dentro da transação — ver README).
    for (const linha of linhas) {
      await tx.execute(sql`
        insert into metrica_diaria (
          tenant_id, dia, dimensao_tipo, dimensao_id,
          conversas_criadas, conversas_encerradas, conversas_perdidas, conversas_abandonadas,
          mensagens_entrada, mensagens_saida,
          espera_fila_seg, espera_fila_n, primeira_resposta_seg, primeira_resposta_n,
          atendimento_seg, atendimento_n, sla_cumpridos, sla_estourados, atualizado_em
        ) values (
          ${tenantId}, ${dia}, ${linha.dimensaoTipo}, ${linha.dimensaoId},
          ${linha.conversasCriadas}, ${linha.conversasEncerradas},
          ${linha.conversasPerdidas}, ${linha.conversasAbandonadas},
          ${linha.mensagensEntrada}, ${linha.mensagensSaida},
          ${linha.esperaFilaSeg}, ${linha.esperaFilaN},
          ${linha.primeiraRespostaSeg}, ${linha.primeiraRespostaN},
          ${linha.atendimentoSeg}, ${linha.atendimentoN},
          ${linha.slaCumpridos}, ${linha.slaEstourados}, now()
        )
        on conflict (tenant_id, dia, dimensao_tipo, dimensao_id) do update set
          conversas_criadas = excluded.conversas_criadas,
          conversas_encerradas = excluded.conversas_encerradas,
          conversas_perdidas = excluded.conversas_perdidas,
          conversas_abandonadas = excluded.conversas_abandonadas,
          mensagens_entrada = excluded.mensagens_entrada,
          mensagens_saida = excluded.mensagens_saida,
          espera_fila_seg = excluded.espera_fila_seg,
          espera_fila_n = excluded.espera_fila_n,
          primeira_resposta_seg = excluded.primeira_resposta_seg,
          primeira_resposta_n = excluded.primeira_resposta_n,
          atendimento_seg = excluded.atendimento_seg,
          atendimento_n = excluded.atendimento_n,
          sla_cumpridos = excluded.sla_cumpridos,
          sla_estourados = excluded.sla_estourados,
          atualizado_em = now()
      `);
    }

    return { tenantId, dia, linhas: linhas.length };
  });
}

interface ConversaDoDia {
  conversa: ConversaEventos;
  filaId: string | null;
  atendenteId: string | null;
  slaEstourado: boolean;
  criada: boolean;
  encerrada: boolean;
}

function agruparPorConversa(eventos: readonly LinhaEvento[]): ConversaDoDia[] {
  const mapa = new Map<string, ConversaDoDia>();

  for (const linha of eventos) {
    let item = mapa.get(linha.conversa_id);
    if (!item) {
      item = {
        conversa: { conversaId: linha.conversa_id, eventos: [] },
        filaId: null,
        atendenteId: null,
        slaEstourado: false,
        criada: false,
        encerrada: false,
      };
      mapa.set(linha.conversa_id, item);
    }

    const evento: EventoAtendimento = {
      conversaId: linha.conversa_id,
      tipo: linha.tipo,
      em: linha.em instanceof Date ? linha.em : new Date(linha.em),
      usuarioId: linha.usuario_id,
      filaId: linha.fila_id,
      encerradaPor: linha.dados?.encerradaPor ?? null,
    };
    (item.conversa.eventos as EventoAtendimento[]).push(evento);

    if (linha.fila_id) item.filaId = linha.fila_id;
    if (linha.usuario_id) item.atendenteId = linha.usuario_id;
    if (linha.tipo === 'sla_estourado') item.slaEstourado = true;
    if (linha.tipo === 'criada') item.criada = true;
    if (linha.tipo === 'encerrada') item.encerrada = true;
  }

  return [...mapa.values()];
}

interface LinhaMetrica {
  dimensaoTipo: 'fila' | 'atendente';
  dimensaoId: string;
  conversasCriadas: number;
  conversasEncerradas: number;
  conversasPerdidas: number;
  conversasAbandonadas: number;
  mensagensEntrada: number;
  mensagensSaida: number;
  esperaFilaSeg: number;
  esperaFilaN: number;
  primeiraRespostaSeg: number;
  primeiraRespostaN: number;
  atendimentoSeg: number;
  atendimentoN: number;
  slaCumpridos: number;
  slaEstourados: number;
}

function montarLinhas(
  conversas: readonly ConversaDoDia[],
  mensagens: readonly {
    fila_id: string | null;
    atendente_id: string | null;
    direcao: string;
    total: string;
  }[],
): LinhaMetrica[] {
  const linhas: LinhaMetrica[] = [];

  for (const dimensaoTipo of ['fila', 'atendente'] as const) {
    const chave = (item: ConversaDoDia) =>
      dimensaoTipo === 'fila' ? item.filaId : item.atendenteId;

    const grupos = new Map<string | null, ConversaDoDia[]>();
    for (const item of conversas) {
      const k = chave(item);
      const atual = grupos.get(k);
      if (atual) atual.push(item);
      else grupos.set(k, [item]);
    }

    for (const [dimensaoId, grupo] of grupos) {
      // Sem dimensão não há linha: `metrica_diaria_uk` inclui `dimensao_id`, e no
      // Postgres dois NULL são distintos num índice único — a linha "sem fila" seria
      // inserida de novo a cada reprocessamento em vez de ser sobrescrita.
      if (dimensaoId === null) continue;
      const eventos = grupo.map((g) => g.conversa);
      const encerramentos = contarEncerramentos(eventos);
      const fila = tempoNaFila(eventos);
      const primeira = tempoAtePrimeiraResposta(eventos);
      const atendimento = tempoDeAtendimento(eventos);
      const estourados = grupo.filter((g) => g.slaEstourado).length;

      const contagem = (direcao: string) =>
        mensagens
          .filter(
            (m) =>
              (dimensaoTipo === 'fila' ? m.fila_id : m.atendente_id) === dimensaoId &&
              m.direcao === direcao,
          )
          .reduce((soma, m) => soma + Number(m.total), 0);

      linhas.push({
        dimensaoTipo,
        dimensaoId,
        conversasCriadas: grupo.filter((g) => g.criada).length,
        conversasEncerradas: encerramentos.fechada,
        conversasPerdidas: encerramentos.perdida,
        conversasAbandonadas: encerramentos.abandonada,
        mensagensEntrada: contagem('entrada'),
        mensagensSaida: contagem('saida'),
        // Soma e denominador viajam juntos: a média é feita na hora de exibir,
        // porque média de médias entre dias mente (spec de métricas §5).
        esperaFilaSeg: Math.round(fila.soma),
        esperaFilaN: fila.populacao,
        primeiraRespostaSeg: Math.round(primeira.soma),
        primeiraRespostaN: primeira.populacao,
        atendimentoSeg: Math.round(atendimento.soma),
        atendimentoN: atendimento.populacao,
        slaCumpridos: Math.max(0, encerramentos.fechada - estourados),
        slaEstourados: estourados,
      });
    }
  }

  return linhas;
}
