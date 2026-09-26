import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { Monitoring } from '../../lib/monitoring';
import { useRead } from '../../lib/query';
import { denominador, duration, numero } from '../../lib/format';
import { IconeManagement } from '../../components/icones-management';
import { SListaFilter, SOperationFilter } from '../../components/filters-quick';
import { PanelField, PanelFilters } from '../../components/panel-filters';
import { Selection } from '../../components/selection';
import { SelectionChips } from '../../components/selection-chips';
import { parametrosWithFilters, filterIds } from '../../lib/filters-monitoring';
import { filterStorageKey, loadFilters, saveFilters } from '../../lib/filter-memory';
import { Metrica } from '../../components/metrica';
import { MonitoringDetailed } from '../../components/monitoring-detailed';
import { useContact } from '../flow/contact';
import { useEu } from '../../context/session';
import { attendanceBase } from './shell';

/**
 * Fila e atendente do monitoramento (D-30, `std/nav-contract.md` §Gestão):
 * moram em React state, não na query string; o último valor válido é
 * lembrado por conta/usuário em `localStorage`. `contato`/`status`/`aba`/
 * `busca` continuam na query — a decisão do gate 2 não os cobre (NEEDS
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

interface MonitoringResposta {
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
  { id: 'pausa', nome: 'Em pausa' },
  { id: 'invisivel', nome: 'Invisível' },
] as const;

/**
 * O ícone "Atualizar tela" do cabeçalho da página — `bds-button icon="refresh"
 * variant="secondary"` com o glifo de 24 (`dom/monitoring.html`). Invalida a
 * leitura da `api` e a tela refaz a consulta.
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
      <IconeManagement nome="atualizar" tamanho={24} />
    </button>
  );
}

/**
 * O cartão de métrica deles: `bds-paper pa4 bg-surface-1` com o título
 * `fs-14 semi-bold` e NADA MAIS no topo — os ícones de atualizar/expandir
 * moram só no cabeçalho da página (nenhum `bds-button` dentro dos quatro
 * `bds-paper` em `dom/monitoring.html`; a ficha dizia o contrário, o DOM não).
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
 * Recarrega a leitura a cada 30 segundos, em silêncio. Não é um controle da
 * tela deles — é o ponto de extensão do realtime, registrado desde a entrega
 * anterior — então não ganha ícone nem texto próprio: só mantém o painel
 * fresco enquanto o supervisor olha.
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
 * "Expandir tela": o segundo ícone do cabeçalho, ao lado de "Atualizar tela"
 * (`bds-button icon="screen-full"`, `data-testid="fullscreen-change-to-enable"`).
 */
function ButtonExpandirPage({
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
      <IconeManagement nome="telaCheia" tamanho={24} />
    </button>
  );
}

function TicketsAbertosByHora({ horas }: { horas: readonly number[] }) {
  const maior = Math.max(1, ...horas);
  return (
    <section className="mon-por-hora" aria-label="Tickets abertos por hora">
      <h3>Tickets abertos por hora</h3>
      <div className="mon-por-hora-grafico">
        {horas.map((total, hora) => (
          <div key={hora} className="mon-por-hora-coluna" title={`${hora}h: ${total} ticket(s)`}>
            <span className="mon-por-hora-valor">{total || ''}</span>
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
      <span className="mon-esqueletico valor" />
      <span className="mon-esqueletico rotulo" />
    </div>
  );
}

function CardCarregando({
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

function MonitoringCarregando() {
  return (
    <div className="mon-pagina mon-carregando" role="status" aria-label="Carregando monitoramento">
      <div className="board-head">
        <h2>Monitoramento</h2>
        <div className="filters" aria-hidden="true">
          <span className="mon-esqueletico icone" />
          <span className="mon-esqueletico icone" />
        </div>
      </div>
      <div className="faixa-filtros" aria-hidden="true">
        <span className="lbl">Filtros rápidos:</span>
        <span className="mon-esqueletico pilula" />
        <div className="faixa-fim">
          <span className="mon-esqueletico botao" />
        </div>
      </div>
      <div className="mon" aria-hidden="true">
        <CardCarregando titulo="Atendimentos em tempo real" quantity={5} dividido />
        <CardCarregando titulo="Status dos atendentes" quantity={3} />
        <CardCarregando titulo="Atendimento hoje" quantity={4} />
        <CardCarregando titulo="Status dos tickets hoje" quantity={4} />
      </div>
      <div className="faixa-filtros" aria-hidden="true">
        <span className="lbl">Filtros rápidos:</span>
        <span className="mon-esqueletico pilula" />
        <span className="mon-esqueletico pilula" />
        <span className="mon-esqueletico pilula larga" />
        <div className="faixa-fim">
          <span className="mon-esqueletico botao" />
        </div>
      </div>
      <div className="tblwrap" aria-hidden="true">
        <div className="tblhead">
          <h3>Monitoramento detalhado</h3>
          <span className="mon-esqueletico busca" />
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
 * Monitoramento — a mesma disposição da tela deles, lida em
 * `referencias-blip/portal/dom/monitoring.html` (e confirmada na captura real,
 * `desk/desk-monitoria__pagina.html`): cabeçalho com "Atualizar tela" e
 * "Expandir tela", DUAS faixas "Filtros rápidos:" (a de cima só com "Filas";
 * a de baixo com "Atendentes", "Contato" e "Status do atendente"), grade de
 * cartões 62%/38% em duas linhas, e o cartão "Monitoramento detalhado" com
 * busca, abas, tabela e paginação.
 *
 * Cada cartão é título 14/600 e uma fila de colunas centradas: número 24/400,
 * rótulo 12/400 com o ícone de informação ao lado. "Atendimentos em tempo
 * real" divide as colunas em dois grupos, `w-30` (a fila) e `w-70` (o
 * atendimento), com o fio vertical entre eles. Os TEXTOS dos rótulos e das
 * dicas são os deles, literais.
 *
 * O que NÃO copiamos é a tinta. Eles pintam de azul os dois números que dizem
 * como está a operação agora; nós pintamos os mesmos dois de moss. "Perdidos"
 * e "Abandonados" saem na tinta de erro, como o `color-delete` deles.
 *
 * A fórmula de cada número (spec de métricas) e a população ("entre 6 na
 * fila") continuam existindo — dentro do balão do ícone de informação. Na
 * tela deles o cartão não tem terceira linha sob o rótulo, e a régua desta
 * rodada é a forma deles; a informação nossa não some, muda de lugar.
 */
export function PageMonitoring() {
  const { contact } = useContact();
  const base = `${attendanceBase(contact.tipo, contact.id)}/monitoramento`;
  const [search, definirSearch] = useSearchParams();
  const [panelAberto, setPanelAberto] = useState(false);
  const [fieldPanel, setFieldPanel] = useState<string | null>(null);
  const abrirPanel = (campo: string | null = null) => {
    setFieldPanel(campo);
    setPanelAberto(true);
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
  /* O que veio da URL, já conferido: id que não é UUID vira "sem filtro" em vez
     de virar 500 no `::uuid` do Postgres. */
  const params: Search = {
    ...crus,
    queue: filterIds(queueAgent.queue).join(','),
    agent: filterIds(queueAgent.agent).join(','),
  };
  const q = new URLSearchParams();
  if (params.queue) q.set('fila', params.queue);
  if (params.agent) q.set('atendente', params.agent);
  const read = useRead<MonitoringResposta>(`/v1/management/monitoring?${q}`, {
    staleTime: 0,
  });
  useRecargaSilenciosa(30);

  /* Fila/atendente lembrados podem citar um id que não existe mais (conta
     mudou de filas/atendentes entre visitas) — sai da seleção assim que a
     lista real chega, sem esperar o usuário notar. */
  useEffect(() => {
    if (!read.data) return;
    const idsQueue = new Set(read.data.data.queues.map((o) => o.id));
    const idsAgent = new Set(read.data.data.listaAgents.map((o) => o.id));
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
      <div className="mon-pagina">
        <div className="board-head">
          <h2>Monitoramento</h2>
        </div>
        <div className="card mon-erro" role="alert">
          <h3>Não foi possível carregar o monitoramento</h3>
          <p>Verifique a conexão e tente novamente.</p>
          <button type="button" className="btn" onClick={() => void read.refetch()}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }
  if (!read.data) return <MonitoringCarregando />;
  const { data: m } = read.data;
  const { realTime, agents, hoje } = m;

  return (
    <div className={modoTv ? 'mon-pagina mon-pagina-tv' : 'mon-pagina'}>
      <div className="board-head">
        <h2>Monitoramento</h2>
        <div className="filters">
          <BotaoAtualizar />
          <ButtonExpandirPage cheia={modoTv} aoMudar={setModoTv} />
        </div>
      </div>

      {/* A faixa "Filtros rápidos:", com o próprio botão "Filtros" no fim —
          é ali que ele mora nesta tela, não no cabeçalho. */}
      <SOperationFilter
        atual={params}
        toAbrirPanel={() => abrirPanel('fila')}
        panelAberto={panelAberto && fieldPanel === 'fila'}
        aoLimparQueue={() => setQueueAgent((atual) => ({ ...atual, queue: '' }))}
      />

      {/* ---------------------------------------------------- grade 2×2 */}
      <div className="mon">
        <CardMetric titulo="Atendimentos em tempo real">
          <div className="metrics">
            <div className="metrics-grupo estreito">
              <Metrica
                destaque
                value={numero(realTime.inQueue)}
                rotulo="Na fila"
                dica="Número de atendimentos aguardando por um atendente"
                formula="Conversas abertas que ainda não foram atribuídas a nenhum atendente. Contagem deste instante, com o cronômetro correndo."
              />
              <Metrica
                value={duration(realTime.maiorEsperaInQueueSeg)}
                rotulo="Tempo máximo na fila"
                dica="Tempo máximo que um atendimento ficou na fila"
                formula="A maior espera entre as conversas ainda não atribuídas: agora menos criada_em."
                denominador={`Entre ${numero(realTime.inQueue)} na fila.`}
              />
            </div>
            <div className="metrics-grupo largo">
              <Metrica
                value={duration(realTime.maiorEsperaFirstRespostaSeg)}
                rotulo="Tempo máximo até 1ª resposta"
                dica="Tempo máximo que um atendimento ficou sem resposta"
                formula="A maior espera entre as conversas já atribuídas e ainda sem resposta do atendente: agora menos atribuida_em."
                denominador={`Entre ${numero(realTime.aguardandoFirstResposta)} aguardando.`}
              />
              <Metrica
                destaque
                value={numero(realTime.inAttendance)}
                rotulo="Em atendimento"
                dica="Número de atendimentos em andamento"
                formula="Conversas abertas com atendente atribuído, neste instante."
              />
              <Metrica
                value={numero(realTime.mediaByAgent, 1)}
                rotulo="Média de tickets por atendente"
                dica="Número de atendimentos por atendente"
                formula="Conversas em atendimento divididas pelos atendentes online. Ponderada por volume, nunca média de médias."
                denominador={`${numero(realTime.inAttendance)} ÷ ${numero(realTime.agentsOnline)} online.`}
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
              value={duration(hoje.respostaTime.value)}
              rotulo="Tempo médio de resposta"
              dica="Tempo médio de resposta para atendimento"
              formula="Média dos intervalos entre a mensagem do cliente e a próxima mensagem do atendente. População: conversas com pelo menos uma troca completa."
              denominador={`${numero(hoje.respostaTime.conversationsConsideradas)} com troca completa · ${numero(hoje.respostaTime.population)} intervalos.`}
            />
            <Metrica
              value={duration(hoje.ateFirstResposta.value)}
              rotulo="Tempo médio até 1ª resposta"
              dica="Tempo médio de primeira resposta para atendimento"
              formula="primeira_resposta_em menos atribuida_em. População: conversas que tiveram resposta do atendente."
              denominador={denominador(hoje.ateFirstResposta)}
            />
            <Metrica
              value={duration(hoje.attendanceTime.value)}
              rotulo="Tempo médio de atendimento"
              dica="Tempo médio de atendimento"
              formula="encerrada_em menos primeira_resposta_em. População: conversas que tiveram 1ª resposta."
              denominador={denominador(hoje.attendanceTime)}
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

      {modoTv ? <TicketsAbertosByHora horas={m.ticketsAbertosByHora} /> : null}

      {!modoTv ? (
        <>
          <SListaFilter
            atual={params}
            toAbrirPanel={() => abrirPanel('lista')}
            panelAberto={panelAberto && fieldPanel === 'lista'}
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
        aberto={panelAberto}
        aoFechar={() => {
          setPanelAberto(false);
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
          definirSearch(proximos);
          setPanelAberto(false);
        }}
        limpar={() => {
          if (fieldPanel === 'fila') {
            setQueueAgent((atual) => ({ ...atual, queue: '' }));
          } else {
            setQueueAgent((atual) => ({ ...atual, agent: '' }));
            definirSearch(parametrosWithFilters(search, { contato: '', status: '' }));
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
              <SelectionChips
                name="fila"
                rotulo="Filas"
                placeholder="Selecione as filas"
                options={m.queues}
                valuesInitials={filterIds(params.queue)}
              />
            </PanelField>
          </>
        ) : null}
        {fieldPanel === 'lista' ? (
          <>
            <PanelField rotulo="Atendentes" apoio="Selecione um ou mais atendentes">
              <SelectionChips
                name="atendente"
                rotulo="Atendentes"
                placeholder="Selecione os atendentes"
                options={m.listaAgents}
                valuesInitials={filterIds(params.agent)}
              />
            </PanelField>
            <PanelField rotulo="Contato" apoio="Busque pelo nome do contato">
              <input type="search" name="contato" defaultValue={params.contact ?? ''} />
            </PanelField>
            <PanelField rotulo="Status do atendente" apoio="Disponibilidade atual do atendente">
              <Selection
                name="status"
                defaultValue={params.status ?? ''}
                aria-label="Status do atendente"
              >
                <option value="">Todos os status</option>
                {STATES_OF_AGENT.map((state) => (
                  <option key={state.id} value={state.id}>
                    {state.nome}
                  </option>
                ))}
              </Selection>
            </PanelField>
          </>
        ) : null}
      </PanelFilters>
    </div>
  );
}
