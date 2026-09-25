import { useSearchParams } from 'react-router-dom';
import { Icone } from '@pipe/ui';
import { parametrosWithFilters } from '../lib/filtros-monitoramento';

export type Option = { id: string; nome: string };

type Parametros = {
  queue?: string;
  agent?: string;
  contact?: string;
  status?: string;
  aba?: string;
  search?: string;
};

function PilulaOptions({
  rotulo,
  value,
  toAbrirPanel,
  panelAberto,
}: {
  rotulo: string;
  value: string;
  toAbrirPanel: () => void;
  panelAberto: boolean;
}) {
  return (
    <div className="at-filtro">
      <button
        type="button"
        className={value ? 'pilula ativa at-filtro-gatilho' : 'pilula at-filtro-gatilho'}
        aria-haspopup="dialog"
        aria-expanded={panelAberto}
        onClick={toAbrirPanel}
      >
        <span className="pilula-rotulo">{rotulo}</span>
      </button>
    </div>
  );
}

function PilulaContact({ value, toAbrirPanel, panelAberto }: { value: string; toAbrirPanel: () => void; panelAberto: boolean }) {
  return (
    <div className="at-filtro">
      <button
        type="button"
        className={value ? 'pilula ativa at-filtro-gatilho' : 'pilula at-filtro-gatilho'}
        aria-haspopup="dialog"
        aria-expanded={panelAberto}
        onClick={toAbrirPanel}
      >
        <span className="pilula-rotulo">Contato</span>
      </button>
    </div>
  );
}

function ButtonFilters({ toAbrirPanel, aoLimpar, temFilters }: {
  toAbrirPanel: () => void;
  aoLimpar: () => void;
  temFilters: boolean;
}) {
  return (
    <div className="faixa-fim">
      {temFilters ? <button type="button" className="btn fantasma" onClick={aoLimpar}>Limpar tudo</button> : null}
      <button type="button" className="btn" title="Abrir filtros" onClick={toAbrirPanel}>
        <Icone nome="funil" tamanho={20} />
        Filtros
      </button>
    </div>
  );
}

/** A faixa superior recorta a operação e os cartões. */
export function SOperationFilter({ atual, toAbrirPanel, panelAberto }: {
  atual: Parametros;
  toAbrirPanel: () => void;
  panelAberto: boolean;
}) {
  const [query, definirQuery] = useSearchParams();
  return (
    <div className="faixa-filtros">
      <span className="lbl">Filtros rápidos:</span>
      <PilulaOptions rotulo="Filas" value={atual.queue ?? ''} toAbrirPanel={toAbrirPanel} panelAberto={panelAberto} />
      <ButtonFilters toAbrirPanel={toAbrirPanel} aoLimpar={() => definirQuery(parametrosWithFilters(query, { fila: '' }))} temFilters={Boolean(atual.queue)} />
    </div>
  );
}

/** A faixa inferior recorta somente a lista detalhada. */
export function SListaFilter({ atual, toAbrirPanel, panelAberto }: {
  atual: Parametros;
  toAbrirPanel: () => void;
  panelAberto: boolean;
}) {
  const [query, definirQuery] = useSearchParams();
  const temFilters = Boolean(atual.agent || atual.contact || atual.status);
  return (
    <div className="faixa-filtros">
      <span className="lbl">Filtros rápidos:</span>
      <PilulaOptions rotulo="Atendentes" value={atual.agent ?? ''} toAbrirPanel={toAbrirPanel} panelAberto={panelAberto} />
      <PilulaContact value={atual.contact ?? ''} toAbrirPanel={toAbrirPanel} panelAberto={panelAberto} />
      <PilulaOptions rotulo="Status do atendente" value={atual.status ?? ''} toAbrirPanel={toAbrirPanel} panelAberto={panelAberto} />
      <ButtonFilters
        toAbrirPanel={toAbrirPanel}
        aoLimpar={() => definirQuery(parametrosWithFilters(query, { atendente: '', contato: '', status: '' }))}
        temFilters={temFilters}
      />
    </div>
  );
}
