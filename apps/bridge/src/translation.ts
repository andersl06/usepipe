/**
 * Translate Pipe records into objects the Blip screen can render. Never invent fields: when Blip has a concept Pipe lacks, either omit the field and document it here or omit the entire value. A guessed value would appear on screen as genuine client data.
 */

import { channelIdentity } from '@pipe/core';

/** `entrada` means the client speaking and `saida` the company speaking. `interna` is not a conversation message. */
const DIRECTION_BLIP: Record<string, string> = {
  entrada: 'received',
  saida: 'sent',
};

/** Map Pipe message type to content type, which Blip uses to choose the bubble component. */
const TIPO_BLIP: Record<string, string> = {
  texto: 'text/plain',
  imagem: 'image/jpeg',
  audio: 'audio/ogg',
  video: 'video/mp4',
  documento: 'application/pdf',
  localizacao: 'application/vnd.lime.location+json',
};

export type ConversationRow = {
  id: string;
  state: string;
  sequentialNumber: number;
  parentSequentialNumber: number | null;
  emEsperaDesde: string | Date | null;
  priority: string;
  criada_em: string | Date | null;
  atribuida_em: string | Date | null;
  encerrada_em: string | Date | null;
  lastMessageIn: string | Date | null;
  lastMessageOf: string | null;
  queueId: string | null;
  queueName: string | null;
  agentId: string | null;
  agentName: string | null;
  agentEmail?: string | null;
  contactId: string;
  contactName: string | null;
  contactPhone: string | null;
  channelType: string | null;
  nao_lidas?: number;
  lastMessageText?: string | null;
}

export type MessageRow = {
  id: string;
  criada_em: string | Date | null;
  direction: string;
  autor_tipo: string;
  tipo: string;
  conteudo: string | null;
}

export function iso(v: string | Date | null | undefined): string | null {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

/**
 * Blip identity format: encode the email's `@` as `%40` and append the platform domain. The screen compares identities ("is this ticket mine?"), so the value must be stable and unique per person; email provides both.
 */
export function identity(email: string | null | undefined, domain = 'pipe.local'): string {
  if (!email) return `desconhecido@${domain}`;
  return `${email.replace('@', '%40')}@${domain}`;
}

export function comoTicket(linha: ConversationRow, domain?: string): Record<string, unknown> {
  const telefone = linha.contactPhone ?? '';
  const abertura = iso(linha.criada_em);
  return {
    id: linha.id,
    sequentialId: Number(linha.sequentialNumber),
    parentSequentialId: linha.parentSequentialNumber === null ? null : Number(linha.parentSequentialNumber),
    // Pipe has no router here; the conversation owner is the channel through which it arrived.
    ownerIdentity: `${linha.channelType ?? 'canal'}@pipe.local`,
    customerIdentity: channelIdentity({ contactId: linha.contactId, phone: telefone }),
    customerName: linha.contactName ?? 'Sem nome',
    customerPhoneNumber: telefone,
    agentIdentity: linha.agentEmail ? identity(linha.agentEmail, domain) : null,
    status: linha.state,
    team: linha.queueName ?? 'Default',
    storageDate: abertura,
    openDate: iso(linha.atribuida_em) ?? abertura,
    closeDate: iso(linha.encerrada_em),
    lastMessage: linha.lastMessageIn
      ? {
          content: linha.lastMessageText ?? '',
          direction: linha.lastMessageOf === 'contato' ? 'received' : 'sent',
          date: iso(linha.lastMessageIn),
        }
      : null,
    lastMessageSort: linha.lastMessageIn ? new Date(iso(linha.lastMessageIn)!).getTime() : 0,
    unreadMessages: Number(linha.nao_lidas ?? 0),
    isNew: linha.state === 'Waiting',
    standbyModeStart: linha.state === 'Open' ? iso(linha.emEsperaDesde) : null,
    /*
     * Pipe lacks the two following fields, but Desk's list requires them to build each card; omitting one crashed the whole list when the bridge was connected. Use neutral values, never fabricated ones.
     */
    customerEmail: null,
    sequentialSuffix: '',
    tags: [],
    customerAccount: {
      identity: channelIdentity({ contactId: linha.contactId, phone: telefone }),
      name: linha.contactName ?? 'Sem nome',
      fullName: linha.contactName ?? 'Sem nome',
      phoneNumber: telefone,
      email: null,
      photoUri: '',
      extras: {
        // Pipe has five priority levels, and Blip does not use the same
        // vocabulary. Keep the Pipe value rather than guessing a translation.
        prioridadePipe: linha.priority,
        canal: linha.channelType ?? '',
        fila: linha.queueName ?? '',
      },
    },
  };
}

/**
 * Map a message to a LIME document. Exclude INTERNAL messages (notes between agents): in Blip they are a separate resource, not conversation messages. Including one here would make it appear to have been sent to the client.
 */
export function asDocument(linha: MessageRow): Record<string, unknown> | null {
  const direction = DIRECTION_BLIP[linha.direction];
  if (!direction) return null;
  return {
    id: linha.id,
    direction: direction,
    type: TIPO_BLIP[linha.tipo] ?? 'text/plain',
    content: linha.conteudo ?? '',
    date: iso(linha.criada_em),
    /*
     * `messageEmitter` applies only to outbound messages: it identifies a human or bot sender. It is meaningless for inbound messages; including it made the screen label the client's own message "Bot".
     */
    ...(direction === 'sent'
      ? { messageEmitter: linha.autor_tipo === 'atendente' ? 'Human' : 'Bot' }
      : {}),
  };
}

export function asDocuments(linhas: MessageRow[]): Record<string, unknown>[] {
  return linhas.map(asDocument).filter((m): m is Record<string, unknown> => m !== null);
}

export type AgentRow = {
  id: string;
  nome: string | null;
  email: string;
  state?: string | null;
  /** `isOwner` in the screen's vocabulary enables administration items in the sidebar. */
  ehAdministrador?: boolean;
}

/** Desk's `/account` response needs `status`; without it the screen fails at `status.toLowerCase()`. */
export function asAccount(
  user: AgentRow,
  queues: string[],
  domain?: string,
): Record<string, unknown> {
  return {
    identity: identity(user.email, domain),
    fullName: user.nome ?? user.email,
    email: user.email,
    status: user.state ?? 'Offline',
    isOwner: user.ehAdministrador ?? false,
    isEnabled: true,
    phoneNumber: '',
    photoUri: '',
    teams: queues,
    culture: 'pt-BR',
    extras: {},
  };
}

export function comoTime(queue: { id: string; nome: string }): Record<string, unknown> {
  return { id: queue.id, name: queue.nome };
}

export { DIRECTION_BLIP, TIPO_BLIP };
