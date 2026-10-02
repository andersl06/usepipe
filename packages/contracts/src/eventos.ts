/**
 * WebSocket events say what changed, never what the record is. Clients receive that conversation X changed and refetch through the API under RLS. Sending records over the socket would create a second data path and a second place to get tenant isolation wrong; the API already has 90 policies and 21 tests. Small event payloads also let clients read the latest version rather than one already stale in transit.
 */

export const ASSUNTOS = [
  /** Conversation changed: new message, state, assignment, or window. */
  'conversation',
  /** Queue size or composition changed. */
  'queue',
  /** Agent status changed: Online, Pause ou Invisible. */
  'agent',
  /** Monitoring figures changed enough to warrant a redraw. */
  'monitoring',
  /** Um lead mudou de fase, ou nasceu. */
  'lead',
] as const;
export type Assunto = (typeof ASSUNTOS)[number];

export interface EventoDoServidor {
  assunto: Assunto;
  /** Changed record; omitted for aggregate subjects such as monitoring. */
  id?: string;
  /**
   * Server emission time in ISO 8601. Clients use it to discard out-of-order events: reconnection delivers accumulated events, and applying an old event after a new one would make the UI wrong.
   */
  em: string;
}

/**
 * Client subscription request. `tenant_id` comes from the server session, never this request; accepting a client-supplied tenant would let subscribers choose whose events to receive.
 */
export interface Subscription {
  assuntos: Assunto[];
  /** Specific IDs when a screen subscribes to one conversation rather than all. */
  ids?: string[];
}

/** Channel control frames telling clients what happened. */
export type QuadroDeControle =
  | { tipo: 'inscrito'; assuntos: Assunto[] }
  | { tipo: 'recusado'; motivo: 'sem_sessao' | 'assunto_desconhecido' | 'sem_permissao' }
  | { tipo: 'ping' };
