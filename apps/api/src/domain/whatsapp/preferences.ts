import { registrarAuditoria } from '@pipe/db';
import { noTenant } from '../../database.js';
import { PipeError } from '../../errors.js';
import { atualizarChannel, readChannelWhatsApp } from './channel.js';
import type { ChannelWhatsApp } from './channel.js';

// A régua mora no worker, que é quem monta a mensagem; aqui só se reexporta.
export { formatOfPergunta, LIMITE_MENU, LIMITE_QUICK_REPLY } from '@pipe/workers/whatsapp';

/**
 * As abas "Configurações" e "Configurações de alerta" do canal WhatsApp na Blip
 * (`referencias-blip/fichas/FICHA-canal-whatsapp.md` §3 e §4). Nada disto é
 * campo da Meta: são escolhas do Pipe guardadas no `config` do canal.
 *
 * - **Quick reply**: pergunta com até 3 opções sai como botões; com 4 ou mais,
 *   continua em texto numerado.
 * - **Menu**: até 10 opções saem como lista; com 11 ou mais, texto.
 * - **Alerta de recategorização de modelos**: quando a Meta muda a categoria de
 *   um modelo, avisa estes e-mails; lista vazia = todos os administradores.
 *
 * Os dois interruptores nascem ligados, que é o estado observado na origem.
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
      ativo: guardado.alertRecategorization?.ativo ?? true,
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

/** A tela manda "separados por vírgula"; a API aceita a lista pronta também. */
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
  const alerta = pedido.alertaRecategorizacao;
  return {
    quickReply: booleano(pedido.quickReply, 'quickReply') ?? atual.quickReply,
    menu: booleano(pedido.menu, 'menu') ?? atual.menu,
    alertRecategorization: {
      ativo: booleano(alerta?.ativo, 'ativo') ?? atual.alertRecategorization.ativo,
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
  await atualizarChannel(channel, { preferencias: depois });
  await noTenant(tenantId, (tx) =>
    registrarAuditoria(tx, tenantId, {
      ator: { tipo: 'usuario', id: userId },
      acao: 'alterou',
      objetoTipo: 'canal',
      objetoId: channel.id,
      antes: { preferencias: antes },
      depois: { preferencias: depois },
    }),
  );
  return depois;
}
