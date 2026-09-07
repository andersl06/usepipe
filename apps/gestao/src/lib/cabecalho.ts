import { desc, eq, isNull } from 'drizzle-orm';
import { segundosEntre } from '@pipe/core';
import { canal, motivoPausa, pausa } from '@pipe/db/schema';
import { consultar, euAtual } from './banco';

/**
 * O que as duas barras do cabeçalho mostram.
 *
 * Duas consultas curtas, ambas sobre tabela pequena: os canais (unidades, não
 * milhares) e as pausas abertas — o tenant e a pessoa vêm da sessão. Nenhuma delas
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
  /** Quem está logado. `null` na tela de entrada, que é pública. */
  usuario: { nome: string; email: string } | null;
}

/** O cabeçalho sem banco: a Gestão não pode deixar de abrir por causa do cromo. */
const VAZIO: DadosDoCabecalho = {
  tenant: { nome: 'Pipe', plano: 'padrao' },
  canais: [],
  avisos: 0,
  usuario: null,
};

/**
 * Nunca lança, e nunca redireciona. O cabeçalho vive no layout raiz, então ele
 * roda em TODA rota — inclusive na `/entrar`, que é pública. Se ele exigisse
 * sessão, quem não tem sessão seria mandado para `/entrar` pelo layout da
 * própria `/entrar`, em círculo.
 *
 * Por isso `euAtual()` e não `exigirEu()`: sem sessão, as barras aparecem com o
 * nome genérico e o miolo é que decide o que fazer. As telas de dados continuam
 * falhando alto (ou indo para `/entrar`), como devem.
 *
 * O `try` continua valendo pelo outro motivo: `next build` prerrenderiza
 * `/_not-found`, e build de front-end não pode depender de Postgres no ar.
 */
export async function carregarCabecalho(): Promise<DadosDoCabecalho> {
  const eu = await euAtual();
  if (!eu) return VAZIO;

  const usuario = { nome: eu.usuario.nome, email: eu.usuario.email };
  const tenant = { nome: eu.tenant.nome, plano: eu.tenant.plano };
  try {
    return { ...(await consultarCabecalho()), tenant, usuario };
  } catch {
    return { ...VAZIO, tenant, usuario };
  }
}

/** Só o que ainda depende do banco: o tenant agora vem da sessão, sem consulta. */
async function consultarCabecalho(): Promise<Pick<DadosDoCabecalho, 'canais' | 'avisos'>> {
  const agora = new Date();
  return consultar(async (tx) => {
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
  });
}
