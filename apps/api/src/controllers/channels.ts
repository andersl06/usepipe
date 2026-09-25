import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { noTenant } from '../database.js';
import { desconectarWhatsApp, readChannelVisible, listChannelsWhatsApp } from '../domain/channels.js';
import type { ChannelWhatsAppVisible } from '../domain/channels.js';
import { executarRegistrationEmbedded, validarParametros } from '../domain/whatsapp/registration-embedded.js';
import { readChannelWhatsApp } from '../domain/whatsapp/channel.js';
import { modoDaConexao, versaoDaApi } from '../domain/whatsapp/cliente-graph.js';
import { executarConfigurationManual } from '../domain/whatsapp/configuration-manual.js';
import { checkState, emitirState } from '../domain/whatsapp/state-of-connection.js';
import { createTemplateInMeta, deleteTemplateInMeta, sincronizarModelos } from '../domain/whatsapp/modelos.js';
import type { RequestOfTemplate, ResultOfSynchronization } from '../domain/whatsapp/modelos.js';
import { writeProfileOfChannel, readProfileOfChannel } from '../domain/whatsapp/perfil.js';
import { writePreferences, readPreferences } from '../domain/whatsapp/preferences.js';
import type { RequestOfPreferences, PreferencesOfChannel } from '../domain/whatsapp/preferences.js';
import type { PedidoDePerfil, PerfilVisivel } from '../domain/whatsapp/perfil.js';
import { WithSession, exigirPermission, sessionOf } from '../session.js';
import type { RequestWithSession } from '../session.js';
import {
  flowIdOfBody,
  connectToFlow,
  permitidoConectar,
  permitidoReconectar,
} from './connection-in-flow.js';

/**
 * A casca HTTP de "conectar o WhatsApp". A regra mora em `dominio/whatsapp/`.
 *
 * O `POST /v1/canais/whatsapp` é o porte de chatwoot/chatwoot (MIT),
 * app/controllers/api/v1/accounts/whatsapp/authorizations_controller.rb: conexão
 * nova ou, com `canal_id` (o `inbox_id` de lá), reautorização daquele canal.
 *
 * Sessão de navegador, não chave de API, e `canal.gerenciar` em toda rota: o que
 * se grava aqui é a credencial que manda mensagem **pelo número do cliente**. O
 * tenant vem SEMPRE da sessão — nenhum corpo desta rota carrega tenant.
 *
 * Com `fluxo_id` (conexão feita DE DENTRO do bot, como na origem —
 * `FICHA-conectar-canal-no-bot.md` §4), a permissão passa a ser a do bot
 * (`channels.escrever`, `canal-do-fluxo.ts`) e o canal nasce já ligado a ele
 * (`conexao-no-fluxo.ts`).
 */
@Controller('v1/channels')
export class ChannelsController {
  /** O que a tela de Canais mostra: ligado, número, qualidade e limite. */
  @Get('whatsapp')
  @WithSession()
  async listar(@Req() requisicao: RequestWithSession): Promise<{ channels: ChannelWhatsAppVisible[] }> {
    const sessao = sessionOf(requisicao);
    await permitido(sessao.tenantId, sessao.userId, 'canal.gerenciar');
    return { channels: await listChannelsWhatsApp(sessao.tenantId) };
  }

  /**
   * O ponto de partida do cadastro embutido: o `state` desta abertura e o que o
   * SDK da Meta precisa. Acréscimo do Pipe (`estado-de-conexao.ts`); no Chatwoot
   * esses valores vêm de `window.chatwootConfig` e não há `state`.
   */
  @Post('whatsapp/state')
  @HttpCode(201)
  @WithSession()
  async iniciar(@Req() requisicao: RequestWithSession): Promise<Record<string, string>> {
    const sessao = sessionOf(requisicao);
    await permitido(sessao.tenantId, sessao.userId, 'canal.gerenciar');
    return {
      estado: emitirState(sessao.tenantId, sessao.userId),
      appId: process.env['WHATSAPP_APP_ID'] ?? '',
      configId: process.env['WHATSAPP_CONFIG_ID'] ?? '',
      versao: versaoDaApi(),
      modo: modoDaConexao(),
    };
  }

  /**
   * Conclui o cadastro embutido. O `code` vive 30 segundos: o front manda assim
   * que o popup devolve. O `state` é conferido ANTES de qualquer outra coisa — um
   * `code` de outra sessão não chega nem à Meta.
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
    // Reautorização é do canal, não do bot: o `fluxo_id` só vale para canal novo.
    const fluxoId = corpo.canal_id ? undefined : flowIdOfBody(corpo);
    await permitidoConectar(sessao.tenantId, sessao.userId, fluxoId);
    checkState(corpo.state, sessao.tenantId, sessao.userId);
    validarParametros({ code: corpo.code, wabaId: corpo.waba_id });

    // `fetch_and_validate_inbox`: o canal a reautorizar tem de ser deste tenant.
    if (corpo.canal_id) await readChannelWhatsApp(sessao.tenantId, corpo.canal_id);

    const channel = await executarRegistrationEmbedded({
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
   * O caminho sem cadastro embutido: WABA ID, Phone Number ID e token de usuário
   * de sistema, validados antes de gravar (porte de `manual_setup_service.rb`).
   * O token vem no corpo porque é o do cliente; ele sai daqui cifrado e não é
   * devolvido.
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
    /* Reconectar não liga bot nenhum — o canal já tem dono. Mas quem administra
       o bot dono do canal pode reconectá-lo, porque na origem isso se faz na
       página do canal DENTRO do bot. */
    const doCorpo = flowIdOfBody(corpo);
    const flowId = corpo.channelId ? undefined : doCorpo;
    if (corpo.channelId) {
      await readChannelWhatsApp(session.tenantId, corpo.channelId);
      await permitidoReconectar(session.tenantId, session.userId, doCorpo, corpo.channelId);
    } else {
      await permitidoConectar(session.tenantId, session.userId, flowId);
    }
    const feito = await executarConfigurationManual({
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
   * O perfil comercial do número (foto, recado, descrição, endereço, e-mail,
   * sites, categoria) e, só para leitura, o nome de exibição com o status da
   * análise da Meta. Ver `dominio/whatsapp/perfil.ts`.
   */
  @Get('whatsapp/:id/perfil')
  @WithSession()
  async perfil(@Req() requisicao: RequestWithSession, @Param('id') id: string): Promise<PerfilVisivel> {
    const sessao = sessionOf(requisicao);
    await permitido(sessao.tenantId, sessao.userId, 'canal.gerenciar');
    return readProfileOfChannel(sessao.tenantId, id);
  }

  @Patch('whatsapp/:id/perfil')
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

  /** Abas "Configurações" e "Configurações de alerta" do canal. Ver `dominio/whatsapp/preferencias.ts`. */
  @Get('whatsapp/:id/preferencias')
  @WithSession()
  async preferences(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<PreferencesOfChannel> {
    const sessao = sessionOf(requisicao);
    await permitido(sessao.tenantId, sessao.userId, 'canal.gerenciar');
    return readPreferences(sessao.tenantId, id);
  }

  @Patch('whatsapp/:id/preferencias')
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
  @Post('whatsapp/:id/modelos/sincronizar')
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

  /** Cria o modelo na Meta (vai para análise) e grava a cópia `pendente`. */
  @Post('whatsapp/:id/modelos')
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
  @Delete('whatsapp/:id/modelos/:nome')
  @WithSession()
  async deleteTemplate(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Param('nome') nome: string,
  ): Promise<{ removidos: number }> {
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
  return noTenant(tenantId, (tx) => exigirPermission(tx, userId, codigo));
}
