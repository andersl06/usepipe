import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { criarBanco, comTenant } from '@pipe/db';
import type { BancoPipe, TransacaoPipe } from '@pipe/db';
import type { Eu } from '@pipe/contracts';
import { COOKIE_SESSAO, buscarEu } from '../lib/sessao';
import { iniciaisDe } from '../lib/nome';

/**
 * Acesso ao banco a partir dos Server Components e Server Actions do Desk.
 *
 * **O tenant e o atendente vêm da SESSÃO**, não do ambiente. Até aqui os dois
 * saíam de `PIPE_TENANT_SLUG` e `PIPE_ATENDENTE_EMAIL`, com o padrão apontando
 * para a semente de demonstração — o que significava que qualquer pessoa que
 * abrisse a tela entraria como o cliente de demonstração. Agora quem responde
 * "de quem é esta tela" é o cookie `pipe_sessao`, resolvido pela `api` em
 * `GET /v1/eu`, e sem ele a pessoa vai para `/entrar`.
 *
 * A conexão com o Postgres continua aqui porque a tela ainda consulta o banco
 * direto (dívida conhecida do README, que a migração para Vite paga). O que
 * mudou é que o `tenant_id` da transação é o da pessoa logada.
 */

/** Papel da aplicação: sem `bypassrls`, sujeito à política `tenant_isolado`. */
const URL_APP =
  process.env['DATABASE_URL_APP'] ?? 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

/**
 * O `next dev` recarrega o módulo a cada edição; sem isto cada recarga abriria um pool
 * novo e o Postgres acabaria recusando conexão.
 */
const guardado = globalThis as typeof globalThis & {
  pipeBancoApp?: BancoPipe;
};

function bancoApp(): BancoPipe {
  guardado.pipeBancoApp ??= criarBanco({ url: URL_APP, maxConexoes: 5 });
  return guardado.pipeBancoApp;
}

/**
 * Quem está logado, pelo cookie.
 *
 * `cache` do React porque numa mesma renderização a página, o trilho e cada
 * ação perguntam a mesma coisa — e `GET /v1/eu` é ida à rede, não leitura
 * local. O cache vale por requisição, e não entre requisições: sessão em cache
 * global é sessão de outra pessoa aparecendo na tela de alguém.
 */
const carregarEu = cache(async (): Promise<Eu | null> => {
  const cookie = (await cookies()).get(COOKIE_SESSAO);
  if (!cookie) return null;
  return buscarEu(`${COOKIE_SESSAO}=${cookie.value}`);
});

/**
 * O cookie de sessão como TEXTO, para repassar à `api`.
 *
 * Quem escreve no Pipe é a `api`, e ela precisa saber quem está mandando —
 * o mesmo cookie que o navegador mandou para cá segue adiante sem ser lido.
 * Ausente é sessão vencida: quem chamar isto já passou por `exigirEu`.
 */
export async function cookieDeSessao(): Promise<string> {
  const cookie = (await cookies()).get(COOKIE_SESSAO);
  return cookie ? `${COOKIE_SESSAO}=${cookie.value}` : '';
}

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

/** Roda o trabalho dentro da transação com o `pipe.tenant_id` de quem está logado. */
export async function noTenant<T>(fn: (tx: TransacaoPipe) => Promise<T>): Promise<T> {
  const eu = await exigirEu();
  return comTenant(bancoApp(), eu.tenant.id, fn);
}

export interface Sessao {
  tenantId: string;
  atendenteId: string;
  nome: string;
  email: string;
  /** Iniciais para o avatar do trilho. */
  iniciais: string;
  /** O nome do cliente, para o menu de conta do trilho. */
  tenantNome: string;
}

/**
 * O atendente em vigor. Uma chamada de rede, não uma consulta: `GET /v1/eu` já
 * devolve usuário e tenant juntos, e repetir isso em SQL aqui seria manter duas
 * definições de "quem está logado".
 */
export async function sessaoAtual(): Promise<Sessao> {
  const eu = await exigirEu();
  return {
    tenantId: eu.tenant.id,
    atendenteId: eu.usuario.id,
    nome: eu.usuario.nome,
    email: eu.usuario.email,
    iniciais: iniciaisDe(eu.usuario.nome),
    tenantNome: eu.tenant.nome,
  };
}

