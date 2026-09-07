import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { noTenant } from '../banco.js';
import {
  conectarWhatsApp,
  desconectarWhatsApp,
  listarCanaisWhatsApp,
} from '../dominio/canais.js';
import type { CanalWhatsAppVisivel } from '../dominio/canais.js';
import { ComSessao, exigirPermissao, sessaoDe } from '../sessao.js';
import type { RequisicaoComSessao } from '../sessao.js';

/**
 * A casca HTTP de "conectar o WhatsApp". A regra mora em `dominio/canais.ts`.
 *
 * Sessão de navegador, não chave de API: quem conecta um canal é o administrador
 * do cliente clicando na tela de Canais depois de voltar do cadastro embutido da
 * Meta. E `canal.gerenciar`, porque conectar grava a credencial que manda mensagem
 * **pelo número do cliente**.
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
   * Conclui a conexão com o `code` que o cadastro embutido devolveu.
   *
   * 201 e não 200: a chamada cria (ou reergue) um canal. O corpo traz `webhookUrl`
   * para diagnóstico — ela não é segredo, quem protege o webhook é a assinatura.
   */
  @Post('whatsapp')
  @HttpCode(201)
  @ComSessao()
  async conectar(
    @Req() requisicao: RequisicaoComSessao,
    @Body() corpo: { codigo?: string; nome?: string },
  ): Promise<CanalWhatsAppVisivel> {
    const sessao = sessaoDe(requisicao);
    await permitido(sessao.tenantId, sessao.usuarioId, 'canal.gerenciar');
    return conectarWhatsApp({
      tenantId: sessao.tenantId,
      usuarioId: sessao.usuarioId,
      codigo: corpo.codigo ?? '',
      nome: corpo.nome,
    });
  }

  /**
   * Desconecta: apaga o override na Meta e desliga o canal. Conversa e mensagem
   * ficam — são do cliente.
   */
  @Delete('whatsapp/:id')
  @ComSessao()
  async desconectar(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Query('forcar') forcar: string | undefined,
  ): Promise<CanalWhatsAppVisivel> {
    const sessao = sessaoDe(requisicao);
    await permitido(sessao.tenantId, sessao.usuarioId, 'canal.gerenciar');
    return desconectarWhatsApp(sessao.tenantId, sessao.usuarioId, id, forcar === 'true');
  }
}

function permitido(tenantId: string, usuarioId: string, codigo: string): Promise<void> {
  return noTenant(tenantId, (tx) => exigirPermissao(tx, usuarioId, codigo));
}
