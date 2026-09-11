import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { noTenant } from '../banco.js';
import { desconectarWhatsApp, lerCanalVisivel, listarCanaisWhatsApp } from '../dominio/canais.js';
import type { CanalWhatsAppVisivel } from '../dominio/canais.js';
import { executarCadastroEmbutido, validarParametros } from '../dominio/whatsapp/cadastro-embutido.js';
import { lerCanalWhatsApp } from '../dominio/whatsapp/canal.js';
import { modoDaConexao, versaoDaApi } from '../dominio/whatsapp/cliente-graph.js';
import { executarConfiguracaoManual } from '../dominio/whatsapp/configuracao-manual.js';
import { conferirEstado, emitirEstado } from '../dominio/whatsapp/estado-de-conexao.js';
import { ComSessao, exigirPermissao, sessaoDe } from '../sessao.js';
import type { RequisicaoComSessao } from '../sessao.js';

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
 */
@Controller('v1/canais')
export class ControladorCanais {
  /** O que a tela de Canais mostra: ligado, número, qualidade e limite. */
  @Get('whatsapp')
  @ComSessao()
  async listar(@Req() requisicao: RequisicaoComSessao): Promise<{ canais: CanalWhatsAppVisivel[] }> {
    const sessao = sessaoDe(requisicao);
    await permitido(sessao.tenantId, sessao.usuarioId, 'canal.gerenciar');
    return { canais: await listarCanaisWhatsApp(sessao.tenantId) };
  }

  /**
   * O ponto de partida do cadastro embutido: o `state` desta abertura e o que o
   * SDK da Meta precisa. Acréscimo do Pipe (`estado-de-conexao.ts`); no Chatwoot
   * esses valores vêm de `window.chatwootConfig` e não há `state`.
   */
  @Post('whatsapp/estado')
  @HttpCode(201)
  @ComSessao()
  async iniciar(@Req() requisicao: RequisicaoComSessao): Promise<Record<string, string>> {
    const sessao = sessaoDe(requisicao);
    await permitido(sessao.tenantId, sessao.usuarioId, 'canal.gerenciar');
    return {
      estado: emitirEstado(sessao.tenantId, sessao.usuarioId),
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
  @ComSessao()
  async conectar(
    @Req() requisicao: RequisicaoComSessao,
    @Body()
    corpo: {
      codigo?: string;
      waba_id?: string;
      phone_number_id?: string;
      business_id?: string;
      coexistencia?: boolean;
      canal_id?: string;
      estado?: string;
    },
  ): Promise<CanalWhatsAppVisivel & { mensagem?: string }> {
    const sessao = sessaoDe(requisicao);
    await permitido(sessao.tenantId, sessao.usuarioId, 'canal.gerenciar');
    conferirEstado(corpo.estado, sessao.tenantId, sessao.usuarioId);
    validarParametros({ codigo: corpo.codigo, wabaId: corpo.waba_id });

    // `fetch_and_validate_inbox`: o canal a reautorizar tem de ser deste tenant.
    if (corpo.canal_id) await lerCanalWhatsApp(sessao.tenantId, corpo.canal_id);

    const canal = await executarCadastroEmbutido({
      tenantId: sessao.tenantId,
      usuarioId: sessao.usuarioId,
      codigo: corpo.codigo,
      wabaId: corpo.waba_id,
      numeroId: corpo.phone_number_id,
      coexistencia: corpo.coexistencia === true,
      canalId: corpo.canal_id,
    });

    const visivel = await lerCanalVisivel(sessao.tenantId, canal.id);
    return corpo.canal_id ? { ...visivel, mensagem: 'Reautorização concluída.' } : visivel;
  }

  /**
   * O caminho sem cadastro embutido: WABA ID, Phone Number ID e token de usuário
   * de sistema, validados antes de gravar (porte de `manual_setup_service.rb`).
   * O token vem no corpo porque é o do cliente; ele sai daqui cifrado e não é
   * devolvido.
   */
  @Post('whatsapp/manual')
  @HttpCode(201)
  @ComSessao()
  async manual(
    @Req() requisicao: RequisicaoComSessao,
    @Body()
    corpo: { waba_id?: string; phone_number_id?: string; access_token?: string; nome?: string },
  ): Promise<CanalWhatsAppVisivel & { erroDeWebhook: string | null }> {
    const sessao = sessaoDe(requisicao);
    await permitido(sessao.tenantId, sessao.usuarioId, 'canal.gerenciar');
    const feito = await executarConfiguracaoManual({
      tenantId: sessao.tenantId,
      usuarioId: sessao.usuarioId,
      wabaId: corpo.waba_id?.trim(),
      numeroId: corpo.phone_number_id?.trim(),
      token: corpo.access_token?.trim(),
      nome: corpo.nome,
    });
    return {
      ...(await lerCanalVisivel(sessao.tenantId, feito.canal.id)),
      erroDeWebhook: feito.erroDeWebhook,
    };
  }

  /** Desconecta: desmonta o webhook e desliga o canal. Conversa e mensagem ficam. */
  @Delete('whatsapp/:id')
  @ComSessao()
  async desconectar(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
  ): Promise<CanalWhatsAppVisivel> {
    const sessao = sessaoDe(requisicao);
    await permitido(sessao.tenantId, sessao.usuarioId, 'canal.gerenciar');
    return desconectarWhatsApp(sessao.tenantId, sessao.usuarioId, id);
  }
}

function permitido(tenantId: string, usuarioId: string, codigo: string): Promise<void> {
  return noTenant(tenantId, (tx) => exigirPermissao(tx, usuarioId, codigo));
}
