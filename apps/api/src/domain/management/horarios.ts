import { and, eq, inArray, ne, notInArray } from 'drizzle-orm';
import { instanteDeLocal, partesNoFuso } from '@pipe/core';
import { horarioFaixa, queue, scheduleAttendance, scheduleException } from '@pipe/db/schema';
import { registrarAuditoria } from '@pipe/db';
import type { TransactionPipe } from '@pipe/db';
import { PipeError } from '../../errors.js';
import { requirePermission } from '../../session.js';
import { SCHEDULE_MANAGE } from './registrations.js';
import { dataOuNada, minutosDoRelogio, relogioValido, uuidOuNada } from './format.js';
import { fusoDoTenant } from './window.js';

/**
 * Horário de atendimento gravado de uma vez: nome, filas, faixas da semana e períodos sem atendimento (FICHA do cartão único de criação/edição). As faixas e os períodos sempre substituem os anteriores, então o formulário reenvia o conjunto inteiro. Um período é um intervalo de dias fechados; no banco vira uma exceção `fechado` por dia (a tabela guarda uma data por linha). Exceções que abrem em horário especial não aparecem no formulário e são preservadas.
 */

export const NOME_DO_HORARIO_MAX = 100;
export const TITULO_DO_PERIODO_MAX = 100;
/** Intervalo máximo de um período, contando o primeiro e o último dia. */
export const PERIODO_DIAS_MAX = 90;
export const PERIODOS_MAX = 50;
export const DESCRICAO_DO_HORARIO_MAX = 300;
const DIA_MS = 86_400_000;

export interface FaixaPedida {
  dayWeek: number;
  start: string;
  end: string;
}

export interface PeriodoPedido {
  title: string;
  /** Dia completo: sem atendimento do começo de `from` ao fim de `to`, sem horas. Desligado, valem `fromTime` e `toTime`. */
  fullDay: boolean;
  /** `AAAA-MM-DD`, primeiro dia sem atendimento. */
  from: string;
  /** `HH:MM` no fuso do horário; `00:00` quando o dia é completo. */
  fromTime: string;
  /** `AAAA-MM-DD`, último dia sem atendimento. */
  to: string;
  /** `HH:MM` no fuso do horário; `23:59` quando o dia é completo. */
  toTime: string;
}

export interface PedidoDeHorario {
  name: string;
  description: string | null;
  /** Horário regular da operação: filas sem horário próprio funcionam nele. */
  regular: boolean;
  queueIds: string[];
  faixas: FaixaPedida[];
  periods: PeriodoPedido[];
}

/** Data de calendário `AAAA-MM-DD` como dia absoluto (sem fuso: é a data do expediente). */
const diaAbsoluto = (data: string): number => Math.floor(Date.parse(`${data}T00:00:00Z`) / DIA_MS);
const dataDoDia = (dia: number): string => new Date(dia * DIA_MS).toISOString().slice(0, 10);

/** Todas as datas de `from` a `to`, inclusive. */
export function diasDoPeriodo(from: string, to: string): string[] {
  const dias: string[] = [];
  for (let d = diaAbsoluto(from); d <= diaAbsoluto(to); d += 1) dias.push(dataDoDia(d));
  return dias;
}

export interface PeriodoAgrupado {
  title: string;
  fullDay: boolean;
  from: string;
  fromTime: string;
  to: string;
  toTime: string;
}

/** Junta dias fechados consecutivos com o mesmo motivo em um período. Entrada em qualquer ordem. */
export function agruparPeriodos(
  dias: readonly { data: string; motivo: string | null }[],
): PeriodoAgrupado[] {
  const ordenados = [...dias].sort((a, b) => a.data.localeCompare(b.data));
  const periodos: PeriodoAgrupado[] = [];
  for (const { data, motivo } of ordenados) {
    const title = motivo ?? '';
    const ultimo = periodos[periodos.length - 1];
    if (ultimo && ultimo.title === title && diaAbsoluto(data) === diaAbsoluto(ultimo.to) + 1) {
      ultimo.to = data;
    } else {
      periodos.push({ title, fullDay: true, from: data, fromTime: '00:00', to: data, toTime: '23:59' });
    }
  }
  return periodos;
}

export interface LinhaDeExcecao {
  data: string;
  fechado: boolean;
  motivo: string | null;
  inicioEm: Date | null;
  fimEm: Date | null;
  diaCompleto: boolean;
}

const doisDigitos = (n: number): string => String(n).padStart(2, '0');
const dataLocal = (d: Date, fuso: string): string => {
  const p = partesNoFuso(d, fuso);
  return `${p.ano}-${doisDigitos(p.mes)}-${doisDigitos(p.dia)}`;
};
const horaLocal = (d: Date, fuso: string): string => {
  const p = partesNoFuso(d, fuso);
  return `${doisDigitos(p.hora)}:${doisDigitos(p.minuto)}`;
};

/**
 * Períodos sem atendimento de um horário. Os dias fechados de um dia só (linhas antigas e dia completo de um dia) são juntados quando consecutivos e de mesmo título; períodos com mais de um dia ou com horas parciais saem como estão.
 */
export function periodosDasExcecoes(linhas: readonly LinhaDeExcecao[], fuso: string): PeriodoAgrupado[] {
  const dias: { data: string; motivo: string | null }[] = [];
  const diretos: PeriodoAgrupado[] = [];
  for (const l of linhas.filter((x) => x.fechado)) {
    if (!l.inicioEm || !l.fimEm) {
      dias.push({ data: l.data, motivo: l.motivo });
      continue;
    }
    const title = l.motivo ?? '';
    if (l.diaCompleto) {
      const from = dataLocal(l.inicioEm, fuso);
      const to = dataLocal(new Date(l.fimEm.getTime() - 1), fuso);
      if (from === to) dias.push({ data: from, motivo: l.motivo });
      else diretos.push({ title, fullDay: true, from, fromTime: '00:00', to, toTime: '23:59' });
    } else {
      diretos.push({
        title,
        fullDay: false,
        from: dataLocal(l.inicioEm, fuso),
        fromTime: horaLocal(l.inicioEm, fuso),
        to: dataLocal(l.fimEm, fuso),
        toTime: horaLocal(l.fimEm, fuso),
      });
    }
  }
  return [...agruparPeriodos(dias), ...diretos].sort((a, b) =>
    `${a.from}T${a.fromTime}`.localeCompare(`${b.from}T${b.fromTime}`),
  );
}

/** Chave ordenável `AAAA-MM-DDTHH:MM` do começo e do fim do período (dia completo termina à meia-noite do dia seguinte). */
function limitesDoPeriodo(p: PeriodoPedido): { inicio: string; fim: string } {
  if (!p.fullDay) return { inicio: `${p.from}T${p.fromTime}`, fim: `${p.to}T${p.toTime}` };
  return { inicio: `${p.from}T00:00`, fim: `${dataDoDia(diaAbsoluto(p.to) + 1)}T00:00` };
}

/** Instantes absolutos do período no fuso do horário. */
export function instantesDoPeriodo(p: PeriodoPedido, fuso: string): { inicioEm: Date; fimEm: Date } {
  const { inicio, fim } = limitesDoPeriodo(p);
  const converter = (chave: string): Date => {
    const [data, hora] = chave.split('T') as [string, string];
    const [ano, mes, dia] = data.split('-').map(Number) as [number, number, number];
    return instanteDeLocal(ano, mes, dia, minutosDoRelogio(hora), fuso);
  };
  return { inicioEm: converter(inicio), fimEm: converter(fim) };
}

const invalido = (codigo: string, mensagem: string) => PipeError.request(codigo, mensagem);

function listaDe(bruto: unknown, campo: string): unknown[] {
  if (bruto === undefined || bruto === null) return [];
  if (!Array.isArray(bruto)) throw invalido(`${campo}_invalid`, `"${campo}" tem de ser uma lista.`);
  return bruto;
}

export function horarioConferido(corpo: unknown): PedidoDeHorario {
  if (!corpo || typeof corpo !== 'object') throw invalido('body_invalid', 'Corpo inválido.');
  const c = corpo as Record<string, unknown>;

  const name = String(c['name'] ?? '').trim();
  if (!name) throw invalido('name_required', 'Informe o nome do horário.');
  if (name.length > NOME_DO_HORARIO_MAX) {
    throw invalido('name_size', `O nome do horário tem até ${NOME_DO_HORARIO_MAX} caracteres.`);
  }

  const descBruta = c['description'];
  const description = descBruta === undefined || descBruta === null ? '' : String(descBruta).trim();
  if (description.length > DESCRICAO_DO_HORARIO_MAX) {
    throw invalido('description_size', `A descrição do horário tem até ${DESCRICAO_DO_HORARIO_MAX} caracteres.`);
  }
  const regular = c['regular'] === true;

  const queueIds = [...new Set(listaDe(c['queueIds'], 'queueIds').map((q) => String(q)))];
  for (const q of queueIds) {
    if (!uuidOuNada(q)) throw invalido('queue_invalid', 'Fila inválida.');
  }

  const faixas = listaDe(c['faixas'], 'faixas').map((bruta): FaixaPedida => {
    const f = (bruta ?? {}) as Record<string, unknown>;
    const dayWeek = Number(f['dayWeek']);
    const start = String(f['start'] ?? '').trim();
    const end = String(f['end'] ?? '').trim();
    if (!Number.isInteger(dayWeek) || dayWeek < 0 || dayWeek > 6) {
      throw invalido('day_week_invalid', 'Dia da semana inválido.');
    }
    if (!relogioValido(start) || !relogioValido(end)) {
      throw invalido('time_invalid', 'Horário inválido. Use HH:MM.');
    }
    if (minutosDoRelogio(end) <= minutosDoRelogio(start)) {
      throw PipeError.conflito(
        'end_before_of_start',
        'O fim tem de ser depois do início. Expediente que vira o dia são duas faixas, uma em cada dia.',
      );
    }
    return { dayWeek, start, end };
  });
  for (const dia of new Set(faixas.map((f) => f.dayWeek))) {
    const doDia = faixas
      .filter((f) => f.dayWeek === dia)
      .sort((a, b) => minutosDoRelogio(a.start) - minutosDoRelogio(b.start));
    for (let i = 1; i < doDia.length; i += 1) {
      if (minutosDoRelogio(doDia[i]!.start) < minutosDoRelogio(doDia[i - 1]!.end)) {
        throw PipeError.conflito('range_overlapping', 'Há faixas que se sobrepõem no mesmo dia.');
      }
    }
  }

  const periodosBrutos = listaDe(c['periods'], 'periods');
  if (periodosBrutos.length > PERIODOS_MAX) {
    throw invalido('periods_size', `No máximo ${PERIODOS_MAX} períodos sem atendimento por horário.`);
  }
  const periods = periodosBrutos.map((bruto): PeriodoPedido => {
    const p = (bruto ?? {}) as Record<string, unknown>;
    const title = String(p['title'] ?? '').trim();
    const fullDay = p['fullDay'] !== false;
    const from = dataOuNada(String(p['from'] ?? ''));
    const to = dataOuNada(String(p['to'] ?? ''));
    const fromTime = fullDay ? '00:00' : String(p['fromTime'] ?? '').trim();
    const toTime = fullDay ? '23:59' : String(p['toTime'] ?? '').trim();
    if (title.length > TITULO_DO_PERIODO_MAX) {
      throw invalido('title_size', `O título do período tem até ${TITULO_DO_PERIODO_MAX} caracteres.`);
    }
    if (!from || !to) throw invalido('data_invalid', 'Informe as datas do período.');
    if (!relogioValido(fromTime) || !relogioValido(toTime)) {
      throw invalido('time_invalid', 'Horário inválido. Use HH:MM.');
    }
    if (to < from) throw invalido('period_invalid', 'O fim do período é anterior ao início.');
    if (!fullDay && `${to}T${toTime}` <= `${from}T${fromTime}`) {
      throw invalido('period_invalid', 'O fim do período tem de ser depois do início.');
    }
    if (diaAbsoluto(to) - diaAbsoluto(from) + 1 > PERIODO_DIAS_MAX) {
      throw invalido('period_too_long', `Cada período tem no máximo ${PERIODO_DIAS_MAX} dias.`);
    }
    return { title, fullDay, from, fromTime, to, toTime };
  });
  const porInicio = periods.map(limitesDoPeriodo).sort((a, b) => a.inicio.localeCompare(b.inicio));
  for (let i = 1; i < porInicio.length; i += 1) {
    if (porInicio[i]!.inicio < porInicio[i - 1]!.fim) {
      throw PipeError.conflito('period_overlapping', 'Há períodos sem atendimento que se sobrepõem.');
    }
  }

  return { name, description: description || null, regular, queueIds, faixas, periods };
}

async function horarioVivo(tx: TransactionPipe, tid: string, id: string) {
  const [atual] = await tx
    .select({ id: scheduleAttendance.id, nome: scheduleAttendance.nome, fuso: scheduleAttendance.fuso })
    .from(scheduleAttendance)
    .where(and(eq(scheduleAttendance.tenantId, tid), eq(scheduleAttendance.id, id)))
    .limit(1);
  if (!atual) throw PipeError.naoEncontrado('horário de atendimento');
  return atual;
}

/** Cria (`id` ausente) ou substitui o horário inteiro. Tenant da sessão; permissão `horario.gerenciar`. */
export async function salvarHorarioCompleto(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  corpo: unknown,
  id?: string,
): Promise<{ id: string }> {
  const existente = id ? await horarioVivo(tx, tid, id) : null;
  await requirePermission(tx, usuarioId, SCHEDULE_MANAGE);
  const pedido = horarioConferido(corpo);

  const [homonimo] = await tx
    .select({ id: scheduleAttendance.id })
    .from(scheduleAttendance)
    .where(
      and(
        eq(scheduleAttendance.tenantId, tid),
        eq(scheduleAttendance.nome, pedido.name),
        id ? ne(scheduleAttendance.id, id) : undefined,
      ),
    )
    .limit(1);
  if (homonimo) throw PipeError.conflito('name_in_use', `Já existe um horário chamado "${pedido.name}".`);

  if (pedido.queueIds.length > 0) {
    const achadas = await tx
      .select({ id: queue.id })
      .from(queue)
      .where(and(eq(queue.tenantId, tid), inArray(queue.id, pedido.queueIds)));
    if (achadas.length !== pedido.queueIds.length) throw PipeError.naoEncontrado('fila');
  }

  // Só um horário regular por tenant: marcar este desmarca o anterior na mesma transação (o índice único garante).
  if (pedido.regular) {
    await tx
      .update(scheduleAttendance)
      .set({ regular: false })
      .where(
        and(
          eq(scheduleAttendance.tenantId, tid),
          eq(scheduleAttendance.regular, true),
          id ? ne(scheduleAttendance.id, id) : undefined,
        ),
      );
  }

  let horarioId = id;
  let fuso = existente?.fuso ?? '';
  if (horarioId) {
    await tx
      .update(scheduleAttendance)
      .set({ nome: pedido.name, descricao: pedido.description, regular: pedido.regular })
      .where(and(eq(scheduleAttendance.tenantId, tid), eq(scheduleAttendance.id, horarioId)));
  } else {
    fuso = await fusoDoTenant(tx);
    const [criado] = await tx
      .insert(scheduleAttendance)
      .values({
        tenantId: tid,
        nome: pedido.name,
        descricao: pedido.description,
        regular: pedido.regular,
        fuso,
      })
      .returning({ id: scheduleAttendance.id });
    if (!criado) throw PipeError.request('schedule_not_created', 'Não consegui gravar o horário.');
    horarioId = criado.id;
  }

  await tx.delete(horarioFaixa).where(and(eq(horarioFaixa.tenantId, tid), eq(horarioFaixa.horarioId, horarioId)));
  if (pedido.faixas.length > 0) {
    await tx.insert(horarioFaixa).values(
      pedido.faixas.map((f) => ({
        tenantId: tid,
        horarioId: horarioId!,
        diaSemana: f.dayWeek,
        inicio: f.start,
        fim: f.end,
      })),
    );
  }

  // Só os dias fechados são do formulário; exceção que abre em horário especial fica como está.
  await tx
    .delete(scheduleException)
    .where(
      and(
        eq(scheduleException.tenantId, tid),
        eq(scheduleException.horarioId, horarioId),
        eq(scheduleException.fechado, true),
      ),
    );
  // Cada período é uma linha com início e fim absolutos no fuso do horário (`data` = dia local do início).
  const linhas = pedido.periods.map((p) => ({
    tenantId: tid,
    horarioId: horarioId!,
    data: p.from,
    fechado: true,
    motivo: p.title || null,
    diaCompleto: p.fullDay,
    ...instantesDoPeriodo(p, fuso),
  }));
  if (linhas.length > 0) {
    const abertas = await tx
      .select({ data: scheduleException.data })
      .from(scheduleException)
      .where(and(eq(scheduleException.tenantId, tid), eq(scheduleException.horarioId, horarioId)));
    const usadas = new Set(abertas.map((a) => a.data));
    const choque = pedido.periods.flatMap((p) => diasDoPeriodo(p.from, p.to)).find((d) => usadas.has(d));
    if (choque) {
      throw PipeError.conflito(
        'period_conflicts_exception',
        `Já existe uma exceção com horário especial em ${choque} neste horário.`,
      );
    }
    await tx.insert(scheduleException).values(linhas);
  }

  // As filas escolhidas passam a usar este horário; as que o usavam e saíram ficam sem horário.
  await tx
    .update(queue)
    .set({ horarioId: null })
    .where(
      and(
        eq(queue.tenantId, tid),
        eq(queue.horarioId, horarioId),
        pedido.queueIds.length > 0 ? notInArray(queue.id, pedido.queueIds) : undefined,
      ),
    );
  if (pedido.queueIds.length > 0) {
    await tx
      .update(queue)
      .set({ horarioId })
      .where(and(eq(queue.tenantId, tid), inArray(queue.id, pedido.queueIds)));
  }

  await registrarAuditoria(tx, tid, {
    ator: { type: 'usuario', id: usuarioId },
    acao: id ? 'alterou' : 'criou',
    objetoTipo: 'horario_atendimento',
    objetoId: horarioId,
    depois: {
      nome: pedido.name,
      regular: pedido.regular,
      faixas: pedido.faixas.length,
      periodos: pedido.periods.length,
      filas: pedido.queueIds.length,
    },
  });
  return { id: horarioId };
}

/**
 * Exclui o horário com faixas e exceções (cascata). As filas vinculadas ficam sem horário (`ON DELETE SET NULL`) e passam a usar o horário regular do tenant; sem horário regular, funcionam 24 horas.
 */
export async function excluirHorario(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  id: string,
): Promise<void> {
  const atual = await horarioVivo(tx, tid, id);
  await requirePermission(tx, usuarioId, SCHEDULE_MANAGE);
  await tx
    .delete(scheduleAttendance)
    .where(and(eq(scheduleAttendance.tenantId, tid), eq(scheduleAttendance.id, id)));
  await registrarAuditoria(tx, tid, {
    ator: { type: 'usuario', id: usuarioId },
    acao: 'excluiu',
    objetoTipo: 'horario_atendimento',
    objetoId: id,
    antes: { nome: atual.nome },
  });
}
