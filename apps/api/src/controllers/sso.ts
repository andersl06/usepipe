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
import { WithSession, exigirPermission, sessionOf } from '../session.js';
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
  /** A conexão do tenant, sem segredo nenhum. Mostra também o que colar no IdP. */
  @Get()
  @WithSession()
  async ver(@Req() requisicao: RequestWithSession): Promise<Record<string, unknown>> {
    const sessao = sessionOf(requisicao);
    await permitido(sessao.tenantId, sessao.userId, 'tenant.configurar');
    const conexao = await lerConexao(sessao.tenantId);
    return conexao ? paraJson(conexao) : { conexao: null };
  }

  /** Salva a configuração. Sempre em `rascunho`: salvar não liga nada. */
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
   * Muda o estado e/ou a política. **São dois campos e dois registros de
   * auditoria**, e é de propósito: ligar o SSO e exigir o SSO nunca podem ser o
   * mesmo botão.
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
   * Um campo, um botão: para onde este e-mail vai?
   *
   * A resposta é a mesma para e-mail conhecido e desconhecido — só domínio
   * verificado com SSO ativo devolve `sso`, e isso é público porque o cliente
   * escolheu ligar. Sem essa simetria, o endpoint vira catálogo de clientes.
   */
  @Post('descobrir')
  @HttpCode(200)
  async descobrir(@Body() corpo: { email?: string }): Promise<Record<string, unknown>> {
    return { ...(await discoverInbound(corpo.email)) };
  }

  /**
   * Começa o teste da conexão. Exige sessão: quem clica é o admin do cliente, já
   * logado por senha ou pelo Google, e **a sessão dele não é tocada**.
   *
   * Vem antes de `sso/:slug` de propósito — no Nest a primeira rota que casa
   * ganha, e `:slug` casaria com `testar`.
   */
  @Get('sso/testar')
  @WithSession()
  async testar(@Req() request: RequestWithSession, @Res() resposta: Response): Promise<void> {
    const session = sessionOf(request);
    await permitido(session.tenantId, session.userId, 'tenant.configurar');
    // `exigirAtiva: false`: testar uma conexão em rascunho é exatamente o ponto.
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
   * A volta do IdP do cliente. Vem antes de `sso/:slug` pelo mesmo motivo do teste.
   *
   * O tenant sai do COOKIE, não da URL: `state` e o cookie são o par que prova
   * que esta volta pertence àquela ida. Aceitar tenant vindo da query seria
   * deixar quem monta a URL escolher em qual cliente entrar.
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

      // O teste para AQUI. Nada de sessão, nada de cookie novo, nada de conta
      // criada: só o que chegou e o que casaria. É o que torna seguro apontar
      // um IdP novo para um tenant que já tem gente dentro.
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
          // O aviso que evita o chamado de segunda-feira: sem e-mail verificado
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
        cookieOfSession(inbound.token, inbound.expiraEm, optionsOfCookie()),
      ]);
      resposta.redirect(302, destinationAbsolute(desafio.destination, desafio.origin));
    } catch (error) {
      const codigo = codigoDaRecusa(error);
      if (codigo === 'falha_no_provedor') console.error('[api] falha ao entrar por SSO', error);
      resposta.setHeader('set-cookie', apagarDesafio);
      // No teste o admin precisa do motivo; no login de verdade, não.
      if (desafio.test) {
        resposta.status(200).json({ result: 'falhou', codigo, motivo: message(error) });
        return;
      }
      resposta.redirect(302, urlOfError(codigo, desafio.origin));
    }
  }

  /**
   * O link direto por empresa — `app.usepipe.com.br/e/<slug>` cai aqui.
   *
   * É a mesma descoberta feita pela URL em vez do e-mail, e existe para quem tem
   * e-mail pessoal e por isso nunca é descoberto pelo domínio.
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

/** Só diz SE casa, e com quem. É o admin do próprio tenant quem lê. */
async function userWithEmail(tenantId: string, email: string): Promise<string | null> {
  return noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<{ name: string }>(
      sql`select nome from usuario where email = ${email} and ativo limit 1`,
    );
    return rows[0]?.nome ?? null;
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

/** Mesma escolha do `convites.ts`: a permissão é conferida numa transação própria. */
function permitido(tenantId: string, userId: string, codigo: string): Promise<void> {
  return noTenant(tenantId, (tx) => exigirPermission(tx, userId, codigo));
}
