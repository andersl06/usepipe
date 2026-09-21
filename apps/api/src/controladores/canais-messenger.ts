import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { noTenant } from '../banco.js'; import { conectarMessengerManual, desconectarMessenger, listarCanaisMessenger } from '../dominio/messenger/canal.js'; import { ComSessao, exigirPermissao, sessaoDe } from '../sessao.js'; import type { RequisicaoComSessao } from '../sessao.js';
@Controller('v1/canais/messenger') export class ControladorCanaisMessenger {
 @Get() @ComSessao() async listar(@Req() r: RequisicaoComSessao) { const s=sessaoDe(r); await permitido(s.tenantId,s.usuarioId); return { canais: await listarCanaisMessenger(s.tenantId) }; }
 @Post('manual') @HttpCode(201) @ComSessao() async manual(@Req() r: RequisicaoComSessao,@Body() c:{access_token?:string;app_secret?:string;nome?:string}) { const s=sessaoDe(r); await permitido(s.tenantId,s.usuarioId); const x=await conectarMessengerManual({tenantId:s.tenantId,usuarioId:s.usuarioId,token:c?.access_token?.trim(),appSecret:c?.app_secret?.trim(),nome:c?.nome}); return {...x.canal,erroDeWebhook:x.erroDeWebhook,webhook:x.webhook}; }
 @Delete(':id') @ComSessao() async desconectar(@Req() r: RequisicaoComSessao,@Param('id') id:string) { const s=sessaoDe(r); await permitido(s.tenantId,s.usuarioId); return desconectarMessenger(s.tenantId,s.usuarioId,id); }
}
function permitido(t:string,u:string){return noTenant(t,tx=>exigirPermissao(tx,u,'canal.gerenciar'));}
