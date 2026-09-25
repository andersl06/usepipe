import { sql } from 'drizzle-orm';
import { registrarAuditoria } from '@pipe/db';
import { esquecerChannel, noTenant, resolveChannel } from '../database.js';
import { PipeError } from '../errors.js';
import { readChannelWhatsApp, texto, urlDoWebhook } from './whatsapp/channel.js';
import { desmontarWebhook } from './whatsapp/teardown-of-webhook.js';
import { buscarSaude } from './whatsapp/saude.js';

export { urlDoWebhook };

/**
 * O que a tela de Canais lê e o desligar.
 *
 * CONECTAR não mora mais aqui: saiu para `./whatsapp/`, portado do Chatwoot
 * (`cadastro-embutido.ts` e `configuracao-manual.ts`). O que ficou é o que o
 * Chatwoot não tem igual — o estado da ligação para a tela, e desligar sem apagar.
 *
 * O desenho vem de duas specs, e nenhuma é negociável:
 * - `2026-09-05-infraestrutura.md` §5: o cliente é dono do WABA dele;
 * - `2026-09-07-webhook-por-cliente.md`: o webhook do número aponta para
 *   `…/webhooks/whatsapp/<canalId>`, com `verify_token` próprio do canal.
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
   * `conectado` — a Meta respondeu sobre o número.
   * `desligado` — o canal foi desconectado aqui.
   * `indisponivel` — ligado, mas a Meta não respondeu, ou o canal espera
   * reautorização; `motivo` diz qual.
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
  name: string;
  active: boolean;
  waba_id: string | null;
  numero_id: string | null;
  createdAt: string | Date;
  config: Record<string, unknown> | null;
}

/**
 * O estado da ligação. Qualidade e limite vêm da Meta a cada leitura, pela saúde
 * portada do Chatwoot (`whatsapp/saude.ts`) — mudam sozinhos, sem avisar. Meta
 * fora do ar vira `indisponivel` com o motivo, nunca 502 na tela inteira.
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

    // O token sai cifrado da consulta acima; decifrar é o `resolverCanal`, que tem cache.
    const canal = await resolveChannel(linha.id);
    const token = texto(canal?.config['tokenAcesso']);
    if (!token) {
      saida.push({ ...base, state: 'indisponivel', motivo: 'sem_token' });
      continue;
    }

    try {
      const saude = await buscarSaude({
        tokenAccess: token,
        numeroId: linha.numero_id,
        wabaId: linha.waba_id,
      });
      saida.push({
        ...base,
        state: 'conectado',
        numero: saude.display_phone_number || base.numero,
        displayName: saude.verified_name || base.displayName,
        quality: saude.quality_rating ?? null,
        limite: saude.messaging_limit_tier ?? null,
      });
    } catch (error) {
      // O motivo é o CÓDIGO, nunca a mensagem: mensagem da Meta pode ecoar o que recebeu.
      saida.push({
        ...base,
        state: 'indisponivel',
        motivo: error instanceof PipeError ? error.codigo : 'meta_inacessivel',
      });
    }
  }
  return saida;
}

/** Um canal no formato da tela, sem perguntar à Meta — é o que volta de conectar. */
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
 * Desconectar: desmonta o webhook na Meta (porte de `webhook_teardown_service.rb`,
 * que nunca impede o desligamento) e desativa o canal.
 *
 * **Não apaga conversa nem mensagem**, e aqui o Pipe diverge do Chatwoot de
 * propósito: lá, tirar a caixa apaga o canal; aqui o histórico é do cliente. A
 * volta é pela reautorização, com o `canal_id`.
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

  esquecerChannel(canalId);
  return visivel(linha);
}

function visivel(linha: LineChannel): ChannelWhatsAppVisible {
  // `numero` e `nomeExibicao` não são segredo: ficam legíveis no `config` cifrado.
  const config = linha.config ?? {};
  return {
    id: linha.id,
    nome: linha.nome,
    ativo: linha.ativo,
    wabaId: linha.waba_id,
    numeroId: linha.numero_id,
    numero: texto(config['numero']),
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
