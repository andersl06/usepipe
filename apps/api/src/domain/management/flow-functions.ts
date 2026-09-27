import { sql } from 'drizzle-orm';
import type { FlowFunction, FlowFunctionInput } from '@pipe/contracts';
import type { TransactionPipe } from '@pipe/db';
import { PipeError } from '../../errors.js';
import { requirePermission } from '../../session.js';

export const FLOW_FUNCTION_PERMISSION = 'automacao.fluxo.editar';
export const MAX_FLOW_FUNCTION_CODE = 65_536;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

type Row = {
  id: string; tenantId: string; flowId: string | null; name: string; description: string | null;
  parameters: string[]; code: string; version: number; scope: 'tenant' | 'flow';
  createdAt: Date | string; updatedAt: Date | string;
};

const iso = (value: Date | string): string => new Date(value).toISOString();
const output = (row: Row): FlowFunction => ({
  id: row.id, tenantId: row.tenantId, flowId: row.flowId, name: row.name,
  description: row.description, parameters: row.parameters, code: row.code,
  version: Number(row.version), scope: row.scope, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt),
});

function postgresCode(error: unknown): string | undefined {
  const candidate = error as { code?: string; cause?: { code?: string } };
  return candidate.code ?? candidate.cause?.code;
}

function validate(input: FlowFunctionInput): { name: string; description: string | null; parameters: string[]; code: string; flowId: string | null; scope: 'tenant' | 'flow' } {
  if (!IDENTIFIER.test(input.name)) throw PipeError.request('nome_invalido', 'O nome precisa ser um identificador JavaScript válido.');
  if (!input.code.trim()) throw PipeError.request('codigo_obrigatorio', 'O código da função é obrigatório.');
  if (input.code.length > MAX_FLOW_FUNCTION_CODE) throw PipeError.request('codigo_grande_demais', `O código aceita no máximo ${MAX_FLOW_FUNCTION_CODE} caracteres.`);
  if (!Array.isArray(input.parameters) || input.parameters.some((p) => typeof p !== 'string' || !IDENTIFIER.test(p))) {
    throw PipeError.request('parametros_invalidos', 'Cada parâmetro precisa ser um identificador JavaScript válido.');
  }
  if (new Set(input.parameters).size !== input.parameters.length) throw PipeError.request('parametros_invalidos', 'Os parâmetros não podem se repetir.');
  const flowId = input.flowId ?? null;
  return { name: input.name, description: input.description ?? null, parameters: input.parameters, code: input.code, flowId, scope: flowId ? 'flow' : 'tenant' };
}

async function permission(tx: TransactionPipe, userId: string): Promise<void> {
  await requirePermission(tx, userId, FLOW_FUNCTION_PERMISSION);
}

export async function listFlowFunctions(tx: TransactionPipe, userId: string, query: { search?: string; flowId?: string; limit?: number; offset?: number }): Promise<FlowFunction[]> {
  await permission(tx, userId);
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
  const offset = Math.max(query.offset ?? 0, 0);
  const search = query.search?.trim() ?? '';
  const pattern = `%${search.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const { rows } = await tx.execute<Row>(sql`
    select id, tenant_id as "tenantId", fluxo_id as "flowId", nome as name, descricao as description,
           parametros as parameters, codigo as code, versao as version, escopo as scope,
           criado_em as "createdAt", atualizado_em as "updatedAt"
      from funcao_do_fluxo
     where (${query.flowId ? sql`fluxo_id = ${query.flowId}::uuid` : sql`fluxo_id is null or fluxo_id is not null`})
       and (nome ilike ${pattern} escape '\\' or coalesce(descricao, '') ilike ${pattern} escape '\\')
     order by nome, id limit ${limit} offset ${offset}
  `);
  return rows.map(output);
}

export async function getFlowFunction(tx: TransactionPipe, userId: string, id: string): Promise<FlowFunction> {
  await permission(tx, userId);
  const { rows } = await tx.execute<Row>(sql`
    select id, tenant_id as "tenantId", fluxo_id as "flowId", nome as name, descricao as description,
           parametros as parameters, codigo as code, versao as version, escopo as scope,
           criado_em as "createdAt", atualizado_em as "updatedAt"
      from funcao_do_fluxo where id = ${id}::uuid limit 1
  `);
  if (!rows[0]) throw PipeError.naoEncontrado('função');
  return output(rows[0]);
}

export async function createFlowFunction(tx: TransactionPipe, userId: string, input: FlowFunctionInput): Promise<FlowFunction> {
  await permission(tx, userId);
  const value = validate(input);
  try {
    const { rows } = await tx.execute<Row>(sql`
      insert into funcao_do_fluxo (tenant_id, fluxo_id, nome, descricao, parametros, codigo, escopo)
      values (current_setting('pipe.tenant_id')::uuid, ${value.flowId ? sql`${value.flowId}::uuid` : sql`null`}, ${value.name}, ${value.description}, ${JSON.stringify(value.parameters)}::jsonb, ${value.code}, ${value.scope})
      returning id, tenant_id as "tenantId", fluxo_id as "flowId", nome as name, descricao as description,
                parametros as parameters, codigo as code, versao as version, escopo as scope,
                criado_em as "createdAt", atualizado_em as "updatedAt"
    `);
    return output(rows[0]!);
  } catch (error) {
    if (postgresCode(error) === '23505') throw PipeError.conflito('funcao_duplicada', 'Já existe uma função com esse nome no escopo.');
    throw error;
  }
}

export async function updateFlowFunction(tx: TransactionPipe, userId: string, id: string, input: FlowFunctionInput): Promise<FlowFunction> {
  await permission(tx, userId);
  const value = validate(input);
  try {
    const { rows } = await tx.execute<Row>(sql`
      update funcao_do_fluxo set nome = ${value.name}, descricao = ${value.description}, parametros = ${JSON.stringify(value.parameters)}::jsonb,
        codigo = ${value.code}, fluxo_id = ${value.flowId ? sql`${value.flowId}::uuid` : sql`null`},
        escopo = ${value.scope}, versao = versao + 1, atualizado_em = now()
      where id = ${id}::uuid
      returning id, tenant_id as "tenantId", fluxo_id as "flowId", nome as name, descricao as description,
                parametros as parameters, codigo as code, versao as version, escopo as scope,
                criado_em as "createdAt", atualizado_em as "updatedAt"
    `);
    if (!rows[0]) throw PipeError.naoEncontrado('função');
    return output(rows[0]);
  } catch (error) {
    if (postgresCode(error) === '23505') throw PipeError.conflito('funcao_duplicada', 'Já existe uma função com esse nome no escopo.');
    throw error;
  }
}

export async function deleteFlowFunction(tx: TransactionPipe, userId: string, id: string): Promise<void> {
  await permission(tx, userId);
  const result = await tx.execute(sql`delete from funcao_do_fluxo where id = ${id}::uuid`);
  if (result.rowCount === 0) throw PipeError.naoEncontrado('função');
}

export type LoadedFlowFunction = { id: string; name: string; parameters: string[]; code: string };

export async function loadFlowFunctions(tx: TransactionPipe, flowId: string): Promise<Map<string, LoadedFlowFunction>> {
  const { rows } = await tx.execute<LoadedFlowFunction>(sql`
    select id, nome as name, parametros as parameters, codigo as code
      from funcao_do_fluxo where fluxo_id is null or fluxo_id = ${flowId}::uuid
  `);
  return new Map(rows.map((row) => [row.id, row]));
}
