import { sql } from 'drizzle-orm';
import { registrarAuditoria } from '@pipe/db';
import type { TransactionPipe } from '@pipe/db';
import { noTenant } from '../database.js';
import { PipeError } from '../errors.js';
import { exigirPermission } from '../session.js';
import { evento, publicar } from '../realtime.js';
import type { AtorOfConversation } from './conversation.js';

/**
 * Etiquetar conversa ABERTA e etiquetar CONTATO — fora do encerramento.
 *
 * Até aqui a única forma de marcar uma tag numa conversa era pelo `POST /encerrar`,
 * que exige a etiqueta e fecha o ticket junto. A origem separa os dois gestos
 * (`ModalType.ADD_TAGS` ≠ `CLOSE_TICKET`, `referencias-blip/pesquisa/blip-desk-regras-tecnicas.md`
 * §1.8): a tag da conversa aberta é anotação de trabalho, e a do encerramento é
 * classificação final. As duas moram na mesma `conversa_etiqueta`, e por isso a
 * etiqueta aplicada aqui aparece pré-marcada no modal de Finalizar.
 *
 * A etiqueta de contato (`contato_etiqueta`) existia no schema sem rota nenhuma —
 * nem leitura, nem escrita. O escopo da etiqueta (`conversa` | `contato` | `ambos`)
 * é conferido no servidor: uma etiqueta de conversa não cabe num contato, e vice-versa.
 *
 * Auditoria na MESMA transação (`registrarAuditoria`), como toda escrita de cadastro.
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
    select id, nome, cor, escopo, obrigatoria_no_encerramento
      from etiqueta
     where ${scope === null ? sql`true` : sql`escopo in (${scope}, 'ambos')`}
     order by nome
  `);
  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    cor: r.cor,
    escopo: r.escopo,
    obrigatoriaNoEncerramento: r.obrigatoria_no_encerramento,
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
    sql`select id, nome, escopo from etiqueta where id = ${etiquetaId}::uuid limit 1`,
  );
  const etiqueta = rows[0];
  if (!etiqueta) throw PipeError.naoEncontrado('Etiqueta');
  if (etiqueta.escopo !== alvo && etiqueta.escopo !== 'ambos') {
    throw PipeError.request(
      'label_of_other_scope',
      alvo === 'conversation'
        ? `A etiqueta "${etiqueta.nome}" é de contato, não de conversa.`
        : `A etiqueta "${etiqueta.nome}" é de conversa, não de contato.`,
    );
  }
  return etiqueta;
}

type LineConversation = { id: string; state: string; agentId: string | null };

/**
 * A conversa existe, está aberta e — quando quem pede é gente — é do atendente.
 * Encerrada é recusada: tag em ticket fechado é reclassificação, e isso é tela de
 * gestor (histórico), não do Desk.
 */
async function loadConversationOpen(
  tx: TransactionPipe,
  conversaId: string,
  ator: AtorOfConversation,
): Promise<LineConversation> {
  if (!UUID.test(conversaId)) throw PipeError.naoEncontrado('Conversa');
  const { rows } = await tx.execute<LineConversation>(
    sql`select id, estado, atendente_id from conversa where id = ${conversaId}::uuid limit 1`,
  );
  const conversation = rows[0];
  if (!conversation) throw PipeError.naoEncontrado('Conversa');
  if (conversation.state === 'encerrada') {
    throw PipeError.conflito(
      'conversation_closed',
      'A conversa está encerrada: a etiqueta de encerramento já foi dada.',
    );
  }
  if (ator.exigirAssignment && conversation.agentId !== ator.agentId) {
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
  /** `false` quando já estava lá — aplicar duas vezes não é erro, é no-op. */
  aplicada: boolean;
}

export async function labelConversation(
  ator: AtorOfConversation,
  conversationId: string,
  etiquetaId: string,
): Promise<EtiquetaAplicada> {
  const resultado = await noTenant(ator.tenantId, async (tx) => {
    if (ator.exigirAssignment) {
      if (!ator.agentId) throw PipeError.naoAutorizado();
      await exigirPermission(tx, ator.agentId, 'conversa.etiquetar');
    }
    const conversa = await loadConversationOpen(tx, conversationId, ator);
    const etiqueta = await carregarEtiqueta(tx, etiquetaId, 'conversation');

    const { rowCount } = await tx.execute(sql`
      insert into conversa_etiqueta (tenant_id, conversa_id, etiqueta_id, por_usuario_id)
      values (${ator.tenantId}, ${conversa.id}, ${etiqueta.id}, ${ator.agentId})
      on conflict do nothing
    `);
    const aplicada = (rowCount ?? 0) > 0;
    if (aplicada) {
      await registrarAuditoria(tx, ator.tenantId, {
        ator: ator.agentId ? { tipo: 'usuario', id: ator.agentId } : { tipo: 'chave' },
        acao: 'criou',
        objetoTipo: 'conversa_etiqueta',
        objetoId: conversa.id,
        depois: { etiqueta_id: etiqueta.id, etiqueta: etiqueta.nome },
      });
    }
    return { etiquetaId: etiqueta.id, nome: etiqueta.nome, aplicada };
  });

  // Depois do commit: a faixa de etiquetas da conversa mudou.
  await publicar(ator.tenantId, evento('conversation', conversationId));
  return resultado;
}

export async function unlabelConversation(
  ator: AtorOfConversation,
  conversaId: string,
  etiquetaId: string,
): Promise<{ removida: boolean }> {
  const resultado = await noTenant(ator.tenantId, async (tx) => {
    if (ator.exigirAssignment) {
      if (!ator.agentId) throw PipeError.naoAutorizado();
      await exigirPermission(tx, ator.agentId, 'conversa.etiquetar');
    }
    const conversa = await loadConversationOpen(tx, conversaId, ator);
    if (!UUID.test(etiquetaId)) throw PipeError.naoEncontrado('Etiqueta');

    const { rows } = await tx.execute<{ name: string }>(sql`
      delete from conversa_etiqueta ce
       using etiqueta e
       where e.id = ce.etiqueta_id
         and ce.conversa_id = ${conversa.id}::uuid and ce.etiqueta_id = ${etiquetaId}::uuid
      returning e.nome
    `);
    const removida = rows.length > 0;
    if (removida) {
      await registrarAuditoria(tx, ator.tenantId, {
        ator: ator.agentId ? { tipo: 'usuario', id: ator.agentId } : { tipo: 'chave' },
        acao: 'excluiu',
        objetoTipo: 'conversa_etiqueta',
        objetoId: conversa.id,
        antes: { etiqueta_id: etiquetaId, etiqueta: rows[0]!.nome },
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
    select e.id, e.nome, e.cor
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

/** Quem pede: pessoa (com `contato.editar`) ou chave (`contatos:escrever`, sem permissão de pessoa). */
export interface AtorOfContact {
  tenantId: string;
  userId: string | null;
  viaSession: boolean;
}

export async function labelContact(
  ator: AtorOfContact,
  contatoId: string,
  etiquetaId: string,
): Promise<EtiquetaAplicada> {
  return noTenant(ator.tenantId, async (tx) => {
    if (ator.viaSession) {
      if (!ator.userId) throw PipeError.naoAutorizado();
      // A etiqueta do contato é dado do contato: a mesma permissão de editar a ficha.
      await exigirPermission(tx, ator.userId, 'contato.editar');
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
        ator: ator.userId ? { tipo: 'usuario', id: ator.userId } : { tipo: 'chave' },
        acao: 'criou',
        objetoTipo: 'contato_etiqueta',
        objetoId: contato.id,
        depois: { etiqueta_id: etiqueta.id, etiqueta: etiqueta.nome },
      });
    }
    return { etiquetaId: etiqueta.id, nome: etiqueta.nome, aplicada };
  });
}

export async function unlabelContact(
  ator: AtorOfContact,
  contatoId: string,
  etiquetaId: string,
): Promise<{ removida: boolean }> {
  return noTenant(ator.tenantId, async (tx) => {
    if (ator.viaSession) {
      if (!ator.userId) throw PipeError.naoAutorizado();
      await exigirPermission(tx, ator.userId, 'contato.editar');
    }
    const contato = await loadContact(tx, contatoId);
    if (!UUID.test(etiquetaId)) throw PipeError.naoEncontrado('Etiqueta');

    const { rows } = await tx.execute<{ name: string }>(sql`
      delete from contato_etiqueta ce
       using etiqueta e
       where e.id = ce.etiqueta_id
         and ce.contato_id = ${contato.id}::uuid and ce.etiqueta_id = ${etiquetaId}::uuid
      returning e.nome
    `);
    const removida = rows.length > 0;
    if (removida) {
      await registrarAuditoria(tx, ator.tenantId, {
        ator: ator.userId ? { tipo: 'usuario', id: ator.userId } : { tipo: 'chave' },
        acao: 'excluiu',
        objetoTipo: 'contato_etiqueta',
        objetoId: contato.id,
        antes: { etiqueta_id: etiquetaId, etiqueta: rows[0]!.nome },
      });
    }
    return { removida };
  });
}
