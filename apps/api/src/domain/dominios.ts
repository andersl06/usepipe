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
 * **Domínio público nunca é verificável.** A lista está em `@pipe/autenticacao`
 * (`DOMINIOS_PUBLICOS`) e é a mesma que a entrada consulta: se `gmail.com` pudesse
 * ser verificado, o primeiro a cadastrá-lo levaria todo mundo para a conta dele.
 */

/** O nome do registro. Prefixo próprio para não brigar com SPF e afins no apex. */
export const PREFIX_TXT = '_pipe-verificacao';

export interface RegistroOfVerification {
  name: string;
  tipo: 'TXT';
  value: string;
}

export interface DomainRegistered {
  id: string;
  domain: string;
  verificadoEm: Date | null;
  registro: RegistroOfVerification;
}

/** Rótulos de DNS, sem esquema, sem caminho, com pelo menos um ponto. */
const DOMAIN_ACEITAVEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export function normalizeDomain(cru: string | undefined): string {
  const domain = (cru ?? '')
    .trim()
    .toLowerCase()
    // Cola de quem copia do navegador ou escreve "@acme.com.br".
    .replace(/^https?:\/\//, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '')
    // Ponto final é FQDN válido no DNS e lixo na comparação com o e-mail.
    .replace(/\.$/, '');

  if (!DOMAIN_ACEITAVEL.test(domain)) {
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

export function registroOfVerification(domain: string, token: string): RegistroOfVerification {
  return { nome: `${PREFIX_TXT}.${domain}`, tipo: 'TXT', value: `pipe-verificacao=${token}` };
}

/**
 * Registra o domínio e devolve o TXT a publicar. Idempotente: chamar de novo para o
 * mesmo domínio devolve o mesmo token, senão quem já publicou o registro veria a
 * verificação falhar sem ter mexido em nada.
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
        dominio,
        verificadoEm: linha.verificado_em ? new Date(linha.verificado_em) : null,
        registro: registroOfVerification(dominio, linha.token_verificacao),
      };
    }

    // O único de `dominio` é GLOBAL. Sem tenant em vigor a RLS esconde a linha do
    // outro cliente, então a colisão chega como violação de único, não como select
    // vazio — e a resposta certa é 409, não 500.
    const token = randomBytes(16).toString('hex');
    try {
      const { rows } = await tx.execute<{ id: string }>(sql`
        insert into dominio_tenant (tenant_id, dominio, token_verificacao)
        values (${tenantId}::uuid, ${dominio}, ${token})
        returning id
      `);
      return {
        id: rows[0]!.id,
        dominio,
        verificadoEm: null,
        registro: registroOfVerification(dominio, token),
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
 * Confere o TXT no DNS e marca como verificado.
 *
 * `resolvedor` é injetável para o teste não sair para a rede — mesma escolha do
 * `buscar` de `trocarCodigo`. O padrão é o resolvedor do sistema.
 *
 * Um registro TXT chega partido em pedaços de até 255 bytes, e o valor é a
 * CONCATENAÇÃO deles; comparar pedaço a pedaço é o erro que faz a verificação
 * falhar só para quem tem token longo.
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
  const esperado = registroOfVerification(linha.dominio, linha.tokenVerification);

  let registros: string[][];
  try {
    registros = await resolvedor(esperado.nome);
  } catch {
    // `ENOTFOUND`/`ENODATA` é o caso comum: o registro ainda não foi publicado ou
    // ainda não propagou. Isso é "tente de novo", não erro do servidor.
    registros = [];
  }

  const publicado = registros.some((pedacos) => pedacos.join('').trim() === esperado.value);
  if (!publicado) {
    throw PipeError.request(
      'domain_not_verified',
      `Não encontrei ${esperado.value} em ${esperado.nome}. Publique o TXT e tente de novo — a propagação leva alguns minutos.`,
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
    // espera `Date`, e converter aqui é o que evita `.toISOString is not a function`
    // aparecer na primeira tela que formatar a data.
    return {
      id: linha.id,
      dominio: linha.dominio,
      verificadoEm: new Date(rows[0]!.verificado_em),
    };
  });
}

/**
 * O código SQLSTATE do erro. O Drizzle embrulha a falha do driver, então o `code`
 * pode estar uma camada abaixo — e é justamente o caso do `23505` que separa
 * "domínio de outro cliente" (409) de erro interno (500).
 */
export function codigoDoPostgres(erro: unknown): string | undefined {
  for (let atual = erro; atual != null; atual = (atual as { cause?: unknown }).cause) {
    if (typeof atual === 'object' && 'code' in atual && typeof atual.code === 'string') {
      return atual.code;
    }
  }
  return undefined;
}
