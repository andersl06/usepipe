'use client';

import Link from 'next/link';
import { useOptimistic, useState, useTransition } from 'react';
import { moverOpportunity } from '../app/opportunities/actions';
import { Etiqueta, Seletor } from '@pipe/ui';
import { moneyCurto, numero } from '../lib/format';

/**
 * Funnel board, with drag between stages.
 *
 * Dragging uses the browser's native drag-and-drop API — no library. Whoever
 * doesn't drag uses the stage selector inside the card, which is the same
 * action via keyboard: a board with no accessible alternative is a board that
 * excludes part of the team.
 *
 * The card arrives with the value already formatted *and* the raw number: the
 * formatted one is what shows, the raw one is what sums the column's total
 * while the server hasn't answered yet.
 *
 * What reading Twenty's board changed here:
 *
 * - **Column header pinned to the top.** With sixteen cards, scrolling the
 *   column pushed the stage name and total off screen, and the board turned
 *   into a list of cards with no columns.
 * - **The stage selector only shows on hover or focus.** They use the same
 *   technique (animated max-width, not `display:none`) and for the same reason:
 *   a control repeated on every card is noise at rest. Since the trigger
 *   includes `:focus-within`, the keyboard path stays whole.
 * - **An empty column says it's empty.** It used to be a blank rectangle, which
 *   reads as "still loading" and not as "there's nothing here".
 *
 * What we did NOT copy: the insertion indicator between cards. It promises an
 * order within the column, and our opportunity doesn't store a position — the
 * column is sorted by value on the server. Drawing the indicator would promise
 * a control the write doesn't have.
 */

export interface CardView {
  id: string;
  nome: string;
  valueNum: number;
  value: string;
  detalhe: string;
  fase: string;
  /** Days late on the expected close date, or `null` when it hasn't passed. */
  diasVencido: number | null;
}

interface Props {
  fases: readonly string[];
  cards: CardView[];
}

export function QuadroFunil({ fases, cards }: Props) {
  const [, iniciar] = useTransition();
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);

  const [visao, moverOtimista] = useOptimistic(
    cards,
    (state: CardView[], mov: { id: string; fase: string }) =>
      state.map((c) => (c.id === mov.id ? { ...c, fase: mov.fase } : c)),
  );

  function mover(id: string, fase: string) {
    const atual = visao.find((c) => c.id === id);
    if (!atual || atual.fase === fase) return;
    iniciar(async () => {
      moverOtimista({ id, fase });
      await moverOpportunity(id, fase);
    });
  }

  return (
    <div className="lanes">
      {fases.map((fase) => {
        const daFase = visao.filter((c) => c.fase === fase);
        const total = daFase.reduce((s, c) => s + c.valueNum, 0);

        return (
          <div
            key={fase}
            className={alvo === fase ? 'lane alvo' : 'lane'}
            onDragOver={(e) => {
              e.preventDefault();
              setAlvo(fase);
            }}
            onDragLeave={() => setAlvo((a) => (a === fase ? null : a))}
            onDrop={(e) => {
              e.preventDefault();
              setAlvo(null);
              setArrastando(null);
              const id = e.dataTransfer.getData('text/plain');
              if (id) mover(id, fase);
            }}
          >
            {/*
 * The total stays at the top, not at the bottom like the mockup: with sixteen
 * cards in the column, a bottom number is born off-screen and nobody sees it.
 */}
            <header>
              <span className="fase">{fase}</span>
              <span className="c" title={`${numero(daFase.length)} oportunidades, ${moneyCurto(total)} em jogo`}>
                {numero(daFase.length)} · {moneyCurto(total)}
              </span>
            </header>

            {daFase.length === 0 ? (
              <p className="lane-vazia">Nada nesta fase.</p>
            ) : null}

            {daFase.map((c) => (
              <div
                key={c.id}
                className={arrastando === c.id ? 'opp arrastando' : 'opp'}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', c.id);
                  e.dataTransfer.effectAllowed = 'move';
                  setArrastando(c.id);
                }}
                onDragEnd={() => setArrastando(null)}
              >
                <b>
                  {/*
 * The card leads to the opportunity's OWN record now, not the lead's anymore:
 * the deal now has an address, and it's that address that gets pasted into chat
 * when someone asks about this deal.
 */}
                  <Link href={`/opportunities/${c.id}`}>{c.nome}</Link>
                </b>
                <span className="val">{c.value}</span>
                <span className="ow">{c.detalhe}</span>
                {/*
 * The board's only color. An expected close date in the past on an opportunity
 * that's still open is the thing someone needs to act on today — either close
 * it or reschedule it. Everything else here is a category.
 */}
                {c.diasVencido !== null ? (
                  <span>
                    <Etiqueta tom="alerta">
                      fechamento vencido há {numero(c.diasVencido)} dias
                    </Etiqueta>
                  </span>
                ) : null}
                {/*
 * The selector is the keyboard alternative to dragging, and it's what keeps the
 * board from excluding half the team. It stays collapsed at rest and opens on
 * hover or focus: collapsed via animated height, never via `display:none`, or
 * focus couldn't reach it.
 */}
                <div className="acao">
                  <Seletor
                    value={c.fase}
                    aria-label={`Fase de ${c.nome}`}
                    onChange={(e) => mover(c.id, e.target.value)}
                  >
                    {fases.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </Seletor>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
