import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { noTenant } from '../banco.js';
import { conectarInstagramManual, desconectarInstagram, listarCanaisInstagram } from '../dominio/instagram/canal.js';
import type { CanalInstagramVisivel, ConexaoInstagram } from '../dominio/instagram/canal.js';
import { ComSessao, exigirPermissao, sessaoDe } from '../sessao.js';
import type { RequisicaoComSessao } from '../sessao.js';

/**
 * A casca HTTP de "conectar o Instagram" pelo caminho manual. A regra mora em
 * `dominio/instagram/`. Mesmas travas do WhatsApp (`canais.ts`): sessão de navegador,
 * `canal.gerenciar` em toda rota, e o tenant SEMPRE da sessão — canal de outro
 * cliente é 404.
 */
@Controller('v1/canais/instagram')
export class ControladorCanaisInstagram {
  @Get()
  @ComSessao()
  async listar(@Req() requisicao: RequisicaoComSessao): Promise<{ canais: CanalInstagramVisivel[] }> {
    const sessao = sessaoDe(requisicao);
    await permitido(sessao.tenantId, sessao.usuarioId);
    return { canais: await listarCanaisInstagram(sessao.tenantId) };
  }

  /** O token e o App Secret são do app do cliente; saem daqui cifrados e não voltam. */
  @Post('manual')
  @HttpCode(201)
  @ComSessao()
  async manual(
    @Req() requisicao: RequisicaoComSessao,
    @Body() corpo: { access_token?: string; app_secret?: string; nome?: string },
  ): Promise<CanalInstagramVisivel & Omit<ConexaoInstagram, 'canal'>> {
    const sessao = sessaoDe(requisicao);
    await permitido(sessao.tenantId, sessao.usuarioId);
    const feito = await conectarInstagramManual({
      tenantId: sessao.tenantId,
      usuarioId: sessao.usuarioId,
      token: corpo?.access_token?.trim(),
      appSecret: corpo?.app_secret?.trim(),
      nome: corpo?.nome,
    });
    return { ...feito.canal, erroDeWebhook: feito.erroDeWebhook, webhook: feito.webhook };
  }

  @Delete(':id')
  @ComSessao()
  async desconectar(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
  ): Promise<CanalInstagramVisivel> {
    const sessao = sessaoDe(requisicao);
    await permitido(sessao.tenantId, sessao.usuarioId);
    return desconectarInstagram(sessao.tenantId, sessao.usuarioId, id);
  }
}

function permitido(tenantId: string, usuarioId: string): Promise<void> {
  return noTenant(tenantId, (tx) => exigirPermissao(tx, usuarioId, 'canal.gerenciar'));
}
