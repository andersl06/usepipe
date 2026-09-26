import { useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Link from './link';
import { Icone } from '@pipe/ui';
import { LABELS_PRIORITY, type LevelPriority } from '@pipe/core/conversation';
import {
  waitSortQueue,
  type ConversationOpenRow,
  type Monitoring,
} from '../lib/monitoring';
import { numero } from '../lib/format';
import { api } from '../lib/api';
import { ManagementIcon } from './icones-management';
import { IconePortal } from './icones-portal';
import { Pagination, usePage } from './pagination';
import { Selection } from './selection';
import { useRead } from '../lib/query';
import { ModalFinishMonitoring } from './modal-finalizar-monitoring';

/**
 * Detailed Monitoring follows the reference final card (`FICHA-monitoring.md` §2.5): title left and search inside at right, then tabs, table with Actions last, and pagination footer. Keep tab and search in the query string with the filter so a 30-second refresh does not reset the supervisor's view. Keep table page in client state because one transaction already loaded all rows. Color the entire severity row, not just text, following the `blip-dash` lesson in Section 3.
 */

/*
 * Tab labels are literal reference copy (`FICHA-monitoring.md` §4); the fifth is `Tags`, while the internal key remains `etiquetas`. Visible labels must match the captured screen exactly.
 */
const ABAS = [
  { chave: 'atribuido', rotulo: 'Atribuído/Em andamento' },
  { chave: 'aguardando', rotulo: 'Aguardando atendimento' },
  { chave: 'atendentes', rotulo: 'Atendentes' },
  { chave: 'filas', rotulo: 'Filas' },
  { chave: 'etiquetas', rotulo: 'Tags' },
] as const;

type Filter = {
  queue?: string;
  agent?: string;
  contact?: string;
  status?: string;
  search?: string;
};

type MonitoringActions = Pick<Monitoring, 'queues' | 'listAgents' | 'etiquetas'>;

/** Formato usado pelo BDS nas tabelas: sempre hh:mm:ss e, acima de 24h, dias. */
function durationMonitoring(segundos: number | null | undefined): string {
  if (segundos === null || segundos === undefined || Number.isNaN(segundos)) return '—';
  const total = Math.max(0, Math.round(segundos));
  const dias = Math.floor(total / 86400);
  const resto = total % 86400;
  const horas = Math.floor(resto / 3600);
  const minutos = Math.floor((resto % 3600) / 60);
  const segundosRestantes = resto % 60;
  const dois = (n: number) => String(n).padStart(2, '0');
  const horario = `${dois(horas)}:${dois(minutos)}:${dois(segundosRestantes)}`;
  return dias > 0 ? `${dias}d ${horario}` : horario;
}

/** Blip `transfer` is used only in this column; keep it local rather than touching sidebar icons. */
function IconeTransferir() {
  return (
    <svg className="mon-icone-transferir" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M21.59 7.87991C21.5948 7.91977 21.5948 7.96006 21.59 7.99991L21.57 8.04991L21.5 8.13991C21.45 8.16991 21.45 8.23991 21.45 8.23991L18.78 11.2399C18.7113 11.3215 18.6256 11.3871 18.5288 11.432C18.4321 11.477 18.3267 11.5001 18.22 11.4999C18.0394 11.496 17.866 11.4288 17.73 11.3099C17.5822 11.1774 17.4921 10.9923 17.479 10.7942C17.466 10.5961 17.5309 10.4007 17.66 10.2499L19.22 8.49991H8C7.80109 8.49991 7.61032 8.4209 7.46967 8.28024C7.32902 8.13959 7.25 7.94883 7.25 7.74991C7.25 7.551 7.32902 7.36023 7.46967 7.21958C7.61032 7.07893 7.80109 6.99991 8 6.99991H19.22L17.66 5.24991C17.5309 5.09909 17.466 4.90374 17.479 4.70565C17.4921 4.50756 17.5822 4.32245 17.73 4.18991C17.8076 4.12526 17.8975 4.07716 17.9944 4.04858C18.0912 4.02 18.1929 4.01153 18.2931 4.02371C18.3933 4.03589 18.49 4.06845 18.5772 4.11939C18.6644 4.17033 18.7402 4.23857 18.8 4.31991L21.47 7.31991C21.52 7.34991 21.52 7.40991 21.52 7.40991L21.59 7.50991C21.5948 7.55311 21.5948 7.59671 21.59 7.63991V7.75991V7.87991ZM4.41976 15.2701H15.6098C15.8087 15.2701 15.9994 15.3491 16.1401 15.4898C16.2807 15.6304 16.3598 15.8212 16.3598 16.0201C16.3598 16.219 16.2807 16.4098 16.1401 16.5504C15.9994 16.6911 15.8087 16.7701 15.6098 16.7701H4.41976L5.99976 18.5201C6.09648 18.6733 6.13361 18.8567 6.10412 19.0355C6.07463 19.2143 5.98057 19.3761 5.83976 19.4901C5.7671 19.5556 5.68219 19.606 5.58993 19.6384C5.49767 19.6709 5.39989 19.6847 5.30225 19.6791C5.20461 19.6735 5.10905 19.6487 5.02108 19.6059C4.93312 19.5632 4.8545 19.5034 4.78976 19.4301L2.11976 16.4301C2.05976 16.4101 2.05976 16.3401 2.05976 16.3401C2.03399 16.3106 2.01367 16.2767 1.99976 16.2401C1.99422 16.197 1.99422 16.1533 1.99976 16.1101V16.0001L2.08976 15.8401C2.08422 15.797 2.08422 15.7533 2.08976 15.7101C2.10367 15.6735 2.12399 15.6396 2.14976 15.6101C2.16623 15.5779 2.18637 15.5477 2.20976 15.5201L4.87976 12.5201C4.94372 12.4456 5.02205 12.3848 5.11007 12.3413C5.19808 12.2977 5.29398 12.2724 5.392 12.2668C5.49003 12.2612 5.58818 12.2754 5.68059 12.3087C5.77299 12.3419 5.85774 12.3934 5.92976 12.4601C6.07756 12.5927 6.16764 12.7778 6.18072 12.9759C6.1938 13.1739 6.12885 13.3693 5.99976 13.5201L4.41976 15.2701Z" />
    </svg>
  );
}

function querystring(filter: Filter, aba: string): URLSearchParams {
  const p = new URLSearchParams();
  if (filter.queue) p.set('fila', filter.queue);
  if (filter.agent) p.set('atendente', filter.agent);
  if (filter.contact) p.set('contato', filter.contact);
  if (filter.status) p.set('status', filter.status);
  if (filter.search) p.set('busca', filter.search);
  p.set('aba', aba);
  return p;
}

/**
 * Row severity has three precedence levels. The previously missing third level highlights a contact awaiting an agent's first response (`blip-gestao-funcoes.md` Section 1), the only highlight unrelated to SLA. First-response wait matters to the customer even when SLA may still be within time. Breached SLA wins because the deadline passed; SLA warning and first-response wait share yellow deliberately because both need the same supervisor action.
 */
function classeDaLinha(linha: ConversationOpenRow): string | undefined {
  if (linha.sla.state === 'estourado') return 'critico';
  if (linha.sla.state === 'alerta') return 'grave';
  if (linha.firstResponseRunning) return 'grave';
  return undefined;
}

/**
 * Priority starts neutral like other category labels. Color only the top two levels that change a supervisor's immediate action; coloring all five would weaken red elsewhere. Maximum uses error color and High alert color, while the three lower levels, including absence, stay neutral. Get labels from `ROTULOS_PRIORIDADE`, the single source also defining queue order.
 */
function PillPriority({ nivel }: { nivel: string }) {
  const rotulo = LABELS_PRIORITY[nivel as LevelPriority] ?? nivel;
  const tinta = nivel === 'maxima' ? ' erro' : nivel === 'alta' ? ' alerta' : '';
  return <span className={`etiqueta${tinta}`}>{rotulo}</span>;
}

/**
 * Reference empty state is literally one centered line, `Dados insuficientes` (`FICHA-monitoring.md` §6, `desk-grid-tabled-paginated-empty-*`), without our former explanation or button.
 */
function WithoutData() {
  return <div className="empty-line">Dados insuficientes</div>;
}


function TicketActions({
  linha,
  catalogos,
  aoAbrir,
}: {
  linha: ConversationOpenRow;
  catalogos: MonitoringActions;
  aoAbrir: (id: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [modal, setModal] = useState<'transferir' | 'finalizar' | null>(null);
  return (
    <td className="acts" onClick={(evento) => evento.stopPropagation()}>
      <div className="mon-actions">
        <button
          type="button"
          className="iconbtn mon-acao"
          data-tooltip="Transferir"
          title="Transferir"
          aria-label={`Transferir ticket ${linha.ticket}`}
          onClick={() => setModal('transferir')}
        >
          <IconeTransferir />
        </button>
        <button type="button" className="iconbtn mon-acao" data-tooltip="Falar com atendente" title="Falar com atendente" aria-label={`Falar com atendente do ticket ${linha.ticket}`} onClick={() => aoAbrir(linha.id)}>
          <IconePortal nome="comunicacao" tamanho={24} />
        </button>
        <button
          type="button"
          className="iconbtn mon-acao"
          data-tooltip="Mais opções"
          title="Mais opções"
          aria-label={`Mais opções do ticket ${linha.ticket}`}
          aria-expanded={aberto}
          onClick={() => setAberto((value) => !value)}
        >
          <IconePortal nome="mais" tamanho={24} />
        </button>
        {aberto ? (
          <div className="mon-menu-actions" role="menu" aria-label={`Ações do ${linha.ticket}`}>
            <button type="button" role="menuitem" onClick={() => aoAbrir(linha.id)}>Abrir conversa</button>
            <button type="button" role="menuitem" className="perigo" onClick={() => { setAberto(false); setModal('finalizar'); }}>
              Finalizar
            </button>
          </div>
        ) : null}
      </div>
      {modal === 'transferir' ? (
        <ModalTransferMonitoring
          linha={linha}
          catalogos={catalogos}
          aoFechar={() => setModal(null)}
        />
      ) : null}
      {modal === 'finalizar' ? (
        <ModalFinishMonitoring
          linha={linha}
          aoFechar={() => setModal(null)}
        />
      ) : null}
    </td>
  );
}

function ModalTransferMonitoring({
  linha,
  catalogos,
  aoFechar,
}: {
  linha: ConversationOpenRow;
  catalogos: MonitoringActions;
  aoFechar: () => void;
}) {
  const [alvo, setAlvo] = useState<'fila' | 'atendente'>('fila');
  const [destination, setDestination] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const consultas = useQueryClient();
  const options = alvo === 'fila' ? catalogos.queues : catalogos.listAgents;

  async function transferir() {
    if (!destination) return;
    setEnviando(true);
    setError(null);
    try {
      await api.post(`/v1/management/monitoring/conversations/${linha.id}/transfer`,
        alvo === 'fila' ? { para_fila_id: destination } : { para_atendente_id: destination },
      );
      await consultas.invalidateQueries({ queryKey: ['api'] });
      aoFechar();
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'Não foi possível transferir o ticket.');
      setEnviando(false);
    }
  }

  return (
    <MonitoringModal titulo={`Transferir atendimento do Ticket ${linha.ticket}`} aoFechar={aoFechar}>
      <div className="mon-radios">
        <label>
          <input type="radio" checked={alvo === 'fila'} onChange={() => { setAlvo('fila'); setDestination(''); }} />
          Fila
        </label>
        <label>
          <input type="radio" checked={alvo === 'atendente'} onChange={() => { setAlvo('atendente'); setDestination(''); }} />
          Atendente
        </label>
      </div>
      <label className="mon-campo">
        {alvo === 'fila' ? 'Fila' : 'Atendente'}
        <Selection value={destination} onChange={(evento) => setDestination(evento.target.value)} aria-label={alvo === 'fila' ? 'Fila' : 'Atendente'}>
          <option value="">{alvo === 'fila' ? 'Selecionar fila' : 'Selecionar atendente'}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>{option.nome}</option>
          ))}
        </Selection>
      </label>
      <p className="mon-modal-aviso">A transferência encerra este ticket e cria um novo no destino.</p>
      {error ? <p className="mon-modal-error">{error}</p> : null}
      <div className="mon-modal-actions">
        <button type="button" className="btn" onClick={aoFechar}>Cancelar</button>
        <button type="button" className="btn primary" disabled={!destination || enviando} onClick={() => void transferir()}>
          Transferir ticket
        </button>
      </div>
    </MonitoringModal>
  );
}

function MonitoringModal({
  titulo,
  children,
  aoFechar,
}: {
  titulo: string;
  children: ReactNode;
  aoFechar: () => void;
}) {
  return (
    <div className="mon-modal-fundo" role="presentation" onClick={aoFechar}>
      <section className="mon-modal" role="dialog" aria-modal="true" aria-label={titulo} onClick={(evento) => evento.stopPropagation()}>
        <h2>{titulo}</h2>
        {children}
      </section>
    </div>
  );
}

/**
 * The agent-row action opens `Atribuído/Em andamento` already filtered by that agent. This is the reference Actions column behavior using an existing filter, not new data.
 */
function ActionViewConversations({ filter, agentId }: { filter: Filter; agentId: string }) {
  return (
    <td className="acts">
      <Link
        className="iconbtn"
        href={`?${querystring({ ...filter, agent: agentId }, 'atribuido').toString()}`}
        title="Ver as conversas deste atendente"
        aria-label="Ver as conversas deste atendente"
      >
        <ManagementIcon nome="externo" tamanho={24} />
      </Link>
    </td>
  );
}

/**
 * Conversation tabs have different columns by source rule (`blip-gestao-funcoes.md` §1). In `Aguardando atendimento`, no ticket has an agent; reusing assigned-ticket columns would fill Agent, First response, and Attendance with dashes and push the important priority column offscreen. Keep Actions on both tabs because managers can also open a queued ticket in the reference.
 */

/**
 * For `Atribuído/Em andamento`, follow reference column order (`FICHA-monitoring.md` §4): two response times, attendance duration, ticket, then person and location. Put the SLA indicator INSIDE the attendance-time column, since SLA judges that duration rather than adding a separate datum.
 */
function TabelaAtribuidas({
  linhas,
  catalogos,
  aoAbrir,
}: {
  linhas: readonly ConversationOpenRow[];
  catalogos: MonitoringActions;
  aoAbrir: (id: string) => void;
}) {
  const pg = usePage(linhas);
  return (
    <>
      <div className="scroll">
        <table className="mon-tabela mon-tabela-atribuidas">
        <thead>
          <tr>
            <th>Tempo na fila</th>
            <th>Tempo de 1ª resposta</th>
            <th>Tempo de atendimento</th>
            <th>Ticket</th>
            <th>Contato</th>
            <th>Fila</th>
            <th>Atendente</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {linhas.length === 0 ? <tr><td colSpan={8}><WithoutData /></td></tr> : pg.visiveis.map((l) => (
            <tr key={l.id} className={classeDaLinha(l)} onClick={() => aoAbrir(l.id)}>
              <td className="num">
                {durationMonitoring(l.inQueueSeg)}
                {l.queueRunning ? ' ⟳' : ''}
              </td>
              <td className="num">
                {durationMonitoring(l.firstResponseSeg)}
                {l.firstResponseRunning ? ' ⟳' : ''}
              </td>
              <td className="time-sla">
                {/*
 * Before the first response, attendance time cannot be measured. Show reference `Aguardando...`, not a dash: a dash means not applicable, while waiting means the timer has not begun.
 */}
                {l.attendanceSeg === null ? (
                  <span className="g-empty-wait">Aguardando...</span>
                ) : (
                  <span className="num">{durationMonitoring(l.attendanceSeg)}</span>
                )}
              </td>
              <td className="num"><button type="button" className="mon-ticket" onClick={() => aoAbrir(l.id)}>{l.ticket}</button></td>
              <td className="who">{l.contactName}</td>
              <td>{l.queueName ?? '—'}</td>
              <td>{l.agentName ?? '—'}</td>
              <TicketActions linha={l} catalogos={catalogos} aoAbrir={aoAbrir} />
            </tr>
          ))}
        </tbody>
        </table>
      </div>

      <Pagination state={pg} grade="open-tickets-grid" />
      <p className="tbl-legenda">
        O destaque amarelo sinaliza que um ticket foi atribuído a um atendente, mas o contato ainda não recebeu a primeira resposta.
      </p>
    </>
  );
}

/**
 * Waiting for attendance follows reference column order: queue wait, priority, ticket, contact, queue. There is no agent by definition.
 */
function TabelaAguardando({
  linhas,
  catalogos,
  aoAbrir,
}: {
  linhas: readonly ConversationOpenRow[];
  catalogos: MonitoringActions;
  aoAbrir: (id: string) => void;
}) {
  const pg = usePage(linhas);
  return (
    <>
      <div className="scroll">
        <table className="mon-tabela mon-tabela-aguardando">
        <thead>
          <tr>
            <th>Tempo na fila</th>
            <th>Prioridade</th>
            <th>Ticket</th>
            <th>Contato</th>
            <th>Fila</th>
            <th>Atendente</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {linhas.length === 0 ? <tr><td colSpan={7}><WithoutData /></td></tr> : pg.visiveis.map((l) => (
            <tr key={l.id} className={classeDaLinha(l)} onClick={() => aoAbrir(l.id)}>
              <td className="num">
                {durationMonitoring(l.inQueueSeg)}
                {l.queueRunning ? ' ⟳' : ''}
              </td>
              <td>
                <PillPriority nivel={l.priority} />
              </td>
              <td className="num"><button type="button" className="mon-ticket" onClick={() => aoAbrir(l.id)}>{l.ticket}</button></td>
              <td className="who">{l.contactName}</td>
              <td>{l.queueName ?? '—'}</td>
              <td>{l.agentName ?? '—'}</td>
              <TicketActions linha={l} catalogos={catalogos} aoAbrir={aoAbrir} />
            </tr>
          ))}
        </tbody>
        </table>
      </div>
      <Pagination state={pg} grade="waiting-tickets-grid" />
    </>
  );
}

/**
 * The Agent tab shows dashes for average response and attendance times: `CargaAtendente` supplies counts and limits, not averages. Inventing a value would be worse than leaving the missing API datum visibly empty; this gap is recorded in the delivery report.
 */
function TableAgents({
  agents,
  filter,
}: {
  agents: Monitoring['carga'];
  filter: Filter;
}) {
  const pg = usePage(agents);
  return (
    <>
      <div className="scroll">
        <table className="mon-tabela mon-table-agents">
        <thead>
          <tr>
            <th>Atendente</th>
            <th>Tickets em atendimento</th>
            <th>Tempo médio de resposta</th>
            <th>Tempo médio de atendimento</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {agents.length === 0 ? <tr><td colSpan={5}><WithoutData /></td></tr> : pg.visiveis.map((a) => (
            <tr key={a.id}>
              <td className="who">{a.nome}</td>
              <td className="num">{numero(a.ativas)}</td>
              <td className="num">{durationMonitoring(a.timeAverageResponseSeg)}</td>
              <td className="num">{durationMonitoring(a.timeAverageAttendanceSeg)}</td>
              <ActionViewConversations filter={filter} agentId={a.id} />
            </tr>
          ))}
        </tbody>
        </table>
      </div>
      <Pagination state={pg} grade="attendants-grid" />
    </>
  );
}

/**
 * Queue maximum wait is not average wait. Leave all three average columns empty until the query returns actual averages; never label a maximum as a mean.
 */
function TableQueues({ queues }: { queues: Monitoring['queues'] }) {
  const pg = usePage(queues);
  return (
    <>
      <div className="scroll">
        <table className="mon-tabela mon-table-queues">
        <thead>
          <tr>
            <th>Fila</th>
            <th>Tickets aguardando</th>
            <th>Tickets em atendimento</th>
            <th>Tempo médio de espera</th>
            <th>Tempo médio de resposta</th>
            <th>Tempo médio de atendimento</th>
          </tr>
        </thead>
        <tbody>
          {queues.length === 0 ? <tr><td colSpan={6}><WithoutData /></td></tr> : pg.visiveis.map((f) => (
            <tr
              key={f.id}
              className={f.agentsOnline === 0 && f.inQueue > 0 ? 'critico' : undefined}
            >
              <td className="who">{f.nome}</td>
              <td className="num">{numero(f.inQueue)}</td>
              <td className="num">{numero(f.inAttendance)}</td>
              <td className="num">{durationMonitoring(f.timeAverageInQueueSeg)}</td>
              <td className="num">{durationMonitoring(f.timeAverageResponseSeg)}</td>
              <td className="num">{durationMonitoring(f.timeAverageAttendanceSeg)}</td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
      <Pagination state={pg} grade="teams-grid" />
    </>
  );
}

/**
 * The Tags sheet asks for finished tickets, but the tag query returns `abertas`, open conversations with that tag. Do not relabel a different metric to fit available data; show a dash until closed-by-tag data exists.
 */
function TabelaTags({ etiquetas }: { etiquetas: Monitoring['etiquetas'] }) {
  const pg = usePage(etiquetas);
  return (
    <>
      <div className="scroll">
        <table className="mon-tabela mon-tabela-tags">
        <thead>
          <tr>
            <th>Tag</th>
            <th>Tickets finalizados</th>
            <th>Tempo médio de atendimento</th>
          </tr>
        </thead>
        <tbody>
          {etiquetas.length === 0 ? <tr><td colSpan={3}><WithoutData /></td></tr> : pg.visiveis.map((e) => (
            <tr key={e.id}>
              <td className="who">{e.nome}</td>
              <td className="num">{numero(e.finalizadas)}</td>
              <td className="num">{durationMonitoring(e.timeAverageAttendanceSeg)}</td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
      <Pagination state={pg} grade="tags-grid" />
    </>
  );
}

type Previa = {
  id: string;
  ticket: string;
  contactName: string;
  queueName: string | null;
  agentName: string | null;
  itens: { id: string; em: string; tipo: 'mensagem' | 'nota'; direction?: string; texto: string; autor?: string | null }[];
};

function ConversationPreview({ id, aoFechar }: { id: string; aoFechar: () => void }) {
  const read = useRead<Previa>(`/v1/management/monitoring/conversations/${id}`);
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const consultas = useQueryClient();

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      await api.post(`/v1/management/monitoring/conversations/${id}/notes`, { texto });
      setTexto('');
      await consultas.invalidateQueries({ queryKey: ['api', `/v1/management/monitoring/conversations/${id}`] });
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'Não foi possível falar com o atendente.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <div className="mon-previa-fundo" onClick={aoFechar} />
      <aside className="mon-previa" role="dialog" aria-modal="true" aria-label="Conversa">
        <header>
          <div>
            <h3>{read.data ? `Ticket ${read.data.ticket}` : 'Conversa'}</h3>
            {read.data ? <p>{read.data.contactName}{read.data.agentName ? ` · ${read.data.agentName}` : ''}</p> : null}
          </div>
          <button type="button" className="iconbtn" aria-label="Fechar conversa" onClick={aoFechar}><Icone nome="x" tamanho={16} /></button>
        </header>
        <div className="mon-preview-history" aria-live="polite">
          {read.isLoading ? <p>Carregando conversa…</p> : null}
          {read.isError ? <p>Não foi possível carregar a conversa.</p> : null}
          {read.data?.itens.map((item) => (
            item.tipo === 'nota' ? <p key={item.id} className="mon-previa-nota"><b>{item.autor ?? 'Nota interna'}</b>{item.texto}</p> :
            <div key={item.id} className={item.direction === 'entrada' ? 'mon-balao inbound' : 'mon-balao saida'}>
              <p>{item.texto || 'Conteúdo sem texto'}</p><small>{item.autor ?? ''}</small>
            </div>
          ))}
        </div>
        <form className="mon-preview-composer" onSubmit={enviar}>
          <label htmlFor="mensagem-atendente">Falar com atendente</label>
          <textarea id="mensagem-atendente" value={texto} onChange={(evento) => setTexto(evento.target.value)} placeholder="Escreva uma mensagem..." rows={3} />
          {error ? <p className="mon-modal-error">{error}</p> : null}
          <button type="submit" className="btn primary" disabled={!texto.trim() || enviando}>Enviar</button>
        </form>
      </aside>
    </>
  );
}

export function MonitoringDetailed({
  monitoring,
  aba,
  search,
  filter,
}: {
  monitoring: Monitoring;
  aba: string;
  search: string;
  filter: Filter;
}) {
  const [conversationOpen, setConversationOpen] = useState<string | null>(null);
  const termo = search.trim().toLowerCase();
  const contact = (filter.contact ?? '').trim().toLowerCase();

  /*
   * `carga` already includes each agent's status, so the `Status do atendente` filter needs no extra request.
   */
  const stateByAgent = new Map(monitoring.carga.map((a) => [a.id, a.state]));

  const casa = (l: ConversationOpenRow) => {
    /*
     * Search inside this card uses the ticket number only; Contact has its own field in the filter strip.
     */
    if (termo && !l.ticket.toLowerCase().includes(termo)) return false;
    if (contact && !l.contactName.toLowerCase().includes(contact)) return false;
    if (filter.status) {
      const state = l.agentId ? stateByAgent.get(l.agentId) : undefined;
      if (state !== filter.status) return false;
    }
    return true;
  };

  const atribuidas = monitoring.abertas.filter((l) => l.agentId !== null).filter(casa);
  /*
   * Sort the waiting queue by priority through `ordenarFilaDeEspera`; leave assigned conversations in the creation order returned by the query.
   */
  const aguardando = waitSortQueue(
    monitoring.abertas.filter((l) => l.agentId === null).filter(casa),
  );
  const actionCatalogs: MonitoringActions = {
    queues: monitoring.queues,
    listAgents: monitoring.listAgents,
    etiquetas: monitoring.etiquetas,
  };

  return (
    <div className="tblwrap mon-detalhado">
      <div className="tblhead">
        <h3>Monitoramento detalhado</h3>

        {/*
 * Blip places ticket-number search here inside the card, not in the filter strip.
 */}
        <form className="tbl-search" method="get">
          {[...querystring(filter, aba)]
            .filter(([key]) => key !== 'busca')
            .map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={value} />
            ))}
          <IconePortal nome="busca" tamanho={20} />
          <input
            type="search"
            name="busca"
            defaultValue={search}
            placeholder="Buscar pelo Nº do ticket"
            aria-label="Buscar pelo Nº do ticket"
          />
        </form>
      </div>

      <div className="tabs" role="tablist">
        {ABAS.map((a) => (
          <Link
            key={a.chave}
            href={`?${querystring(filter, a.chave).toString()}`}
            aria-current={aba === a.chave ? 'true' : undefined}
          >
            {a.rotulo}
          </Link>
        ))}
      </div>

      {aba === 'aguardando' ? <TabelaAguardando linhas={aguardando} catalogos={actionCatalogs} aoAbrir={setConversationOpen} /> : null}
      {aba === 'atribuido' ? <TabelaAtribuidas linhas={atribuidas} catalogos={actionCatalogs} aoAbrir={setConversationOpen} /> : null}
      {aba === 'atendentes' ? (
        <TableAgents agents={monitoring.carga} filter={filter} />
      ) : null}
      {aba === 'filas' ? <TableQueues queues={monitoring.queues} /> : null}
      {aba === 'etiquetas' ? <TabelaTags etiquetas={monitoring.etiquetas} /> : null}
      {conversationOpen ? <ConversationPreview id={conversationOpen} aoFechar={() => setConversationOpen(null)} /> : null}
    </div>
  );
}
