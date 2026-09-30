import { sql } from 'drizzle-orm';
import type { FlowSecret, FlowSecretInput } from '@pipe/contracts';
import { cifrar, decifrar, registrarAuditoria } from '@pipe/db';
import type { Keyring, TransactionPipe } from '@pipe/db';
import type { PedidoDeHttp } from '@pipe/core';
import { keyring } from '../../database.js';
import { PipeError } from '../../errors.js';
import { requirePermissionInFlow } from './team-of-flow.js';

/**
 * Blip Builder > Configurações > "Variáveis sensíveis" (P11): per-flow secrets the engine reads as
 * `{{secret.<name>}}`, and ONLY while substituting an HTTP action (`@pipe/core` `ACTIONS_WITH_SECRETS`).
 *
 * Scope is the flow, like `recurso_do_fluxo`: in Blip the section belongs to the bot's Builder
 * configuration, and a Blip bot is a Pipe flow.
 *
 * Storage reuses the repo's key management (`packages/db/src/secret.ts`, the same keyring that
 * encrypts channel tokens and mTLS passwords): `valor_cifrado` holds an AES-256-GCM envelope. The
 * API is write-only for the value: no response, list or audit entry ever carries it (Blip:
 * "Valores suprimidos"). Only `loadFlowSecret` decrypts, for the engine. Raw SQL on purpose
 * (migration 0055), as in `certificados.ts`, to keep the shared Drizzle schema untouched.
 */

/** Same grammar as resources: the engine must be able to parse `{{secret.<name>}}` back. */
const NAME = /^[\p{L}\p{N}_.]{1,190}$/u;
/** A secret is a token or credential, not a document. */
export const MAX_FLOW_SECRET_VALUE = 8_192;

function validate(input: FlowSecretInput | null | undefined): { name: string; value: string } {
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  if (!NAME.test(name)) {
    throw PipeError.request(
      'nome_invalido',
      'O nome da variável deve conter apenas letras, números, "_" ou "." (sem espaços, hífen ou emojis), com até 190 caracteres.',
    );
  }
  const value = typeof input?.value === 'string' ? input.value : '';
  if (!value.trim()) {
    throw PipeError.request('valor_obrigatorio', 'Informe o valor da variável sensível.');
  }
  if (value.length > MAX_FLOW_SECRET_VALUE) {
    throw PipeError.request(
      'valor_grande_demais',
      `O valor aceita no máximo ${MAX_FLOW_SECRET_VALUE} caracteres.`,
    );
  }
  return { name, value };
}

function postgresCode(error: unknown): string | undefined {
  const candidate = error as { code?: string; cause?: { code?: string } };
  return candidate.code ?? candidate.cause?.code;
}

const DUPLICATE = (): PipeError =>
  PipeError.conflito('variavel_duplicada', 'Já existe uma variável sensível com esse nome neste fluxo.');

type Row = {
  id: string; flowId: string; name: string;
  createdAt: Date | string; updatedAt: Date | string | null;
};

/** Columns every query returns: never `valor_cifrado`, not even encrypted. */
const COLUMNS = sql`id, fluxo_id as "flowId", nome as name, criado_em as "createdAt", atualizado_em as "updatedAt"`;

const iso = (value: Date | string | null): string | null => (value ? new Date(value).toISOString() : null);
const output = (row: Row): FlowSecret => ({
  id: row.id, flowId: row.flowId, name: row.name,
  createdAt: iso(row.createdAt) as string, updatedAt: iso(row.updatedAt),
});

async function flowLive(tx: TransactionPipe, tenantId: string, flowId: string): Promise<void> {
  const { rows } = await tx.execute<{ id: string }>(sql`
    select id from fluxo where id = ${flowId}::uuid and tenant_id = ${tenantId} and estado <> 'arquivado'
  `);
  if (!rows[0]) throw PipeError.naoEncontrado('fluxo');
}

export async function listFlowSecrets(
  tx: TransactionPipe,
  userId: string,
  tenantId: string,
  flowId: string,
): Promise<FlowSecret[]> {
  await flowLive(tx, tenantId, flowId);
  await requirePermissionInFlow(tx, userId, flowId, 'builder.ler');
  const { rows } = await tx.execute<Row>(sql`
    select ${COLUMNS} from variavel_secreta_do_fluxo where fluxo_id = ${flowId}::uuid order by nome
  `);
  return rows.map(output);
}

export async function createFlowSecret(
  tx: TransactionPipe,
  userId: string,
  tenantId: string,
  flowId: string,
  input: FlowSecretInput,
  chaves: Keyring = keyring(),
): Promise<FlowSecret> {
  await flowLive(tx, tenantId, flowId);
  await requirePermissionInFlow(tx, userId, flowId, 'builder.escrever');
  const { name, value } = validate(input);
  const encrypted = cifrar(value, chaves);
  let row: Row;
  try {
    const { rows } = await tx.execute<Row>(sql`
      insert into variavel_secreta_do_fluxo (tenant_id, fluxo_id, nome, valor_cifrado)
      values (${tenantId}::uuid, ${flowId}::uuid, ${name}, ${encrypted})
      returning ${COLUMNS}
    `);
    row = rows[0]!;
  } catch (error) {
    if (postgresCode(error) === '23505') throw DUPLICATE();
    throw error;
  }
  await registrarAuditoria(tx, tenantId, {
    ator: { type: 'usuario', id: userId },
    acao: 'criou',
    objetoTipo: 'variavel_secreta_do_fluxo',
    objetoId: row.id,
    depois: { flowId, name },
  });
  return output(row);
}

/** Replace name and value together: the old value is never shown, so an edit always re-enters it. */
export async function updateFlowSecret(
  tx: TransactionPipe,
  userId: string,
  tenantId: string,
  flowId: string,
  id: string,
  input: FlowSecretInput,
  chaves: Keyring = keyring(),
): Promise<FlowSecret> {
  await flowLive(tx, tenantId, flowId);
  await requirePermissionInFlow(tx, userId, flowId, 'builder.escrever');
  const { name, value } = validate(input);
  const encrypted = cifrar(value, chaves);
  const { rows: before } = await tx.execute<{ name: string }>(sql`
    select nome as name from variavel_secreta_do_fluxo where id = ${id}::uuid and fluxo_id = ${flowId}::uuid
  `);
  if (!before[0]) throw PipeError.naoEncontrado('variável sensível');
  let row: Row;
  try {
    const { rows } = await tx.execute<Row>(sql`
      update variavel_secreta_do_fluxo
         set nome = ${name}, valor_cifrado = ${encrypted}, atualizado_em = now()
       where id = ${id}::uuid and fluxo_id = ${flowId}::uuid
      returning ${COLUMNS}
    `);
    row = rows[0]!;
  } catch (error) {
    if (postgresCode(error) === '23505') throw DUPLICATE();
    throw error;
  }
  await registrarAuditoria(tx, tenantId, {
    ator: { type: 'usuario', id: userId },
    acao: 'alterou',
    objetoTipo: 'variavel_secreta_do_fluxo',
    objetoId: row.id,
    // The value changed too, but the audit log records only that it did, never what it is.
    antes: { name: before[0].name },
    depois: { name, valor: 'alterado' },
  });
  return output(row);
}

export async function deleteFlowSecret(
  tx: TransactionPipe,
  userId: string,
  tenantId: string,
  flowId: string,
  id: string,
): Promise<void> {
  await flowLive(tx, tenantId, flowId);
  await requirePermissionInFlow(tx, userId, flowId, 'builder.escrever');
  const { rows } = await tx.execute<{ name: string }>(sql`
    delete from variavel_secreta_do_fluxo where id = ${id}::uuid and fluxo_id = ${flowId}::uuid
    returning nome as name
  `);
  if (!rows[0]) throw PipeError.naoEncontrado('variável sensível');
  await registrarAuditoria(tx, tenantId, {
    ator: { type: 'usuario', id: userId },
    acao: 'excluiu',
    objetoTipo: 'variavel_secreta_do_fluxo',
    objetoId: id,
    antes: { flowId, name: rows[0].name },
  });
}

/** A suspended ProcessHttp request as `process_http_execucao.pedido` stores it. */
export type StoredHttpRequest = PedidoDeHttp | { cifrado: string };

/**
 * What a suspended `ProcessHttp` writes to `process_http_execucao.pedido`: the request itself, or,
 * when the engine substituted a `{{secret.*}}` into it (`sensivel`), the whole request encrypted with
 * the keyring, so the credential never sits in the database in plaintext.
 */
export function sealHttpRequest(pedido: PedidoDeHttp, chaves: () => Keyring = keyring): StoredHttpRequest {
  if (!pedido.sensivel) return pedido;
  return { cifrado: cifrar(JSON.stringify(pedido), chaves()) };
}

/** Inverse of `sealHttpRequest`, for the call made after the transaction. */
export function openHttpRequest(stored: StoredHttpRequest, chaves: () => Keyring = keyring): PedidoDeHttp {
  if (!('cifrado' in stored)) return stored;
  try {
    return JSON.parse(decifrar(stored.cifrado, chaves())) as PedidoDeHttp;
  } catch {
    throw new Error('Não foi possível decifrar a requisição HTTP suspensa.');
  }
}

/**
 * The decrypted value of one secret for the engine's `services.resolveSecret`, or null when the flow
 * has no secret with that name. Never behind a permission check: the flow is already scoped by
 * `fluxo_id`/RLS, the same trust boundary resources use. A decryption failure throws a message that
 * names neither the secret's value nor the key material.
 */
export async function loadFlowSecret(
  tx: TransactionPipe,
  flowId: string,
  name: string,
  chaves: () => Keyring = keyring,
): Promise<string | null> {
  const { rows } = await tx.execute<{ encrypted: string }>(sql`
    select valor_cifrado as encrypted from variavel_secreta_do_fluxo
     where fluxo_id = ${flowId}::uuid and nome = ${name}
  `);
  const encrypted = rows[0]?.encrypted;
  if (encrypted === undefined) return null;
  try {
    return decifrar(encrypted, chaves());
  } catch {
    throw new Error(`Não foi possível decifrar a variável sensível '${name}'.`);
  }
}
