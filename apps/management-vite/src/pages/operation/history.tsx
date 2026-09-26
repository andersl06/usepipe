import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  GROUPINGS,
  groupingValid,
  agruparHistory,
  alternarTodosVisiveis,
  HISTORY_LIMIT,
  reconciliarMarcados,
  type Catalogos,
  type LinhaHistory,
} from '../../lib/history';
import { useSearchParams } from 'react-router-dom';
import { useRead } from '../../lib/query';
import { dataHora, dataOuNada, duration, numero, uuidOuNada } from '../../lib/format';
import { periodCurrent, periodRotulo } from '../../lib/periodos';
import { EmptyState, Icone } from '@pipe/ui';
import { IconeManagement } from '../../components/icones-management';
import { PanelField, FieldPeriod, PanelFilters } from '../../components/panel-filters';
import { Selection } from '../../components/selection';
import { montarCsv } from '../../lib/csv-history';
import { ListaHistory, type CardHistory } from '../../components/lista-history';
import { useContact } from '../flow/contact';
import { attendanceBase } from './shell';

interface HistoryResposta {
  fuso: string;
  de: string;
  ate: string;
  catalogos: Catalogos;
  linhas: LinhaHistory[];
  truncado: boolean;
}

interface Search {
  de?: string;
  ate?: string;
  queue?: string;
  agent?: string;
  etiqueta?: string;
  agrupar?: string;
  /*
   * The two fields below don't exist in the server query: the history API doesn't filter by them (`FiltroHistorico` only has queue/agent/tag). They filter the already-loaded rows, in the browser — see `casa()`.
   */
  ticket?: string;
  contact?: string;
}

/**
 * Finalizada (Completed) is the normal outcome and stays neutral: every list row used to be green, and repeated green stops meaning anything. Perdida (Lost) and abandonada (Abandoned) stay colored, since those are the two the supervisor needs to hunt down.
 */
const ROTULO_STATUS: Record<string, { texto: string; classe: string }> = {
  perdida: { texto: 'Perdida', classe: 'etiqueta erro' },
  abandonada: { texto: 'Abandonada', classe: 'etiqueta alerta' },
  finalizada: { texto: 'Finalizada', classe: 'etiqueta' },
};

function baixarCsv(cards: readonly CardHistory[]) {
  const url = URL.createObjectURL(
    new Blob([montarCsv(cards)], { type: 'text/csv;charset=utf-8' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `historico-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Fields the panel form doesn't display but must still be loaded, or they disappear once the filter is applied. */
function CamposEscondidos({ atual, exceto }: { atual: Search; exceto: readonly string[] }) {
  const pares: [string, string | undefined][] = [
    ['de', atual.de],
    ['ate', atual.ate],
    ['fila', atual.queue],
    ['atendente', atual.agent],
    ['etiqueta', atual.etiqueta],
    ['agrupar', atual.agrupar],
    ['ticket', atual.ticket],
    ['contato', atual.contact],
  ];
  return (
    <>
      {pares
        .filter(([key, value]) => value && !exceto.includes(key))
        .map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
    </>
  );
}

/**
 * History — the same layout as their screen, measured in `referencias-blip/fichas/FICHA-history.md`: header with the CSV export action available, "Filtros rápidos:" strip with the three shortcuts and the period on the right, filter side panel closed by default, and the results area — empty with their text and illustration, or our CARD LIST when there is a conversation.
 *
 * The card list stays ours: six of the eight screens in Blip's Atendimento module use cards, and none uses a table — the material never got around to capturing this screen with results, so the "IGUAL" (same) ruler has nothing to compare here, and the decision recorded in `blip-telas-atendimento.md` §3/§5.2 still stands.
 */
export function PageHistory() {
  const { contact } = useContact();
  const base = attendanceBase(contact.tipo, contact.id);
  const [search] = useSearchParams();
  const crus = Object.fromEntries(search.entries()) as Search;
  /* Conferido na entrada: id torto e data torta viram "sem filtro", em vez de
     virarem erro de servidor no `::uuid` e no `::date` do Postgres. */
  const params: Search = {
    ...crus,
    queue: uuidOuNada(crus.queue),
    agent: uuidOuNada(crus.agent),
    etiqueta: uuidOuNada(crus.etiqueta),
    de: dataOuNada(crus.de),
    ate: dataOuNada(crus.ate),
  };
  const q = new URLSearchParams();
  for (const key of ['queue', 'agent', 'etiqueta', 'de', 'ate'] as const) {
    if (params[key]) q.set(key, params[key] as string);
  }
  const read = useRead<HistoryResposta>(`/v1/management/history?${q}`);
  const [panelAberto, setPanelAberto] = useState(false);
  const [marcados, setMarcados] = useState<ReadonlySet<string>>(new Set());

  const aoAlternar = useCallback(
    (id: string) =>
      setMarcados((atual) => {
        const proximo = new Set(atual);
        if (!proximo.delete(id)) proximo.add(id);
        return proximo;
      }),
    [],
  );

  /*
   * Every hook needs to run on every render, including the first, before the query returns — that's why `useMemo` comes BEFORE the `if` that decides whether there's data to draw, not after it.
   */
  const data = read.data;
  const by = groupingValid(params.agrupar);

  /*
   * The two client-side filters: the API has neither `?ticket=` nor `?contato=`, but the rows already carry `ticket` and `contatoNome` — filtering here costs no extra round trip to the server, and doesn't invent data the query didn't return.
   */
  const idsDosTickets = (params.ticket ?? '')
    .split(/[\s,]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const contactFetched = (params.contact ?? '').trim().toLowerCase();

  /*
   * Everything crosses over to the card already formatted: no Date and no null passes through, and the tenant's timezone formatting gets decided in one place.
   */
  const inCard = (fuso: string) =>
    (l: LinhaHistory): CardHistory => {
      const status = l.status ? ROTULO_STATUS[l.status] : undefined;
      return {
        id: l.id,
        ticket: l.ticket,
        encerrada: dataHora(l.encerradaEm, fuso),
        contact: l.contactName,
        queue: l.queueName ?? '—',
        agent: l.agentName ?? '—',
        espera: duration(l.esperaSeg),
        firstResposta: duration(l.firstRespostaSeg),
        attendance: duration(l.attendanceSeg),
        statusTexto: status?.texto ?? 'Aberta',
        statusClasse: status?.classe ?? 'etiqueta',
        critico: l.status === 'perdida',
        etiquetas: l.etiquetas,
      };
    };

  const linhas = useMemo(() => {
    if (!data) return [];
    return data.linhas.filter((l) => {
      if (
        idsDosTickets.length > 0 &&
        !idsDosTickets.some((id) => l.ticket.toLowerCase().includes(id))
      ) {
        return false;
      }
      if (contactFetched && !l.contactName.toLowerCase().includes(contactFetched)) return false;
      return true;
    });
    // Real dependencies: the two URL strings, not the arrays derived
    // delas (novos a cada render).
  }, [data, params.ticket, params.contact]);

  const groups = useMemo(() => {
    if (!data) return [];
    return agruparHistory(linhas, by).map((g) => ({
      titulo: g.titulo,
      cards: g.linhas.map(inCard(data.fuso)),
    }));
  }, [data, linhas, by]);

  /*
   * The single list, not repeated per group: it's what drives "select all", the CSV and the header button.
   */
  const todos = useMemo(() => {
    const vistos = new Map<string, CardHistory>();
    for (const g of groups) for (const c of g.cards) vistos.set(c.id, c);
    return [...vistos.values()];
  }, [groups]);
  const idsVisiveis = useMemo(() => todos.map((c) => c.id), [todos]);
  const marcadosVisiveis = reconciliarMarcados(marcados, idsVisiveis);
  const selecionados = todos.filter((c) => marcadosVisiveis.has(c.id));

  useEffect(() => {
    setMarcados((atual) => reconciliarMarcados(atual, idsVisiveis));
  }, [idsVisiveis]);

  if (!data && read.isError) {
    return (
      <div className="hist-pagina">
        <div className="board-head"><h2>Histórico</h2></div>
        <div className="card hist-erro" role="alert">
          <h3>Não foi possível carregar o histórico</h3>
          <p>Verifique a conexão e tente novamente.</p>
          <button type="button" className="btn" onClick={() => void read.refetch()}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="hist-pagina" role="status" aria-label="Carregando histórico">
        <div className="board-head"><h2>Histórico</h2></div>
        <div className="card hist-carregando">Carregando histórico…</div>
      </div>
    );
  }
  /* Default (in the `api`): the last thirty days, including today. */
  const { fuso, de, ate, catalogos, truncado } = data;

  /*
   * Period always exists; queue, agent, tag, ticket and contact are the optional filter. The distinction decides the server's empty-state phrase (truncation) — the screen's own text is fixed, like theirs.
   */
  const temFilter = Boolean(
    params.queue || params.agent || params.etiqueta || params.ticket || params.contact,
  );
  const limparFilters = `${base}/history?de=${de}&to=${ate}`;

  return (
    <>
      <div className="board-head">
        <h2>Histórico</h2>
        <div className="filters">
          {/* The available action downloads the CSV of the selected conversations. */}
          <button
            type="button"
            className="btn primario"
            disabled={selecionados.length === 0}
            onClick={() => baixarCsv(selecionados)}
          >
            <IconeManagement nome="baixar" tamanho={24} />
            Exportar CSV
          </button>
        </div>
      </div>

      {/*
 * "Filtros rápidos:", their three shortcuts and the period on the right — `FICHA-history.md` §2.2. Each shortcut opens the same panel; none is its own query.
 */}
      <div className="quickfilters">
        <span className="lbl">Filtros rápidos:</span>
        <button
          type="button"
          className={params.ticket ? 'pilula ativa' : 'pilula'}
          onClick={() => setPanelAberto(true)}
        >
          <span className="pilula-rotulo">IDs dos tickets</span>
        </button>
        <button
          type="button"
          className={params.agent ? 'pilula ativa' : 'pilula'}
          onClick={() => setPanelAberto(true)}
        >
          <span className="pilula-rotulo">Atendentes</span>
          {params.agent ? (
            <span>{catalogos.agents.find((a) => a.id === params.agent)?.nome}</span>
          ) : null}
        </button>
        <button
          type="button"
          className={params.etiqueta ? 'pilula ativa' : 'pilula'}
          onClick={() => setPanelAberto(true)}
        >
          <span className="pilula-rotulo">Tags</span>
          {params.etiqueta ? (
            <span>{catalogos.etiquetas.find((e) => e.id === params.etiqueta)?.nome}</span>
          ) : null}
        </button>

        <div className="faixa-fim">
          {/*
 * "Últimos 30 dias" is `bds-button variant="text"`: no border, just the label (`dom/history.html`). The funnel is `bds-icon size="small"`, 20px.
 */}
          <button type="button" className="btn fantasma" onClick={() => setPanelAberto(true)}>
            {periodRotulo(periodCurrent(de, ate, fuso))}
          </button>
          <button type="button" className="btn" onClick={() => setPanelAberto(true)}>
            <Icone nome="funil" tamanho={20} />
            Filtros
          </button>
        </div>
      </div>

      <PanelFilters
        aberto={panelAberto}
        aoFechar={() => setPanelAberto(false)}
        acao={`${base}/history`}
        limpar={temFilter ? limparFilters : null}
      >
        <CamposEscondidos atual={params} exceto={['de', 'ate']} />
        <FieldPeriod de={de} ate={ate} fuso={fuso} />

        <PanelField
          rotulo="IDs dos tickets"
          apoio="Informe os IDs de um ou mais tickets para buscar"
        >
          <input
            type="text"
            name="ticket"
            defaultValue={params.ticket ?? ''}
            placeholder="Informe os IDs dos tickets"
            aria-label="IDs dos tickets"
          />
        </PanelField>

        <PanelField rotulo="Atendentes" apoio="Selecione um ou mais atendentes">
          <Selection name="atendente" defaultValue={params.agent ?? ''} aria-label="Atendentes">
            <option value="">Selecione os atendentes</option>
            {catalogos.agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </Selection>
        </PanelField>

        <PanelField rotulo="Tags" apoio="Selecione uma ou mais tags">
          <Selection name="etiqueta" defaultValue={params.etiqueta ?? ''} aria-label="Tags">
            <option value="">Selecione as tags</option>
            {catalogos.etiquetas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </Selection>
        </PanelField>

        <PanelField rotulo="Filas" apoio="Selecione uma ou mais filas">
          <Selection name="fila" defaultValue={params.queue ?? ''} aria-label="Filas">
            <option value="">Selecione as filas</option>
            {catalogos.queues.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </Selection>
        </PanelField>

        <PanelField rotulo="Contato" apoio="Selecione um contato">
          <input
            type="text"
            name="contato"
            defaultValue={params.contact ?? ''}
            placeholder="Digite parte do nome do contato"
            aria-label="Contato"
          />
        </PanelField>
      </PanelFilters>

      {/*
 * "Área de resultados", `FICHA-history.md` §2: their empty state OR our list, and the "Termo de responsabilidade" link in the corner — it lives in this area in BOTH states, because that's where the capture recorded it (their capture is empty, and the link is there anyway).
 */}
      <div className="hist-resultados">
        {linhas.length === 0 ? (
          /* The text is theirs, literal — `FICHA-history.md` §6. */
          <EmptyState titulo="Nenhum resultado encontrado" illustration="busca">
            <p>
              Não encontramos nenhum resultado a partir da pesquisa realizada.
              <br />
              Que tal refazer a sua busca?
            </p>
            {/*
 * `bds-button variant="outline" color="primary" class="mt4"`: the border in brand color (`button 135x40 b=1px rgb(74,93,35)` in the live copy), 20px below the text.
 */}
            <a href={limparFilters} className="btn contorno-marca">
              Redefinir filtros
            </a>
          </EmptyState>
        ) : (
          <>
            {/*
 * "Agrupar por" is ours, not theirs — the answer to the six report items that never became a screen (`historico.ts`). It sits OUTSIDE the panel on purpose: the panel only has the fields the ficha lists.
 */}
            <form method="get" action={`${base}/history`} className="hist-agrupar">
              <CamposEscondidos atual={params} exceto={['agrupar']} />
              <label className="lbl" htmlFor="agrupar">
                Agrupar por
              </label>
              <Selection
                id="agrupar"
                name="agrupar"
                defaultValue={by}
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
              >
                {GROUPINGS.map((a) => (
                  <option key={a.chave} value={a.chave}>
                    {a.chave === 'nenhum' ? a.rotulo : `Agrupar por ${a.rotulo.toLowerCase()}`}
                  </option>
                ))}
              </Selection>
              {truncado ? (
                <span className="sub">
                  {numero(linhas.length)} conversas · as {HISTORY_LIMIT} mais recentes
                </span>
              ) : (
                <span className="sub">{numero(linhas.length)} conversas</span>
              )}
            </form>

            <ListaHistory
              groups={groups}
              todos={todos}
              marcados={marcadosVisiveis}
              aoAlternar={aoAlternar}
              aoAlternarTodos={() =>
                setMarcados((atual) => alternarTodosVisiveis(atual, idsVisiveis))
              }
            />
          </>
        )}

        <a href="/termo-de-responsabilidade" className="termo-de-responsabilidade">
          <IconeManagement nome="documento" tamanho={14} />
          Termo de responsabilidade
        </a>
      </div>
    </>
  );
}
