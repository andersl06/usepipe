import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Req } from '@nestjs/common';
import { noTenant } from '../banco.js';
import { PipeError } from '../erros.js';
import { WithSession, sessionOf } from '../sessao.js';
import type { RequestWithSession } from '../sessao.js';
import {
  loadConnectionOfFlow,
  createKeyOfFlow,
  createWebhook,
  editarWebhook,
  excluirWebhook,
  listKeysOfFlow,
  listarWebhooks,
  revogarKeyOfFlow,
  saveConnectionOfFlow,
  testarWebhook,
} from '../dominio/gestao/integracoes.js';
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
} from '../dominio/gestao/integracoes.js';

/**
 * As telas de Integrações do fluxo: chaves de acesso, informações de conexão
 * e webhook de saída. Regra em `dominio/gestao/integracoes.ts`; aqui só
 * sessão, validação de UUID de URL e tradução de corpo — o mesmo desenho de
 * `gestao-fluxo.ts`.
 *
 * `chaves` e `conexao` vivem sob `/v1/gestao/fluxos/:id` porque são do
 * fluxo; `webhooks` é `/v1/gestao/webhooks` porque `webhook_saida` é da
 * CONTA (ver o comentário no domínio) — colocá-lo sob `:id` fingiria uma
 * coluna que a tabela não tem.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidOu404(value: string, oQue: string): string {
  if (!UUID.test(value)) throw PipeError.naoEncontrado(oQue);
  return value;
}

interface BodyOfKey {
  nome?: unknown;
}

interface CorpoDeConexao {
  urlMessages?: unknown;
  urlNotifications?: unknown;
}

interface CorpoDeWebhook {
  url?: unknown;
  eventos?: unknown;
  ativo?: unknown;
  authentication?: unknown;
  cabecalhos?: unknown;
}

@Controller()
export class ManagementIntegrationsController {
  /* ------------------------------------------------------- Chaves do fluxo */

  @Get('v1/gestao/fluxos/:id/chaves')
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

  @Post('v1/gestao/fluxos/:id/chaves')
  @WithSession()
  async createKey(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: BodyOfKey,
  ): Promise<KeyOfFlowCreated> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    const nome = corpo?.nome;
    return noTenant(sessao.tenantId, (tx) =>
      createKeyOfFlow(tx, sessao.tenantId, sessao.userId, id, typeof nome === 'string' ? nome : ''),
    );
  }

  /** "Excluir chave" da tela — a regra REVOGA (`revogada_em`), nunca apaga a linha. */
  @Delete('v1/gestao/fluxos/:id/chaves/:chaveId')
  @HttpCode(204)
  @WithSession()
  async revogarKey(
    @Req() request: RequestWithSession,
    @Param('id') id: string,
    @Param('chaveId') keyId: string,
  ): Promise<void> {
    const session = sessionOf(request);
    uuidOu404(id, 'fluxo');
    uuidOu404(keyId, 'chave de API');
    await noTenant(session.tenantId, (tx) =>
      revogarKeyOfFlow(tx, session.tenantId, session.userId, id, keyId),
    );
  }

  /* --------------------------------------------------- Informações de conexão */

  @Get('v1/gestao/fluxos/:id/conexao')
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

  @Put('v1/gestao/fluxos/:id/conexao')
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

  @Get('v1/gestao/webhooks')
  @WithSession()
  async webhooks(@Req() requisicao: RequestWithSession): Promise<WebhookDeSaida[]> {
    const sessao = sessionOf(requisicao);
    return noTenant(sessao.tenantId, (tx) => listarWebhooks(tx, sessao.tenantId, sessao.userId));
  }

  @Post('v1/gestao/webhooks')
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

  @Patch('v1/gestao/webhooks/:webhookId')
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
    if (typeof corpo?.ativo === 'boolean') pedido.ativo = corpo.ativo;
    if (corpo?.authentication !== undefined) pedido.autenticacao = corpo.authentication;
    if (corpo?.cabecalhos !== undefined) pedido.cabecalhos = corpo.cabecalhos;
    return noTenant(sessao.tenantId, (tx) =>
      editarWebhook(tx, sessao.tenantId, sessao.userId, webhookId, pedido),
    );
  }

  @Delete('v1/gestao/webhooks/:webhookId')
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

  @Post('v1/gestao/webhooks/:webhookId/testar')
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
