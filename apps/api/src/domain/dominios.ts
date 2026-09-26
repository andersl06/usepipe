import { randomBytes } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { sql } from 'drizzle-orm';
import { DOMINIOS_PUBLICOS } from '@pipe/authentication';
import { noTenant } from '../database.js';
import { PipeError } from '../errors.js';

/**
 * Verificação de domínio: o que transforma "o e-mail dela termina em @acme.com.br"
 * em "ela é da Acme".
 *
 * É a segunda pergunta da entrada (`packages/autenticacao/src/entrada.ts`), e a
 * razão de ela exigir `verificado_em`: sem prova de posse, quem cadastrasse
 * `@banco.com.br` receberia todo mundo daquele banco no tenant dele. A prova é um
 * registro TXT no DNS — só quem manda na zona consegue publicar.
 *
 * **Domínio público nunca é verificável.** A lista está em `@pipe/authentication`
 * (`DOMINIOS_PUBLICOS`) e é a mesma que a entrada consulta: se `gmail.com` pudesse
 * ser verificado, o primeiro a cadastrá-lo levaria todo mundo para a conta dele.
 */

/** Use a dedicated TXT record prefix to avoid colliding with SPF and other apex records. */
export const PREFIX_TXT = '_pipe-verificacao';

export interface RecordOfVerification {
  name: string;
  tipo: 'TXT';
  value: string;
}

export interface DomainRegistered {
  id: string;
  domain: string;
  verificadoEm: Date | null;
  registro: RecordOfVerification;
}

/** Accept DNS labels with no scheme or path and at least one dot. */
const DOMAIN_ACCEPTABLE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export function normalizeDomain(cru: string | undefined): string {
  const domain = (cru ?? '')
    .trim()
    .toLowerCase()
    // Cola de quem copia do navegador ou escreve "@acme.com.br".
    .replace(/^https?:\/\//, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '')
    // A trailing dot is a valid DNS FQDN but would break comparison with an email domain.
    .replace(/\.$/, '');

  if (!DOMAIN_ACCEPTABLE.test(domain)) {
    throw PipeError.request('domain_invalid', `"${cru ?? ''}" não é um domínio.`);
  }
  if (DOMINIOS_PUBLICOS.has(domain)) {
    throw PipeError.request(
      'domain_public',
      `${domain} é domínio de e-mail pessoal e nunca identifica uma empresa. Convide por link.`,
      { domain },
    );
  }
  return domain;
}

export function recordOfVerification(domain: string, token: string): RecordOfVerification {
  return { name: `${PREFIX_TXT}.${domain}`, tipo: 'TXT', value: `pipe-verificacao=${token}` };
}

/**
 * Register a domain and return the TXT record to publish. Repeat calls are idempotent and return the same token; rotating it would invalidate a record already published by the client.
 */
export async function logDomain(
  tenantId: string,
  domainRaw: string | undefined,
): Promise<DomainRegistered> {
  const dominio = normalizeDomain(domainRaw);

  return noTenant(tenantId, async (tx) => {
    const { rows: existente } = await tx.execute<{
      id: string;
      token_verificacao: string | null;
      verificado_em: string | null;
    }>(sql`select id, token_verificacao, verificado_em from dominio_tenant
             where dominio = ${dominio} limit 1`);

    const linha = existente[0];
    if (linha?.token_verificacao) {
      return {
        id: linha.id,
         domain: dominio,
        verificadoEm: linha.verificado_em ? new Date(linha.verificado_em) : null,
        registro: recordOfVerification(dominio, linha.token_verificacao),
      };
    }

    // The unique constraint on `dominio` is GLOBAL. Without a tenant set, RLS hides another
    // client's row, so a collision appears as a unique violation rather than a query result.
    // empty; the correct response is 409, not 500.
    const token = randomBytes(16).toString('hex');
    try {
      const { rows } = await tx.execute<{ id: string }>(sql`
        insert into dominio_tenant (tenant_id, dominio, token_verificacao)
        values (${tenantId}::uuid, ${dominio}, ${token})
        returning id
      `);
      return {
        id: rows[0]!.id,
         domain: dominio,
        verificadoEm: null,
        registro: recordOfVerification(dominio, token),
      };
    } catch (error) {
      if (codigoDoPostgres(error) === '23505') {
        throw PipeError.conflito('domain_in_use', `${dominio} já pertence a outra conta do Pipe.`);
      }
      throw error;
    }
  });
}

export interface ResultOfVerification {
  id: string;
  domain: string;
  verificadoEm: Date;
}

export type ResolvedorTxt = (nome: string) => Promise<string[][]>;

/**
 * Verify the DNS TXT record and mark the domain verified. Inject `resolvedor` so tests avoid network, as with `buscar` in `trocarCodigo`; the default uses the system resolver. TXT strings arrive in chunks of at most 255 bytes and must be CONCATENATED before comparison. Comparing chunks separately fails for long tokens.
 */
export async function checkDomain(
  tenantId: string,
  id: string,
  resolvedor: ResolvedorTxt = resolveTxt,
): Promise<ResultOfVerification> {
  const linha = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<{
      id: string;
      domain: string;
      tokenVerification: string | null;
    }>(sql`select id, dominio, token_verificacao from dominio_tenant
             where id = ${id}::uuid limit 1`);
    return rows[0] ?? null;
  });

  if (!linha?.tokenVerification) throw PipeError.naoEncontrado('Domínio');
  const esperado = recordOfVerification(linha.domain, linha.tokenVerification);

  let registros: string[][];
  try {
    registros = await resolvedor(esperado.name);
  } catch {
    // `ENOTFOUND`/`ENODATA` usually means the record is unpublished or
    // not yet propagated. Tell the caller to retry rather than treating it as a server error.
    registros = [];
  }

  const publicado = registros.some((pedacos) => pedacos.join('').trim() === esperado.value);
  if (!publicado) {
    throw PipeError.request(
      'domain_not_verified',
      `Não encontrei ${esperado.value} em ${esperado.name}. Publique o TXT e tente de novo — a propagação leva alguns minutos.`,
      { registro: { ...esperado } },
    );
  }

  return noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<{ verificado_em: string }>(sql`
      update dominio_tenant set verificado_em = now(), atualizado_em = now()
       where id = ${id}::uuid
      returning verificado_em
    `);
    // `execute` devolve o timestamptz como veio do driver, em texto. Quem chama
    // the consumer expects a `Date`; converting here prevents `.toISOString is not a function`
    // on the first screen that formats it.
    return {
      id: linha.id,
       domain: linha.domain,
      verificadoEm: new Date(rows[0]!.verificado_em),
    };
  });
}

/**
 * Read SQLSTATE from a Postgres error. Drizzle wraps the driver failure, so `code` may be one layer down; `23505` distinguishes a domain already owned by another client (409) from an internal failure (500).
 */
export function codigoDoPostgres(erro: unknown): string | undefined {
  for (let atual = erro; atual != null; atual = (atual as { cause?: unknown }).cause) {
    if (typeof atual === 'object' && 'code' in atual && typeof atual.code === 'string') {
      return atual.code;
    }
  }
  return undefined;
}
