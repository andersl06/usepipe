import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
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
import { matchesListFilters } from '../lib/filters-monitoring';
import { api } from '@pipe/ui/api';
import { ManagementIcon } from './icones-management';
import { IconePortal } from '@pipe/ui/icones-portal';
import { Pagination, usePage } from '@pipe/ui/pagination';
import { Modal } from '@pipe/ui/modal';
import { Select } from '@pipe/ui/select';
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

type MonitoringActions = Pick<Monitoring, 'queues' | 'listAgents' | 'labels'>;

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

/**
 * Action icons are drawn by Pipe as 24px outlines with the shared stroke width, never taken from
 * the reference. `IconeTransferir` is two opposed arrows; `IconeFinalizar` a check inside a circle;
 * `IconeOpcoes` three stacked dots.
 */
type PropsIcone = { tamanho?: number };

function IconeTraco({ tamanho = 20, children }: PropsIcone & { children: ReactNode }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ strokeWidth: 'var(--p-icone-traco)' }}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

function IconeTransferir({ tamanho }: PropsIcone) {
  return (
    <IconeTraco tamanho={tamanho}>
      <path d="M4 8h16M16 4l4 4-4 4M20 16H4M8 12l-4 4 4 4" />
    </IconeTraco>
  );
}

function IconeFinalizar({ tamanho }: PropsIcone) {
  return (
    <IconeTraco tamanho={tamanho}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.7 2.7L16 9.5" />
    </IconeTraco>
  );
}

function IconeOpcoes({ tamanho }: PropsIcone) {
  return (
    <IconeTraco tamanho={tamanho}>
      <circle cx="12" cy="5.5" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="18.5" r="1" fill="currentColor" />
    </IconeTraco>
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
/**
 * Reference empty state is literally one centered line, `Dados insuficientes` (`FICHA-monitoring.md` §6, `desk-grid-tabled-paginated-empty-*`), without our former explanation or button.
 */
function WithoutData() {
  return <div className="empty-line">Dados insuficientes</div>;
}


/** Empty state of the two ticket tabs: no open ticket, or filters that match none. */
function VazioTickets({ filtrado }: { filtrado: boolean }) {
  return filtrado ? (
    <div className="empty-line">
      <b>Nenhum resultado encontrado</b>
      <p>Ajuste os filtros para ver atendimentos.</p>
    </div>
  ) : (
    <div className="empty-line">
      <b>Nenhum atendimento em andamento</b>
      <p>Quando um cliente pedir atendimento humano, o ticket aparece aqui.</p>
    </div>
  );
}

type AcaoTicket = 'transferir' | 'finalizar';
type AbaDetalhe = 'atendimento' | 'falar' | 'informacoes';
type AbrirDetalhe = (id: string, aba?: AbaDetalhe) => void;
type AoAcionar = (acao: AcaoTicket, linha: ConversationOpenRow) => void;

/**
 * Icon-only button of the Actions column: a bare 20px icon with a 24px click target and a tooltip
 * (`FICHA-monitoring.md` §4, captures `monitoramento-menu-tres-pontos-atribuido` and
 * `monitoramento-aba-aguardando-atendimento`). Tooltip text is the visible name; `aria-label`
 * carries the ticket number for assistive technology.
 */
function BotaoAcao({
  rotulo,
  rotuloAcessivel,
  posicao = 'centro',
  onClick,
  children,
}: {
  rotulo: string;
  rotuloAcessivel: string;
  posicao?: 'centro' | 'direita';
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="iconbtn mon-acao"
      data-tooltip={rotulo}
      data-tooltip-pos={posicao}
      aria-label={rotuloAcessivel}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/**
 * Three-dot menu of the assigned-ticket row. It opens to the left of its trigger, moves focus with
 * the arrow keys, Home and End, chooses with Enter or Space (native buttons), closes with Escape,
 * Tab or a click outside, and returns focus to the trigger.
 */
function MenuTicket({
  linha,
  itens,
}: {
  linha: ConversationOpenRow;
  itens: { rotulo: string; icone: ReactNode; aoEscolher: () => void }[];
}) {
  const [aberto, setAberto] = useState(false);
  const gatilho = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const fora = (evento: MouseEvent) => {
      const alvo = evento.target as Node;
      if (!menu.current?.contains(alvo) && !gatilho.current?.contains(alvo)) setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  function fechar() {
    setAberto(false);
    gatilho.current?.focus();
  }

  function teclas(evento: KeyboardEvent<HTMLDivElement>) {
    const lista = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const atual = lista.indexOf(document.activeElement as HTMLElement);
    const ir = (indice: number) => {
      evento.preventDefault();
      lista[(indice + lista.length) % lista.length]?.focus();
    };
    if (evento.key === 'ArrowDown') ir(atual + 1);
    else if (evento.key === 'ArrowUp') ir(atual - 1);
    else if (evento.key === 'Home') ir(0);
    else if (evento.key === 'End') ir(lista.length - 1);
    else if (evento.key === 'Escape') {
      evento.preventDefault();
      evento.stopPropagation();
      fechar();
    } else if (evento.key === 'Tab') setAberto(false);
  }

  return (
    <span className="mon-menu-ancora">
      <button
        ref={gatilho}
        type="button"
        className="iconbtn mon-acao"
        aria-label={`Mais opções do ticket ${linha.ticket}`}
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={() => setAberto((valor) => !valor)}
        onKeyDown={(evento) => {
          if (evento.key === 'ArrowDown') {
            evento.preventDefault();
            setAberto(true);
          }
        }}
      >
        <IconeOpcoes />
      </button>
      {aberto ? (
        <div ref={menu} className="mon-menu-actions" role="menu" aria-label={`Ações do ticket ${linha.ticket}`} onKeyDown={teclas}>
          {itens.map((item) => (
            <button
              key={item.rotulo}
              type="button"
              role="menuitem"
              onClick={() => {
                setAberto(false);
                item.aoEscolher();
              }}
            >
              {item.icone}
              {item.rotulo}
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );
}

/**
 * Actions column. Assigned tickets show Transferir, Falar com atendente and a three-dot menu whose
 * only item is Finalizar ticket; waiting tickets show Transferir and Finalizar directly
 * (`FICHA-monitoring.md` §4).
 */
function TicketActions({
  linha,
  aguardando,
  aoAbrir,
  aoAcionar,
}: {
  linha: ConversationOpenRow;
  aguardando: boolean;
  aoAbrir: AbrirDetalhe;
  aoAcionar: AoAcionar;
}) {
  return (
    <td className="acts" onClick={(evento) => evento.stopPropagation()}>
      <div className="mon-actions">
        <BotaoAcao rotulo="Transferir" rotuloAcessivel={`Transferir ticket ${linha.ticket}`} onClick={() => aoAcionar('transferir', linha)}>
          <IconeTransferir />
        </BotaoAcao>
        {aguardando ? (
          <BotaoAcao rotulo="Finalizar" rotuloAcessivel={`Finalizar ticket ${linha.ticket}`} onClick={() => aoAcionar('finalizar', linha)}>
            <IconeFinalizar />
          </BotaoAcao>
        ) : (
          <>
            <BotaoAcao
              rotulo="Falar com atendente"
              rotuloAcessivel={`Falar com atendente do ticket ${linha.ticket}`}
              posicao="direita"
              onClick={() => aoAbrir(linha.id, 'falar')}
            >
              <IconePortal nome="comunicacao" tamanho={20} />
            </BotaoAcao>
            <MenuTicket
              linha={linha}
              itens={[{ rotulo: 'Finalizar ticket', icone: <IconeFinalizar tamanho={24} />, aoEscolher: () => aoAcionar('finalizar', linha) }]}
            />
          </>
        )}
      </div>
    </td>
  );
}

/**
 * Transfer dialog (`FICHA-monitoring.md` §4, captures `monitoramento-transferir-*`): Fila or
 * Atendente radio, a selector with the matching placeholder, Cancelar and the primary
 * `Transferir ticket`, disabled until a destination is chosen. Saves through the existing route.
 */
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
        alvo === 'fila' ? { forQueueId: destination } : { forAgentId: destination },
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
          <input type="radio" name="mon-transferir-alvo" checked={alvo === 'fila'} onChange={() => { setAlvo('fila'); setDestination(''); }} />
          Fila
        </label>
        <label>
          <input type="radio" name="mon-transferir-alvo" checked={alvo === 'atendente'} onChange={() => { setAlvo('atendente'); setDestination(''); }} />
          Atendente
        </label>
      </div>
      <div className="mon-campo">
        <Select value={destination} onChange={(evento) => setDestination(evento.target.value)} aria-label={alvo === 'fila' ? 'Fila' : 'Atendente'}>
          <option value="">{alvo === 'fila' ? 'Selecionar fila' : 'Selecionar atendente'}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>{option.name}</option>
          ))}
        </Select>
      </div>
      <p className="mon-modal-aviso">A transferência encerra este ticket e cria um novo no destino.</p>
      {error ? <p className="mon-modal-error" role="alert">{error}</p> : null}
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
    <Modal skin={{ fundo: 'mon-modal-fundo', caixa: 'mon-modal', elemento: 'section' }} titulo={titulo} onFechar={aoFechar}>
      <h2>{titulo}</h2>
      {children}
    </Modal>
  );
}

/**
 * The agent-row action opens `Atribuído/Em andamento` already filtered by that agent. This is the reference Actions column behavior using an existing filter, not new data.
 */
function ActionViewConversations({ filter, agentId }: { filter: Filter; agentId: string }) {
  return (
    <td className="acts">
      <div className="mon-actions">
        <Link
          className="iconbtn mon-acao"
          href={`?${querystring({ ...filter, agent: agentId }, 'atribuido').toString()}`}
          data-tooltip="Ver as conversas deste atendente"
          aria-label="Ver as conversas deste atendente"
        >
          <ManagementIcon nome="externo" tamanho={24} />
        </Link>
      </div>
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
  filtrado,
  aoAbrir,
  aoAcionar,
}: {
  linhas: readonly ConversationOpenRow[];
  filtrado: boolean;
  aoAbrir: AbrirDetalhe;
  aoAcionar: AoAcionar;
}) {
  const pg = usePage(linhas);
  return (
    <>
      <div className="scroll">
        <table className="mon-tabela mon-tabela-atribuidas">
        <thead>
          <tr>
            <th className="ctr">Tempo na fila</th>
            <th className="ctr">Tempo de 1ª resposta</th>
            <th className="ctr">Tempo de atendimento</th>
            <th className="ctr">Ticket</th>
            <th>Contato</th>
            <th>Fila</th>
            <th>Atendente</th>
            <th className="ctr">Ações</th>
          </tr>
        </thead>
        <tbody>
          {linhas.length === 0 ? <tr><td colSpan={8}><VazioTickets filtrado={filtrado} /></td></tr> : pg.visiveis.map((l) => (
            <tr key={l.id} className={classeDaLinha(l)} onClick={() => aoAbrir(l.id)}>
              <td className="num">
                {durationMonitoring(l.inQueueSeg)}
                {l.queueRunning ? ' ⟳' : ''}
              </td>
              <td className="num">
                {durationMonitoring(l.firstResponseSeg)}
                {l.firstResponseRunning ? ' ⟳' : ''}
              </td>
              <td className="num">
                {/* Sem primeira resposta o tempo de atendimento ainda não existe: traço, como as demais células sem valor. */}
                {l.attendanceSeg === null ? '—' : durationMonitoring(l.attendanceSeg)}
              </td>
              <td className="num"><button type="button" className="mon-ticket" onClick={() => aoAbrir(l.id)}>{l.ticket}</button></td>
              <td className="who"><span className="mon-contato"><Icone nome="pessoa" tamanho={16} />{l.contactName}</span></td>
              <td>{l.queueName ?? '—'}</td>
              <td>{l.agentName ?? '—'}</td>
              <TicketActions linha={l} aguardando={false} aoAbrir={aoAbrir} aoAcionar={aoAcionar} />
            </tr>
          ))}
        </tbody>
        </table>
      </div>

      <Pagination layout="grade" state={pg} grade="open-tickets-grid" />
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
  filtrado,
  aoAbrir,
  aoAcionar,
}: {
  linhas: readonly ConversationOpenRow[];
  filtrado: boolean;
  aoAbrir: AbrirDetalhe;
  aoAcionar: AoAcionar;
}) {
  const pg = usePage(linhas);
  return (
    <>
      <div className="scroll">
        <table className="mon-tabela mon-tabela-aguardando">
        <thead>
          <tr>
            <th className="ctr">Tempo na fila</th>
            <th className="ctr">Prioridade</th>
            <th className="ctr">Ticket</th>
            <th>Contato</th>
            <th>Fila</th>
            <th>Atendente</th>
            <th className="ctr">Ações</th>
          </tr>
        </thead>
        <tbody>
          {linhas.length === 0 ? <tr><td colSpan={7}><VazioTickets filtrado={filtrado} /></td></tr> : pg.visiveis.map((l) => (
            <tr key={l.id} className={classeDaLinha(l)} onClick={() => aoAbrir(l.id)}>
              <td className="num">
                {durationMonitoring(l.inQueueSeg)}
                {l.queueRunning ? ' ⟳' : ''}
              </td>
              <td className="num">{LABELS_PRIORITY[l.priority as LevelPriority] ?? l.priority}</td>
              <td className="num"><button type="button" className="mon-ticket" onClick={() => aoAbrir(l.id)}>{l.ticket}</button></td>
              <td className="who"><span className="mon-contato"><Icone nome="pessoa" tamanho={16} />{l.contactName}</span></td>
              <td>{l.queueName ?? '—'}</td>
              <td>{l.agentName ?? '—'}</td>
              <TicketActions linha={l} aguardando={true} aoAbrir={aoAbrir} aoAcionar={aoAcionar} />
            </tr>
          ))}
        </tbody>
        </table>
      </div>
      <Pagination layout="grade" state={pg} grade="waiting-tickets-grid" />
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
            <th className="ctr">Tickets em atendimento</th>
            <th className="ctr">Tempo médio de resposta</th>
            <th className="ctr">Tempo médio de atendimento</th>
            <th className="ctr">Ações</th>
          </tr>
        </thead>
        <tbody>
          {agents.length === 0 ? <tr><td colSpan={5}><WithoutData /></td></tr> : pg.visiveis.map((a) => (
            <tr key={a.id}>
              <td className="who">{a.name}</td>
              <td className="num">{numero(a.ativas)}</td>
              <td className="num">{durationMonitoring(a.timeMediumResponseSeg)}</td>
              <td className="num">{durationMonitoring(a.timeMediumAttendanceSeg)}</td>
              <ActionViewConversations filter={filter} agentId={a.id} />
            </tr>
          ))}
        </tbody>
        </table>
      </div>
      <Pagination layout="grade" state={pg} grade="attendants-grid" />
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
            <th className="ctr">Tickets aguardando</th>
            <th className="ctr">Tickets em atendimento</th>
            <th className="ctr">Tempo médio de espera</th>
            <th className="ctr">Tempo médio de resposta</th>
            <th className="ctr">Tempo médio de atendimento</th>
          </tr>
        </thead>
        <tbody>
          {queues.length === 0 ? <tr><td colSpan={6}><WithoutData /></td></tr> : pg.visiveis.map((f) => (
            <tr
              key={f.id}
              className={f.atendentesOnline === 0 && f.inQueue > 0 ? 'critico' : undefined}
            >
              <td className="who">{f.name}</td>
              <td className="num">{numero(f.inQueue)}</td>
              <td className="num">{numero(f.emAtendimento)}</td>
              <td className="num">{durationMonitoring(f.timeMediumInQueueSeg)}</td>
              <td className="num">{durationMonitoring(f.tempoMedioRespostaSeg)}</td>
              <td className="num">{durationMonitoring(f.tempoMedioAtendimentoSeg)}</td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
      <Pagination layout="grade" state={pg} grade="teams-grid" />
    </>
  );
}

/**
 * The Tags sheet asks for finished tickets, but the tag query returns `abertas`, open conversations with that tag. Do not relabel a different metric to fit available data; show a dash until closed-by-tag data exists.
 */
function TabelaTags({ etiquetas }: { etiquetas: Monitoring['labels'] }) {
  const pg = usePage(etiquetas);
  return (
    <>
      <div className="scroll">
        <table className="mon-tabela mon-tabela-tags">
        <thead>
          <tr>
            <th>Tag</th>
            <th className="ctr">Tickets finalizados</th>
            <th className="ctr">Tempo médio de atendimento</th>
          </tr>
        </thead>
        <tbody>
          {etiquetas.length === 0 ? <tr><td colSpan={3}><WithoutData /></td></tr> : pg.visiveis.map((e) => (
            <tr key={e.id}>
              <td className="who">{e.name}</td>
              <td className="num">{numero(e.finalizadas)}</td>
              <td className="num">{durationMonitoring(e.tempoMedioAtendimentoSeg)}</td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
      <Pagination layout="grade" state={pg} grade="tags-grid" />
    </>
  );
}

type Previa = {
  id: string;
  ticket: string;
  contactName: string;
  queueName: string | null;
  agentName: string | null;
  itens: { id: string; at: string; type: 'mensagem' | 'nota'; direction?: string; texto: string; autor?: string | null }[];
};

/**
 * Side panel of an open ticket (reference side panel `thread-message-sidebar`, captures
 * `monitoramento-ticket-aberto-*` and `monitoramento-ticket-falar-com-atendente`): title and
 * contact on the left, Transferir ticket / Finalizar ticket / close on the right, then the
 * Atendimento and Informações tabs. Opening it through Falar com atendente adds the middle tab with
 * the message field.
 */
function ConversationPreview({
  id,
  linha,
  abaInicial,
  aoFechar,
  aoAcionar,
}: {
  id: string;
  linha: ConversationOpenRow | undefined;
  abaInicial: AbaDetalhe;
  aoFechar: () => void;
  aoAcionar: AoAcionar;
}) {
  const read = useRead<Previa>(`/v1/management/monitoring/conversations/${id}`);
  const [aba, setAba] = useState<AbaDetalhe>(abaInicial);
  const painel = useRef<HTMLElement>(null);

  useEffect(() => {
    painel.current?.focus();
  }, []);

  const abas: { chave: AbaDetalhe; rotulo: string }[] = [
    { chave: 'atendimento', rotulo: 'Atendimento' },
    ...(abaInicial === 'falar' ? [{ chave: 'falar' as const, rotulo: 'Falar com atendente' }] : []),
    { chave: 'informacoes', rotulo: 'Informações' },
  ];

  function navegarAbas(evento: KeyboardEvent<HTMLDivElement>) {
    const passo = evento.key === 'ArrowRight' ? 1 : evento.key === 'ArrowLeft' ? -1 : 0;
    if (!passo) return;
    evento.preventDefault();
    const proxima = abas[(abas.findIndex((a) => a.chave === aba) + passo + abas.length) % abas.length]!;
    setAba(proxima.chave);
    document.getElementById(`mon-previa-aba-${proxima.chave}`)?.focus();
  }

  const numeroDoTicket = linha?.ticket ?? read.data?.ticket;

  return (
    <>
      <div className="mon-previa-fundo" onClick={aoFechar} />
      <aside
        ref={painel}
        tabIndex={-1}
        className="mon-previa"
        role="dialog"
        aria-modal="true"
        aria-label="Conversa"
        onKeyDown={(evento) => {
          if (evento.key === 'Escape') aoFechar();
        }}
      >
        <header>
          <div className="mon-previa-titulo">
            <h3>{numeroDoTicket ? `Ticket ${numeroDoTicket}` : 'Conversa'}</h3>
            {read.data ? <p>Conversa com {read.data.contactName}</p> : null}
          </div>
          <div className="mon-previa-acoes">
            {linha ? (
              <>
                <button type="button" className="mon-previa-botao mon-acao" data-tooltip="Transferir ticket" data-tooltip-pos="baixo" aria-label="Transferir ticket" onClick={() => aoAcionar('transferir', linha)}>
                  <IconeTransferir tamanho={24} />
                </button>
                <button type="button" className="mon-previa-botao mon-acao" data-tooltip="Finalizar ticket" data-tooltip-pos="baixo" aria-label="Finalizar ticket" onClick={() => aoAcionar('finalizar', linha)}>
                  <IconeFinalizar tamanho={24} />
                </button>
              </>
            ) : null}
            <button type="button" className="mon-previa-fechar" aria-label="Fechar conversa" onClick={aoFechar}><Icone nome="x" tamanho={20} /></button>
          </div>
        </header>
        <div className="mon-previa-abas" role="tablist" aria-label="Seções do ticket" onKeyDown={navegarAbas}>
          {abas.map((a) => (
            <button
              key={a.chave}
              id={`mon-previa-aba-${a.chave}`}
              type="button"
              role="tab"
              aria-selected={aba === a.chave}
              aria-controls="mon-previa-secao"
              tabIndex={aba === a.chave ? 0 : -1}
              onClick={() => setAba(a.chave)}
            >
              {a.rotulo}
            </button>
          ))}
        </div>
        <div id="mon-previa-secao" role="tabpanel" aria-labelledby={`mon-previa-aba-${aba}`} className="mon-previa-secao">
          {aba === 'informacoes' ? (
            <dl className="mon-previa-dados">
              <h4>Dados do atendimento</h4>
              <dt>Nome do contato</dt>
              <dd>{read.data?.contactName ?? '—'}</dd>
              <dt>Atendente</dt>
              <dd>{read.data?.agentName ?? '—'}</dd>
              <dt>Fila</dt>
              <dd>{read.data?.queueName ?? '—'}</dd>
            </dl>
          ) : (
            <div className="mon-preview-history" aria-live="polite">
              {read.isLoading ? <p>Carregando conversa…</p> : null}
              {read.isError ? <p>Não foi possível carregar a conversa.</p> : null}
              {read.data?.itens.map((item) => (
                item.type === 'nota' ? <p key={item.id} className="mon-previa-nota"><b>{item.autor ?? 'Nota interna'}</b>{item.texto}</p> :
                <div key={item.id} className={item.direction === 'entrada' ? 'mon-balao inbound' : 'mon-balao saida'}>
                  <p>{item.texto || 'Conteúdo sem texto'}</p><small>{item.autor ?? ''}</small>
                </div>
              ))}
            </div>
          )}
        </div>
        {aba === 'falar' ? (
          <div className="mon-preview-composer">
            <textarea disabled placeholder="Digite sua mensagem aqui" aria-label="Falar com atendente" aria-describedby="mon-falar-aviso" rows={3} />
            <p id="mon-falar-aviso" role="status">Este recurso será liberado em breve para este fluxo.</p>
          </div>
        ) : null}
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
  const [detalhe, setDetalhe] = useState<{ id: string; aba: AbaDetalhe } | null>(null);
  const [acao, setAcao] = useState<{ tipo: AcaoTicket; linha: ConversationOpenRow } | null>(null);
  const abrirDetalhe: AbrirDetalhe = (id, aba = 'atendimento') => setDetalhe({ id, aba });
  const aoAcionar: AoAcionar = (tipo, linha) => setAcao({ tipo, linha });
  const termo = search.trim().toLowerCase();
  const filtrado = Boolean(termo || filter.contact?.trim() || filter.status);

  /*
   * `carga` already includes each agent's status, so the `Status do atendente` filter needs no extra request.
   */
  const stateByAgent = new Map(monitoring.carga.map((a) => [a.id, a.state]));

  const casa = (l: ConversationOpenRow) => {
    /*
     * Search inside this card uses the ticket number only; Contact has its own field in the filter strip.
     */
    if (termo && !l.ticket.toLowerCase().includes(termo)) return false;
    return matchesListFilters(
      { contactName: l.contactName, agentState: l.agentId ? stateByAgent.get(l.agentId) : undefined },
      filter,
    );
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
    labels: monitoring.labels,
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

      {aba === 'aguardando' ? <TabelaAguardando linhas={aguardando} filtrado={filtrado} aoAbrir={abrirDetalhe} aoAcionar={aoAcionar} /> : null}
      {aba === 'atribuido' ? <TabelaAtribuidas linhas={atribuidas} filtrado={filtrado} aoAbrir={abrirDetalhe} aoAcionar={aoAcionar} /> : null}
      {aba === 'atendentes' ? (
        <TableAgents agents={monitoring.carga} filter={filter} />
      ) : null}
      {aba === 'filas' ? <TableQueues queues={monitoring.queues} /> : null}
      {aba === 'etiquetas' ? <TabelaTags etiquetas={monitoring.labels} /> : null}
      {detalhe ? (
        <ConversationPreview
          key={`${detalhe.id}-${detalhe.aba}`}
          id={detalhe.id}
          linha={monitoring.abertas.find((l) => l.id === detalhe.id)}
          abaInicial={detalhe.aba}
          aoFechar={() => setDetalhe(null)}
          aoAcionar={aoAcionar}
        />
      ) : null}
      {acao?.tipo === 'transferir' ? (
        <ModalTransferMonitoring linha={acao.linha} catalogos={actionCatalogs} aoFechar={() => setAcao(null)} />
      ) : null}
      {acao?.tipo === 'finalizar' ? <ModalFinishMonitoring linha={acao.linha} aoFechar={() => setAcao(null)} /> : null}
    </div>
  );
}
