import { cache } from 'react';
import { cookies, headers } from 'next/headers';

import { redirect } from 'next/navigation';
import { sql } from 'drizzle-orm';
import { criarBanco, comTenant, type Ator, type BancoPipe, type TransacaoPipe } from '@pipe/db';
import { tenant } from '@pipe/db/schema';
import type { Eu } from '@pipe/contracts';
import { COOKIE_SESSAO, buscarEu } from './sessao';
import { CABECALHO_CAMINHO, CABECALHO_CONTA, ROTAS_DO_ONBOARDING } from './rotas';

/**
 * Conexão única do Pipe Gestão.
 *
 * O app fala com o banco pelo papel `pipe_app`, que não tem `bypassrls`: toda
 * consulta passa por `comTenant`, que fixa `pipe.tenant_id` na transação. Sem
 * isso a RLS devolve zero linha — e é assim que tem de ser.
 *
 * **Qual tenant é resolvido pela SESSÃO**, não por `PIPE_TENANT_SLUG`. Enquanto
 * saía do ambiente, qualquer pessoa que abrisse a tela entrava como o cliente
 * da semente de demonstração — e não havia login para impedir. Agora quem
 * responde é o cookie `pipe_sessao`, pela `api`, e sem ele a saída é `/entrar`.
 *
 * O pool vive num global porque o `next dev` recarrega o módulo a cada mudança
 * de arquivo, e um pool novo por recarga esgota as conexões do Postgres. O
 * tenant NÃO vive: cache global de tenant é o cliente errado na tela de alguém.
 */
const globalComPool = globalThis as unknown as {
  __pipeGestaoBanco?: BancoPipe;
};

export function banco(): BancoPipe {
  if (!globalComPool.__pipeGestaoBanco) {
    const url = process.env['DATABASE_URL_APP'] ?? process.env['DATABASE_URL'];
    globalComPool.__pipeGestaoBanco = criarBanco({ url, maxConexoes: 5 });
  }
  return globalComPool.__pipeGestaoBanco;
}

/**
 * Quem está logado, pelo cookie.
 *
 * `cache` do React porque numa mesma renderização o layout, a página e cada
 * consulta perguntam a mesma coisa — e `GET /v1/eu` é ida à rede. O cache vale
 * por requisição, nunca entre requisições.
 */
const carregarEu = cache(async (): Promise<Eu | null> => {
  const cookie = (await cookies()).get(COOKIE_SESSAO);
  if (!cookie) return null;
  return buscarEu(`${COOKIE_SESSAO}=${cookie.value}`);
});

/** Quem está logado, ou `null`. Para quem sabe lidar com a ausência — o cabeçalho. */
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

  const cabecalhos = await headers();
  const caminho = cabecalhos.get(CABECALHO_CAMINHO) ?? '';

  /* O endereço manda na conta.

     Na plataforma de origem o subdomínio É a conta: quem entra por
     `empresa.blip.ai` continua na empresa, e quem entra pelo hub cai na conta
     pessoal — porque o login volta para a origem de onde saiu. Aqui a sessão
     ainda é uma só, então quando o endereço pede outra conta a sessão é trocada
     por uma nova (e a rota de troca recusa quem não tem usuário lá). */
  const contaDoEndereco = cabecalhos.get(CABECALHO_CONTA);
  if (
    contaDoEndereco &&
    contaDoEndereco !== eu.tenant.slug &&
    !caminho.startsWith('/trocar-conta')
  ) {
    redirect(`/trocar-conta?para=${encodeURIComponent(contaDoEndereco)}`);
  }

  /* Conta que nasceu no login e ainda não passou por "minha conta" não abre o
     produto: ela não tem canal, fila nem atendente, e a tela vazia não explica
     por quê. O portão é aqui, e não no middleware, porque só a `api` sabe se o
     onboarding fechou — o middleware vê o cookie, não o estado da conta. */
  if (!eu.tenant.onboardingConcluido && !ROTAS_DO_ONBOARDING.test(caminho)) {
    redirect('/bem-vindo');
  }
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

/**
 * Quem assina o que a Gestão grava, no log de auditoria.
 *
 * Era `sistema` porque não havia sessão: registrar uma pessoa que não se sabia
 * qual era seria mentira, e log que mente é pior do que log nenhum. Agora há
 * sessão, então o log passa a dizer QUEM — que é a única razão de alguém abrir
 * a auditoria depois.
 *
 * Continua sem `ip`: quem o tem é a `api`, e o Next atrás de proxy vê o do
 * proxy. ponytail: quando importar, ele vem de um cabeçalho confiável, não de
 * `x-forwarded-for` cru.
 */
export async function atorDaGestao(): Promise<Ator> {
  const eu = await exigirEu();
  return { tipo: 'usuario', id: eu.usuario.id };
}
