import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { InvitationVisible } from '@pipe/contracts';
import { noTenant } from '../database.js';
import { WithSession, exigirPermission, sessionOf } from '../session.js';
import type { RequestWithSession } from '../session.js';
import { acceptInvitation, createInvitation, readInvitation, resendInvitation } from '../domain/convites.js';
import { logDomain, checkDomain } from '../domain/dominios.js';

/**
 * Invitations and verified domains are two ways a person joins a tenant, so this file keeps the related membership rules together. The HTTP adapter is thin: invitation and domain logic live in `src/dominio/` and can be tested without Nest; this layer handles method, path, permission and response shape. The invitation routes without `@ComSessao()` are deliberately public. Someone opening a link has no account yet, so requiring a session would require the account that the invitation is meant to create.
 */

@Controller('v1/convites')
export class InvitationsController {
  /** Invite a person and return the link containing the token; that token is not shown again. */
  @Post()
  @HttpCode(201)
  @WithSession()
  async create(
    @Req() requisicao: RequestWithSession,
    @Body() corpo: { email?: string; role?: string },
  ): Promise<Record<string, unknown>> {
    const sessao = sessionOf(requisicao);
    // The `admin`'s "manage members" permission, also checked by the Members screen.
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
   * Resend an open invitation with the same email and role but a new link; the old link is invalidated by `emitirConvite`. Require the same invitation permission. Without it, or when the invitation is from another tenant, accepted or expired, return 403/404.
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
   * Show who the invitation is for without a session, returning only the invited email, role and customer name. A holder of the link already knows the email; other account data must stay hidden until they join.
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
   * Accept the invitation, create the user and consume the token. The Google account is linked at sign-in through a verified domain or through this invitation link (`entrarEm`). The link is returned because invitees without a verified domain need that path.
   */
  @Post(':token/aceitar')
  @HttpCode(200)
  async aceitar(@Param('token') token: string): Promise<Record<string, unknown>> {
    const aceito = await acceptInvitation(token);
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

  /** Check the DNS TXT record. Return 400 until it appears because publishing and propagation take time. */
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
 * Check permission in a separate transaction before the write transaction. Permission lives in a tenant table, while domain functions open their own transactions. One additional read keeps transaction handling out of the controller; passing `usuarioId` into every domain function would spread the access rule among them.
 */
function permitido(tenantId: string, userId: string, codigo: string): Promise<void> {
  return noTenant(tenantId, (tx) => exigirPermission(tx, userId, codigo));
}
