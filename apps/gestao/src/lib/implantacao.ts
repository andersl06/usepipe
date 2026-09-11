import { sql } from 'drizzle-orm';
import { consultar } from './banco';
import type { SinaisDaImplantacao } from './passos-da-implantacao';

/**
 * Os sinais do assistente de implantação, lidos do banco pelo papel da
 * aplicação, com a RLS do tenant da sessão. Uma transação, consultas curtas e
 * EM SÉRIE — `Promise.all` dentro do `comTenant` apaga o `pipe.tenant_id`.
 *
 * O que cada passo significa mora em `passos-da-implantacao.ts`; aqui só se
 * pergunta ao banco.
 */

export interface CanalDaImplantacao {
  id: string;
  nome: string;
  ativo: boolean;
  numero: string | null;
  reautorizacaoPendente: boolean;
}

export interface Implantacao {
  sinais: SinaisDaImplantacao;
  canais: CanalDaImplantacao[];
}

type Linha = Record<string, unknown>;

export async function carregarImplantacao(): Promise<Implantacao> {
  return consultar(async (tx) => {
    const um = async <T extends Linha>(consulta: ReturnType<typeof sql>): Promise<T> => {
      const { rows } = await tx.execute<T>(consulta);
      return rows[0] as T;
    };

    const acesso = await um<{ v: boolean }>(sql`
      select exists (
        select 1 from usuario u
          join usuario_papel up on up.usuario_id = u.id
          join papel p on p.id = up.papel_id
         where p.nome = 'administrador' and u.ultimo_acesso_em is not null
      ) as v
    `);

    const { rows: canais } = await tx.execute<{
      id: string;
      nome: string;
      ativo: boolean;
      numero_id: string | null;
      numero: string | null;
      reautorizacao: boolean;
    }>(sql`
      select id, nome, ativo, numero_id, config->>'numero' as numero,
             coalesce(config->>'reautorizacaoPendente', 'false') = 'true' as reautorizacao
        from canal
       where tipo = 'whatsapp_cloud'
       order by criado_em
    `);

    const pessoas = await um<{ convites: string; membros: string }>(sql`
      select (select count(*) from convite)::text as convites,
             (select count(*) from usuario where ativo)::text as membros
    `);

    const filas = await um<{ ativas: string; com_atendente: string }>(sql`
      select count(*) filter (where f.ativa)::text as ativas,
             count(*) filter (
               where f.ativa and exists (select 1 from fila_atendente fa where fa.fila_id = f.id)
             )::text as com_atendente
        from fila f
    `);

    const { rows: importacoes } = await tx.execute<{
      id: string;
      estado: string;
      aceitos: number;
      rejeitados: number;
      tem_falhas: boolean;
    }>(sql`
      select i.id, i.estado, i.aceitos, i.rejeitados, (a.falhas_csv is not null) as tem_falhas
        from importacao i
        left join importacao_arquivo a on a.importacao_id = i.id
       where i.origem = 'csv'
       order by i.criado_em desc
       limit 1
    `);

    const conversa = await um<{ v: boolean }>(sql`
      select exists (
        select 1 from mensagem where direcao = 'saida' and autor_tipo = 'atendente'
      ) as v
    `);

    const ultima = importacoes[0];
    return {
      sinais: {
        adminEntrou: acesso.v === true,
        canaisConectados: canais.filter((c) => c.ativo && c.numero_id && !c.reautorizacao).length,
        canaisPendentes: canais.filter((c) => c.ativo && c.reautorizacao).length,
        convites: Number(pessoas.convites),
        membros: Number(pessoas.membros),
        filasAtivas: Number(filas.ativas),
        filasComAtendente: Number(filas.com_atendente),
        ultimaImportacao: ultima
          ? {
              id: ultima.id,
              estado: ultima.estado,
              aceitos: Number(ultima.aceitos),
              rejeitados: Number(ultima.rejeitados),
              temFalhas: ultima.tem_falhas === true,
            }
          : null,
        conversaAtendida: conversa.v === true,
      },
      canais: canais.map((c) => ({
        id: c.id,
        nome: c.nome,
        ativo: c.ativo,
        numero: c.numero,
        reautorizacaoPendente: c.reautorizacao === true,
      })),
    };
  });
}
