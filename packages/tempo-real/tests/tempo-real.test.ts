import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { esperaDaTentativa, ligar, urlDoCanal } from '../src/index.js';
import type { SocketMinimo } from '../src/index.js';

/**
 * A reconexão é a razão de este pacote existir: é a parte que, copiada em três fronts,
 * diverge em silêncio. Aqui ela é exercida com um socket de mentira e o relógio falso
 * do vitest — sem rede, sem espera real.
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
const criarSocket = (): SocketMinimo => {
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

describe('a URL do canal', () => {
  it('troca http por ws e https por wss', () => {
    expect(urlDoCanal('http://localhost:3000')).toBe('ws://localhost:3000/v1/eventos');
    expect(urlDoCanal('https://api.usepipe.com.br/')).toBe(
      'wss://api.usepipe.com.br/v1/eventos',
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
    // Quando a API reinicia todos caem no mesmo instante; sem jitter voltam no mesmo
    // instante também.
    expect(esperaDaTentativa(3, () => 0)).toBe(3_200);
    expect(esperaDaTentativa(3, () => 1)).toBe(4_800);
  });
});

describe('ligação', () => {
  it('manda a inscrição assim que abre', () => {
    const ligacao = ligar({
      urlApi: 'http://api.teste',
      assuntos: ['conversa', 'fila'],
      aoEvento: () => undefined,
      criarSocket,
    });
    ultimo().abrir();

    expect(JSON.parse(ultimo().enviados[0]!)).toEqual({ assuntos: ['conversa', 'fila'] });
    expect(ligacao.estado()).toBe('ligado');
    ligacao.fechar();
  });

  it('entrega evento e IGNORA quadro de controle', () => {
    const recebidos: unknown[] = [];
    const ligacao = ligar({
      urlApi: 'http://api.teste',
      assuntos: ['conversa'],
      aoEvento: (e) => recebidos.push(e),
      criarSocket,
    });
    ultimo().abrir();

    ultimo().mandar({ tipo: 'inscrito', assuntos: ['conversa'] });
    ultimo().mandar({ tipo: 'ping' });
    ultimo().mandar({ assunto: 'conversa', id: 'c1', em: '2026-09-07T00:00:00.000Z' });

    // `ping` e `inscrito` não fazem a tela rebuscar nada.
    expect(recebidos).toEqual([{ assunto: 'conversa', id: 'c1', em: '2026-09-07T00:00:00.000Z' }]);
    ligacao.fechar();
  });

  it('aguenta corpo ilegível sem derrubar a tela', () => {
    const ligacao = ligar({
      urlApi: 'http://api.teste',
      assuntos: ['conversa'],
      aoEvento: () => {
        throw new Error('não deveria ser chamado');
      },
      criarSocket,
    });
    ultimo().abrir();
    expect(() => ultimo().onmessage?.({ data: 'isto não é json' })).not.toThrow();
    ligacao.fechar();
  });
});

describe('reconexão', () => {
  it('reconecta depois da queda e REENVIA a inscrição', () => {
    const ligacao = ligar({
      urlApi: 'http://api.teste',
      assuntos: ['fila'],
      aoEvento: () => undefined,
      criarSocket,
    });
    ultimo().abrir();
    expect(criados).toHaveLength(1);

    ultimo().cair();
    expect(ligacao.estado()).toBe('caiu');
    vi.advanceTimersByTime(2_000);

    expect(criados).toHaveLength(2);
    ultimo().abrir();
    // O servidor não guarda nada de quem caiu: socket novo começa sem assunto nenhum.
    expect(JSON.parse(ultimo().enviados[0]!)).toEqual({ assuntos: ['fila'] });
    ligacao.fechar();
  });

  it('espera mais a cada tentativa seguida', () => {
    const ligacao = ligar({
      urlApi: 'http://api.teste',
      assuntos: ['fila'],
      aoEvento: () => undefined,
      criarSocket,
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

  it('zera o backoff depois de uma ligação que deu certo', () => {
    const ligacao = ligar({
      urlApi: 'http://api.teste',
      assuntos: ['fila'],
      aoEvento: () => undefined,
      criarSocket,
    });
    ultimo().abrir();
    ultimo().cair();
    vi.advanceTimersByTime(2_000);
    ultimo().abrir(); // reconectou de verdade

    ultimo().cair();
    // Volta a esperar ~1 s, não os ~2 s da tentativa anterior.
    vi.advanceTimersByTime(1_300);
    expect(criados).toHaveLength(3);
    ligacao.fechar();
  });

  it('derruba e reconecta depois de 35 s de silêncio — socket morto não avisa', () => {
    // O TCP pode ficar aberto do lado do navegador enquanto o outro lado já foi
    // embora. Sem este vigia, a tela pareceria viva e parada.
    const ligacao = ligar({
      urlApi: 'http://api.teste',
      assuntos: ['conversa'],
      aoEvento: () => undefined,
      criarSocket,
    });
    const primeiro = ultimo();
    primeiro.abrir();

    vi.advanceTimersByTime(34_000);
    expect(primeiro.fechado).toBe(false);

    // Um passo além dos 35 s, e NÃO 2 s: a primeira retentativa é agendada para
    // 800–1200 ms depois da queda (backoff de 1 s com jitter de ±20%), então medir em
    // +2 s cai depois dela e lê `ligando` ou `caiu` conforme o sorteio. Este teste
    // passava em cerca de metade das execuções, e eu relatei verde em cima de uma.
    vi.advanceTimersByTime(1_001);
    expect(primeiro.fechado).toBe(true);
    expect(ligacao.estado()).toBe('caiu');

    // E `caiu` tem de DURAR o bastante para a tela mostrar "conexão perdida" — é para
    // isso que `aoEstado` existe. 700 ms está abaixo do piso do backoff (800 ms).
    vi.advanceTimersByTime(700);
    expect(ligacao.estado()).toBe('caiu');

    // Passado o teto do backoff (1200 ms), aí sim tenta de novo.
    vi.advanceTimersByTime(600);
    expect(ligacao.estado()).toBe('ligando');
    ligacao.fechar();
  });

  it('o ping do servidor adia a sentença de morte', () => {
    const ligacao = ligar({
      urlApi: 'http://api.teste',
      assuntos: ['conversa'],
      aoEvento: () => undefined,
      criarSocket,
    });
    const primeiro = ultimo();
    primeiro.abrir();

    // Um ping a cada 15 s, como o servidor manda.
    for (let i = 0; i < 6; i += 1) {
      vi.advanceTimersByTime(15_000);
      primeiro.mandar({ tipo: 'ping' });
    }

    expect(primeiro.fechado).toBe(false);
    expect(ligacao.estado()).toBe('ligado');
    ligacao.fechar();
  });

  it('avisa a tela do estado, para ela poder dizer "reconectando"', () => {
    const estados: string[] = [];
    const ligacao = ligar({
      urlApi: 'http://api.teste',
      assuntos: ['conversa'],
      aoEvento: () => undefined,
      aoEstado: (e) => estados.push(e),
      criarSocket,
    });
    ultimo().abrir();
    ultimo().cair();
    vi.advanceTimersByTime(2_000);
    ultimo().abrir();

    expect(estados).toEqual(['ligado', 'caiu', 'ligando', 'ligado']);
    ligacao.fechar();
  });

  it('fechar de propósito não reconecta', () => {
    const ligacao = ligar({
      urlApi: 'http://api.teste',
      assuntos: ['conversa'],
      aoEvento: () => undefined,
      criarSocket,
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
      assuntos: ['conversa'],
      aoEvento: () => undefined,
      criarSocket: () => {
        vezes += 1;
        if (vezes === 1) throw new Error('rede fora');
        return criarSocket();
      },
    });

    expect(ligacao.estado()).toBe('caiu');
    vi.advanceTimersByTime(2_000);
    expect(vezes).toBe(2);
    ligacao.fechar();
  });
});
