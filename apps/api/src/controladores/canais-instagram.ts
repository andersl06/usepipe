import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { noTenant } from '../banco.js';
import { conectarInstagramManual, desconectarInstagram, listarCanaisInstagram } from '../dominio/instagram/canal.js';
import type { CanalInstagramVisivel, ConexaoInstagram } from '../dominio/instagram/canal.js';
import { ComSessao, exigirPermissao, sessaoDe } from '../sessao.js';
import type { RequisicaoComSessao } from '../sessao.js';
import { fluxoIdDoCorpo, ligarAoFluxo, permitidoConectar } from './conexao-no-fluxo.js';

/**
 * A casca HTTP de "conectar o Instagram" pelo caminho manual. A regra mora em
 * `dominio/instagram/`. Mesmas travas do WhatsApp (`canais.ts`): sessão de navegador,
 * `canal.gerenciar` em toda rota, e o tenant SEMPRE da sessão — canal de outro
 * cliente é 404. Com `fluxo_id`, a permissão é a do bot e o canal nasce ligado
 * a ele (`permitidoConectar`/`ligarAoFluxo`, em `canais.ts`).
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
    @Body() corpo: { access_token?: string; app_secret?: string; nome?: string; fluxo_id?: string },
  ): Promise<CanalInstagramVisivel & Omit<ConexaoInstagram, 'canal'>> {
    const sessao = sessaoDe(requisicao);
    const fluxoId = fluxoIdDoCorpo(corpo);
    await permitidoConectar(sessao.tenantId, sessao.usuarioId, fluxoId);
    const feito = await conectarInstagramManual({
      tenantId: sessao.tenantId,
      usuarioId: sessao.usuarioId,
      token: corpo?.access_token?.trim(),
      appSecret: corpo?.app_secret?.trim(),
      nome: corpo?.nome,
    });
    if (fluxoId) await ligarAoFluxo(sessao.tenantId, sessao.usuarioId, fluxoId, feito.canal.id);
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
