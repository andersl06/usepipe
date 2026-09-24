import { useState, type ReactNode } from 'react';
import { IconePortal } from '../../componentes/icones-portal';

export function CabecalhoInfo({
  titulo,
  children,
  contador,
  aberto = false,
}: {
  titulo: string;
  children: ReactNode;
  contador?: string;
  aberto?: boolean;
}) {
  const [visivel, setVisivel] = useState(aberto);
  return (
    <header className="bl-info">
      <div className="bl-info-linha">
        <h4>{titulo}</h4>
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
