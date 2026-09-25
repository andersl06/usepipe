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
  sair as encerrarSessao,
  exchangeCode,
  urlOfAuthorization,
} from '@pipe/authentication';
import type { DesafioDeLogin, OptionsOfCookie, PessoaDoGoogle } from '@pipe/authentication';
import type { Eu, OriginOfSession, Plano, RefusesOfInbound } from '@pipe/contracts';
import { databaseApp, databaseOwner, noTenant } from '../database.js';
import { aceitarInvitation } from '../domain/convites.js';
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

/** Onde o desafio espera a volta do Google. Cinco minutos é a vida útil de um login. */
export const COOKIE_DESAFIO = 'pipe_challenge';
const DESAFIO_SEGUNDOS = 300;

/** `Path` do desafio: ele só serve às duas rotas de `/v1/auth`, e não sai delas. */
const CAMINHO_DESAFIO = '/v1/auth';

export function optionsOfCookie(): OptionsOfCookie {
  const domain = process.env['PIPE_COOKIE_DOMINIO'];
  return {
    // `Domain=.usepipe.com.br` é o que faz o cookie emitido por `api.usepipe.com.br` valer
    // em `app.`, `gestao.` e `crm.`. Vazio em desenvolvimento: `Domain=localhost`
    // invalida o cookie em vários navegadores, e o sintoma é login que "não faz nada".
    domain: domain && domain.length > 0 ? domain : undefined,
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

export function urlOfError(codigo: RefusesOfInbound, origem?: string): string {
  const base = baseDoApp(origem);
  // `PIPE_URL_ENTRADA` só decide quando NÃO se sabe de onde a pessoa veio: fixá-la
  // por cima de uma origem conhecida devolveria todo mundo ao mesmo lugar de novo.
  const url = new URL(
    origem ? `${base}/entrar` : (process.env['PIPE_URL_ENTRADA'] ?? `${base}/entrar`),
  );
  url.searchParams.set('error', codigo);
  return url.toString();
}

/**
 * O destino já foi limitado a caminho interno por `criarDesafio`. Conferir de novo
 * custa uma linha e fecha a porta se algum dia alguém montar o desafio à mão:
 * destino absoluto vira redirecionamento aberto, que é phishing usando o nosso
 * domínio como trampolim.
 */
export function destinationAbsolute(destination: string, origem?: string): string {
  const interno = destination.startsWith('/') && !destination.startsWith('//') ? destination : '/';
  return `${baseDoApp(origem)}${interno}`;
}

/**
 * O desafio do Pipe é o do provedor MAIS o convite, quando a entrada vem de um.
 *
 * O token do convite viaja no mesmo cookie porque ele precisa sobreviver à ida ao
 * Google e voltar: sem isso, a volta não teria como saber que aquela conta acabou
 * de ser convidada, e cairia na recusa por domínio desconhecido.
 */
export type ChallengeWithInvitation = DesafioDeLogin & {
  invitation?: string;
  /** De qual dos três aplicativos saiu o login. É para lá que a volta vai. */
  origin?: string;
  /** O tenant que iniciou o fluxo de SSO. É ele que decide de quem é a pessoa. */
  tenantId?: string;
  /** Fluxo de teste da conexão: valida tudo e NÃO cria sessão. */
  test?: boolean;
};

export function cookieDoDesafio(desafio: ChallengeWithInvitation | null): string {
  const options = optionsOfCookie();
  const value = desafio ? Buffer.from(JSON.stringify(desafio)).toString('base64url') : '';
  const partes = [
    `${COOKIE_DESAFIO}=${value}`,
    `Path=${CAMINHO_DESAFIO}`,
    'HttpOnly',
    // `Lax`, e não `Strict`: a volta do Google é navegação de topo vinda de outro
    // site. Com `Strict` o cookie não acompanha, e o login falha sempre.
    'SameSite=Lax',
    `Max-Age=${desafio ? DESAFIO_SEGUNDOS : 0}`,
  ];
  if (options.domain) partes.push(`Domain=${options.domain}`);
  if (options.seguro ?? true) partes.push('Secure');
  return partes.join('; ');
}

/**
 * O desafio vai em cookie sem assinatura nossa, e isso é deliberado: ele não afirma
 * nada: é o outro lado do `state`/`nonce`/PKCE que já viajaram para o Google, e a
 * verificação é o cookie bater com o que volta de lá. Assinar protegeria contra o
 * próprio dono do navegador forjar o próprio login — que é o que ele já pode fazer.
 * `HttpOnly` mantém o valor fora do alcance de script, que é o que importa.
 */
export function lerDesafio(request: Request): ChallengeWithInvitation | null {
  /* Cada valor recebido com esse nome, e não só o primeiro: quando o `Domain`
     do cookie muda entre duas versões, o navegador passa a mandar os dois, e o
     velho costuma vir na frente. Era isso que derrubava o login sem erro. */
  for (const cru of lerCookies(request.header('cookie'), COOKIE_DESAFIO)) {
    try {
      const objeto = JSON.parse(
        Buffer.from(cru, 'base64url').toString('utf8'),
      ) as ChallengeWithInvitation;
      if (objeto.state && objeto.nonce && objeto.verificadorPkce) return objeto;
    } catch {
      // valor ilegível: tenta o próximo
    }
  }
  return null;
}

/** Traduz o erro para um código do contrato. É o que a tela de entrada sabe ler. */
export function codigoDaRecusa(error: unknown): RefusesOfInbound {
  if (error instanceof InboundRefused) {
    // Conta do provedor que já é de outro cliente: para quem está entrando é a
    // mesma coisa que não ter sido convidado, e dizer mais contaria que aquele
    // e-mail existe em outra empresa do Pipe.
    return error.codigo === 'outro_tenant' ? 'without_invitation' : error.codigo;
  }
  if (error instanceof LoginError && error.codigo === 'email_nao_verificado') {
    return 'email_nao_verificado';
  }
  // Convite vencido, já usado, de outro e-mail, ou conta do Google que já é de
  // outra pessoa: para quem está entrando é tudo a mesma coisa — o convite não
  // serve, peça outro. `sem_convite` é o código que a tela já sabe explicar.
  if (error instanceof PipeError && error.status !== 500) return 'without_invitation';
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
async function loginByInvitation(
  token: string,
  pessoa: PessoaDoGoogle,
  context: { ip?: string; agente?: string },
): Promise<InboundByInvitation> {
  const aceito = await aceitarInvitation(token, pessoa, context);
  if (!aceito.session) throw new Error('convite aceito sem abrir sessão');
  return aceito.session;
}

@Controller('v1/auth')
export class LoginController {
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
      resposta.redirect(302, urlOfError('falha_no_provedor', origemDaQuery(requisicao)));
      return;
    }

    const invitation = textoDaQuery(requisicao, 'convite');
    const origem = origemDaQuery(requisicao);
    const desafio: ChallengeWithInvitation = {
      ...createChallenge(textoDaQuery(requisicao, 'destino') ?? '/'),
      ...(invitation ? { invitation } : {}),
      ...(origem ? { origem } : {}),
    };
    resposta.setHeader('set-cookie', cookieDoDesafio(desafio));
    resposta.redirect(302, urlOfAuthorization(config, desafio));
  }

  /** A volta do Google. Daqui a pessoa sai logada ou sai com um código de recusa. */
  @Get('google/callback')
  async callback(@Req() requisicao: Request, @Res() resposta: Response): Promise<void> {
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
      // Com convite no desafio, é o convite que decide o tenant e liga a conta do
      // Google — e não o domínio. É a única porta de quem não tem domínio verificado.
      const inbound = desafio.invitation
        ? await loginByInvitation(desafio.invitation, pessoa, context)
        : await loginWithGoogle(
            databaseOwner(),
            databaseApp(),
            pessoa,
            context,
            // Com o autosserviço desligado (o padrão), nada muda: quem não tem
            // convite nem domínio verificado continua recusado. Ligado, a conta
            // nasce aqui e a Gestão recebe a pessoa na tela de boas-vindas.
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
        sessionCookie(cookieOfSession(inbound.token, inbound.expiraEm, optionsOfCookie())),
      ]);
      resposta.redirect(302, destinationAbsolute(desafio.destination, desafio.origin));
    } catch (erro) {
      const codigo = codigoDaRecusa(erro);
      if (codigo === 'falha_no_provedor') console.error('[api] falha ao entrar', erro);
      resposta.setHeader('set-cookie', apagarDesafio);
      resposta.redirect(302, urlOfError(codigo, desafio.origin));
    }
  }

  /** Encerra a sessão e apaga o cookie. Sair duas vezes não é erro. */
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
  /** Quem está logado, no formato do contrato `Eu`. É a fonte de verdade das telas. */
  @Get('eu')
  @WithSession()
  async eu(@Req() requisicao: RequestWithSession): Promise<Eu> {
    const session = sessionOf(requisicao);

    const encontrado = await noTenant(session.tenantId, async (tx) => {
      const { rows } = await tx.execute<LinhaEu>(sql`
        select u.id, u.nome, u.email, u.avatar_url,
               t.id as tenant_id, t.nome as tenant_nome, t.slug, t.plano,
               t.onboarding_concluido_em
          from usuario u
          join tenant t on t.id = u.tenant_id
         where u.id = ${session.userId}::uuid and u.ativo
         limit 1
      `);
      const user = rows[0];
      if (!user) return null;

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
      const { rows: permissions } = await tx.execute<{ code: string }>(sql`
        select codigo from (
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

    // Sessão viva apontando para usuário que sumiu ou foi desativado entre um
    // pedido e outro: é recusa, não 500.
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
