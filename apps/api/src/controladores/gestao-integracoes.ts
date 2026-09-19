import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Req } from '@nestjs/common';
import { noTenant } from '../banco.js';
import { ErroPipe } from '../erros.js';
import { ComSessao, sessaoDe } from '../sessao.js';
import type { RequisicaoComSessao } from '../sessao.js';
import {
  carregarConexaoDoFluxo,
  criarChaveDoFluxo,
  criarWebhook,
  editarWebhook,
  excluirWebhook,
  listarChavesDoFluxo,
  listarWebhooks,
  revogarChaveDoFluxo,
  salvarConexaoDoFluxo,
  testarWebhook,
} from '../dominio/gestao/integracoes.js';
import type {
  ChaveDeFluxo,
  ChaveDeFluxoCriada,
  ConexaoDoFluxo,
  PedidoDeConexao,
  PedidoDeEdicaoDeWebhook,
  PedidoDeWebhook,
  ResultadoDoTeste,
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

function uuidOu404(valor: string, oQue: string): string {
  if (!UUID.test(valor)) throw ErroPipe.naoEncontrado(oQue);
  return valor;
}

interface CorpoDeChave {
  nome?: unknown;
}

interface CorpoDeConexao {
  urlMensagens?: unknown;
  urlNotificacoes?: unknown;
}

interface CorpoDeWebhook {
  url?: unknown;
  eventos?: unknown;
  ativo?: unknown;
  autenticacao?: unknown;
  cabecalhos?: unknown;
}

@Controller()
export class ControladorGestaoIntegracoes {
  /* ------------------------------------------------------- Chaves do fluxo */

  @Get('v1/gestao/fluxos/:id/chaves')
  @ComSessao()
  async chaves(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
  ): Promise<ChaveDeFluxo[]> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) =>
      listarChavesDoFluxo(tx, sessao.tenantId, sessao.usuarioId, id),
    );
  }

  @Post('v1/gestao/fluxos/:id/chaves')
  @ComSessao()
  async criarChave(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Body() corpo: CorpoDeChave,
  ): Promise<ChaveDeFluxoCriada> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    const nome = corpo?.nome;
    return noTenant(sessao.tenantId, (tx) =>
      criarChaveDoFluxo(tx, sessao.tenantId, sessao.usuarioId, id, typeof nome === 'string' ? nome : ''),
    );
  }

  /** "Excluir chave" da tela — a regra REVOGA (`revogada_em`), nunca apaga a linha. */
  @Delete('v1/gestao/fluxos/:id/chaves/:chaveId')
  @HttpCode(204)
  @ComSessao()
  async revogarChave(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Param('chaveId') chaveId: string,
  ): Promise<void> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    uuidOu404(chaveId, 'chave de API');
    await noTenant(sessao.tenantId, (tx) =>
      revogarChaveDoFluxo(tx, sessao.tenantId, sessao.usuarioId, id, chaveId),
    );
  }

  /* --------------------------------------------------- Informações de conexão */

  @Get('v1/gestao/fluxos/:id/conexao')
  @ComSessao()
  async conexao(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
  ): Promise<ConexaoDoFluxo> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) =>
      carregarConexaoDoFluxo(tx, sessao.tenantId, sessao.usuarioId, id),
    );
  }

  @Put('v1/gestao/fluxos/:id/conexao')
  @ComSessao()
  async salvarConexao(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Body() corpo: CorpoDeConexao,
  ): Promise<ConexaoDoFluxo> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    const pedido: PedidoDeConexao = {};
    if (corpo?.urlMensagens !== undefined) {
      pedido.urlMensagens = corpo.urlMensagens === null ? null : String(corpo.urlMensagens);
    }
    if (corpo?.urlNotificacoes !== undefined) {
      pedido.urlNotificacoes = corpo.urlNotificacoes === null ? null : String(corpo.urlNotificacoes);
    }
    return noTenant(sessao.tenantId, (tx) =>
      salvarConexaoDoFluxo(tx, sessao.tenantId, sessao.usuarioId, id, pedido),
    );
  }

  /* ---------------------------------------------------------------- Webhook */

  @Get('v1/gestao/webhooks')
  @ComSessao()
  async webhooks(@Req() requisicao: RequisicaoComSessao): Promise<WebhookDeSaida[]> {
    const sessao = sessaoDe(requisicao);
    return noTenant(sessao.tenantId, (tx) => listarWebhooks(tx, sessao.tenantId, sessao.usuarioId));
  }

  @Post('v1/gestao/webhooks')
  @ComSessao()
  async criarWebhook(
    @Req() requisicao: RequisicaoComSessao,
    @Body() corpo: CorpoDeWebhook,
  ): Promise<WebhookDeSaidaCriado> {
    const sessao = sessaoDe(requisicao);
    const pedido: PedidoDeWebhook = {
      url: typeof corpo?.url === 'string' ? corpo.url : '',
      eventos: Array.isArray(corpo?.eventos) ? (corpo.eventos as unknown[]).map(String) : [],
      autenticacao: corpo?.autenticacao,
      cabecalhos: corpo?.cabecalhos,
    };
    return noTenant(sessao.tenantId, (tx) =>
      criarWebhook(tx, sessao.tenantId, sessao.usuarioId, pedido),
    );
  }

  @Patch('v1/gestao/webhooks/:webhookId')
  @ComSessao()
  async editarWebhook(
    @Req() requisicao: RequisicaoComSessao,
    @Param('webhookId') webhookId: string,
    @Body() corpo: CorpoDeWebhook,
  ): Promise<WebhookDeSaida> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(webhookId, 'webhook');
    const pedido: PedidoDeEdicaoDeWebhook = {};
    if (typeof corpo?.url === 'string') pedido.url = corpo.url;
    if (Array.isArray(corpo?.eventos)) pedido.eventos = (corpo.eventos as unknown[]).map(String);
    if (typeof corpo?.ativo === 'boolean') pedido.ativo = corpo.ativo;
    if (corpo?.autenticacao !== undefined) pedido.autenticacao = corpo.autenticacao;
    if (corpo?.cabecalhos !== undefined) pedido.cabecalhos = corpo.cabecalhos;
    return noTenant(sessao.tenantId, (tx) =>
      editarWebhook(tx, sessao.tenantId, sessao.usuarioId, webhookId, pedido),
    );
  }

  @Delete('v1/gestao/webhooks/:webhookId')
  @HttpCode(204)
  @ComSessao()
  async excluirWebhook(
    @Req() requisicao: RequisicaoComSessao,
    @Param('webhookId') webhookId: string,
  ): Promise<void> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(webhookId, 'webhook');
    await noTenant(sessao.tenantId, (tx) =>
      excluirWebhook(tx, sessao.tenantId, sessao.usuarioId, webhookId),
    );
  }

  @Post('v1/gestao/webhooks/:webhookId/testar')
  @HttpCode(200)
  @ComSessao()
  async testarWebhook(
    @Req() requisicao: RequisicaoComSessao,
    @Param('webhookId') webhookId: string,
  ): Promise<ResultadoDoTeste> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(webhookId, 'webhook');
    return noTenant(sessao.tenantId, (tx) =>
      testarWebhook(tx, sessao.tenantId, sessao.usuarioId, webhookId),
    );
  }
}
