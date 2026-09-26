import { logAuditoria } from './schema/identity.js';
import type { TransactionPipe } from './tenant.js';

/**
 * Records who changed what. `log_auditoria` existed since the foundation but received no writes. A usability audit found Pipe registration screens could create records but not edit or delete them because specs said they were waiting for an audit log. That absence prevented even correcting a mistyped name. Record before and after values in the same transaction as the change: a separate log transaction can disappear when the change fails or remain when it rolls back. Either outcome makes the audit log lie, which is worse than no log because people trust it.
 */

/** Actor type: a person, an API key, or the system itself. */
export const TIPOS_DE_ATOR = ['usuario', 'chave', 'sistema'] as const;
export type TipoDeAtor = (typeof TIPOS_DE_ATOR)[number];

/**
 * Recorded actions use a closed list deliberately. Free text would put `update`, `atualizar`, `atualizou`, and `edit` in the same table and make the audit log unqueryable.
 */
export const ACTIONS = ['criou', 'alterou', 'excluiu', 'ativou', 'desativou'] as const;
export type Acao = (typeof ACTIONS)[number];

export interface Ator {
  type: TipoDeAtor;
  /** Null for `sistema`: cron has no actor ID. */
  id?: string | null;
  ip?: string | null;
}

export interface EventoDeAuditoria {
  ator: Ator;
  acao: Acao;
  /** Nome da tabela em snake_case: `fila`, `resposta_pronta`, `usuario`. */
  objetoTipo: string;
  objetoId: string;
  /** O estado anterior. Ausente em `criou`. */
  antes?: Record<string, unknown> | null;
  /** O estado novo. Ausente em `excluiu`. */
  depois?: Record<string, unknown> | null;
}

/**
 * Fields never written to audit logs, even if present in the input. Support reads and contract audits export this log; logging secrets here would undo the database encryption applied by `segredo.ts` in a more visible place.
 */
const NUNCA_REGISTRAR = new Set([
  'senhaHash',
  'senha_hash',
  'tokenHash',
  'token_hash',
  'tokenAcesso',
  'appSecret',
  'verifyToken',
  'senhaSmtp',
  'clientSecret',
  'config',
]);

function limpar(
  objeto: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!objeto) return null;
  const saida: Record<string, unknown> = {};
  for (const [chave, value] of Object.entries(objeto)) {
    if (NUNCA_REGISTRAR.has(chave)) continue;
    saida[chave] = value instanceof Date ? value.toISOString() : value;
  }
  return saida;
}

/**
 * Write the audit event in the same transaction as the change. The function accepts `tx`, so rollback removes the log with the change. It also accepts a caller-supplied `tenantId` and writes it to SQL `tenant_id`; callers must use the transaction tenant or the event could be attributed to another tenant.
 */
export async function registrarAuditoria(
  tx: TransactionPipe,
  tenantId: string,
  evento: EventoDeAuditoria,
): Promise<void> {
  await tx.insert(logAuditoria).values({
    tenantId,
    atorTipo: evento.ator.type,
    atorId: evento.ator.id ?? null,
    acao: evento.acao,
    objetoTipo: evento.objetoTipo,
    objetoId: evento.objetoId,
    antes: limpar(evento.antes),
    depois: limpar(evento.depois),
    ip: evento.ator.ip ?? null,
  });
}

/**
 * Difference between two states, containing only changed fields. Storing both full objects would bloat the table and hide changes: audit readers need to see capacity move from 5 to 8, not reread fifteen unchanged columns.
 */
export function diferenca(
  antes: Record<string, unknown>,
  depois: Record<string, unknown>,
): { antes: Record<string, unknown>; depois: Record<string, unknown> } {
  const a: Record<string, unknown> = {};
  const d: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(antes), ...Object.keys(depois)])) {
    const va = antes[key];
    const vd = depois[key];
    if (sameValue(va, vd)) continue;
    a[key] = va;
    d[key] = vd;
  }
  return { antes: a, depois: d };
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a === b) return true;
  // For audit logging, `null` and `undefined` represent the same absence: the driver returns
  // `null` while the form sends `undefined`, which is not a change.
  if (a == null && b == null) return true;
  return false;
}
