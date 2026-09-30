import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { esperaDaTentativa, ligar, urlOfChannel } from '../src/index.js';
import type { SocketMinimo } from '../src/index.js';

/**
 * Reconnection is why this package exists: copied across three frontends, this logic silently diverges. These tests exercise it with a fake socket and Vitest fake timers - without network access or real waiting.
 */

class SocketFalso implements SocketMinimo {
  onopen: ((...args: unknown[]) => void) | null = null;
  onmessage: ((evento: { data: unknown }) => void) | null = null;
  onclose: ((...args: unknown[]) => void) | null = null;
  onerror: ((...args: unknown[]) => void) | null = null;
  readonly enviados: string[] = [];
  fechado = false;

  send(dado: string): void {
    this.enviados.push(dado);
  }
  close(): void {
    this.fechado = true;
  }

  /** Atalhos do ponto de vista do servidor. */
  abrir(): void {
    this.onopen?.();
  }
  mandar(corpo: unknown): void {
    this.onmessage?.({ data: JSON.stringify(corpo) });
  }
  cair(): void {
    this.onclose?.();
  }
}

let criados: SocketFalso[] = [];
const createSocket = (): SocketMinimo => {
  const s = new SocketFalso();
  criados.push(s);
  return s;
};
const ultimo = (): SocketFalso => criados[criados.length - 1]!;

beforeEach(() => {
  criados = [];
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Build the WebSocket channel URL', () => {
  it('Convert HTTP URLs to `ws` and HTTPS URLs to `wss`', () => {
    expect(urlOfChannel('http://localhost:3000')).toBe('ws://localhost:3000/v1/eventos');
    expect(urlOfChannel('https://api.pipe.test/')).toBe(
      'wss://api.pipe.test/v1/eventos',
    );
  });
});

describe('backoff', () => {
  it('dobra até o teto de 30 s', () => {
    const semSorte = () => 0.5; // jitter neutro
    expect(esperaDaTentativa(1, semSorte)).toBe(1_000);
    expect(esperaDaTentativa(2, semSorte)).toBe(2_000);
    expect(esperaDaTentativa(5, semSorte)).toBe(16_000);
    expect(esperaDaTentativa(9, semSorte)).toBe(30_000);
    expect(esperaDaTentativa(50, semSorte)).toBe(30_000);
  });

  it('tem jitter de ±20% — sem ele a manada volta toda junta', () => {
    // When the API restarts, all clients disconnect at once; without jitter they reconnect at the same
    // time as well.
    expect(esperaDaTentativa(3, () => 0)).toBe(3_200);
    expect(esperaDaTentativa(3, () => 1)).toBe(4_800);
  });
});

describe('Manage the real-time connection', () => {
  it('Subscribe to topics as soon as the socket opens', () => {
    const ligacao = ligar({
      urlApi: 'http://api.teste',
      assuntos: ['conversation', 'queue'],
      aoEvento: () => undefined,
      createSocket,
    });
    ultimo().abrir();

    expect(JSON.parse(ultimo().enviados[0]!)).toEqual({ assuntos: ['conversation', 'queue'] });
    expect(ligacao.state()).toBe('connected');
    ligacao.fechar();
  });

  it('Deliver event frames and ignore control frames', () => {
    const recebidos: unknown[] = [];
    const ligacao = ligar({
      urlApi: 'http://api.teste',
      assuntos: ['conversation'],
      aoEvento: (e) => recebidos.push(e),
      createSocket,
    });
    ultimo().abrir();

    ultimo().mandar({ tipo: 'inscrito', assuntos: ['conversation'] });
    ultimo().mandar({ tipo: 'ping' });
    ultimo().mandar({ assunto: 'conversation', id: 'c1', em: '2026-09-07T00:00:00.000Z' });

    expect(recebidos).toEqual([{ assunto: 'conversation', id: 'c1', em: '2026-09-07T00:00:00.000Z' }]);
    ligacao.fechar();
  });

  it('aguenta corpo ilegível sem derrubar a tela', () => {
    const connection = ligar({
      urlApi: 'http://api.teste',
      assuntos: ['conversation'],
      aoEvento: () => {
        throw new Error('não deveria ser chamado');
      },
      createSocket,
    });
    ultimo().abrir();
    expect(() => ultimo().onmessage?.({ data: 'isto não é json' })).not.toThrow();
    connection.fechar();
  });
});

describe('reconexão', () => {
  it('Reconnect after a drop and send the subscription again', () => {
    const ligacao = ligar({
      urlApi: 'http://api.teste',
      assuntos: ['queue'],
      aoEvento: () => undefined,
      createSocket,
    });
    ultimo().abrir();
    expect(criados).toHaveLength(1);

    ultimo().cair();
    expect(ligacao.state()).toBe('fell');
    vi.advanceTimersByTime(2_000);

    expect(criados).toHaveLength(2);
    ultimo().abrir();
    // The server keeps no state for disconnected clients: a new socket starts with no topics.
    expect(JSON.parse(ultimo().enviados[0]!)).toEqual({ assuntos: ['queue'] });
    ligacao.fechar();
  });

  it('espera mais a cada tentativa seguida', () => {
    const ligacao = ligar({
      urlApi: 'http://api.teste',
      assuntos: ['queue'],
      aoEvento: () => undefined,
      createSocket,
    });
    ultimo().abrir();

    ultimo().cair();
    vi.advanceTimersByTime(2_000);
    expect(criados).toHaveLength(2);

    // Segunda queda SEM ter aberto: o backoff cresce em vez de repetir 1 s.
    ultimo().cair();
    vi.advanceTimersByTime(1_500);
    expect(criados).toHaveLength(2);
    vi.advanceTimersByTime(3_000);
    expect(criados).toHaveLength(3);
    ligacao.fechar();
  });

  it('Reset reconnect backoff after a successful connection', () => {
    const ligacao = ligar({
      urlApi: 'http://api.teste',
      assuntos: ['queue'],
      aoEvento: () => undefined,
      createSocket,
    });
    ultimo().abrir();
    ultimo().cair();
    vi.advanceTimersByTime(2_000);
    ultimo().abrir(); // reconectou de verdade

    ultimo().cair();
    vi.advanceTimersByTime(1_300);
    expect(criados).toHaveLength(3);
    ligacao.fechar();
  });

  it('derruba e reconecta depois de 35 s de silêncio — socket morto não avisa', () => {
    // TCP may remain open in the browser after the other side has
    // gone. Without this watchdog, the screen would look alive but frozen.
    const ligacao = ligar({
      urlApi: 'http://api.teste',
      assuntos: ['conversation'],
      aoEvento: () => undefined,
      createSocket,
    });
    const first = ultimo();
    first.abrir();

    vi.advanceTimersByTime(34_000);
    expect(first.fechado).toBe(false);

    // Advance just past 35 seconds, NOT 2 seconds: the first retry is scheduled
    // 800-1200 ms after the drop (1-second backoff with +/-20% jitter), so advancing
    // by 2 seconds reaches beyond that retry and reads `ligando` or `caiu` depending on the draw. This test
    // passed in about half of runs, and I incorrectly reported one green run as a pass.
    vi.advanceTimersByTime(1_001);
    expect(first.fechado).toBe(true);
    expect(ligacao.state()).toBe('fell');

    // `caiu` must also LAST long enough for the screen to show "connection lost" - that is
    // why `toState` exists. 700 ms is below the backoff floor (800 ms).
    vi.advanceTimersByTime(700);
    expect(ligacao.state()).toBe('fell');

    vi.advanceTimersByTime(600);
    expect(ligacao.state()).toBe('connecting');
    ligacao.fechar();
  });

  it('o ping do servidor adia a sentença de morte', () => {
    const ligacao = ligar({
      urlApi: 'http://api.teste',
      assuntos: ['conversation'],
      aoEvento: () => undefined,
      createSocket,
    });
    const primeiro = ultimo();
    primeiro.abrir();

    // Um ping a cada 15 s, como o servidor manda.
    for (let i = 0; i < 6; i += 1) {
      vi.advanceTimersByTime(15_000);
      primeiro.mandar({ tipo: 'ping' });
    }

    expect(primeiro.fechado).toBe(false);
    expect(ligacao.state()).toBe('connected');
    ligacao.fechar();
  });

  it('Notify the screen when the connection state changes', () => {
    const estados: string[] = [];
    const ligacao = ligar({
      urlApi: 'http://api.teste',
      assuntos: ['conversation'],
      aoEvento: () => undefined,
      toState: (e) => estados.push(e),
      createSocket,
    });
    ultimo().abrir();
    ultimo().cair();
    vi.advanceTimersByTime(2_000);
    ultimo().abrir();

    expect(estados).toEqual(['connected', 'fell', 'connecting', 'connected']);
    ligacao.fechar();
  });

  it('fechar de propósito não reconecta', () => {
    const ligacao = ligar({
      urlApi: 'http://api.teste',
      assuntos: ['conversation'],
      aoEvento: () => undefined,
      createSocket,
    });
    ultimo().abrir();

    ligacao.fechar();
    ultimo().cair();
    vi.advanceTimersByTime(60_000);

    // A tela desmontou; ressuscitar seria vazamento.
    expect(criados).toHaveLength(1);
  });

  it('socket que nem consegue nascer também entra no backoff', () => {
    let vezes = 0;
    const ligacao = ligar({
      urlApi: 'http://api.teste',
      assuntos: ['conversation'],
      aoEvento: () => undefined,
      createSocket: () => {
        vezes += 1;
        if (vezes === 1) throw new Error('rede fora');
        return createSocket();
      },
    });

    expect(ligacao.state()).toBe('fell');
    vi.advanceTimersByTime(2_000);
    expect(vezes).toBe(2);
    ligacao.fechar();
  });
});
