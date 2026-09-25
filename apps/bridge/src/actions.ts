import { sql } from 'drizzle-orm';
import { closeConversation, transferConversation } from '@pipe/api/dominio/conversa';
import { assumeConversation } from '@pipe/api/dominio/assumir';
import { sendMessage } from '@pipe/api/dominio/envio';
import { noTenant } from './database.js';
import type { Session } from './rotas.js';

/**
 * O que o atendente FAZ na tela: assumir, responder, transferir e encerrar.
 *
 * Nada aqui reimplementa regra. Cada ação chama a função de domínio que a `apps/api`
 * já usa, com a mesma máquina de estados, os mesmos eventos e os mesmos limites. A
 * ponte só traduz o vocabulário da tela para o do Pipe.
 *
 * **Assumir é transferir para si.** Parece atalho, mas é o contrário: assumir tem as
 * mesmas regras de transferência (estado válido, fila, capacidade), e escrever um
 * caminho próprio seria duplicar a máquina de estados só para economizar uma linha.
 */

/** O ator de uma ação vinda da tela: o atendente logado, agindo por si. */
function ator(session: Session, exigirAssignment: boolean) {
  return { tenantId: session.tenantId, atendenteId: session.userId, exigirAssignment };
}

export async function assumir(session: Session, conversationId: string): Promise<void> {
  /* Assumir NÃO é transferir para si: transferência encerra a conversa e abre outra
     (é o modelo da plataforma de origem). Ver `dominio/assumir.ts`. */
  await assumeConversation({ tenantId: session.tenantId, agentId: session.userId }, conversationId);
}

/** Pega o próximo da fila: o mais antigo entre as filas de quem está pedindo. */
export async function assumirProximo(session: Session): Promise<string | null> {
  const id = await noTenant(session.tenantId, async (tx) => {
    const { rows } = await tx.execute<{ id: string }>(sql`
      select c.id
        from conversa c
        join fila_atendente fa
          on fa.fila_id = c.fila_id and fa.usuario_id = ${session.userId}::uuid
       where c.estado = 'na_fila'
       order by c.criada_em
       limit 1
    `);
    return rows[0]?.id ?? null;
  });
  if (!id) return null;
  await assumir(session, id);
  return id;
}

/**
 * A tela manda a mensagem para uma IDENTIDADE (`5531988887777@wa.gw.msging.net`),
 * não para uma conversa — é assim que o protocolo dela funciona. Aqui a identidade
 * vira conversa: a aberta daquele telefone.
 */
export async function identityConversation(
  session: Session,
  identity: string,
): Promise<string | null> {
  const telefone = '+' + String(identity).split('@')[0]!.replace(/[^0-9]/g, '');
  return noTenant(session.tenantId, async (tx) => {
    const { rows } = await tx.execute<{ id: string }>(sql`
      select c.id from conversa c
        join contato ct on ct.id = c.contato_id
       where ct.telefone_e164 = ${telefone}
         and c.estado in ('na_fila','atribuida','em_atendimento','em_espera')
       order by c.criada_em desc
       limit 1
    `);
    return rows[0]?.id ?? null;
  });
}

export async function responder(
  session: Session,
  conversationId: string,
  texto: string,
): Promise<{ messageId: string; windowDentro: boolean }> {
  const enfileirada = await sendMessage({
    tenantId: session.tenantId,
    conversationId,
    atendenteId: session.userId,
    texto,
  });
  /* `dentroDaJanela` sobe junto porque fora da janela de 24h a Meta só entrega
     template: a tela precisa saber disso para avisar quem escreveu. */
  return { messageId: enfileirada.id, windowDentro: enfileirada.insideOfWindow };
}

export async function transferirForQueue(
  session: Session,
  conversationId: string,
  queueName: string,
): Promise<void> {
  const queueId = await noTenant(session.tenantId, async (tx) => {
    const { rows } = await tx.execute<{ id: string }>(
      sql`select id from fila where nome = ${queueName} limit 1`,
    );
    return rows[0]?.id ?? null;
  });
  if (!queueId) throw new Error(`fila "${queueName}" não existe neste cliente`);
  await transferConversation(ator(session, false), { conversationId, forQueueId: queueId });
}

/**
 * Encerrar exige etiqueta — conversa fechada sem motivo é relatório que não explica
 * nada depois, e a regra já valia na tela de origem.
 *
 * A tela manda os nomes das etiquetas escolhidas. Se vier vazia, usamos a primeira
 * do cliente; se o cliente ainda não tem nenhuma, criamos "Encerrado pelo atendente"
 * — nascer sem etiqueta é comum em empresa nova, e travar o encerramento por isso
 * seria pior do que registrar um motivo genérico.
 */
export async function encerrar(
  session: Session,
  conversationId: string,
  nomes: string[] = [],
): Promise<void> {
  const etiquetaId = await noTenant(session.tenantId, async (tx) => {
    const nome = nomes[0];
    if (nome) {
      const { rows } = await tx.execute<{ id: string }>(
        sql`select id from etiqueta where nome = ${nome} limit 1`,
      );
      if (rows[0]) return rows[0].id;
    }
    const { rows: first } = await tx.execute<{ id: string }>(
      sql`select id from etiqueta where escopo = 'conversa' order by criado_em limit 1`,
    );
    if (first[0]) return first[0].id;

    const { rows: criada } = await tx.execute<{ id: string }>(sql`
      insert into etiqueta (tenant_id, nome, escopo)
      values (${session.tenantId}::uuid, ${nome ?? 'Encerrado pelo atendente'}, 'conversa')
      returning id
    `);
    return criada[0]!.id;
  });

  await closeConversation(ator(session, true), { conversationId, etiquetaId });
}
