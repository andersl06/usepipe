import type { CSSProperties } from 'react';

/**
 * Loading and error states of a `.tblwrap` table. The skeleton keeps the table's geometry (48px header, 49px rows, `ref/verificacao/tblwrap.md`); the error text is fixed — the server's message is never echoed.
 */
export function TabelaCarregando({ colunas = 4, linhas = 4 }: { colunas?: number; linhas?: number }) {
  return (
    <div className="tblwrap tblwrap-esqueleto" aria-busy="true">
      {Array.from({ length: linhas + 1 }, (_, i) => (
        <div className="linha" key={i} style={{ '--colunas': colunas } as CSSProperties}>
          {Array.from({ length: colunas }, (_, c) => (
            <span className="mon-esqueletico celula" key={c} />
          ))}
        </div>
      ))}
      <span className="sr-only">Carregando dados.</span>
    </div>
  );
}

export function TabelaErro({ aoTentar }: { aoTentar: () => void }) {
  return (
    <div className="tblwrap tblwrap-erro" role="alert">
      <p>Não foi possível carregar os dados. Verifique a conexão e tente novamente.</p>
      <button type="button" className="btn" onClick={aoTentar}>
        Tentar novamente
      </button>
    </div>
  );
}
