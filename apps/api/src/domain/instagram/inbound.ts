import type { MessageOfMeta, ValueOfWebhook } from '../inbound.js';

/**
 * Reconstructed from chatwoot/chatwoot (MIT), app/jobs/webhooks/instagram_events_job.rb and app/services/instagram/message_text.rb / incoming_message_service. Map Direct events to the same `ValorDoWebhook` format handled by WhatsApp in `../entrada.ts`, reusing contact, conversation, `id_provedor` idempotency, flow, and router logic. In `object: "instagram"`, `entry[].id` is the receiving professional account (`igUserId`); `entry[].messaging[]` carries sender.id (IGSID), recipient.id, timestamp in milliseconds, and message/postback/read data. Ignore `is_echo`, including Pipe's own messages, as Chatwoot does. WhatsApp timestamps use seconds. Instagram attachments carry URLs rather than `media_id`. Discard entries for another account: a customer's app may send events for multiple accounts to one webhook URL. The webhook's `timestamp` is milliseconds, and `entry` values for other accounts are discarded.
 */

interface AttachmentOfInstagram {
  type?: string;
  payload?: { url?: string; title?: string };
}

interface EventoDoInstagram {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number | string;
  message?: {
    mid?: string;
    text?: string;
    attachments?: AttachmentOfInstagram[];
    is_echo?: boolean;
    is_deleted?: boolean;
    is_unsupported?: boolean;
  };
  postback?: { mid?: string; title?: string; payload?: string };
  read?: { mid?: string };
}

/** Map an Instagram attachment type to the Meta media field understood by `../entrada.ts`. */
const MEDIA: Readonly<Record<string, 'image' | 'video' | 'audio' | 'document'>> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  file: 'document',
};

export function payloadDoInstagram(payload: unknown): boolean {
  return (payload as { object?: unknown } | null)?.object === 'instagram';
}

function emSegundos(timestamp: number | string | undefined): string | undefined {
  const ms = Number(timestamp);
  return Number.isFinite(ms) && ms > 0 ? String(Math.floor(ms / 1000)) : undefined;
}

export function valuesOfInstagram(payload: unknown, igUserId?: string | null): ValueOfWebhook[] {
  const corpo = payload as { entry?: { id?: string; messaging?: EventoDoInstagram[] }[] };
  const messages: MessageOfMeta[] = [];
  const statuses: NonNullable<ValueOfWebhook['statuses']> = [];

  for (const inbound of corpo?.entry ?? []) {
    if (igUserId && inbound.id && String(inbound.id) !== igUserId) {
      console.warn(`[instagram] evento da conta ${inbound.id} chegou no canal da conta ${igUserId}: descartado`);
      continue;
    }
    for (const evento of inbound.messaging ?? []) {
      const timestamp = emSegundos(evento.timestamp);
      const de = evento.sender?.id;

      if (evento.read?.mid) {
        statuses.push({ id: evento.read.mid, status: 'read', ...(timestamp ? { timestamp } : {}) });
        continue;
      }
      if (evento.postback?.mid && de) {
        messages.push({
          from: de,
          id: evento.postback.mid,
          timestamp,
          type: 'text',
          text: { body: evento.postback.title ?? evento.postback.payload ?? '' },
        });
        continue;
      }

      const m = evento.message;
      if (!m?.mid || !de || m.is_echo || m.is_deleted) continue;

      // ponytail: Pipe messages support one attachment, while Direct may send several under the same `mid`. Keep the first attachment and put links to the others in the text until the message model supports multiples.
      // mesmo `mid`. Fica o primeiro, e os demais viram link no texto.
      const [first, ...resto] = m.attachments ?? [];
      const campo = first?.type ? MEDIA[first.type] : undefined;
      const url = first?.payload?.url;
      const extras = resto.map((a) => a.payload?.url).filter((u): u is string => Boolean(u));

      if (campo && url) {
        messages.push({
          from: de,
          id: m.mid,
          timestamp,
          type: campo,
          [campo]: { url, ...(m.text ? { caption: m.text } : {}) },
          ...(extras.length ? { text: { body: [m.text, ...extras].filter(Boolean).join('\n') } } : {}),
        });
        continue;
      }

      // Text or an unsupported attachment (`story_mention`, share, `ig_reel`): convert to text with the link.
      const corpoDoTexto = [m.text, first && !campo ? url : undefined, ...extras].filter(Boolean).join('\n');
      if (!corpoDoTexto) continue;
      messages.push({ from: de, id: m.mid, timestamp, type: 'text', text: { body: corpoDoTexto } });
    }
  }

  return messages.length || statuses.length ? [{ messages: messages, statuses }] : [];
}
