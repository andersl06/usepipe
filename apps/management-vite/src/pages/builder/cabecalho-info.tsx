import { Fragment, useState, type ReactNode } from 'react';
import { IconePortal } from '../../components/icones-portal';

export function CabecalhoInfo({
  titulo,
  children,
  contador,
  aberto = false,
  etiqueta,
}: {
  titulo: string;
  children: ReactNode;
  contador?: string;
  aberto?: boolean;
  /** A tag next to the title, such as the "Novo" badge on "Biblioteca de funções". */
  etiqueta?: ReactNode;
}) {
  const [visivel, setVisivel] = useState(aberto);
  return (
    <header className="bl-info">
      <div className="bl-info-linha">
        <h4>{titulo}</h4>
        {etiqueta}
        <button
          type="button"
          className="iconbtn"
          aria-label={`Informações: ${titulo}`}
          aria-expanded={visivel}
          onClick={() => setVisivel(!visivel)}
        >
          <IconePortal nome="informacao" tamanho={24} />
        </button>
        {contador ? <span className="bl-info-contador">{contador}</span> : null}
      </div>
      {visivel ? <div className="bl-info-texto">{children}</div> : null}
    </header>
  );
}

/** A description part; `forte: true` renders as `<strong>` (T:836 bold segments, F-1.4 row 14). */
export interface DescricaoParte {
  texto: string;
  forte?: boolean;
}

/** Renders description parts through React, never `dangerouslySetInnerHTML` (gate of 02-22). */
export function renderDescricao(partes: readonly DescricaoParte[]): ReactNode {
  return partes.map((parte, indice) =>
    parte.forte ? (
      <strong key={indice}>{parte.texto}</strong>
    ) : (
      <Fragment key={indice}>{parte.texto}</Fragment>
    ),
  );
}
