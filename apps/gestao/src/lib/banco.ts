import { eq, sql } from 'drizzle-orm';
import { criarBanco, comTenant, type BancoPipe, type TransacaoPipe } from '@pipe/db';
import { tenant } from '@pipe/db/schema';

/**
 * Conexão única do Pipe Gestão.
 *
 * O app fala com o banco pelo papel `pipe_app`, que não tem `bypassrls`: toda
 * consulta passa por `comTenant`, que fixa `pipe.tenant_id` na transação. Sem
 * isso a RLS devolve zero linha — e é assim que tem de ser.
 *
 * O pool vive num global porque o `next dev` recarrega o módulo a cada mudança
 * de arquivo, e um pool novo por recarga esgota as conexões do Postgres.
 */
const globalComPool = globalThis as unknown as {
  __pipeGestaoBanco?: BancoPipe;
  __pipeGestaoTenantId?: Promise<string>;
};

export function banco(): BancoPipe {
  if (!globalComPool.__pipeGestaoBanco) {
    const url = process.env['DATABASE_URL_APP'] ?? process.env['DATABASE_URL'];
    globalComPool.__pipeGestaoBanco = criarBanco({ url, maxConexoes: 5 });
  }
  return globalComPool.__pipeGestaoBanco;
}

/**
 * Qual tenant esta instância atende.
 *
 * Numa instalação real vem da sessão do usuário. Aqui vem de `PIPE_TENANT_ID`; sem
 * ele, uma única consulta de bootstrap resolve o slug pelo papel dono — porque a
 * política de `tenant` filtra por `id`, e ninguém consegue descobrir o próprio id
 * sem já o conhecer.
 */
export function tenantId(): Promise<string> {
  const fixo = process.env['PIPE_TENANT_ID'];
  if (fixo) return Promise.resolve(fixo);

  globalComPool.__pipeGestaoTenantId ??= (async () => {
    const dono = criarBanco({ url: process.env['DATABASE_URL'], maxConexoes: 1 });
    try {
      const slug = process.env['PIPE_TENANT_SLUG'] ?? 'demo';
      const [linha] = await dono.select({ id: tenant.id }).from(tenant).where(eq(tenant.slug, slug));
      if (!linha) throw new Error(`tenant "${slug}" não existe: rode a semente antes.`);
      return linha.id;
    } finally {
      await dono.$client.end();
    }
  })();

  return globalComPool.__pipeGestaoTenantId;
}

/** Açúcar: abre a transação já com o tenant desta instância fixado. */
export async function consultar<T>(fn: (tx: TransacaoPipe) => Promise<T>): Promise<T> {
  return comTenant(banco(), await tenantId(), fn);
}

/** O fuso do tenant, para o "hoje" dos cartões não ser o fuso do servidor. */
export async function fusoDoTenant(): Promise<string> {
  return consultar(async (tx) => {
    const [linha] = await tx.select({ fuso: tenant.fuso }).from(tenant).limit(1);
    return linha?.fuso ?? 'America/Sao_Paulo';
  });
}

/**
 * Início e fim do dia corrente no fuso do tenant.
 *
 * A conta é feita pelo Postgres de propósito: é ele que conhece o banco de fusos,
 * e reimplementar horário de verão em JavaScript é como se perde um dia inteiro.
 */
export interface Janela {
  inicio: Date;
  fim: Date;
}

/**
 * Período fechado a partir de duas datas `AAAA-MM-DD` no fuso do tenant.
 * `fim` é exclusivo: o dia final entra inteiro.
 */
export async function janelaDeDatas(fuso: string, de: string, ate: string): Promise<Janela> {
  return consultar(async (tx) => {
    const r = await tx.execute<{ inicio: Date; fim: Date }>(
      sql`select (${de}::date)::timestamp at time zone ${fuso} as inicio,
                 ((${ate}::date + 1)::timestamp) at time zone ${fuso} as fim`,
    );
    const linha = r.rows[0];
    if (!linha) throw new Error('período inválido');
    return { inicio: new Date(linha.inicio), fim: new Date(linha.fim) };
  });
}

export async function janelaDeHoje(fuso: string): Promise<{ inicio: Date; fim: Date }> {
  return consultar(async (tx) => {
    const r = await tx.execute<{ inicio: Date; fim: Date }>(
      sql`select date_trunc('day', now() at time zone ${fuso}) at time zone ${fuso} as inicio,
                 (date_trunc('day', now() at time zone ${fuso}) + interval '1 day') at time zone ${fuso} as fim`,
    );
    const linha = r.rows[0];
    if (!linha) throw new Error('não consegui calcular a janela de hoje');
    return { inicio: new Date(linha.inicio), fim: new Date(linha.fim) };
  });
}
