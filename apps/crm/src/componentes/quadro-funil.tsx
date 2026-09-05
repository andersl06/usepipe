'use client';

import Link from 'next/link';
import { useOptimistic, useState, useTransition } from 'react';
import { moverOportunidade } from '../app/oportunidades/acoes';
import { dinheiroCurto, numero } from '../lib/formato';

/**
 * Quadro do funil, com arraste entre fases.
 *
 * O arraste usa a API nativa de drag and drop do navegador — nenhuma biblioteca.
 * Quem não arrasta usa o seletor de fase dentro do cartão, que é a mesma ação por
 * teclado: quadro sem alternativa acessível é quadro que exclui parte do time.
 *
 * O cartão chega com o valor já formatado *e* o número cru: o formatado é o que
 * aparece, o cru é o que soma o total da coluna enquanto o servidor não responde.
 */

export interface CartaoView {
  id: string;
  nome: string;
  valorNum: number;
  valor: string;
  detalhe: string;
  leadId: string | null;
  fase: string;
}

interface Props {
  fases: readonly string[];
  cartoes: CartaoView[];
}

export function QuadroFunil({ fases, cartoes }: Props) {
  const [, iniciar] = useTransition();
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);

  const [visao, moverOtimista] = useOptimistic(
    cartoes,
    (estado: CartaoView[], mov: { id: string; fase: string }) =>
      estado.map((c) => (c.id === mov.id ? { ...c, fase: mov.fase } : c)),
  );

  function mover(id: string, fase: string) {
    const atual = visao.find((c) => c.id === id);
    if (!atual || atual.fase === fase) return;
    iniciar(async () => {
      moverOtimista({ id, fase });
      await moverOportunidade(id, fase);
    });
  }

  return (
    <div className="lanes">
      {fases.map((fase) => {
        const daFase = visao.filter((c) => c.fase === fase);
        const total = daFase.reduce((s, c) => s + c.valorNum, 0);

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
              O total fica no topo, não no rodapé do mockup: com dezesseis cartões na
              coluna, o número do rodapé nasce fora da tela e ninguém o vê.
            */}
            <header>
              <span className="lbl">{fase}</span>
              <span className="c">
                {numero(daFase.length)} · {dinheiroCurto(total)}
              </span>
            </header>

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
                <b>{c.leadId ? <Link href={`/leads/${c.leadId}`}>{c.nome}</Link> : c.nome}</b>
                <span className="val">{c.valor}</span>
                <span className="ow">{c.detalhe}</span>
                <select
                  className="btn"
                  value={c.fase}
                  aria-label={`Fase de ${c.nome}`}
                  onChange={(e) => mover(c.id, e.target.value)}
                >
                  {fases.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
