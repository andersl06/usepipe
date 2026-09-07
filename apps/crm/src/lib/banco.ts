import { eq, sql } from 'drizzle-orm';
import { criarBanco, comTenant, type Ator, type BancoPipe, type TransacaoPipe } from '@pipe/db';
import { tenant } from '@pipe/db/schema';

/**
 * Conexão única do Pipe CRM. Mesma camada da Gestão, de propósito: as três telas
 * falam com o banco do mesmo jeito, e quem aprendeu uma já conhece a outra.
 *
 * O app usa o papel `pipe_app`, que não tem `bypassrls`: toda consulta passa por
 * `comTenant`, que fixa `pipe.tenant_id` na transação. Sem isso a RLS devolve zero
 * linha — e é assim que tem de ser.
 *
 * O pool vive num global porque o `next dev` recarrega o módulo a cada mudança de
 * arquivo, e um pool novo por recarga esgota as conexões do Postgres.
 *
 * **Nunca use `Promise.all` dentro do `fn`.** Consultas em paralelo na mesma conexão
 * caem no caminho depreciado do driver `pg` e o `set_config('pipe.tenant_id')` some.
 * O resultado não é erro: é consulta rodando sem tenant. Aqui é tudo em série.
 */
const globalComPool = globalThis as unknown as {
  __pipeCrmBanco?: BancoPipe;
  __pipeCrmTenantId?: Promise<string>;
  __pipeCrmFuso?: Promise<string>;
};

export function banco(): BancoPipe {
  if (!globalComPool.__pipeCrmBanco) {
    const url = process.env['DATABASE_URL_APP'] ?? process.env['DATABASE_URL'];
    globalComPool.__pipeCrmBanco = criarBanco({ url, maxConexoes: 10 });
  }
  return globalComPool.__pipeCrmBanco;
}

/**
 * Qual tenant esta instância atende.
 *
 * Numa instalação real vem da sessão do usuário. Aqui vem de `PIPE_TENANT_ID`; sem
 * ele, uma única consulta de bootstrap resolve o slug pelo papel dono — porque a
 * política de `tenant` filtra por `id`, e ninguém descobre o próprio id sem já o ter.
 */
export function tenantId(): Promise<string> {
  const fixo = process.env['PIPE_TENANT_ID'];
  if (fixo) return Promise.resolve(fixo);

  globalComPool.__pipeCrmTenantId ??= (async () => {
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

  return globalComPool.__pipeCrmTenantId;
}

/** Açúcar: abre a transação já com o tenant desta instância fixado. */
export async function consultar<T>(fn: (tx: TransacaoPipe) => Promise<T>): Promise<T> {
  return comTenant(banco(), await tenantId(), fn);
}

/**
 * O fuso do tenant, para o "mês" dos indicadores não ser o fuso do servidor.
 *
 * Guardado no processo: ele não muda enquanto o app roda, e como toda página começa
 * por ele, sem o cache seria uma transação inteira antes de qualquer trabalho útil.
 */
export function fusoDoTenant(): Promise<string> {
  globalComPool.__pipeCrmFuso ??= consultar(async (tx) => {
    const [linha] = await tx.select({ fuso: tenant.fuso }).from(tenant).limit(1);
    return linha?.fuso ?? 'America/Sao_Paulo';
  });
  return globalComPool.__pipeCrmFuso;
}

/**
 * Quem assina o que o CRM grava, no log de auditoria.
 *
 * O CRM ainda não tem sessão — `tenantId()` sai do ambiente, não de um usuário
 * logado. Então o ator é `sistema`, que é a verdade: foi a instância, e não uma
 * pessoa identificada. Mentir aqui seria pior do que não registrar, porque
 * alguém confiaria no nome.
 *
 * Quando a sessão existir, este valor vira `{ tipo: 'usuario', id, ip }` e
 * nenhuma escrita precisa mudar: todas já passam por aqui. É a mesma decisão,
 * pelo mesmo motivo, que a Gestão tomou em `ATOR_DA_GESTAO`.
 */
export const ATOR_DO_CRM = { tipo: 'sistema' } as const satisfies Ator;

export interface Janela {
  inicio: Date;
  fim: Date;
}

/**
 * Mês corrente no fuso do tenant. A conta é do Postgres porque é ele que conhece o
 * banco de fusos — reimplementar horário de verão em JavaScript custa um dia inteiro.
 */
export async function janelaDoMes(fuso: string, mesesAtras = 0): Promise<Janela> {
  return consultar(async (tx) => {
    const base = sql`date_trunc('month', now() at time zone ${fuso}) - make_interval(months => ${mesesAtras})`;
    const r = await tx.execute<{ inicio: unknown; fim: unknown }>(
      sql`select (${base}) at time zone ${fuso} as inicio,
                 ((${base}) + interval '1 month') at time zone ${fuso} as fim`,
    );
    const linha = r.rows[0];
    if (!linha) throw new Error('não consegui calcular o mês corrente');
    return { inicio: new Date(String(linha.inicio)), fim: new Date(String(linha.fim)) };
  });
}

/**
 * `timestamptz` volta como **texto** dentro do bundle do Next (armadilha do README).
 * Toda data que sai de consulta passa por aqui antes de virar `Date` na tela.
 */
export function paraData(valor: unknown): Date | null {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) return valor;
  const d = new Date(String(valor));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `numeric` também volta como texto, e dinheiro nunca deve virar float sem querer. */
export function paraNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  const n = typeof valor === 'number' ? valor : Number(String(valor));
  return Number.isFinite(n) ? n : null;
}
