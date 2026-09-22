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
  criarToken,
  entrarComGoogle,
  hashDoToken,
  origemPermitida,
  origensPermitidas,
  sair as encerrarSessao,
  trocarCodigo,
  urlDeAutorizacao,
} from '@pipe/autenticacao';
import type { DesafioDeLogin, OpcoesDeCookie, PessoaDoGoogle } from '@pipe/autenticacao';
import type { Eu, OrigemDeSessao, Plano, RecusaDeEntrada } from '@pipe/contracts';
import { bancoApp, bancoDono, noTenant } from '../banco.js';
import { aceitarConvite } from '../dominio/convites.js';
import {
  cadastroDeContaHabilitado,
  construirContaDoLogin,
} from '../dominio/construtor-de-conta.js';
import type { EntradaPorConvite } from '../dominio/convites.js';
import { ErroPipe } from '../erros.js';
import { ComSessao, lerCookies, sessaoDe, tokenDaSessao } from '../sessao.js';
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
export const COOKIE_DESAFIO = 'pipe_desafio';
const DESAFIO_SEGUNDOS = 300;

/** `Path` do desafio: ele só serve às duas rotas de `/v1/auth`, e não sai delas. */
const CAMINHO_DESAFIO = '/v1/auth';

export function opcoesDeCookie(): OpcoesDeCookie {
  const dominio = process.env['PIPE_COOKIE_DOMINIO'];
  return {
    // `Domain=.usepipe.com.br` é o que faz o cookie emitido por `api.usepipe.com.br` valer
    // em `app.`, `gestao.` e `crm.`. Vazio em desenvolvimento: `Domain=localhost`
    // invalida o cookie em vários navegadores, e o sintoma é login que "não faz nada".
    dominio: dominio && dominio.length > 0 ? dominio : undefined,
    seguro: process.env['PIPE_COOKIE_SEGURO'] !== 'false',
  };
}

function urlDoApp(): string {
  return (process.env['PIPE_URL_APP'] ?? 'http://localhost:3100').replace(/\/$/, '');
}

/**
 * De qual dos três aplicativos saiu este login.
 *
 * São TRÊS fronts em três origens e uma API só. Sem esta pergunta, quem entra
 * pelo CRM volta na Gestão: `PIPE_URL_APP` é um valor único e não tem como ser o
 * certo para os três ao mesmo tempo.
 *
 * A origem vem em `?origem=` e é conferida contra `PIPE_ORIGENS`, a MESMA lista
 * fechada do CORS. Aceitar o que vem na query sem conferir seria transformar o
 * login em redirecionamento aberto: qualquer site mandaria a pessoa ao Google e
 * receberia a volta dela já logada. Origem fora da lista cai em `PIPE_URL_APP`,
 * e o login continua funcionando.
 */
export function baseDoApp(origem: string | undefined): string {
  const limpa = origem?.replace(/\/$/, '');
  return limpa && origemPermitida(limpa, origensPermitidas()) ? limpa : urlDoApp();
}

export function urlDeErro(codigo: RecusaDeEntrada, origem?: string): string {
  const base = baseDoApp(origem);
  // `PIPE_URL_ENTRADA` só decide quando NÃO se sabe de onde a pessoa veio: fixá-la
  // por cima de uma origem conhecida devolveria todo mundo ao mesmo lugar de novo.
  const url = new URL(
    origem ? `${base}/entrar` : (process.env['PIPE_URL_ENTRADA'] ?? `${base}/entrar`),
  );
  url.searchParams.set('erro', codigo);
  return url.toString();
}

/**
 * O destino já foi limitado a caminho interno por `criarDesafio`. Conferir de novo
 * custa uma linha e fecha a porta se algum dia alguém montar o desafio à mão:
 * destino absoluto vira redirecionamento aberto, que é phishing usando o nosso
 * domínio como trampolim.
 */
export function destinoAbsoluto(destino: string, origem?: string): string {
  const interno = destino.startsWith('/') && !destino.startsWith('//') ? destino : '/';
  return `${baseDoApp(origem)}${interno}`;
}

/**
 * O desafio do Pipe é o do provedor MAIS o convite, quando a entrada vem de um.
 *
 * O token do convite viaja no mesmo cookie porque ele precisa sobreviver à ida ao
 * Google e voltar: sem isso, a volta não teria como saber que aquela conta acabou
 * de ser convidada, e cairia na recusa por domínio desconhecido.
 */
export type DesafioComConvite = DesafioDeLogin & {
  convite?: string;
  /** De qual dos três aplicativos saiu o login. É para lá que a volta vai. */
  origem?: string;
  /** O tenant que iniciou o fluxo de SSO. É ele que decide de quem é a pessoa. */
  tenantId?: string;
  /** Fluxo de teste da conexão: valida tudo e NÃO cria sessão. */
  teste?: boolean;
};

export function cookieDoDesafio(desafio: DesafioComConvite | null): string {
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
export function lerDesafio(requisicao: Request): DesafioComConvite | null {
  /* Cada valor recebido com esse nome, e não só o primeiro: quando o `Domain`
     do cookie muda entre duas versões, o navegador passa a mandar os dois, e o
     velho costuma vir na frente. Era isso que derrubava o login sem erro. */
  for (const cru of lerCookies(requisicao.header('cookie'), COOKIE_DESAFIO)) {
    try {
      const objeto = JSON.parse(
        Buffer.from(cru, 'base64url').toString('utf8'),
      ) as DesafioComConvite;
      if (objeto.state && objeto.nonce && objeto.verificadorPkce) return objeto;
    } catch {
      // valor ilegível: tenta o próximo
    }
  }
  return null;
}

/** Traduz o erro para um código do contrato. É o que a tela de entrada sabe ler. */
export function codigoDaRecusa(erro: unknown): RecusaDeEntrada {
  if (erro instanceof EntradaRecusada) {
    // Conta do provedor que já é de outro cliente: para quem está entrando é a
    // mesma coisa que não ter sido convidado, e dizer mais contaria que aquele
    // e-mail existe em outra empresa do Pipe.
    return erro.codigo === 'outro_tenant' ? 'sem_convite' : erro.codigo;
  }
  if (erro instanceof LoginErro && erro.codigo === 'email_nao_verificado') {
    return 'email_nao_verificado';
  }
  // Convite vencido, já usado, de outro e-mail, ou conta do Google que já é de
  // outra pessoa: para quem está entrando é tudo a mesma coisa — o convite não
  // serve, peça outro. `sem_convite` é o código que a tela já sabe explicar.
  if (erro instanceof ErroPipe && erro.status !== 500) return 'sem_convite';
  // Todo o resto — `state` errado, troca de código falhada, config ausente — é
  // problema nosso ou do provedor, e para quem está entrando a saída é uma só:
  // tentar de novo.
  return 'falha_no_provedor';
}

export function textoDaQuery(requisicao: Request, campo: string): string | undefined {
  const valor = requisicao.query[campo];
  return typeof valor === 'string' ? valor : undefined;
}

/** A origem pedida, sem a barra final. Quem a confere é `baseDoApp`. */
export function origemDaQuery(requisicao: Request): string | undefined {
  const crua = textoDaQuery(requisicao, 'origem');
  return crua ? crua.replace(/\/$/, '') : undefined;
}

/**
 * Aceita o convite com a identidade do Google em mãos e devolve a sessão.
 *
 * O `if` existe para o tipo, não para o caso: `aceitarConvite` sempre abre sessão
 * quando recebe a pessoa. Virar 500 aqui seria melhor do que redirecionar como se
 * tivesse dado certo.
 */
async function entrarPorConvite(
  token: string,
  pessoa: PessoaDoGoogle,
  contexto: { ip?: string; agente?: string },
): Promise<EntradaPorConvite> {
  const aceito = await aceitarConvite(token, pessoa, contexto);
  if (!aceito.sessao) throw new Error('convite aceito sem abrir sessão');
  return aceito.sessao;
}

@Controller('v1/auth')
export class ControladorEntrada {
  /**
   * Login SÓ DE DESENVOLVIMENTO, sem Google.
   *
   * Existe para ver as telas em `localhost` quando não há OAuth configurado.
   * **Barrado fora de desenvolvimento**: com `NODE_ENV === 'production'` responde
   * 404, como se a rota não existisse. Nunca é porta de verdade — a porta de
   * verdade é `google`/`sso`. Emite uma sessão real para um usuário já semeado.
   *
   * Uso: abrir no navegador
   * `/v1/auth/dev?email=ana.ribeiro@demo.pipe.app&origem=http://localhost:3200`.
   */
  @Get('dev')
  async dev(@Req() requisicao: Request, @Res() resposta: Response): Promise<void> {
    if (process.env['NODE_ENV'] === 'production') {
      resposta.status(404).end();
      return;
    }
    const email = (textoDaQuery(requisicao, 'email') ?? 'ana.ribeiro@demo.pipe.app')
      .trim()
      .toLowerCase();
    const { rows } = await bancoDono().execute<{ id: string; tenant_id: string }>(sql`
      select id, tenant_id from usuario where lower(email) = ${email} limit 1
    `);
    const u = rows[0];
    if (!u) {
      resposta
        .status(404)
        .end(`sem usuário "${email}" — rode o seed (pnpm banco:semear && pnpm seed:demo)`);
      return;
    }
    const novo = criarToken();
    await bancoDono().execute(sql`
      insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
      values (${u.tenant_id}::uuid, ${u.id}::uuid, ${novo.hash}, ${novo.expiraEm}, 'senha')
    `);
    resposta.setHeader('set-cookie', cookieDeSessao(novo.token, novo.expiraEm, opcoesDeCookie()));
    const permitidas = origensPermitidas();
    const origem = origemDaQuery(requisicao);
    const base =
      origem && permitidas.includes(origem) ? origem : (permitidas[0] ?? 'http://localhost:3200');
    resposta.redirect(302, `${base}/`);
  }

  /**
   * Começa o login: cria o desafio, guarda em cookie e manda para o Google.
   *
   * `?convite=<token>` é a entrada de quem foi convidado e cujo domínio ainda não
   * está verificado. Sem ele, esse login morreria em `dominio_desconhecido` — a
   * segunda pergunta da entrada não tem como saber de que cliente é a pessoa.
   */
  @Get('google')
  ir(@Req() requisicao: Request, @Res() resposta: Response): void {
    let config;
    try {
      config = configDoAmbiente();
    } catch {
      resposta.redirect(302, urlDeErro('falha_no_provedor', origemDaQuery(requisicao)));
      return;
    }

    const convite = textoDaQuery(requisicao, 'convite');
    const origem = origemDaQuery(requisicao);
    const desafio: DesafioComConvite = {
      ...criarDesafio(textoDaQuery(requisicao, 'destino') ?? '/'),
      ...(convite ? { convite } : {}),
      ...(origem ? { origem } : {}),
    };
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
      //
      // O log não é ruído: este caminho devolve a MESMA tela de "falha no
      // provedor" que um erro de rede, e sem rastro não dá para saber qual dos
      // dois aconteceu — foi o que atrasou um diagnóstico aqui.
      console.error(
        '[api] retorno sem cookie de desafio',
        JSON.stringify({ cookies: (requisicao.header('cookie') ?? '').split(';').length }),
      );
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
      const contexto = { ip: requisicao.ip, agente: requisicao.header('user-agent') };
      // Com convite no desafio, é o convite que decide o tenant e liga a conta do
      // Google — e não o domínio. É a única porta de quem não tem domínio verificado.
      const entrada = desafio.convite
        ? await entrarPorConvite(desafio.convite, pessoa, contexto)
        : await entrarComGoogle(
            bancoDono(),
            bancoApp(),
            pessoa,
            contexto,
            // Com o autosserviço desligado (o padrão), nada muda: quem não tem
            // convite nem domínio verificado continua recusado. Ligado, a conta
            // nasce aqui e a Gestão recebe a pessoa na tela de boas-vindas.
            cadastroDeContaHabilitado()
              ? (quem) =>
                  construirContaDoLogin({ email: quem.email, nome: quem.nome }).then((conta) => ({
                    tenantId: conta.tenantId,
                    usuarioId: conta.usuarioId,
                  }))
              : undefined,
          );
      resposta.setHeader('set-cookie', [
        apagarDesafio,
        cookieDeSessao(entrada.token, entrada.expiraEm, opcoesDeCookie()),
      ]);
      resposta.redirect(302, destinoAbsoluto(desafio.destino, desafio.origem));
    } catch (erro) {
      const codigo = codigoDaRecusa(erro);
      if (codigo === 'falha_no_provedor') console.error('[api] falha ao entrar', erro);
      resposta.setHeader('set-cookie', apagarDesafio);
      resposta.redirect(302, urlDeErro(codigo, desafio.origem));
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
  onboarding_concluido_em: Date | string | null;
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
               t.id as tenant_id, t.nome as tenant_nome, t.slug, t.plano,
               t.onboarding_concluido_em
          from usuario u
          join tenant t on t.id = u.tenant_id
         where u.id = ${sessao.usuarioId}::uuid and u.ativo
         limit 1
      `);
      const usuario = rows[0];
      if (!usuario) return null;

      // As permissões são a UNIÃO dos papéis da pessoa, com a EXCEÇÃO por
      // pessoa por cima (`usuario_permissao`, migração 0046 — a tela
      // "Permissões" do atendente): o `union` traz o que o papel dá mais o que
      // foi LIGADO na mão, e o `not exists` tira o que foi DESLIGADO na mão.
      // É a mesma conta do `coalesce` de `exigirPermissao`, escrita em conjunto
      // porque aqui a resposta é a lista, e não um código de cada vez.
      // `distinct` porque dois papéis repetem permissão o tempo todo, e a tela
      // não quer o duplicado. Em série, nunca em `Promise.all`: paralelo dentro
      // da transação derruba o `pipe.tenant_id` e a consulta passa a rodar sem
      // tenant.
      const { rows: permissoes } = await tx.execute<{ codigo: string }>(sql`
        select codigo from (
          select distinct pp.permissao_codigo as codigo
            from usuario_papel up
            join papel_permissao pp on pp.papel_id = up.papel_id
           where up.usuario_id = ${sessao.usuarioId}::uuid
          union
          select uperm.permissao_codigo as codigo
            from usuario_permissao uperm
           where uperm.usuario_id = ${sessao.usuarioId}::uuid and uperm.concedida
        ) efetivas
         where not exists (
           select 1 from usuario_permissao negada
            where negada.usuario_id = ${sessao.usuarioId}::uuid
              and negada.permissao_codigo = efetivas.codigo
              and not negada.concedida
         )
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
        onboardingConcluido: usuario.onboarding_concluido_em !== null,
      },
      permissoes,
      origem: sessao.origem as OrigemDeSessao,
    };
  }
}
