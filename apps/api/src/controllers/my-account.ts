import { Body, Controller, Get, Patch, Post, Req, Res } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Response } from 'express';
import { openSessionAt, cookieOfSession } from '@pipe/authentication';
import { databaseApp, databaseOwner, noTenant } from '../database.js';
import { PipeError } from '../errors.js';
import { WithSession, sessionCookie, sessionOf } from '../session.js';
import type { RequestWithSession } from '../session.js';
import { optionsOfCookie } from './login.js';

/**
 * "Minha conta" and the account selector finish self-service onboarding. The source sequence is documented in `referencias-blip/pesquisa/onboarding-blip.md`: login creates an account, the welcome screen announces it, and this form completes it. While `onboardingConcluidoEm` is null, Management sends the person here instead of opening the portal. The selector exists because one email can administer several accounts; the source changes subdomain, while Pipe changes session. Deliberately query the owner database because listing those accounts crosses tenants; return only accounts where this email already has an active user.
 */

/**
 * Use the source's seven employee-size bands with its exact cutoffs: 1–4, 5–19, 20–49, 50–249, 250–999, 1,000–10,000 and above. Our former seven round-number bands did not align with its data or the market that reports in this format. Store a band rather than an exact count because headcount changes more often than its band.
 */
const FAIXAS_DE_FUNCIONARIOS = [
  '1 a 4',
  '5 a 19',
  '20 a 49',
  '50 a 249',
  '250 a 999',
  '1.000 a 10.000',
  'mais de 10.000',
] as const;

/** The source's three languages. */
const IDIOMAS = ['pt-BR', 'en-US', 'es-ES'] as const;

/**
 * Brazilian timezones, ordered from most to least used. Use a closed list rather than all roughly 400 IANA names, which would make the screen hard to scan. Extend it when there is a customer elsewhere; the database already accepts any valid name.
 */
const FUSOS = [
  'America/Sao_Paulo',
  'America/Bahia',
  'America/Fortaleza',
  'America/Recife',
  'America/Belem',
  'America/Manaus',
  'America/Campo_Grande',
  'America/Cuiaba',
  'America/Porto_Velho',
  'America/Boa_Vista',
  'America/Rio_Branco',
  'America/Noronha',
] as const;

export interface AccountInForce {
  id: string;
  name: string;
  slug: string;
  plan: string;
  site: string | null;
  employees: string | null;
  city: string | null;
  state: string | null;
  pais: string | null;
  phone: string | null;
  optinWhatsapp: boolean;
  /**
   * The source screen's "Preferências" tab contains language and timezone. Both tenant columns already existed but no screen changed them. Timezone determines "today" in every report, so omitting it would leave the customer stuck with the provisioning default.
   */
  idioma: string;
  fuso: string;
  /** Null until the form has been saved once. */
  onboardingConcluidoEm: string | null;
  faixasDeFuncionarios: readonly string[];
  idiomas: readonly string[];
  fusos: readonly string[];
}

type LineAccount = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  site: string | null;
  employees: string | null;
  city: string | null;
  state: string | null;
  pais: string | null;
  phone: string | null;
  optin_whatsapp: boolean;
  idioma: string;
  fuso: string;
  onboarding_concluido_em: Date | string | null;
};

function forContract(linha: LineAccount): AccountInForce {
  const concluido = linha.onboarding_concluido_em;
  return {
    id: linha.id,
    name: linha.name,
    slug: linha.slug,
    plan: linha.plan,
    site: linha.site,
    employees: linha.employees,
    city: linha.city,
    state: linha.state,
    pais: linha.pais,
    phone: linha.phone,
    optinWhatsapp: linha.optin_whatsapp,
    idioma: linha.idioma,
    fuso: linha.fuso,
    onboardingConcluidoEm: concluido ? new Date(concluido).toISOString() : null,
    faixasDeFuncionarios: FAIXAS_DE_FUNCIONARIOS,
    idiomas: IDIOMAS,
    fusos: FUSOS,
  };
}

export interface AccountInList {
  tenantId: string;
  name: string;
  slug: string;
  plan: string;
  /** The account for this session; the selector marks it. */
  inForce: boolean;
  onboardingCompleted: boolean;
  /**
   * A personal account is created at login without a verified domain. The source distinguishes a company contract (with ID) from a personal space (without ID), and the selector renders them differently. Here the evidence is a verified domain: a subscribing company publishes a DNS TXT record; someone who joined alone with their own email has not.
   */
  personal: boolean;
}

/** A value from the allowlist, or null when none was supplied. Reject a value outside the list. */
function escolha(
  value: unknown,
  lista: readonly string[],
  codigo: string,
  recado: string,
): string | null {
  const limpo = typeof value === 'string' ? value.trim() : '';
  if (!limpo) return null;
  if (!lista.includes(limpo)) throw PipeError.request(codigo, recado);
  return limpo;
}

/** Texto que veio da tela: apara, e vazio vira nulo (o campo foi limpo). */
function texto(valor: unknown, limite: number): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim().slice(0, limite);
  return limpo || null;
}

@Controller('v1')
export class MyAccountController {

  @Get('account')
  @WithSession()
  async account(@Req() request: RequestWithSession): Promise<AccountInForce> {
    const session = sessionOf(request);
    const linha = await noTenant(session.tenantId, async (tx) => {
      const { rows } = await tx.execute<LineAccount>(sql`
        select id, nome, slug, plano, site, funcionarios, cidade, estado, pais,
               telefone, optin_whatsapp, idioma, fuso, onboarding_concluido_em
          from tenant
         where id = ${session.tenantId}::uuid
         limit 1
      `);
      return rows[0] ?? null;
    });
    if (!linha) throw PipeError.naoAutorizado('Sessão ausente ou expirada.');
    return forContract(linha);
  }

  /**
   * Save company data and complete onboarding. Saving sets `onboarding_concluido_em`; there is no separate finish button. In the source, the form's `POST /Account` is that step. Saving again does not reopen onboarding or reset the timestamp: the first save date measures how long the account took to become active.
   */
  @Patch('account')
  @WithSession()
  async salvar(
    @Req() requisicao: RequestWithSession,
    @Body() corpo: Record<string, unknown>,
  ): Promise<AccountInForce> {
    const sessao = sessionOf(requisicao);

    const nome = texto(corpo['nome'], 120);
    const funcionarios = texto(corpo['funcionarios'], 40);
    if (funcionarios && !FAIXAS_DE_FUNCIONARIOS.includes(funcionarios as never)) {
      throw PipeError.request(
        'employees_invalid',
        `Escolha uma das faixas: ${FAIXAS_DE_FUNCIONARIOS.join(', ')}.`,
      );
    }

    /*
     * Use allowlists at both edges. A language the screen cannot render or a timezone Postgres does not recognize can silently break an entire report.
     */
    const idioma = escolha(corpo['idioma'], IDIOMAS, 'idioma_invalido', 'Idioma não suportado.');
    const fuso = escolha(corpo['fuso'], FUSOS, 'fuso_invalido', 'Fuso não suportado.');

    const linha = await noTenant(sessao.tenantId, async (tx) => {
      const { rows } = await tx.execute<LineAccount>(sql`
        update tenant set
          nome = coalesce(${nome}, nome),
          site = ${texto(corpo['site'], 200)},
          funcionarios = ${funcionarios},
          cidade = ${texto(corpo['cidade'], 120)},
          estado = ${texto(corpo['estado'], 60)},
          pais = ${texto(corpo['pais'], 60)},
          telefone = ${texto(corpo['telefone'], 40)},
          optin_whatsapp = ${corpo['optinWhatsapp'] === true},
          idioma = coalesce(${idioma}, idioma),
          fuso = coalesce(${fuso}, fuso),
          onboarding_concluido_em = coalesce(onboarding_concluido_em, now()),
          atualizado_em = now()
         where id = ${sessao.tenantId}::uuid
        returning id, nome, slug, plano, site, funcionarios, cidade, estado, pais,
                  telefone, optin_whatsapp, idioma, fuso, onboarding_concluido_em
      `);
      return rows[0] ?? null;
    });
    if (!linha) throw PipeError.naoAutorizado('Sessão ausente ou expirada.');
    return forContract(linha);
  }

  /**
   * List the accounts associated with this email for the upper-left selector. Match by email rather than provider identity: someone invited to another customer's account appears even before signing in there with Google, matching the criterion used to link accounts on first sign-in.
   */
  @Get('accounts/my')
  @WithSession()
  async minhas(@Req() requisicao: RequestWithSession): Promise<AccountInList[]> {
    const sessao = sessionOf(requisicao);
    const email = await emailOfSession(sessao.tenantId, sessao.userId);

    const { rows } = await databaseOwner().execute<{
      tenant_id: string;
      name: string;
      slug: string;
      plan: string;
      onboarding_concluido_em: Date | string | null;
      personal: boolean;
    }>(sql`
      select t.id as tenant_id, t.nome as "name", t.slug, t.plano as "plan", t.onboarding_concluido_em,
             not exists (
               select 1 from dominio_tenant d
                where d.tenant_id = t.id and d.verificado_em is not null
             ) as pessoal
        from usuario u
        join tenant t on t.id = u.tenant_id
       where lower(u.email) = ${email} and u.ativo and t.ativo
       order by t.nome
    `);

    return rows.map((linha) => ({
      tenantId: linha.tenant_id,
      name: linha.name,
      slug: linha.slug,
      plan: linha.plan,
      inForce: linha.tenant_id === sessao.tenantId,
      onboardingCompleted: linha.onboarding_concluido_em !== null,
      personal: linha.personal,
    }));
  }

  /**
   * Switch the current account by opening a new session for the destination and returning its cookie. Verify membership here using the email from the current session; an arbitrary `tenantId` in the request grants nothing. Keep the old session valid deliberately, since users switch back and invalidating another tab during a conversation would be worse.
   */
  @Post('accounts/exchange')
  @WithSession()
  async exchange(
    @Req() requisicao: RequestWithSession,
    @Res({ passthrough: true }) resposta: Response,
    @Body() corpo: { tenantId?: string; slug?: string },
  ): Promise<{ tenantId: string; slug: string }> {
    const sessao = sessionOf(requisicao);
    /*
     * Accept both forms because the two screens have different inputs: the selector has the account ID, while an account address (subdomain) contains only its slug in the URL.
     */
    const destination = (corpo?.tenantId ?? '').trim() || (await idDoSlug(corpo?.slug));
    if (!destination) throw PipeError.request('tenant_missing', 'Informe a conta de destino.');
    if (destination === sessao.tenantId) {
      const atual = await noTenant(sessao.tenantId, async (tx) => {
        const { rows } = await tx.execute<{ slug: string }>(
          sql`select slug from tenant where id = ${destination}::uuid limit 1`,
        );
        return rows[0]?.slug ?? '';
      });
      return { tenantId: destination, slug: atual };
    }

    const email = await emailOfSession(sessao.tenantId, sessao.userId);
    const { rows } = await databaseOwner().execute<{ userId: string; slug: string }>(sql`
      select u.id as usuario_id, t.slug
        from usuario u
        join tenant t on t.id = u.tenant_id
       where u.tenant_id = ${destination}::uuid and lower(u.email) = ${email}
         and u.ativo and t.ativo
       limit 1
    `);
    const alvo = rows[0];
    // Without membership, respond "does not exist" rather than "you cannot": acknowledging that the
    // account exists would reveal to a curious caller which company uses Pipe.
    if (!alvo) throw new PipeError(404, 'not_found', 'Não encontrado.');

    const inbound = await openSessionAt(
      databaseOwner(),
      databaseApp(),
      destination,
      alvo.userId,
      sessao.origem === 'sso' ? 'sso' : 'google',
      { ip: requisicao.ip, agente: requisicao.header('user-agent') },
    );
    resposta.setHeader(
      'set-cookie',
      sessionCookie(cookieOfSession(inbound.token, inbound.expiresAt, optionsOfCookie())),
    );
    return { tenantId: destination, slug: alvo.slug };
  }
}

/**
 * Resolve an account ID from its address using the owner database because this lookup occurs before knowing whether the person has access. The route then decides access by email. A nonexistent slug returns empty, which the route treats as not found; the response does not distinguish a nonexistent account from one the caller cannot access.
 */
async function idDoSlug(slug: string | undefined): Promise<string> {
  const limpo = (slug ?? '').trim().toLowerCase();
  if (!limpo) return '';
  const { rows } = await databaseOwner().execute<{ id: string }>(
    sql`select id from tenant where slug = ${limpo} and ativo limit 1`,
  );
  return rows[0]?.id ?? '';
}

/** The signed-in person's email links that person's accounts. */
async function emailOfSession(tenantId: string, userId: string): Promise<string> {
  const email = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<{ email: string }>(
      sql`select lower(email) as email from usuario where id = ${userId}::uuid limit 1`,
    );
    return rows[0]?.email ?? null;
  });
  if (!email) throw PipeError.naoAutorizado('Sessão ausente ou expirada.');
  return email;
}
