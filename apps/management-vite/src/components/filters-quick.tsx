import { useSearchParams } from 'react-router-dom';
import { Icone } from '@pipe/ui';
import { parametersWithFilters } from '../lib/filters-monitoring';

export type Option = { id: string; nome: string };

type Parametros = {
  queue?: string;
  agent?: string;
  contact?: string;
  status?: string;
  aba?: string;
  search?: string;
};

function PillOptions({
  rotulo,
  value,
  toOpenPanel,
  panelOpen,
}: {
  rotulo: string;
  value: string;
  toOpenPanel: () => void;
  panelOpen: boolean;
}) {
  return (
    <div className="at-filter">
      <button
        type="button"
        className={value ? 'pilula active at-filter-trigger' : 'pilula at-filter-trigger'}
        aria-haspopup="dialog"
        aria-expanded={panelOpen}
        onClick={toOpenPanel}
      >
        <span className="pilula-rotulo">{rotulo}</span>
      </button>
    </div>
  );
}

function PillContact({ value, toOpenPanel, panelOpen }: { value: string; toOpenPanel: () => void; panelOpen: boolean }) {
  return (
    <div className="at-filter">
      <button
        type="button"
        className={value ? 'pilula active at-filter-trigger' : 'pilula at-filter-trigger'}
        aria-haspopup="dialog"
        aria-expanded={panelOpen}
        onClick={toOpenPanel}
      >
        <span className="pilula-rotulo">Contato</span>
      </button>
    </div>
  );
}

function ButtonFilters({ toOpenPanel, aoLimpar, hasFilters }: {
  toOpenPanel: () => void;
  aoLimpar: () => void;
  hasFilters: boolean;
}) {
  return (
    <div className="faixa-fim">
      {hasFilters ? <button type="button" className="btn fantasma" onClick={aoLimpar}>Limpar tudo</button> : null}
      <button type="button" className="btn" title="Abrir filtros" onClick={toOpenPanel}>
        <Icone nome="funil" tamanho={20} />
        Filtros
      </button>
    </div>
  );
}

/**
 * A faixa superior recorta a operação e os cartões. `atual.queue` e o
 * limpar da fila vêm de fora, via props (D-30): o filtro de fila mora em
 * React state da tela, não na query string.
 */
export function SOperationFilter({ atual, toOpenPanel, panelOpen, aoLimparQueue }: {
  atual: Parametros;
  toOpenPanel: () => void;
  panelOpen: boolean;
  aoLimparQueue: () => void;
}) {
  return (
    <div className="strip-filters">
      <span className="lbl">Filtros rápidos:</span>
      <PillOptions rotulo="Filas" value={atual.queue ?? ''} toOpenPanel={toOpenPanel} panelOpen={panelOpen} />
      <ButtonFilters toOpenPanel={toOpenPanel} aoLimpar={aoLimparQueue} hasFilters={Boolean(atual.queue)} />
    </div>
  );
}

/**
 * A faixa inferior recorta somente a lista detalhada. `atendente` (D-30)
 * limpa via `aoLimparAgent` (state); `contato`/`status` continuam na query
 * string desta tela (NEEDS VALIDATION, fora do D-30).
 */
export function SListFilter({ atual, toOpenPanel, panelOpen, aoLimparAgent }: {
  atual: Parametros;
  toOpenPanel: () => void;
  panelOpen: boolean;
  aoLimparAgent: () => void;
}) {
  const [query, definirQuery] = useSearchParams();
  const hasFilters = Boolean(atual.agent || atual.contact || atual.status);
  return (
    <div className="strip-filters">
      <span className="lbl">Filtros rápidos:</span>
      <PillOptions rotulo="Atendentes" value={atual.agent ?? ''} toOpenPanel={toOpenPanel} panelOpen={panelOpen} />
      <PillContact value={atual.contact ?? ''} toOpenPanel={toOpenPanel} panelOpen={panelOpen} />
      <PillOptions rotulo="Status do atendente" value={atual.status ?? ''} toOpenPanel={toOpenPanel} panelOpen={panelOpen} />
      <ButtonFilters
        toOpenPanel={toOpenPanel}
        aoLimpar={() => {
          aoLimparAgent();
          definirQuery(parametersWithFilters(query, { contato: '', status: '' }));
        }}
        hasFilters={hasFilters}
      />
    </div>
  );
}
