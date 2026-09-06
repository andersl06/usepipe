'use client';

import Link from 'next/link';
import { useOptimistic, useState, useTransition } from 'react';
import { moverOportunidade } from '../app/oportunidades/acoes';
import { Etiqueta, Seletor } from '@pipe/ui';
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
 *
 * O que a leitura do quadro do Twenty mudou aqui:
 *
 * - **Cabeçalho de coluna grudado no topo.** Com dezesseis cartões, rolar a
 *   coluna fazia o nome da fase e o total saírem da tela, e o quadro virava uma
 *   lista de cartões sem colunas.
 * - **O seletor de fase só aparece no hover ou no foco.** Eles usam a mesma
 *   técnica (largura máxima animada, não `display:none`) e pela mesma razão: um
 *   controle repetido em cada cartão é ruído em repouso. Como o gatilho inclui
 *   `:focus-within`, o caminho do teclado continua inteiro.
 * - **Coluna vazia diz que está vazia.** Antes era um retângulo em branco, que
 *   se lê como "ainda carregando" e não como "não há nada aqui".
 *
 * O que NÃO copiamos: o indicador de inserção entre cartões. Ele promete uma
 * ordem dentro da coluna, e a nossa oportunidade não guarda posição — a coluna
 * é ordenada por valor pelo servidor. Desenhar o indicador seria prometer um
 * controle que a escrita não tem.
 */

export interface CartaoView {
  id: string;
  nome: string;
  valorNum: number;
  valor: string;
  detalhe: string;
  leadId: string | null;
  fase: string;
  /** Dias de atraso do fechamento previsto, ou `null` quando não venceu. */
  diasVencido: number | null;
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
              <span className="fase">{fase}</span>
              <span className="c" title={`${numero(daFase.length)} oportunidades, ${dinheiroCurto(total)} em jogo`}>
                {numero(daFase.length)} · {dinheiroCurto(total)}
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
                <b>{c.leadId ? <Link href={`/leads/${c.leadId}`}>{c.nome}</Link> : c.nome}</b>
                <span className="val">{c.valor}</span>
                <span className="ow">{c.detalhe}</span>
                {/*
                  A única cor do quadro. Fechamento previsto no passado com a
                  oportunidade ainda aberta é a coisa que alguém resolve hoje —
                  ou fecha, ou remarca. Tudo o mais aqui é categoria.
                */}
                {c.diasVencido !== null ? (
                  <span>
                    <Etiqueta tom="alerta">
                      fechamento vencido há {numero(c.diasVencido)} dias
                    </Etiqueta>
                  </span>
                ) : null}
                {/*
                  O seletor é a alternativa de teclado ao arraste, e é ele que
                  faz o quadro não excluir metade do time. Fica recolhido em
                  repouso e abre no hover ou no foco: recolhido por altura
                  animada, nunca por `display:none`, senão o foco não o alcança.
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
