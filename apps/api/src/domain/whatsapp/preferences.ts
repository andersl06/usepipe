import { registrarAuditoria } from '@pipe/db';
import { noTenant } from '../../database.js';
import { PipeError } from '../../errors.js';
import { updateChannel, readChannelWhatsApp } from './channel.js';
import type { ChannelWhatsApp } from './channel.js';

// The worker owns the rule because it assembles the message; reexport it here.
export { formatOfQuestion, LIMITE_MENU, LIMITE_QUICK_REPLY } from '@pipe/workers/whatsapp';

/**
 * Blip WhatsApp channel Settings and Alert Settings (`referencias-blip/fichas/FICHA-canal-whatsapp.md` §§3–4) are Pipe choices in channel `config`, not Meta fields. Quick replies use buttons for at most three choices and numbered text for four or more. Menus use lists for at most ten choices and text otherwise. Template recategorization alerts go to configured emails, or all administrators when empty. Both switches default on as observed in Blip.
 */

const LIMITE_EMAILS = 20;

export interface PreferencesOfChannel {
  quickReply: boolean;
  menu: boolean;
  alertRecategorization: { active: boolean; emails: string[] };
}

export function preferencesOf(channel: { config: Record<string, unknown> }): PreferencesOfChannel {
  const guardado = (channel.config['preferencias'] ?? {}) as Partial<PreferencesOfChannel>;
  return {
    quickReply: guardado.quickReply ?? true,
    menu: guardado.menu ?? true,
    alertRecategorization: {
      active: guardado.alertRecategorization?.active ?? true,
      emails: guardado.alertRecategorization?.emails ?? [],
    },
  };
}

export interface RequestOfPreferences {
  quickReply?: boolean;
  menu?: boolean;
  alertRecategorization?: { active?: boolean; emails?: string[] | string };
}

function recusa(campo: string, message: string): PipeError {
  return new PipeError(422, 'preferences_invalid', message, { campo });
}

/** The screen submits comma-separated values; the API also accepts a prepared list. */
function emailsDe(bruto: string[] | string): string[] {
  const lista = (Array.isArray(bruto) ? bruto : bruto.split(','))
    .map((e) => String(e).trim().toLowerCase())
    .filter(Boolean);
  const unicos = [...new Set(lista)];
  if (unicos.length > LIMITE_EMAILS) throw recusa('emails', `São no máximo ${LIMITE_EMAILS} e-mails.`);
  const invalido = unicos.find((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  if (invalido) throw recusa('emails', `E-mail inválido: ${invalido}`);
  return unicos;
}

export function aplicarPedido(atual: PreferencesOfChannel, pedido: RequestOfPreferences): PreferencesOfChannel {
  const booleano = (value: unknown, campo: string): boolean | undefined => {
    if (value === undefined) return undefined;
    if (typeof value !== 'boolean') throw recusa(campo, 'Use ligado ou desligado.');
    return value;
  };
  const alerta = pedido.alertRecategorization;
  return {
    quickReply: booleano(pedido.quickReply, 'quickReply') ?? atual.quickReply,
    menu: booleano(pedido.menu, 'menu') ?? atual.menu,
    alertRecategorization: {
      active: booleano(alerta?.active, 'ativo') ?? atual.alertRecategorization.active,
      emails: alerta?.emails === undefined ? atual.alertRecategorization.emails : emailsDe(alerta.emails),
    },
  };
}

export async function readPreferences(tenantId: string, channelId: string): Promise<PreferencesOfChannel> {
  return preferencesOf(await readChannelWhatsApp(tenantId, channelId));
}

export async function writePreferences(
  tenantId: string,
  userId: string,
  canalId: string,
  pedido: RequestOfPreferences,
): Promise<PreferencesOfChannel> {
  const channel: ChannelWhatsApp = await readChannelWhatsApp(tenantId, canalId);
  const antes = preferencesOf(channel);
  const depois = aplicarPedido(antes, pedido ?? {});
  await updateChannel(channel, { preferencias: depois });
  await noTenant(tenantId, (tx) =>
    registrarAuditoria(tx, tenantId, {
      ator: { type: 'usuario', id: userId },
      acao: 'alterou',
      objetoTipo: 'canal',
      objetoId: channel.id,
      antes: { preferencias: antes },
      depois: { preferencias: depois },
    }),
  );
  return depois;
}
