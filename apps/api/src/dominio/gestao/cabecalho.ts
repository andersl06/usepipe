import { desc, eq, isNull } from 'drizzle-orm';
import { segundosEntre } from '@pipe/core';
import type { TransacaoPipe } from '@pipe/db';
import { canal, motivoPausa, pausa } from '@pipe/db/schema';

/**
 * O que as duas barras do topo da Gestão mostram: os canais da conta e a
 * contagem de avisos (pausas abertas além do tempo sugerido). Quem está logado
 * e o tenant vêm da sessão, no controlador.
 */
export interface CabecalhoDaGestao {
  canais: { id: string; nome: string; tipo: string; ativo: boolean }[];
  avisos: number;
}

export async function carregarCabecalho(
  tx: TransacaoPipe,
  agora = new Date(),
): Promise<CabecalhoDaGestao> {
  const canais = await tx
    .select({ id: canal.id, nome: canal.nome, tipo: canal.tipo, ativo: canal.ativo })
    .from(canal)
    .orderBy(desc(canal.ativo), canal.criadoEm);

  const pausasAbertas = await tx
    .select({ iniciadaEm: pausa.iniciadaEm, sugeridaMin: motivoPausa.duracaoSugeridaMin })
    .from(pausa)
    .leftJoin(motivoPausa, eq(motivoPausa.id, pausa.motivoId))
    .where(isNull(pausa.encerradaEm));

  let avisos = 0;
  for (const p of pausasAbertas) {
    const limite = p.sugeridaMin;
    if (typeof limite !== 'number') continue;
    if (segundosEntre(p.iniciadaEm, agora) > limite * 60) avisos += 1;
  }
  return { canais, avisos };
}
