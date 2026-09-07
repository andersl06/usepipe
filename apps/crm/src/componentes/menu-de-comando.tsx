'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icone } from '@pipe/ui';
import { ROTULO_DO_TIPO, type Resultado, type TipoDeResultado } from '../lib/busca-tipos';
import { buscarGlobal } from '../app/acoes-busca';

/**
 * O menu de comando, medido no `command-menu` do `twenty-front`.
 *
 * É a funcionalidade que mais define o Twenty: você não navega até o registro,
 * você chama pelo nome. `Ctrl+K` (`meta+k` no Mac) — os mesmos atalhos do
 * `useCommandMenuHotKeys` deles — e é por isso que a lateral pode ser curta.
 *
 * **Painel à direita, altura inteira**, como o deles (`height: 100%; top: 0`),
 * e não caixa flutuante no meio: o painel deixa a tela de trás visível, e quem
 * busca costuma estar comparando com o que já está vendo.
 *
 * Três coisas que fazem a diferença entre um campo de busca e um menu de
 * comando, e todas vieram da leitura deles:
 *
 * 1. **O teclado resolve tudo.** Setas percorrem, Enter abre, Esc fecha. A mão
 *    não sai do teclado, que é o ponto.
 * 2. **A busca é adiada em 150 ms.** Sem isso, cada tecla vira uma consulta, e
 *    quem digita rápido dispara oito para ler a última.
 * 3. **Resposta fora de ordem é descartada.** A consulta de "an" pode chegar
 *    depois da de "anderson" e sobrescrever o resultado certo com o velho — é o
 *    defeito clássico de busca-enquanto-digita, e o contador de pedido resolve.
 */

const ATRASO_MS = 150;

export function MenuDeComando() {
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState('');
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [indice, setIndice] = useState(0);
  const campo = useRef<HTMLInputElement>(null);
  /** Só a resposta do pedido mais recente vale. Ver o item 3 do cabeçalho. */
  const pedido = useRef(0);
  const router = useRouter();

  const fechar = useCallback(() => {
    setAberto(false);
    setTermo('');
    setResultados([]);
    setIndice(0);
  }, []);

  // Ctrl+K / ⌘K abre; o mesmo atalho fecha, que é o que se espera de um alternador.
  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'k') {
        evento.preventDefault();
        setAberto((estava) => !estava);
      }
    }
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, []);

  useEffect(() => {
    if (aberto) campo.current?.focus();
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const limpo = termo.trim();
    if (limpo.length < 2) {
      setResultados([]);
      setCarregando(false);
      return;
    }

    setCarregando(true);
    const meu = ++pedido.current;
    const relogio = setTimeout(async () => {
      const achados = await buscarGlobal(limpo);
      // Chegou tarde: outra busca já saiu depois desta. Descarta.
      if (meu !== pedido.current) return;
      setResultados(achados);
      setIndice(0);
      setCarregando(false);
    }, ATRASO_MS);

    return () => clearTimeout(relogio);
  }, [termo, aberto]);

  /** Agrupado por objeto, na ordem fixa do rótulo — a mesma da lateral. */
  const grupos = useMemo(() => {
    const mapa = new Map<TipoDeResultado, Resultado[]>();
    for (const r of resultados) {
      const lista = mapa.get(r.tipo) ?? [];
      lista.push(r);
      mapa.set(r.tipo, lista);
    }
    return [...mapa.entries()];
  }, [resultados]);

  const abrir = useCallback(
    (resultado: Resultado) => {
      fechar();
      router.push(resultado.href);
    },
    [fechar, router],
  );

  function aoTeclarNoCampo(evento: React.KeyboardEvent) {
    if (evento.key === 'Escape') {
      evento.preventDefault();
      fechar();
      return;
    }
    if (resultados.length === 0) return;

    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      // Circular: chegar no fim e continuar volta ao começo, em vez de travar.
      setIndice((i) => (i + 1) % resultados.length);
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      setIndice((i) => (i - 1 + resultados.length) % resultados.length);
    } else if (evento.key === 'Enter') {
      evento.preventDefault();
      const escolhido = resultados[indice];
      if (escolhido) abrir(escolhido);
    }
  }

  if (!aberto) return null;

  let posicao = -1;

  return (
    <>
      {/* O véu fecha ao clique, e não tem tinta: o painel já separa o que é
          menu do que é tela, e escurecer tudo esconderia o que a pessoa quer
          comparar. */}
      <div className="c-cmd-veu" onClick={fechar} aria-hidden="true" />

      <div className="c-cmd" role="dialog" aria-modal="true" aria-label="Buscar">
        <div className="c-cmd-campo">
          <Icone nome="busca" tamanho={16} />
          <input
            ref={campo}
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={aoTeclarNoCampo}
            placeholder="Buscar lead, conta, contato…"
            aria-label="Buscar"
          />
          <kbd>esc</kbd>
        </div>

        <div className="c-cmd-lista">
          {termo.trim().length < 2 ? (
            <p className="c-cmd-dica">
              Escreva ao menos duas letras. <kbd>↑</kbd> <kbd>↓</kbd> percorrem, <kbd>enter</kbd>{' '}
              abre.
            </p>
          ) : carregando ? (
            <p className="c-cmd-dica">Buscando…</p>
          ) : resultados.length === 0 ? (
            <p className="c-cmd-dica">Nada encontrado para “{termo.trim()}”.</p>
          ) : (
            grupos.map(([tipo, itens]) => (
              <div key={tipo}>
                <div className="c-cmd-grupo">{ROTULO_DO_TIPO[tipo]}</div>
                {itens.map((r) => {
                  posicao += 1;
                  const atual = posicao;
                  return (
                    <button
                      key={`${r.tipo}-${r.id}`}
                      type="button"
                      className={atual === indice ? 'c-cmd-item c-cmd-atual' : 'c-cmd-item'}
                      onClick={() => abrir(r)}
                      onMouseEnter={() => setIndice(atual)}
                    >
                      <b>{r.titulo}</b>
                      {r.detalhe ? <span>{r.detalhe}</span> : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
