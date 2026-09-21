import { sql } from 'drizzle-orm';
import { cifrarConfig, decifrarConfig, registrarAuditoria } from '@pipe/db';
import { bancoDono, chaveiro, esquecerCanal, noTenant } from '../../banco.js';
import { ErroPipe } from '../../erros.js';
import { novoVerifyToken, texto } from '../whatsapp/canal.js';
import { clienteGraphMessenger } from './cliente-graph.js';

const UUID = /^[0-9a-f-]{36}$/i;
const SEGREDO = /^[0-9a-f]{32}$/i;
type Linha = { id: string; tenant_id: string; nome: string; ativo: boolean; numero_id: string | null; criado_em: Date | string; config: Record<string, unknown> | null };
export interface CanalMessenger { id: string; tenantId: string; paginaId: string; config: Record<string, unknown>; ativo: boolean }
export interface CanalMessengerVisivel { id: string; nome: string; ativo: boolean; paginaId: string | null; estado: 'conectado' | 'desligado'; webhookUrl: string; criadoEm: Date }
export function urlDoWebhookMessenger(id: string): string { return `${(process.env['PIPE_URL_API'] ?? 'http://localhost:3100').replace(/\/$/, '')}/webhooks/messenger/${id}`; }
const visivel = (l: Linha): CanalMessengerVisivel => ({ id: l.id, nome: l.nome, ativo: l.ativo, paginaId: l.numero_id, estado: l.ativo ? 'conectado' : 'desligado', webhookUrl: urlDoWebhookMessenger(l.id), criadoEm: l.criado_em instanceof Date ? l.criado_em : new Date(l.criado_em) });
const recusa = (m: string) => new ErroPipe(422, 'configuracao_invalida', m);
export async function lerCanalMessenger(tenantId: string, id: string): Promise<CanalMessenger> {
  if (!UUID.test(id)) throw ErroPipe.naoEncontrado('Canal');
  const linha = await noTenant(tenantId, async tx => (await tx.execute<Linha>(sql`select id, tenant_id, nome, ativo, numero_id, criado_em, config from canal where id=${id}::uuid and tipo='messenger' limit 1`)).rows[0]);
  if (!linha) throw ErroPipe.naoEncontrado('Canal');
  return { id: linha.id, tenantId: linha.tenant_id, paginaId: linha.numero_id ?? '', ativo: linha.ativo, config: decifrarConfig(linha.config ?? {}, chaveiro()) };
}
export async function listarCanaisMessenger(tenantId: string): Promise<CanalMessengerVisivel[]> { return noTenant(tenantId, async tx => (await tx.execute<Linha>(sql`select id, tenant_id, nome, ativo, numero_id, criado_em, config from canal where tipo='messenger' order by criado_em`)).rows.map(visivel)); }
export async function conectarMessengerManual(pedido: { tenantId: string; usuarioId: string; token?: string; appSecret?: string; nome?: string }): Promise<{ canal: CanalMessengerVisivel; erroDeWebhook: string | null; webhook: { url: string; verifyToken: string } }> {
  if (!pedido.token) throw recusa('O token de página é obrigatório.'); if (!pedido.appSecret) throw recusa('O App Secret é obrigatório.'); if (!SEGREDO.test(pedido.appSecret)) throw recusa('O App Secret tem 32 caracteres, só números e letras de a a f.');
  const cliente = clienteGraphMessenger(pedido.token); let pagina;
  try { pagina = await cliente.buscarPagina(); } catch (erro) { if (erro instanceof ErroPipe && erro.codigo === 'meta_recusou') throw recusa('O token não foi aceito pelo Facebook Messenger.'); throw erro; }
  const paginaId = String(pagina.id ?? ''); if (!paginaId) throw recusa('O token não é de uma Página do Facebook.'); if (!(await cliente.conferirSegredoDoApp(pedido.appSecret))) throw recusa('Este App Secret não é do aplicativo que gerou o token.');
  const existente = (await bancoDono().execute<{ id: string; tenant_id: string; ativo: boolean }>(sql`select id, tenant_id, ativo from canal where numero_id=${paginaId} limit 1`)).rows[0];
  if (existente && (existente.tenant_id !== pedido.tenantId || existente.ativo)) throw recusa('Esta Página do Facebook já está conectada a outra caixa de entrada.');
  const nome = pedido.nome?.trim() || `${pagina.name ?? paginaId} Messenger`; const configNovo = { tokenAcesso: pedido.token, appSecret: pedido.appSecret, verifyToken: novoVerifyToken(), paginaId, apiVersao: process.env['MESSENGER_API_VERSAO'] ?? 'v23.0', origem: 'manual' };
  const id = await noTenant(pedido.tenantId, async tx => { let canalId: string;
    if (existente) { await tx.execute(sql`update canal set ativo=true, config=${JSON.stringify(cifrarConfig(configNovo, chaveiro()))}::jsonb, atualizado_em=now() where id=${existente.id}::uuid`); canalId = existente.id; }
    else { canalId = (await tx.execute<{id:string}>(sql`insert into canal (tenant_id,tipo,nome,config,numero_id) values (${pedido.tenantId}::uuid,'messenger',${nome},${JSON.stringify(cifrarConfig(configNovo, chaveiro()))}::jsonb,${paginaId}) returning id`)).rows[0]!.id; const fila = (await tx.execute<{id:string}>(sql`select id from fila where ativa order by ordem, criado_em limit 1`)).rows[0]; await tx.execute(sql`insert into inbox (tenant_id,canal_id,nome,fila_padrao_id) values (${pedido.tenantId}::uuid,${canalId}::uuid,${nome},${fila?.id ?? null})`); }
    await registrarAuditoria(tx, pedido.tenantId, { ator: { tipo: 'usuario', id: pedido.usuarioId }, acao: existente ? 'ativou' : 'criou', objetoTipo: 'canal', objetoId: canalId, depois: { id: canalId, tipo: 'messenger', pagina_id: paginaId } }); return canalId;
  }); esquecerCanal(id); let erroDeWebhook: string | null = null; try { await cliente.assinarWebhook(paginaId); } catch (erro) { erroDeWebhook = (erro as Error).message; }
  const linha = await noTenant(pedido.tenantId, async tx => (await tx.execute<Linha>(sql`select id,tenant_id,nome,ativo,numero_id,criado_em,config from canal where id=${id}::uuid`)).rows[0]!); return { canal: visivel(linha), erroDeWebhook, webhook: { url: urlDoWebhookMessenger(id), verifyToken: configNovo.verifyToken } };
}
export async function desconectarMessenger(tenantId: string, usuarioId: string, id: string): Promise<CanalMessengerVisivel> { const canal = await lerCanalMessenger(tenantId, id); const token = texto(canal.config['tokenAcesso']); if (token) await clienteGraphMessenger(token).desassinarWebhook(canal.paginaId).catch(() => undefined); const linha = await noTenant(tenantId, async tx => { const r=(await tx.execute<Linha>(sql`update canal set ativo=false, atualizado_em=now() where id=${id}::uuid and tipo='messenger' returning id,tenant_id,nome,ativo,numero_id,criado_em,config`)).rows[0]; if(!r) throw ErroPipe.naoEncontrado('Canal'); await registrarAuditoria(tx,tenantId,{ator:{tipo:'usuario',id:usuarioId},acao:'desativou',objetoTipo:'canal',objetoId:id,depois:{id,ativo:false}}); return r; }); esquecerCanal(id); return visivel(linha); }
export async function aplicarPerfilMessenger(canal: CanalMessenger, perfil: Record<string, unknown>): Promise<void> { const token=texto(canal.config['tokenAcesso']); if (!token) throw new ErroPipe(422,'canal_sem_credencial','O canal não tem token de acesso.'); await clienteGraphMessenger(token).configurarPerfil(perfil); }
