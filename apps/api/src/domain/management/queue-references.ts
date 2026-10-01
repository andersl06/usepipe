import { sql } from 'drizzle-orm';
import type { TransactionPipe } from '@pipe/db';

/** One Builder block that points at a queue. */
export interface BlockReference {
  flowName: string;
  blockCode: string;
  blockName: string;
  /** `id`: the queue id is stored; `nome`: the queue name is stored (`team`/`teams`). */
  by: 'id' | 'nome';
}

const NAME_KEYS = new Set(['team', 'teams']);

function reference(value: unknown, queueId: string, name: string, key?: string): BlockReference['by'] | null {
  if (typeof value === 'string') {
    if (value === queueId) return 'id';
    if (key && NAME_KEYS.has(key) && value.trim().toLowerCase() === name.trim().toLowerCase()) return 'nome';
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = reference(item, queueId, name, key);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    let byName: BlockReference['by'] | null = null;
    for (const [k, v] of Object.entries(value)) {
      const found = reference(v, queueId, name, k);
      if (found === 'id') return 'id';
      byName ??= found;
    }
    return byName;
  }
  return null;
}

/**
 * Blocks of the queue's own flow (draft and published versions) that name it: by id (`settings.filaId`,
 * `queueId`, transfer commands) or by name under `team`/`teams` (the `MergeContact` `extras.teams` and the
 * transfer command's `team`). `match` narrows the result: deletion cares about both, rename only about the
 * old name.
 */
export async function blocksReferencingQueue(
  tx: TransactionPipe,
  tenantId: string,
  flowId: string,
  queueId: string,
  name: string,
  match: 'id' | 'nome' | 'ambos' = 'ambos',
): Promise<BlockReference[]> {
  const { rows } = await tx.execute<{ flow: string; codigo: string; nome: string; conteudo: unknown }>(sql`
    select f.nome as flow, b.codigo, b.nome, b.conteudo
      from bloco b
      join fluxo_versao v on v.id = b.versao_id and v.tenant_id = b.tenant_id
      join fluxo f on f.id = v.fluxo_id and f.tenant_id = v.tenant_id
     where b.tenant_id = ${tenantId}::uuid and v.fluxo_id = ${flowId}::uuid and v.estado in ('rascunho', 'publicada')
     order by v.versao desc, b.codigo
  `);
  const found: BlockReference[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const by = reference(row.conteudo, queueId, name);
    if (!by || (match !== 'ambos' && by !== match) || seen.has(row.codigo)) continue;
    seen.add(row.codigo);
    found.push({ flowName: row.flow, blockCode: row.codigo, blockName: row.nome, by });
  }
  return found;
}

/** `Fluxo "X": bloco "Y" (cod), ...`, capped so the message stays readable. */
export function describeBlocks(blocks: readonly BlockReference[]): string {
  const shown = blocks.slice(0, 5).map((b) => `fluxo "${b.flowName}", bloco "${b.blockName}" (${b.blockCode})`);
  return shown.join('; ') + (blocks.length > shown.length ? `; e mais ${blocks.length - shown.length}` : '');
}
