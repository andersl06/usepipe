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
  /* Os dois campos abaixo não existem na consulta ao servidor: a API de
     histórico não filtra por eles (`FiltroHistorico` só tem fila/atendente/
     etiqueta). Filtram as linhas já carregadas, no navegador — ver `casa()`. */
  ticket?: string;
  contact?: string;
}

/**
 * Finalizada é o desfecho normal e fica neutra: era verde em cada linha da
 * lista, e o verde repetido deixa de significar. Perdida e abandonada seguem
 * coloridas, porque são as duas que o supervisor precisa caçar.
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

/** Campos que o formulário do painel não mostra mas precisa carregar, senão some ao aplicar. */
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
 * Histórico — a mesma disposição da tela deles, medida em
 * `referencias-blip/fichas/FICHA-history.md`: cabeçalho com a ação de exportar
 * CSV disponível, faixa "Filtros rápidos:" com os três atalhos e o período à
 * direita, painel lateral de filtros fechado por padrão, e a área de
 * resultados — vazia com o texto e a ilustração deles, ou a nossa LISTA DE
 * CARTÕES quando há conversa.
 *
 * A lista de cartões continua sendo nossa: seis das oito telas do módulo
 * Atendimento da Blip usam cartão, e nenhuma usa tabela — o material não
 * chegou a capturar esta tela com resultado, então a régua "IGUAL" não tem o
 * que comparar aqui, e a decisão registrada em `blip-telas-atendimento.md`
 * §3/§5.2 continua de pé.
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
  for (const key of ['fila', 'atendente', 'etiqueta', 'de', 'ate'] as const) {
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

  /* Todo hook precisa rodar em toda renderização, inclusive na primeira, antes
     da consulta voltar — por isso o `useMemo` entra ANTES do `if` que decide
     se há dado para desenhar, e não depois dele. */
  const data = read.data;
  const by = groupingValid(params.agrupar);

  /* Os dois filtros de cliente: a API não tem `?ticket=` nem `?contato=`, mas
     as linhas já trazem `ticket` e `contatoNome` — filtrar aqui não custa uma
     ida a mais ao servidor, e não inventa dado que a consulta não devolveu. */
  const idsDosTickets = (params.ticket ?? '')
    .split(/[\s,]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const contactFetched = (params.contact ?? '').trim().toLowerCase();

  /* Tudo atravessa para o cartão já formatado: nenhuma Date e nenhum nulo
     passam para lá, e o formato do fuso do tenant fica decidido de um lado só. */
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
    // Dependências reais: as duas strings da URL, não os arrays derivados
    // delas (novos a cada render).
  }, [data, params.ticket, params.contact]);

  const groups = useMemo(() => {
    if (!data) return [];
    return agruparHistory(linhas, by).map((g) => ({
      titulo: g.titulo,
      cartoes: g.linhas.map(inCard(data.fuso)),
    }));
  }, [data, linhas, by]);

  /* A lista única, sem repetir por grupo: quem manda no "selecionar todos", no
     CSV e no botão do cabeçalho. */
  const todos = useMemo(() => {
    const vistos = new Map<string, CardHistory>();
    for (const g of groups) for (const c of g.cartoes) vistos.set(c.id, c);
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
  /* Padrão (na `api`): os últimos trinta dias, incluindo hoje. */
  const { fuso, de, ate, catalogos, truncado } = data;

  /* Período sempre existe; fila, atendente, etiqueta, ticket e contato são o
     recorte opcional. A distinção decide a frase do estado vazio do servidor
     (truncamento) — o texto da tela em si é fixo, como na deles. */
  const temFilter = Boolean(
    params.queue || params.agent || params.etiqueta || params.ticket || params.contact,
  );
  const limparFilters = `${base}/historico?de=${de}&to=${ate}`;

  return (
    <>
      <div className="board-head">
        <h2>Histórico</h2>
        <div className="filters">
          {/* A ação disponível baixa o CSV das conversas selecionadas. */}
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

      {/* "Filtros rápidos:", os três atalhos deles e o período à direita —
          `FICHA-history.md` §2.2. Cada atalho abre o mesmo painel; nenhum é
          consulta própria. */}
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
          {/* "Últimos 30 dias" é `bds-button variant="text"`: sem borda, só o
              rótulo (`dom/history.html`). O funil é `bds-icon size="small"`,
              20px. */}
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
        acao={`${base}/historico`}
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

      {/* "Área de resultados", `FICHA-history.md` §2: o vazio deles OU a nossa
          lista, e o link "Termo de responsabilidade" no canto — ele mora
          nesta área nos DOIS estados, porque é onde a captura o registrou
          (a captura deles está vazia, e o link está lá mesmo assim). */}
      <div className="hist-resultados">
        {linhas.length === 0 ? (
          /* O texto é o deles, literal — `FICHA-history.md` §6. */
          <EmptyState titulo="Nenhum resultado encontrado" illustration="busca">
            <p>
              Não encontramos nenhum resultado a partir da pesquisa realizada.
              <br />
              Que tal refazer a sua busca?
            </p>
            {/* `bds-button variant="outline" color="primary" class="mt4"`: a
                borda na cor de marca (`button 135x40 b=1px rgb(74,93,35)`
                na cópia viva), 20px abaixo do texto. */}
            <a href={limparFilters} className="btn contorno-marca">
              Redefinir filtros
            </a>
          </EmptyState>
        ) : (
          <>
            {/* "Agrupar por" é nosso, não deles — a resposta aos seis itens de
                relatório que nunca viraram tela (`historico.ts`). Fica FORA do
                painel de propósito: o painel só tem os campos que a ficha lista. */}
            <form method="get" action={`${base}/historico`} className="hist-agrupar">
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
