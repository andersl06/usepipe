import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Botao, BotaoDeIcone, Campo, Card, Etiqueta, Icone } from '@pipe/ui';
import { Pagination, usePage } from '@pipe/ui/pagination';
import { useRead } from '../../lib/query';
import type { QueueRegistered, QueueRegisteredRule, Horarios } from '../../lib/registrations';
import { descreverRegra } from '../../lib/rule-queue';
import {
  queueUnlinkAgent,
  editQueue,
  deleteRuleQueue,
  falhaAoSalvar,
} from '../../lib/registrations-gravar';
import { priorityCreateRule, priorityDeleteRule } from '../../lib/agents-gravar';
import {
  NIVEIS_ATRIBUIVEIS,
  queueRules,
  rotuloDoNivel,
  type PriorityRule,
} from '../../lib/rules-priority';
import { Select } from '@pipe/ui/select';
import { useContact } from '../flow/contact';
import { attendanceBase } from '../operation/shell';
import { ConfirmModal } from '@pipe/ui/modal';

/**
 * Editing a queue — its OWN PAGE, not a modal.
 *
 * The source's `attendance.desk.queueManagement.edit` is `url:"/edit/:id"` (`FICHA-atendentes-filas-pausas.md` §a.1) — what the owner asked for. The anatomy follows §a.3: three sections in the order **Atendentes → Regras de Priorização → Tags**, with the literal text from `i18n.js`.
 *
 * **Tags was left out.** The source has "Gerenciar tags da fila", but in Pipe `etiqueta` is per TENANT, with no link to a queue (§e.7 of the ficha) — building that link is migration + domain + route + Desk consumption, and it's logged as a pending item, not invented here.
 *
 * **"Adicionar atendente" NAVIGATES, it doesn't open a form here.** The source proves this with the empty-state text itself (`noAttendantsBody`: "clicking Adicionar atendente redirects to the Equipe de atendimento page"). In Pipe, linking someone into the queue is the SAME save as batch "Editar atendente" (`POST .../filas/:id/atendentes`) — which is why the button goes to `atendentes/gestao`, not to a picker on this page.
 *
 * **"Dados da fila" is a section that's ours alone**, with no sub-route in the source: color, order, default capacity, schedule, and the "Ativa" toggle moved here from the creation modal (`atendentes-filas-formulario.tsx` already documented this).
 */
export function QueuePageEdit() {
  const { queueId } = useParams<{ queueId: string }>();
  const navegar = useNavigate();
  const { contact } = useContact();
  const base = attendanceBase(contact);

  const readQueues = useRead<{ queues: QueueRegistered[] }>('/v1/management/agents/queues');
  const readHours = useRead<Horarios & { fuso: string }>('/v1/management/rules/schedules');
  const readRules = useRead<PriorityRule[]>(
    '/v1/management/rules/priority',
  );
  const readRulesAttendance = useRead<{ regras: QueueRegisteredRule[] }>(
    '/v1/management/rules/attendance',
  );

  if (!readQueues.data || !readHours.data || !readRules.data || !readRulesAttendance.data) return null;

  const queue = readQueues.data.queues.find((f) => f.id === queueId);
  if (!queue) {
    return (
      <div className="empty">
        <b>Fila não encontrada</b>
        <p>
          <button type="button" className="btn" onClick={() => navegar(`${base}/queue-management`)}>
            Voltar para Filas de atendimento
          </button>
        </p>
      </div>
    );
  }

  return (
    <>
      <QueueHeader queue={queue} base={base} />
      <SectionAgents queue={queue} base={base} />
      <SectionRulesAttendance
        regras={readRulesAttendance.data.regras.filter((r) => r.queueDestinationId === queue.id)}
        base={base}
      />
      <PrioritySectionRules queue={queue} regras={readRules.data} />
      <SectionPendente
        titulo="Tags da fila"
        descricao="Adicione ou edite as tags disponíveis para os atendentes desta fila."
      />
      <SectionPendente
        titulo="Encerramento automático de tickets"
        descricao="Encerre automaticamente os tickets por inatividade"
        interruptor
      />
      <QueueData queue={queue} horarios={readHours.data.horarios} />
    </>
  );
}

/* ---------------------------------------------------------------- cabeçalho */

/** Voltar, nome da fila e lápis que renomeia no lugar. */
function QueueHeader({ queue, base }: { queue: QueueRegistered; base: string }) {
  const navegar = useNavigate();
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(queue.name);
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function renomear(evento: FormEvent) {
    evento.preventDefault();
    if (!nome.trim()) return;
    if (nome.trim() === queue.name) {
      setEditando(false);
      return;
    }
    setSalvando(true);
    setError(null);
    const resultado = await editQueue(queue.id, { nome: nome.trim() });
    setSalvando(false);
    if (resultado.ok) setEditando(false);
    else setError(falhaAoSalvar(resultado.error));
  }

  return (
    <div className="board-head fila-cab">
      <BotaoDeIcone
        nome="esquerda"
        rotulo="Voltar para Filas de atendimento"
        onClick={() => navegar(`${base}/queue-management`)}
      />
      {editando ? (
        <form className="fila-cab-nome" onSubmit={(e) => void renomear(e)}>
          <Campo
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            aria-label="Nome da fila"
            autoFocus
            disabled={salvando}
          />
          <Botao
            type="button"
            onClick={() => {
              setNome(queue.name);
              setError(null);
              setEditando(false);
            }}
            disabled={salvando}
          >
            Cancelar
          </Botao>
          <Botao type="submit" variante="primario" disabled={salvando || !nome.trim()}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Botao>
        </form>
      ) : (
        <>
          <h2>{queue.name}</h2>
          <BotaoDeIcone nome="lapis" rotulo="Editar nome da fila" onClick={() => setEditando(true)} />
        </>
      )}
      {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}
    </div>
  );
}

/* -------------------------------------------------------- dados da fila */

function QueueData({
  queue,
  horarios,
}: {
  queue: QueueRegistered;
  horarios: readonly { id: string; name: string }[];
}) {
  const [nome, setNome] = useState(queue.name);
  const [cor, setCor] = useState(queue.color ?? '#5b5fed');
  const [capacity, setCapacity] = useState(String(queue.capacityDefault));
  const [order, setOrder] = useState(String(queue.order));
  const [horarioId, setHorarioId] = useState(queue.scheduleId ?? '');
  const [active, setActive] = useState(queue.ativa);
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mudou =
    nome.trim() !== queue.name ||
    cor !== (queue.color ?? '#5b5fed') ||
    capacity !== String(queue.capacityDefault) ||
    order !== String(queue.order) ||
    horarioId !== (queue.scheduleId ?? '') ||
    active !== queue.ativa;

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (!mudou || !nome.trim()) return;
    setSalvando(true);
    setError(null);
    const resultado = await editQueue(queue.id, {
      nome: nome.trim(),
      cor,
      capacityDefault: Number(capacity),
      order: Number(order),
      horarioId: horarioId || null,
      active,
    });
    setSalvando(false);
    if (!resultado.ok) setError(falhaAoSalvar(resultado.error));
  }

  return (
    <Card titulo="Dados da fila">
      <form className="form-registration" onSubmit={(e) => void salvar(e)}>
        <div className="form-linha">
          <label className="form-campo" style={{ flexBasis: '280px' }}>
            <span className="sub">Nome</span>
            <Campo value={nome} onChange={(e) => setNome(e.target.value)} required disabled={salvando} />
          </label>
          <label className="form-campo" style={{ flexBasis: '80px', flexGrow: 0 }}>
            <span className="sub">Cor</span>
            <input
              type="color"
              value={cor}
              onChange={(e) => setCor(e.target.value)}
              disabled={salvando}
              className="campo-cor"
            />
          </label>
          <label className="form-campo" style={{ flexBasis: '160px', flexGrow: 0 }}>
            <span className="sub">Capacidade padrão</span>
            <Campo
              type="number"
              min={1}
              max={200}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              disabled={salvando}
            />
          </label>
          <label className="form-campo" style={{ flexBasis: '120px', flexGrow: 0 }}>
            <span className="sub">Ordem</span>
            <Campo
              type="number"
              min={0}
              value={order}
              onChange={(e) => setOrder(e.target.value)}
              disabled={salvando}
            />
          </label>
        </div>

        <div className="form-linha">
          <label className="form-campo" style={{ flexBasis: '260px' }}>
            <span className="sub">Horário</span>
            <Select
              value={horarioId}
              onChange={(e) => setHorarioId(e.target.value)}
              disabled={salvando}
              aria-label="Horário"
            >
              <option value="">Sem horário — atende 24×7</option>
              {horarios.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </Select>
          </label>

          <label className="form-caixa" style={{ alignSelf: 'flex-end' }}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={salvando} />
            <span className="sub">Ativa</span>
          </label>
        </div>

        {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}

        <div className="cl-actions">
          <Botao type="submit" variante="primario" disabled={salvando || !mudou || !nome.trim()}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Botao>
        </div>
      </form>
    </Card>
  );
}

/* ----------------------------------------------------------- atendentes */

function inicial(a: { name: string; email: string }): string {
  const partes = a.name.trim().split(/\s+/);
  if (a.name === a.email || partes.length < 2) return (partes[0]?.[0] ?? '?').toUpperCase();
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase();
}

function SectionAgents({ queue, base }: { queue: QueueRegistered; base: string }) {
  const navegar = useNavigate();
  const [search, setSearch] = useState('');
  const [marcados, setMarcados] = useState<ReadonlySet<string>>(new Set());
  const [paraRemover, setParaRemover] = useState<{ id: string; nome: string } | null>(null);
  const [removendo, setRemovendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alvo = search.trim().toLowerCase();
  const filtrados = alvo
    ? queue.agents.filter((a) => a.name.toLowerCase().includes(alvo) || a.email.toLowerCase().includes(alvo))
    : queue.agents;
  const pagina = usePage(filtrados, 5);
  const todosMarcados = filtrados.length > 0 && filtrados.every((a) => marcados.has(a.id));

  async function remover() {
    if (!paraRemover) return;
    setRemovendo(true);
    setError(null);
    const resultado = await queueUnlinkAgent(queue.id, paraRemover.id);
    setRemovendo(false);
    if (resultado.ok) setParaRemover(null);
    else setError(falhaAoSalvar(resultado.error));
  }

  return (
    <Card
      titulo="Atendentes atribuídos"
      actions={
        <Botao variante="primario" icone="mais" onClick={() => navegar(`${base}/team`)}>
          Adicionar atendentes
        </Botao>
      }
    >
      <p className="sub">Defina os atendentes que irão atender nesta fila</p>
      {queue.agents.length === 0 ? (
        <div className="empty">
          <b>Ops! Essa fila não possui nenhum atendente.</b>
          <p>
            Ao clicar em <b>Adicionar atendentes</b>, um direcionamento será feito para a página{' '}
            <b>Equipe de atendimento</b>.
          </p>
        </div>
      ) : (
        <>
          <div className="search-top">
            <Icone nome="busca" tamanho={20} />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                pagina.setPage(1);
              }}
              placeholder="Buscar por nome ou e-mail"
              aria-label="Buscar por nome ou e-mail"
            />
          </div>
          <label className="form-caixa fila-selecionar-todos">
            <input
              type="checkbox"
              checked={todosMarcados}
              onChange={(e) => setMarcados(e.target.checked ? new Set(filtrados.map((a) => a.id)) : new Set())}
            />
            <span className="sub">Selecionar todos</span>
          </label>

          {filtrados.length === 0 ? (
            <div className="empty">
              <b>Atendente não encontrado :(</b>
              <p>Não há atendente cadastrados com esse nome.</p>
            </div>
          ) : (
            pagina.visiveis.map((a) => (
              <article key={a.id} className="card-list fila-atendente">
                <input
                  type="checkbox"
                  aria-label={`Selecionar ${a.name}`}
                  checked={marcados.has(a.id)}
                  onChange={(e) => {
                    const novo = new Set(marcados);
                    if (e.target.checked) novo.add(a.id);
                    else novo.delete(a.id);
                    setMarcados(novo);
                  }}
                />
                <span className="fila-avatar" aria-hidden="true">
                  {inicial(a)}
                </span>
                <div className="cl-campos" style={{ '--cl-colunas': 2 } as React.CSSProperties}>
                  <div className="cl-campo">
                    <span className="r">Nome</span>
                    <span className="v" title={a.name}>
                      {a.name}
                    </span>
                  </div>
                  <div className="cl-campo">
                    <span className="r">E-mail</span>
                    <span className="v" title={a.email}>
                      {a.email}
                    </span>
                  </div>
                </div>
                <div className="cl-actions">
                  <BotaoDeIcone
                    nome="x"
                    rotulo={`Excluir ${a.name} da fila`}
                    onClick={() => setParaRemover({ id: a.id, nome: a.name })}
                  />
                </div>
              </article>
            ))
          )}
          <Pagination layout="grade" afastado state={pagina} />
        </>
      )}

      {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}

      <ConfirmModal
        aberto={paraRemover !== null}
        titulo="Você deseja remover este atendente da fila?"
        message={<>{paraRemover?.nome}</>}
        confirmando={removendo}
        rotuloConfirmar="Excluir"
        onConfirmar={() => void remover()}
        onCancelar={() => setParaRemover(null)}
      />
    </Card>
  );
}

/* ------------------------------------------------- regras de atendimento */

function SectionRulesAttendance({
  regras,
  base,
}: {
  regras: readonly QueueRegisteredRule[];
  base: string;
}) {
  const navegar = useNavigate();
  const pagina = usePage(regras, 5);
  const [paraExcluir, setParaExcluir] = useState<QueueRegisteredRule | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function excluir() {
    if (!paraExcluir) return;
    setExcluindo(true);
    setError(null);
    const resultado = await deleteRuleQueue(paraExcluir.id);
    setExcluindo(false);
    if (resultado.ok) setParaExcluir(null);
    else setError(falhaAoSalvar(resultado.error));
  }

  return (
    <Card
      titulo="Regras de Atendimento"
      actions={
        <Botao variante="primario" icone="mais" onClick={() => navegar(`${base}/rules`)}>
          Criar regra
        </Botao>
      }
    >
      <p className="sub">Defina as regras de atendimento para a fila</p>
      {pagina.visiveis.map((r) => (
        <article key={r.id} className="card-list">
          <span />
          <div className="cl-campos" style={{ '--cl-colunas': 2 } as React.CSSProperties}>
            <div className="cl-campo">
              <span className="r">Nome da regra</span>
              <span className="v" title={r.name}>
                {r.name}
              </span>
            </div>
            <div className="cl-campo">
              <span className="r">Regra</span>
              <span className="v" title={descreverRegra(r)}>
                {descreverRegra(r)}
              </span>
            </div>
          </div>
          <div className="cl-actions">
            <BotaoDeIcone nome="lapis" rotulo={`Editar a regra ${r.name}`} onClick={() => navegar(`${base}/rules`)} />
            <BotaoDeIcone nome="x" rotulo={`Excluir a regra ${r.name}`} onClick={() => setParaExcluir(r)} />
          </div>
        </article>
      ))}
      <Pagination layout="grade" afastado state={pagina} />
      {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}
      <ConfirmModal
        aberto={paraExcluir !== null}
        titulo="Confirmar exclusão"
        message={<>Excluir a regra "{paraExcluir?.name}"? Esta ação não pode ser desfeita.</>}
        confirmando={excluindo}
        onConfirmar={() => void excluir()}
        onCancelar={() => setParaExcluir(null)}
      />
    </Card>
  );
}

/* ------------------------------------------- recursos ainda sem regra */

/** Seção que a Blip mostra e o Pipe ainda não grava por fila. */
function SectionPendente({
  titulo,
  descricao,
  interruptor = false,
}: {
  titulo: string;
  descricao: string;
  interruptor?: boolean;
}) {
  return (
    <Card titulo={titulo}>
      <p className="sub">{descricao}</p>
      {interruptor ? (
        <button
          type="button"
          className="interruptor"
          role="switch"
          aria-checked={false}
          aria-label={titulo}
          disabled
        >
          <span className="interruptor-bolinha" />
        </button>
      ) : (
        <Campo placeholder="Insira as tags separando por vírgulas" disabled aria-label={titulo} />
      )}
      <p className="note">Este recurso será liberado em breve para este fluxo.</p>
    </Card>
  );
}

/* ------------------------------------------------- priority rules */

function PrioritySectionRules({
  queue,
  regras,
}: {
  queue: QueueRegistered;
  regras: readonly PriorityRule[];
}) {
  const [criando, setCriando] = useState(false);
  const [paraExcluir, setParaExcluir] = useState<{ id: string; nome: string } | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ofQueue = queueRules(regras, queue.id);

  async function excluir() {
    if (!paraExcluir) return;
    setExcluindo(true);
    setError(null);
    const resultado = await priorityDeleteRule(paraExcluir.id);
    setExcluindo(false);
    if (resultado.ok) setParaExcluir(null);
    else setError(falhaAoSalvar(resultado.error));
  }

  return (
    <Card
      titulo="Regras de Priorização"
      actions={
        <Botao variante="primario" icone="mais" onClick={() => setCriando(true)} disabled={criando}>
          Criar regra
        </Botao>
      }
    >
      <p className="sub">
        Defina a prioridade para todos os atendimentos da fila ou crie condições para a priorização
      </p>
      {criando ? (
        <PriorityFormRule queueId={queue.id} onFechar={() => setCriando(false)} />
      ) : null}

      {ofQueue.length === 0 ? (
        <div className="empty">
          <b>Esta fila ainda não tem regras de priorização!</b>
          <p>Crie uma regra para definir a prioridade de atendimento dos clientes.</p>
        </div>
      ) : (
        ofQueue.map((r) => (
          <div key={r.id} className="form-linha linha-lista">
            <span className="sub">
              {r.name} · {rotuloDoNivel(r.level)}
            </span>
            <BotaoDeIcone
              nome="x"
              rotulo={`Excluir a regra ${r.name}`}
              onClick={() => setParaExcluir({ id: r.id, nome: r.name })}
            />
          </div>
        ))
      )}

      {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}

      <ConfirmModal
        aberto={paraExcluir !== null}
        titulo="Confirmar exclusão"
        message={<>Excluir a regra "{paraExcluir?.nome}"? Esta ação não pode ser desfeita.</>}
        confirmando={excluindo}
        onConfirmar={() => void excluir()}
        onCancelar={() => setParaExcluir(null)}
      />
    </Card>
  );
}

function PriorityFormRule({ queueId, onFechar }: { queueId: string; onFechar: () => void }) {
  const [nome, setNome] = useState('');
  const [nivel, setNivel] = useState(NIVEIS_ATRIBUIVEIS[0] ?? '');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(evento: FormEvent) {
    evento.preventDefault();
    if (!nome.trim()) return;
    setEnviando(true);
    setError(null);
    const resultado = await priorityCreateRule({
      nome: nome.trim(),
      nivel,
      scopeType: 'fila',
      scopeId: queueId,
    });
    setEnviando(false);
    if (resultado.ok) onFechar();
    else setError(resultado.error);
  }

  return (
    <form className="form-registration" onSubmit={(e) => void create(e)}>
      <div className="form-linha">
        <label className="form-campo">
          <span className="sub">Nome da regra de priorização</span>
          <Campo value={nome} onChange={(e) => setNome(e.target.value)} required disabled={enviando} />
        </label>
        <label className="form-campo" style={{ flexBasis: '200px' }}>
          <span className="sub">Nível</span>
          <Select value={nivel} onChange={(e) => setNivel(e.target.value)} disabled={enviando} aria-label="Nível">
            {NIVEIS_ATRIBUIVEIS.map((n) => (
              <option key={n} value={n}>
                {rotuloDoNivel(n)}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}

      <div className="cl-actions">
        <Botao type="button" onClick={onFechar} disabled={enviando}>
          Cancelar
        </Botao>
        <Botao type="submit" variante="primario" disabled={enviando || !nome.trim()}>
          {enviando ? 'Criando…' : 'Criar'}
        </Botao>
      </div>
    </form>
  );
}
