'use client';

import { useEffect, useState } from 'react';

type Tema = 'claro' | 'escuro';

/**
 * Claro e escuro na mão do atendente. O padrão continua sendo a preferência do sistema
 * — só grava escolha quem clicar aqui.
 */
export function AlternarTema() {
  const [tema, setTema] = useState<Tema | null>(null);

  useEffect(() => {
    const guardado = document.documentElement.dataset['tema'];
    if (guardado === 'claro' || guardado === 'escuro') setTema(guardado);
  }, []);

  function alternar() {
    const atual =
      tema ??
      (window.matchMedia('(prefers-color-scheme: dark)').matches
        ? ('escuro' as const)
        : ('claro' as const));
    const novo: Tema = atual === 'escuro' ? 'claro' : 'escuro';
    document.documentElement.dataset['tema'] = novo;
    try {
      localStorage.setItem('pipe-tema', novo);
    } catch {
      // Navegador com armazenamento bloqueado: o tema vale só nesta aba, e tudo bem.
    }
    setTema(novo);
  }

  return (
    <button
      type="button"
      className="iconbtn"
      onClick={alternar}
      title="Alternar tema claro e escuro"
      aria-label="Alternar tema claro e escuro"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
      </svg>
    </button>
  );
}
