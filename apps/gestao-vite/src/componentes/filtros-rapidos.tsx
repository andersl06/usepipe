import { useEffect, useId, useRef, useState } from 'react';
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

function useFecharPopover(aberto: boolean, aoFechar: () => void) {
  const raiz = useRef<HTMLDivElement>(null);
  const gatilho = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!aberto) return;
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key !== 'Escape') return;
      evento.stopPropagation();
      aoFechar();
      gatilho.current?.focus();
    }
    function aoClicar(evento: PointerEvent) {
      if (!raiz.current?.contains(evento.target as Node)) aoFechar();
    }
    document.addEventListener('keydown', aoTeclar);
    document.addEventListener('pointerdown', aoClicar);
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.removeEventListener('pointerdown', aoClicar);
    };
  }, [aberto, aoFechar]);
  return { raiz, gatilho };
}

function PilulaOpcoes({
  rotulo,
  valor,
  opcoes,
  aoAplicar,
}: {
  rotulo: string;
  valor: string;
  opcoes: readonly Opcao[];
  aoAplicar: (valor: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const id = useId();
  const { raiz, gatilho } = useFecharPopover(aberto, () => setAberto(false));
  const selecionada = opcoes.find((opcao) => opcao.id === valor);
  function aplicar(proximo: string) {
    setAberto(false);
    aoAplicar(proximo);
    gatilho.current?.focus();
  }
  return (
    <div className="at-filtro" ref={raiz}>
      <button
        ref={gatilho}
        type="button"
        className={valor ? 'pilula ativa at-filtro-gatilho' : 'pilula at-filtro-gatilho'}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-controls={aberto ? id : undefined}
        onClick={() => setAberto((anterior) => !anterior)}
      >
        <span className="pilula-rotulo">{rotulo}</span>
        {selecionada ? <span className="pilula-valor">{selecionada.nome}</span> : null}
      </button>
      {aberto ? (
        <div id={id} className="at-filtro-popover" role="dialog" aria-label={`Filtrar por ${rotulo}`}>
          <div className="at-filtro-opcoes">
            <button type="button" aria-pressed={!valor} onClick={() => aplicar('')}>
              Todos
            </button>
            {opcoes.map((opcao) => (
              <button
                key={opcao.id}
                type="button"
                aria-pressed={opcao.id === valor}
                onClick={() => aplicar(opcao.id)}
              >
                {opcao.nome}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PilulaContato({ valor, aoAplicar }: { valor: string; aoAplicar: (valor: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [rascunho, setRascunho] = useState(valor);
  const id = useId();
  const campo = useRef<HTMLInputElement>(null);
  const { raiz, gatilho } = useFecharPopover(aberto, () => setAberto(false));
  useEffect(() => {
    if (aberto) campo.current?.focus();
  }, [aberto]);
  function aplicar(proximo: string) {
    setAberto(false);
    aoAplicar(proximo);
    gatilho.current?.focus();
  }
  return (
    <div className="at-filtro" ref={raiz}>
      <button
        ref={gatilho}
        type="button"
        className={valor ? 'pilula ativa at-filtro-gatilho' : 'pilula at-filtro-gatilho'}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-controls={aberto ? id : undefined}
        onClick={() => {
          setRascunho(valor);
          setAberto((anterior) => !anterior);
        }}
      >
        <span className="pilula-rotulo">Contato</span>
        {valor ? <span className="pilula-valor">{valor}</span> : null}
      </button>
      {aberto ? (
        <div id={id} className="at-filtro-popover" role="dialog" aria-label="Filtrar por Contato">
          <form onSubmit={(evento) => { evento.preventDefault(); aplicar(rascunho); }}>
            <label htmlFor={`${id}-campo`}>Nome do contato</label>
            <input
              ref={campo}
              id={`${id}-campo`}
              type="search"
              value={rascunho}
              onChange={(evento) => setRascunho(evento.target.value)}
            />
            <div className="at-filtro-acoes">
              <button type="button" onClick={() => aplicar('')}>Limpar</button>
              <button type="submit" className="btn">Aplicar</button>
            </div>
          </form>
        </div>
      ) : null}
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

const ESTADOS_DE_ATENDENTE: readonly Opcao[] = [
  { id: 'online', nome: 'Online' },
  { id: 'pausa', nome: 'Em Pausa' },
  { id: 'invisivel', nome: 'Invisível' },
];

/** A faixa superior recorta a operação e os cartões. */
export function FiltrosDaOperacao({ filas, atual, aoAbrirPainel }: {
  filas: readonly Opcao[];
  atual: Parametros;
  aoAbrirPainel: () => void;
}) {
  const [query, definirQuery] = useSearchParams();
  function aplicar(valor: string) {
    definirQuery(parametrosComFiltros(query, { fila: valor }));
  }
  return (
    <div className="faixa-filtros">
      <span className="lbl">Filtros rápidos:</span>
      <PilulaOpcoes rotulo="Filas" valor={atual.fila ?? ''} opcoes={filas} aoAplicar={aplicar} />
      <BotaoFiltros aoAbrirPainel={aoAbrirPainel} aoLimpar={() => aplicar('')} temFiltros={Boolean(atual.fila)} />
    </div>
  );
}

/** A faixa inferior recorta somente a lista detalhada. */
export function FiltrosDaLista({ atendentes, atual, aoAbrirPainel }: {
  atendentes: readonly Opcao[];
  atual: Parametros;
  aoAbrirPainel: () => void;
}) {
  const [query, definirQuery] = useSearchParams();
  function aplicar(chave: 'atendente' | 'contato' | 'status', valor: string) {
    definirQuery(parametrosComFiltros(query, { [chave]: valor }));
  }
  const temFiltros = Boolean(atual.atendente || atual.contato || atual.status);
  return (
    <div className="faixa-filtros">
      <span className="lbl">Filtros rápidos:</span>
      <PilulaOpcoes rotulo="Atendentes" valor={atual.atendente ?? ''} opcoes={atendentes} aoAplicar={(valor) => aplicar('atendente', valor)} />
      <PilulaContato valor={atual.contato ?? ''} aoAplicar={(valor) => aplicar('contato', valor)} />
      <PilulaOpcoes rotulo="Status do atendente" valor={atual.status ?? ''} opcoes={ESTADOS_DE_ATENDENTE} aoAplicar={(valor) => aplicar('status', valor)} />
      <BotaoFiltros
        aoAbrirPainel={aoAbrirPainel}
        aoLimpar={() => definirQuery(parametrosComFiltros(query, { atendente: '', contato: '', status: '' }))}
        temFiltros={temFiltros}
      />
    </div>
  );
}
