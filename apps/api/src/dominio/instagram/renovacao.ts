import { sql } from 'drizzle-orm';
import { bancoDono } from '../../banco.js';
import { ErroPipe } from '../../erros.js';
import { texto } from '../whatsapp/canal.js';
import { atualizarConfigInstagram, lerCanalInstagram, VALIDADE_DO_TOKEN_MS } from './canal.js';
import type { CanalInstagram } from './canal.js';
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

export type ResultadoDaRenovacao = 'renovado' | 'cedo_demais' | 'vencido' | 'recusado';

/** `token_eligible_for_refresh?`: mais de 24h de vida e ainda não vencido. */
export function tokenElegivel(config: Record<string, unknown>, agora = new Date()): ResultadoDaRenovacao | null {
  const renovadoEm = Date.parse(texto(config['tokenRenovadoEm']) ?? '');
  const expiraEm = Date.parse(texto(config['tokenExpiraEm']) ?? '');
  if (Number.isFinite(expiraEm) && expiraEm <= agora.getTime()) return 'vencido';
  if (Number.isFinite(renovadoEm) && agora.getTime() - renovadoEm < UM_DIA_MS) return 'cedo_demais';
  return null;
}

export async function renovarTokenDoCanal(
  canal: CanalInstagram,
  agora = new Date(),
): Promise<ResultadoDaRenovacao> {
  const token = texto(canal.config['tokenAcesso']);
  const impedimento = token ? tokenElegivel(canal.config, agora) : 'vencido';
  if (impedimento === 'cedo_demais') return impedimento;
  if (impedimento === 'vencido' || !token) {
    await atualizarConfigInstagram(canal, { reautorizacaoPendente: true });
    return 'vencido';
  }

  try {
    const novo = await clienteGraphInstagram(token).renovarToken();
    if (!novo.access_token) throw new ErroPipe(502, 'meta_recusou', 'A renovação voltou sem access_token.');
    const validadeMs = (novo.expires_in ?? VALIDADE_DO_TOKEN_MS / 1000) * 1000;
    await atualizarConfigInstagram(canal, {
      tokenAcesso: novo.access_token,
      tokenRenovadoEm: agora.toISOString(),
      tokenExpiraEm: new Date(agora.getTime() + validadeMs).toISOString(),
      reautorizacaoPendente: false,
    });
    return 'renovado';
  } catch (erro) {
    // Só a recusa da Meta marca reautorização; rede fora tenta de novo amanhã.
    if (!(erro instanceof ErroPipe && erro.codigo === 'meta_recusou')) throw erro;
    console.error(`[instagram] o token do canal ${canal.id} foi recusado na renovação: ${erro.message}`);
    await atualizarConfigInstagram(canal, { reautorizacaoPendente: true });
    return 'recusado';
  }
}

/**
 * A varredura diária. Papel dono só para listar QUAIS canais (id e tenant); cada
 * canal é relido e gravado dentro do tenant dele. Um canal que falha não para os outros.
 */
export async function renovarTokensInstagram(agora = new Date()): Promise<Record<ResultadoDaRenovacao, number>> {
  const { rows } = await bancoDono().execute<{ id: string; tenant_id: string }>(sql`
    select id, tenant_id from canal where tipo = 'instagram' and ativo
  `);
  const resumo: Record<ResultadoDaRenovacao, number> = { renovado: 0, cedo_demais: 0, vencido: 0, recusado: 0 };
  for (const linha of rows) {
    try {
      const canal = await lerCanalInstagram(linha.tenant_id, linha.id);
      if (canal.config['reautorizacaoPendente'] === true) continue;
      resumo[await renovarTokenDoCanal(canal, agora)] += 1;
    } catch (erro) {
      console.error(`[instagram] a renovação do canal ${linha.id} falhou: ${(erro as Error).message}`);
    }
  }
  return resumo;
}
