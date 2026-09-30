import { Controller, Get, Post, Req, Res } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import {
  InboundRefused,
  LoginError,
  configDoAmbiente,
  cookieDeSaida,
  cookieOfSession,
  createChallenge,
  createToken,
  loginWithGoogle,
  hashDoToken,
  origemPermitida,
  origensPermitidas,
  readTenantHostConfig,
  sair as encerrarSessao,
  exchangeCode,
  urlOfAuthorization,
} from '@pipe/authentication';
import type { DesafioDeLogin, OptionsOfCookie, PessoaDoGoogle } from '@pipe/authentication';
import type { Eu, OriginOfSession, Plano, RefusesOfInbound } from '@pipe/contracts';
import { buildLoginUrl, buildTenantOrigin, isLoginHost, parseReturnTo } from '@pipe/contracts';
import { databaseApp, databaseOwner, noTenant } from '../database.js';
import { acceptInvitation } from '../domain/convites.js';
import {
  registrationOfAccountEnabled,
  buildAccountOfLogin,
} from '../domain/builder-of-account.js';
import type { InboundByInvitation } from '../domain/convites.js';
import { PipeError } from '../errors.js';
import { WithSession, lerCookies, sessionCookie, sessionOf, tokenOfSession } from '../session.js';
import type { RequestWithSession } from '../session.js';

/**
 * Entrar, saber quem entrou e sair.
 *
 * O núcleo — desafio, PKCE, verificação do `id_token`, resolução de tenant, sessão —
 * mora em `@pipe/authentication` e não se repete aqui. Este arquivo é só a casca HTTP:
 * cookie, redirecionamento e o formato da resposta.
 *
 * A regra que molda tudo: **erro de entrada nunca vira 500 na cara da pessoa.** Quem
 * está entrando não tem o que fazer com um stack trace. Toda falha vira um
 * redirecionamento para a tela de entrada com `?erro=<codigo>`, e o código sai do
 * catálogo `RECUSAS_DE_ENTRADA` do contrato — a tela escolhe o texto e a saída.
 */

/** The cookie holds the challenge while awaiting the Google callback; a login lasts five minutes. */
export const COOKIE_DESAFIO = 'pipe_challenge';
const DESAFIO_SEGUNDOS = 300;

/** Management's post-login landing page (D-52). Duplicated from `apps/management-vite/src/lib/application-paths.ts`'s `APPLICATION` — the API cannot import front code, and `/` still works too (it redirects client-side), but this is the real destination. */
export const APPLICATION = '/application';

/** Challenge cookie `Path`: it applies only to the two `/v1/auth` routes. */
const CAMINHO_DESAFIO = '/v1/auth';

export function optionsOfCookie(): OptionsOfCookie {
  const domain = process.env['PIPE_COOKIE_DOMINIO'];
  return {
    // The base domain shares the session across login, application, and desk hosts.
    domain: domain && domain.length > 0 ? domain : undefined,
    seguro: process.env['PIPE_COOKIE_SEGURO'] !== 'false',
  };
}

function urlDoApp(): string {
  return (process.env['PIPE_URL_APP'] ?? 'http://localhost:3100').replace(/\/$/, '');
}

/**
 * Identify which of the three applications initiated login. Three front ends have distinct origins but share one API; `PIPE_URL_APP` cannot be the correct return URL for all, so a CRM login would otherwise return to Management. Validate `?origem=` against `PIPE_ORIGENS`, the same closed CORS allowlist. Trusting the query value would create an open redirect: any site could send a person to Google and receive their signed-in return. An unlisted origin falls back to `PIPE_URL_APP`, preserving login.
 */
export function baseDoApp(origem: string | undefined): string {
  const limpa = origem?.replace(/\/$/, '');
  return limpa && origemPermitida(limpa, origensPermitidas()) ? limpa : urlDoApp();
}

export function urlOfError(codigo: RefusesOfInbound, origem?: string): string {
  const tenant = readTenantHostConfig();
  if (tenant) {
    const url = new URL(`${buildLoginUrl(tenant)}login`);
    url.searchParams.set('error', codigo);
    return url.toString();
  }
  const base = baseDoApp(origem);
  // `PIPE_URL_ENTRADA` applies only when the initiating origin is unknown; overriding a
  // por cima de uma origem conhecida devolveria todo mundo ao mesmo lugar de novo.
  const url = new URL(
    origem ? `${base}/login` : (process.env['PIPE_URL_ENTRADA'] ?? `${base}/login`),
  );
  url.searchParams.set('error', codigo);
  return url.toString();
}

/**
 * `criarDesafio` already restricts destinations to internal paths. Check again here so a future caller constructing a challenge by hand cannot turn an absolute destination into an open redirect and use our domain for phishing. Reject a leading `\` too: a browser treats it as `/`, so `/\evil` would otherwise normalize to `//evil` (an external redirect) — the same gap closed on the front end's `caminhoInterno` (`apps/management-vite/src/lib/inbound.ts`).
 */
export function destinationAbsolute(destination: string, origem?: string): string {
  const interno =
    destination.startsWith('/') && !destination.startsWith('//') && !destination.startsWith('/\\')
      ? destination
      : APPLICATION;
  return `${baseDoApp(origem)}${interno}`;
}

/** Resolve the post-login URL from the authenticated tenant, never from the requested host. */
export async function destinationForTenant(tenantId: string, returnTo?: string): Promise<string> {
  const config = readTenantHostConfig();
  if (!config) return destinationAbsolute(APPLICATION);
  const { rows } = await databaseOwner().execute<{ slug: string }>(sql`
    select slug from tenant where id = ${tenantId}::uuid limit 1
  `);
  const slug = rows[0]?.slug;
  if (!slug) throw new Error('Authenticated tenant has no slug');
  const home = `${buildTenantOrigin(slug, 'application', config)}${APPLICATION}`;
  const target = returnTo ? parseReturnTo(returnTo, config) : null;
  if (!target) return home;
  if (target.slug === slug) return target.url;
  return `${home}?deniedTenant=${encodeURIComponent(target.slug)}`;
}

export function redirectToCentralLogin(request: Request, response: Response): boolean {
  const config = readTenantHostConfig();
  if (!config || isLoginHost(request.headers.host ?? '', config)) return false;
  response.redirect(302, buildLoginUrl(config, textoDaQuery(request, 'returnTo')));
  return true;
}

/**
 * Pipe's challenge combines the provider challenge with an invitation when login starts from one. The invitation token travels in the same cookie so it survives the Google round trip. Without it, the callback could not know the account was invited and would reject an unknown domain.
 */
export type ChallengeWithInvitation = DesafioDeLogin & {
  invitation?: string;
  returnTo?: string;
  /** The app that started login; the callback returns there. */
  origin?: string;
  /** The tenant that initiated SSO determines which customer the person belongs to. */
  tenantId?: string;
  /** Connection test: validate everything without creating a session. */
  test?: boolean;
};

export function cookieDoDesafio(desafio: ChallengeWithInvitation | null): string {
  const options = optionsOfCookie();
  const value = desafio ? Buffer.from(JSON.stringify(desafio)).toString('base64url') : '';
  const partes = [
    `${COOKIE_DESAFIO}=${value}`,
    `Path=${CAMINHO_DESAFIO}`,
    'HttpOnly',
    // Use `Lax`, not `Strict`: the Google callback is a top-level navigation from another
    // site. With `Strict`, the cookie is omitted and login always fails.
    'SameSite=Lax',
    `Max-Age=${desafio ? DESAFIO_SEGUNDOS : 0}`,
  ];
  // Login start and callback share one host, so the challenge stays host-only.
  if (options.domain && !readTenantHostConfig()) partes.push(`Domain=${options.domain}`);
  if (options.seguro ?? true) partes.push('Secure');
  return partes.join('; ');
}

/**
 * The challenge cookie intentionally has no Pipe signature. It asserts nothing by itself: it is the counterpart to the `state`, `nonce` and PKCE values sent to Google, and verification checks that it matches the callback. Signing would only defend against a browser owner forging their own login, which they can already do. `HttpOnly` keeps scripts from reading the value.
 */
export function lerDesafio(request: Request): ChallengeWithInvitation | null {
  /*
   * Inspect every cookie value with this name, not only the first. If `Domain` changed between releases, the browser can send both cookies with the old one first. That previously caused a silent login failure.
   */
  for (const cru of lerCookies(request.header('cookie'), COOKIE_DESAFIO)) {
    try {
      const objeto = JSON.parse(
        Buffer.from(cru, 'base64url').toString('utf8'),
      ) as ChallengeWithInvitation;
      if (objeto.state && objeto.nonce && objeto.verificadorPkce) return objeto;
    } catch {
      // Unreadable value: try the next cookie.
    }
  }
  return null;
}

/** Map the failure to a contract code the sign-in screen understands. */
export function codigoDaRecusa(error: unknown): RefusesOfInbound {
  if (error instanceof InboundRefused) {
    // A provider account already owned by another customer must look to the signer-in
    // the same as having no invitation. More detail would reveal that this email exists in another Pipe customer account.
    // e-mail existe em outra empresa do Pipe.
    return error.codigo === 'outro_tenant' ? 'without_invitation' : error.codigo;
  }
  if (error instanceof LoginError && error.codigo === 'email_nao_verificado') {
    return 'email_nao_verificado';
  }
  // An expired or used invitation, one for another email, or a Google account already
  // owned by someone else all mean the invitation is unusable; request another.
  // `sem_convite` is the code the screen can explain.
  if (error instanceof PipeError && error.status !== 500) return 'without_invitation';
  // Everything else, including a wrong `state`, failed code exchange or missing config,
  // is our or the provider's problem. The user has one recourse: retry.
  // tentar de novo.
  return 'falha_no_provedor';
}

export function textoDaQuery(requisicao: Request, campo: string): string | undefined {
  const valor = requisicao.query[campo];
  return typeof valor === 'string' ? valor : undefined;
}

/** Requested origin without a trailing slash; `baseDoApp` validates it. */
export function origemDaQuery(requisicao: Request): string | undefined {
  const crua = textoDaQuery(requisicao, 'origin');
  return crua ? crua.replace(/\/$/, '') : undefined;
}

/**
 * Accept the invitation with the Google identity and return the session. The `if` satisfies the type system, not a real branch: `aceitarConvite` always opens a session for a person. A 500 here would be preferable to redirecting as though login succeeded.
 */
async function loginByInvitation(
  token: string,
  pessoa: PessoaDoGoogle,
  context: { ip?: string; agente?: string },
): Promise<InboundByInvitation> {
  const aceito = await acceptInvitation(token, pessoa, context);
  if (!aceito.session) throw new Error('convite aceito sem abrir sessão');
  return aceito.session;
}

@Controller('v1/auth')
export class LoginController {
  /**
   * Development-only login without Google. It lets developers inspect screens on `localhost` when OAuth is not configured. Outside development (`NODE_ENV === 'production'`) it returns 404 as if the route did not exist. Real sign-in uses `google` or `sso`; this path issues a real session only for an existing seeded user. Open `/v1/auth/dev?email=ana.ribeiro@demo.pipe.app&origem=http://localhost:3200` in a browser.
   */
  @Get('dev')
  async dev(@Req() requisicao: Request, @Res() resposta: Response): Promise<void> {
    if (process.env['NODE_ENV'] === 'production') {
      resposta.status(404).end();
      return;
    }
    if (redirectToCentralLogin(requisicao, resposta)) return;
    const email = (textoDaQuery(requisicao, 'email') ?? 'ana.ribeiro@demo.pipe.app')
      .trim()
      .toLowerCase();
    const { rows } = await databaseOwner().execute<{ id: string; tenant_id: string }>(sql`
      select id, tenant_id from usuario where lower(email) = ${email} limit 1
    `);
    const u = rows[0];
    if (!u) {
      resposta
        .status(404)
        .end(`sem usuário "${email}" — rode o seed (pnpm banco:semear && pnpm seed:demo)`);
      return;
    }
    const novo = createToken();
    await databaseOwner().execute(sql`
      insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
      values (${u.tenant_id}::uuid, ${u.id}::uuid, ${novo.hash}, ${novo.expiraEm}, 'senha')
    `);
    resposta.setHeader('set-cookie', sessionCookie(cookieOfSession(novo.token, novo.expiraEm, optionsOfCookie())));
    if (readTenantHostConfig()) {
      resposta.redirect(302, await destinationForTenant(u.tenant_id, textoDaQuery(requisicao, 'returnTo')));
      return;
    }
    const permitidas = origensPermitidas();
    const origem = origemDaQuery(requisicao);
    const base =
      origem && origemPermitida(origem, permitidas) ? origem : (permitidas.fixed[0] ?? 'http://localhost:3200');
    resposta.redirect(302, `${base}/`);
  }

  /**
   * Start sign-in by creating a challenge, storing it in a cookie and redirecting to Google. `?convite=<token>` admits an invitee whose domain has not been verified; without it, sign-in would fail with `dominio_desconhecido` because the second step cannot identify the customer.
   */
  @Get('google')
  ir(@Req() requisicao: Request, @Res() resposta: Response): void {
    if (redirectToCentralLogin(requisicao, resposta)) return;
    let config;
    try {
      config = configDoAmbiente();
    } catch {
      resposta.redirect(302, urlOfError('falha_no_provedor', origemDaQuery(requisicao)));
      return;
    }

    const invitation = textoDaQuery(requisicao, 'invite');
    const origem = origemDaQuery(requisicao);
    const desafio: ChallengeWithInvitation = {
      ...createChallenge(textoDaQuery(requisicao, 'returnTo') ?? APPLICATION),
      ...(invitation ? { invitation } : {}),
      ...(origem ? { origin: origem } : {}),
      ...(readTenantHostConfig() && textoDaQuery(requisicao, 'returnTo') ? { returnTo: textoDaQuery(requisicao, 'returnTo') } : {}),
    };
    resposta.setHeader('set-cookie', cookieDoDesafio(desafio));
    resposta.redirect(302, urlOfAuthorization(config, desafio));
  }

  /** Google callback: either establish a session or return a rejection code. */
  @Get('google/callback')
  async callback(@Req() requisicao: Request, @Res() resposta: Response): Promise<void> {
    if (redirectToCentralLogin(requisicao, resposta)) return;
    const apagarDesafio = cookieDoDesafio(null);
    const desafio = lerDesafio(requisicao);
    if (!desafio) {
      // Without the challenge cookie, login cannot be verified: it may be an old tab, a blocked cookie
      // or a forged attempt. In all cases the person must start again.
      //
      // Keep this log: the path shows the same "provider failure" screen as
      // a network error, and without a trace we cannot distinguish the two.
      // That ambiguity delayed a previous diagnosis.
      console.error(
        '[api] retorno sem cookie de desafio',
        JSON.stringify({ cookies: (requisicao.header('cookie') ?? '').split(';').length }),
      );
      resposta.setHeader('set-cookie', apagarDesafio);
      resposta.redirect(302, urlOfError('falha_no_provedor'));
      return;
    }

    try {
      const pessoa = await exchangeCode(configDoAmbiente(), desafio, {
        code: textoDaQuery(requisicao, 'code'),
        state: textoDaQuery(requisicao, 'state'),
        error: textoDaQuery(requisicao, 'error'),
      });
      const context = { ip: requisicao.ip, agente: requisicao.header('user-agent') };
      // When the challenge includes an invitation, it determines the tenant and links the
      // Google account instead of relying on the domain; this is the only path for an unverified domain.
      const inbound = desafio.invitation
        ? await loginByInvitation(desafio.invitation, pessoa, context)
        : await loginWithGoogle(
            databaseOwner(),
            databaseApp(),
            pessoa,
            context,
            // With self-service disabled by default, people without an invitation or verified
            // domain remain rejected. If enabled, the account is created here and Management
            // receives the person on the welcome screen.
            registrationOfAccountEnabled()
              ? (quem) =>
                  buildAccountOfLogin({ email: quem.email, name: quem.nome }).then((account) => ({
                    tenantId: account.tenantId,
                    usuarioId: account.userId,
                  }))
              : undefined,
          );
      resposta.setHeader('set-cookie', [
        apagarDesafio,
        sessionCookie(cookieOfSession(inbound.token, inbound.expiresAt, optionsOfCookie())),
      ]);
      resposta.redirect(302, readTenantHostConfig()
        ? await destinationForTenant(inbound.tenantId, desafio.returnTo)
        : destinationAbsolute(desafio.destination, desafio.origin));
    } catch (erro) {
      const codigo = codigoDaRecusa(erro);
      if (codigo === 'falha_no_provedor') console.error('[api] falha ao entrar', erro);
      resposta.setHeader('set-cookie', apagarDesafio);
      resposta.redirect(302, urlOfError(codigo, desafio.origin));
    }
  }

  /** End the session and clear the cookie. Signing out twice is not an error. */
  @Post('sair')
  async sair(@Req() requisicao: Request, @Res() resposta: Response): Promise<void> {
    const token = tokenOfSession(requisicao);
    if (token) await encerrarSessao(databaseOwner(), hashDoToken(token));
    resposta.setHeader('set-cookie', sessionCookie(cookieDeSaida(optionsOfCookie())));
    resposta.status(204).end();
  }
}

type LinhaEu = {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  tenant_id: string;
  tenant_nome: string;
  slug: string;
  plan: string;
  onboarding_concluido_em: Date | string | null;
};

@Controller('v1')
export class MeController {
  /** The signed-in person in contract `Eu` format; source of truth for the screens. */
  @Get('eu')
  @WithSession()
  async eu(@Req() requisicao: RequestWithSession): Promise<Eu> {
    const session = sessionOf(requisicao);

    const encontrado = await noTenant(session.tenantId, async (tx) => {
      const { rows } = await tx.execute<LinhaEu>(sql`
        select u.id, u.nome as name, u.email, u.avatar_url,
               t.id as tenant_id, t.nome as tenant_nome, t.slug, t.plano as plan,
               t.onboarding_concluido_em
          from usuario u
          join tenant t on t.id = u.tenant_id
         where u.id = ${session.userId}::uuid and u.ativo
         limit 1
      `);
      const user = rows[0];
      if (!user) return null;

      // Permissions are the union of the person's roles, with per-person exceptions
      // overlaid through `usuario_permissao` (migration 0046; the attendant's
      // "Permissões" screen). The `union` includes grants from roles and explicit
      // grants; `not exists` removes permissions explicitly denied.
      // This matches the `coalesce` logic in `exigirPermissao`, expressed as a set
      // because this endpoint returns a list rather than testing one code at a time.
      // Use `distinct` because multiple roles often grant the same permission, and the screen
      // must not receive duplicates. Run serially, never with `Promise.all`: parallel work
      // inside this transaction can unset `pipe.tenant_id` and run a query without
      // tenant.
      const { rows: permissions } = await tx.execute<{ code: string }>(sql`
        select codigo as "code" from (
          select distinct pp.permissao_codigo as codigo
            from usuario_papel up
            join papel_permissao pp on pp.papel_id = up.papel_id
           where up.usuario_id = ${session.userId}::uuid
          union
          select uperm.permissao_codigo as codigo
            from usuario_permissao uperm
           where uperm.usuario_id = ${session.userId}::uuid and uperm.concedida
        ) efetivas
         where not exists (
           select 1 from usuario_permissao negada
            where negada.usuario_id = ${session.userId}::uuid
              and negada.permissao_codigo = efetivas.codigo
              and not negada.concedida
         )
         order by 1
      `);

      return { user, permissoes: permissions.map((p) => p.code) };
    });

    // A live session may point to a user removed or deactivated between
    // requests. Reject it rather than returning 500.
    if (!encontrado) throw PipeError.naoAutorizado('Sessão ausente ou expirada.');

    const { user, permissoes } = encontrado;
    return {
      user: {
        id: user.id,
        nome: user.name,
        email: user.email,
        avatarUrl: user.avatar_url,
      },
      tenant: {
        id: user.tenant_id,
        nome: user.tenant_nome,
        slug: user.slug,
        plano: user.plan as Plano,
        onboardingConcluido: user.onboarding_concluido_em !== null,
      },
      permissions: permissoes,
      origem: session.origem as OriginOfSession,
    };
  }
}
