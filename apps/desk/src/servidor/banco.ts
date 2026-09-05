import { sql } from 'drizzle-orm';
import { criarBanco, comTenant } from '@pipe/db';
import type { BancoPipe, TransacaoPipe } from '@pipe/db';

/**
 * Acesso ao banco a partir dos Server Components e Server Actions do Desk.
 *
 * Nesta etapa não existe login: o Desk assume um tenant e um atendente fixos, vindos
 * de variável de ambiente e com o padrão apontando para a semente de demonstração.
 * **Este é o ponto de extensão da autenticação** — quando a sessão existir, é só
 * `sessaoAtual()` passar a ler o cookie em vez de ler o ambiente; nada mais na tela
 * precisa mudar.
 */

/** Papel da aplicação: sem `bypassrls`, sujeito à política `tenant_isolado`. */
const URL_APP =
  process.env['DATABASE_URL_APP'] ?? 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

/**
 * Papel dono. Usado só para descobrir o tenant pelo slug: a política de `tenant` é
 * escrita sobre o próprio `id`, então achar o tenant antes de haver tenant em vigor
 * não passa pelo papel da aplicação. É a lacuna registrada na migration `0001_rls`.
 */
const URL_DONO = process.env['DATABASE_URL'] ?? 'postgres://pipe:pipe@localhost:5433/pipe';

const SLUG = process.env['PIPE_TENANT_SLUG'] ?? 'demo';
const EMAIL_ATENDENTE = process.env['PIPE_ATENDENTE_EMAIL'] ?? 'ana.ribeiro@demo.pipe.app';

/**
 * O `next dev` recarrega o módulo a cada edição; sem isto cada recarga abriria um pool
 * novo e o Postgres acabaria recusando conexão.
 */
const guardado = globalThis as typeof globalThis & {
  pipeBancoApp?: BancoPipe;
  pipeBancoDono?: BancoPipe;
  pipeTenantId?: string;
};

function bancoApp(): BancoPipe {
  guardado.pipeBancoApp ??= criarBanco({ url: URL_APP, maxConexoes: 5 });
  return guardado.pipeBancoApp;
}

function bancoDono(): BancoPipe {
  guardado.pipeBancoDono ??= criarBanco({ url: URL_DONO, maxConexoes: 1 });
  return guardado.pipeBancoDono;
}

async function resolverTenantId(): Promise<string> {
  if (guardado.pipeTenantId) return guardado.pipeTenantId;
  const { rows } = await bancoDono().execute<{ id: string }>(
    sql`select id from tenant where slug = ${SLUG} limit 1`,
  );
  const id = rows[0]?.id;
  if (!id) {
    throw new Error(
      `tenant "${SLUG}" não existe. Rode "pnpm banco:migrar", "pnpm banco:semear" e "pnpm seed:demo".`,
    );
  }
  guardado.pipeTenantId = id;
  return id;
}

/** Roda o trabalho dentro da transação com `pipe.tenant_id` fixado. */
export async function noTenant<T>(fn: (tx: TransacaoPipe) => Promise<T>): Promise<T> {
  const tenantId = await resolverTenantId();
  return comTenant(bancoApp(), tenantId, fn);
}

export interface Sessao {
  tenantId: string;
  atendenteId: string;
  nome: string;
  email: string;
  /** Iniciais para o avatar do trilho. */
  iniciais: string;
}

/** O atendente em vigor. Ponto de extensão da autenticação (ver topo do arquivo). */
export async function sessaoAtual(): Promise<Sessao> {
  const tenantId = await resolverTenantId();
  return noTenant(async (tx) => {
    const { rows } = await tx.execute<{ id: string; nome: string; email: string }>(
      sql`select id, nome, email from usuario where email = ${EMAIL_ATENDENTE} limit 1`,
    );
    const usuario = rows[0];
    if (!usuario) {
      throw new Error(
        `atendente "${EMAIL_ATENDENTE}" não existe no tenant "${SLUG}". Rode "pnpm seed:demo".`,
      );
    }
    return {
      tenantId,
      atendenteId: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      iniciais: iniciaisDe(usuario.nome),
    };
  });
}

export function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? '?';
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : '';
  return (primeira + ultima).toUpperCase();
}
