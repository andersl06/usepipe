import { and, asc, count, eq, gte, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  dentroDoExpediente,
  duracaoTotalSeg,
  intervalosUteis,
  proximaAbertura,
  type HorarioAtendimento as ExpedienteDoCore,
} from '@pipe/core';
import {
  fila,
  filaAtendente,
  horarioAtendimento,
  horarioExcecao,
  horarioFaixa,
  motivoPausa,
  pausa,
  statusAtendente,
  usuario,
} from '@pipe/db/schema';
import { consultar } from './banco';
import { relogio } from './formato';

/**
 * Leitura das três telas de cadastro: filas, motivos de pausa e horários.
 *
 * Diferente de `configuracoes.ts`, que é o retrato somente-leitura do tenant,
 * aqui a leitura existe para alimentar um formulário que escreve. Continua
 * valendo o mesmo limite: cadastra-se e desativa-se no ato do cadastro, mas não
 * se edita nem se apaga — mexer em configuração sem log de auditoria com autor,
 * valor anterior e horário é passivo, e a auditoria ainda não existe.
 *
 * Toda consulta abaixo roda EM SÉRIE dentro de um único `comTenant`. Nada de
 * `Promise.all` aqui: consulta paralela na mesma conexão apaga o
 * `set_config('pipe.tenant_id')` da transação e a RLS passa a não filtrar nada
 * (README, "Como o isolamento entre clientes funciona").
 */

// ------------------------------------------------------------------- filas

export interface AtendenteDaFila {
  id: string;
  nome: string;
  estado: string | null;
  /** `fila_atendente.capacidade_override` ou a capacidade padrão da fila. */
  capacidade: number;
  /** O atendente tem limite próprio, diferente do padrão da fila. */
  temOverride: boolean;
}

export interface FilaCadastrada {
  id: string;
  nome: string;
  cor: string | null;
  capacidadePadrao: number;
  ordem: number;
  ativa: boolean;
  horarioId: string | null;
  horarioNome: string | null;
  atendentes: AtendenteDaFila[];
}

export interface HorarioParaEscolher {
  id: string;
  nome: string;
}

export async function carregarFilas(): Promise<{
  filas: FilaCadastrada[];
  horarios: HorarioParaEscolher[];
}> {
  return consultar(async (tx) => {
    const linhas = await tx
      .select({
        id: fila.id,
        nome: fila.nome,
        cor: fila.cor,
        capacidadePadrao: fila.capacidadePadrao,
        ordem: fila.ordem,
        ativa: fila.ativa,
        horarioId: fila.horarioId,
        horarioNome: horarioAtendimento.nome,
      })
      .from(fila)
      .leftJoin(horarioAtendimento, eq(horarioAtendimento.id, fila.horarioId))
      .orderBy(asc(fila.ordem), asc(fila.nome));

    const membros = await tx
      .select({
        filaId: filaAtendente.filaId,
        usuarioId: filaAtendente.usuarioId,
        nome: usuario.nome,
        override: filaAtendente.capacidadeOverride,
        estado: statusAtendente.estado,
      })
      .from(filaAtendente)
      .innerJoin(usuario, eq(usuario.id, filaAtendente.usuarioId))
      .leftJoin(statusAtendente, eq(statusAtendente.usuarioId, filaAtendente.usuarioId))
      .orderBy(asc(usuario.nome));

    const horarios = await tx
      .select({ id: horarioAtendimento.id, nome: horarioAtendimento.nome })
      .from(horarioAtendimento)
      .orderBy(asc(horarioAtendimento.nome));

    const porFila = new Map<string, AtendenteDaFila[]>();
    for (const m of membros) {
      const padrao = linhas.find((l) => l.id === m.filaId)?.capacidadePadrao ?? 0;
      const atendente: AtendenteDaFila = {
        id: m.usuarioId,
        nome: m.nome,
        estado: m.estado,
        capacidade: m.override ?? padrao,
        temOverride: m.override !== null,
      };
      const atual = porFila.get(m.filaId);
      if (atual) atual.push(atendente);
      else porFila.set(m.filaId, [atendente]);
    }

    return {
      filas: linhas.map((l) => ({ ...l, atendentes: porFila.get(l.id) ?? [] })),
      horarios,
    };
  });
}

// ------------------------------------------------------------------ pausas

export interface MotivoDePausa {
  id: string;
  nome: string;
  duracaoSugeridaMin: number | null;
  contaComoProdutivo: boolean;
  ativo: boolean;
  /** Pausas encerradas no período. */
  pausas: number;
  /** Duração média observada, em segundos. `null` quando ninguém usou. */
  mediaSeg: number | null;
}

export interface UsoDePausas {
  motivos: MotivoDePausa[];
  /** Início da janela de observação. */
  desde: Date;
  dias: number;
  /** Pausas encerradas no período cujo motivo foi apagado ou nunca informado. */
  semMotivo: number;
  /** Pausas em aberto agora — fora da média, porque ainda não terminaram. */
  abertas: number;
}

/**
 * Motivos com o uso real ao lado da duração sugerida.
 *
 * A média sai do banco, e não do `@pipe/core`: `packages/core/src/esforco/` mede
 * esforço de conversa e tempo em sessão, e só conhece pausa como o INTERVALO
 * entre duas mensagens do atendente (`calcularTempoEmSessao`, corte em 10
 * minutos). Nenhuma função de lá recebe `pausa` nem `motivo_pausa` — não havia o
 * que reaproveitar, e agregação por motivo é `avg` de SQL mesmo.
 *
 * Janela móvel de `dias` corridos, e não o mês do calendário: a pergunta da tela
 * é "o almoço de 30 minutos está durando 47?", e para essa o recorte honesto é o
 * passado recente.
 */
export async function carregarPausas(dias = 30): Promise<UsoDePausas> {
  const desde = new Date(Date.now() - dias * 86_400_000);

  return consultar(async (tx) => {
    const motivos = await tx
      .select({
        id: motivoPausa.id,
        nome: motivoPausa.nome,
        duracaoSugeridaMin: motivoPausa.duracaoSugeridaMin,
        contaComoProdutivo: motivoPausa.contaComoProdutivo,
        ativo: motivoPausa.ativo,
      })
      .from(motivoPausa)
      .orderBy(asc(motivoPausa.nome));

    const uso = await tx
      .select({
        motivoId: pausa.motivoId,
        pausas: count(),
        mediaSeg: sql<
          number | null
        >`avg(extract(epoch from (${pausa.encerradaEm} - ${pausa.iniciadaEm})))`,
      })
      .from(pausa)
      .where(and(isNotNull(pausa.encerradaEm), gte(pausa.iniciadaEm, desde)))
      .groupBy(pausa.motivoId);

    const [emAberto] = await tx
      .select({ total: count() })
      .from(pausa)
      .where(isNull(pausa.encerradaEm));

    const porMotivo = new Map(uso.map((u) => [u.motivoId, u]));
    const orfas = porMotivo.get(null);

    return {
      motivos: motivos.map((m) => {
        const u = porMotivo.get(m.id);
        return {
          ...m,
          pausas: u?.pausas ?? 0,
          mediaSeg: u && u.mediaSeg !== null ? Number(u.mediaSeg) : null,
        };
      }),
      desde,
      dias,
      semMotivo: orfas?.pausas ?? 0,
      abertas: emAberto?.total ?? 0,
    };
  });
}

// ---------------------------------------------------------------- horários

export interface FaixaDoHorario {
  id: string;
  diaSemana: number;
  inicio: string;
  fim: string;
}

export interface ExcecaoDoHorario {
  id: string;
  data: string;
  fechado: boolean;
  inicio: string | null;
  fim: string | null;
  motivo: string | null;
}

export interface HorarioCadastrado {
  id: string;
  nome: string;
  fuso: string;
  faixas: FaixaDoHorario[];
  excecoes: ExcecaoDoHorario[];
  /** Nomes das filas que apontam para este horário. Vazio = horário sem uso. */
  filas: string[];
  abertoAgora: boolean;
  /** `null` = nenhuma abertura no horizonte do core — horário sem faixa nenhuma. */
  proximaAberturaEm: Date | null;
  /** Expediente dos próximos sete dias, com feriado já descontado. */
  seteDiasSeg: number;
}

export interface Horarios {
  horarios: HorarioCadastrado[];
  /** Filas ativas sem horário: nelas o relógio do SLA corre 24×7. */
  filasSemHorario: string[];
  agora: Date;
}

const SETE_DIAS_MS = 7 * 86_400_000;

/**
 * Horários com faixas, exceções, quem os usa, e o que o `@pipe/core` diz deles.
 *
 * "Aberto agora", "próxima abertura" e "expediente dos próximos sete dias" NÃO
 * são somados aqui: saem de `dentroDoExpediente`, `proximaAbertura` e
 * `duracaoTotalSeg(intervalosUteis(...))` de
 * `packages/core/src/sla/expediente.ts` — as mesmas funções com que o SLA decide
 * se uma conversa estourou. Somar as faixas à mão nesta tela é exatamente como o
 * número da tela e o número do relatório passam a divergir.
 */
export async function carregarHorarios(): Promise<Horarios> {
  const agora = new Date();

  return consultar(async (tx) => {
    const cabecas = await tx
      .select({
        id: horarioAtendimento.id,
        nome: horarioAtendimento.nome,
        fuso: horarioAtendimento.fuso,
      })
      .from(horarioAtendimento)
      .orderBy(asc(horarioAtendimento.nome));

    const faixas = await tx
      .select({
        id: horarioFaixa.id,
        horarioId: horarioFaixa.horarioId,
        diaSemana: horarioFaixa.diaSemana,
        inicio: horarioFaixa.inicio,
        fim: horarioFaixa.fim,
      })
      .from(horarioFaixa)
      .orderBy(asc(horarioFaixa.diaSemana), asc(horarioFaixa.inicio));

    const excecoes = await tx
      .select({
        id: horarioExcecao.id,
        horarioId: horarioExcecao.horarioId,
        data: horarioExcecao.data,
        fechado: horarioExcecao.fechado,
        inicio: horarioExcecao.inicio,
        fim: horarioExcecao.fim,
        motivo: horarioExcecao.motivo,
      })
      .from(horarioExcecao)
      .orderBy(asc(horarioExcecao.data));

    const filas = await tx
      .select({ nome: fila.nome, horarioId: fila.horarioId, ativa: fila.ativa })
      .from(fila)
      .orderBy(asc(fila.ordem), asc(fila.nome));

    const horarios = cabecas.map((h) => {
      const minhasFaixas: FaixaDoHorario[] = faixas
        .filter((f) => f.horarioId === h.id)
        .map((f) => ({
          id: f.id,
          diaSemana: f.diaSemana,
          inicio: relogio(f.inicio),
          fim: relogio(f.fim),
        }));

      const minhasExcecoes: ExcecaoDoHorario[] = excecoes
        .filter((e) => e.horarioId === h.id)
        .map((e) => ({
          id: e.id,
          data: e.data,
          fechado: e.fechado,
          inicio: e.inicio === null ? null : relogio(e.inicio),
          fim: e.fim === null ? null : relogio(e.fim),
          motivo: e.motivo,
        }));

      const paraOCore: ExpedienteDoCore = {
        fuso: h.fuso,
        faixas: minhasFaixas,
        excecoes: minhasExcecoes,
      };

      return {
        ...h,
        faixas: minhasFaixas,
        excecoes: minhasExcecoes,
        filas: filas.filter((f) => f.horarioId === h.id).map((f) => f.nome),
        abertoAgora: dentroDoExpediente(agora, paraOCore),
        proximaAberturaEm: proximaAbertura(agora, paraOCore),
        seteDiasSeg: duracaoTotalSeg(
          intervalosUteis(agora, new Date(agora.getTime() + SETE_DIAS_MS), paraOCore),
        ),
      };
    });

    return {
      horarios,
      filasSemHorario: filas.filter((f) => f.ativa && f.horarioId === null).map((f) => f.nome),
      agora,
    };
  });
}
