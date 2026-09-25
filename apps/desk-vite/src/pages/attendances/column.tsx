import { useMemo, useState } from 'react';
import type { StateAgent, QueueOfDesk } from '@pipe/contracts';
import { IconeDesk } from '../../components/icones-desk';
import { executar } from '../../lib/actions';
import { cronometro } from '../../lib/format';
import {
  FILTERS,
  ROTULOS_OF_FILTER,
  aplicarFilter,
  buscar,
  contagens,
  ordenar,
  type Filter,
} from '../../lib/order';
import { ROTULOS_DE_STATUS } from '../../components/rail';
import { Card } from './card';

/**
 * A coluna de atendimentos — o `.sidenav` da referência
 * (`~/desk-clone/templates/sidenav.html`, `sidenav-header.html`,
 * `chat-list.html`), de cima para baixo:
 *
 * 1. `.header-content`: "Atendimentos" (h1 20/700) e o seletor "Lista ⌄";
 * 2. `.sidenav-header`: Online → "N Clientes aguardando" + "Atender";
 *    outros → "Seu status é X" + "Ficar Online" (pausa: motivo + cronômetro);
 * 3. a busca ("Busque pelo nome ou telefone...");
 * 4. `.header-chat-list`: a ficha "Todos (N)" (menu até 1441, fila acima),
 *    o botão de pasta e "Reclassificar";
 * 5. a lista de cartões, ou o estado vazio.
 *
 * Os textos são os do i18n de lá (`thereCustumer`, `customers`, `waiting`,
 * `answerCustomer`, `currentStatus`, `getOnline`, `getOnlineToAtend`,
 * `noOpenTickets`, `allTickets`…).
 */
export function Column({
  queue,
  agora,
  selecionada,
  aoAbrir,
}: {
  queue: QueueOfDesk;
  agora: Date;
  selecionada: string | null;
  aoAbrir: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>('todos');
  const [termo, setTermo] = useState('');
  const [menuFilter, setMenuFilter] = useState(false);
  const [menuModo, setMenuModo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [atendendo, setAtendendo] = useState(false);

  const state = queue.status.estado;
  const online = state === 'online';
  const totals = useMemo(() => contagens(queue.conversations, agora), [queue.conversations, agora]);
  const visiveis = useMemo(
    () => ordenar(buscar(aplicarFilter(queue.conversations, filter, agora), termo), 'ultima-mensagem'),
    [queue.conversations, filter, termo, agora],
  );

  async function atender() {
    setAtendendo(true);
    setError(null);
    const r = (await executar('atender', {})) as {
      ok: boolean;
      error?: string;
      conversationId?: string;
    };
    setAtendendo(false);
    if (!r.ok) setError(r.error ?? 'Não foi possível atender.');
    else if (r.conversationId) aoAbrir(r.conversationId);
  }

  async function ficarOnline() {
    setError(null);
    const r = await executar('definirStatus', { state: 'online' });
    if (!r.ok) setError(r.error ?? 'Não foi possível ficar online.');
  }

  /**
   * Abrir a conversa tira a marca manual de "não lida" — a ficha "Não lidas" da
   * origem "remove o ticket automaticamente assim que ele é aberto/lido"
   * (`blip-desk-funcoes.md` §1). A recusa não trava a abertura.
   */
  function abrir(id: string) {
    aoAbrir(id);
    const marcada = queue.conversations.find((c) => c.id === id);
    if (marcada?.naoLidaEm) void executar('marcarNaoLida', { conversaId: id, naoLida: 'false' });
  }

  return (
    <div className="dk-coluna" id="sidenav-div">
      <div className="dk-coluna-cabecalho">
        <h1 className="dk-coluna-titulo">Atendimentos</h1>
        <div className="dk-ficha-menu">
          <button
            type="button"
            className="dk-modo"
            id="viewModeMenu"
            aria-haspopup="menu"
            aria-expanded={menuModo}
            onClick={() => setMenuModo((v) => !v)}
          >
            Lista
            <IconeDesk nome="seta-baixo" />
          </button>
          {menuModo ? (
            <div className="dk-menu" role="menu" onMouseLeave={() => setMenuModo(false)}>
              <button
                type="button"
                role="menuitemradio"
                aria-checked="true"
                className="dk-menu-item"
              >
                <IconeDesk nome="lista" tamanho={20} />
                <b>Lista</b>
              </button>
              {/* ponytail: o modo Quadro (kanban) da referência não tem tela na cópia; fica listado, sem destino. */}
              <button
                type="button"
                role="menuitemradio"
                aria-checked="false"
                className="dk-menu-item"
                disabled
              >
                <IconeDesk nome="quadro" tamanho={20} />
                Quadro
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="dk-estado">
        <AgentState
          state={state}
          motivo={queue.status.motivoPausa}
          desde={queue.status.desde}
          agora={agora}
          aguardando={queue.aguardando}
          atendendo={atendendo}
          aoAtender={() => void atender()}
          aoFicarOnline={() => void ficarOnline()}
        />
      </div>
      {error ? (
        <p className="dk-erro" style={{ padding: '0 16px' }}>
          {error}
        </p>
      ) : null}

      <div className="dk-busca">
        <label className="dk-campo">
          <span className="dk-campo-icone">
            <IconeDesk nome="busca" />
          </span>
          <input
            type="search"
            placeholder="Busque pelo nome ou telefone..."
            aria-label="Campo de busca por nome ou telefone"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
          />
        </label>
      </div>

      <div className="dk-fichas">
        <div className="dk-fichas-esquerda" id="filters-container">
          <div className="dk-ficha-menu">
            <button
              type="button"
              className="dk-ficha"
              id="ticket-filter-dropdown"
              aria-haspopup="menu"
              aria-expanded={menuFilter}
              onClick={() => setMenuFilter((v) => !v)}
            >
              <IconeDesk nome="seta-baixo" />
              {ROTULOS_OF_FILTER[filter]} ({totals[filter]})
            </button>
            {menuFilter ? (
              <div className="dk-menu" role="menu" onMouseLeave={() => setMenuFilter(false)}>
                {FILTERS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    role="menuitemradio"
                    aria-checked={f === filter}
                    className="dk-menu-item"
                    onClick={() => {
                      setFilter(f);
                      setMenuFilter(false);
                    }}
                  >
                    {ROTULOS_OF_FILTER[f]} ({totals[f]})
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="dk-fichas-fila" id="ticket-filters-area">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                className="dk-ficha"
                aria-pressed={f === filter}
                title={`Filtrar ${ROTULOS_OF_FILTER[f]}`}
                onClick={() => setFilter(f)}
              >
                {ROTULOS_OF_FILTER[f]} ({totals[f]})
              </button>
            ))}
          </div>
          {/* ponytail: pastas de tickets não existem no Pipe; o botão fica onde a referência o põe. */}
          <button
            type="button"
            className="dk-botao-icone"
            title="Criar pasta"
            aria-label="Criar pasta"
            disabled
          >
            <IconeDesk nome="pasta-nova" />
          </button>
        </div>
        <div className="dk-fichas-direita">
          {/* ponytail: "Reclassificar os tickets com inteligência artificial" depende do @pipe/ai. */}
          <button
            type="button"
            className="dk-botao dk-botao-secundario dk-botao-curto"
            title="Reclassificar os tickets com inteligência artificial"
            disabled
          >
            Reclassificar
          </button>
        </div>
      </div>

      <main className="dk-lista" role="list" aria-label="Atendimentos">
        {visiveis.map((c) => (
          <Card
            key={c.id}
            conversation={c}
            selecionada={c.id === selecionada}
            agora={agora}
            aoAbrir={abrir}
            aoFalhar={setError}
          />
        ))}
        {visiveis.length === 0 ? (
          <div className="dk-lista-vazia" tabIndex={0}>
            <IconeDesk nome="mensagem-ativa" />
            <div>
              {!online
                ? 'Você precisa ficar online para atender um novo cliente'
                : termo
                  ? 'Nenhum resultado encontrado'
                  : 'Nenhum atendimento aberto'}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

/**
 * O miolo do `.sidenav-header`, um por status (função de desenho `lzgT` do
 * pacote da referência): Online mostra a contagem e "Atender"; Invisível e
 * Offline mostram "Seu status é X" e "Ficar Online"; Em pausa mostra o motivo
 * e o cronômetro (`AgentPauseTimer`).
 */
function AgentState({
  state,
  motivo,
  desde,
  agora,
  aguardando,
  atendendo,
  aoAtender,
  aoFicarOnline,
}: {
  state: StateAgent;
  motivo: string | null;
  desde: string;
  agora: Date;
  aguardando: number;
  atendendo: boolean;
  aoAtender: () => void;
  aoFicarOnline: () => void;
}) {
  if (state === 'online') {
    return (
      <div className="dk-estado-miolo">
        <div className="dk-aguardando" id="waiting-tickets" tabIndex={0}>
          <b id="waiting-tickets-count">{aguardando}</b>
          <span>{aguardando === 1 ? 'Cliente' : 'Clientes'} aguardando</span>
        </div>
        <div className="dk-estado-botoes">
          <button
            type="button"
            className="dk-botao"
            id="claim-ticket-button"
            onClick={aoAtender}
            disabled={atendendo}
          >
            Atender
          </button>
        </div>
      </div>
    );
  }
  if (state === 'pausa') {
    const segundos = (agora.getTime() - new Date(desde).getTime()) / 1000;
    return (
      <div className="dk-estado-miolo">
        <div className="dk-status-texto">
          Seu status é <b id="agent-status-pause">{motivo ?? ROTULOS_DE_STATUS.pausa}</b>
        </div>
        <div className="dk-status-texto" id="agent-status-pause-timer">
          {cronometro(segundos)}
        </div>
      </div>
    );
  }
  return (
    <div className="dk-estado-miolo">
      <div className="dk-status-texto">
        Seu status é <b id={`agent-status-${state}`}>{ROTULOS_DE_STATUS[state]}</b>
      </div>
      <div className="dk-estado-botoes">
        <button type="button" className="dk-botao" id="set-online-btn" onClick={aoFicarOnline}>
          Ficar Online
        </button>
      </div>
    </div>
  );
}
