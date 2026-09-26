import { sql } from 'drizzle-orm';
import type { TransactionPipe } from '@pipe/db';
import type { FlowPublished } from './flow.js';

/**
 * Inbound router mirrors Blip's `master` (`referencias-blip/pesquisa/blip-api-schemas.md` §§5.3–5.5): it tracks the contact's current service, while the service supplies content; the first service is Main SubBot. `Redirect` (`content.address`) changes Master-State. Nonpersistent redirects expire after the customer's last interaction, so each inbound message renews the deadline, including those answered by a human. Apply Master-State before Change-User-State; changing service resets the destination block to root unless explicitly supplied, and the block emits only exits on the next reply. Router context (`builder:useTunnelOwnerContext`) belongs to the router/contact pair in `posicao_no_roteador.contexto`. There is no tunnel because the contact is unique within the tenant (migration 0024). Pipe decisions where Blip is silent: expiry returns to the main service at its saved block; unavailable services return to main; if main is unavailable and no valid position remains, queue the conversation without a bot.
 */

type LineOfService = {
  servico_id: string;
  principal: boolean;
  persistent: boolean;
  expiracao_min: number | null;
  usesContext: boolean;
  versao_id: string | null;
};

type LineOfPosition = {
  servico_id: string;
  expirou: boolean;
  context: Record<string, string>;
  reiniciar: boolean;
  blockInitial: string | null;
};

/** Service deadline from now; null means no expiry. */
function prazo(s: { principal: boolean; persistent: boolean; expiracao_min?: number | null; expirationMin?: number | null }) {
  const minutes = s.expiracao_min ?? s.expirationMin;
  return s.principal || s.persistent || !minutes
    ? null
    : sql`now() + ${minutes}::int * interval '1 minute'`;
}

/**
 * Resolve the contact's current published service and Master-State, renewing or returning to main as needed. Lock the position row until transaction end so two messages from the same contact cannot decide concurrently.
 */
export async function serviceOfRouter(
  tx: TransactionPipe,
  router: { id: string; tenantId: string },
  contactId: string,
): Promise<FlowPublished | null> {
  const { rows: servicos } = await tx.execute<LineOfService>(sql`
    select rs.servico_id, rs.principal, rs.persistente, rs.expiracao_min,
           f.usa_contexto_do_roteador as usa_contexto,
           (select v.id from fluxo_versao v
             where v.fluxo_id = f.id and v.estado = 'publicada'
             order by v.versao desc limit 1) as versao_id
      from roteador_servico rs
      join fluxo f on f.id = rs.servico_id
     where rs.roteador_id = ${router.id} and f.estado = 'publicado'
  `);
  const { rows: positions } = await tx.execute<LineOfPosition>(sql`
    select servico_id, coalesce(expira_em <= now(), false) as expirou, contexto,
           reiniciar, bloco_inicial
      from posicao_no_roteador
     where roteador_id = ${router.id} and contato_id = ${contactId}
     for update
  `);
  const position = positions[0];
  const noAr = servicos.filter((s) => s.versao_id !== null);
  const atual =
    position && !position.expirou ? noAr.find((s) => s.servico_id === position.servico_id) : undefined;
  const escolhido = atual ?? noAr.find((s) => s.principal);
  if (!escolhido) return null;

  if (atual) {
    await tx.execute(sql`
      update posicao_no_roteador set expira_em = ${prazo(atual)}
       where roteador_id = ${router.id} and contato_id = ${contactId}
    `);
  } else {
    // On first interaction or after a redirect expires, use the nonexpiring main service.
    await tx.execute(sql`
      insert into posicao_no_roteador (tenant_id, roteador_id, contato_id, servico_id)
      values (${router.tenantId}, ${router.id}, ${contactId}, ${escolhido.servico_id})
      on conflict (roteador_id, contato_id) do update
        set servico_id = excluded.servico_id, desde = now(), expira_em = null,
            reiniciar = false, bloco_inicial = null
    `);
  }

  return {
    flowId: escolhido.servico_id,
    versaoId: escolhido.versao_id!,
    router: {
      id: router.id,
      sharesContext: escolhido.usesContext,
      contexto: position?.context ?? {},
      reiniciar: atual !== undefined && position!.reiniciar,
      blockInitial: atual !== undefined ? position!.blockInitial : null,
    },
  };
}

/**
 * `Redirect` moves the contact to this router's service named `nome`. It must match a registered Services name (help.blip.ai); an unknown name fails the action. `blocoInicial` is the subsequent Change-User-State; without it, the destination starts at its root. This takes effect on the next message.
 */
export async function redirectInRouter(
  tx: TransactionPipe,
  pedido: {
    tenantId: string;
    routerId: string;
    contactId: string;
    service: string;
    blockInitial?: string | null;
  },
): Promise<void> {
  const { rows } = await tx.execute<{
    serviceId: string;
    principal: boolean;
    persistent: boolean;
    expirationMin: number | null;
  }>(sql`
    select servico_id, principal, persistente, expiracao_min from roteador_servico
     where roteador_id = ${pedido.routerId} and nome = ${pedido.service}
  `);
  const destination = rows[0];
  if (!destination) throw new Error(`O serviço '${pedido.service}' não existe neste roteador.`);
  await tx.execute(sql`
    insert into posicao_no_roteador (
      tenant_id, roteador_id, contato_id, servico_id, expira_em, reiniciar, bloco_inicial
    ) values (
      ${pedido.tenantId}, ${pedido.routerId}, ${pedido.contactId}, ${destination.serviceId},
      ${prazo(destination)}, true, ${pedido.blockInitial ?? null}
    )
    on conflict (roteador_id, contato_id) do update
      set servico_id = excluded.servico_id, desde = now(), expira_em = excluded.expira_em,
          reiniciar = true, bloco_inicial = excluded.bloco_inicial
  `);
}
