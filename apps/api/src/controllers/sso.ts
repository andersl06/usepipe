import { Body, Controller, Get, HttpCode, Param, Post, Put, Req, Res } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import {
  cookieOfSession,
  createChallenge,
  loginWithSso,
  exchangeCodeOidc,
  urlOfAuthorizationOidc,
} from '@pipe/authentication';
import { databaseApp, databaseOwner, noTenant } from '../database.js';
import { WithSession, exigirPermission, sessionCookie, sessionOf } from '../session.js';
import type { RequestWithSession } from '../session.js';
import {
  codigoDaRecusa,
  cookieDoDesafio,
  destinationAbsolute,
  lerDesafio,
  optionsOfCookie,
  origemDaQuery,
  textoDaQuery,
  urlOfError,
} from './login.js';
import type { ChallengeWithInvitation } from './login.js';
import {
  connectionForFlow,
  defineState,
  discoverInbound,
  lerConexao,
  marcarTestada,
  salvarConexao,
  tenantBySlug,
} from '../domain/sso.js';

/**
 * SSO por tenant: configurar, testar, e entrar.
 *
 * O núcleo — descoberta, PKCE, verificação do `id_token`, resolução de conta —
 * mora em `@pipe/authentication` e não se repete aqui. Este arquivo é a casca HTTP,
 * igual ao `entrar.ts`, e reaproveita o cookie de desafio dele: é o mesmo
 * mecanismo, com dois campos a mais.
 *
 * **A rota que faz o produto funcionar é `GET /v1/auth/sso/testar`.** Ela roda o
 * fluxo inteiro contra o IdP do cliente e **não cria sessão**: devolve os claims
 * que chegaram e o que casou. É o que permite ligar o SSO sem quebrar o login de
 * quem já está dentro — e é a única coisa que destrava o estado `ativa`.
 */

@Controller('v1/sso')
export class SsoConnectionController {
  /** Tenant connection details without secrets, including what to paste into the IdP. */
  @Get()
  @WithSession()
  async ver(@Req() requisicao: RequestWithSession): Promise<Record<string, unknown>> {
    const sessao = sessionOf(requisicao);
    await permitido(sessao.tenantId, sessao.userId, 'tenant.configurar');
    const conexao = await lerConexao(sessao.tenantId);
    return conexao ? paraJson(conexao) : { conexao: null };
  }

  /** Save configuration in `rascunho`; saving does not activate it. */
  @Put()
  @WithSession()
  async salvar(
    @Req() requisicao: RequestWithSession,
    @Body() corpo: Record<string, string | undefined>,
  ): Promise<Record<string, unknown>> {
    const sessao = sessionOf(requisicao);
    await permitido(sessao.tenantId, sessao.userId, 'tenant.configurar');
    return paraJson(await salvarConexao(sessao.tenantId, sessao.userId, corpo));
  }

  /**
   * Change state and/or policy as separate fields with separate audit records. Enabling SSO and requiring SSO must never be the same button.
   */
  @Post('state')
  @HttpCode(200)
  @WithSession()
  async state(
    @Req() requisicao: RequestWithSession,
    @Body() corpo: { state?: string; policy?: string },
  ): Promise<Record<string, unknown>> {
    const sessao = sessionOf(requisicao);
    await permitido(sessao.tenantId, sessao.userId, 'tenant.configurar');
    return paraJson(await defineState(sessao.tenantId, sessao.userId, corpo));
  }
}

@Controller('v1/auth')
export class SsoLoginController {
  /**
   * For an email, discover its sign-in destination. Give the same response for known and unknown email addresses: only a verified domain with active SSO yields `sso`, which is public because the customer enabled it. Without that symmetry, this endpoint would enumerate customers.
   */
  @Post('descobrir')
  @HttpCode(200)
  async descobrir(@Body() corpo: { email?: string }): Promise<Record<string, unknown>> {
    return { ...(await discoverInbound(corpo.email)) };
  }

  /**
   * Start a connection test with an existing session. The customer admin is already signed in by password or Google, and this test does not alter that session. Register this route before `sso/:slug`: Nest uses the first matching route, and `:slug` would otherwise match `testar`.
   */
  @Get('sso/testar')
  @WithSession()
  async testar(@Req() request: RequestWithSession, @Res() resposta: Response): Promise<void> {
    const session = sessionOf(request);
    await permitido(session.tenantId, session.userId, 'tenant.configurar');
    // `exigirAtiva: false` permits testing a draft connection, which is the purpose here.
    const flow = await connectionForFlow(session.tenantId, { exigirActive: false });
    const desafio: ChallengeWithInvitation = {
      ...createChallenge('/'),
      tenantId: session.tenantId,
      test: true,
    };
    resposta.setHeader('set-cookie', cookieDoDesafio(desafio));
    resposta.redirect(302, urlOfAuthorizationOidc(flow.config, flow.descoberta, desafio));
  }

  /**
   * The customer IdP callback also precedes `sso/:slug` to avoid route capture. Resolve the tenant from the cookie, never the URL: `state` and the cookie together prove this callback belongs to the original request. Taking the tenant from the query would let whoever constructs the URL choose the customer to enter.
   */
  @Get('sso/callback')
  async callback(@Req() requisicao: Request, @Res() resposta: Response): Promise<void> {
    const apagarDesafio = cookieDoDesafio(null);
    const desafio = lerDesafio(requisicao);
    if (!desafio?.tenantId) {
      resposta.setHeader('set-cookie', apagarDesafio);
      resposta.redirect(302, urlOfError('falha_no_provedor'));
      return;
    }

    try {
      const fluxo = await connectionForFlow(desafio.tenantId, { exigirActive: !desafio.test });
      const pessoa = await exchangeCodeOidc(fluxo.config, fluxo.descoberta, desafio, {
        code: textoDaQuery(requisicao, 'code'),
        state: textoDaQuery(requisicao, 'state'),
        error: textoDaQuery(requisicao, 'error'),
      });

      resposta.setHeader('set-cookie', apagarDesafio);

      // The test stops here: it creates no session, new cookie or account,
      // only reports the received claims and what would match. That makes it safe to point
      // a new IdP at a tenant that already has users.
      if (desafio.test) {
        await marcarTestada(desafio.tenantId);
        resposta.status(200).json({
          result: 'ok',
          issuer: pessoa.emissor,
          subject: pessoa.sujeito,
          email: pessoa.email,
          emailVerified: pessoa.emailVerificado,
          name: pessoa.nome ?? null,
          matchesUser: await userWithEmail(desafio.tenantId, pessoa.email),
          // Warn before Monday's support call: without a verified email, real login rejects the user even when the test passes.
          // o login real recusa, mesmo com o teste "passando".
          aviso: pessoa.emailVerificado
            ? null
            : 'O provedor não confirmou o e-mail. No Entra ID, habilite o claim opcional `xms_edov`.',
        });
        return;
      }

      const inbound = await loginWithSso(
        databaseOwner(),
        databaseApp(),
        pessoa,
        desafio.tenantId,
        { ip: requisicao.ip, agente: requisicao.header('user-agent') },
      );
      resposta.setHeader('set-cookie', [
        apagarDesafio,
        sessionCookie(cookieOfSession(inbound.token, inbound.expiresAt, optionsOfCookie())),
      ]);
      resposta.redirect(302, destinationAbsolute(desafio.destination, desafio.origin));
    } catch (error) {
      const codigo = codigoDaRecusa(error);
      if (codigo === 'falha_no_provedor') console.error('[api] falha ao entrar por SSO', error);
      resposta.setHeader('set-cookie', apagarDesafio);
      // In a test the admin needs the failure reason; in real login the user must not receive it.
      if (desafio.test) {
        resposta.status(200).json({ result: 'falhou', codigo, motivo: message(error) });
        return;
      }
      resposta.redirect(302, urlOfError(codigo, desafio.origin));
    }
  }

  /**
   * A company direct link, `app.usepipe.com.br/e/<slug>`, reaches this route. It performs the same discovery by URL rather than email for people with personal email addresses who cannot be discovered by domain.
   */
  @Get('sso/:slug')
  async ir(
    @Param('slug') slug: string,
    @Req() requisicao: Request,
    @Res() resposta: Response,
  ): Promise<void> {
    try {
      const tenantId = await tenantBySlug(slug);
      const fluxo = await connectionForFlow(tenantId, { exigirActive: true });
      const origem = origemDaQuery(requisicao);
      const desafio: ChallengeWithInvitation = {
        ...createChallenge(textoDaQuery(requisicao, 'destino') ?? '/'),
        tenantId,
        ...(origem ? { origem } : {}),
      };
      resposta.setHeader('set-cookie', cookieDoDesafio(desafio));
      resposta.redirect(302, urlOfAuthorizationOidc(fluxo.config, fluxo.descoberta, desafio));
    } catch (erro) {
      console.error('[api] falha ao iniciar SSO', erro);
      resposta.redirect(302, urlOfError('falha_no_provedor', origemDaQuery(requisicao)));
    }
  }
}

function message(erro: unknown): string {
  return erro instanceof Error ? erro.message : 'Falha desconhecida.';
}

/** Report only whether the identity matches and whom; only this tenant's admin reads it. */
async function userWithEmail(tenantId: string, email: string): Promise<string | null> {
  return noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<{ name: string }>(
      sql`select nome from usuario where email = ${email} and ativo limit 1`,
    );
    return rows[0]?.name ?? null;
  });
}

function paraJson(conexao: Awaited<ReturnType<typeof lerConexao>>): Record<string, unknown> {
  if (!conexao) return { conexao: null };
  return {
    id: conexao.id,
    provedor: conexao.provider,
    emissor: conexao.issuer,
    clienteId: conexao.clientId,
    estado: conexao.state,
    politica: conexao.policy,
    testedAt: conexao.testadaEm?.toISOString() ?? null,
    activatedAt: conexao.ativadaEm?.toISOString() ?? null,
    callbackUrl: conexao.callbackUrl,
  };
}

/** As in `convites.ts`, check permission in a separate transaction. */
function permitido(tenantId: string, userId: string, codigo: string): Promise<void> {
  return noTenant(tenantId, (tx) => exigirPermission(tx, userId, codigo));
}
