import { sql } from 'drizzle-orm';
import { registrarAuditoria } from '@pipe/db';
import { esquecerCanal, noTenant, resolverCanal } from '../banco.js';
import { ErroPipe } from '../erros.js';
import { lerCanalWhatsApp, texto, urlDoWebhook } from './whatsapp/canal.js';
import { desmontarWebhook } from './whatsapp/desmontagem-de-webhook.js';
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

export interface CanalWhatsAppVisivel {
  id: string;
  nome: string;
  ativo: boolean;
  wabaId: string | null;
  numeroId: string | null;
  numero: string | null;
  nomeExibicao: string | null;
  /**
   * `conectado` — a Meta respondeu sobre o número.
   * `desligado` — o canal foi desconectado aqui.
   * `indisponivel` — ligado, mas a Meta não respondeu, ou o canal espera
   * reautorização; `motivo` diz qual.
   */
  estado: 'conectado' | 'desligado' | 'indisponivel';
  qualidade: string | null;
  limite: string | null;
  motivo: string | null;
  reautorizacaoPendente: boolean;
  webhookUrl: string;
  criadoEm: Date;
}

interface LinhaCanal {
  [coluna: string]: unknown;
  id: string;
  nome: string;
  ativo: boolean;
  waba_id: string | null;
  numero_id: string | null;
  criado_em: string | Date;
  config: Record<string, unknown> | null;
}

/**
 * O estado da ligação. Qualidade e limite vêm da Meta a cada leitura, pela saúde
 * portada do Chatwoot (`whatsapp/saude.ts`) — mudam sozinhos, sem avisar. Meta
 * fora do ar vira `indisponivel` com o motivo, nunca 502 na tela inteira.
 */
export async function listarCanaisWhatsApp(tenantId: string): Promise<CanalWhatsAppVisivel[]> {
  const linhas = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<LinhaCanal>(sql`
      select id, nome, ativo, waba_id, numero_id, criado_em, config
        from canal
       where tipo = 'whatsapp_cloud'
       order by criado_em
    `);
    return rows;
  });

  const saida: CanalWhatsAppVisivel[] = [];
  for (const linha of linhas) {
    const base = visivel(linha);
    if (!linha.ativo || !linha.numero_id) {
      saida.push(base);
      continue;
    }
    if (base.reautorizacaoPendente) {
      saida.push({ ...base, estado: 'indisponivel', motivo: 'reautorizacao_pendente' });
      continue;
    }

    // O token sai cifrado da consulta acima; decifrar é o `resolverCanal`, que tem cache.
    const canal = await resolverCanal(linha.id);
    const token = texto(canal?.config['tokenAcesso']);
    if (!token) {
      saida.push({ ...base, estado: 'indisponivel', motivo: 'sem_token' });
      continue;
    }

    try {
      const saude = await buscarSaude({
        tokenAcesso: token,
        numeroId: linha.numero_id,
        wabaId: linha.waba_id,
      });
      saida.push({
        ...base,
        estado: 'conectado',
        numero: saude.display_phone_number || base.numero,
        nomeExibicao: saude.verified_name || base.nomeExibicao,
        qualidade: saude.quality_rating ?? null,
        limite: saude.messaging_limit_tier ?? null,
      });
    } catch (erro) {
      // O motivo é o CÓDIGO, nunca a mensagem: mensagem da Meta pode ecoar o que recebeu.
      saida.push({
        ...base,
        estado: 'indisponivel',
        motivo: erro instanceof ErroPipe ? erro.codigo : 'meta_inacessivel',
      });
    }
  }
  return saida;
}

/** Um canal no formato da tela, sem perguntar à Meta — é o que volta de conectar. */
export async function lerCanalVisivel(tenantId: string, canalId: string): Promise<CanalWhatsAppVisivel> {
  const linha = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<LinhaCanal>(sql`
      select id, nome, ativo, waba_id, numero_id, criado_em, config
        from canal where id = ${canalId}::uuid limit 1
    `);
    return rows[0] ?? null;
  });
  if (!linha) throw ErroPipe.naoEncontrado('Canal');
  const base = visivel(linha);
  if (!linha.ativo) return base;
  return base.reautorizacaoPendente
    ? { ...base, estado: 'indisponivel', motivo: 'reautorizacao_pendente' }
    : { ...base, estado: 'conectado' };
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
  usuarioId: string,
  canalId: string,
): Promise<CanalWhatsAppVisivel> {
  const canal = await lerCanalWhatsApp(tenantId, canalId);
  await desmontarWebhook(canal);

  const linha = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<LinhaCanal>(sql`
      update canal set ativo = false, atualizado_em = now()
       where id = ${canalId}::uuid
      returning id, nome, ativo, waba_id, numero_id, criado_em, config
    `);
    const gravado = rows[0];
    if (!gravado) throw ErroPipe.naoEncontrado('Canal');
    await registrarAuditoria(tx, tenantId, {
      ator: { tipo: 'usuario', id: usuarioId },
      acao: 'desativou',
      objetoTipo: 'canal',
      objetoId: canalId,
      depois: gravado,
    });
    return gravado;
  });

  esquecerCanal(canalId);
  return visivel(linha);
}

function visivel(linha: LinhaCanal): CanalWhatsAppVisivel {
  // `numero` e `nomeExibicao` não são segredo: ficam legíveis no `config` cifrado.
  const config = linha.config ?? {};
  return {
    id: linha.id,
    nome: linha.nome,
    ativo: linha.ativo,
    wabaId: linha.waba_id,
    numeroId: linha.numero_id,
    numero: texto(config['numero']),
    nomeExibicao: texto(config['nomeExibicao']),
    estado: linha.ativo ? 'indisponivel' : 'desligado',
    qualidade: null,
    limite: null,
    motivo: null,
    reautorizacaoPendente: config['reautorizacaoPendente'] === true,
    webhookUrl: urlDoWebhook(linha.id),
    criadoEm: linha.criado_em instanceof Date ? linha.criado_em : new Date(linha.criado_em),
  };
}
