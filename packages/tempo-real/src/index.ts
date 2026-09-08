import type { Assunto, EventoDoServidor, Inscricao, QuadroDeControle } from '@pipe/contracts';

/**
 * O cliente do canal de tempo real. **Escrito UMA vez, para os três fronts.**
 *
 * ## A regra que este pacote existe para proteger
 *
 * **`aoEvento` REBUSCA. Nunca aplica o payload.**
 *
 * O evento diz O QUE mudou — `{assunto, id, em}` — e nada mais. Quem recebe vai buscar
 * o dado pela API, sob RLS. Isso não é economia de bytes: é o que impede o canal de
 * virar uma segunda fonte de verdade, com um segundo lugar para errar o isolamento
 * entre clientes. A primeira fonte é a API, que tem 90 políticas de RLS e os testes.
 *
 * **Se um dia alguém propuser pôr o registro dentro do payload, recuse.** O ganho seria
 * uma requisição a menos; o preço é o dado do cliente saindo por uma porta que ninguém
 * auditou, e a tela passando a mostrar o valor que estava viajando em vez do valor de
 * agora. Foi decidido no começo do projeto, está em `packages/contracts/src/eventos.ts`,
 * e está repetido aqui porque é aqui que a tentação aparece.
 *
 * ## Por que um pacote, e não um trecho copiado em cada front
 *
 * Reconexão, backoff, reenvio da inscrição e detecção de queda são a parte que sempre
 * diverge quando é copiada — e diverge em silêncio, porque a tela continua abrindo. O
 * Desk já teve três cópias da régua de prioridade, uma delas errada. Aqui é uma só.
 *
 * ```ts
 * const ligacao = ligar({
 *   urlApi: 'http://localhost:3000',
 *   assuntos: ['conversa', 'fila'],
 *   aoEvento: (evento) => { if (evento.assunto === 'fila') rebuscarLista(); },
 * });
 * // ao desmontar a tela:
 * ligacao.fechar();
 * ```
 */

/** Espera inicial da reconexão. Dobra a cada tentativa até o teto. */
const ESPERA_BASE_MS = 1_000;
const ESPERA_TETO_MS = 30_000;

/**
 * Sem NENHUMA mensagem por este tempo, a ligação é dada como morta.
 *
 * O servidor manda `{tipo:'ping'}` a cada 15 s (`CONNECTION_TEST_INTERVAL` da Blip).
 * Dois intervalos de silêncio é o critério — um só daria falso positivo em qualquer
 * engasgo de rede, e três deixaria a tela parada por quase um minuto.
 *
 * Existe porque **socket morto não avisa**: o TCP pode ficar aberto do lado do
 * navegador enquanto o outro lado já foi embora, e o sintoma é a tela parecer viva e
 * parada — o pior dos dois mundos, e o defeito que o tempo real veio consertar.
 */
const SILENCIO_ATE_MORRER_MS = 35_000;

export type EstadoDaLigacao = 'ligando' | 'ligado' | 'caiu';

/** O mínimo de `WebSocket` que este cliente usa. Existe para o teste injetar o seu. */
export interface SocketMinimo {
  send: (dado: string) => void;
  close: () => void;
  onopen: ((...args: unknown[]) => void) | null;
  onmessage: ((evento: { data: unknown }) => void) | null;
  onclose: ((...args: unknown[]) => void) | null;
  onerror: ((...args: unknown[]) => void) | null;
}

export interface OpcoesDaLigacao {
  /** Base da API vista pelo NAVEGADOR. `http` vira `ws`, `https` vira `wss`. */
  urlApi: string;
  assuntos: Assunto[];
  /**
   * Chamado a cada evento. **Rebusque aqui; não aplique payload** — ver o topo.
   * Nunca é chamado com `ping`, que é quadro de controle e não evento.
   */
  aoEvento: (evento: EventoDoServidor) => void;
  /** Para a tela mostrar "reconectando…" quando quiser. Opcional. */
  aoEstado?: (estado: EstadoDaLigacao) => void;
  /** Só para teste. */
  criarSocket?: (url: string) => SocketMinimo;
}

export interface Ligacao {
  fechar: () => void;
  /** O estado atual, para a tela que prefere perguntar a ouvir. */
  estado: () => EstadoDaLigacao;
}

export function urlDoCanal(urlApi: string): string {
  return `${urlApi.replace(/\/$/, '').replace(/^http/, 'ws')}/v1/eventos`;
}

/**
 * Espera da próxima tentativa: exponencial com teto e **jitter de ±20%**.
 *
 * O jitter não é enfeite. Quando a API reinicia, todos os navegadores caem no mesmo
 * instante; sem jitter todos voltam no mesmo instante também, e a primeira coisa que a
 * API recém-subida recebe é a manada inteira de uma vez.
 */
export function esperaDaTentativa(tentativa: number, sortear: () => number = Math.random): number {
  const crescente = Math.min(ESPERA_TETO_MS, ESPERA_BASE_MS * 2 ** Math.max(0, tentativa - 1));
  return Math.round(crescente * (0.8 + sortear() * 0.4));
}

export function ligar(opcoes: OpcoesDaLigacao): Ligacao {
  const url = urlDoCanal(opcoes.urlApi);
  const criar = opcoes.criarSocket ?? padraoCriarSocket;

  let socket: SocketMinimo | null = null;
  let tentativa = 0;
  let fechadoDeProposito = false;
  let estado: EstadoDaLigacao = 'ligando';
  let reconexao: ReturnType<typeof setTimeout> | null = null;
  let vigia: ReturnType<typeof setTimeout> | null = null;

  const mudarEstado = (novo: EstadoDaLigacao): void => {
    if (estado === novo) return;
    estado = novo;
    opcoes.aoEstado?.(novo);
  };

  /** Qualquer coisa vinda do servidor — evento OU ping — adia a sentença de morte. */
  const respirou = (): void => {
    if (vigia) clearTimeout(vigia);
    vigia = setTimeout(() => {
      // Não espera o `onclose`, que pode nunca chegar num socket meio-morto.
      try {
        socket?.close();
      } catch {
        /* fechar socket já morto não é problema */
      }
      aoCair();
    }, SILENCIO_ATE_MORRER_MS);
  };

  const aoCair = (): void => {
    if (fechadoDeProposito) return;
    if (reconexao) return; // já há uma tentativa agendada
    socket = null;
    mudarEstado('caiu');
    tentativa += 1;
    reconexao = setTimeout(() => {
      reconexao = null;
      abrir();
    }, esperaDaTentativa(tentativa));
  };

  const abrir = (): void => {
    if (fechadoDeProposito) return;
    mudarEstado('ligando');
    let novo: SocketMinimo;
    try {
      novo = criar(url);
    } catch {
      aoCair();
      return;
    }
    socket = novo;

    novo.onopen = () => {
      tentativa = 0;
      mudarEstado('ligado');
      // **A inscrição é reenviada a cada reconexão.** O servidor não guarda nada de
      // quem caiu: socket novo começa sem assunto nenhum e não entrega nada até isto.
      const inscricao: Inscricao = { assuntos: opcoes.assuntos };
      novo.send(JSON.stringify(inscricao));
      respirou();
    };

    novo.onmessage = (mensagem) => {
      respirou();
      let corpo: EventoDoServidor | QuadroDeControle;
      try {
        corpo = JSON.parse(String(mensagem.data)) as EventoDoServidor | QuadroDeControle;
      } catch {
        return;
      }
      // Quadro de controle não é evento: `ping`, `inscrito` e `recusado` não fazem a
      // tela rebuscar nada.
      if ('tipo' in corpo) return;
      opcoes.aoEvento(corpo);
    };

    novo.onclose = aoCair;
    novo.onerror = () => {
      // `onerror` costuma vir seguido de `onclose`; `aoCair` é idempotente por conta
      // da guarda de `reconexao`.
      aoCair();
    };
  };

  /**
   * Volta AGORA quando o navegador diz que dá para voltar.
   *
   * **A aba oculta NÃO desliga a ligação** — e isto mudou de ideia no meio do caminho.
   * A intenção original era pausar com a aba escondida, até ficar claro que o atendente
   * com o Desk numa aba de fundo é exatamente quem precisa ouvir a conversa nova
   * chegando. O que a visibilidade faz aqui é outra coisa: se a ligação JÁ caiu e a
   * pessoa volta para a aba, não faz sentido ela esperar os 30 s do backoff olhando
   * uma tela velha.
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
    estado: () => estado,
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

function padraoCriarSocket(url: string): SocketMinimo {
  const WS = globalThis.WebSocket;
  if (!WS) throw new Error('WebSocket não existe neste ambiente');
  // `credentials` não se configura aqui: o navegador manda o cookie de sessão no
  // handshake de mesma origem-pai, que é como a API autentica a ligação.
  return new WS(url) as unknown as SocketMinimo;
}
