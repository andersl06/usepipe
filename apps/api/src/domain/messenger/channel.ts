import { sql } from 'drizzle-orm';
import { cifrarConfig, decifrarConfig, registrarAuditoria } from '@pipe/db';
import { databaseOwner, keyring, esquecerChannel, noTenant } from '../../database.js';
import { PipeError } from '../../errors.js';
import { novoVerifyToken, texto } from '../whatsapp/channel.js';
import { clienteGraphMessenger } from './cliente-graph.js';

const UUID = /^[0-9a-f-]{36}$/i;
const SECRET = /^[0-9a-f]{32}$/i;
type Linha = { id: string; tenant_id: string; name: string; active: boolean; numero_id: string | null; createdAt: Date | string; config: Record<string, unknown> | null };
export interface ChannelMessenger { id: string; tenantId: string; pageId: string; config: Record<string, unknown>; active: boolean }
export interface ChannelMessengerVisible { id: string; name: string; active: boolean; paginaId: string | null; state: 'conectado' | 'desligado'; webhookUrl: string; criadoEm: Date }
export function urlDoWebhookMessenger(id: string): string { return `${(process.env['PIPE_URL_API'] ?? 'http://localhost:3100').replace(/\/$/, '')}/webhooks/messenger/${id}`; }
const visivel = (l: Linha): ChannelMessengerVisible => ({ id: l.id, nome: l.nome, ativo: l.ativo, paginaId: l.numero_id, state: l.ativo ? 'conectado' : 'desligado', webhookUrl: urlDoWebhookMessenger(l.id), criadoEm: l.criado_em instanceof Date ? l.criado_em : new Date(l.criado_em) });
const recusa = (m: string) => new PipeError(422, 'configuration_invalid', m);
export async function readChannelMessenger(tenantId: string, id: string): Promise<ChannelMessenger> {
  if (!UUID.test(id)) throw PipeError.naoEncontrado('Canal');
  const linha = await noTenant(tenantId, async tx => (await tx.execute<Linha>(sql`select id, tenant_id, nome, ativo, numero_id, criado_em, config from canal where id=${id}::uuid and tipo='messenger' limit 1`)).rows[0]);
  if (!linha) throw PipeError.naoEncontrado('Canal');
  return { id: linha.id, tenantId: linha.tenant_id, pageId: linha.numero_id ?? '', ativo: linha.ativo, config: decifrarConfig(linha.config ?? {}, keyring()) };
}
export async function listChannelsMessenger(tenantId: string): Promise<ChannelMessengerVisible[]> { return noTenant(tenantId, async tx => (await tx.execute<Linha>(sql`select id, tenant_id, nome, ativo, numero_id, criado_em, config from canal where tipo='messenger' order by criado_em`)).rows.map(visivel)); }
export async function conectarMessengerManual(pedido: { tenantId: string; userId: string; token?: string; appSecret?: string; name?: string }): Promise<{ channel: ChannelMessengerVisible; webhookError: string | null; webhook: { url: string; verifyToken: string } }> {
  if (!pedido.token) throw recusa('O token de página é obrigatório.'); if (!pedido.appSecret) throw recusa('O App Secret é obrigatório.'); if (!SECRET.test(pedido.appSecret)) throw recusa('O App Secret tem 32 caracteres, só números e letras de a a f.');
  const cliente = clienteGraphMessenger(pedido.token); let page;
  try { page = await cliente.fetchPage(); } catch (error) { if (error instanceof PipeError && error.codigo === 'meta_refused') throw recusa('O token não foi aceito pelo Facebook Messenger.'); throw error; }
  const pageId = String(page.id ?? ''); if (!pageId) throw recusa('O token não é de uma Página do Facebook.'); if (!(await cliente.checkSecretOfApp(pedido.appSecret))) throw recusa('Este App Secret não é do aplicativo que gerou o token.');
  const existente = (await databaseOwner().execute<{ id: string; tenant_id: string; active: boolean }>(sql`select id, tenant_id, ativo from canal where numero_id=${pageId} limit 1`)).rows[0];
  if (existente && (existente.tenant_id !== pedido.tenantId || existente.ativo)) throw recusa('Esta Página do Facebook já está conectada a outra caixa de entrada.');
  const nome = pedido.nome?.trim() || `${page.name ?? pageId} Messenger`; const configNovo = { tokenAcesso: pedido.token, appSecret: pedido.appSecret, verifyToken: novoVerifyToken(), pageId, apiVersao: process.env['MESSENGER_API_VERSAO'] ?? 'v23.0', origem: 'manual' };
  const id = await noTenant(pedido.tenantId, async tx => { let channelId: string;
    if (existente) { await tx.execute(sql`update canal set ativo=true, config=${JSON.stringify(cifrarConfig(configNovo, keyring()))}::jsonb, atualizado_em=now() where id=${existente.id}::uuid`); channelId = existente.id; }
    else { channelId = (await tx.execute<{id:string}>(sql`insert into canal (tenant_id,tipo,nome,config,numero_id) values (${pedido.tenantId}::uuid,'messenger',${nome},${JSON.stringify(cifrarConfig(configNovo, keyring()))}::jsonb,${pageId}) returning id`)).rows[0]!.id; const queue = (await tx.execute<{id:string}>(sql`select id from fila where ativa order by ordem, criado_em limit 1`)).rows[0]; await tx.execute(sql`insert into inbox (tenant_id,canal_id,nome,fila_padrao_id) values (${pedido.tenantId}::uuid,${channelId}::uuid,${nome},${queue?.id ?? null})`); }
    await registrarAuditoria(tx, pedido.tenantId, { ator: { tipo: 'usuario', id: pedido.userId }, acao: existente ? 'ativou' : 'criou', objetoTipo: 'canal', objetoId: channelId, depois: { id: channelId, tipo: 'messenger', pagina_id: pageId } }); return channelId;
  }); esquecerChannel(id); let errorOfWebhook: string | null = null; try { await cliente.assinarWebhook(pageId); } catch (erro) { errorOfWebhook = (erro as Error).message; }
  const linha = await noTenant(pedido.tenantId, async tx => (await tx.execute<Linha>(sql`select id,tenant_id,nome,ativo,numero_id,criado_em,config from canal where id=${id}::uuid`)).rows[0]!); return { channel: visivel(linha), errorOfWebhook, webhook: { url: urlDoWebhookMessenger(id), verifyToken: configNovo.verifyToken } };
}
export async function desconectarMessenger(tenantId: string, userId: string, id: string): Promise<ChannelMessengerVisible> { const channel = await readChannelMessenger(tenantId, id); const token = texto(channel.config['tokenAcesso']); if (token) await clienteGraphMessenger(token).desassinarWebhook(channel.pageId).catch(() => undefined); const linha = await noTenant(tenantId, async tx => { const r=(await tx.execute<Linha>(sql`update canal set ativo=false, atualizado_em=now() where id=${id}::uuid and tipo='messenger' returning id,tenant_id,nome,ativo,numero_id,criado_em,config`)).rows[0]; if(!r) throw PipeError.naoEncontrado('Canal'); await registrarAuditoria(tx,tenantId,{ator:{tipo:'usuario',id:userId},acao:'desativou',objetoTipo:'canal',objetoId:id,depois:{id,ativo:false}}); return r; }); esquecerChannel(id); return visivel(linha); }
export async function aplicarPerfilMessenger(channel: ChannelMessenger, perfil: Record<string, unknown>): Promise<void> { const token=texto(channel.config['tokenAcesso']); if (!token) throw new PipeError(422,'canal_sem_credencial','O canal não tem token de acesso.'); await clienteGraphMessenger(token).configurarPerfil(perfil); }
