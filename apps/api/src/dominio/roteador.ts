import { sql } from 'drizzle-orm';
import type { TransactionPipe } from '@pipe/db';
import type { FlowPublished } from './fluxo.js';

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
  blockInicial: string | null;
};

/** O prazo do serviço a partir de agora; nulo = não expira. */
function prazo(s: { principal: boolean; persistent: boolean; expiracao_min: number | null }) {
  return s.principal || s.persistente || !s.expiracao_min
    ? null
    : sql`now() + ${s.expiracao_min}::int * interval '1 minute'`;
}

/**
 * O serviço publicado que atende o contato agora, com a posição (Master-State) já
 * resolvida: renovada, ou de volta ao principal. Trava a linha da posição até o fim da
 * transação — duas mensagens do mesmo contato não decidem ao mesmo tempo.
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
    // Primeira interação, ou o redirecionamento acabou: o principal, que não expira.
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
      compartilhaContext: escolhido.usesContext,
      contexto: position?.context ?? {},
      reiniciar: atual !== undefined && position!.reiniciar,
      blockInicial: atual !== undefined ? position!.bloco_inicial : null,
    },
  };
}

/**
 * O `Redirect`: o contato passa para o serviço `nome` deste roteador. O nome tem de ser
 * exatamente o cadastrado em Serviços (help.blip.ai); outro é erro, e o motor trata como
 * falha da ação. `blocoInicial` é o Change-User-State que vem depois — sem ele, o destino
 * começa na raiz. Vale a partir da PRÓXIMA mensagem.
 */
export async function redirecionarInRouter(
  tx: TransactionPipe,
  pedido: {
    tenantId: string;
    routerId: string;
    contactId: string;
    service: string;
    blockInicial?: string | null;
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
      ${prazo(destination)}, true, ${pedido.blockInicial ?? null}
    )
    on conflict (roteador_id, contato_id) do update
      set servico_id = excluded.servico_id, desde = now(), expira_em = excluded.expira_em,
          reiniciar = true, bloco_inicial = excluded.bloco_inicial
  `);
}
