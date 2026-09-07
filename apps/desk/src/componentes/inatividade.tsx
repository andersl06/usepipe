'use client';

import { useEffect, useRef, useState } from 'react';
import { cairPorInatividade } from '../app/acoes';
import {
  INATIVIDADE_AVISO_MS,
  INATIVIDADE_CHECAGEM_MS,
  INATIVIDADE_OFFLINE_MS,
  INATIVIDADE_REINICIO_MINIMO_MS,
} from '../lib/operacao';
import type { EstadoAtendente } from '../servidor/consultas';

/**
 * Queda por inatividade, na régua medida na tela de referência e registrada em
 * `docs/pesquisa/blip-desk-medidas.md`, §9:
 *
 * - **10 minutos** sem nenhum gesto → o aviso aparece, com a contagem do que
 *   falta.
 * - **mais 10 minutos** sem gesto → o status cai para Offline sozinho.
 * - a conferência acontece a cada **5 segundos**, e o relógio só reinicia uma
 *   vez por segundo, no máximo.
 *
 * Por que existe: atendente marcado como Online que largou a tela continua
 * recebendo conversa, e cada conversa que cai nele fica parada até alguém
 * perceber. A queda automática é o que impede a fila de acumular em cima de
 * quem não está lá.
 *
 * **O aviso é bloqueante de propósito, e não uma faixa discreta.** Ele cobre a
 * tela e traz o botão que reinicia o relógio. Um aviso passivo no rodapé é lido
 * como enfeite justamente por quem ele deveria acordar — e, quando a pessoa
 * volta, ela já caiu e não sabe por quê.
 *
 * Quem já está Offline não é observado: não há o que derrubar, e o aviso
 * apareceria para quem acabou de escolher sair.
 *
 * A contagem vive só aqui, no navegador. O servidor não sabe de mouse; o que
 * chega até ele é o veredito, uma vez, quando o prazo estoura.
 */

/**
 * Os gestos que contam como presença. É a lista mais curta que cobre as três
 * formas de usar a tela: mouse, teclado e dedo. `visibilitychange` entra porque
 * voltar para a aba é, sim, um gesto — e sem ele quem deixa o Desk numa aba de
 * fundo cai mesmo estando trabalhando na conversa ao lado.
 */
const GESTOS = [
  'pointerdown',
  'pointermove',
  'keydown',
  'wheel',
  'touchstart',
  'visibilitychange',
] as const;

function minutos(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 60000));
  return total === 1 ? '1 minuto' : `${total} minutos`;
}

export function VigiaDeInatividade({ estado }: { estado: EstadoAtendente }) {
  /** Quanto falta para a queda, ou `null` enquanto o aviso não vale. */
  const [faltando, setFaltando] = useState<number | null>(null);
  const ultimoGesto = useRef<number>(Date.now());
  /** Trava de uma só queda: a ação é idempotente, mas a rede não é de graça. */
  const caiu = useRef(false);

  useEffect(() => {
    if (estado === 'offline') return;

    // O relógio recomeça sempre que o estado muda: quem acabou de escolher
    // "Ficar Online" fez um gesto, e começar com o relógio corrido derrubaria a
    // pessoa segundos depois de ela voltar.
    ultimoGesto.current = Date.now();
    caiu.current = false;
    setFaltando(null);

    function tocar(): void {
      const agora = Date.now();
      if (agora - ultimoGesto.current < INATIVIDADE_REINICIO_MINIMO_MS) return;
      ultimoGesto.current = agora;
      setFaltando(null);
    }

    for (const gesto of GESTOS) {
      document.addEventListener(gesto, tocar, { passive: true });
    }

    const relogio = window.setInterval(() => {
      const parado = Date.now() - ultimoGesto.current;
      if (parado < INATIVIDADE_AVISO_MS) return;

      const restante = INATIVIDADE_AVISO_MS + INATIVIDADE_OFFLINE_MS - parado;
      if (restante > 0) {
        setFaltando(restante);
        return;
      }
      if (caiu.current) return;
      caiu.current = true;
      setFaltando(0);
      void cairPorInatividade();
    }, INATIVIDADE_CHECAGEM_MS);

    return () => {
      window.clearInterval(relogio);
      for (const gesto of GESTOS) document.removeEventListener(gesto, tocar);
    };
  }, [estado]);

  if (faltando === null) return null;

  return (
    <div className="inativo" role="alertdialog" aria-live="assertive" aria-label="Inatividade">
      <div className="inativo-caixa">
        <h4>Você ainda está aí?</h4>
        {faltando > 0 ? (
          <p>
            Faz 10 minutos que nada acontece nesta tela. Em {minutos(faltando)} o seu status cai
            para Offline e você sai da distribuição.
          </p>
        ) : (
          <p>
            Seu status caiu para Offline por inatividade. Nenhuma conversa nova chega até você
            ficar Online de novo.
          </p>
        )}
        {/* O botão não faz nada por si: clicar nele JÁ é o gesto que reinicia o
            relógio, e é por isso que ele não chama ação nenhuma. Ele existe
            para dar à pessoa o alvo óbvio do "estou aqui". */}
        <button type="button" className="btn primary" onClick={() => setFaltando(null)}>
          {faltando > 0 ? 'Continuo aqui' : 'Entendi'}
        </button>
      </div>
    </div>
  );
}
