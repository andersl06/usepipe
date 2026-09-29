import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Botao, BotaoDeIcone, Icone } from '@pipe/ui';
import { useRead } from '../../lib/query';
import type { AgentRegistered } from '../../lib/registrations';
import { removeFromAllQueues } from '../../lib/agents-gravar';
import { agentsQueues, queuesInCard, filterAgents } from '../../lib/agents';
import { numero } from '../../lib/format';
import { ListaRegras, type RulesSection } from '../../components/lista-regras';
import { useContact } from '../flow/contact';
import { attendanceBase } from '../operation/shell';
import { ConfirmModal } from '@pipe/ui/modal';

/**
 * Attendant management — the list.
 *
 * Skeleton and copy measured in `FICHA-atendentes-filas-pausas.md` §b.2/§a.4: header "Gestão de atendentes" with "Adicionar atendentes" on the right, search "Buscar por nome ou e-mail" + "Filtrar por: Filas", a "Selecionar todos" bar, a card with checkbox + avatar + four fields (Atendente/E-mail/Filas/Tickets simultâneos) and, on the right, Editar/Permissões/Excluir.
 *
 * **"Selecionar todos" and what it selects.** The source paginates on the SERVER (ficha §e.6); our list already arrives whole and paginates on the client, inside `ListaRegras`, which doesn't expose the visible slice from outside. `alternarTodos` marks/unmarks the entire FILTERED set (queue search + text), not just the visible page — the honest simplification while pagination stays display-only.
 * ponytail: selects the whole filtered set, not the page; adjust if `ListaRegras` starts exposing the visible slice.
 *
 * **"Excluir" removes from all queues** — it doesn't delete the user (`removeFromAllQueues`, `lib/atendentes-gravar.ts`: Pipe has no "attendance team" as a separate registry; whoever receives a conversation is whoever is in a queue).
 */
export function AgentsPageManagement() {
  const navegar = useNavigate();
  const { contact } = useContact();
  const base = attendanceBase(contact);

  const [queuesApplied, setQueuesApplied] = useState<string[]>([]);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [paraExcluir, setParaExcluir] = useState<AgentRegistered | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [errorDeletion, setErrorDeletion] = useState<string | null>(null);

  const read = useRead<AgentRegistered[]>('/v1/management/agents/management');
  if (!read.data) return null;
  const agents = read.data;

  const queuesAvailable = agentsQueues(agents);
  const filtrados = filterAgents(agents, { search: '', queues: queuesApplied });
  const todosMarcados = filtrados.length > 0 && filtrados.every((a) => selecionados.has(a.id));

  function toggleSelection(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function alternarTodos() {
    setSelecionados((atual) => {
      if (todosMarcados) return new Set([...atual].filter((id) => !filtrados.some((a) => a.id === id)));
      const novo = new Set(atual);
      for (const a of filtrados) novo.add(a.id);
      return novo;
    });
  }

  function irForEdit(ids: readonly string[]) {
    navegar(`${base}/team/edit?agents=${ids.join(',')}`);
  }

  function irForPermissions(ids: readonly string[]) {
    navegar(`${base}/team/permission?agents=${ids.join(',')}`);
  }

  async function excluir() {
    if (!paraExcluir) return;
    setExcluindo(true);
    setErrorDeletion(null);
    const resultado = await removeFromAllQueues(paraExcluir.id, paraExcluir.queues);
    setExcluindo(false);
    if (resultado.ok) setParaExcluir(null);
    else setErrorDeletion(resultado.error);
  }

  const sections: RulesSection[] = [
    {
      titulo: 'Gestão de atendentes',
      empty: 'Nenhum atendente cadastrado.',
      cards: filtrados.map((a) => ({
        id: a.id,
        esquerda: (
          <span className="cl-selection">
            <input
              type="checkbox"
              checked={selecionados.has(a.id)}
              onChange={() => toggleSelection(a.id)}
              aria-label={`Selecionar ${a.name}`}
            />
            <Avatar nome={a.name} />
          </span>
        ),
        campos: [
          { rotulo: 'Atendente', value: a.name },
          { rotulo: 'E-mail', value: a.email },
          { rotulo: 'Filas', value: queuesInCard(a.queues) },
          {
            rotulo: 'Tickets simultâneos',
            value: a.limiteSimultaneo === null ? '—' : numero(a.limiteSimultaneo),
            classe: 'num',
          },
        ],
        situation: a.active ? 'Ativo' : 'Desativado',
        /*
         * The source has no status column (ficha §d.2: "go back to 4 columns") — `ativa` would only decide `Cartao`'s badge, and since the three actions always exist here, it never shows up anyway.
         */
        active: a.active,
        acao: (
          <>
            <BotaoDeIcone nome="lapis" rotulo={`Editar ${a.name}`} onClick={() => irForEdit([a.id])} />
            <BotaoDeIcone
              nome="chave"
              rotulo={`Permissões de ${a.name}`}
              onClick={() => irForPermissions([a.id])}
            />
            <BotaoDeIcone nome="x" rotulo={`Excluir ${a.name}`} onClick={() => setParaExcluir(a)} />
          </>
        ),
        procura: `${a.name} ${a.email}`.toLowerCase(),
      })),
    },
  ];

  return (
    <>
      <div className="board-head">
        <h2>Gestão de atendentes</h2>
        <Botao
          variante="primario"
          icone="mais"
          className="board-acao"
          onClick={() => navegar(`${base}/team/create`)}
        >
          Adicionar atendentes
        </Botao>
      </div>

      <div className="selecionar-todos-barra">
        <label className="selecionar-todos">
          <input type="checkbox" checked={todosMarcados} onChange={alternarTodos} disabled={filtrados.length === 0} />
          Selecionar todos
        </label>
        {selecionados.size > 0 ? (
          <div className="actions-in-batch">
            <span className="sub">
              {numero(selecionados.size)} selecionado{selecionados.size === 1 ? '' : 's'}
            </span>
            <Botao onClick={() => irForEdit([...selecionados])}>Editar</Botao>
            <Botao onClick={() => irForPermissions([...selecionados])}>Permissões</Botao>
          </div>
        ) : null}
      </div>

      {errorDeletion ? (
        <p className="sub" style={{ color: 'var(--p-error-content)' }}>
          {errorDeletion}
        </p>
      ) : null}

      <ListaRegras
        sections={sections}
        placeholder="Buscar por nome ou e-mail"
        sectionHideHeader
        paginar
        pageInitialSize={5}
        filters={<QueuesFilter options={queuesAvailable} aplicado={queuesApplied} onAplicar={setQueuesApplied} />}
      />

      <ConfirmModal
        aberto={paraExcluir !== null}
        titulo="Excluir atendente"
        message={
          <>
            Tirar "{paraExcluir?.name}" de todas as filas? A pessoa deixa de receber conversa e continua com a
            conta.
          </>
        }
        error={errorDeletion}
        confirmando={excluindo}
        onConfirmar={() => void excluir()}
        onCancelar={() => {
          setParaExcluir(null);
          setErrorDeletion(null);
        }}
      />
    </>
  );
}

/**
 * "Filtrar por: Filas" — a dropdown panel anchored to the control (`FICHA-atendentes-filas-pausas.md` §a.4: "Selecione a(s) fila(s)" picker, "Limpar seleção", "Cancelar", "Aplicar"). The choice only takes effect on the list after "Aplicar" — cancelling or closing without applying changes nothing.
 */
function QueuesFilter({
  options,
  aplicado,
  onAplicar,
}: {
  options: readonly string[];
  aplicado: readonly string[];
  onAplicar: (queues: string[]) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [staged, setStaged] = useState<string[]>([...aplicado]);

  function abrir() {
    setStaged([...aplicado]);
    setAberto(true);
  }

  return (
    <div className="filter-queues">
      <span className="filtrar-rotulo">Filtrar por:</span>
      <button type="button" className="filter-queues-trigger" onClick={() => (aberto ? setAberto(false) : abrir())}>
        Filas{aplicado.length > 0 ? ` (${aplicado.length})` : ''}
        <Icone nome="baixo" tamanho={16} />
      </button>

      {aberto ? (
        <div className="filter-queues-panel" role="dialog" aria-label="Filtrar por filas">
          <div className="filter-queues-header">
            <span className="sub">Selecione a(s) fila(s)</span>
            <button type="button" className="link-carregar-mais" onClick={() => setStaged([])}>
              Limpar seleção
            </button>
          </div>

          {options.length === 0 ? (
            <p className="sub">Nenhuma fila cadastrada.</p>
          ) : (
            options.map((nome) => (
              <label key={nome} className="filter-queues-item">
                <input
                  type="checkbox"
                  checked={staged.includes(nome)}
                  onChange={() =>
                    setStaged((s) => (s.includes(nome) ? s.filter((n) => n !== nome) : [...s, nome]))
                  }
                />
                {nome}
              </label>
            ))
          )}

          <div className="cl-actions">
            <Botao type="button" onClick={() => setAberto(false)}>
              Cancelar
            </Botao>
            <Botao
              type="button"
              variante="primario"
              onClick={() => {
                onAplicar(staged);
                setAberto(false);
              }}
            >
              Aplicar
            </Botao>
          </div>
        </div>
      ) : null}
    </div>
  );
}
