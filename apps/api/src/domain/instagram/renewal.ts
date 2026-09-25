import { sql } from 'drizzle-orm';
import { databaseOwner } from '../../database.js';
import { PipeError } from '../../errors.js';
import { texto } from '../whatsapp/channel.js';
import { atualizarConfigInstagram, readChannelInstagram, VALIDITY_OF_TOKEN_MS } from './channel.js';
import type { ChannelInstagram } from './channel.js';
import { clienteGraphInstagram } from './cliente-graph.js';

/**
 * Reconstruído de chatwoot/chatwoot (MIT), app/services/instagram/refresh_oauth_token_service.rb.
 *
 * O token de longa duração vale 60 dias e só pode ser renovado depois de 24h de
 * vida e antes de vencer. Renovar devolve outro token com mais 60 dias. A varredura
 * roda uma vez por dia (`agendarRenovacaoInstagram` em `filas.ts`) e renova todo
 * canal elegível — o token nunca chega perto de vencer.
 *
 * Token que a Meta recusa (revogado, vencido, senha trocada) não tem conserto aqui:
 * o canal é marcado com `reautorizacaoPendente`, a lista mostra `indisponivel`, e o
 * cliente cola um token novo pelo mesmo `POST /v1/canais/instagram/manual`.
 */

const UM_DIA_MS = 24 * 3600 * 1000;

export type ResultOfRenewal = 'renovado' | 'early_excessive' | 'expired' | 'refused';

/** `token_eligible_for_refresh?`: mais de 24h de vida e ainda não vencido. */
export function tokenElegivel(config: Record<string, unknown>, agora = new Date()): ResultOfRenewal | null {
  const renovadoEm = Date.parse(texto(config['tokenRenovadoEm']) ?? '');
  const expiraEm = Date.parse(texto(config['tokenExpiraEm']) ?? '');
  if (Number.isFinite(expiraEm) && expiraEm <= agora.getTime()) return 'expired';
  if (Number.isFinite(renovadoEm) && agora.getTime() - renovadoEm < UM_DIA_MS) return 'early_excessive';
  return null;
}

export async function renovarTokenOfChannel(
  channel: ChannelInstagram,
  agora = new Date(),
): Promise<ResultOfRenewal> {
  const token = texto(channel.config['tokenAcesso']);
  const blocker = token ? tokenElegivel(channel.config, agora) : 'vencido';
  if (blocker === 'early_excessive') return blocker;
  if (blocker === 'expired' || !token) {
    await atualizarConfigInstagram(channel, { reautorizacaoPendente: true });
    return 'expired';
  }

  try {
    const novo = await clienteGraphInstagram(token).renovarToken();
    if (!novo.access_token) throw new PipeError(502, 'meta_refused', 'A renovação voltou sem access_token.');
    const validityMs = (novo.expires_in ?? VALIDITY_OF_TOKEN_MS / 1000) * 1000;
    await atualizarConfigInstagram(channel, {
      tokenAcesso: novo.access_token,
      tokenRenovadoEm: agora.toISOString(),
      tokenExpiraEm: new Date(agora.getTime() + validityMs).toISOString(),
      reautorizacaoPendente: false,
    });
    return 'renovado';
  } catch (error) {
    // Só a recusa da Meta marca reautorização; rede fora tenta de novo amanhã.
    if (!(error instanceof PipeError && error.codigo === 'meta_refused')) throw error;
    console.error(`[instagram] o token do canal ${channel.id} foi recusado na renovação: ${error.message}`);
    await atualizarConfigInstagram(channel, { reautorizacaoPendente: true });
    return 'refused';
  }
}

/**
 * A varredura diária. Papel dono só para listar QUAIS canais (id e tenant); cada
 * canal é relido e gravado dentro do tenant dele. Um canal que falha não para os outros.
 */
export async function renovarTokensInstagram(agora = new Date()): Promise<Record<ResultOfRenewal, number>> {
  const { rows } = await databaseOwner().execute<{ id: string; tenant_id: string }>(sql`
    select id, tenant_id from canal where tipo = 'instagram' and ativo
  `);
  const resumo: Record<ResultOfRenewal, number> = { renovado: 0, cedo_demais: 0, vencido: 0, recusado: 0 };
  for (const linha of rows) {
    try {
      const channel = await readChannelInstagram(linha.tenant_id, linha.id);
      if (channel.config['reautorizacaoPendente'] === true) continue;
      resumo[await renovarTokenOfChannel(channel, agora)] += 1;
    } catch (erro) {
      console.error(`[instagram] a renovação do canal ${linha.id} falhou: ${(erro as Error).message}`);
    }
  }
  return resumo;
}
