import { useState, type ReactNode } from 'react';
import { Icone } from '@pipe/ui';

/**
 * Painel lateral "Filtros" — o `data-testid="saved-filters-sidebar"` deles,
 * medido em `docs/capturas/blip/dom/FICHA-monitoring.md` e `FICHA-history.md`:
 * fechado por padrão, título "Filtros", subtítulo fixo, duas abas ("Nova
 * consulta" / "Filtros salvos"), os campos da tela no meio, e um rodapé com o
 * switch de filtro salvo e os dois botões.
 *
 * "Filtros salvos" é ESTRUTURA sem FUNÇÃO: a aba existe porque existe na tela
 * deles, mas não temos onde guardar um filtro salvo ainda — o vazio da aba diz
 * isso, em vez de fingir uma lista. O switch do rodapé é a mesma honestidade:
 * aparece desabilitado, com o motivo no título.
 *
 * O formulário é GET puro, como toda consulta desta tela: aplicar fecha o
 * painel e navega, e o estado continua vivendo na URL.
 */
export function PainelFiltros({
  aberto,
  aoFechar,
  acao,
  limpar,
  children,
}: {
  aberto: boolean;
  aoFechar: () => void;
  acao: string;
  /** `null` esconde o link "Limpar tudo" — não há o que limpar. */
  limpar: string | null;
  children: ReactNode;
}) {
  const [aba, setAba] = useState<'nova' | 'salvos'>('nova');
  if (!aberto) return null;

  return (
    <>
      <div className="painel-fundo" onClick={aoFechar} />
      <aside className="painel-lateral" role="dialog" aria-modal="true" aria-label="Filtros">
        <div className="painel-cabecalho">
          <div>
            <h3>Filtros</h3>
            <p>Selecione os parâmetros da sua busca ou aplique um filtro salvo</p>
          </div>
          <button
            type="button"
            className="iconbtn"
            onClick={aoFechar}
            title="Fechar"
            aria-label="Fechar"
          >
            <Icone nome="x" tamanho={16} />
          </button>
        </div>

        <div className="painel-abas" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={aba === 'nova'}
            className={aba === 'nova' ? 'ativa' : undefined}
            onClick={() => setAba('nova')}
          >
            Nova consulta
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={aba === 'salvos'}
            className={aba === 'salvos' ? 'ativa' : undefined}
            onClick={() => setAba('salvos')}
          >
            Filtros salvos
          </button>
        </div>

        {aba === 'nova' ? (
          <form
            method="get"
            action={acao}
            className="painel-form"
            onSubmit={aoFechar}
            aria-label="Nova consulta"
          >
            <div className="painel-campos">{children}</div>

            <div className="painel-rodape">
              <label
                className="painel-sw"
                title="Filtro salvo ainda não existe nesta versão da tela."
              >
                <input type="checkbox" disabled />
                Criar Filtro Salvo com estes parâmetros
              </label>
              <div className="painel-botoes">
                {limpar ? (
                  <a href={limpar} className="btn" onClick={aoFechar}>
                    Limpar tudo
                  </a>
                ) : null}
                <button type="submit" className="btn primary">
                  Aplicar
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="painel-vazio-salvos">Nenhum filtro salvo ainda.</div>
        )}
      </aside>
    </>
  );
}

/** Um campo do painel: rótulo em negrito, texto de apoio, e o controle. */
export function CampoDoPainel({
  rotulo,
  apoio,
  children,
}: {
  rotulo: string;
  apoio: string;
  children: ReactNode;
}) {
  return (
    <div className="painel-campo">
      <span className="painel-rotulo">{rotulo}</span>
      <span className="painel-apoio">{apoio}</span>
      {children}
    </div>
  );
}
