import { Body, Controller, Get, HttpCode, Param, Post, Put, Req, Res } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import {
  cookieDeSessao,
  criarDesafio,
  entrarComSso,
  trocarCodigoOidc,
  urlDeAutorizacaoOidc,
} from '@pipe/autenticacao';
import { bancoApp, bancoDono, noTenant } from '../banco.js';
import { ComSessao, exigirPermissao, sessaoDe } from '../sessao.js';
import type { RequisicaoComSessao } from '../sessao.js';
import {
  codigoDaRecusa,
  cookieDoDesafio,
  destinoAbsoluto,
  lerDesafio,
  opcoesDeCookie,
  textoDaQuery,
  urlDeErro,
} from './entrar.js';
import type { DesafioComConvite } from './entrar.js';
import {
  conexaoParaFluxo,
  definirEstado,
  descobrirEntrada,
  lerConexao,
  marcarTestada,
  salvarConexao,
  tenantPorSlug,
} from '../dominio/sso.js';

/**
 * SSO por tenant: configurar, testar, e entrar.
 *
 * O núcleo — descoberta, PKCE, verificação do `id_token`, resolução de conta —
 * mora em `@pipe/autenticacao` e não se repete aqui. Este arquivo é a casca HTTP,
 * igual ao `entrar.ts`, e reaproveita o cookie de desafio dele: é o mesmo
 * mecanismo, com dois campos a mais.
 *
 * **A rota que faz o produto funcionar é `GET /v1/auth/sso/testar`.** Ela roda o
 * fluxo inteiro contra o IdP do cliente e **não cria sessão**: devolve os claims
 * que chegaram e o que casou. É o que permite ligar o SSO sem quebrar o login de
 * quem já está dentro — e é a única coisa que destrava o estado `ativa`.
 */

@Controller('v1/sso')
export class ControladorConexaoSso {
  /** A conexão do tenant, sem segredo nenhum. Mostra também o que colar no IdP. */
  @Get()
  @ComSessao()
  async ver(@Req() requisicao: RequisicaoComSessao): Promise<Record<string, unknown>> {
    const sessao = sessaoDe(requisicao);
    await permitido(sessao.tenantId, sessao.usuarioId, 'tenant.configurar');
    const conexao = await lerConexao(sessao.tenantId);
    return conexao ? paraJson(conexao) : { conexao: null };
  }

  /** Salva a configuração. Sempre em `rascunho`: salvar não liga nada. */
  @Put()
  @ComSessao()
  async salvar(
    @Req() requisicao: RequisicaoComSessao,
    @Body() corpo: Record<string, string | undefined>,
  ): Promise<Record<string, unknown>> {
    const sessao = sessaoDe(requisicao);
    await permitido(sessao.tenantId, sessao.usuarioId, 'tenant.configurar');
    return paraJson(await salvarConexao(sessao.tenantId, sessao.usuarioId, corpo));
  }

  /**
   * Muda o estado e/ou a política. **São dois campos e dois registros de
   * auditoria**, e é de propósito: ligar o SSO e exigir o SSO nunca podem ser o
   * mesmo botão.
   */
  @Post('estado')
  @HttpCode(200)
  @ComSessao()
  async estado(
    @Req() requisicao: RequisicaoComSessao,
    @Body() corpo: { estado?: string; politica?: string },
  ): Promise<Record<string, unknown>> {
    const sessao = sessaoDe(requisicao);
    await permitido(sessao.tenantId, sessao.usuarioId, 'tenant.configurar');
    return paraJson(await definirEstado(sessao.tenantId, sessao.usuarioId, corpo));
  }
}

@Controller('v1/auth')
export class ControladorEntradaSso {
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
    return { ...(await descobrirEntrada(corpo.email)) };
  }

  /**
   * Começa o teste da conexão. Exige sessão: quem clica é o admin do cliente, já
   * logado por senha ou pelo Google, e **a sessão dele não é tocada**.
   *
   * Vem antes de `sso/:slug` de propósito — no Nest a primeira rota que casa
   * ganha, e `:slug` casaria com `testar`.
   */
  @Get('sso/testar')
  @ComSessao()
  async testar(@Req() requisicao: RequisicaoComSessao, @Res() resposta: Response): Promise<void> {
    const sessao = sessaoDe(requisicao);
    await permitido(sessao.tenantId, sessao.usuarioId, 'tenant.configurar');
    // `exigirAtiva: false`: testar uma conexão em rascunho é exatamente o ponto.
    const fluxo = await conexaoParaFluxo(sessao.tenantId, { exigirAtiva: false });
    const desafio: DesafioComConvite = {
      ...criarDesafio('/'),
      tenantId: sessao.tenantId,
      teste: true,
    };
    resposta.setHeader('set-cookie', cookieDoDesafio(desafio));
    resposta.redirect(302, urlDeAutorizacaoOidc(fluxo.config, fluxo.descoberta, desafio));
  }

  /**
   * A volta do IdP do cliente. Vem antes de `sso/:slug` pelo mesmo motivo do teste.
   *
   * O tenant sai do COOKIE, não da URL: `state` e o cookie são o par que prova
   * que esta volta pertence àquela ida. Aceitar tenant vindo da query seria
   * deixar quem monta a URL escolher em qual cliente entrar.
   */
  @Get('sso/retorno')
  async retorno(@Req() requisicao: Request, @Res() resposta: Response): Promise<void> {
    const apagarDesafio = cookieDoDesafio(null);
    const desafio = lerDesafio(requisicao);
    if (!desafio?.tenantId) {
      resposta.setHeader('set-cookie', apagarDesafio);
      resposta.redirect(302, urlDeErro('falha_no_provedor'));
      return;
    }

    try {
      const fluxo = await conexaoParaFluxo(desafio.tenantId, { exigirAtiva: !desafio.teste });
      const pessoa = await trocarCodigoOidc(fluxo.config, fluxo.descoberta, desafio, {
        code: textoDaQuery(requisicao, 'code'),
        state: textoDaQuery(requisicao, 'state'),
        error: textoDaQuery(requisicao, 'error'),
      });

      resposta.setHeader('set-cookie', apagarDesafio);

      // O teste para AQUI. Nada de sessão, nada de cookie novo, nada de conta
      // criada: só o que chegou e o que casaria. É o que torna seguro apontar
      // um IdP novo para um tenant que já tem gente dentro.
      if (desafio.teste) {
        await marcarTestada(desafio.tenantId);
        resposta.status(200).json({
          resultado: 'ok',
          emissor: pessoa.emissor,
          sujeito: pessoa.sujeito,
          email: pessoa.email,
          emailVerificado: pessoa.emailVerificado,
          nome: pessoa.nome ?? null,
          casaComUsuario: await usuarioComEmail(desafio.tenantId, pessoa.email),
          // O aviso que evita o chamado de segunda-feira: sem e-mail verificado
          // o login real recusa, mesmo com o teste "passando".
          aviso: pessoa.emailVerificado
            ? null
            : 'O provedor não confirmou o e-mail. No Entra ID, habilite o claim opcional `xms_edov`.',
        });
        return;
      }

      const entrada = await entrarComSso(
        bancoDono(),
        bancoApp(),
        pessoa,
        desafio.tenantId,
        { ip: requisicao.ip, agente: requisicao.header('user-agent') },
      );
      resposta.setHeader('set-cookie', [
        apagarDesafio,
        cookieDeSessao(entrada.token, entrada.expiraEm, opcoesDeCookie()),
      ]);
      resposta.redirect(302, destinoAbsoluto(desafio.destino));
    } catch (erro) {
      const codigo = codigoDaRecusa(erro);
      if (codigo === 'falha_no_provedor') console.error('[api] falha ao entrar por SSO', erro);
      resposta.setHeader('set-cookie', apagarDesafio);
      // No teste o admin precisa do motivo; no login de verdade, não.
      if (desafio.teste) {
        resposta.status(200).json({ resultado: 'falhou', codigo, motivo: mensagem(erro) });
        return;
      }
      resposta.redirect(302, urlDeErro(codigo));
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
      const tenantId = await tenantPorSlug(slug);
      const fluxo = await conexaoParaFluxo(tenantId, { exigirAtiva: true });
      const desafio: DesafioComConvite = {
        ...criarDesafio(textoDaQuery(requisicao, 'destino') ?? '/'),
        tenantId,
      };
      resposta.setHeader('set-cookie', cookieDoDesafio(desafio));
      resposta.redirect(302, urlDeAutorizacaoOidc(fluxo.config, fluxo.descoberta, desafio));
    } catch (erro) {
      console.error('[api] falha ao iniciar SSO', erro);
      resposta.redirect(302, urlDeErro('falha_no_provedor'));
    }
  }
}

function mensagem(erro: unknown): string {
  return erro instanceof Error ? erro.message : 'Falha desconhecida.';
}

/** Só diz SE casa, e com quem. É o admin do próprio tenant quem lê. */
async function usuarioComEmail(tenantId: string, email: string): Promise<string | null> {
  return noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<{ nome: string }>(
      sql`select nome from usuario where email = ${email} and ativo limit 1`,
    );
    return rows[0]?.nome ?? null;
  });
}

function paraJson(conexao: Awaited<ReturnType<typeof lerConexao>>): Record<string, unknown> {
  if (!conexao) return { conexao: null };
  return {
    id: conexao.id,
    provedor: conexao.provedor,
    emissor: conexao.emissor,
    clienteId: conexao.clienteId,
    estado: conexao.estado,
    politica: conexao.politica,
    testadaEm: conexao.testadaEm?.toISOString() ?? null,
    ativadaEm: conexao.ativadaEm?.toISOString() ?? null,
    urlDeRetorno: conexao.urlDeRetorno,
  };
}

/** Mesma escolha do `convites.ts`: a permissão é conferida numa transação própria. */
function permitido(tenantId: string, usuarioId: string, codigo: string): Promise<void> {
  return noTenant(tenantId, (tx) => exigirPermissao(tx, usuarioId, codigo));
}
