import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Req } from '@nestjs/common';
import { noTenant } from '../database.js';
import { PipeError } from '../errors.js';
import { WithSession, sessionOf } from '../session.js';
import type { RequestWithSession } from '../session.js';
import {
  loadConnectionOfFlow,
  createKeyOfFlow,
  createWebhook,
  editarWebhook,
  excluirWebhook,
  listKeysOfFlow,
  listarWebhooks,
  revokeKeyOfFlow,
  saveConnectionOfFlow,
  testarWebhook,
} from '../domain/management/integrations.js';
import type {
  KeyOfFlow,
  KeyOfFlowCreated,
  ConnectionOfFlow,
  PedidoDeConexao,
  RequestOfEditOfWebhook,
  PedidoDeWebhook,
  ResultOfTest,
  WebhookDeSaida,
  WebhookDeSaidaCriado,
} from '../domain/management/integrations.js';

/**
 * Flow integration screens cover access keys, connection information and outbound webhooks. Rules live in `dominio/gestao/integracoes.ts`; this adapter handles sessions, URL UUID validation and body conversion as in `gestao-fluxo.ts`. `chaves` and `conexao` live under `/v1/gestao/fluxos/:id` because they belong to a flow. `webhooks` lives at `/v1/gestao/webhooks` because `webhook_saida` belongs to the account (see the domain comment); putting it under `:id` would imply a table column that does not exist.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidOu404(value: string, oQue: string): string {
  if (!UUID.test(value)) throw PipeError.naoEncontrado(oQue);
  return value;
}

interface BodyOfKey {
  name?: unknown;
}

interface CorpoDeConexao {
  urlMessages?: unknown;
  urlNotifications?: unknown;
}

interface CorpoDeWebhook {
  url?: unknown;
  eventos?: unknown;
  active?: unknown;
  authentication?: unknown;
  cabecalhos?: unknown;
}

@Controller()
export class ManagementIntegrationsController {
  /* ------------------------------------------------------- Chaves do fluxo */

  @Get('v1/management/flows/:id/keys')
  @WithSession()
  async chaves(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<KeyOfFlow[]> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) =>
      listKeysOfFlow(tx, sessao.tenantId, sessao.userId, id),
    );
  }

  @Post('v1/management/flows/:id/keys')
  @WithSession()
  async createKey(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: BodyOfKey,
  ): Promise<KeyOfFlowCreated> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    const nome = corpo?.name;
    return noTenant(sessao.tenantId, (tx) =>
      createKeyOfFlow(tx, sessao.tenantId, sessao.userId, id, typeof nome === 'string' ? nome : ''),
    );
  }

  /** The screen says "Excluir chave", but the rule revokes by setting `revogada_em`; it never deletes the row. */
  @Delete('v1/management/flows/:id/keys/:keyId')
  @HttpCode(204)
  @WithSession()
  async revokeKey(
    @Req() request: RequestWithSession,
    @Param('id') id: string,
    @Param('keyId') keyId: string,
  ): Promise<void> {
    const session = sessionOf(request);
    uuidOu404(id, 'fluxo');
    uuidOu404(keyId, 'chave de API');
    await noTenant(session.tenantId, (tx) =>
      revokeKeyOfFlow(tx, session.tenantId, session.userId, id, keyId),
    );
  }



  @Get('v1/management/flows/:id/connection')
  @WithSession()
  async conexao(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<ConnectionOfFlow> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) =>
      loadConnectionOfFlow(tx, sessao.tenantId, sessao.userId, id),
    );
  }

  @Put('v1/management/flows/:id/connection')
  @WithSession()
  async salvarConexao(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: CorpoDeConexao,
  ): Promise<ConnectionOfFlow> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    const pedido: PedidoDeConexao = {};
    if (corpo?.urlMessages !== undefined) {
      pedido.urlMensagens = corpo.urlMessages === null ? null : String(corpo.urlMessages);
    }
    if (corpo?.urlNotifications !== undefined) {
      pedido.urlNotificacoes = corpo.urlNotifications === null ? null : String(corpo.urlNotifications);
    }
    return noTenant(sessao.tenantId, (tx) =>
      saveConnectionOfFlow(tx, sessao.tenantId, sessao.userId, id, pedido),
    );
  }

  /* ---------------------------------------------------------------- Webhook */

  @Get('v1/management/webhooks')
  @WithSession()
  async webhooks(@Req() requisicao: RequestWithSession): Promise<WebhookDeSaida[]> {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) => listarWebhooks(tx, sessao.tenantId, sessao.userId));
  }

  @Post('v1/management/webhooks')
  @WithSession()
  async createWebhook(
    @Req() requisicao: RequestWithSession,
    @Body() corpo: CorpoDeWebhook,
  ): Promise<WebhookDeSaidaCriado> {
    const sessao = sessionOf(requisicao);
    const pedido: PedidoDeWebhook = {
      url: typeof corpo?.url === 'string' ? corpo.url : '',
      eventos: Array.isArray(corpo?.eventos) ? (corpo.eventos as unknown[]).map(String) : [],
      autenticacao: corpo?.authentication,
      cabecalhos: corpo?.cabecalhos,
    };
    return noTenant(sessao.tenantId, (tx) =>
      createWebhook(tx, sessao.tenantId, sessao.userId, pedido),
    );
  }

  @Patch('v1/management/webhooks/:webhookId')
  @WithSession()
  async editarWebhook(
    @Req() requisicao: RequestWithSession,
    @Param('webhookId') webhookId: string,
    @Body() corpo: CorpoDeWebhook,
  ): Promise<WebhookDeSaida> {
    const sessao = sessionOf(requisicao);
    uuidOu404(webhookId, 'webhook');
    const pedido: RequestOfEditOfWebhook = {};
    if (typeof corpo?.url === 'string') pedido.url = corpo.url;
    if (Array.isArray(corpo?.eventos)) pedido.eventos = (corpo.eventos as unknown[]).map(String);
    if (typeof corpo?.active === 'boolean') pedido.active = corpo.active;
    if (corpo?.authentication !== undefined) pedido.autenticacao = corpo.authentication;
    if (corpo?.cabecalhos !== undefined) pedido.cabecalhos = corpo.cabecalhos;
    return noTenant(sessao.tenantId, (tx) =>
      editarWebhook(tx, sessao.tenantId, sessao.userId, webhookId, pedido),
    );
  }

  @Delete('v1/management/webhooks/:webhookId')
  @HttpCode(204)
  @WithSession()
  async excluirWebhook(
    @Req() requisicao: RequestWithSession,
    @Param('webhookId') webhookId: string,
  ): Promise<void> {
    const sessao = sessionOf(requisicao);
    uuidOu404(webhookId, 'webhook');
    await noTenant(sessao.tenantId, (tx) =>
      excluirWebhook(tx, sessao.tenantId, sessao.userId, webhookId),
    );
  }

  @Post('v1/management/webhooks/:webhookId/test')
  @HttpCode(200)
  @WithSession()
  async testarWebhook(
    @Req() requisicao: RequestWithSession,
    @Param('webhookId') webhookId: string,
  ): Promise<ResultOfTest> {
    const sessao = sessionOf(requisicao);
    uuidOu404(webhookId, 'webhook');
    return noTenant(sessao.tenantId, (tx) =>
      testarWebhook(tx, sessao.tenantId, sessao.userId, webhookId),
    );
  }
}
