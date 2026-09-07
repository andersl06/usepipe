import { Controller, Get, Post, Req, Res } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import {
  EntradaRecusada,
  LoginErro,
  configDoAmbiente,
  cookieDeSaida,
  cookieDeSessao,
  criarDesafio,
  entrarComGoogle,
  hashDoToken,
  sair as encerrarSessao,
  trocarCodigo,
  urlDeAutorizacao,
} from '@pipe/autenticacao';
import type { DesafioDeLogin, OpcoesDeCookie } from '@pipe/autenticacao';
import type { Eu, OrigemDeSessao, Plano, RecusaDeEntrada } from '@pipe/contracts';
import { bancoApp, bancoDono, noTenant } from '../banco.js';
import { ErroPipe } from '../erros.js';
import { ComSessao, lerCookie, sessaoDe, tokenDaSessao } from '../sessao.js';
import type { RequisicaoComSessao } from '../sessao.js';

/**
 * Entrar, saber quem entrou e sair.
 *
 * O núcleo — desafio, PKCE, verificação do `id_token`, resolução de tenant, sessão —
 * mora em `@pipe/autenticacao` e não se repete aqui. Este arquivo é só a casca HTTP:
 * cookie, redirecionamento e o formato da resposta.
 *
 * A regra que molda tudo: **erro de entrada nunca vira 500 na cara da pessoa.** Quem
 * está entrando não tem o que fazer com um stack trace. Toda falha vira um
 * redirecionamento para a tela de entrada com `?erro=<codigo>`, e o código sai do
 * catálogo `RECUSAS_DE_ENTRADA` do contrato — a tela escolhe o texto e a saída.
 */

/** Onde o desafio espera a volta do Google. Cinco minutos é a vida útil de um login. */
const COOKIE_DESAFIO = 'pipe_desafio';
const DESAFIO_SEGUNDOS = 300;

/** `Path` do desafio: ele só serve às duas rotas de `/v1/auth`, e não sai delas. */
const CAMINHO_DESAFIO = '/v1/auth';

export function opcoesDeCookie(): OpcoesDeCookie {
  const dominio = process.env['PIPE_COOKIE_DOMINIO'];
  return {
    // `Domain=.pipe.com.br` é o que faz o cookie emitido por `api.pipe.com.br` valer
    // em `app.`, `gestao.` e `crm.`. Vazio em desenvolvimento: `Domain=localhost`
    // invalida o cookie em vários navegadores, e o sintoma é login que "não faz nada".
    dominio: dominio && dominio.length > 0 ? dominio : undefined,
    seguro: process.env['PIPE_COOKIE_SEGURO'] !== 'false',
  };
}

function urlDoApp(): string {
  return (process.env['PIPE_URL_APP'] ?? 'http://localhost:3000').replace(/\/$/, '');
}

function urlDeErro(codigo: RecusaDeEntrada): string {
  const url = new URL(process.env['PIPE_URL_ENTRADA'] ?? `${urlDoApp()}/entrar`);
  url.searchParams.set('erro', codigo);
  return url.toString();
}

/**
 * O destino já foi limitado a caminho interno por `criarDesafio`. Conferir de novo
 * custa uma linha e fecha a porta se algum dia alguém montar o desafio à mão:
 * destino absoluto vira redirecionamento aberto, que é phishing usando o nosso
 * domínio como trampolim.
 */
function destinoAbsoluto(destino: string): string {
  const interno = destino.startsWith('/') && !destino.startsWith('//') ? destino : '/';
  return `${urlDoApp()}${interno}`;
}

function cookieDoDesafio(desafio: DesafioDeLogin | null): string {
  const opcoes = opcoesDeCookie();
  const valor = desafio ? Buffer.from(JSON.stringify(desafio)).toString('base64url') : '';
  const partes = [
    `${COOKIE_DESAFIO}=${valor}`,
    `Path=${CAMINHO_DESAFIO}`,
    'HttpOnly',
    // `Lax`, e não `Strict`: a volta do Google é navegação de topo vinda de outro
    // site. Com `Strict` o cookie não acompanha, e o login falha sempre.
    'SameSite=Lax',
    `Max-Age=${desafio ? DESAFIO_SEGUNDOS : 0}`,
  ];
  if (opcoes.dominio) partes.push(`Domain=${opcoes.dominio}`);
  if (opcoes.seguro ?? true) partes.push('Secure');
  return partes.join('; ');
}

/**
 * O desafio vai em cookie sem assinatura nossa, e isso é deliberado: ele não afirma
 * nada: é o outro lado do `state`/`nonce`/PKCE que já viajaram para o Google, e a
 * verificação é o cookie bater com o que volta de lá. Assinar protegeria contra o
 * próprio dono do navegador forjar o próprio login — que é o que ele já pode fazer.
 * `HttpOnly` mantém o valor fora do alcance de script, que é o que importa.
 */
function lerDesafio(requisicao: Request): DesafioDeLogin | null {
  const cru = lerCookie(requisicao.header('cookie'), COOKIE_DESAFIO);
  if (!cru) return null;
  try {
    const objeto = JSON.parse(Buffer.from(cru, 'base64url').toString('utf8')) as DesafioDeLogin;
    if (!objeto.state || !objeto.nonce || !objeto.verificadorPkce) return null;
    return objeto;
  } catch {
    return null;
  }
}

/** Traduz o erro para um código do contrato. É o que a tela de entrada sabe ler. */
export function codigoDaRecusa(erro: unknown): RecusaDeEntrada {
  if (erro instanceof EntradaRecusada) return erro.codigo;
  if (erro instanceof LoginErro && erro.codigo === 'email_nao_verificado') {
    return 'email_nao_verificado';
  }
  // Todo o resto — `state` errado, troca de código falhada, config ausente — é
  // problema nosso ou do provedor, e para quem está entrando a saída é uma só:
  // tentar de novo.
  return 'falha_no_provedor';
}

function textoDaQuery(requisicao: Request, campo: string): string | undefined {
  const valor = requisicao.query[campo];
  return typeof valor === 'string' ? valor : undefined;
}

@Controller('v1/auth')
export class ControladorEntrada {
  /** Começa o login: cria o desafio, guarda em cookie e manda para o Google. */
  @Get('google')
  ir(@Req() requisicao: Request, @Res() resposta: Response): void {
    let config;
    try {
      config = configDoAmbiente();
    } catch {
      resposta.redirect(302, urlDeErro('falha_no_provedor'));
      return;
    }

    const desafio = criarDesafio(textoDaQuery(requisicao, 'destino') ?? '/');
    resposta.setHeader('set-cookie', cookieDoDesafio(desafio));
    resposta.redirect(302, urlDeAutorizacao(config, desafio));
  }

  /** A volta do Google. Daqui a pessoa sai logada ou sai com um código de recusa. */
  @Get('google/retorno')
  async retorno(@Req() requisicao: Request, @Res() resposta: Response): Promise<void> {
    const apagarDesafio = cookieDoDesafio(null);
    const desafio = lerDesafio(requisicao);
    if (!desafio) {
      // Sem cookie o login não tem como ser conferido: pode ser aba velha, cookie
      // bloqueado ou tentativa forjada. Nos três casos a saída é recomeçar.
      resposta.setHeader('set-cookie', apagarDesafio);
      resposta.redirect(302, urlDeErro('falha_no_provedor'));
      return;
    }

    try {
      const pessoa = await trocarCodigo(configDoAmbiente(), desafio, {
        code: textoDaQuery(requisicao, 'code'),
        state: textoDaQuery(requisicao, 'state'),
        error: textoDaQuery(requisicao, 'error'),
      });
      const entrada = await entrarComGoogle(bancoDono(), bancoApp(), pessoa, {
        ip: requisicao.ip,
        agente: requisicao.header('user-agent'),
      });
      resposta.setHeader('set-cookie', [
        apagarDesafio,
        cookieDeSessao(entrada.token, entrada.expiraEm, opcoesDeCookie()),
      ]);
      resposta.redirect(302, destinoAbsoluto(desafio.destino));
    } catch (erro) {
      const codigo = codigoDaRecusa(erro);
      if (codigo === 'falha_no_provedor') console.error('[api] falha ao entrar', erro);
      resposta.setHeader('set-cookie', apagarDesafio);
      resposta.redirect(302, urlDeErro(codigo));
    }
  }

  /** Encerra a sessão e apaga o cookie. Sair duas vezes não é erro. */
  @Post('sair')
  async sair(@Req() requisicao: Request, @Res() resposta: Response): Promise<void> {
    const token = tokenDaSessao(requisicao);
    if (token) await encerrarSessao(bancoDono(), hashDoToken(token));
    resposta.setHeader('set-cookie', cookieDeSaida(opcoesDeCookie()));
    resposta.status(204).end();
  }
}

type LinhaEu = {
  id: string;
  nome: string;
  email: string;
  avatar_url: string | null;
  tenant_id: string;
  tenant_nome: string;
  slug: string;
  plano: string;
};

@Controller('v1')
export class ControladorEu {
  /** Quem está logado, no formato do contrato `Eu`. É a fonte de verdade das telas. */
  @Get('eu')
  @ComSessao()
  async eu(@Req() requisicao: RequisicaoComSessao): Promise<Eu> {
    const sessao = sessaoDe(requisicao);

    const encontrado = await noTenant(sessao.tenantId, async (tx) => {
      const { rows } = await tx.execute<LinhaEu>(sql`
        select u.id, u.nome, u.email, u.avatar_url,
               t.id as tenant_id, t.nome as tenant_nome, t.slug, t.plano
          from usuario u
          join tenant t on t.id = u.tenant_id
         where u.id = ${sessao.usuarioId}::uuid and u.ativo
         limit 1
      `);
      const usuario = rows[0];
      if (!usuario) return null;

      // As permissões são a UNIÃO dos papéis da pessoa. `distinct` porque dois
      // papéis repetem permissão o tempo todo, e a tela não quer o duplicado.
      // Em série, nunca em `Promise.all`: paralelo dentro da transação derruba o
      // `pipe.tenant_id` e a consulta passa a rodar sem tenant.
      const { rows: permissoes } = await tx.execute<{ codigo: string }>(sql`
        select distinct pp.permissao_codigo as codigo
          from usuario_papel up
          join papel_permissao pp on pp.papel_id = up.papel_id
         where up.usuario_id = ${sessao.usuarioId}::uuid
         order by 1
      `);

      return { usuario, permissoes: permissoes.map((p) => p.codigo) };
    });

    // Sessão viva apontando para usuário que sumiu ou foi desativado entre um
    // pedido e outro: é recusa, não 500.
    if (!encontrado) throw ErroPipe.naoAutorizado('Sessão ausente ou expirada.');

    const { usuario, permissoes } = encontrado;
    return {
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        avatarUrl: usuario.avatar_url,
      },
      tenant: {
        id: usuario.tenant_id,
        nome: usuario.tenant_nome,
        slug: usuario.slug,
        plano: usuario.plano as Plano,
      },
      permissoes,
      origem: sessao.origem as OrigemDeSessao,
    };
  }
}

