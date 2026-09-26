import { sql } from 'drizzle-orm';
import type { TransactionPipe } from '@pipe/db';
import type { SignalsOfDeployment } from './passos-of-deployment.js';

/** A transação já vem com o tenant fixado; `consultar` só nomeia o bloco, como na Gestão. */
const consultar = <T>(tx: TransactionPipe, fn: (tx: TransactionPipe) => Promise<T>): Promise<T> =>
  fn(tx);

/**
 * Os sinais do assistente de implantação, lidos do banco pelo papel da
 * aplicação, com a RLS do tenant da sessão. Uma transação, consultas curtas e
 * EM SÉRIE — `Promise.all` dentro do `comTenant` apaga o `pipe.tenant_id`.
 *
 * O que cada passo significa mora em `passos-da-implantacao.ts`; aqui só se
 * pergunta ao banco.
 */

export interface ChannelOfDeployment {
  id: string;
  name: string;
  active: boolean;
  number: string | null;
  reauthorizationPending: boolean;
}

export interface Deployment {
  signals: SignalsOfDeployment;
  channels: ChannelOfDeployment[];
}

type Linha = Record<string, unknown>;

export async function loadDeployment(tx: TransactionPipe): Promise<Deployment> {
  return consultar(tx, async (tx) => {
    const um = async <T extends Linha>(query: ReturnType<typeof sql>): Promise<T> => {
      const { rows } = await tx.execute<T>(query);
      return rows[0] as T;
    };

    const access = await um<{ v: boolean }>(sql`
      select exists (
        select 1 from usuario u
          join usuario_papel up on up.usuario_id = u.id
          join papel p on p.id = up.papel_id
         where p.nome = 'administrador' and u.ultimo_acesso_em is not null
      ) as v
    `);

    const { rows: channels } = await tx.execute<{
      id: string;
      name: string;
      active: boolean;
      numero_id: string | null;
      number: string | null;
      reauthorization: boolean;
    }>(sql`
      select id, nome as "name", ativo as "active", numero_id, config->>'numero' as numero,
             coalesce(config->>'reautorizacaoPendente', 'false') = 'true' as reautorizacao
        from canal
       where tipo = 'whatsapp_cloud'
       order by criado_em
    `);

    const pessoas = await um<{ convites: string; members: string }>(sql`
      select (select count(*) from convite)::text as convites,
             (select count(*) from usuario where ativo)::text as membros
    `);

    const queues = await um<{ ativas: string; withAgent: string }>(sql`
      select count(*) filter (where f.ativa)::text as ativas,
             count(*) filter (
               where f.ativa and exists (select 1 from fila_atendente fa where fa.fila_id = f.id)
             )::text as com_atendente
        from fila f
    `);

    const { rows: imports } = await tx.execute<{
      id: string;
      state: string;
      accepted: number;
      rejeitados: number;
      tem_falhas: boolean;
    }>(sql`
      select i.id, i.estado as "state", i.aceitos as "accepted", i.rejeitados, (a.falhas_csv is not null) as tem_falhas
        from importacao i
        left join importacao_arquivo a on a.importacao_id = i.id
       where i.origem = 'csv'
       order by i.criado_em desc
       limit 1
    `);

    const conversation = await um<{ v: boolean }>(sql`
      select exists (
        select 1 from mensagem where direcao = 'saida' and autor_tipo = 'atendente'
      ) as v
    `);

    const ultima = imports[0];
    return {
      signals: {
        adminEntrou: access.v === true,
        channelsConnected: channels.filter((c) => c.active && c.numero_id && !c.reauthorization).length,
        channelsPending: channels.filter((c) => c.active && c.reauthorization).length,
        convites: Number(pessoas.convites),
        members: Number(pessoas.members),
        queuesActive: Number(queues.ativas),
        queuesWithAgent: Number(queues.withAgent),
        lastImport: ultima
          ? {
              id: ultima.id,
              state: ultima.state,
              accepted: Number(ultima.accepted),
              rejeitados: Number(ultima.rejeitados),
              temFalhas: ultima.tem_falhas === true,
            }
          : null,
        conversationHandled: conversation.v === true,
      },
      channels: channels.map((c) => ({
        id: c.id,
        name: c.name,
        active: c.active,
        number: c.number,
        reauthorizationPending: c.reauthorization === true,
      })),
    };
  });
}
