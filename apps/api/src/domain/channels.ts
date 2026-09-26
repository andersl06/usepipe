import { sql } from 'drizzle-orm';
import { registrarAuditoria } from '@pipe/db';
import { forgetChannel, noTenant, resolveChannel } from '../database.js';
import { PipeError } from '../errors.js';
import { readChannelWhatsApp, texto, urlDoWebhook } from './whatsapp/channel.js';
import { desmontarWebhook } from './whatsapp/teardown-of-webhook.js';
import { buscarSaude } from './whatsapp/saude.js';

export { urlDoWebhook };

/**
 * Channel screen reads and disconnection live here. Connection moved to `./whatsapp/`, ported from Chatwoot through `cadastro-embutido.ts` and `configuracao-manual.ts`. This module retains screen connection state and disconnection without deletion, which differ from Chatwoot. Two specs govern this: `2026-09-05-infraestrutura.md` §5 says the customer owns their WABA; `2026-09-07-webhook-por-cliente.md` specifies the number webhook at `…/webhooks/whatsapp/<canalId>` with a channel-specific `verify_token`.
 */

export interface ChannelWhatsAppVisible {
  id: string;
  name: string;
  active: boolean;
  wabaId: string | null;
  numeroId: string | null;
  number: string | null;
  displayName: string | null;
  /**
   * `conectado` means Meta answered about the number. `desligado` means this channel was disconnected here. `indisponivel` means connected but Meta did not respond or reauthorization is pending; `motivo` identifies which.
   */
  state: 'conectado' | 'desligado' | 'indisponivel';
  quality: string | null;
  limite: string | null;
  motivo: string | null;
  reauthorizationPending: boolean;
  webhookUrl: string;
  criadoEm: Date;
}

interface LineChannel {
  [column: string]: unknown;
  id: string;
  nome: string;
  ativo: boolean;
  waba_id: string | null;
  numero_id: string | null;
  criado_em: string | Date;
  config: Record<string, unknown> | null;
}

/**
 * Read connection status. Quality and limits come from Meta on each read through health code ported from Chatwoot (`whatsapp/saude.ts`); they can change without notice. A Meta outage yields `indisponivel` with a reason, not a 502 for the whole screen.
 */
export async function listChannelsWhatsApp(tenantId: string): Promise<ChannelWhatsAppVisible[]> {
  const linhas = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<LineChannel>(sql`
      select id, nome, ativo, waba_id, numero_id, criado_em, config
        from canal
       where tipo = 'whatsapp_cloud'
       order by criado_em
    `);
    return rows;
  });

  const saida: ChannelWhatsAppVisible[] = [];
  for (const linha of linhas) {
    const base = visivel(linha);
    if (!linha.ativo || !linha.numero_id) {
      saida.push(base);
      continue;
    }
    if (base.reauthorizationPending) {
      saida.push({ ...base, state: 'indisponivel', motivo: 'reautorizacao_pendente' });
      continue;
    }

    // The query above returns an encrypted token; cached `resolverCanal` decrypts it.
    const canal = await resolveChannel(linha.id);
    const token = texto(canal?.config['tokenAcesso']);
    if (!token) {
      saida.push({ ...base, state: 'indisponivel', motivo: 'sem_token' });
      continue;
    }

    try {
      const saude = await buscarSaude({
        tokenAccess: token,
        numberId: linha.numero_id,
        wabaId: linha.waba_id,
      });
      saida.push({
        ...base,
        state: 'conectado',
        numeroId: saude.display_phone_number || base.numeroId,
        displayName: saude.verified_name || base.displayName,
        quality: saude.quality_rating ?? null,
        limite: saude.messaging_limit_tier ?? null,
      });
    } catch (error) {
      // Record the error CODE, never the message: a Meta message may echo user-supplied content.
      saida.push({
        ...base,
        state: 'indisponivel',
        motivo: error instanceof PipeError ? error.codigo : 'meta_inacessivel',
      });
    }
  }
  return saida;
}

/** Return a channel in screen format without querying Meta; this is the connection response. */
export async function readChannelVisible(tenantId: string, channelId: string): Promise<ChannelWhatsAppVisible> {
  const linha = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<LineChannel>(sql`
      select id, nome, ativo, waba_id, numero_id, criado_em, config
        from canal where id = ${channelId}::uuid limit 1
    `);
    return rows[0] ?? null;
  });
  if (!linha) throw PipeError.naoEncontrado('Canal');
  const base = visivel(linha);
  if (!linha.ativo) return base;
  return base.reauthorizationPending
    ? { ...base, state: 'indisponivel', motivo: 'reautorizacao_pendente' }
    : { ...base, state: 'conectado' };
}

/**
 * Disconnect by tearing down the Meta webhook (ported from `webhook_teardown_service.rb`, whose failure does not block disconnect) and deactivating the channel. Do not delete conversations or messages: Pipe deliberately differs from Chatwoot, where removing the inbox deletes the channel, because history belongs to the customer. Reconnect by reauthorization with `canal_id`.
 */
export async function desconectarWhatsApp(
  tenantId: string,
  userId: string,
  canalId: string,
): Promise<ChannelWhatsAppVisible> {
  const channel = await readChannelWhatsApp(tenantId, canalId);
  await desmontarWebhook(channel);

  const linha = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<LineChannel>(sql`
      update canal set ativo = false, atualizado_em = now()
       where id = ${canalId}::uuid
      returning id, nome, ativo, waba_id, numero_id, criado_em, config
    `);
    const gravado = rows[0];
    if (!gravado) throw PipeError.naoEncontrado('Canal');
    await registrarAuditoria(tx, tenantId, {
      ator: { type: 'usuario', id: userId },
      acao: 'desativou',
      objetoTipo: 'canal',
      objetoId: canalId,
      depois: gravado,
    });
    return gravado;
  });

  forgetChannel(canalId);
  return visivel(linha);
}

function visivel(linha: LineChannel): ChannelWhatsAppVisible {
  // `numero` and `nomeExibicao` are not secrets; they remain readable in encrypted `config`.
  const config = linha.config ?? {};
  return {
    id: linha.id,
    name: linha.nome,
    active: linha.ativo,
    wabaId: linha.waba_id,
    numeroId: linha.numero_id,
    number: texto(config['numero']),
    displayName: texto(config['nomeExibicao']),
    state: linha.ativo ? 'indisponivel' : 'desligado',
    quality: null,
    limite: null,
    motivo: null,
    reauthorizationPending: config['reautorizacaoPendente'] === true,
    webhookUrl: urlDoWebhook(linha.id),
    criadoEm: linha.criado_em instanceof Date ? linha.criado_em : new Date(linha.criado_em),
  };
}
