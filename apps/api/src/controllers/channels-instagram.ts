import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { noTenant } from '../database.js';
import { conectarInstagramManual, desconectarInstagram, listChannelsInstagram, readChannelInstagram } from '../domain/instagram/channel.js';
import type { ChannelInstagramVisible, ConexaoInstagram } from '../domain/instagram/channel.js';
import { WithSession, requirePermission, sessionOf } from '../session.js';
import type { RequestWithSession } from '../session.js';
import { flowIdOfBody, connectToFlow, permitidoConectar, permitidoReconectar } from './connection-in-flow.js';

/**
 * HTTP adapter for manual Instagram connection; the rules live in `dominio/instagram/`. Like WhatsApp (`canais.ts`), account-level routes require a browser session and `canal.gerenciar`, and take the tenant from the session. A channel belonging to another customer returns 404. On connection with `fluxo_id`, the bot permission applies instead, and `permitidoConectar` and `ligarAoFluxo` link the new channel to the bot.
 */
@Controller('v1/channels/instagram')
export class InstagramChannelsController {
  @Get()
  @WithSession()
  async listar(@Req() request: RequestWithSession): Promise<{ channels: ChannelInstagramVisible[] }> {
    const session = sessionOf(request);
    await permitido(session.tenantId, session.userId);
    return { channels: await listChannelsInstagram(session.tenantId) };
  }

  /** The token and App Secret belong to the customer's app; they leave here encrypted and are not returned. */
  @Post('manual')
  @HttpCode(201)
  @WithSession()
  async manual(
    @Req() requisicao: RequestWithSession,
    @Body() corpo: { access_token?: string; app_secret?: string; name?: string; flowId?: string; channelId?: string },
  ): Promise<ChannelInstagramVisible & Omit<ConexaoInstagram, 'channel'>> {
    const sessao = sessionOf(requisicao);
    const flowId = flowIdOfBody(corpo);
    if (corpo.channelId) {
      await readChannelInstagram(sessao.tenantId, corpo.channelId);
      await permitidoReconectar(sessao.tenantId, sessao.userId, flowId, corpo.channelId);
    } else {
      await permitidoConectar(sessao.tenantId, sessao.userId, flowId);
    }
    const feito = await conectarInstagramManual({
      tenantId: sessao.tenantId,
      userId: sessao.userId,
      token: corpo?.access_token?.trim(),
      appSecret: corpo?.app_secret?.trim(),
      name: corpo?.name,
      channelId: corpo?.channelId,
    });
    if (flowId && !corpo.channelId) await connectToFlow(sessao.tenantId, sessao.userId, flowId, feito.channel.id);
    return { ...feito.channel, webhookError: feito.webhookError, webhook: feito.webhook };
  }

  @Delete(':id')
  @WithSession()
  async desconectar(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<ChannelInstagramVisible> {
    const sessao = sessionOf(requisicao);
    await permitido(sessao.tenantId, sessao.userId);
    return desconectarInstagram(sessao.tenantId, sessao.userId, id);
  }
}

function permitido(tenantId: string, userId: string): Promise<void> {
  return noTenant(tenantId, (tx) => requirePermission(tx, userId, 'canal.gerenciar'));
}
