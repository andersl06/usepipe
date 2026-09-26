import type { Assunto, EventoDoServidor, Subscription, QuadroDeControle } from '@pipe/contracts';

/**
 * The realtime channel client. **Written ONCE for all three frontends.**
 *
 * ## The rule this package exists to protect
 *
 * **`aoEvento` REFETCHES. It never applies the payload.**
 *
 * An event says WHAT changed - `{assunto, id, em}` - and nothing more. The receiver fetches the data from the API under RLS. This is not a byte-saving measure: it prevents the channel from becoming a second source of truth with a second place where tenant isolation can fail. The API is the primary source and has 90 RLS policies and tests.
 *
 * **If anyone proposes putting the record in the payload, reject it.** The benefit would be one fewer request; the cost would be tenant data leaving through an unaudited path and the screen displaying the value in transit instead of the current value. This was decided early in the project, is documented in `packages/contracts/src/eventos.ts`, and is repeated here because this is where the temptation arises.
 *
 * ## Why a package instead of code copied into each frontend
 *
 * Reconnection, backoff, subscription replay, and drop detection always diverge when copied - and silently, because the screen still opens. Desk previously had three copies of the priority rule, one of them wrong. Here there is one.
 *
 * ```ts
 * const ligacao = ligar({
 *   urlApi: 'http://localhost:3000',
 *   assuntos: ['conversa', 'fila'],
 *   aoEvento: (evento) => { if (evento.assunto === 'fila') rebuscarLista(); },
 * });
 * // when unmounting the screen:
 * ligacao.fechar();
 * ```
 */


const ESPERA_BASE_MS = 1_000;
const ESPERA_TETO_MS = 30_000;

/**
 * With no messages at all for this long, the connection is considered dead.
 *
 * The server sends `{tipo:'ping'}` every 15 seconds (Blip's `CONNECTION_TEST_INTERVAL`). Two silent intervals are the threshold: one would cause false positives during an ordinary network stall, while three would leave the screen stale for almost a minute.
 *
 * This exists because **dead sockets do not report their death**: TCP may remain open in the browser after the other side is gone, making the screen look alive but frozen - the defect realtime was meant to fix.
 */
const SILENCIO_ATE_MORRER_MS = 35_000;

export type StateOfConnection = 'connecting' | 'connected' | 'fell';


export interface SocketMinimo {
  send: (dado: string) => void;
  close: () => void;
  onopen: ((...args: unknown[]) => void) | null;
  onmessage: ((evento: { data: unknown }) => void) | null;
  onclose: ((...args: unknown[]) => void) | null;
  onerror: ((...args: unknown[]) => void) | null;
}

export interface OptionsOfConnection {
  /** Base da API vista pelo NAVEGADOR. `http` vira `ws`, `https` vira `wss`. */
  urlApi: string;
  assuntos: Assunto[];
  /**
   * Called for each event. **Refetch here; do not apply the payload** - see above.
   * Never called for `ping`, which is a control frame rather than an event.
   */
  aoEvento: (evento: EventoDoServidor) => void;

  toState?: (state: StateOfConnection) => void;

  createSocket?: (url: string) => SocketMinimo;
}

export interface Connection {
  fechar: () => void;

  state: () => StateOfConnection;
}

export function urlOfChannel(urlApi: string): string {
  return `${urlApi.replace(/\/$/, '').replace(/^http/, 'ws')}/v1/eventos`;
}

/**
 * Delay before the next attempt: exponential with a cap and **+/-20% jitter**.
 *
 * Jitter matters: when the API restarts, every browser disconnects at once. Without jitter, they all reconnect at once too, so a newly started API receives the entire herd immediately.
 */
export function esperaDaTentativa(tentativa: number, sortear: () => number = Math.random): number {
  const crescente = Math.min(ESPERA_TETO_MS, ESPERA_BASE_MS * 2 ** Math.max(0, tentativa - 1));
  return Math.round(crescente * (0.8 + sortear() * 0.4));
}

export function ligar(options: OptionsOfConnection): Connection {
  const url = urlOfChannel(options.urlApi);
  const create = options.createSocket ?? defaultCreateSocket;

  let socket: SocketMinimo | null = null;
  let tentativa = 0;
  let fechadoDeProposito = false;
  let state: StateOfConnection = 'connecting';
  let reconexao: ReturnType<typeof setTimeout> | null = null;
  let vigia: ReturnType<typeof setTimeout> | null = null;

  const changeState = (novo: StateOfConnection): void => {
    if (state === novo) return;
    state = novo;
    options.toState?.(novo);
  };

  /** Any server message - event or ping - postpones the death timeout. */
  const respirou = (): void => {
    if (vigia) clearTimeout(vigia);
    vigia = setTimeout(() => {
      // Do not wait for `onclose`: it may never fire on a half-dead socket.
      try {
        socket?.close();
      } catch {

      }
      aoCair();
    }, SILENCIO_ATE_MORRER_MS);
  };

  const aoCair = (): void => {
    if (fechadoDeProposito) return;
    if (reconexao) return; // já há uma tentativa agendada
    socket = null;
    changeState('fell');
    tentativa += 1;
    reconexao = setTimeout(() => {
      reconexao = null;
      abrir();
    }, esperaDaTentativa(tentativa));
  };

  const abrir = (): void => {
    if (fechadoDeProposito) return;
    changeState('connecting');
    let novo: SocketMinimo;
    try {
      novo = create(url);
    } catch {
      aoCair();
      return;
    }
    socket = novo;

    novo.onopen = () => {
      tentativa = 0;
      changeState('connected');
      // **Resend the subscription on every reconnection.** The server keeps no state for
      // disconnected clients: a new socket starts with no topics and receives nothing until this is sent.
      const subscription: Subscription = { assuntos: options.assuntos };
      novo.send(JSON.stringify(subscription));
      respirou();
    };

    novo.onmessage = (message) => {
      respirou();
      let corpo: EventoDoServidor | QuadroDeControle;
      try {
        corpo = JSON.parse(String(message.data)) as EventoDoServidor | QuadroDeControle;
      } catch {
        return;
      }
      // Control frames are not events: `ping`, `inscrito`, and `recusado` do not cause the
      // tela rebuscar nada.
      if ('tipo' in corpo) return;
      options.aoEvento(corpo);
    };

    novo.onclose = aoCair;
    novo.onerror = () => {
      // `onerror` is usually followed by `onclose`; `aoCair` is idempotent because of
      // da guarda de `reconexao`.
      aoCair();
    };
  };

  /**
   * Reconnect IMMEDIATELY when the browser reports that it can reconnect.
   *
   * **A hidden tab does NOT close the connection** - this decision changed during development. The original intent was to pause while the tab was hidden, until it became clear that an agent with Desk in a background tab is exactly the person who needs to hear about a new conversation. Visibility serves another purpose here: if the connection has ALREADY dropped and the user returns to the tab, they should not wait through 30 seconds of backoff while looking at a stale screen.
   */
  const voltarAgora = (): void => {
    if (fechadoDeProposito || socket) return;
    if (reconexao) {
      clearTimeout(reconexao);
      reconexao = null;
    }
    tentativa = 0;
    abrir();
  };

  const aoFicarVisivel = (): void => {
    if (globalThis.document?.visibilityState === 'visible') voltarAgora();
  };

  globalThis.addEventListener?.('online', voltarAgora);
  globalThis.document?.addEventListener?.('visibilitychange', aoFicarVisivel);

  abrir();

  return {
    state: () => state,
    fechar: () => {
      fechadoDeProposito = true;
      if (reconexao) clearTimeout(reconexao);
      if (vigia) clearTimeout(vigia);
      globalThis.removeEventListener?.('online', voltarAgora);
      globalThis.document?.removeEventListener?.('visibilitychange', aoFicarVisivel);
      try {
        socket?.close();
      } catch {
        /* idem */
      }
      socket = null;
    },
  };
}

function defaultCreateSocket(url: string): SocketMinimo {
  const WS = globalThis.WebSocket;
  if (!WS) throw new Error('WebSocket não existe neste ambiente');
  // `credentials` is not configured here: the browser sends the session cookie in the
  // same-parent-origin handshake, which is how the API authenticates the connection.
  return new WS(url) as unknown as SocketMinimo;
}
