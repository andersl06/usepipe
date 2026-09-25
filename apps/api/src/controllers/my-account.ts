import { Body, Controller, Get, Patch, Post, Req, Res } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Response } from 'express';
import { openSessionAt, cookieOfSession } from '@pipe/authentication';
import { databaseApp, databaseOwner, noTenant } from '../database.js';
import { PipeError } from '../errors.js';
import { WithSession, sessionOf } from '../session.js';
import type { RequestWithSession } from '../session.js';
import { optionsOfCookie } from './login.js';

/**
 * "Minha conta" e o seletor de contas — as duas telas que fecham o onboarding
 * de quem entrou pelo autosserviço.
 *
 * A ordem da plataforma de origem, medida em `referencias-blip/pesquisa/onboarding-blip.md`:
 * a conta nasce no login, a tela de boas-vindas avisa, e ESTE formulário é o que
 * a completa. Enquanto `onboardingConcluidoEm` for nulo, a Gestão manda a pessoa
 * para cá em vez de abrir o portal.
 *
 * O seletor existe porque um e-mail administra várias contas (lá se troca de
 * subdomínio; aqui se troca a sessão). A lista sai do banco do DONO de
 * propósito: é a única consulta que precisa atravessar tenants, e ela responde
 * só sobre contas em que aquele e-mail já tem usuário ativo.
 */

/**
 * As sete faixas da origem, com os CORTES dela (1–4, 5–19, 20–49, 50–249,
 * 250–999, 1.000–10.000, acima). Antes usávamos cortes redondos nossos — sete
 * faixas também, mas em pontos diferentes, e aí o dado não cruza com o deles
 * nem com o mercado que já responde nesse formato.
 *
 * Faixa, e não número: escala muda, faixa não.
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

/** Os três idiomas da origem. */
const IDIOMAS = ['pt-BR', 'en-US', 'es-ES'] as const;

/**
 * Os fusos do Brasil, do mais usado para o menos.
 *
 * Lista fechada, e não o catálogo inteiro da IANA: o catálogo tem 400 e poucos
 * nomes, e a tela vira uma caçada. Quando houver cliente fora daqui, a lista
 * cresce — e o banco já aceita qualquer nome válido.
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
   * A aba "Preferências" da tela de origem: idioma e fuso.
   *
   * As duas colunas já existiam no tenant e nenhuma tela mexia nelas — e o fuso
   * decide o que é "hoje" em todo relatório, então deixá-lo fora da tela é
   * deixar o cliente preso ao fuso que o provisionamento escolheu.
   */
  idioma: string;
  fuso: string;
  /** Nulo enquanto o formulário não foi salvo nenhuma vez. */
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
    estado: linha.state,
    pais: linha.pais,
    telefone: linha.phone,
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
  /** A conta desta sessão. É a que o seletor marca. */
  inForce: boolean;
  onboardingCompleted: boolean;
  /**
   * Conta PESSOAL: a que nasceu no login e não provou domínio nenhum.
   *
   * É o corte que a origem faz entre o contrato (empresa, com id) e o espaço
   * pessoal (sem id), e o seletor desenha os dois diferente. Aqui a prova é o
   * domínio verificado: quem contrata publica o TXT no DNS da empresa; quem
   * entrou sozinho com o próprio e-mail não publicou nada.
   */
  personal: boolean;
}

/** Um valor da lista, ou nulo quando não veio. Fora da lista é recusa. */
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
  /** A conta em vigor, com o que o formulário precisa mostrar e oferecer. */
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
   * Salva os dados da empresa e, com isso, conclui o onboarding.
   *
   * Salvar é o que marca `onboarding_concluido_em` — não há um botão "concluir"
   * à parte. Na origem é o mesmo: o `POST /Account` do formulário é o passo.
   * Salvar de novo depois não reabre nem remarca: a data é a da primeira vez,
   * e é ela que conta quanto tempo a conta levou para sair do papel.
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

    /* Lista fechada dos dois lados: idioma que a tela não sabe desenhar e fuso
       que o Postgres não conhece quebram relatório inteiro, e em silêncio. */
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
   * As contas deste e-mail. É o que o seletor do canto superior esquerdo lista.
   *
   * Pelo e-mail, e não pela identidade do provedor: quem foi convidado para a
   * conta de um cliente e ainda não entrou por lá pelo Google também aparece —
   * é o mesmo critério que a entrada usa para ligar a conta na primeira vez.
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
      select t.id as tenant_id, t.nome, t.slug, t.plano, t.onboarding_concluido_em,
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
      nome: linha.name,
      slug: linha.slug,
      plano: linha.plan,
      inForce: linha.tenant_id === sessao.tenantId,
      onboardingCompleted: linha.onboarding_concluido_em !== null,
      pessoal: linha.personal,
    }));
  }

  /**
   * Troca a conta em vigor: abre sessão nova na conta de destino e devolve o
   * cookie.
   *
   * O vínculo é conferido AQUI, pelo e-mail da sessão de agora — mandar um
   * `tenantId` qualquer não serve de nada. A sessão antiga continua válida de
   * propósito: quem troca de conta costuma voltar, e derrubar a outra aba no
   * meio de um atendimento seria pior.
   */
  @Post('accounts/exchange')
  @WithSession()
  async exchange(
    @Req() requisicao: RequestWithSession,
    @Res({ passthrough: true }) resposta: Response,
    @Body() corpo: { tenantId?: string; slug?: string },
  ): Promise<{ tenantId: string; slug: string }> {
    const sessao = sessionOf(requisicao);
    /* Aceita as duas formas porque as duas telas pedem coisas diferentes: o
       seletor tem o id em mãos, e o endereço da conta (o subdomínio) só tem o
       slug — é ele que a URL carrega. */
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
    // Sem vínculo a resposta é "não existe", e não "você não pode": dizer que a
    // conta existe já conta ao curioso que empresa usa o Pipe.
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
      cookieOfSession(inbound.token, inbound.expiraEm, optionsOfCookie()),
    );
    return { tenantId: destination, slug: alvo.slug };
  }
}

/**
 * O id da conta a partir do endereço dela.
 *
 * Responde no banco do dono porque a pergunta acontece ANTES de saber se a
 * pessoa tem acesso — quem decide isso é a rota, logo depois, pelo e-mail. Um
 * slug que não existe devolve vazio, e a rota trata como "não encontrado": não
 * há diferença visível entre conta inexistente e conta que não é sua.
 */
async function idDoSlug(slug: string | undefined): Promise<string> {
  const limpo = (slug ?? '').trim().toLowerCase();
  if (!limpo) return '';
  const { rows } = await databaseOwner().execute<{ id: string }>(
    sql`select id from tenant where slug = ${limpo} and ativo limit 1`,
  );
  return rows[0]?.id ?? '';
}

/** O e-mail de quem está logado. É a chave que liga as contas da mesma pessoa. */
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
