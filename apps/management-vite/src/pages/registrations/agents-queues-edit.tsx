import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Botao, BotaoDeIcone, Campo, Card, Etiqueta, Icone, Illustration } from '@pipe/ui';
import { Pagination, usePage } from '@pipe/ui/pagination';
import { useRead } from '../../lib/query';
import { withFlow } from '../../lib/flow-scope';
import type { QueueRegistered, QueueRegisteredRule } from '../../lib/registrations';
import { AddAttendantsModal, RuleAttendanceForm, RulePriorityForm } from './queue-edit-forms';
import {
  queueUnlinkAgent,
  editQueue,
  deleteRuleQueue,
  toggleRuleQueueActive,
  falhaAoSalvar,
} from '../../lib/registrations-gravar';
import { priorityDeleteRule } from '../../lib/agents-gravar';
import { queueRules, rotuloDoNivel, type PriorityRule } from '../../lib/rules-priority';
import { useContact } from '../flow/contact';
import { attendanceBase } from '../operation/shell';
import { ConfirmModal } from '@pipe/ui/modal';

/**
 * Editing a queue — its OWN PAGE, not a modal.
 *
 * Served at the SAME path as the list (`queue-management`), like the Blip, which keeps the URL while editing; the queue id travels in `?fila=`, so reload and deep links still work. The anatomy follows the live Blip capture: five stacked cards (Atendentes, Regras de Atendimento, Regras de Priorização, Tags, Encerramento automático).
 *
 * **Tags and automatic closing are shown disabled.** The Blip has them per queue, but in Pipe `etiqueta` is per TENANT, with no link to a queue (§e.7 of the ficha), and the `fila` table has no column for either: they wait for a migration, so the cards keep the Blip layout but stay off.
 *
 * **Everything else happens in this page.** "Adicionar atendentes" opens a modal (assigns existing tenant users by e-mail through `POST .../filas/:id/atendentes`; it never creates accounts) and "Criar regra" opens an inline form that replaces the list inside the card, as in the Blip.
 */
export function QueuePageEdit() {
  const queueId = useSearchParams()[0].get('fila');
  const navegar = useNavigate();
  const { contact } = useContact();
  const base = attendanceBase(contact);

  const readQueues = useRead<{ queues: QueueRegistered[] }>(
    withFlow('/v1/management/agents/queues', contact.id),
  );
  const readRules = useRead<PriorityRule[]>(withFlow('/v1/management/rules/priority', contact.id));
  const readRulesAttendance = useRead<{ regras: QueueRegisteredRule[] }>(
    withFlow('/v1/management/rules/attendance', contact.id),
  );

  if (!readQueues.data || !readRules.data || !readRulesAttendance.data) return null;

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
      <SectionAgents queue={queue} />
      <SectionRulesAttendance queue={queue} todasAsRegras={readRulesAttendance.data.regras} />
      <PrioritySectionRules queue={queue} regras={readRules.data} />
      <SectionTags />
      <SectionAutoClose />
    </>
  );
}

/* ---------------------------------------------------------------- cabeçalho */

/** Voltar, nome da fila e lápis que renomeia no lugar. */
function QueueHeader({ queue, base }: { queue: QueueRegistered; base: string }) {
  const { contact } = useContact();
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
    const resultado = await editQueue(contact.id, queue.id, { nome: nome.trim() });
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
          <BotaoDeIcone
            nome="lapis"
            rotulo="Editar nome da fila"
            onClick={() => setEditando(true)}
          />
        </>
      )}
      {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}
    </div>
  );
}

/* ----------------------------------------------------------- atendentes */

function inicial(a: { name: string; email: string }): string {
  const partes = a.name.trim().split(/\s+/);
  if (a.name === a.email || partes.length < 2) return (partes[0]?.[0] ?? '?').toUpperCase();
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase();
}

function SectionAgents({ queue }: { queue: QueueRegistered }) {
  const { contact } = useContact();
  const [adicionando, setAdicionando] = useState(false);
  const [search, setSearch] = useState('');
  const [marcados, setMarcados] = useState<ReadonlySet<string>>(new Set());
  const [paraRemover, setParaRemover] = useState<{ id: string; nome: string } | null>(null);
  const [removendo, setRemovendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alvo = search.trim().toLowerCase();
  const filtrados = alvo
    ? queue.agents.filter(
        (a) => a.name.toLowerCase().includes(alvo) || a.email.toLowerCase().includes(alvo),
      )
    : queue.agents;
  const pagina = usePage(filtrados, 5);
  const todosMarcados = filtrados.length > 0 && filtrados.every((a) => marcados.has(a.id));

  async function remover() {
    if (!paraRemover) return;
    setRemovendo(true);
    setError(null);
    const resultado = await queueUnlinkAgent(contact.id, queue.id, paraRemover.id);
    setRemovendo(false);
    if (resultado.ok) setParaRemover(null);
    else setError(falhaAoSalvar(resultado.error));
  }

  return (
    <Card
      className="fila-cartao"
      titulo="Atendentes atribuídos"
      actions={
        <Botao variante="primario" icone="mais" onClick={() => setAdicionando(true)}>
          Adicionar atendentes
        </Botao>
      }
    >
      <p className="sub">Defina os atendentes que irão atender nesta fila</p>
      {queue.agents.length === 0 ? (
        <div className="empty">
          <b>Ops! Essa fila não possui nenhum atendente.</b>
          <p>
            Clique em <b>Adicionar atendentes</b> para atribuir pessoas a esta fila.
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
              onChange={(e) =>
                setMarcados(e.target.checked ? new Set(filtrados.map((a) => a.id)) : new Set())
              }
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

      {adicionando ? (
        <AddAttendantsModal queue={queue} onFechar={() => setAdicionando(false)} />
      ) : null}

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
  queue,
  todasAsRegras,
}: {
  queue: QueueRegistered;
  todasAsRegras: readonly QueueRegisteredRule[];
}) {
  const { contact } = useContact();
  const [search, setSearch] = useState('');
  const [formulario, setFormulario] = useState<'novo' | QueueRegisteredRule | null>(null);
  const [paraExcluir, setParaExcluir] = useState<QueueRegisteredRule | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const regras = todasAsRegras.filter((r) => r.queueDestinationId === queue.id);
  const alvo = search.trim().toLowerCase();
  const filtradas = alvo ? regras.filter((r) => r.name.toLowerCase().includes(alvo)) : regras;
  const pagina = usePage(filtradas, 5);

  async function excluir() {
    if (!paraExcluir) return;
    setExcluindo(true);
    setError(null);
    const resultado = await deleteRuleQueue(contact.id, paraExcluir.id);
    setExcluindo(false);
    if (resultado.ok) setParaExcluir(null);
    else setError(falhaAoSalvar(resultado.error));
  }

  async function alternar(regra: QueueRegisteredRule) {
    setError(null);
    const resultado = await toggleRuleQueueActive(contact.id, regra.id);
    if (!resultado.ok) setError(falhaAoSalvar(resultado.error));
  }

  return (
    <Card
      className="fila-cartao"
      titulo="Regras de Atendimento"
      actions={
        <Botao
          variante="primario"
          icone="mais"
          onClick={() => setFormulario('novo')}
          disabled={formulario !== null}
        >
          Criar regra
        </Botao>
      }
    >
      <p className="sub">Defina as regras de atendimento para a fila</p>
      {formulario !== null ? (
        <RuleAttendanceForm
          queue={queue}
          regra={formulario === 'novo' ? undefined : formulario}
          todasAsRegras={todasAsRegras}
          onFechar={() => setFormulario(null)}
        />
      ) : (
        <>
          {regras.length > 0 ? (
            <div className="search-top">
              <Icone nome="busca" tamanho={20} />
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  pagina.setPage(1);
                }}
                placeholder="Buscar regra"
                aria-label="Buscar regra"
              />
            </div>
          ) : null}
          {pagina.visiveis.map((r) => (
            <article key={r.id} className="card-list fila-regra">
              <div className="cl-campos" style={{ '--cl-colunas': 1 } as React.CSSProperties}>
                <div className="cl-campo">
                  <span className="r">Nome da regra</span>
                  <span className="v" title={r.name}>
                    {r.name}
                  </span>
                </div>
              </div>
              <div className="cl-actions">
                <BotaoDeIcone
                  nome="lapis"
                  rotulo={`Editar a regra ${r.name}`}
                  onClick={() => setFormulario(r)}
                />
                <BotaoDeIcone
                  nome="x"
                  rotulo={`Excluir a regra ${r.name}`}
                  onClick={() => setParaExcluir(r)}
                />
                <button
                  type="button"
                  className="interruptor"
                  role="switch"
                  aria-checked={r.active}
                  aria-label={r.active ? `Desativar a regra ${r.name}` : `Ativar a regra ${r.name}`}
                  onClick={() => void alternar(r)}
                >
                  <span className="interruptor-bolinha" />
                </button>
              </div>
            </article>
          ))}
          {regras.length > 0 && filtradas.length === 0 ? (
            <div className="empty">
              <b>Nenhum resultado encontrado</b>
              <p>Não encontramos nenhuma regra a partir da pesquisa realizada.</p>
            </div>
          ) : null}
          {regras.length > 0 ? <Pagination layout="grade" afastado state={pagina} /> : null}
        </>
      )}
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

const EM_BREVE = 'Este recurso será liberado em breve para este fluxo.';

/** Cartão de tags no layout da Blip (campo de chips + Salvar alterações), desligado até haver onde gravar as tags por fila. */
function SectionTags() {
  return (
    <Card className="fila-cartao" titulo="Tags da fila">
      <p className="sub">Adicione ou edite as tags disponíveis para os atendentes desta fila.</p>
      <Campo
        placeholder="Insira as tags separando por vírgulas"
        aria-label="Tags da fila"
        disabled
      />
      <div className="cl-actions">
        <Botao type="button" variante="primario" disabled>
          Salvar alterações
        </Botao>
      </div>
      <p className="note">{EM_BREVE}</p>
    </Card>
  );
}

/** Cartão de encerramento automático: o interruptor fica desligado e desabilitado até existir configuração por fila e o processo que encerra os tickets. */
function SectionAutoClose() {
  const titulo = 'Encerramento automático de tickets';
  return (
    <Card
      className="fila-cartao"
      titulo={titulo}
      actions={
        <button
          type="button"
          className="interruptor interruptor-alto"
          role="switch"
          aria-checked={false}
          aria-label={titulo}
          disabled
        >
          <span className="interruptor-bolinha" />
        </button>
      }
    >
      <p className="sub">Encerre automaticamente os tickets por inatividade</p>
      <p className="note">{EM_BREVE}</p>
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
  const { contact } = useContact();
  const [formulario, setFormulario] = useState<'novo' | PriorityRule | null>(null);
  const [paraExcluir, setParaExcluir] = useState<{ id: string; nome: string } | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ofQueue = queueRules(regras, queue.id);
  const pagina = usePage(ofQueue, 5);

  async function excluir() {
    if (!paraExcluir) return;
    setExcluindo(true);
    setError(null);
    const resultado = await priorityDeleteRule(contact.id, paraExcluir.id);
    setExcluindo(false);
    if (resultado.ok) setParaExcluir(null);
    else setError(falhaAoSalvar(resultado.error));
  }

  return (
    <Card
      className="fila-cartao"
      titulo="Regras de Priorização"
      actions={
        <Botao
          variante="primario"
          icone="mais"
          onClick={() => setFormulario('novo')}
          disabled={formulario !== null}
        >
          Criar regra
        </Botao>
      }
    >
      <p className="sub">
        Defina a prioridade para todos os atendimentos da fila ou crie condições para a priorização
      </p>
      {formulario !== null ? (
        <RulePriorityForm
          queueId={queue.id}
          regra={formulario === 'novo' ? undefined : formulario}
          nomesExistentes={regras.map((r) => r.name)}
          onFechar={() => setFormulario(null)}
        />
      ) : ofQueue.length === 0 ? (
        <div className="empty">
          <Illustration nome="vazio" tamanho={96} />
          <b>Esta fila ainda não tem regras de priorização!</b>
          <p>Crie uma regra para definir a prioridade de atendimento dos clientes.</p>
        </div>
      ) : (
        <>
          {pagina.visiveis.map((r) => (
            <article key={r.id} className="card-list fila-regra">
              <div className="cl-campos" style={{ '--cl-colunas': 2 } as React.CSSProperties}>
                <div className="cl-campo">
                  <span className="r">Nome da regra</span>
                  <span className="v" title={r.name}>
                    {r.name}
                  </span>
                </div>
                <div className="cl-campo">
                  <span className="r">Grau de urgência</span>
                  <span className="v">{rotuloDoNivel(r.level)}</span>
                </div>
              </div>
              <div className="cl-actions">
                <BotaoDeIcone
                  nome="lapis"
                  rotulo={`Editar a regra ${r.name}`}
                  onClick={() => setFormulario(r)}
                />
                <BotaoDeIcone
                  nome="x"
                  rotulo={`Excluir a regra ${r.name}`}
                  onClick={() => setParaExcluir({ id: r.id, nome: r.name })}
                />
              </div>
            </article>
          ))}
          <Pagination layout="grade" afastado state={pagina} />
        </>
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
