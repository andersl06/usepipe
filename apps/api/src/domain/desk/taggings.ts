import { sql } from 'drizzle-orm';
import type { TransactionPipe } from '@pipe/db';
import type { Campos, Resultado } from '../management/actions/campos.js';

/**
 * Pinning and marking unread implement the Desk card's "⋮" menu, which previously only called `stopPropagation()`. The source `TicketMenuOptions` (`blip-desk-regras-tecnicas.md` §1.8: `PIN`/`UNPIN`, `UNREAD`/`READ`) and `blip-desk-funcoes.md` §3 allow an agent to pin up to 50 own tickets and toggle unread. Both marks are PER AGENT; a transferred conversation starts unmarked for its new agent. Store them in `marcacao_conversa` (migration 0041), never on `conversa`. The SESSION agent may mark only an open conversation assigned to them; `usuarioId` never comes from the body, as in `acoes.ts`. Delete the row when both marks are null because this table stores markings, not their absence. Source wording: "o próprio atendente pode fixar manualmente até 50 tickets no topo da sua lista, e também marcar/desmarcar qualquer ticket como 'não lido'".
 */

/** O teto da origem: 50 tickets fixados por atendente. */
export const MAX_FIXADAS = 50;

const OK: Resultado = { ok: true };

function falha(error: string): Resultado {
  return { ok: false, error };
}

function comoBooleano(value: unknown): boolean | null {
  const texto = String(value ?? '').trim().toLowerCase();
  // `on` is how `FormData` sends a checked box; see `campos.ts`.
  if (texto === 'true' || texto === '1' || texto === 'sim' || texto === 'on') return true;
  if (texto === 'false' || texto === '0' || texto === 'nao' || texto === 'não') return false;
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Confirm that the conversation exists, is open, and belongs to this agent; otherwise return the reason. */
async function checkConversation(
  tx: TransactionPipe,
  atendenteId: string,
  conversationId: string,
): Promise<string | null> {
  if (!UUID.test(conversationId)) return 'Conversa não informada.';
  const { rows } = await tx.execute<{ state: string; agentId: string | null }>(
    sql`select estado as "state", atendente_id as "agentId" from conversa where id = ${conversationId}::uuid limit 1`,
  );
  const conversation = rows[0];
  if (!conversation) return 'Conversa não encontrada.';
  if (conversation.state === 'encerrada') return 'A conversa já foi encerrada.';
  if (conversation.agentId !== atendenteId) return 'Esta conversa não está com você.';
  return null;
}

/**
 * Remove ONE mark by deleting the row if it would become empty, and only otherwise clearing that mark. The `marcacao_conversa_alguma_ck` `CHECK` runs during `update`: clearing first and deleting later fails before cleanup, as happened when unpinning a conversation with no other mark.
 */
async function tirarMarca(
  tx: TransactionPipe,
  atendenteId: string,
  conversaId: string,
  marca: 'fixada_em' | 'nao_lida_em',
) {
  const outra = marca === 'fixada_em' ? sql`nao_lida_em` : sql`fixada_em`;
  const onde = sql`usuario_id = ${atendenteId}::uuid and conversa_id = ${conversaId}::uuid`;
  await tx.execute(sql`delete from marcacao_conversa where ${onde} and ${outra} is null`);
  await tx.execute(
    sql`update marcacao_conversa set ${sql.raw(marca)} = null where ${onde}`,
  );
}

/**
 * `fixar` receives `conversaId` and `fixada` (`true`/`false`). Pinning an already pinned ticket is a no-op, preserving `fixada_em` and list order; unpinning an unpinned ticket is also a no-op.
 */
export async function fixar(
  tx: TransactionPipe,
  tenantId: string,
  atendenteId: string,
  dados: Campos,
): Promise<Resultado & { fixada?: boolean }> {
  const conversaId = String(dados.get('conversaId') ?? '');
  const fixada = comoBooleano(dados.get('fixada'));
  if (fixada === null) return falha('Informe se a conversa deve ficar fixada.');

  const motivo = await checkConversation(tx, atendenteId, conversaId);
  if (motivo) return falha(motivo);

  if (fixada) {
    // The limit counts OTHER pinned tickets; pinning the same one again must not hit the cap.
    const { rows } = await tx.execute<{ n: string }>(sql`
      select count(*)::text as n from marcacao_conversa
       where usuario_id = ${atendenteId}::uuid and fixada_em is not null
         and conversa_id <> ${conversaId}::uuid
    `);
    if (Number(rows[0]?.n ?? 0) >= MAX_FIXADAS) {
      return falha(
        `Você já tem ${MAX_FIXADAS} conversas fixadas. Desafixe uma para fixar outra.`,
      );
    }
    await tx.execute(sql`
      insert into marcacao_conversa (tenant_id, usuario_id, conversa_id, fixada_em)
      values (${tenantId}::uuid, ${atendenteId}::uuid, ${conversaId}::uuid, now())
      on conflict (usuario_id, conversa_id)
        do update set fixada_em = coalesce(marcacao_conversa.fixada_em, excluded.fixada_em)
    `);
  } else {
    await tirarMarca(tx, atendenteId, conversaId, 'fixada_em');
  }
  return { ...OK, fixada };
}

/**
 * `marcarNaoLida` receives `conversaId` and `naoLida` (`true`/`false`). Opening a conversation automatically marks it read on the source screen (the "Não lidas" panel removes a ticket when opened); unread is a manual reminder to return later.
 */
export async function marcarNaoLida(
  tx: TransactionPipe,
  tenantId: string,
  agentId: string,
  data: Campos,
): Promise<Resultado & { naoLida?: boolean }> {
  const conversationId = String(data.get('conversaId') ?? '');
  const naoLida = comoBooleano(data.get('naoLida'));
  if (naoLida === null) return falha('Informe se a conversa deve ficar como não lida.');

  const motivo = await checkConversation(tx, agentId, conversationId);
  if (motivo) return falha(motivo);

  if (naoLida) {
    await tx.execute(sql`
      insert into marcacao_conversa (tenant_id, usuario_id, conversa_id, nao_lida_em)
      values (${tenantId}::uuid, ${agentId}::uuid, ${conversationId}::uuid, now())
      on conflict (usuario_id, conversa_id)
        do update set nao_lida_em = coalesce(marcacao_conversa.nao_lida_em, excluded.nao_lida_em)
    `);
  } else {
    await tirarMarca(tx, agentId, conversationId, 'nao_lida_em');
  }
  return { ...OK, naoLida };
}
