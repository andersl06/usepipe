'use client';

import { useEffect, useState } from 'react';

type Tema = 'claro' | 'escuro';

/**
 * Claro e escuro na mão do supervisor.
 *
 * O PADRÃO É O CLARO — quem define isso é o `data-tema="claro"` do layout raiz,
 * não este botão. Aqui só mora a troca, e ela grava a escolha para as próximas
 * visitas.
 *
 * Gêmeo do `apps/desk/src/componentes/alternar-tema.tsx`. Os dois viram um só
 * quando o `@pipe/ui` ganhar o componente; hoje o pacote não tem, e copiar
 * quarenta linhas custa menos que abrir o pacote para isto.
 */
export function AlternarTema() {
  const [tema, setTema] = useState<Tema>('claro');

  useEffect(() => {
    const atual = document.documentElement.dataset['tema'];
    if (atual === 'claro' || atual === 'escuro') setTema(atual);
  }, []);

  function alternar() {
    const novo: Tema = tema === 'escuro' ? 'claro' : 'escuro';
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
