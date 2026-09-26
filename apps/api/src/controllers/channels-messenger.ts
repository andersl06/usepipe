import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { noTenant } from '../database.js'; import { conectarMessengerManual, desconectarMessenger, listChannelsMessenger } from '../domain/messenger/channel.js'; import { WithSession, exigirPermission, sessionOf } from '../session.js'; import type { RequestWithSession } from '../session.js';
import { flowIdOfBody, connectToFlow, permitidoConectar } from './connection-in-flow.js';
/** With `fluxo_id`, bot permission applies and the channel is linked to that bot (`conexao-no-fluxo.ts`). */
@Controller('v1/channels/messenger') export class MessengerChannelsController {
 @Get() @WithSession() async listar(@Req() r: RequestWithSession) { const s=sessionOf(r); await permitido(s.tenantId,s.userId); return { channels: await listChannelsMessenger(s.tenantId) }; }
 @Post('manual') @HttpCode(201) @WithSession() async manual(@Req() r: RequestWithSession,@Body() c:{access_token?:string;app_secret?:string;name?:string;flowId?:string}) { const s=sessionOf(r); const flowId=flowIdOfBody(c); await permitidoConectar(s.tenantId,s.userId,flowId); const x=await conectarMessengerManual({tenantId:s.tenantId,userId:s.userId,token:c?.access_token?.trim(),appSecret:c?.app_secret?.trim(),name:c?.name}); if (flowId) await connectToFlow(s.tenantId,s.userId,flowId,x.channel.id); return {...x.channel,webhookError:x.webhookError,webhook:x.webhook}; }
 @Delete(':id') @WithSession() async desconectar(@Req() r: RequestWithSession,@Param('id') id:string) { const s=sessionOf(r); await permitido(s.tenantId,s.userId); return desconectarMessenger(s.tenantId,s.userId,id); }
}
function permitido(t:string,u:string){return noTenant(t,tx=>exigirPermission(tx,u,'canal.gerenciar'));}
