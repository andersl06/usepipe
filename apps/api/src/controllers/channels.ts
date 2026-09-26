import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { noTenant } from '../database.js';
import { desconectarWhatsApp, readChannelVisible, listChannelsWhatsApp } from '../domain/channels.js';
import type { ChannelWhatsAppVisible } from '../domain/channels.js';
import { runRegistrationEmbedded, validarParametros } from '../domain/whatsapp/registration-embedded.js';
import { readChannelWhatsApp } from '../domain/whatsapp/channel.js';
import { modoDaConexao, versaoDaApi } from '../domain/whatsapp/cliente-graph.js';
import { runConfigurationManual } from '../domain/whatsapp/configuration-manual.js';
import { checkState, issueState } from '../domain/whatsapp/state-of-connection.js';
import { createTemplateInMeta, deleteTemplateInMeta, sincronizarModelos } from '../domain/whatsapp/modelos.js';
import type { RequestOfTemplate, ResultOfSynchronization } from '../domain/whatsapp/modelos.js';
import { writeProfileOfChannel, readProfileOfChannel } from '../domain/whatsapp/perfil.js';
import { writePreferences, readPreferences } from '../domain/whatsapp/preferences.js';
import type { RequestOfPreferences, PreferencesOfChannel } from '../domain/whatsapp/preferences.js';
import type { PedidoDePerfil, PerfilVisivel } from '../domain/whatsapp/perfil.js';
import { WithSession, requirePermission, sessionOf } from '../session.js';
import type { RequestWithSession } from '../session.js';
import {
  flowIdOfBody,
  connectToFlow,
  permitidoConectar,
  permitidoReconectar,
} from './connection-in-flow.js';

/**
 * HTTP adapter for connecting WhatsApp; the rules live in `dominio/whatsapp/`. `POST /v1/canais/whatsapp` ports chatwoot/chatwoot (MIT), `app/controllers/api/v1/accounts/whatsapp/authorizations_controller.rb`: it creates a connection or, with `canal_id` (Chatwoot's `inbox_id`), reauthorizes that channel. Every route requires a browser session rather than an API key and `canal.gerenciar`, because it stores a credential that sends messages using the customer's number. The tenant always comes from the session, never the body. With `fluxo_id`, for a connection started inside a bot as in `FICHA-conectar-canal-no-bot.md` §4, the bot's `channels.escrever` permission in `canal-do-fluxo.ts` applies and `conexao-no-fluxo.ts` links the new channel to it.
 */
@Controller('v1/channels')
export class ChannelsController {

  @Get('whatsapp')
  @WithSession()
  async listar(@Req() requisicao: RequestWithSession): Promise<{ channels: ChannelWhatsAppVisible[] }> {
    const sessao = sessionOf(requisicao);
    await permitido(sessao.tenantId, sessao.userId, 'canal.gerenciar');
    return { channels: await listChannelsWhatsApp(sessao.tenantId) };
  }

  /**
   * Starts embedded registration by returning the `state` and values needed by the Meta SDK. This is a Pipe addition (`estado-de-conexao.ts`); in Chatwoot the values come from `window.chatwootConfig` and there is no `state`.
   */
  @Post('whatsapp/state')
  @HttpCode(201)
  @WithSession()
  async iniciar(@Req() requisicao: RequestWithSession): Promise<Record<string, string>> {
    const sessao = sessionOf(requisicao);
    await permitido(sessao.tenantId, sessao.userId, 'canal.gerenciar');
    return {
      estado: issueState(sessao.tenantId, sessao.userId),
      appId: process.env['WHATSAPP_APP_ID'] ?? '',
      configId: process.env['WHATSAPP_CONFIG_ID'] ?? '',
      versao: versaoDaApi(),
      modo: modoDaConexao(),
    };
  }

  /**
   * Finish embedded registration. The `code` lasts 30 seconds, so the front end sends it when the popup returns. Check `state` before anything else; a `code` from another session must never reach Meta.
   */
  @Post('whatsapp')
  @HttpCode(201)
  @WithSession()
  async conectar(
    @Req() requisicao: RequestWithSession,
    @Body()
    corpo: {
      code?: string;
      waba_id?: string;
      phone_number_id?: string;
      business_id?: string;
      coexistencia?: boolean;
      canal_id?: string;
      state?: string;
      fluxo_id?: string;
    },
  ): Promise<ChannelWhatsAppVisible & { message?: string }> {
    const sessao = sessionOf(requisicao);
    // Reauthorization belongs to the channel, not the bot: `fluxo_id` applies only to a new channel.
    const fluxoId = corpo.canal_id ? undefined : flowIdOfBody({ flowId: corpo.fluxo_id });
    await permitidoConectar(sessao.tenantId, sessao.userId, fluxoId);
    checkState(corpo.state, sessao.tenantId, sessao.userId);
    validarParametros({ code: corpo.code, wabaId: corpo.waba_id });

    // `fetch_and_validate_inbox`: o canal a reautorizar tem de ser deste tenant.
    if (corpo.canal_id) await readChannelWhatsApp(sessao.tenantId, corpo.canal_id);

    const channel = await runRegistrationEmbedded({
      tenantId: sessao.tenantId,
      userId: sessao.userId,
      code: corpo.code,
      wabaId: corpo.waba_id,
      numberId: corpo.phone_number_id,
      coexistencia: corpo.coexistencia === true,
      channelId: corpo.canal_id,
    });
    if (fluxoId) await connectToFlow(sessao.tenantId, sessao.userId, fluxoId, channel.id);

    const visivel = await readChannelVisible(sessao.tenantId, channel.id);
    return corpo.canal_id ? { ...visivel, message: 'Reautorização concluída.' } : visivel;
  }

  /**
   * The path without embedded registration takes a WABA ID, Phone Number ID and system-user token, validating them before storage (ported from `manual_setup_service.rb`). The token is in the body because it belongs to the customer; it is encrypted here and not returned.
   */
  @Post('whatsapp/manual')
  @HttpCode(201)
  @WithSession()
  async manual(
    @Req() request: RequestWithSession,
    @Body()
    corpo: {
      waba_id?: string;
      phone_number_id?: string;
      access_token?: string;
      app_secret?: string;
      name?: string;
      flowId?: string;
      channelId?: string;
    },
  ): Promise<
    ChannelWhatsAppVisible & { webhookError: string | null; webhook: { url: string; verifyToken: string } }
  > {
    const session = sessionOf(request);
    /*
     * Reconnecting does not link a bot: the channel already has an owner. Someone who administers the channel's bot may reconnect it because the source does this on the channel page inside the bot.
     */
    const doCorpo = flowIdOfBody(corpo);
    const flowId = corpo.channelId ? undefined : doCorpo;
    if (corpo.channelId) {
      await readChannelWhatsApp(session.tenantId, corpo.channelId);
      await permitidoReconectar(session.tenantId, session.userId, doCorpo, corpo.channelId);
    } else {
      await permitidoConectar(session.tenantId, session.userId, flowId);
    }
    const feito = await runConfigurationManual({
      tenantId: session.tenantId,
      userId: session.userId,
      wabaId: corpo.waba_id?.trim(),
      numberId: corpo.phone_number_id?.trim(),
      token: corpo.access_token?.trim(),
      appSecret: corpo.app_secret?.trim(),
      name: corpo.name,
      channelId: corpo.channelId,
    });
    if (flowId) await connectToFlow(session.tenantId, session.userId, flowId, feito.channel.id);
    return {
      ...(await readChannelVisible(session.tenantId, feito.channel.id)),
      webhookError: feito.webhookError,
      webhook: feito.webhook,
    };
  }

  /**
   * The number's business profile (photo, status message, description, address, email, websites and category), plus read-only display name and Meta review status. See `dominio/whatsapp/perfil.ts`.
   */
  @Get('whatsapp/:id/profile')
  @WithSession()
  async perfil(@Req() requisicao: RequestWithSession, @Param('id') id: string): Promise<PerfilVisivel> {
    const sessao = sessionOf(requisicao);
    await permitido(sessao.tenantId, sessao.userId, 'canal.gerenciar');
    return readProfileOfChannel(sessao.tenantId, id);
  }

  @Patch('whatsapp/:id/profile')
  @WithSession()
  async gravarPerfil(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: PedidoDePerfil,
  ): Promise<PerfilVisivel> {
    const sessao = sessionOf(requisicao);
    await permitido(sessao.tenantId, sessao.userId, 'canal.gerenciar');
    return writeProfileOfChannel(sessao.tenantId, sessao.userId, id, corpo ?? {});
  }

  /** Channel tabs "Configurações" and "Configurações de alerta". See `dominio/whatsapp/preferencias.ts`. */
  @Get('whatsapp/:id/preferences')
  @WithSession()
  async preferences(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<PreferencesOfChannel> {
    const sessao = sessionOf(requisicao);
    await permitido(sessao.tenantId, sessao.userId, 'canal.gerenciar');
    return readPreferences(sessao.tenantId, id);
  }

  @Patch('whatsapp/:id/preferences')
  @WithSession()
  async writePreferences(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: RequestOfPreferences,
  ): Promise<PreferencesOfChannel> {
    const sessao = sessionOf(requisicao);
    await permitido(sessao.tenantId, sessao.userId, 'canal.gerenciar');
    return writePreferences(sessao.tenantId, sessao.userId, id, corpo);
  }

  /** Traz da Meta todos os modelos da WABA do canal. Ver `dominio/whatsapp/modelos.ts`. */
  @Post('whatsapp/:id/templates/sync')
  @HttpCode(200)
  @WithSession()
  async sincronizarModelos(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<ResultOfSynchronization> {
    const sessao = sessionOf(requisicao);
    await permitido(sessao.tenantId, sessao.userId, 'canal.gerenciar');
    return sincronizarModelos(sessao.tenantId, sessao.userId, id);
  }

  /** Create the template in Meta for review and store a `pendente` copy. */
  @Post('whatsapp/:id/templates')
  @HttpCode(201)
  @WithSession()
  async createTemplate(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: RequestOfTemplate,
  ): Promise<{ id: string; statusMeta: string }> {
    const sessao = sessionOf(requisicao);
    await permitido(sessao.tenantId, sessao.userId, 'canal.gerenciar');
    return createTemplateInMeta(sessao.tenantId, sessao.userId, id, corpo ?? {});
  }

  /** Apaga na Meta, pelo nome (todos os idiomas), e aqui. */
  @Delete('whatsapp/:id/templates/:name')
  @WithSession()
  async deleteTemplate(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Param('name') nome: string,
  ): Promise<{ removed: number }> {
    const sessao = sessionOf(requisicao);
    await permitido(sessao.tenantId, sessao.userId, 'canal.gerenciar');
    return deleteTemplateInMeta(sessao.tenantId, sessao.userId, id, nome);
  }

  /** Desconecta: desmonta o webhook e desliga o canal. Conversa e mensagem ficam. */
  @Delete('whatsapp/:id')
  @WithSession()
  async desconectar(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<ChannelWhatsAppVisible> {
    const sessao = sessionOf(requisicao);
    await permitido(sessao.tenantId, sessao.userId, 'canal.gerenciar');
    return desconectarWhatsApp(sessao.tenantId, sessao.userId, id);
  }
}

function permitido(tenantId: string, userId: string, codigo: string): Promise<void> {
  return noTenant(tenantId, (tx) => requirePermission(tx, userId, codigo));
}
