import { sql } from 'drizzle-orm';
import type { TransacaoPipe } from '@pipe/db';
import type { FluxoPublicado } from './fluxo.js';

/**
 * O roteador (o `master` da Blip) na entrada: em qual SERVIÇO o contato está.
 *
 * As regras são as da Blip (`referencias-blip/pesquisa/blip-api-schemas.md` §5.3–5.5):
 *
 * - O roteador não tem conteúdo; quem responde é o serviço. Na primeira interação, o
 *   PRINCIPAL ("Main SubBot").
 * - O `Redirect` (`content.address` = nome do serviço) troca o Master-State. Serviço não
 *   persistente volta ao principal quando passa a "Expiração do redirecionamento", contada
 *   da ÚLTIMA interação do cliente — por isso cada mensagem que chega renova o prazo, até
 *   as que o atendente humano responde (na Blip elas também passam pelo roteador).
 * - Master-State primeiro, Change-User-State depois (regra 4): mudar de serviço reinicia o
 *   bloco do destino na raiz, a menos que venha um bloco explícito; e esse bloco NÃO exibe
 *   o conteúdo — só as saídas, na próxima resposta (regra 5). É o que o motor já faz com
 *   estado guardado, então basta guardar o estado.
 * - "Utilizar o contexto do Roteador" (`builder:useTunnelOwnerContext`): as variáveis são
 *   do par (roteador, contato), em `posicao_no_roteador.contexto`.
 *
 * Não há túnel: o contato é o real, único no tenant (migration 0024).
 *
 * Decisões do Pipe onde a origem não diz:
 * - expirou → principal, no bloco em que ele estava (o estado é por fluxo, e nada na
 *   origem diz que a volta reinicia o principal);
 * - serviço que saiu do ar (despublicado, arquivado, ou tirado do roteador) conta como
 *   posição inválida → principal;
 * - principal fora do ar e nenhuma posição válida → sem bot: a conversa vai para a fila.
 */

type LinhaDeServico = {
  servico_id: string;
  principal: boolean;
  persistente: boolean;
  expiracao_min: number | null;
  usa_contexto: boolean;
  versao_id: string | null;
};

type LinhaDePosicao = {
  servico_id: string;
  expirou: boolean;
  contexto: Record<string, string>;
  reiniciar: boolean;
  bloco_inicial: string | null;
};

/** O prazo do serviço a partir de agora; nulo = não expira. */
function prazo(s: { principal: boolean; persistente: boolean; expiracao_min: number | null }) {
  return s.principal || s.persistente || !s.expiracao_min
    ? null
    : sql`now() + ${s.expiracao_min}::int * interval '1 minute'`;
}

/**
 * O serviço publicado que atende o contato agora, com a posição (Master-State) já
 * resolvida: renovada, ou de volta ao principal. Trava a linha da posição até o fim da
 * transação — duas mensagens do mesmo contato não decidem ao mesmo tempo.
 */
export async function servicoDoRoteador(
  tx: TransacaoPipe,
  roteador: { id: string; tenantId: string },
  contatoId: string,
): Promise<FluxoPublicado | null> {
  const { rows: servicos } = await tx.execute<LinhaDeServico>(sql`
    select rs.servico_id, rs.principal, rs.persistente, rs.expiracao_min,
           f.usa_contexto_do_roteador as usa_contexto,
           (select v.id from fluxo_versao v
             where v.fluxo_id = f.id and v.estado = 'publicada'
             order by v.versao desc limit 1) as versao_id
      from roteador_servico rs
      join fluxo f on f.id = rs.servico_id
     where rs.roteador_id = ${roteador.id} and f.estado = 'publicado'
  `);
  const { rows: posicoes } = await tx.execute<LinhaDePosicao>(sql`
    select servico_id, coalesce(expira_em <= now(), false) as expirou, contexto,
           reiniciar, bloco_inicial
      from posicao_no_roteador
     where roteador_id = ${roteador.id} and contato_id = ${contatoId}
     for update
  `);
  const posicao = posicoes[0];
  const noAr = servicos.filter((s) => s.versao_id !== null);
  const atual =
    posicao && !posicao.expirou ? noAr.find((s) => s.servico_id === posicao.servico_id) : undefined;
  const escolhido = atual ?? noAr.find((s) => s.principal);
  if (!escolhido) return null;

  if (atual) {
    await tx.execute(sql`
      update posicao_no_roteador set expira_em = ${prazo(atual)}
       where roteador_id = ${roteador.id} and contato_id = ${contatoId}
    `);
  } else {
    // Primeira interação, ou o redirecionamento acabou: o principal, que não expira.
    await tx.execute(sql`
      insert into posicao_no_roteador (tenant_id, roteador_id, contato_id, servico_id)
      values (${roteador.tenantId}, ${roteador.id}, ${contatoId}, ${escolhido.servico_id})
      on conflict (roteador_id, contato_id) do update
        set servico_id = excluded.servico_id, desde = now(), expira_em = null,
            reiniciar = false, bloco_inicial = null
    `);
  }

  return {
    fluxoId: escolhido.servico_id,
    versaoId: escolhido.versao_id!,
    roteador: {
      id: roteador.id,
      compartilhaContexto: escolhido.usa_contexto,
      contexto: posicao?.contexto ?? {},
      reiniciar: atual !== undefined && posicao!.reiniciar,
      blocoInicial: atual !== undefined ? posicao!.bloco_inicial : null,
    },
  };
}

/**
 * O `Redirect`: o contato passa para o serviço `nome` deste roteador. O nome tem de ser
 * exatamente o cadastrado em Serviços (help.blip.ai); outro é erro, e o motor trata como
 * falha da ação. `blocoInicial` é o Change-User-State que vem depois — sem ele, o destino
 * começa na raiz. Vale a partir da PRÓXIMA mensagem.
 */
export async function redirecionarNoRoteador(
  tx: TransacaoPipe,
  pedido: {
    tenantId: string;
    roteadorId: string;
    contatoId: string;
    servico: string;
    blocoInicial?: string | null;
  },
): Promise<void> {
  const { rows } = await tx.execute<{
    servico_id: string;
    principal: boolean;
    persistente: boolean;
    expiracao_min: number | null;
  }>(sql`
    select servico_id, principal, persistente, expiracao_min from roteador_servico
     where roteador_id = ${pedido.roteadorId} and nome = ${pedido.servico}
  `);
  const destino = rows[0];
  if (!destino) throw new Error(`O serviço '${pedido.servico}' não existe neste roteador.`);
  await tx.execute(sql`
    insert into posicao_no_roteador (
      tenant_id, roteador_id, contato_id, servico_id, expira_em, reiniciar, bloco_inicial
    ) values (
      ${pedido.tenantId}, ${pedido.roteadorId}, ${pedido.contatoId}, ${destino.servico_id},
      ${prazo(destino)}, true, ${pedido.blocoInicial ?? null}
    )
    on conflict (roteador_id, contato_id) do update
      set servico_id = excluded.servico_id, desde = now(), expira_em = excluded.expira_em,
          reiniciar = true, bloco_inicial = excluded.bloco_inicial
  `);
}
