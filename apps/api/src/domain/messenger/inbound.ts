import type { ValueOfWebhook } from '../inbound.js';

/** `page` usa PSID, sem telefone; a forma normalizada é a mesma da entrada WhatsApp. */
export function payloadDoMessenger(payload: unknown): boolean { return (payload as { object?: unknown } | null)?.object === 'page'; }
export function valuesOfMessenger(payload: unknown, pageId?: string | null): ValueOfWebhook[] {
  const corpo = payload as { entry?: { id?: string; messaging?: { sender?: { id?: string }; message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: { type?: string; payload?: { url?: string } }[] }; postback?: { mid?: string; title?: string; payload?: string }; timestamp?: number }[] }[] };
  const messages: NonNullable<ValueOfWebhook['messages']> = [];
  for (const entry of corpo.entry ?? []) {
    if (pageId && entry.id && String(entry.id) !== pageId) continue;
    for (const evento of entry.messaging ?? []) {
      const de = evento.sender?.id; const timestamp = evento.timestamp ? String(Math.floor(evento.timestamp / 1000)) : undefined;
      if (!de || evento.message?.is_echo) continue;
      if (evento.postback?.mid) { messages.push({ from: de, id: evento.postback.mid, timestamp, type: 'text', text: { body: evento.postback.title ?? evento.postback.payload ?? '' } }); continue; }
      const message = evento.message;
      if (!message?.mid) continue;
      const attachment = message.attachments?.[0]; const tipo = attachment?.type === 'image' ? 'image' : attachment?.type === 'video' ? 'video' : attachment?.type === 'audio' ? 'audio' : attachment?.type === 'file' ? 'document' : undefined;
      if (tipo && attachment?.payload?.url) messages.push({ from: de, id: message.mid, timestamp, type: tipo, [tipo]: { url: attachment.payload.url, ...(message.text ? { caption: message.text } : {}) } });
      else if (message.text) messages.push({ from: de, id: message.mid, timestamp, type: 'text', text: { body: message.text } });
    }
  }
  return messages.length ? [{ messages }] : [];
}
