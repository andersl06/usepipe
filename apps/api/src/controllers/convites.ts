import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { InvitationVisible } from '@pipe/contracts';
import { noTenant } from '../database.js';
import { WithSession, exigirPermission, sessionOf } from '../session.js';
import type { RequestWithSession } from '../session.js';
import { aceitarInvitation, createInvitation, readInvitation, resendInvitation } from '../domain/convites.js';
import { logDomain, checkDomain } from '../domain/dominios.js';

/**
 * As duas portas por onde gente nova entra num tenant: o convite e o domínio
 * verificado. Ficam no mesmo arquivo porque são a mesma decisão vista de dois
 * lados — "esta pessoa pertence a este cliente?" — e a regra de uma só faz sentido
 * ao lado da outra.
 *
 * A casca é fina de propósito: convite e domínio moram em `src/dominio/`, testáveis
 * sem subir o Nest. Aqui só há verbo, caminho, permissão e formato.
 *
 * **Rota sem `@ComSessao()` é pública de propósito.** As duas do convite precisam
 * ser: quem abre o link ainda não tem conta, e exigir sessão para ver um convite
 * seria exigir a conta que o convite existe para criar.
 */

@Controller('v1/convites')
export class InvitationsController {
  /** Convida alguém. Devolve o link com o token — que não volta a aparecer. */
  @Post()
  @HttpCode(201)
  @WithSession()
  async create(
    @Req() requisicao: RequestWithSession,
    @Body() corpo: { email?: string; role?: string },
  ): Promise<Record<string, unknown>> {
    const sessao = sessionOf(requisicao);
    // O "gerencia membros" do `admin` — a mesma permissão que a tela de Membros confere.
    await permitido(sessao.tenantId, sessao.userId, 'conta.membros.escrever');

    const invitation = await createInvitation(sessao.tenantId, {
      email: corpo.email,
      role: corpo.role,
      criadoPor: sessao.userId,
    });

    return {
      id: invitation.id,
      email: invitation.email,
      papel: invitation.role,
      url: invitation.url,
      expiraEm: invitation.expiresAt.toISOString(),
    };
  }

  /**
   * Reenvia um convite em aberto: mesmo e-mail, mesmo papel, link novo — o de
   * antes morre (ver `emitirConvite`). Mesma permissão de convidar; sem ela ou
   * sem o convite (de outro tenant, já aceito, já vencido) sai 403/404.
   */
  @Post(':id/reenviar')
  @HttpCode(201)
  @WithSession()
  async reenviar(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<Record<string, unknown>> {
    const sessao = sessionOf(requisicao);
    await permitido(sessao.tenantId, sessao.userId, 'conta.membros.escrever');

    const convite = await resendInvitation(sessao.tenantId, id, sessao.userId);
    return {
      id: convite.id,
      email: convite.email,
      papel: convite.role,
      url: convite.url,
      expiraEm: convite.expiresAt.toISOString(),
    };
  }

  /**
   * Para quem é o convite. Sem sessão, e devolvendo o MÍNIMO: o e-mail convidado, o
   * papel e o nome do cliente. Quem tem o link já sabe o e-mail; o resto da conta
   * não é assunto de quem ainda está do lado de fora.
   */
  @Get(':token')
  async ver(@Param('token') token: string): Promise<InvitationVisible> {
    const convite = await readInvitation(token);
    return {
      email: convite.email,
      role: convite.role,
      tenant: { nome: convite.tenant.name, slug: convite.tenant.slug },
      expiraEm: convite.expiresAt.toISOString(),
    };
  }

  /**
   * Aceita o convite: cria o usuário e queima o token.
   *
   * A conta do Google é ligada quando a pessoa entra — pelo domínio verificado, ou
   * pelo próprio link do convite, que é `entrarEm` aqui embaixo. Esse é o caminho de
   * quem não tem domínio verificado, e por isso ele vem pronto na resposta.
   */
  @Post(':token/aceitar')
  @HttpCode(200)
  async aceitar(@Param('token') token: string): Promise<Record<string, unknown>> {
    const aceito = await aceitarInvitation(token);
    return {
      usuarioId: aceito.userId,
      email: aceito.email,
      papel: aceito.role,
      tenant: aceito.tenant,
      entrarEm: `/v1/auth/google?invite=${encodeURIComponent(token)}`,
    };
  }
}

@Controller('v1/dominios')
export class DomainsController {
  /** Registra o domínio e diz qual TXT publicar. Verificar é o passo seguinte. */
  @Post()
  @HttpCode(201)
  @WithSession()
  async registrar(
    @Req() request: RequestWithSession,
    @Body() corpo: { domain?: string },
  ): Promise<Record<string, unknown>> {
    const session = sessionOf(request);
    await permitido(session.tenantId, session.userId, 'tenant.configurar');

    const registrado = await logDomain(session.tenantId, corpo.domain);
    return {
      id: registrado.id,
      dominio: registrado.domain,
      verificadoEm: registrado.verificadoEm?.toISOString() ?? null,
      registro: registrado.registro,
    };
  }

  /** Confere o TXT no DNS. Sai 400 enquanto não achar — publicar e propagar demora. */
  @Post(':id/verificar')
  @HttpCode(200)
  @WithSession()
  async verificar(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<Record<string, unknown>> {
    const sessao = sessionOf(requisicao);
    await permitido(sessao.tenantId, sessao.userId, 'tenant.configurar');

    const verificado = await checkDomain(sessao.tenantId, id);
    return {
      id: verificado.id,
      dominio: verificado.domain,
      verificadoEm: verificado.verificadoEm.toISOString(),
    };
  }
}

/**
 * A permissão é conferida numa transação própria, antes da que escreve.
 *
 * Duas transações em vez de uma porque a permissão mora numa tabela do tenant e as
 * funções de domínio abrem a delas. Custa uma consulta de leitura e mantém o
 * controlador sem saber de transação — e a alternativa, empurrar o `usuarioId`
 * para dentro de cada função de domínio, espalharia a regra de acesso por elas.
 */
function permitido(tenantId: string, userId: string, codigo: string): Promise<void> {
  return noTenant(tenantId, (tx) => exigirPermission(tx, userId, codigo));
}
