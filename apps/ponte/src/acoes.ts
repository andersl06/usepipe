import { sql } from 'drizzle-orm';
import { encerrarConversa, transferirConversa } from '@pipe/api/dominio/conversa';
import { assumirConversa } from '@pipe/api/dominio/assumir';
import { enviarMensagem } from '@pipe/api/dominio/envio';
import { noTenant } from './banco.js';
import type { Sessao } from './rotas.js';

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
function ator(sessao: Sessao, exigirAtribuicao: boolean) {
  return { tenantId: sessao.tenantId, atendenteId: sessao.usuarioId, exigirAtribuicao };
}

export async function assumir(sessao: Sessao, conversaId: string): Promise<void> {
  /* Assumir NÃO é transferir para si: transferência encerra a conversa e abre outra
     (é o modelo da plataforma de origem). Ver `dominio/assumir.ts`. */
  await assumirConversa({ tenantId: sessao.tenantId, atendenteId: sessao.usuarioId }, conversaId);
}

/** Pega o próximo da fila: o mais antigo entre as filas de quem está pedindo. */
export async function assumirProximo(sessao: Sessao): Promise<string | null> {
  const id = await noTenant(sessao.tenantId, async (tx) => {
    const { rows } = await tx.execute<{ id: string }>(sql`
      select c.id
        from conversa c
        join fila_atendente fa
          on fa.fila_id = c.fila_id and fa.usuario_id = ${sessao.usuarioId}::uuid
       where c.estado = 'na_fila'
       order by c.criada_em
       limit 1
    `);
    return rows[0]?.id ?? null;
  });
  if (!id) return null;
  await assumir(sessao, id);
  return id;
}

export async function responder(
  sessao: Sessao,
  conversaId: string,
  texto: string,
): Promise<{ mensagemId: string; dentroDaJanela: boolean }> {
  const enfileirada = await enviarMensagem({
    tenantId: sessao.tenantId,
    conversaId,
    atendenteId: sessao.usuarioId,
    texto,
  });
  /* `dentroDaJanela` sobe junto porque fora da janela de 24h a Meta só entrega
     template: a tela precisa saber disso para avisar quem escreveu. */
  return { mensagemId: enfileirada.id, dentroDaJanela: enfileirada.dentroDaJanela };
}

export async function transferirParaFila(
  sessao: Sessao,
  conversaId: string,
  nomeDaFila: string,
): Promise<void> {
  const filaId = await noTenant(sessao.tenantId, async (tx) => {
    const { rows } = await tx.execute<{ id: string }>(
      sql`select id from fila where nome = ${nomeDaFila} limit 1`,
    );
    return rows[0]?.id ?? null;
  });
  if (!filaId) throw new Error(`fila "${nomeDaFila}" não existe neste cliente`);
  await transferirConversa(ator(sessao, false), { conversaId, paraFilaId: filaId });
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
  sessao: Sessao,
  conversaId: string,
  nomes: string[] = [],
): Promise<void> {
  const etiquetaId = await noTenant(sessao.tenantId, async (tx) => {
    const nome = nomes[0];
    if (nome) {
      const { rows } = await tx.execute<{ id: string }>(
        sql`select id from etiqueta where nome = ${nome} limit 1`,
      );
      if (rows[0]) return rows[0].id;
    }
    const { rows: primeira } = await tx.execute<{ id: string }>(
      sql`select id from etiqueta where escopo = 'conversa' order by criado_em limit 1`,
    );
    if (primeira[0]) return primeira[0].id;

    const { rows: criada } = await tx.execute<{ id: string }>(sql`
      insert into etiqueta (tenant_id, nome, escopo)
      values (${sessao.tenantId}::uuid, ${nome ?? 'Encerrado pelo atendente'}, 'conversa')
      returning id
    `);
    return criada[0]!.id;
  });

  await encerrarConversa(ator(sessao, true), { conversaId, etiquetaId });
}
