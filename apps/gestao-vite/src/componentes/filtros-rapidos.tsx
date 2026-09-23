import { useSearchParams } from 'react-router-dom';
import { Icone } from '@pipe/ui';
import { parametrosComFiltros } from '../lib/filtros-monitoramento';

export type Opcao = { id: string; nome: string };

type Parametros = {
  fila?: string;
  atendente?: string;
  contato?: string;
  status?: string;
  aba?: string;
  busca?: string;
};

function PilulaOpcoes({
  rotulo,
  valor,
  aoAbrirPainel,
  painelAberto,
}: {
  rotulo: string;
  valor: string;
  aoAbrirPainel: () => void;
  painelAberto: boolean;
}) {
  return (
    <div className="at-filtro">
      <button
        type="button"
        className={valor ? 'pilula ativa at-filtro-gatilho' : 'pilula at-filtro-gatilho'}
        aria-haspopup="dialog"
        aria-expanded={painelAberto}
        onClick={aoAbrirPainel}
      >
        <span className="pilula-rotulo">{rotulo}</span>
      </button>
    </div>
  );
}

function PilulaContato({ valor, aoAbrirPainel, painelAberto }: { valor: string; aoAbrirPainel: () => void; painelAberto: boolean }) {
  return (
    <div className="at-filtro">
      <button
        type="button"
        className={valor ? 'pilula ativa at-filtro-gatilho' : 'pilula at-filtro-gatilho'}
        aria-haspopup="dialog"
        aria-expanded={painelAberto}
        onClick={aoAbrirPainel}
      >
        <span className="pilula-rotulo">Contato</span>
      </button>
    </div>
  );
}

function BotaoFiltros({ aoAbrirPainel, aoLimpar, temFiltros }: {
  aoAbrirPainel: () => void;
  aoLimpar: () => void;
  temFiltros: boolean;
}) {
  return (
    <div className="faixa-fim">
      {temFiltros ? <button type="button" className="btn fantasma" onClick={aoLimpar}>Limpar tudo</button> : null}
      <button type="button" className="btn" title="Abrir filtros" onClick={aoAbrirPainel}>
        <Icone nome="funil" tamanho={20} />
        Filtros
      </button>
    </div>
  );
}

/** A faixa superior recorta a operação e os cartões. */
export function FiltrosDaOperacao({ atual, aoAbrirPainel, painelAberto }: {
  atual: Parametros;
  aoAbrirPainel: () => void;
  painelAberto: boolean;
}) {
  const [query, definirQuery] = useSearchParams();
  return (
    <div className="faixa-filtros">
      <span className="lbl">Filtros rápidos:</span>
      <PilulaOpcoes rotulo="Filas" valor={atual.fila ?? ''} aoAbrirPainel={aoAbrirPainel} painelAberto={painelAberto} />
      <BotaoFiltros aoAbrirPainel={aoAbrirPainel} aoLimpar={() => definirQuery(parametrosComFiltros(query, { fila: '' }))} temFiltros={Boolean(atual.fila)} />
    </div>
  );
}

/** A faixa inferior recorta somente a lista detalhada. */
export function FiltrosDaLista({ atual, aoAbrirPainel, painelAberto }: {
  atual: Parametros;
  aoAbrirPainel: () => void;
  painelAberto: boolean;
}) {
  const [query, definirQuery] = useSearchParams();
  const temFiltros = Boolean(atual.atendente || atual.contato || atual.status);
  return (
    <div className="faixa-filtros">
      <span className="lbl">Filtros rápidos:</span>
      <PilulaOpcoes rotulo="Atendentes" valor={atual.atendente ?? ''} aoAbrirPainel={aoAbrirPainel} painelAberto={painelAberto} />
      <PilulaContato valor={atual.contato ?? ''} aoAbrirPainel={aoAbrirPainel} painelAberto={painelAberto} />
      <PilulaOpcoes rotulo="Status do atendente" valor={atual.status ?? ''} aoAbrirPainel={aoAbrirPainel} painelAberto={painelAberto} />
      <BotaoFiltros
        aoAbrirPainel={aoAbrirPainel}
        aoLimpar={() => definirQuery(parametrosComFiltros(query, { atendente: '', contato: '', status: '' }))}
        temFiltros={temFiltros}
      />
    </div>
  );
}
