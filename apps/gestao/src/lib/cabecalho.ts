import { desc, eq, isNull } from 'drizzle-orm';
import { segundosEntre } from '@pipe/core';
import { canal, motivoPausa, pausa, tenant } from '@pipe/db/schema';
import { consultar } from './banco';

/**
 * O que as duas barras do cabeçalho mostram.
 *
 * Três consultas curtas, todas sobre tabela pequena: o tenant (uma linha), os
 * canais (unidades, não milhares) e as pausas abertas. Nenhuma delas
 * toca `evento_atendimento`, que é a tabela cara do monitoramento — o cabeçalho
 * aparece em toda rota da Gestão e não pode custar o preço de um painel.
 *
 * O aviso é REAL: conta pausa aberta que já passou da duração sugerida pelo
 * motivo, exatamente a mesma regra do cartão "Status dos atendentes". Sino que
 * não conta nada é item desabilitado com outro nome, e isso a régua proíbe.
 *
 * O canal vem com `ativo` porque a barra de baixo pinta um ponto de status
 * sobre o ícone. Canal desligado APARECE, com o ponto vermelho, em vez de
 * sumir da lista — ponto que é sempre verde não informa nada.
 */
export interface DadosDoCabecalho {
  tenant: { nome: string; plano: string };
  canais: { id: string; nome: string; tipo: string; ativo: boolean }[];
  avisos: number;
}

/** O cabeçalho sem banco: a Gestão não pode deixar de abrir por causa do cromo. */
const VAZIO: DadosDoCabecalho = { tenant: { nome: 'Pipe', plano: 'padrao' }, canais: [], avisos: 0 };

/**
 * Nunca lança. O cabeçalho vive no layout raiz, então ele roda em TODA rota,
 * inclusive nas duas que o `next build` prerrenderiza (`/_not-found` e o
 * redirecionamento de `/configuracoes`) — e build de front-end não pode
 * depender de Postgres no ar. Sem banco, as barras aparecem com o nome
 * genérico; as telas de dados continuam falhando alto, como devem.
 */
export async function carregarCabecalho(): Promise<DadosDoCabecalho> {
  try {
    return await consultarCabecalho();
  } catch {
    return VAZIO;
  }
}

async function consultarCabecalho(): Promise<DadosDoCabecalho> {
  const agora = new Date();
  return consultar(async (tx) => {
    const [linha] = await tx
      .select({ nome: tenant.nome, plano: tenant.plano })
      .from(tenant)
      .limit(1);

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

    return {
      tenant: { nome: linha?.nome ?? 'Pipe', plano: linha?.plano ?? 'padrao' },
      canais,
      avisos,
    };
  });
}
