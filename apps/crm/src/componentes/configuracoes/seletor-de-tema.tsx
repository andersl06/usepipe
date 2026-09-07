'use client';

import { useEffect, useState } from 'react';
import { Icone } from '@pipe/ui';
import { CHAVE_TEMA, TEMAS, temaValido, type Tema } from '../../lib/configuracoes-comum';

/**
 * O seletor de tema.
 *
 * O Pipe já tinha os dois temas em `packages/ui/src/estilos/tokens.css` desde o
 * começo, com três blocos: o claro em `:root`, o escuro por preferência do
 * sistema (`@media (prefers-color-scheme: dark)`, restrito a
 * `:root:not([data-tema='claro'])`) e o escuro por escolha
 * (`:root[data-tema='escuro']`). Faltava só quem escrevesse o atributo. É este
 * arquivo.
 *
 * Por isso os três modos, e não dois: **`sistema` é a ausência do atributo**, e
 * é ela que devolve a decisão ao sistema operacional. Um alternador de dois
 * estados não conseguiria voltar para lá.
 *
 * Guarda no `localStorage` porque tema é preferência de APARELHO — a mesma
 * pessoa quer escuro no notebook à noite e claro no monitor da mesa. Guardar no
 * `usuario` obrigaria a escolher uma das duas pela pessoa.
 *
 * Acessibilidade: são `<input type="radio">` de verdade dentro de um
 * `<fieldset>` com `<legend>`. Setas navegam, espaço escolhe e o leitor de tela
 * anuncia "3 de 3" sem uma linha de `aria-` — que é sempre melhor do que
 * reimplementar um grupo de rádio com `div` e `role`.
 */

const ROTULOS: Record<Tema, { texto: string; icone: 'sol' | 'lua' | 'engrenagem' }> = {
  sistema: { texto: 'Do sistema', icone: 'engrenagem' },
  claro: { texto: 'Claro', icone: 'sol' },
  escuro: { texto: 'Escuro', icone: 'lua' },
};

/** Escrever o atributo é tudo o que o tema precisa: o CSS faz o resto. */
function aplicar(tema: Tema) {
  const raiz = document.documentElement;
  if (tema === 'sistema') delete raiz.dataset['tema'];
  else raiz.dataset['tema'] = tema;
}

export function SeletorDeTema() {
  // Nasce em `sistema` porque o servidor não conhece o `localStorage`: qualquer
  // outro palpite daria hidratação divergente e um piscar de tema errado.
  const [tema, setTema] = useState<Tema>('sistema');

  useEffect(() => {
    const salvo = window.localStorage.getItem(CHAVE_TEMA);
    if (temaValido(salvo)) setTema(salvo);
  }, []);

  function escolher(novo: Tema) {
    setTema(novo);
    window.localStorage.setItem(CHAVE_TEMA, novo);
    aplicar(novo);
  }

  return (
    <fieldset className="cfg-temas">
      <legend>Tema</legend>
      {TEMAS.map((opcao) => (
        <label key={opcao} className="cfg-tema">
          <input
            type="radio"
            name="tema"
            value={opcao}
            checked={tema === opcao}
            onChange={() => escolher(opcao)}
          />
          <span>
            <Icone nome={ROTULOS[opcao].icone} tamanho={16} />
            {ROTULOS[opcao].texto}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
