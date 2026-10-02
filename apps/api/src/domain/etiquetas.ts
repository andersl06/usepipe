import { sql } from 'drizzle-orm';
import { registrarAuditoria } from '@pipe/db';
import type { TransactionPipe } from '@pipe/db';
import { isClosedState } from '@pipe/core';
import { noTenant } from '../database.js';
import { PipeError } from '../errors.js';
import { requirePermission } from '../session.js';
import { evento, publicar } from '../realtime.js';
import type { ActorOfConversation } from './conversation.js';

/**
 * Tag an OPEN conversation or a CONTACT outside closing. Previously a conversation could be tagged only through `POST /encerrar`, which also closed it. The source distinguishes `ModalType.ADD_TAGS` from `CLOSE_TICKET` (`referencias-blip/pesquisa/blip-desk-regras-tecnicas.md` §1.8): an open ticket's tag is a work note, while the closing tag is final classification. Both use `conversa_etiqueta`, so a tag added here appears selected in the close modal. `contato_etiqueta` already existed without read or write routes. Enforce scope (`conversa` | `contato` | `ambos`) on the server: conversation-only tags cannot go on contacts and vice versa. Record `registrarAuditoria` in the SAME transaction as every catalog write.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ScopeOfLabel = 'conversa' | 'contato';

export interface EtiquetaDoTenant {
  id: string;
  name: string;
  color: string | null;
  scope: 'conversa' | 'contato' | 'ambos';
  requiredInClosure: boolean;
}

/** As etiquetas do tenant, todas; `escopo` filtra pelas que cabem em conversa ou contato. */
export async function listarEtiquetasDoTenant(
  tx: TransactionPipe,
  scope: ScopeOfLabel | null,
): Promise<EtiquetaDoTenant[]> {
  const { rows } = await tx.execute<{
    id: string;
    name: string;
    color: string | null;
    scope: 'conversa' | 'contato' | 'ambos';
    requiredInClosure: boolean;
  }>(sql`
    select id, nome as name, cor as color, escopo as scope,
           obrigatoria_no_encerramento as "requiredInClosure"
      from etiqueta
     where ${scope === null ? sql`true` : sql`escopo in (${scope}, 'ambos')`}
     order by nome
  `);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    scope: r.scope,
    requiredInClosure: r.requiredInClosure,
  }));
}

type LinhaEtiqueta = { id: string; name: string; scope: string };

/** A etiqueta existe no tenant e cabe no alvo. */
async function carregarEtiqueta(
  tx: TransactionPipe,
  etiquetaId: string,
  alvo: ScopeOfLabel,
): Promise<LinhaEtiqueta> {
  if (!UUID.test(etiquetaId)) throw PipeError.naoEncontrado('Etiqueta');
  const { rows } = await tx.execute<LinhaEtiqueta>(
    sql`select id, nome as name, escopo as scope from etiqueta where id = ${etiquetaId}::uuid limit 1`,
  );
  const etiqueta = rows[0];
  if (!etiqueta) throw PipeError.naoEncontrado('Etiqueta');
  if (etiqueta.scope !== alvo && etiqueta.scope !== 'ambos') {
    throw PipeError.request(
      'label_of_other_scope',
      alvo === 'conversa'
        ? `A etiqueta "${etiqueta.name}" é de contato, não de conversa.`
        : `A etiqueta "${etiqueta.name}" é de conversa, não de contato.`,
    );
  }
  return etiqueta;
}

type LineConversation = { id: string; state: string; agentId: string | null };

/**
 * The conversation must exist and be open; for a person, it must be assigned to that agent. Reject closed tickets: retagging them is a manager's history operation, not a Desk action.
 */
async function loadConversationOpen(
  tx: TransactionPipe,
  conversaId: string,
  ator: ActorOfConversation,
): Promise<LineConversation> {
  if (!UUID.test(conversaId)) throw PipeError.naoEncontrado('Conversa');
  const { rows } = await tx.execute<LineConversation>(
    sql`select id, estado as state, atendente_id as "agentId" from conversa where id = ${conversaId}::uuid limit 1`,
  );
  const conversation = rows[0];
  if (!conversation) throw PipeError.naoEncontrado('Conversa');
  if (isClosedState(conversation.state)) {
    throw PipeError.conflito(
      'conversation_closed',
      'A conversa está encerrada: a etiqueta de encerramento já foi dada.',
    );
  }
  if (ator.requireAssignment && conversation.agentId !== ator.agentId) {
    throw new PipeError(
      403,
      'conversation_of_other_agent',
      conversation.agentId
        ? 'Esta conversa está com outro atendente.'
        : 'Esta conversa não está atribuída a você.',
    );
  }
  return conversation;
}

export interface EtiquetaAplicada {
  etiquetaId: string;
  name: string;
  /** Return `false` if already present; repeated application is a no-op, not an error. */
  aplicada: boolean;
}

export async function labelConversation(
  ator: ActorOfConversation,
  conversationId: string,
  etiquetaId: string,
): Promise<EtiquetaAplicada> {
  const resultado = await noTenant(ator.tenantId, async (tx) => {
    if (ator.requireAssignment) {
      if (!ator.agentId) throw PipeError.naoAutorizado();
      await requirePermission(tx, ator.agentId, 'conversa.etiquetar');
    }
    const conversa = await loadConversationOpen(tx, conversationId, ator);
    const etiqueta = await carregarEtiqueta(tx, etiquetaId, 'conversa');

    const { rowCount } = await tx.execute(sql`
      insert into conversa_etiqueta (tenant_id, conversa_id, etiqueta_id, por_usuario_id)
      values (${ator.tenantId}, ${conversa.id}, ${etiqueta.id}, ${ator.agentId})
      on conflict do nothing
    `);
    const aplicada = (rowCount ?? 0) > 0;
    if (aplicada) {
      await registrarAuditoria(tx, ator.tenantId, {
        ator: ator.agentId ? { type: 'usuario', id: ator.agentId } : { type: 'chave' },
        acao: 'criou',
        objetoTipo: 'conversa_etiqueta',
        objetoId: conversa.id,
        depois: { etiqueta_id: etiqueta.id, etiqueta: etiqueta.name },
      });
    }
    return { etiquetaId: etiqueta.id, name: etiqueta.name, aplicada };
  });

  // Depois do commit: a faixa de etiquetas da conversa mudou.
  await publicar(ator.tenantId, evento('conversation', conversationId));
  return resultado;
}

export async function unlabelConversation(
  ator: ActorOfConversation,
  conversaId: string,
  etiquetaId: string,
): Promise<{ removida: boolean }> {
  const resultado = await noTenant(ator.tenantId, async (tx) => {
    if (ator.requireAssignment) {
      if (!ator.agentId) throw PipeError.naoAutorizado();
      await requirePermission(tx, ator.agentId, 'conversa.etiquetar');
    }
    const conversa = await loadConversationOpen(tx, conversaId, ator);
    if (!UUID.test(etiquetaId)) throw PipeError.naoEncontrado('Etiqueta');

    const { rows } = await tx.execute<{ name: string }>(sql`
      delete from conversa_etiqueta ce
       using etiqueta e
       where e.id = ce.etiqueta_id
         and ce.conversa_id = ${conversa.id}::uuid and ce.etiqueta_id = ${etiquetaId}::uuid
      returning e.nome as name
    `);
    const removida = rows.length > 0;
    if (removida) {
      await registrarAuditoria(tx, ator.tenantId, {
        ator: ator.agentId ? { type: 'usuario', id: ator.agentId } : { type: 'chave' },
        acao: 'excluiu',
        objetoTipo: 'conversa_etiqueta',
        objetoId: conversa.id,
        antes: { etiqueta_id: etiquetaId, etiqueta: rows[0]!.name },
      });
    }
    return { removida };
  });

  await publicar(ator.tenantId, evento('conversation', conversaId));
  return resultado;
}

/* ------------------------------------------------------------- contato */

export type LabelOfContact = {
  id: string;
  name: string;
  color: string | null;
}

export async function listLabelsOfContact(
  tx: TransactionPipe,
  contactId: string,
): Promise<LabelOfContact[]> {
  if (!UUID.test(contactId)) return [];
  const { rows } = await tx.execute<LabelOfContact>(sql`
    select e.id, e.nome as name, e.cor as color
      from contato_etiqueta ce
      join etiqueta e on e.id = ce.etiqueta_id
     where ce.contato_id = ${contactId}::uuid
     order by e.nome
  `);
  return rows;
}

async function loadContact(tx: TransactionPipe, contatoId: string): Promise<{ id: string }> {
  if (!UUID.test(contatoId)) throw PipeError.naoEncontrado('Contato');
  const { rows } = await tx.execute<{ id: string }>(
    sql`select id from contato where id = ${contatoId}::uuid and excluido_em is null limit 1`,
  );
  const contact = rows[0];
  if (!contact) throw PipeError.naoEncontrado('Contato');
  return contact;
}

/** Requester is a person with `contato.editar` or an API key with `contatos:escrever` and no person permission. */
export interface ActorOfContact {
  tenantId: string;
  userId: string | null;
  viaSession: boolean;
}

export async function labelContact(
  ator: ActorOfContact,
  contatoId: string,
  etiquetaId: string,
): Promise<EtiquetaAplicada> {
  return noTenant(ator.tenantId, async (tx) => {
    if (ator.viaSession) {
      if (!ator.userId) throw PipeError.naoAutorizado();
      // Contact tags are contact data, so require the same permission as editing the profile.
      await requirePermission(tx, ator.userId, 'contato.editar');
    }
    const contato = await loadContact(tx, contatoId);
    const etiqueta = await carregarEtiqueta(tx, etiquetaId, 'contato');

    const { rowCount } = await tx.execute(sql`
      insert into contato_etiqueta (tenant_id, contato_id, etiqueta_id)
      values (${ator.tenantId}, ${contato.id}, ${etiqueta.id})
      on conflict do nothing
    `);
    const aplicada = (rowCount ?? 0) > 0;
    if (aplicada) {
      await registrarAuditoria(tx, ator.tenantId, {
        ator: ator.userId ? { type: 'usuario', id: ator.userId } : { type: 'chave' },
        acao: 'criou',
        objetoTipo: 'contato_etiqueta',
        objetoId: contato.id,
        depois: { etiqueta_id: etiqueta.id, etiqueta: etiqueta.name },
      });
    }
    return { etiquetaId: etiqueta.id, name: etiqueta.name, aplicada };
  });
}

export async function unlabelContact(
  ator: ActorOfContact,
  contatoId: string,
  etiquetaId: string,
): Promise<{ removida: boolean }> {
  return noTenant(ator.tenantId, async (tx) => {
    if (ator.viaSession) {
      if (!ator.userId) throw PipeError.naoAutorizado();
      await requirePermission(tx, ator.userId, 'contato.editar');
    }
    const contato = await loadContact(tx, contatoId);
    if (!UUID.test(etiquetaId)) throw PipeError.naoEncontrado('Etiqueta');

    const { rows } = await tx.execute<{ name: string }>(sql`
      delete from contato_etiqueta ce
       using etiqueta e
       where e.id = ce.etiqueta_id
         and ce.contato_id = ${contato.id}::uuid and ce.etiqueta_id = ${etiquetaId}::uuid
      returning e.nome as name
    `);
    const removida = rows.length > 0;
    if (removida) {
      await registrarAuditoria(tx, ator.tenantId, {
        ator: ator.userId ? { type: 'usuario', id: ator.userId } : { type: 'chave' },
        acao: 'excluiu',
        objetoTipo: 'contato_etiqueta',
        objetoId: contato.id,
        antes: { etiqueta_id: etiquetaId, etiqueta: rows[0]!.name },
      });
    }
    return { removida };
  });
}
