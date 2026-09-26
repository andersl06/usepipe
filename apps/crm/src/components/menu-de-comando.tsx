'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icone } from '@pipe/ui';
import { ROTULO_DO_TIPO, type Resultado, type TipoDeResultado } from '../lib/search-tipos';
import { buscarGlobal } from '../app/actions-search';

/**
 * The command menu, measured against `twenty-front`'s `command-menu`.
 *
 * It's the feature that defines Twenty the most: you don't navigate to the
 * record, you call it by name. `Ctrl+K` (`meta+k` on Mac) — the same shortcuts as
 * their `useCommandMenuHotKeys` — and that's why the sidebar can stay short.
 *
 * **Panel on the right, full height**, like theirs (`height: 100%; top: 0`), and
 * not a floating box in the middle: the panel leaves the screen behind it
 * visible, and whoever is searching is usually comparing against what they're
 * already seeing.
 *
 * Three things that make the difference between a search field and a command
 * menu, and all of them came from reading theirs:
 *
 * 1. **The keyboard resolves everything.** Arrows move through it, Enter
 *    opens, Esc closes. The hand never leaves the keyboard, which is the point.
 * 2. **The search is debounced by 150ms.** Without this, every keystroke
 *    becomes a query, and a fast typist fires eight to read the last one.
 * 3. **An out-of-order response is discarded.** The query for "an" can arrive
 *    after the one for "anderson" and overwrite the right result with the old
 *    one — it's the classic search-as-you-type defect, and the request counter
 *    fixes it.
 */

const ATRASO_MS = 150;

export function MenuDeComando() {
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState('');
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [indice, setIndice] = useState(0);
  const campo = useRef<HTMLInputElement>(null);
  /** Only the most recent request's response counts. See item 3 of the header. */
  const pedido = useRef(0);
  const router = useRouter();

  const fechar = useCallback(() => {
    setAberto(false);
    setTermo('');
    setResultados([]);
    setIndice(0);
  }, []);

  // Ctrl+K / ⌘K opens; the same shortcut closes, which is what you'd expect from a toggle.
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
      // Arrived late: another search already came back after this one. Discard.
      if (meu !== pedido.current) return;
      setResultados(achados);
      setIndice(0);
      setCarregando(false);
    }, ATRASO_MS);

    return () => clearTimeout(relogio);
  }, [termo, aberto]);

  /** Grouped by object, in the label's fixed order — the same one the sidebar uses. */
  const groups = useMemo(() => {
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
      // Circular: reaching the end and continuing wraps back to the start, instead of stopping.
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

  let position = -1;

  return (
    <>
      {/*
 * The overlay closes on click, and has no tint: the panel already separates
 * what's menu from what's screen, and darkening everything would hide what the
 * person wants to compare.
 */}
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
            groups.map(([tipo, itens]) => (
              <div key={tipo}>
                <div className="c-cmd-grupo">{ROTULO_DO_TIPO[tipo]}</div>
                {itens.map((r) => {
                  position += 1;
                  const atual = position;
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
