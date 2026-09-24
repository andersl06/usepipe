import { Body, Controller, Get, Patch, Post, Req, Res } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Response } from 'express';
import { abrirSessaoEm, cookieDeSessao } from '@pipe/autenticacao';
import { bancoApp, bancoDono, noTenant } from '../banco.js';
import { ErroPipe } from '../erros.js';
import { ComSessao, sessaoDe } from '../sessao.js';
import type { RequisicaoComSessao } from '../sessao.js';
import { opcoesDeCookie } from './entrar.js';

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

export interface ContaEmVigor {
  id: string;
  nome: string;
  slug: string;
  plano: string;
  site: string | null;
  funcionarios: string | null;
  cidade: string | null;
  estado: string | null;
  pais: string | null;
  telefone: string | null;
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

type LinhaConta = {
  id: string;
  nome: string;
  slug: string;
  plano: string;
  site: string | null;
  funcionarios: string | null;
  cidade: string | null;
  estado: string | null;
  pais: string | null;
  telefone: string | null;
  optin_whatsapp: boolean;
  idioma: string;
  fuso: string;
  onboarding_concluido_em: Date | string | null;
};

function paraContrato(linha: LinhaConta): ContaEmVigor {
  const concluido = linha.onboarding_concluido_em;
  return {
    id: linha.id,
    nome: linha.nome,
    slug: linha.slug,
    plano: linha.plano,
    site: linha.site,
    funcionarios: linha.funcionarios,
    cidade: linha.cidade,
    estado: linha.estado,
    pais: linha.pais,
    telefone: linha.telefone,
    optinWhatsapp: linha.optin_whatsapp,
    idioma: linha.idioma,
    fuso: linha.fuso,
    onboardingConcluidoEm: concluido ? new Date(concluido).toISOString() : null,
    faixasDeFuncionarios: FAIXAS_DE_FUNCIONARIOS,
    idiomas: IDIOMAS,
    fusos: FUSOS,
  };
}

export interface ContaNaLista {
  tenantId: string;
  nome: string;
  slug: string;
  plano: string;
  /** A conta desta sessão. É a que o seletor marca. */
  emVigor: boolean;
  onboardingConcluido: boolean;
  /**
   * Conta PESSOAL: a que nasceu no login e não provou domínio nenhum.
   *
   * É o corte que a origem faz entre o contrato (empresa, com id) e o espaço
   * pessoal (sem id), e o seletor desenha os dois diferente. Aqui a prova é o
   * domínio verificado: quem contrata publica o TXT no DNS da empresa; quem
   * entrou sozinho com o próprio e-mail não publicou nada.
   */
  pessoal: boolean;
}

/** Um valor da lista, ou nulo quando não veio. Fora da lista é recusa. */
function escolha(
  valor: unknown,
  lista: readonly string[],
  codigo: string,
  recado: string,
): string | null {
  const limpo = typeof valor === 'string' ? valor.trim() : '';
  if (!limpo) return null;
  if (!lista.includes(limpo)) throw ErroPipe.requisicao(codigo, recado);
  return limpo;
}

/** Texto que veio da tela: apara, e vazio vira nulo (o campo foi limpo). */
function texto(valor: unknown, limite: number): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim().slice(0, limite);
  return limpo || null;
}

@Controller('v1')
export class ControladorMinhaConta {
  /** A conta em vigor, com o que o formulário precisa mostrar e oferecer. */
  @Get('conta')
  @ComSessao()
  async conta(@Req() requisicao: RequisicaoComSessao): Promise<ContaEmVigor> {
    const sessao = sessaoDe(requisicao);
    const linha = await noTenant(sessao.tenantId, async (tx) => {
      const { rows } = await tx.execute<LinhaConta>(sql`
        select id, nome, slug, plano, site, funcionarios, cidade, estado, pais,
               telefone, optin_whatsapp, idioma, fuso, onboarding_concluido_em
          from tenant
         where id = ${sessao.tenantId}::uuid
         limit 1
      `);
      return rows[0] ?? null;
    });
    if (!linha) throw ErroPipe.naoAutorizado('Sessão ausente ou expirada.');
    return paraContrato(linha);
  }

  /**
   * Salva os dados da empresa e, com isso, conclui o onboarding.
   *
   * Salvar é o que marca `onboarding_concluido_em` — não há um botão "concluir"
   * à parte. Na origem é o mesmo: o `POST /Account` do formulário é o passo.
   * Salvar de novo depois não reabre nem remarca: a data é a da primeira vez,
   * e é ela que conta quanto tempo a conta levou para sair do papel.
   */
  @Patch('conta')
  @ComSessao()
  async salvar(
    @Req() requisicao: RequisicaoComSessao,
    @Body() corpo: Record<string, unknown>,
  ): Promise<ContaEmVigor> {
    const sessao = sessaoDe(requisicao);

    const nome = texto(corpo['nome'], 120);
    const funcionarios = texto(corpo['funcionarios'], 40);
    if (funcionarios && !FAIXAS_DE_FUNCIONARIOS.includes(funcionarios as never)) {
      throw ErroPipe.requisicao(
        'funcionarios_invalido',
        `Escolha uma das faixas: ${FAIXAS_DE_FUNCIONARIOS.join(', ')}.`,
      );
    }

    /* Lista fechada dos dois lados: idioma que a tela não sabe desenhar e fuso
       que o Postgres não conhece quebram relatório inteiro, e em silêncio. */
    const idioma = escolha(corpo['idioma'], IDIOMAS, 'idioma_invalido', 'Idioma não suportado.');
    const fuso = escolha(corpo['fuso'], FUSOS, 'fuso_invalido', 'Fuso não suportado.');

    const linha = await noTenant(sessao.tenantId, async (tx) => {
      const { rows } = await tx.execute<LinhaConta>(sql`
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
    if (!linha) throw ErroPipe.naoAutorizado('Sessão ausente ou expirada.');
    return paraContrato(linha);
  }

  /**
   * As contas deste e-mail. É o que o seletor do canto superior esquerdo lista.
   *
   * Pelo e-mail, e não pela identidade do provedor: quem foi convidado para a
   * conta de um cliente e ainda não entrou por lá pelo Google também aparece —
   * é o mesmo critério que a entrada usa para ligar a conta na primeira vez.
   */
  @Get('contas/minhas')
  @ComSessao()
  async minhas(@Req() requisicao: RequisicaoComSessao): Promise<ContaNaLista[]> {
    const sessao = sessaoDe(requisicao);
    const email = await emailDaSessao(sessao.tenantId, sessao.usuarioId);

    const { rows } = await bancoDono().execute<{
      tenant_id: string;
      nome: string;
      slug: string;
      plano: string;
      onboarding_concluido_em: Date | string | null;
      pessoal: boolean;
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
      nome: linha.nome,
      slug: linha.slug,
      plano: linha.plano,
      emVigor: linha.tenant_id === sessao.tenantId,
      onboardingConcluido: linha.onboarding_concluido_em !== null,
      pessoal: linha.pessoal,
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
  @Post('contas/trocar')
  @ComSessao()
  async trocar(
    @Req() requisicao: RequisicaoComSessao,
    @Res({ passthrough: true }) resposta: Response,
    @Body() corpo: { tenantId?: string; slug?: string },
  ): Promise<{ tenantId: string; slug: string }> {
    const sessao = sessaoDe(requisicao);
    /* Aceita as duas formas porque as duas telas pedem coisas diferentes: o
       seletor tem o id em mãos, e o endereço da conta (o subdomínio) só tem o
       slug — é ele que a URL carrega. */
    const destino = (corpo?.tenantId ?? '').trim() || (await idDoSlug(corpo?.slug));
    if (!destino) throw ErroPipe.requisicao('tenant_ausente', 'Informe a conta de destino.');
    if (destino === sessao.tenantId) {
      const atual = await noTenant(sessao.tenantId, async (tx) => {
        const { rows } = await tx.execute<{ slug: string }>(
          sql`select slug from tenant where id = ${destino}::uuid limit 1`,
        );
        return rows[0]?.slug ?? '';
      });
      return { tenantId: destino, slug: atual };
    }

    const email = await emailDaSessao(sessao.tenantId, sessao.usuarioId);
    const { rows } = await bancoDono().execute<{ usuario_id: string; slug: string }>(sql`
      select u.id as usuario_id, t.slug
        from usuario u
        join tenant t on t.id = u.tenant_id
       where u.tenant_id = ${destino}::uuid and lower(u.email) = ${email}
         and u.ativo and t.ativo
       limit 1
    `);
    const alvo = rows[0];
    // Sem vínculo a resposta é "não existe", e não "você não pode": dizer que a
    // conta existe já conta ao curioso que empresa usa o Pipe.
    if (!alvo) throw new ErroPipe(404, 'nao_encontrado', 'Não encontrado.');

    const entrada = await abrirSessaoEm(
      bancoDono(),
      bancoApp(),
      destino,
      alvo.usuario_id,
      sessao.origem === 'sso' ? 'sso' : 'google',
      { ip: requisicao.ip, agente: requisicao.header('user-agent') },
    );
    resposta.setHeader(
      'set-cookie',
      cookieDeSessao(entrada.token, entrada.expiraEm, opcoesDeCookie()),
    );
    return { tenantId: destino, slug: alvo.slug };
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
  const { rows } = await bancoDono().execute<{ id: string }>(
    sql`select id from tenant where slug = ${limpo} and ativo limit 1`,
  );
  return rows[0]?.id ?? '';
}

/** O e-mail de quem está logado. É a chave que liga as contas da mesma pessoa. */
async function emailDaSessao(tenantId: string, usuarioId: string): Promise<string> {
  const email = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<{ email: string }>(
      sql`select lower(email) as email from usuario where id = ${usuarioId}::uuid limit 1`,
    );
    return rows[0]?.email ?? null;
  });
  if (!email) throw ErroPipe.naoAutorizado('Sessão ausente ou expirada.');
  return email;
}
