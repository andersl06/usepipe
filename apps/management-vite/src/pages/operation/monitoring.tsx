import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { Monitoring } from '../../lib/monitoring';
import { TabelaErro } from '../../components/estados-tabela';
import { useRead } from '../../lib/query';
import { denominador, duration, numero } from '../../lib/format';
import { ManagementIcon } from '../../components/icones-management';
import { SListFilter, SOperationFilter } from '../../components/filters-quick';
import { FieldContact, PanelField, PanelFilters } from '../../components/panel-filters';
import { Select } from '@pipe/ui/select';
import { ChipsInput } from '@pipe/ui/chips-input';
import { parametersWithFilters, filterIds } from '../../lib/filters-monitoring';
import { filterStorageKey, loadFilters, saveFilters } from '../../lib/filter-memory';
import { Metrica } from '../../components/metrica';
import { MonitoringDetailed } from '../../components/monitoring-detailed';
import { useContact } from '../flow/contact';
import { useEu } from '../../context/session';
import { attendanceBase } from './shell';

/**
 * Fila e atendente do monitoramento (D-30, `std/nav-contract.md` §Gestão):
 * moram em React state, não na query string; o último valor válido é
 * lembrado por conta/usuário em `localStorage`. `contact`/`status`/`aba`/
 * `search` continuam na query — a decisão do gate 2 não os cobre (NEEDS
 * VALIDATION na tabela por tela).
 */
interface QueueAgentFilters {
  queue: string;
  agent: string;
}

function validateQueueAgentShape(value: unknown): QueueAgentFilters | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.queue !== 'string' || typeof v.agent !== 'string') return null;
  return { queue: v.queue, agent: v.agent };
}

interface MonitoringResponse {
  fuso: string;
  window: { inicio: string; fim: string };
  data: Monitoring;
}

interface Search {
  queue?: string;
  agent?: string;
  contact?: string;
  status?: string;
  aba?: string;
  search?: string;
}

const STATES_OF_AGENT = [
  { id: 'online', nome: 'Online' },
  { id: 'pausa', nome: 'Em Pausa' },
  { id: 'invisivel', nome: 'Invisível' },
] as const;

/**
 * The page header's "Atualizar tela" icon — `bds-button icon="refresh" variant="secondary"` with the 24 glyph (`dom/monitoring.html`). Invalidates the `api` read and the screen redoes the query.
 */
function BotaoAtualizar() {
  const queue = useQueryClient();
  return (
    <button
      type="button"
      className="iconbtn"
      title="Atualizar tela"
      aria-label="Atualizar tela"
      onClick={() => void queue.invalidateQueries({ queryKey: ['api'] })}
    >
      <ManagementIcon nome="atualizar" tamanho={24} />
    </button>
  );
}

/**
 * Their metric card: `bds-paper pa4 bg-surface-1` with an `fs-14 semi-bold` title and NOTHING ELSE at the top — the refresh/expand icons live only in the page header (no `bds-button` inside any of the four `bds-paper` in `dom/monitoring.html`; the reference doc said otherwise, the DOM didn't).
 */
function CardMetric({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="card">
      <div className="card-cabecalho">
        <h3>{titulo}</h3>
      </div>
      {children}
    </div>
  );
}

/**
 * Silently reloads the read every 30 seconds. It isn't a control from their screen — it's the realtime extension point, in place since the previous delivery — so it gets no icon or text of its own: it just keeps the panel fresh while the supervisor is looking.
 */
function useRecargaSilenciosa(segundos: number) {
  const queue = useQueryClient();
  useEffect(() => {
    const id = setInterval(
      () => void queue.invalidateQueries({ queryKey: ['api'] }),
      segundos * 1000,
    );
    return () => clearInterval(id);
  }, [queue, segundos]);
}

/**
 * "Expandir tela": the header's second icon, next to "Atualizar tela" (`bds-button icon="screen-full"`, `data-testid="fullscreen-change-to-enable"`).
 */
function ButtonExpandPage({
  cheia,
  aoMudar,
}: {
  cheia: boolean;
  aoMudar: (cheia: boolean) => void;
}) {
  useEffect(() => {
    const toSwitch = () => aoMudar(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', toSwitch);
    return () => document.removeEventListener('fullscreenchange', toSwitch);
  }, [aoMudar]);
  function alternar() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  }
  return (
    <button
      type="button"
      className="iconbtn"
      title="Expandir tela"
      aria-label="Expandir tela"
      aria-pressed={cheia}
      onClick={alternar}
    >
      <ManagementIcon nome="telaCheia" tamanho={24} />
    </button>
  );
}

function TicketsOpenByHour({ horas }: { horas: readonly number[] }) {
  const maior = Math.max(1, ...horas);
  return (
    <section className="mon-per-hour" aria-label="Tickets abertos por hora">
      <h3>Tickets abertos por hora</h3>
      <div className="mon-per-hour-chart">
        {horas.map((total, hora) => (
          <div key={hora} className="mon-per-hour-column" title={`${hora}h: ${total} ticket(s)`}>
            <span className="mon-per-hour-value">{total || ''}</span>
            <i style={{ height: `${Math.max(total > 0 ? 8 : 0, (total / maior) * 100)}%` }} />
            <small>{String(hora).padStart(2, '0')}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function MetricaCarregando() {
  return (
    <div className="metric mon-metrica-carregando">
      <span className="mon-esqueletico value" />
      <span className="mon-esqueletico rotulo" />
    </div>
  );
}

function CardLoading({
  titulo,
  quantity,
  dividido = false,
}: {
  titulo: string;
  quantity: number;
  dividido?: boolean;
}) {
  return (
    <div className="card">
      <div className="card-cabecalho">
        <h3>{titulo}</h3>
      </div>
      <div className="metrics">
        {dividido ? (
          <>
            <div className="metrics-grupo estreito">
              <MetricaCarregando />
              <MetricaCarregando />
            </div>
            <div className="metrics-grupo largo">
              <MetricaCarregando />
              <MetricaCarregando />
              <MetricaCarregando />
            </div>
          </>
        ) : (
          Array.from({ length: quantity }, (_, indice) => <MetricaCarregando key={indice} />)
        )}
      </div>
    </div>
  );
}

function MonitoringLoading() {
  return (
    <div className="mon-page mon-carregando" role="status" aria-busy="true" aria-label="Carregando monitoramento">
      <div className="board-head">
        <h2>Monitoramento</h2>
        <div className="filters" aria-hidden="true">
          <span className="mon-esqueletico icone" />
          <span className="mon-esqueletico icone" />
        </div>
      </div>
      <div className="strip-filters" aria-hidden="true">
        <span className="lbl">Filtros rápidos:</span>
        <span className="mon-esqueletico pilula" />
        <div className="faixa-fim">
          <span className="mon-esqueletico botao" />
        </div>
      </div>
      <div className="mon" aria-hidden="true">
        <CardLoading titulo="Atendimentos em tempo real" quantity={5} dividido />
        <CardLoading titulo="Status dos atendentes" quantity={3} />
        <CardLoading titulo="Atendimento hoje" quantity={4} />
        <CardLoading titulo="Status dos tickets hoje" quantity={4} />
      </div>
      <div className="strip-filters" aria-hidden="true">
        <span className="lbl">Filtros rápidos:</span>
        <span className="mon-esqueletico pilula" />
        <span className="mon-esqueletico pilula" />
        <span className="mon-esqueletico pilula larga" />
        <div className="faixa-fim">
          <span className="mon-esqueletico botao" />
        </div>
      </div>
      <div className="tblwrap" aria-hidden="true" aria-busy="true">
        <div className="tblhead">
          <h3>Monitoramento detalhado</h3>
          <span className="mon-esqueletico search" />
        </div>
        <div className="tabs mon-abas-carregando">
          {Array.from({ length: 5 }, (_, indice) => (
            <span className="mon-esqueletico aba" key={indice} />
          ))}
        </div>
        <div className="scroll mon-tabela-carregando">
          {Array.from({ length: 4 }, (_, indice) => (
            <div className="mon-tabela-linha" key={indice}>
              {Array.from({ length: 5 }, (_, column) => (
                <span className="mon-esqueletico celula" key={column} />
              ))}
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">Carregando dados do monitoramento.</span>
    </div>
  );
}

/**
 * Monitoring — the same layout as their screen, read from `referencias-blip/portal/dom/monitoring.html` (and confirmed against the real capture, `desk/desk-monitoria__pagina.html`): header with "Atualizar tela" and "Expandir tela", TWO "Filtros rápidos:" strips (the top one with only "Filas"; the bottom one with "Atendentes", "Contato" and "Status do atendente"), a 62%/38% card grid across two rows, and the "Monitoramento detalhado" card with search, tabs, table and pagination.
 *
 * Each card is a 14/600 title and a row of centered columns: number 24/400, label 12/400 with the info icon beside it. "Atendimentos em tempo real" splits its columns into two groups, `w-30` (the queue) and `w-70` (the attendance), with a vertical rule between them. The label and tooltip TEXTS are theirs, literal.
 *
 * What we did NOT copy is the color. They paint the two numbers that describe the operation right now in blue; we paint the same two in moss. "Perdidos" and "Abandonados" come out in the error color, like their `color-delete`.
 *
 * Each number's formula (metrics spec) and its population ("entre 6 na fila") still exist — inside the info icon's tooltip. On their screen the card has no third line under the label, and this round's ruler is their shape; our information doesn't disappear, it just moves.
 */
export function PageMonitoring() {
  const { contact } = useContact();
  const base = `${attendanceBase(contact)}/monitoring`;
  const [search, setSearch] = useSearchParams();
  const [panelOpen, setPanelOpen] = useState(false);
  const [fieldPanel, setFieldPanel] = useState<string | null>(null);
  const [statusEscolhido, setStatusEscolhido] = useState(search.get('status') ?? '');
  const openPanel = (campo: string | null = null) => {
    setFieldPanel(campo);
    setStatusEscolhido(search.get('status') ?? '');
    setPanelOpen(true);
  };
  const [modoTv, setModoTv] = useState(false);

  const eu = useEu();
  const filtrosKey = filterStorageKey('management', 'monitoring', eu.tenant.id, eu.user.id);
  const [queueAgent, setQueueAgent] = useState<QueueAgentFilters>(
    () => loadFilters(filtrosKey, validateQueueAgentShape) ?? { queue: '', agent: '' },
  );
  useEffect(() => {
    saveFilters(filtrosKey, queueAgent);
  }, [filtrosKey, queueAgent]);

  const crus = Object.fromEntries(search.entries()) as Search;
  /*
   * Value from the URL, already checked: an id that isn't a UUID becomes "no filter" instead of a 500 from Postgres's `::uuid` cast.
   */
  const params: Search = {
    ...crus,
    queue: filterIds(queueAgent.queue).join(','),
    agent: filterIds(queueAgent.agent).join(','),
  };
  const q = new URLSearchParams();
  if (params.queue) q.set('queue', params.queue);
  if (params.agent) q.set('agent', params.agent);
  const read = useRead<MonitoringResponse>(`/v1/management/monitoring?${q}`, {
    staleTime: 0,
  });
  useRecargaSilenciosa(30);

  /* Fila/atendente lembrados podem citar um id que não existe mais (conta
     mudou de filas/atendentes entre visitas) — sai da seleção assim que a
     lista real chega, sem esperar o usuário notar. */
  useEffect(() => {
    if (!read.data) return;
    const idsQueue = new Set(read.data.data.queues.map((o) => o.id));
    const idsAgent = new Set(read.data.data.listAgents.map((o) => o.id));
    setQueueAgent((atual) => {
      const queue = filterIds(atual.queue)
        .filter((id) => idsQueue.has(id))
        .join(',');
      const agent = filterIds(atual.agent)
        .filter((id) => idsAgent.has(id))
        .join(',');
      return queue === atual.queue && agent === atual.agent ? atual : { queue, agent };
    });
  }, [read.data]);

  if (!read.data && read.isError) {
    return (
      <div className="mon-page">
        <div className="board-head">
          <h2>Monitoramento</h2>
        </div>
        <TabelaErro aoTentar={() => void read.refetch()} />
      </div>
    );
  }
  if (!read.data) return <MonitoringLoading />;
  const { data: m } = read.data;
  const { realtime, agents, hoje } = m;

  return (
    <div className={modoTv ? 'mon-page mon-page-tv' : 'mon-page'}>
      <div className="board-head">
        <h2>Monitoramento</h2>
        <div className="filters">
          <BotaoAtualizar />
          <ButtonExpandPage cheia={modoTv} aoMudar={setModoTv} />
        </div>
      </div>

      {/*
 * The "Filtros rápidos:" strip, with its own "Filtros" button at the end — that's where it lives on this screen, not in the header.
 */}
      <SOperationFilter
        atual={params}
        toOpenPanel={() => openPanel('fila')}
        panelOpen={panelOpen && fieldPanel === 'fila'}
        aoLimparQueue={() => setQueueAgent((atual) => ({ ...atual, queue: '' }))}
      />

      {/* ---------------------------------------------------- grade 2×2 */}
      <div className="mon">
        <CardMetric titulo="Atendimentos em tempo real">
          <div className="metrics">
            <div className="metrics-grupo estreito">
              <Metrica
                destaque
                value={numero(realtime.naFila)}
                rotulo="Na fila"
                dica="Número de atendimentos aguardando por um atendente"
                formula="Conversas abertas que ainda não foram atribuídas a nenhum atendente. Contagem deste instante, com o cronômetro correndo."
              />
              <Metrica
                value={duration(realtime.largestWaitInQueueSeg)}
                rotulo="Tempo máximo na fila"
                dica="Tempo máximo que um atendimento ficou na fila"
                formula="A maior espera entre as conversas ainda não atribuídas: agora menos criada_em."
                denominador={`Entre ${numero(realtime.naFila)} na fila.`}
              />
            </div>
            <div className="metrics-grupo largo">
              <Metrica
                value={duration(realtime.largestWaitFirstResponseSeg)}
                rotulo="Tempo máximo até 1ª resposta"
                dica="Tempo máximo que um atendimento ficou sem resposta"
                formula="A maior espera entre as conversas já atribuídas e ainda sem resposta do atendente: agora menos atribuida_em."
                denominador={`Entre ${numero(realtime.waitingFirstResponse)} aguardando.`}
              />
              <Metrica
                destaque
                value={numero(realtime.inAttendance)}
                rotulo="Em atendimento"
                dica="Número de atendimentos em andamento"
                formula="Conversas abertas com atendente atribuído, neste instante."
              />
              <Metrica
                value={numero(realtime.mediaByAgent, 1)}
                rotulo="Média de tickets por atendente"
                dica="Número de atendimentos por atendente"
                formula="Conversas em atendimento divididas pelos atendentes online. Ponderada por volume, nunca média de médias."
                denominador={`${numero(realtime.inAttendance)} ÷ ${numero(realtime.agentsOnline)} online.`}
              />
            </div>
          </div>
        </CardMetric>

        <CardMetric titulo="Status dos atendentes">
          <div className="metrics">
            <Metrica
              value={numero(agents.online)}
              rotulo="Online"
              dica="Número de atendentes online"
            />
            <Metrica
              value={numero(agents.pausa)}
              rotulo="Pausa"
              dica="Número de atendentes em pausa"
              denominador={
                agents.pausasEstouradas > 0
                  ? `${numero(agents.pausasEstouradas)} pausa(s) acima da duração sugerida pelo motivo.`
                  : undefined
              }
            />
            <Metrica
              value={numero(agents.invisivel)}
              rotulo="Invisível"
              dica="Número de atendentes invisíveis"
            />
          </div>
        </CardMetric>

        <CardMetric titulo="Atendimento hoje">
          <div className="metrics">
            <Metrica
              value={duration(hoje.esperaDoCliente.value)}
              rotulo="Tempo médio de espera"
              dica="Tempo médio de espera para atendimento"
              formula="Espera total do cliente. Com resposta: primeira_resposta_em menos criada_em. Sem resposta: encerrada_em menos criada_em. População: todas as conversas encerradas no período."
              denominador={denominador(hoje.esperaDoCliente, 'sem início')}
            />
            <Metrica
              value={duration(hoje.timeOfResponse.value)}
              rotulo="Tempo médio de resposta"
              dica="Tempo médio de resposta para atendimento"
              formula="Média dos intervalos entre a mensagem do cliente e a próxima mensagem do atendente. População: conversas com pelo menos uma troca completa."
              denominador={`${numero(hoje.timeOfResponse.conversationsConsidered)} com troca completa · ${numero(hoje.timeOfResponse.population)} intervalos.`}
            />
            <Metrica
              value={duration(hoje.untilFirstResponse.value)}
              rotulo="Tempo médio até 1ª resposta"
              dica="Tempo médio de primeira resposta para atendimento"
              formula="primeira_resposta_em menos atribuida_em. População: conversas que tiveram resposta do atendente."
              denominador={denominador(hoje.untilFirstResponse)}
            />
            <Metrica
              value={duration(hoje.timeOfAttendance.value)}
              rotulo="Tempo médio de atendimento"
              dica="Tempo médio de atendimento"
              formula="encerrada_em menos primeira_resposta_em. População: conversas que tiveram 1ª resposta."
              denominador={denominador(hoje.timeOfAttendance)}
            />
          </div>
        </CardMetric>

        <CardMetric titulo="Status dos tickets hoje">
          <div className="metrics">
            <Metrica
              tom="erro"
              value={numero(hoje.closures.perdida)}
              rotulo="Perdidos"
              dica="Número de tickets que foram perdidos hoje"
              formula="Perdido saiu ANTES da atribuição, e é capacidade ou fila."
            />
            <Metrica
              tom="erro"
              value={numero(hoje.closures.abandonada)}
              rotulo="Abandonados"
              dica="Número de tickets fechados pelo cliente hoje"
              formula="Abandonado saiu DEPOIS da atribuição, e é atendimento."
            />
            <Metrica
              value={numero(hoje.closures.finalizada)}
              rotulo="Finalizados"
              dica="Número de tickets que foram atendidos hoje"
            />
            <Metrica
              value={numero(hoje.closures.fechada)}
              rotulo="Fechados"
              dica="Número de tickets que foram fechados hoje"
              formula="Fechados é a soma de perdidos, abandonados e finalizados."
            />
          </div>
        </CardMetric>
      </div>

      {modoTv ? <TicketsOpenByHour horas={m.ticketsOpenByHour} /> : null}

      {!modoTv ? (
        <>
          <SListFilter
            atual={params}
            toOpenPanel={() => openPanel('lista')}
            panelOpen={panelOpen && fieldPanel === 'lista'}
            aoLimparAgent={() => setQueueAgent((atual) => ({ ...atual, agent: '' }))}
          />

          <MonitoringDetailed
            monitoring={m}
            aba={params.aba ?? 'atribuido'}
            search={params.search ?? ''}
            filter={params}
          />
        </>
      ) : null}

      <PanelFilters
        aberto={panelOpen}
        aoFechar={() => {
          setPanelOpen(false);
          setFieldPanel(null);
        }}
        acao={base}
        aoAplicar={(data) => {
          const proximos = new URLSearchParams(search);
          let queue = queueAgent.queue;
          let agent = queueAgent.agent;
          for (const [key, value] of data) {
            /* Fila e atendente (D-30) não vão para a URL — o resto do painel
               (contato, status, aba, busca) continua na query, sem mudança. */
            if (key === 'fila') {
              queue = typeof value === 'string' ? filterIds(value).join(',') : queue;
              continue;
            }
            if (key === 'atendente') {
              agent = typeof value === 'string' ? filterIds(value).join(',') : agent;
              continue;
            }
            proximos.delete(key);
            if (typeof value === 'string' && value.trim()) proximos.set(key, value.trim());
          }
          setQueueAgent({ queue, agent });
          setSearch(proximos);
          setPanelOpen(false);
        }}
        limpar={() => {
          if (fieldPanel === 'fila') {
            setQueueAgent((atual) => ({ ...atual, queue: '' }));
          } else {
            setQueueAgent((atual) => ({ ...atual, agent: '' }));
            setSearch(parametersWithFilters(search, { contato: '', status: '' }));
          }
        }}
      >
        <input type="hidden" name="aba" value={params.aba ?? 'atribuido'} />
        {params.search ? <input type="hidden" name="busca" value={params.search} /> : null}
        {fieldPanel === 'fila' ? (
          <>
            <input type="hidden" name="atendente" value={params.agent ?? ''} />
            <input type="hidden" name="contato" value={params.contact ?? ''} />
            <input type="hidden" name="status" value={params.status ?? ''} />
          </>
        ) : (
          <input type="hidden" name="fila" value={params.queue ?? ''} />
        )}
        {fieldPanel === 'fila' ? (
          <>
            <PanelField rotulo="Filas" icone="fila" apoio="Selecione uma ou mais filas">
              <ChipsInput
                name="fila"
                rotulo="Filas"
                placeholder="Selecione as filas"
                options={m.queues.map((o) => ({ id: o.id, nome: o.name }))}
                valuesInitials={filterIds(params.queue)}
              />
            </PanelField>
          </>
        ) : null}
        {fieldPanel === 'lista' ? (
          <>
            <PanelField rotulo="Atendentes" apoio="Selecione um ou mais atendentes">
              <ChipsInput
                name="atendente"
                rotulo="Atendentes"
                placeholder="Selecione os atendentes"
                options={m.listAgents.map((o) => ({ id: o.id, nome: o.name }))}
                valuesInitials={filterIds(params.agent)}
              />
            </PanelField>
            <PanelField rotulo="Contato" apoio="Busque pelo nome do contato">
              <FieldContact name="contato" defaultValue={params.contact ?? ''} />
            </PanelField>
            <PanelField rotulo="Status do atendente" apoio="Selecione um status">
              <Select
                name="status"
                defaultValue={params.status ?? ''}
                aria-label="Status do atendente"
                onChange={(e) => setStatusEscolhido(e.currentTarget.value)}
              >
                <option value="">Todos os status</option>
                {STATES_OF_AGENT.map((state) => (
                  <option key={state.id} value={state.id}>
                    {state.nome}
                  </option>
                ))}
              </Select>
              {statusEscolhido === 'invisivel' ? (
                <p className="panel-support" role="status">Este recurso será liberado em breve para este fluxo.</p>
              ) : null}
            </PanelField>
          </>
        ) : null}
      </PanelFilters>
    </div>
  );
}
