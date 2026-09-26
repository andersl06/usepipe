import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { noTenant } from '../database.js';
import { conectarInstagramManual, desconectarInstagram, listChannelsInstagram } from '../domain/instagram/channel.js';
import type { ChannelInstagramVisible, ConexaoInstagram } from '../domain/instagram/channel.js';
import { WithSession, exigirPermission, sessionOf } from '../session.js';
import type { RequestWithSession } from '../session.js';
import { flowIdOfBody, connectToFlow, permitidoConectar } from './connection-in-flow.js';

/**
 * A casca HTTP de "conectar o Instagram" pelo caminho manual. A regra mora em
 * `dominio/instagram/`. Mesmas travas do WhatsApp (`canais.ts`): sessão de navegador,
 * `canal.gerenciar` em toda rota, e o tenant SEMPRE da sessão — canal de outro
 * cliente é 404. Com `fluxo_id`, a permissão é a do bot e o canal nasce ligado
 * a ele (`permitidoConectar`/`ligarAoFluxo`, em `canais.ts`).
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

  /** O token e o App Secret são do app do cliente; saem daqui cifrados e não voltam. */
  @Post('manual')
  @HttpCode(201)
  @WithSession()
  async manual(
    @Req() requisicao: RequestWithSession,
    @Body() corpo: { access_token?: string; app_secret?: string; name?: string; flowId?: string },
  ): Promise<ChannelInstagramVisible & Omit<ConexaoInstagram, 'channel'>> {
    const sessao = sessionOf(requisicao);
    const flowId = flowIdOfBody(corpo);
    await permitidoConectar(sessao.tenantId, sessao.userId, flowId);
    const feito = await conectarInstagramManual({
      tenantId: sessao.tenantId,
      userId: sessao.userId,
      token: corpo?.access_token?.trim(),
      appSecret: corpo?.app_secret?.trim(),
      name: corpo?.name,
    });
    if (flowId) await connectToFlow(sessao.tenantId, sessao.userId, flowId, feito.channel.id);
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
  return noTenant(tenantId, (tx) => exigirPermission(tx, userId, 'canal.gerenciar'));
}
