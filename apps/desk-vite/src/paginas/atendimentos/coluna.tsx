import { useMemo, useState } from 'react';
import type { EstadoAtendente, FilaDoDesk } from '@pipe/contracts';
import { IconeDesk } from '../../componentes/icones-desk';
import { executar } from '../../lib/acoes';
import { cronometro } from '../../lib/formato';
import {
  FILTROS,
  ROTULOS_DE_FILTRO,
  aplicarFiltro,
  buscar,
  contagens,
  ordenar,
  type Filtro,
} from '../../lib/ordem';
import { ROTULOS_DE_STATUS } from '../../componentes/trilho';
import { Cartao } from './cartao';

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
export function Coluna({
  fila,
  agora,
  selecionada,
  aoAbrir,
}: {
  fila: FilaDoDesk;
  agora: Date;
  selecionada: string | null;
  aoAbrir: (id: string) => void;
}) {
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [termo, setTermo] = useState('');
  const [menuFiltro, setMenuFiltro] = useState(false);
  const [menuModo, setMenuModo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [atendendo, setAtendendo] = useState(false);

  const estado = fila.status.estado;
  const online = estado === 'online';
  const totais = useMemo(() => contagens(fila.conversas, agora), [fila.conversas, agora]);
  const visiveis = useMemo(
    () => ordenar(buscar(aplicarFiltro(fila.conversas, filtro, agora), termo), 'ultima-mensagem'),
    [fila.conversas, filtro, termo, agora],
  );

  async function atender() {
    setAtendendo(true);
    setErro(null);
    const r = (await executar('atender', {})) as {
      ok: boolean;
      erro?: string;
      conversaId?: string;
    };
    setAtendendo(false);
    if (!r.ok) setErro(r.erro ?? 'Não foi possível atender.');
    else if (r.conversaId) aoAbrir(r.conversaId);
  }

  async function ficarOnline() {
    setErro(null);
    const r = await executar('definirStatus', { estado: 'online' });
    if (!r.ok) setErro(r.erro ?? 'Não foi possível ficar online.');
  }

  /**
   * Abrir a conversa tira a marca manual de "não lida" — a ficha "Não lidas" da
   * origem "remove o ticket automaticamente assim que ele é aberto/lido"
   * (`blip-desk-funcoes.md` §1). A recusa não trava a abertura.
   */
  function abrir(id: string) {
    aoAbrir(id);
    const marcada = fila.conversas.find((c) => c.id === id);
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
        <EstadoDoAtendente
          estado={estado}
          motivo={fila.status.motivoPausa}
          desde={fila.status.desde}
          agora={agora}
          aguardando={fila.aguardando}
          atendendo={atendendo}
          aoAtender={() => void atender()}
          aoFicarOnline={() => void ficarOnline()}
        />
      </div>
      {erro ? (
        <p className="dk-erro" style={{ padding: '0 16px' }}>
          {erro}
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
              aria-expanded={menuFiltro}
              onClick={() => setMenuFiltro((v) => !v)}
            >
              <IconeDesk nome="seta-baixo" />
              {ROTULOS_DE_FILTRO[filtro]} ({totais[filtro]})
            </button>
            {menuFiltro ? (
              <div className="dk-menu" role="menu" onMouseLeave={() => setMenuFiltro(false)}>
                {FILTROS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    role="menuitemradio"
                    aria-checked={f === filtro}
                    className="dk-menu-item"
                    onClick={() => {
                      setFiltro(f);
                      setMenuFiltro(false);
                    }}
                  >
                    {ROTULOS_DE_FILTRO[f]} ({totais[f]})
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="dk-fichas-fila" id="ticket-filters-area">
            {FILTROS.map((f) => (
              <button
                key={f}
                type="button"
                className="dk-ficha"
                aria-pressed={f === filtro}
                title={`Filtrar ${ROTULOS_DE_FILTRO[f]}`}
                onClick={() => setFiltro(f)}
              >
                {ROTULOS_DE_FILTRO[f]} ({totais[f]})
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
          <Cartao
            key={c.id}
            conversa={c}
            selecionada={c.id === selecionada}
            agora={agora}
            aoAbrir={abrir}
            aoFalhar={setErro}
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
function EstadoDoAtendente({
  estado,
  motivo,
  desde,
  agora,
  aguardando,
  atendendo,
  aoAtender,
  aoFicarOnline,
}: {
  estado: EstadoAtendente;
  motivo: string | null;
  desde: string;
  agora: Date;
  aguardando: number;
  atendendo: boolean;
  aoAtender: () => void;
  aoFicarOnline: () => void;
}) {
  if (estado === 'online') {
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
  if (estado === 'pausa') {
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
        Seu status é <b id={`agent-status-${estado}`}>{ROTULOS_DE_STATUS[estado]}</b>
      </div>
      <div className="dk-estado-botoes">
        <button type="button" className="dk-botao" id="set-online-btn" onClick={aoFicarOnline}>
          Ficar Online
        </button>
      </div>
    </div>
  );
}
