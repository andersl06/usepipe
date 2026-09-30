import { sql } from 'drizzle-orm';
import type { FlowFunction, FlowFunctionInput, FlowFunctionUsage } from '@pipe/contracts';
import type { TransactionPipe } from '@pipe/db';
import { PipeError } from '../../errors.js';
import { requirePermission } from '../../session.js';

/**
 * The account's function library (`funcao_do_fluxo`, D-22). Since P10/D-57 (migration 0054) it
 * belongs to the tenant, like Blip's contract-wide library: every flow of the tenant loads every
 * function, `ExecuteBlipFunction` references one by id (Blip's `settings.source` UUID), and
 * `functionUsage` lists the flows that use one so the Builder can warn "em uso em outros bots".
 */

export const FLOW_FUNCTION_PERMISSION = 'automacao.fluxo.editar';
export const MAX_FLOW_FUNCTION_CODE = 65_536;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = {
  id: string; tenantId: string; name: string; description: string | null;
  parameters: string[]; code: string; version: number;
  createdAt: Date | string; updatedAt: Date | string;
};

const COLUMNS = sql`id, tenant_id as "tenantId", nome as name, descricao as description,
  parametros as parameters, codigo as code, versao as version,
  criado_em as "createdAt", atualizado_em as "updatedAt"`;

const iso = (value: Date | string): string => new Date(value).toISOString();
const output = (row: Row): FlowFunction => ({
  id: row.id, tenantId: row.tenantId, name: row.name, description: row.description,
  parameters: row.parameters, code: row.code, version: Number(row.version),
  createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt),
});

function postgresError(error: unknown): { code?: string; constraint?: string } {
  const candidate = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  return { code: candidate.code ?? candidate.cause?.code, constraint: candidate.constraint ?? candidate.cause?.constraint };
}

function conflict(error: unknown): never {
  const pg = postgresError(error);
  if (pg.code === '23505') {
    if (pg.constraint === 'funcao_do_fluxo_pkey') {
      throw PipeError.conflito('funcao_id_duplicado', 'Já existe uma função com esse identificador.');
    }
    throw PipeError.conflito('funcao_duplicada', 'Já existe uma função com esse nome na biblioteca da conta.');
  }
  throw error;
}

function validate(input: FlowFunctionInput): { name: string; description: string | null; parameters: string[]; code: string } {
  if (!IDENTIFIER.test(input.name)) throw PipeError.request('nome_invalido', 'O nome precisa ser um identificador JavaScript válido.');
  if (!input.code.trim()) throw PipeError.request('codigo_obrigatorio', 'O código da função é obrigatório.');
  if (input.code.length > MAX_FLOW_FUNCTION_CODE) throw PipeError.request('codigo_grande_demais', `O código aceita no máximo ${MAX_FLOW_FUNCTION_CODE} caracteres.`);
  if (!Array.isArray(input.parameters) || input.parameters.some((p) => typeof p !== 'string' || !IDENTIFIER.test(p))) {
    throw PipeError.request('parametros_invalidos', 'Cada parâmetro precisa ser um identificador JavaScript válido.');
  }
  if (new Set(input.parameters).size !== input.parameters.length) throw PipeError.request('parametros_invalidos', 'Os parâmetros não podem se repetir.');
  return { name: input.name, description: input.description ?? null, parameters: input.parameters, code: input.code };
}

function requireUuid(id: string): string {
  if (!UUID.test(id)) throw PipeError.naoEncontrado('função');
  return id.toLowerCase();
}

async function permission(tx: TransactionPipe, userId: string): Promise<void> {
  await requirePermission(tx, userId, FLOW_FUNCTION_PERMISSION);
}

export async function listFlowFunctions(tx: TransactionPipe, userId: string, query: { search?: string; limit?: number; offset?: number }): Promise<FlowFunction[]> {
  await permission(tx, userId);
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
  const offset = Math.max(query.offset ?? 0, 0);
  const search = query.search?.trim() ?? '';
  const pattern = `%${search.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const { rows } = await tx.execute<Row>(sql`
    select ${COLUMNS}
      from funcao_do_fluxo
     where nome ilike ${pattern} escape '\\' or coalesce(descricao, '') ilike ${pattern} escape '\\'
     order by nome, id limit ${limit} offset ${offset}
  `);
  return rows.map(output);
}

export async function getFlowFunction(tx: TransactionPipe, userId: string, id: string): Promise<FlowFunction> {
  await permission(tx, userId);
  const { rows } = await tx.execute<Row>(sql`select ${COLUMNS} from funcao_do_fluxo where id = ${requireUuid(id)}::uuid limit 1`);
  if (!rows[0]) throw PipeError.naoEncontrado('função');
  return output(rows[0]);
}

export async function createFlowFunction(tx: TransactionPipe, userId: string, input: FlowFunctionInput): Promise<FlowFunction> {
  await permission(tx, userId);
  const value = validate(input);
  if (input.id !== undefined && (typeof input.id !== 'string' || !UUID.test(input.id))) {
    throw PipeError.request('id_invalido', 'O identificador da função precisa ser um UUID.');
  }
  const id = input.id ? sql`${input.id.toLowerCase()}::uuid` : sql`gen_random_uuid()`;
  try {
    const { rows } = await tx.execute<Row>(sql`
      insert into funcao_do_fluxo (id, tenant_id, nome, descricao, parametros, codigo)
      values (${id}, current_setting('pipe.tenant_id')::uuid, ${value.name}, ${value.description}, ${JSON.stringify(value.parameters)}::jsonb, ${value.code})
      returning ${COLUMNS}
    `);
    return output(rows[0]!);
  } catch (error) {
    conflict(error);
  }
}

export async function updateFlowFunction(tx: TransactionPipe, userId: string, id: string, input: FlowFunctionInput): Promise<FlowFunction> {
  await permission(tx, userId);
  const value = validate(input);
  try {
    const { rows } = await tx.execute<Row>(sql`
      update funcao_do_fluxo set nome = ${value.name}, descricao = ${value.description}, parametros = ${JSON.stringify(value.parameters)}::jsonb,
        codigo = ${value.code}, versao = versao + 1, atualizado_em = now()
      where id = ${requireUuid(id)}::uuid
      returning ${COLUMNS}
    `);
    if (!rows[0]) throw PipeError.naoEncontrado('função');
    return output(rows[0]);
  } catch (error) {
    if (error instanceof PipeError) throw error;
    conflict(error);
  }
}

export async function deleteFlowFunction(tx: TransactionPipe, userId: string, id: string): Promise<void> {
  await permission(tx, userId);
  const result = await tx.execute(sql`delete from funcao_do_fluxo where id = ${requireUuid(id)}::uuid`);
  if (result.rowCount === 0) throw PipeError.naoEncontrado('função');
}

/**
 * Postgres regex matching a call `name(` that is not a property access (`x.name(`) nor part of a
 * longer identifier. `$` is the only identifier character that is special in a regex.
 */
export function callPattern(name: string): string {
  return `(^|[^A-Za-z0-9_$.])${name.replace(/\$/g, '\\$')}\\s*\\(`;
}

/**
 * Flows (not archived) whose draft or published version uses the function: an action whose
 * settings carry its id (`ExecuteBlipFunction` `source`/`functionId`, compared as text since the
 * UUID is unique) or a script that calls it by name. Block actions live in `bloco.conteudo`,
 * global actions in `fluxo_versao.global`.
 */
export async function functionUsage(tx: TransactionPipe, userId: string, id: string): Promise<FlowFunctionUsage[]> {
  await permission(tx, userId);
  const { rows: found } = await tx.execute<{ name: string }>(sql`select nome as name from funcao_do_fluxo where id = ${requireUuid(id)}::uuid`);
  if (!found[0]) throw PipeError.naoEncontrado('função');
  const byId = `%${id.toLowerCase()}%`;
  const byName = callPattern(found[0].name);
  const { rows } = await tx.execute<FlowFunctionUsage & Record<string, unknown>>(sql`
    select f.id as "flowId", f.nome as "flowName", f.short_name as "shortName"
      from fluxo f
     where f.estado <> 'arquivado'
       and exists (
         select 1 from fluxo_versao v
          where v.fluxo_id = f.id and v.estado in ('rascunho', 'publicada')
            and (v.global::text ilike ${byId} or v.global::text ~ ${byName}
                 or exists (select 1 from bloco b where b.versao_id = v.id
                             and (b.conteudo::text ilike ${byId} or b.conteudo::text ~ ${byName})))
       )
     order by f.nome, f.id
  `);
  return rows;
}

export type LoadedFlowFunction = { id: string; name: string; parameters: string[]; code: string };

/**
 * The tenant's whole library, keyed by id, for production and the Builder test run alike. The flow
 * id is no longer a filter (D-57); the parameter stays so both call sites read the same.
 */
export async function loadFlowFunctions(tx: TransactionPipe, _flowId?: string): Promise<Map<string, LoadedFlowFunction>> {
  const { rows } = await tx.execute<LoadedFlowFunction>(sql`
    select id, nome as name, parametros as parameters, codigo as code
      from funcao_do_fluxo where tenant_id = current_setting('pipe.tenant_id')::uuid order by nome, id
  `);
  return new Map(rows.map((row) => [row.id, row]));
}
