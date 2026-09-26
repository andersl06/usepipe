import { useState, type ReactNode } from 'react';
import { Icone } from '@pipe/ui';
import { IconePortal } from './icones-portal';
import { PERIODOS, calcularPeriod, periodCurrent } from '../lib/periodos';
import { Selection } from './selection';

/**
 * Reference Filter sidebar `data-testid="saved-filters-sidebar"` (`referencias-blip/fichas/FICHA-monitoring.md`, `FICHA-history.md`) starts closed, with title/subtitle, New query and Saved filters tabs, screen fields, saved-filter switch, and two footer buttons. Saved filters are structural only: no storage exists, so show an honest empty state; disable the footer switch with a reason. Apply uses a GET form, closes the panel, and navigates while state remains in the URL.
 */
export function PanelFilters({
  aberto,
  aoFechar,
  acao,
  limpar,
  aoAplicar,
  children,
}: {
  aberto: boolean;
  aoFechar: () => void;
  acao: string;
  /**
   * `null` esconde o link "Limpar tudo" — não há o que limpar. Uma função
   * limpa filtro que mora em React state (D-30): não há URL de destino, só
   * a ação de zerar o valor antes de fechar o painel.
   */
  limpar: string | (() => void) | null;
  aoAplicar?: (data: FormData) => void;
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
            onSubmit={evento => {
              if (aoAplicar) {
                evento.preventDefault();
                aoAplicar(new FormData(evento.currentTarget));
              } else aoFechar();
            }}
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
                  typeof limpar === 'function' ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        limpar();
                        aoFechar();
                      }}
                    >
                      Limpar tudo
                    </button>
                  ) : (
                    <a href={limpar} className="btn" onClick={aoFechar}>
                      Limpar tudo
                    </a>
                  )
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


export function PanelField({
  rotulo,
  apoio,
  icone,
  children,
}: {
  rotulo: string;
  apoio?: string;
  icone?: 'fila';
  children: ReactNode;
}) {
  return (
    <div className="painel-campo">
      <span className="painel-rotulo">{icone ? <IconePortal nome={icone} tamanho={16} /> : null}{rotulo}</span>
      {apoio ? <span className="painel-apoio">{apoio}</span> : null}
      {children}
    </div>
  );
}

/**
 * The Period filter matches reference `bds-select data-testid="period-filter-select"` in History and both Reports: `PERIODOS` shortcuts plus Custom, whose choice fills the date pair.
 */
export function FieldPeriod({ de, ate, fuso }: { de: string; ate: string; fuso: string }) {
  return (
    <PanelField rotulo="Período" apoio="Selecione um intervalo de datas">
      <Selection
        name="periodo"
        defaultValue={periodCurrent(de, ate, fuso)}
        aria-label="Atalho de período"
        onChange={(e) => {
          const calc = calcularPeriod(e.currentTarget.value, fuso);
          if (!calc) return;
          const form = e.currentTarget.form;
          const campoDe = form?.elements.namedItem('de');
          const campoAte = form?.elements.namedItem('ate');
          if (campoDe instanceof HTMLInputElement) campoDe.value = calc.de;
          if (campoAte instanceof HTMLInputElement) campoAte.value = calc.ate;
        }}
      >
        {PERIODOS.map((p) => (
          <option key={p.chave} value={p.chave}>
            {p.rotulo}
          </option>
        ))}
        <option value="personalizado">Personalizado</option>
      </Selection>
      <div className="painel-datas">
        <input type="date" name="de" defaultValue={de} aria-label="De" />
        <input type="date" name="ate" defaultValue={ate} aria-label="Até" />
      </div>
    </PanelField>
  );
}
