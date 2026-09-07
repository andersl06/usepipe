import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql } from 'drizzle-orm';
import { criarBanco, comTenant, type Ator, type BancoPipe, type TransacaoPipe } from '@pipe/db';
import { tenant } from '@pipe/db/schema';
import type { Eu } from '@pipe/contracts';
import { COOKIE_SESSAO, buscarEu } from './sessao';

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
};

export function banco(): BancoPipe {
  if (!globalComPool.__pipeCrmBanco) {
    const url = process.env['DATABASE_URL_APP'] ?? process.env['DATABASE_URL'];
    globalComPool.__pipeCrmBanco = criarBanco({ url, maxConexoes: 10 });
  }
  return globalComPool.__pipeCrmBanco;
}

/**
 * Quem está logado, pelo cookie.
 *
 * `cache` do React porque numa mesma renderização a lateral, a página e cada
 * consulta perguntam a mesma coisa — e `GET /v1/eu` é ida à rede. O cache vale
 * por requisição, nunca entre requisições.
 */
const carregarEu = cache(async (): Promise<Eu | null> => {
  const cookie = (await cookies()).get(COOKIE_SESSAO);
  if (!cookie) return null;
  return buscarEu(`${COOKIE_SESSAO}=${cookie.value}`);
});

/** Quem está logado, ou `null`. Para quem sabe lidar com a ausência. */
export async function euAtual(): Promise<Eu | null> {
  return carregarEu();
}

/**
 * Quem está logado, ou a tela de entrada.
 *
 * Cobre o cookie vencido e o forjado, que o middleware não pega: ele só confere
 * se o cookie EXISTE, e quem diz se ele vale é a `api`.
 */
export async function exigirEu(): Promise<Eu> {
  const eu = await carregarEu();
  if (!eu) redirect('/entrar');
  return eu;
}

/** Qual tenant esta requisição atende: o de quem está logado, e nenhum outro. */
export async function tenantId(): Promise<string> {
  return (await exigirEu()).tenant.id;
}

/** Açúcar: abre a transação já com o tenant desta instância fixado. */
export async function consultar<T>(fn: (tx: TransacaoPipe) => Promise<T>): Promise<T> {
  return comTenant(banco(), await tenantId(), fn);
}

/**
 * O fuso do tenant, para o "mês" dos indicadores não ser o fuso do servidor.
 *
 * O cache de processo SAIU junto com o tenant fixo: guardado num global, ele
 * era o fuso do primeiro cliente que abrisse a tela servindo a todos os
 * seguintes. `cache` do React põe o limite certo — uma consulta por
 * requisição, e nada atravessando requisições.
 */
export const fusoDoTenant = cache(async (): Promise<string> => {
  return consultar(async (tx) => {
    const [linha] = await tx.select({ fuso: tenant.fuso }).from(tenant).limit(1);
    return linha?.fuso ?? 'America/Sao_Paulo';
  });
});

/**
 * Quem assina o que o CRM grava, no log de auditoria.
 *
 * Era `sistema` porque não havia sessão: registrar uma pessoa que não se sabia
 * qual era seria mentira. Agora há sessão, e o log diz quem — que é a única
 * razão de alguém abrir a auditoria depois. Mesma decisão, mesmo motivo, que a
 * Gestão tomou em `atorDaGestao`.
 */
export async function atorDoCrm(): Promise<Ator> {
  const eu = await exigirEu();
  return { tipo: 'usuario', id: eu.usuario.id };
}

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
