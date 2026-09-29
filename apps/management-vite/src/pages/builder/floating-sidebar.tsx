import type { ReactNode } from 'react';
import { IconePortal } from '@pipe/ui/icones-portal';

/**
 * The floating shell shared by Configuração, Biblioteca de variáveis and Filas — the source's
 * `sidebar-content-component`/`library-sidebar`: 460px wide, 16px from the edges, `calc(100% - 32px)`
 * tall, radius 16, dark surface, same header/divider/tabs/body geometry as the block panel
 * (`.bl-panel--block`, `panel-block.css`). Configuração and Filas dock on the right with a readonly
 * title; Biblioteca docks on the left with no title, just the close button.
 *
 * `abas` renders the tab strip (`.bl-abas`) between the header divider and the body, when the panel
 * has tabs; `children` is each panel's own body markup, untouched.
 */
export function FloatingSidebar({
  lado,
  titulo,
  ariaLabel,
  onFechar,
  abas,
  children,
}: {
  lado: 'direita' | 'esquerda';
  titulo?: string;
  ariaLabel: string;
  onFechar: () => void;
  abas?: ReactNode;
  children: ReactNode;
}) {
  return (
    <aside className={`bl-panel bl-panel--flutuante bl-panel--${lado}`} aria-label={ariaLabel}>
      <div className="bl-panel-header">
        {titulo ? (
          <input
            className="bl-panel-title"
            type="text"
            readOnly
            maxLength={50}
            value={titulo}
            aria-label={ariaLabel}
          />
        ) : null}
        <button
          type="button"
          className="iconbtn"
          aria-label="Fechar"
          title="Fechar"
          onClick={onFechar}
        >
          <IconePortal nome="fechar" tamanho={24} />
        </button>
      </div>
      {titulo ? <hr className="bl-panel-wire" /> : null}
      {abas}
      {children}
    </aside>
  );
}
