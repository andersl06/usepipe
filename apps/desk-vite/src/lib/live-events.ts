import { useEffect } from 'react';
import type { Assunto, Subscription } from '@pipe/contracts';
import { urlDaApi } from './api';
import { clienteDeConsultas } from './cliente-de-consultas';

/**
 * Keeps the Desk live like Blip's socket: subscribes to `/v1/eventos` (`apps/api/src/eventos-ws.ts`) and,
 * on any event, refetches the Desk reads (`/v1/desk/...`) — events only say what changed, never the data
 * (`packages/contracts/src/eventos.ts`). Polling stays as the fallback while the socket is down.
 */
const ASSUNTOS: Assunto[] = ['conversation', 'queue', 'agent'];
const MAX_BACKOFF_MS = 30_000;

export function eventsUrl(base: string, origin: string): string {
  const http = base.startsWith('http') ? base : `${origin}${base}`;
  return http.replace(/^http/, 'ws');
}

export function useLiveEvents(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;
    let closed = false;

    const refresh = () =>
      void clienteDeConsultas.invalidateQueries({
        predicate: (q) => q.queryKey[0] === 'api' && String(q.queryKey[1] ?? '').startsWith('/v1/desk'),
      });

    const connect = () => {
      socket = new WebSocket(eventsUrl(urlDaApi('/v1/eventos'), window.location.origin));
      socket.onopen = () => {
        tries = 0;
        const subscription: Subscription = { assuntos: ASSUNTOS };
        socket?.send(JSON.stringify(subscription));
        refresh(); // catch up on whatever changed while disconnected
      };
      socket.onmessage = (e) => {
        const data = JSON.parse(String(e.data)) as { assunto?: string };
        if (data.assunto) refresh();
      };
      socket.onclose = () => {
        if (closed) return;
        tries += 1;
        timer = setTimeout(connect, Math.min(1_000 * 2 ** tries, MAX_BACKOFF_MS));
      };
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(timer);
      socket?.close();
    };
  }, [enabled]);
}
