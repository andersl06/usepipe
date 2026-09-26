'use client';

import { useEffect, useState } from 'react';
import { Icone } from '@pipe/ui';
import { KEY_TEMA, TEMAS, temaValido, type Tema } from '../../lib/settings-comum';

/**
 * The theme selector.
 *
 * Pipe already had both themes in `packages/ui/src/estilos/tokens.css` from the
 * start, in three blocks: light in `:root`, dark by system preference
 * (`@media (prefers-color-scheme: dark)`, scoped to
 * `:root:not([data-tema='claro'])`) and dark by choice
 * (`:root[data-tema='escuro']`). All that was missing was something to write the
 * attribute. That's this file.
 *
 * That's why there are three modes, not two: **`sistema` is the absence of the
 * attribute**, and it's what hands the decision back to the operating system. A
 * two-state switch couldn't get back there.
 *
 * It's stored in `localStorage` because theme is a DEVICE preference — the same
 * person wants dark on their laptop at night and light on their desk monitor.
 * Storing it on `usuario` would force picking one of the two for the person.
 *
 * Accessibility: these are real `<input type="radio">` inside a `<fieldset>`
 * with a `<legend>`. Arrow keys navigate, space selects, and the screen reader
 * announces "3 of 3" without a single `aria-` line — which is always better than
 * reimplementing a radio group with `div` and `role`.
 */

const ROTULOS: Record<Tema, { texto: string; icone: 'sol' | 'lua' | 'engrenagem' }> = {
  sistema: { texto: 'Do sistema', icone: 'engrenagem' },
  claro: { texto: 'Claro', icone: 'sol' },
  escuro: { texto: 'Escuro', icone: 'lua' },
};

/** Writing the attribute is all the theme needs: the CSS does the rest. */
function aplicar(tema: Tema) {
  const raiz = document.documentElement;
  if (tema === 'sistema') delete raiz.dataset['tema'];
  else raiz.dataset['tema'] = tema;
}

export function SeletorDeTema() {
  // Starts at `sistema` because the server doesn't know `localStorage`: any
  // other guess would cause a hydration mismatch and a flash of the wrong theme.
  const [tema, setTema] = useState<Tema>('sistema');

  useEffect(() => {
    const salvo = window.localStorage.getItem(KEY_TEMA);
    if (temaValido(salvo)) setTema(salvo);
  }, []);

  function escolher(novo: Tema) {
    setTema(novo);
    window.localStorage.setItem(KEY_TEMA, novo);
    aplicar(novo);
  }

  return (
    <fieldset className="cfg-temas">
      <legend>Tema</legend>
      {TEMAS.map((option) => (
        <label key={option} className="cfg-tema">
          <input
            type="radio"
            name="tema"
            value={option}
            checked={tema === option}
            onChange={() => escolher(option)}
          />
          <span>
            <Icone nome={ROTULOS[option].icone} tamanho={16} />
            {ROTULOS[option].texto}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
