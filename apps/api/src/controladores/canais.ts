import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { noTenant } from '../banco.js';
import { desconectarWhatsApp, lerCanalVisivel, listarCanaisWhatsApp } from '../dominio/canais.js';
import type { CanalWhatsAppVisivel } from '../dominio/canais.js';
import { executarCadastroEmbutido, validarParametros } from '../dominio/whatsapp/cadastro-embutido.js';
import { lerCanalWhatsApp } from '../dominio/whatsapp/canal.js';
import { modoDaConexao, versaoDaApi } from '../dominio/whatsapp/cliente-graph.js';
import { executarConfiguracaoManual } from '../dominio/whatsapp/configuracao-manual.js';
import { conferirEstado, emitirEstado } from '../dominio/whatsapp/estado-de-conexao.js';
import { criarModeloNaMeta, excluirModeloNaMeta, sincronizarModelos } from '../dominio/whatsapp/modelos.js';
import type { PedidoDeModelo, ResultadoDaSincronizacao } from '../dominio/whatsapp/modelos.js';
import { gravarPerfilDoCanal, lerPerfilDoCanal } from '../dominio/whatsapp/perfil.js';
import { gravarPreferencias, lerPreferencias } from '../dominio/whatsapp/preferencias.js';
import type { PedidoDePreferencias, PreferenciasDoCanal } from '../dominio/whatsapp/preferencias.js';
import type { PedidoDePerfil, PerfilVisivel } from '../dominio/whatsapp/perfil.js';
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
    corpo: {
      waba_id?: string;
      phone_number_id?: string;
      access_token?: string;
      app_secret?: string;
      nome?: string;
    },
  ): Promise<
    CanalWhatsAppVisivel & { erroDeWebhook: string | null; webhook: { url: string; verifyToken: string } }
  > {
    const sessao = sessaoDe(requisicao);
    await permitido(sessao.tenantId, sessao.usuarioId, 'canal.gerenciar');
    const feito = await executarConfiguracaoManual({
      tenantId: sessao.tenantId,
      usuarioId: sessao.usuarioId,
      wabaId: corpo.waba_id?.trim(),
      numeroId: corpo.phone_number_id?.trim(),
      token: corpo.access_token?.trim(),
      appSecret: corpo.app_secret?.trim(),
      nome: corpo.nome,
    });
    return {
      ...(await lerCanalVisivel(sessao.tenantId, feito.canal.id)),
      erroDeWebhook: feito.erroDeWebhook,
      webhook: feito.webhook,
    };
  }

  /**
   * O perfil comercial do número (foto, recado, descrição, endereço, e-mail,
   * sites, categoria) e, só para leitura, o nome de exibição com o status da
   * análise da Meta. Ver `dominio/whatsapp/perfil.ts`.
   */
  @Get('whatsapp/:id/perfil')
  @ComSessao()
  async perfil(@Req() requisicao: RequisicaoComSessao, @Param('id') id: string): Promise<PerfilVisivel> {
    const sessao = sessaoDe(requisicao);
    await permitido(sessao.tenantId, sessao.usuarioId, 'canal.gerenciar');
    return lerPerfilDoCanal(sessao.tenantId, id);
  }

  @Patch('whatsapp/:id/perfil')
  @ComSessao()
  async gravarPerfil(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Body() corpo: PedidoDePerfil,
  ): Promise<PerfilVisivel> {
    const sessao = sessaoDe(requisicao);
    await permitido(sessao.tenantId, sessao.usuarioId, 'canal.gerenciar');
    return gravarPerfilDoCanal(sessao.tenantId, sessao.usuarioId, id, corpo ?? {});
  }

  /** Abas "Configurações" e "Configurações de alerta" do canal. Ver `dominio/whatsapp/preferencias.ts`. */
  @Get('whatsapp/:id/preferencias')
  @ComSessao()
  async preferencias(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
  ): Promise<PreferenciasDoCanal> {
    const sessao = sessaoDe(requisicao);
    await permitido(sessao.tenantId, sessao.usuarioId, 'canal.gerenciar');
    return lerPreferencias(sessao.tenantId, id);
  }

  @Patch('whatsapp/:id/preferencias')
  @ComSessao()
  async gravarPreferencias(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Body() corpo: PedidoDePreferencias,
  ): Promise<PreferenciasDoCanal> {
    const sessao = sessaoDe(requisicao);
    await permitido(sessao.tenantId, sessao.usuarioId, 'canal.gerenciar');
    return gravarPreferencias(sessao.tenantId, sessao.usuarioId, id, corpo);
  }

  /** Traz da Meta todos os modelos da WABA do canal. Ver `dominio/whatsapp/modelos.ts`. */
  @Post('whatsapp/:id/modelos/sincronizar')
  @HttpCode(200)
  @ComSessao()
  async sincronizarModelos(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
  ): Promise<ResultadoDaSincronizacao> {
    const sessao = sessaoDe(requisicao);
    await permitido(sessao.tenantId, sessao.usuarioId, 'canal.gerenciar');
    return sincronizarModelos(sessao.tenantId, sessao.usuarioId, id);
  }

  /** Cria o modelo na Meta (vai para análise) e grava a cópia `pendente`. */
  @Post('whatsapp/:id/modelos')
  @HttpCode(201)
  @ComSessao()
  async criarModelo(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Body() corpo: PedidoDeModelo,
  ): Promise<{ id: string; statusMeta: string }> {
    const sessao = sessaoDe(requisicao);
    await permitido(sessao.tenantId, sessao.usuarioId, 'canal.gerenciar');
    return criarModeloNaMeta(sessao.tenantId, sessao.usuarioId, id, corpo ?? {});
  }

  /** Apaga na Meta, pelo nome (todos os idiomas), e aqui. */
  @Delete('whatsapp/:id/modelos/:nome')
  @ComSessao()
  async excluirModelo(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Param('nome') nome: string,
  ): Promise<{ removidos: number }> {
    const sessao = sessaoDe(requisicao);
    await permitido(sessao.tenantId, sessao.usuarioId, 'canal.gerenciar');
    return excluirModeloNaMeta(sessao.tenantId, sessao.usuarioId, id, nome);
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
