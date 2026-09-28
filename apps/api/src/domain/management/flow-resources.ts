import { sql } from 'drizzle-orm';
import type { FlowResource, FlowResourceInput } from '@pipe/contracts';
import type { TransactionPipe } from '@pipe/db';
import { MAX_FLOW_RESOURCE_VALUE } from '@pipe/db/schema';
import { PipeError } from '../../errors.js';
import { requirePermissionInFlow } from './team-of-flow.js';

/**
 * Blip "Recursos" (menu `contents`, permission key `resources`, `portal.js`'s `ResourceService`):
 * a per-flow key/value store the builder's `{{resource.<name>}}` reads through the engine's
 * `resource` provider (`@pipe/core/flow/context.ts`). Source fields are `key` (here `name`), `type`
 * (a MIME type, `text/plain` or `application/json` in the built-in content-type list) and `content`
 * (here `value`); the source only rejects emojis in the key and validates JSON when the type ends
 * with `json` (`portal.js`'s `isJson`/`onChangeType`). Pipe's `name` grammar is narrower than
 * Blip's — it must be usable as `{{resource.name}}` (`NAME_OF_VARIABLE` in `context.ts`, which
 * accepts letters, digits, underscore and dot, no hyphen) — otherwise a saved resource could never
 * be read back by the engine.
 */

const NAME = /^[\p{L}\p{N}_.]{1,190}$/u;
const MAX_TYPE = 100;

function validate(input: FlowResourceInput): { name: string; type: string; value: string } {
  const name = input.name?.trim() ?? '';
  if (!NAME.test(name)) {
    throw PipeError.request(
      'nome_invalido',
      'A chave do recurso deve conter apenas letras, números, "_" ou "." (sem espaços, hífen ou emojis), com até 190 caracteres.',
    );
  }
  const type = input.type?.trim() ?? '';
  if (!type || type.length > MAX_TYPE) {
    throw PipeError.request('tipo_invalido', 'Selecione o tipo do recurso.');
  }
  const value = input.value ?? '';
  if (!value.trim()) {
    throw PipeError.request('conteudo_obrigatorio', 'O conteúdo do recurso é obrigatório.');
  }
  if (value.length > MAX_FLOW_RESOURCE_VALUE) {
    throw PipeError.request(
      'conteudo_grande_demais',
      `O conteúdo aceita no máximo ${MAX_FLOW_RESOURCE_VALUE} caracteres.`,
    );
  }
  if (type.endsWith('json')) {
    try {
      JSON.parse(value);
    } catch {
      throw PipeError.request('conteudo_invalido', 'Este conteúdo deve ser um JSON válido.');
    }
  }
  return { name, type, value };
}

function postgresCode(error: unknown): string | undefined {
  const candidate = error as { code?: string; cause?: { code?: string } };
  return candidate.code ?? candidate.cause?.code;
}

type Row = {
  id: string; flowId: string; name: string; type: string; value: string;
  createdAt: Date | string; updatedAt: Date | string | null;
};

const iso = (value: Date | string | null): string | null => (value ? new Date(value).toISOString() : null);
const output = (row: Row): FlowResource => ({
  id: row.id, flowId: row.flowId, name: row.name, type: row.type, value: row.value,
  createdAt: iso(row.createdAt) as string, updatedAt: iso(row.updatedAt),
});

/** The tenant's live flow, or 404 — same rule as `team-of-flow.ts`'s `flowLive`. */
async function flowLive(tx: TransactionPipe, tenantId: string, flowId: string): Promise<void> {
  const { rows } = await tx.execute<{ id: string }>(sql`
    select id from fluxo where id = ${flowId}::uuid and tenant_id = ${tenantId} and estado <> 'arquivado'
  `);
  if (!rows[0]) throw PipeError.naoEncontrado('fluxo');
}

export async function listFlowResources(
  tx: TransactionPipe,
  userId: string,
  tenantId: string,
  flowId: string,
): Promise<FlowResource[]> {
  await flowLive(tx, tenantId, flowId);
  await requirePermissionInFlow(tx, userId, flowId, 'resources.ler');
  const { rows } = await tx.execute<Row>(sql`
    select id, fluxo_id as "flowId", nome as name, tipo as type, valor as value,
           criado_em as "createdAt", atualizado_em as "updatedAt"
      from recurso_do_fluxo where fluxo_id = ${flowId}::uuid
     order by nome
  `);
  return rows.map(output);
}

export async function createFlowResource(
  tx: TransactionPipe,
  userId: string,
  tenantId: string,
  flowId: string,
  input: FlowResourceInput,
): Promise<FlowResource> {
  await flowLive(tx, tenantId, flowId);
  await requirePermissionInFlow(tx, userId, flowId, 'resources.escrever');
  const value = validate(input);
  try {
    const { rows } = await tx.execute<Row>(sql`
      insert into recurso_do_fluxo (tenant_id, fluxo_id, nome, tipo, valor)
      values (current_setting('pipe.tenant_id')::uuid, ${flowId}::uuid, ${value.name}, ${value.type}, ${value.value})
      returning id, fluxo_id as "flowId", nome as name, tipo as type, valor as value,
                criado_em as "createdAt", atualizado_em as "updatedAt"
    `);
    return output(rows[0]!);
  } catch (error) {
    if (postgresCode(error) === '23505') throw PipeError.conflito('recurso_duplicado', 'Já existe um recurso com essa chave neste fluxo.');
    throw error;
  }
}

export async function updateFlowResource(
  tx: TransactionPipe,
  userId: string,
  tenantId: string,
  flowId: string,
  id: string,
  input: FlowResourceInput,
): Promise<FlowResource> {
  await flowLive(tx, tenantId, flowId);
  await requirePermissionInFlow(tx, userId, flowId, 'resources.escrever');
  const value = validate(input);
  try {
    const { rows } = await tx.execute<Row>(sql`
      update recurso_do_fluxo set nome = ${value.name}, tipo = ${value.type}, valor = ${value.value}, atualizado_em = now()
      where id = ${id}::uuid and fluxo_id = ${flowId}::uuid
      returning id, fluxo_id as "flowId", nome as name, tipo as type, valor as value,
                criado_em as "createdAt", atualizado_em as "updatedAt"
    `);
    if (!rows[0]) throw PipeError.naoEncontrado('recurso');
    return output(rows[0]);
  } catch (error) {
    if (postgresCode(error) === '23505') throw PipeError.conflito('recurso_duplicado', 'Já existe um recurso com essa chave neste fluxo.');
    throw error;
  }
}

export async function deleteFlowResource(
  tx: TransactionPipe,
  userId: string,
  tenantId: string,
  flowId: string,
  id: string,
): Promise<void> {
  await flowLive(tx, tenantId, flowId);
  await requirePermissionInFlow(tx, userId, flowId, 'resources.escrever');
  const result = await tx.execute(sql`delete from recurso_do_fluxo where id = ${id}::uuid and fluxo_id = ${flowId}::uuid`);
  if (result.rowCount === 0) throw PipeError.naoEncontrado('recurso');
}

/**
 * What the engine's `Context.resources` needs (`@pipe/core/flow/context.ts`): every resource's
 * value, keyed by name, no tenant/id noise. Loaded alongside `contact` when the `api` builds the
 * inbound context (`apps/api/src/domain/flow.ts`), never behind a permission check — the flow
 * itself is already scoped by `fluxo_id`/RLS, the same trust boundary `configuration` uses.
 */
export async function loadFlowResources(
  tx: TransactionPipe,
  flowId: string,
): Promise<Record<string, string>> {
  const { rows } = await tx.execute<{ name: string; value: string }>(sql`
    select nome as name, valor as value from recurso_do_fluxo where fluxo_id = ${flowId}::uuid
  `);
  return Object.fromEntries(rows.map((row) => [row.name, row.value]));
}
