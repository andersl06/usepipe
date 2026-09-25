import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Botao, BotaoDeIcone, Campo, Card, Etiqueta } from '@pipe/ui';
import { useRead } from '../../lib/consulta';
import type { QueueRegistered, Horarios } from '../../lib/cadastros';
import { queueDesvincularAgent, editQueue } from '../../lib/cadastros-gravar';
import { priorityCreateRule, priorityExcluirRule } from '../../lib/atendentes-gravar';
import {
  NIVEIS_ATRIBUIVEIS,
  queueRules,
  rotuloDoNivel,
  type PriorityRule,
} from '../../lib/regras-prioridade';
import { Selection } from '../../componentes/selecao';
import { useContact } from '../fluxo/contato';
import { attendanceBase } from '../operacao/casca';
import { ModalConfirmation } from './_modal';

/**
 * Edição de fila — PÁGINA PRÓPRIA, não modal.
 *
 * `attendance.desk.queueManagement.edit` da origem é `url:"/edit/:id"`
 * (`FICHA-atendentes-filas-pausas.md` §a.1) — é o que o dono cobrou. A
 * anatomia é a do §a.3: três seções na ordem **Atendentes → Regras de
 * Priorização → Tags**, com os textos literais do `i18n.js`.
 *
 * **Tags ficou de fora.** A origem tem "Gerenciar tags da fila", mas no Pipe
 * `etiqueta` é por TENANT, sem vínculo com fila (§e.7 da ficha) — fazer esse
 * vínculo é migração + domínio + rota + consumo no Desk, e está registrado
 * como pendência, não inventado aqui.
 *
 * **"Adicionar atendente" NAVEGA, não abre formulário aqui.** A origem prova
 * isso com o próprio texto do vazio (`noAttendantsBody`: "ao clicar em
 * Adicionar atendente, um direcionamento será feito para a página Equipe de
 * atendimento"). No Pipe, vincular quem entra na fila é a MESMA gravação de
 * "Editar atendente" em lote (`POST .../filas/:id/atendentes`) — por isso o
 * botão manda para `atendentes/gestao`, e não para um seletor nesta página.
 *
 * **"Dados da fila" é seção só nossa**, sem sub-rota na origem: cor, ordem,
 * capacidade padrão, horário e o interruptor "Ativa" migraram do modal de
 * criação para cá (`atendentes-filas-formulario.tsx` já documentava isso).
 */
export function QueuePageEdit() {
  const { queueId } = useParams<{ queueId: string }>();
  const navegar = useNavigate();
  const { contact } = useContact();
  const base = attendanceBase(contact.tipo, contact.id);

  const readQueues = useRead<{ queues: QueueRegistered[] }>('/v1/gestao/atendentes/filas');
  const readHours = useRead<Horarios & { fuso: string }>('/v1/gestao/regras/horarios');
  const readRules = useRead<PriorityRule[]>(
    '/v1/gestao/regras/prioridade',
  );

  if (!readQueues.data || !readHours.data || !readRules.data) return null;

  const queue = readQueues.data.queues.find((f) => f.id === queueId);
  if (!queue) {
    return (
      <div className="vazio">
        <b>Fila não encontrada</b>
        <p>
          <button type="button" className="btn" onClick={() => navegar(`${base}/atendentes/filas`)}>
            Voltar para Filas de atendimento
          </button>
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="board-head">
        <h2>{queue.nome}</h2>
      </div>

      <QueueData queue={queue} horarios={readHours.data.horarios} />
      <SectionAgents queue={queue} base={base} />
      <PrioritySectionRules queue={queue} regras={readRules.data} />
    </>
  );
}

/* -------------------------------------------------------- dados da fila */

function QueueData({
  queue,
  horarios,
}: {
  queue: QueueRegistered;
  horarios: readonly { id: string; nome: string }[];
}) {
  const [nome, setNome] = useState(queue.nome);
  const [cor, setCor] = useState(queue.cor ?? '#5b5fed');
  const [capacity, setCapacity] = useState(String(queue.capacityDefault));
  const [order, setOrder] = useState(String(queue.order));
  const [horarioId, setHorarioId] = useState(queue.horarioId ?? '');
  const [active, setActive] = useState(queue.active);
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mudou =
    nome.trim() !== queue.nome ||
    cor !== (queue.cor ?? '#5b5fed') ||
    capacity !== String(queue.capacityDefault) ||
    order !== String(queue.order) ||
    horarioId !== (queue.horarioId ?? '') ||
    active !== queue.active;

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
    if (!resultado.ok) setError(resultado.error);
  }

  return (
    <Card titulo="Dados da fila">
      <form className="form-cadastro" onSubmit={(e) => void salvar(e)}>
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
            <Selection
              value={horarioId}
              onChange={(e) => setHorarioId(e.target.value)}
              disabled={salvando}
              aria-label="Horário"
            >
              <option value="">Sem horário — atende 24×7</option>
              {horarios.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.nome}
                </option>
              ))}
            </Selection>
          </label>

          <label className="form-caixa" style={{ alignSelf: 'flex-end' }}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={salvando} />
            <span className="sub">Ativa</span>
          </label>
        </div>

        {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}

        <div className="cl-acoes">
          <Botao type="submit" variante="primario" disabled={salvando || !mudou || !nome.trim()}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Botao>
        </div>
      </form>
    </Card>
  );
}

/* ----------------------------------------------------------- atendentes */

const PASSO_AGENTS = 10;

function SectionAgents({ queue, base }: { queue: QueueRegistered; base: string }) {
  const navegar = useNavigate();
  const [search, setSearch] = useState('');
  const [visiveis, setVisiveis] = useState(PASSO_AGENTS);
  const [paraRemover, setParaRemover] = useState<{ id: string; nome: string } | null>(null);
  const [removendo, setRemovendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alvo = search.trim().toLowerCase();
  const filtrados = alvo ? queue.agents.filter((a) => a.nome.toLowerCase().includes(alvo)) : queue.agents;
  const mostrados = filtrados.slice(0, visiveis);

  async function remover() {
    if (!paraRemover) return;
    setRemovendo(true);
    setError(null);
    const resultado = await queueDesvincularAgent(queue.id, paraRemover.id);
    setRemovendo(false);
    if (resultado.ok) setParaRemover(null);
    else setError(resultado.error);
  }

  return (
    <Card
      titulo="Atendentes"
      actions={
        <Botao variante="primario" onClick={() => navegar(`${base}/atendentes/gestao`)}>
          Adicionar atendente
        </Botao>
      }
    >
      {queue.agents.length === 0 ? (
        <div className="vazio">
          <b>Ops! Essa fila não possui nenhum atendente.</b>
          <p>
            Ops! Não há agentes nessa fila. Ao clicar em <b>Adicionar atendente</b>, um direcionamento será feito
            para a página <b>Equipe de atendimento</b>.
          </p>
        </div>
      ) : (
        <>
          <div className="busca-topo">
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setVisiveis(PASSO_AGENTS);
              }}
              placeholder="Pesquisar atendente"
              aria-label="Pesquisar atendente"
            />
          </div>

          {filtrados.length === 0 ? (
            <div className="vazio">
              <b>Atendente não encontrado :(</b>
              <p>Não há atendente cadastrados com esse nome.</p>
            </div>
          ) : (
            <>
              {mostrados.map((a) => (
                <div key={a.id} className="form-linha linha-lista">
                  <span className="sub">
                    {a.nome} · {a.capacity}
                    {a.temOverride ? ' próprio' : ''}
                  </span>
                  <BotaoDeIcone
                    nome="x"
                    rotulo={`Remover ${a.nome} da fila`}
                    onClick={() => setParaRemover({ id: a.id, nome: a.nome })}
                  />
                </div>
              ))}
              <p className="sub secao-rodape">
                Exibindo {mostrados.length} de {filtrados.length}
                {mostrados.length < filtrados.length ? (
                  <button
                    type="button"
                    className="link-carregar-mais"
                    onClick={() => setVisiveis((v) => v + PASSO_AGENTS)}
                  >
                    Carregar mais
                  </button>
                ) : null}
              </p>
            </>
          )}
        </>
      )}

      {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}

      <ModalConfirmation
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

/* ------------------------------------------------- regras de priorização */

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
    const resultado = await priorityExcluirRule(paraExcluir.id);
    setExcluindo(false);
    if (resultado.ok) setParaExcluir(null);
    else setError(resultado.error);
  }

  return (
    <Card
      titulo="Regras de Priorização"
      actions={
        <Botao variante="primario" onClick={() => setCriando(true)} disabled={criando}>
          Criar nova regra de priorização
        </Botao>
      }
    >
      {criando ? (
        <PriorityFormularioRule queueId={queue.id} onFechar={() => setCriando(false)} />
      ) : null}

      {ofQueue.length === 0 ? (
        <div className="vazio">
          <b>Essa fila ainda não possui regras de priorização!</b>
          <p>Adicione sua primeira regra e defina a prioridade em que os clientes devem ser atendidos</p>
        </div>
      ) : (
        ofQueue.map((r) => (
          <div key={r.id} className="form-linha linha-lista">
            <span className="sub">
              {r.nome} · {rotuloDoNivel(r.nivel)}
            </span>
            <BotaoDeIcone
              nome="x"
              rotulo={`Excluir a regra ${r.nome}`}
              onClick={() => setParaExcluir({ id: r.id, nome: r.nome })}
            />
          </div>
        ))
      )}

      {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}

      <ModalConfirmation
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

function PriorityFormularioRule({ queueId, onFechar }: { queueId: string; onFechar: () => void }) {
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
    <form className="form-cadastro" onSubmit={(e) => void create(e)}>
      <div className="form-linha">
        <label className="form-campo">
          <span className="sub">Nome da regra de priorização</span>
          <Campo value={nome} onChange={(e) => setNome(e.target.value)} required disabled={enviando} />
        </label>
        <label className="form-campo" style={{ flexBasis: '200px' }}>
          <span className="sub">Nível</span>
          <Selection value={nivel} onChange={(e) => setNivel(e.target.value)} disabled={enviando} aria-label="Nível">
            {NIVEIS_ATRIBUIVEIS.map((n) => (
              <option key={n} value={n}>
                {rotuloDoNivel(n)}
              </option>
            ))}
          </Selection>
        </label>
      </div>

      {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}

      <div className="cl-acoes">
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
