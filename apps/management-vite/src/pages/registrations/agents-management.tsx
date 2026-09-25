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
import { ModalConfirmation } from './_modal';

/**
 * Gestão de atendentes — a lista.
 *
 * Esqueleto e textos medidos em `FICHA-atendentes-filas-pausas.md` §b.2/§a.4:
 * cabeçalho "Gestão de atendentes" com "Adicionar atendentes" à direita,
 * busca "Buscar por nome ou e-mail" + "Filtrar por: Filas", barra
 * "Selecionar todos", cartão com caixa de seleção + avatar + quatro campos
 * (Atendente/E-mail/Filas/Tickets simultâneos) e, à direita, Editar/
 * Permissões/Excluir.
 *
 * **"Selecionar todos" e o que ele seleciona.** A origem pagina no
 * SERVIDOR (§e.6 da ficha); a nossa lista já vem inteira e pagina no
 * cliente, dentro de `ListaRegras`, que não expõe a fatia visível de fora.
 * `alternarTodos` marca/desmarca o conjunto FILTRADO inteiro (busca de fila +
 * texto), não só a página à vista — é a simplificação honesta enquanto a
 * paginação continuar sendo só de exibição.
 * ponytail: seleciona o filtrado inteiro, não a página; ajustar se
 * `ListaRegras` passar a expor a fatia visível.
 *
 * **"Excluir" tira de todas as filas** — não apaga o usuário
 * (`tirarDeTodasAsFilas`, `lib/atendentes-gravar.ts`: no Pipe não existe
 * "equipe de atendimento" como cadastro à parte; quem recebe conversa é quem
 * está em fila).
 */
export function AgentsPageManagement() {
  const navegar = useNavigate();
  const { contact } = useContact();
  const base = attendanceBase(contact.tipo, contact.id);

  const [queuesAplicadas, setQueuesAplicadas] = useState<string[]>([]);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [paraExcluir, setParaExcluir] = useState<AgentRegistered | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [errorExclusao, setErrorExclusao] = useState<string | null>(null);

  const read = useRead<AgentRegistered[]>('/v1/management/agents/management');
  if (!read.data) return null;
  const agents = read.data;

  const queuesDisponiveis = agentsQueues(agents);
  const filtrados = filterAgents(agents, { search: '', queues: queuesAplicadas });
  const todosMarcados = filtrados.length > 0 && filtrados.every((a) => selecionados.has(a.id));

  function alternarSelection(id: string) {
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
    navegar(`${base}/agents/management/edit?agents=${ids.join(',')}`);
  }

  function irForPermissions(ids: readonly string[]) {
    navegar(`${base}/agents/management/permissions?agents=${ids.join(',')}`);
  }

  async function excluir() {
    if (!paraExcluir) return;
    setExcluindo(true);
    setErrorExclusao(null);
    const resultado = await removeFromAllQueues(paraExcluir.id, paraExcluir.queues);
    setExcluindo(false);
    if (resultado.ok) setParaExcluir(null);
    else setErrorExclusao(resultado.error);
  }

  const sections: RulesSection[] = [
    {
      titulo: 'Gestão de atendentes',
      empty: 'Nenhum atendente cadastrado.',
      cards: filtrados.map((a) => ({
        id: a.id,
        esquerda: (
          <span className="cl-selecao">
            <input
              type="checkbox"
              checked={selecionados.has(a.id)}
              onChange={() => alternarSelection(a.id)}
              aria-label={`Selecionar ${a.nome}`}
            />
            <Avatar nome={a.nome} />
          </span>
        ),
        campos: [
          { rotulo: 'Atendente', valor: a.nome },
          { rotulo: 'E-mail', valor: a.email },
          { rotulo: 'Filas', valor: queuesInCard(a.queues) },
          {
            rotulo: 'Tickets simultâneos',
            valor: a.limiteSimultaneo === null ? '—' : numero(a.limiteSimultaneo),
            classe: 'num',
          },
        ],
        situacao: a.ativo ? 'Ativo' : 'Desativado',
        /* A origem não tem coluna de status (§d.2 da ficha: "voltar para 4
           colunas") — `ativa` só decidiria o selo de `Cartao`, e como as três
           ações sempre existem aqui, ele nunca aparece de qualquer forma. */
        ativa: a.ativo,
        acao: (
          <>
            <BotaoDeIcone nome="lapis" rotulo={`Editar ${a.nome}`} onClick={() => irForEdit([a.id])} />
            <BotaoDeIcone
              nome="chave"
              rotulo={`Permissões de ${a.nome}`}
              onClick={() => irForPermissions([a.id])}
            />
            <BotaoDeIcone nome="x" rotulo={`Excluir ${a.nome}`} onClick={() => setParaExcluir(a)} />
          </>
        ),
        procura: `${a.nome} ${a.email}`.toLowerCase(),
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
          onClick={() => navegar(`${base}/agents/management/add`)}
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
          <div className="acoes-em-lote">
            <span className="sub">
              {numero(selecionados.size)} selecionado{selecionados.size === 1 ? '' : 's'}
            </span>
            <Botao onClick={() => irForEdit([...selecionados])}>Editar</Botao>
            <Botao onClick={() => irForPermissions([...selecionados])}>Permissões</Botao>
          </div>
        ) : null}
      </div>

      {errorExclusao ? (
        <p className="sub" style={{ color: 'var(--p-erro-conteudo)' }}>
          {errorExclusao}
        </p>
      ) : null}

      <ListaRegras
        sections={sections}
        placeholder="Buscar por nome ou e-mail"
        sectionOcultarHeader
        paginar
        pageInitialTamanho={5}
        filters={<QueuesFilter options={queuesDisponiveis} aplicado={queuesAplicadas} onAplicar={setQueuesAplicadas} />}
      />

      <ModalConfirmation
        aberto={paraExcluir !== null}
        titulo="Excluir atendente"
        message={
          <>
            Tirar "{paraExcluir?.nome}" de todas as filas? A pessoa deixa de receber conversa e continua com a
            conta.
          </>
        }
        error={errorExclusao}
        confirmando={excluindo}
        onConfirmar={() => void excluir()}
        onCancelar={() => {
          setParaExcluir(null);
          setErrorExclusao(null);
        }}
      />
    </>
  );
}

/**
 * "Filtrar por: Filas" — painel suspenso ancorado no controle
 * (`FICHA-atendentes-filas-pausas.md` §a.4: seletor "Selecione a(s) fila(s)",
 * "Limpar seleção", "Cancelar", "Aplicar"). A escolha só vale para a lista
 * depois de "Aplicar" — cancelar ou fechar sem aplicar não muda nada.
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
    <div className="filtro-filas">
      <span className="filtrar-rotulo">Filtrar por:</span>
      <button type="button" className="filtro-filas-ativador" onClick={() => (aberto ? setAberto(false) : abrir())}>
        Filas{aplicado.length > 0 ? ` (${aplicado.length})` : ''}
        <Icone nome="baixo" tamanho={16} />
      </button>

      {aberto ? (
        <div className="filtro-filas-painel" role="dialog" aria-label="Filtrar por filas">
          <div className="filtro-filas-cabecalho">
            <span className="sub">Selecione a(s) fila(s)</span>
            <button type="button" className="link-carregar-mais" onClick={() => setStaged([])}>
              Limpar seleção
            </button>
          </div>

          {options.length === 0 ? (
            <p className="sub">Nenhuma fila cadastrada.</p>
          ) : (
            options.map((nome) => (
              <label key={nome} className="filtro-filas-item">
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

          <div className="cl-acoes">
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
