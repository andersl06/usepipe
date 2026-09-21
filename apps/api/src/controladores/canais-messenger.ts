import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { noTenant } from '../banco.js'; import { conectarMessengerManual, desconectarMessenger, listarCanaisMessenger } from '../dominio/messenger/canal.js'; import { ComSessao, exigirPermissao, sessaoDe } from '../sessao.js'; import type { RequisicaoComSessao } from '../sessao.js';
import { fluxoIdDoCorpo, ligarAoFluxo, permitidoConectar } from './conexao-no-fluxo.js';
/** Com `fluxo_id`, a permissão é a do bot e o canal nasce ligado a ele (`conexao-no-fluxo.ts`). */
@Controller('v1/canais/messenger') export class ControladorCanaisMessenger {
 @Get() @ComSessao() async listar(@Req() r: RequisicaoComSessao) { const s=sessaoDe(r); await permitido(s.tenantId,s.usuarioId); return { canais: await listarCanaisMessenger(s.tenantId) }; }
 @Post('manual') @HttpCode(201) @ComSessao() async manual(@Req() r: RequisicaoComSessao,@Body() c:{access_token?:string;app_secret?:string;nome?:string;fluxo_id?:string}) { const s=sessaoDe(r); const fluxoId=fluxoIdDoCorpo(c); await permitidoConectar(s.tenantId,s.usuarioId,fluxoId); const x=await conectarMessengerManual({tenantId:s.tenantId,usuarioId:s.usuarioId,token:c?.access_token?.trim(),appSecret:c?.app_secret?.trim(),nome:c?.nome}); if (fluxoId) await ligarAoFluxo(s.tenantId,s.usuarioId,fluxoId,x.canal.id); return {...x.canal,erroDeWebhook:x.erroDeWebhook,webhook:x.webhook}; }
 @Delete(':id') @ComSessao() async desconectar(@Req() r: RequisicaoComSessao,@Param('id') id:string) { const s=sessaoDe(r); await permitido(s.tenantId,s.usuarioId); return desconectarMessenger(s.tenantId,s.usuarioId,id); }
}
function permitido(t:string,u:string){return noTenant(t,tx=>exigirPermissao(tx,u,'canal.gerenciar'));}
