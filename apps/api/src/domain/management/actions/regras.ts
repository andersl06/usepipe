import type { Campos, Resultado } from './campos.js';
import { and, eq } from 'drizzle-orm';
import { scheduleAttendance, scheduleException, horarioFaixa } from '@pipe/db/schema';
import type { TransactionPipe, Ator } from '@pipe/db';
import { PipeError } from '../../../errors.js';
import { requirePermission } from '../../../session.js';
import { SCHEDULE_MANAGE, toggleActiveOfRuleQueue, writeRuleQueue } from '../registrations.js';
import { campoValido, operadorValido, type OperadorDeRegra } from '@pipe/core';
import { minutosDoRelogio, relogioValido } from '../format.js';

/** The transaction already has its tenant fixed; `consultar` only names the block, as in Management. */
const consultar = <T>(tx: TransactionPipe, fn: (tx: TransactionPipe) => Promise<T>): Promise<T> =>
  fn(tx);

/**
 * Rule Server Actions manage business hours, ranges and exceptions. They return `Resultado` like `app/comunicacao/acoes.ts`. Run one transaction per action and queries serially: `Promise.all` inside `comTenant` can clear `set_config('pipe.tenant_id')`, leaving RLS without the tenant filter. Registration is incremental: create the schedule, then add ranges and holidays. Without an audited update, a whole-week form would create duplicates when corrected.
 */

const OK: Resultado = { ok: true };

function falha(error: string): Resultado {
  return { ok: false, error };
}

/**
 * Return the runtime's canonical IANA time-zone spelling or `null` if unknown. Validate with `Intl`, as `packages/core/src/sla/expediente.ts` does for local time conversion; a zone accepted here works for SLA calculation.
 */
function normalizarFuso(fuso: string): string | null {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/** `ErroPipe` (de `exigirPermissao`) vira a frase da tela; qualquer outro erro sobe. */
async function comoResultado(fn: () => Promise<Resultado>): Promise<Resultado> {
  try {
    return await fn();
  } catch (erro) {
    if (erro instanceof PipeError) return falha(erro.message);
    throw erro;
  }
}


export async function salvarHorario(
  tx: TransactionPipe,
  tid: string,
  ator: Ator,
  dados: Campos,
): Promise<Resultado> {
  return comoResultado(() => salvarHorarioInterno(tx, tid, ator, dados));
}

async function salvarHorarioInterno(
  tx: TransactionPipe,
  tid: string,
  ator: Ator,
  dados: Campos,
): Promise<Resultado> {
  await requirePermission(tx, ator.id ?? '', SCHEDULE_MANAGE);
  const nome = String(dados.get('nome') ?? '').trim();
  const fusoBruto = String(dados.get('fuso') ?? '').trim();

  if (!nome) return falha('Informe o nome do horário.');
  if (!fusoBruto) return falha('Informe o fuso.');

  const fuso = normalizarFuso(fusoBruto);
  if (fuso === null) {
    return falha(`"${fusoBruto}" não é um fuso IANA conhecido. Exemplo: America/Sao_Paulo.`);
  }

  return consultar(tx, async (tx) => {
    // `horario_atendimento` has no unique index on name; uniqueness is enforced by this screen.
    // desta tela. Dois "Comercial" fariam o gestor ligar a fila no errado.
    const [conflito] = await tx
      .select({ id: scheduleAttendance.id })
      .from(scheduleAttendance)
      .where(and(eq(scheduleAttendance.tenantId, tid), eq(scheduleAttendance.nome, nome)))
      .limit(1);
    if (conflito) return falha(`Já existe um horário chamado "${nome}".`);

    await tx.insert(scheduleAttendance).values({ tenantId: tid, nome, fuso });
    return OK;
  });
}

// -------------------------------------------------------------------- faixa

export async function salvarFaixa(
  tx: TransactionPipe,
  tid: string,
  ator: Ator,
  data: Campos,
): Promise<Resultado> {
  return comoResultado(() => salvarFaixaInterna(tx, tid, ator, data));
}

async function salvarFaixaInterna(
  tx: TransactionPipe,
  tid: string,
  ator: Ator,
  dados: Campos,
): Promise<Resultado> {
  await requirePermission(tx, ator.id ?? '', SCHEDULE_MANAGE);
  const horarioId = String(dados.get('horarioId') ?? '').trim();
  const diaBruto = String(dados.get('diaSemana') ?? '').trim();
  const inicio = String(dados.get('inicio') ?? '').trim();
  const fim = String(dados.get('fim') ?? '').trim();

  if (!horarioId) return falha('Escolha o horário.');
  const diaSemana = Number(diaBruto);
  if (!Number.isInteger(diaSemana) || diaSemana < 0 || diaSemana > 6) {
    return falha('Dia da semana inválido.');
  }
  if (!relogioValido(inicio) || !relogioValido(fim)) return falha('Horário inválido. Use HH:MM.');
  if (minutosDoRelogio(fim) <= minutosDoRelogio(inicio)) {
    return falha(
      'O fim tem de ser depois do início. Expediente que vira o dia são duas faixas, uma em cada dia.',
    );
  }

  return consultar(tx, async (tx) => {
    const [horario] = await tx
      .select({ id: scheduleAttendance.id })
      .from(scheduleAttendance)
      .where(and(eq(scheduleAttendance.tenantId, tid), eq(scheduleAttendance.id, horarioId)))
      .limit(1);
    if (!horario) return falha('Horário não encontrado.');

    // `faixasDoDia` merges overlapping ranges itself, so
    // Overlap is allowed; an identical range only clutters the list.
    const [igual] = await tx
      .select({ id: horarioFaixa.id })
      .from(horarioFaixa)
      .where(
        and(
          eq(horarioFaixa.horarioId, horarioId),
          eq(horarioFaixa.diaSemana, diaSemana),
          eq(horarioFaixa.inicio, inicio),
          eq(horarioFaixa.fim, fim),
        ),
      )
      .limit(1);
    if (igual) return falha('Esta faixa já está cadastrada neste dia.');

    await tx.insert(horarioFaixa).values({ tenantId: tid, horarioId, diaSemana, inicio, fim });
    return OK;
  });
}


export async function saveException(
  tx: TransactionPipe,
  tid: string,
  ator: Ator,
  dados: Campos,
): Promise<Resultado> {
  return comoResultado(() => saveExceptionInternal(tx, tid, ator, dados));
}

async function saveExceptionInternal(
  tx: TransactionPipe,
  tid: string,
  ator: Ator,
  dados: Campos,
): Promise<Resultado> {
  await requirePermission(tx, ator.id ?? '', SCHEDULE_MANAGE);
  const horarioId = String(dados.get('horarioId') ?? '').trim();
  const data = String(dados.get('data') ?? '').trim();
  const fechado = dados.get('fechado') !== null;
  const inicio = String(dados.get('inicio') ?? '').trim();
  const fim = String(dados.get('fim') ?? '').trim();
  const motivo = String(dados.get('motivo') ?? '').trim();

  if (!horarioId) return falha('Escolha o horário.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return falha('Informe a data.');

  if (fechado) {
    if (inicio || fim)
      return falha(
        'Dia fechado não tem horário. Desmarque “fechado” para abrir em horário especial.',
      );
  } else {
    // An open exception without its own hours falls back to the normal
    // day through `faixasDoDia`; it would have no effect, so reject it instead of
    // storing a row that changes nothing.
    if (!inicio || !fim) {
      return falha(
        'Exceção que abre precisa de horário próprio; sem ele o dia cai no expediente normal e a exceção não faz nada.',
      );
    }
    if (!relogioValido(inicio) || !relogioValido(fim)) return falha('Horário inválido. Use HH:MM.');
    if (minutosDoRelogio(fim) <= minutosDoRelogio(inicio)) return falha('O fim tem de ser depois do início.');
  }

  return consultar(tx, async (tx) => {
    const [horario] = await tx
      .select({ id: scheduleAttendance.id })
      .from(scheduleAttendance)
      .where(and(eq(scheduleAttendance.tenantId, tid), eq(scheduleAttendance.id, horarioId)))
      .limit(1);
    if (!horario) return falha('Horário não encontrado.');

    // `horario_excecao_uk` really enforces uniqueness on schedule and date. The `select`
    // provides a useful conflict message; a constraint error otherwise surfaces as a contextless 500.
    const [conflito] = await tx
      .select({ id: scheduleException.id })
      .from(scheduleException)
      .where(and(eq(scheduleException.horarioId, horarioId), eq(scheduleException.data, data)))
      .limit(1);
    if (conflito) return falha(`Já existe uma exceção em ${data} para este horário.`);

    await tx.insert(scheduleException).values({
      tenantId: tid,
      horarioId,
      data,
      fechado,
      inicio: fechado ? null : inicio,
      fim: fechado ? null : fim,
      motivo: motivo || null,
    });
    return OK;
  });
}

// ---------------------------------------------------------- regra de entrada

/**
 * Inbound rule, metrics spec §8. This action reads and validates `FormData`, calls `lib/cadastros.ts`, and revalidates the route; database access stays there, separate from Next (README, 'Quem fala com o banco'). Save the rule header and all conditions together: a rule without conditions cannot match in `filaDeDestino`, so incremental registration would briefly activate a rule that does nothing. Conditions arrive as parallel `campo[]`, `operador[]`, and `valor[]` lists, as repeated `FormData` fields.
 */
export async function saveRuleQueue(
  tx: TransactionPipe,
  tid: string,
  ator: Ator,
  dados: Campos,
): Promise<Resultado> {
  const nome = String(dados.get('nome') ?? '').trim();
  const queueDestinationId = String(dados.get('filaDestinoId') ?? '').trim();
  const combinador = String(dados.get('combinador') ?? 'e').trim();
  const orderRaw = String(dados.get('ordem') ?? '').trim();

  if (!nome) return falha('Informe o nome da regra.');
  if (!queueDestinationId) return falha('Escolha a fila de destino.');
  if (combinador !== 'e' && combinador !== 'ou') return falha('Combinador inválido.');

  const order = Number(orderRaw || '0');
  if (!Number.isInteger(order) || order < 0 || order > 999) {
    return falha('A ordem é um inteiro de 0 a 999 — é ela que decide qual regra é avaliada antes.');
  }

  const campos = dados.getAll('campo').map((v) => String(v).trim());
  const operadores = dados.getAll('operador').map((v) => String(v).trim());
  const values = dados.getAll('valor').map((v) => String(v).trim());

  const conditions: { field: string; operator: OperadorDeRegra; value: string }[] = [];
  for (let i = 0; i < campos.length; i += 1) {
    const campo = campos[i] ?? '';
    const operador = operadores[i] ?? '';
    const value = values[i] ?? '';
    // A blank row is one the user did not fill in, not an error:
    // the form starts with one and optional added rows need not be used.
    if (!campo && !value) continue;
    if (!campoValido(campo)) {
      return falha(
        `"${campo}" não é um campo válido. Use um dos fixos ou um campo extra como contato.atributos.plano.`,
      );
    }
    if (!operadorValido(operador)) return falha('Operador inválido.');
    if (!value) return falha(`A condição sobre "${campo}" ficou sem valor.`);
    conditions.push({ field: campo, operator: operador, value });
  }

  if (conditions.length === 0) {
    return falha('Uma regra sem condição nunca casa. Preencha pelo menos uma.');
  }

  const gravado = await writeRuleQueue(tx, tid, ator, {
    name: nome,
    order,
    combiner: combinador,
    queueDestinationId,
    conditions,
  });
  if (!gravado.ok) return falha(gravado.error);
  return OK;
}

/**
 * The list-row switch toggles a rule without opening its form, matching the source card control (`blip-telas-cadastro.md` §2). It is available now because audit logging exists, as recorded in `componentes/lista-regras.tsx`.
 */
export async function toggleRuleQueue(
  tx: TransactionPipe,
  tid: string,
  ator: Ator,
  dados: Campos,
): Promise<Resultado> {
  const id = String(dados.get('id') ?? '').trim();
  if (!id) return falha('Regra não informada.');
  const recording = await toggleActiveOfRuleQueue(tx, tid, ator, id);
  return recording.ok ? OK : falha(recording.error);
}
