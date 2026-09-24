import { useState, type ReactNode } from 'react';
import { Icone } from '@pipe/ui';
import { IconePortal } from './icones-portal';
import { PERIODOS, calcularPeriodo, periodoAtual } from '../lib/periodos';
import { Selecao } from './selecao';

/**
 * Painel lateral "Filtros" — o `data-testid="saved-filters-sidebar"` deles,
 * medido em `referencias-blip/fichas/FICHA-monitoring.md` e `FICHA-history.md`:
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
  aoAplicar,
  children,
}: {
  aberto: boolean;
  aoFechar: () => void;
  acao: string;
  /** `null` esconde o link "Limpar tudo" — não há o que limpar. */
  limpar: string | null;
  aoAplicar?: (dados: FormData) => void;
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
 * O campo "Período" do painel — o `bds-select data-testid="period-filter-
 * select"` deles, igual no Histórico e nos dois Relatórios: os atalhos de
 * `PERIODOS` mais "Personalizado", e o par de datas que o atalho preenche.
 */
export function CampoPeriodo({ de, ate, fuso }: { de: string; ate: string; fuso: string }) {
  return (
    <CampoDoPainel rotulo="Período" apoio="Selecione um intervalo de datas">
      <Selecao
        name="periodo"
        defaultValue={periodoAtual(de, ate, fuso)}
        aria-label="Atalho de período"
        onChange={(e) => {
          const calc = calcularPeriodo(e.currentTarget.value, fuso);
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
      </Selecao>
      <div className="painel-datas">
        <input type="date" name="de" defaultValue={de} aria-label="De" />
        <input type="date" name="ate" defaultValue={ate} aria-label="Até" />
      </div>
    </CampoDoPainel>
  );
}
