import type { MensagemDaMeta, ValorDoWebhook } from '../entrada.js';

/**
 * Reconstruído de chatwoot/chatwoot (MIT), app/jobs/webhooks/instagram_events_job.rb e
 * app/services/instagram/message_text.rb / incoming_message_service: o evento do
 * Direct traduzido para o MESMO formato que a entrada do WhatsApp já processa
 * (`ValorDoWebhook`). Assim contato, conversa, idempotência por `id_provedor`, fluxo e
 * roteador rodam pelo caminho que já existe em `../entrada.ts`, sem cópia.
 *
 * O formato de entrada (`object: "instagram"`):
 *
 *   entry[].id            — a conta profissional que RECEBEU (o `igUserId` do canal)
 *   entry[].messaging[]   — sender.id (IGSID), recipient.id, timestamp (ms),
 *                           message { mid, text, attachments[], is_echo, is_deleted }
 *                           | postback { mid, title, payload } | read { mid }
 *
 * Diferenças que importam:
 * - `is_echo` é a própria conta falando (inclusive o que a Pipe mandou): ignorado,
 *   como o Chatwoot faz quando o eco é de mensagem que ele mesmo enviou.
 * - o `timestamp` vem em MILISSEGUNDOS; o do WhatsApp, em segundos.
 * - anexo vem com URL, não com `media_id`.
 * - `entry` de outra conta é descartada: o webhook do app do cliente é UM por app, e
 *   um app com duas contas manda as duas para a mesma URL.
 */

interface AnexoDoInstagram {
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
    attachments?: AnexoDoInstagram[];
    is_echo?: boolean;
    is_deleted?: boolean;
    is_unsupported?: boolean;
  };
  postback?: { mid?: string; title?: string; payload?: string };
  read?: { mid?: string };
}

/** Tipo de anexo do Instagram → campo de mídia da Meta que `../entrada.ts` entende. */
const MIDIA: Readonly<Record<string, 'image' | 'video' | 'audio' | 'document'>> = {
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

export function valoresDoInstagram(payload: unknown, igUserId?: string | null): ValorDoWebhook[] {
  const corpo = payload as { entry?: { id?: string; messaging?: EventoDoInstagram[] }[] };
  const mensagens: MensagemDaMeta[] = [];
  const statuses: NonNullable<ValorDoWebhook['statuses']> = [];

  for (const entrada of corpo?.entry ?? []) {
    if (igUserId && entrada.id && String(entrada.id) !== igUserId) {
      console.warn(`[instagram] evento da conta ${entrada.id} chegou no canal da conta ${igUserId}: descartado`);
      continue;
    }
    for (const evento of entrada.messaging ?? []) {
      const timestamp = emSegundos(evento.timestamp);
      const de = evento.sender?.id;

      if (evento.read?.mid) {
        statuses.push({ id: evento.read.mid, status: 'read', ...(timestamp ? { timestamp } : {}) });
        continue;
      }
      if (evento.postback?.mid && de) {
        mensagens.push({
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

      // ponytail: a mensagem da Pipe tem UM anexo; o Direct pode mandar vários no
      // mesmo `mid`. Fica o primeiro, e os demais viram link no texto.
      const [primeiro, ...resto] = m.attachments ?? [];
      const campo = primeiro?.type ? MIDIA[primeiro.type] : undefined;
      const url = primeiro?.payload?.url;
      const extras = resto.map((a) => a.payload?.url).filter((u): u is string => Boolean(u));

      if (campo && url) {
        mensagens.push({
          from: de,
          id: m.mid,
          timestamp,
          type: campo,
          [campo]: { url, ...(m.text ? { caption: m.text } : {}) },
          ...(extras.length ? { text: { body: [m.text, ...extras].filter(Boolean).join('\n') } } : {}),
        });
        continue;
      }

      // Texto, ou anexo sem equivalente no Pipe (story_mention, share, ig_reel…): vira texto com o link.
      const corpoDoTexto = [m.text, primeiro && !campo ? url : undefined, ...extras].filter(Boolean).join('\n');
      if (!corpoDoTexto) continue;
      mensagens.push({ from: de, id: m.mid, timestamp, type: 'text', text: { body: corpoDoTexto } });
    }
  }

  return mensagens.length || statuses.length ? [{ messages: mensagens, statuses }] : [];
}
