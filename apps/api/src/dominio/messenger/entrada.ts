import type { ValorDoWebhook } from '../entrada.js';

/** `page` usa PSID, sem telefone; a forma normalizada é a mesma da entrada WhatsApp. */
export function payloadDoMessenger(payload: unknown): boolean { return (payload as { object?: unknown } | null)?.object === 'page'; }
export function valoresDoMessenger(payload: unknown, paginaId?: string | null): ValorDoWebhook[] {
  const corpo = payload as { entry?: { id?: string; messaging?: { sender?: { id?: string }; message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: { type?: string; payload?: { url?: string } }[] }; postback?: { mid?: string; title?: string; payload?: string }; timestamp?: number }[] }[] };
  const messages: NonNullable<ValorDoWebhook['messages']> = [];
  for (const entry of corpo.entry ?? []) {
    if (paginaId && entry.id && String(entry.id) !== paginaId) continue;
    for (const evento of entry.messaging ?? []) {
      const de = evento.sender?.id; const timestamp = evento.timestamp ? String(Math.floor(evento.timestamp / 1000)) : undefined;
      if (!de || evento.message?.is_echo) continue;
      if (evento.postback?.mid) { messages.push({ from: de, id: evento.postback.mid, timestamp, type: 'text', text: { body: evento.postback.title ?? evento.postback.payload ?? '' } }); continue; }
      const mensagem = evento.message;
      if (!mensagem?.mid) continue;
      const anexo = mensagem.attachments?.[0]; const tipo = anexo?.type === 'image' ? 'image' : anexo?.type === 'video' ? 'video' : anexo?.type === 'audio' ? 'audio' : anexo?.type === 'file' ? 'document' : undefined;
      if (tipo && anexo?.payload?.url) messages.push({ from: de, id: mensagem.mid, timestamp, type: tipo, [tipo]: { url: anexo.payload.url, ...(mensagem.text ? { caption: mensagem.text } : {}) } });
      else if (mensagem.text) messages.push({ from: de, id: mensagem.mid, timestamp, type: 'text', text: { body: mensagem.text } });
    }
  }
  return messages.length ? [{ messages }] : [];
}
