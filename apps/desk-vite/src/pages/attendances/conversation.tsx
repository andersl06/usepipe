import { useState } from 'react';
import type {
  Colega,
  ConversationOfDesk,
  EtiquetaDoDesk,
  ItemOfConversation,
  RespostaProntaDoDesk,
} from '@pipe/contracts';
import { IconeDesk } from '../../components/icones-desk';
import { Avatar } from '../../components/avatar';
import { api } from '@pipe/ui/api';
import { useRead } from '../../lib/query';
import { atualizarLeituras } from '../../lib/actions';
import { numeroDoTicket } from '../../lib/channel';
import { displayName } from '../../lib/order';
import { Thread } from './thread';
import { Composer } from './composer';
import { CardClosureTicket, avisarTicketFinalizado } from '@pipe/ui';
import { Modal } from '@pipe/ui/modal';

/**
 * Reference conversation panel `.pane-chat` (`~/desk-clone/capturas/parciais/header-conversa.html`, `thread.html`, `composer.html`): header with avatar, name, ticket/bot/queue, call/search/transfer/finish/menu controls and contact-panel toggle; then tags, conversation search, thread, and composer. Transfer and Finish use source modals `transfer-modal-content` and `close-modal-container`, calling `POST /v1/conversas/:id/transferir` and `/encerrar`; menu `Modo de Espera` calls `/espera`.
 */
export function Conversation({
  aberta,
  respostas,
  etiquetas,
  colegas,
  agora,
  panelOpen,
  toTogglePanel,
  aoFechar,
}: {
  aberta: ConversationOfDesk;
  respostas: RespostaProntaDoDesk[];
  etiquetas: EtiquetaDoDesk[];
  colegas: Colega[];
  agora: Date;
  panelOpen: boolean;
  toTogglePanel: () => void;
  aoFechar: (proximaId?: string) => void;
}) {
  const { conversation, itens, templates, labelsOfConversation } = aberta;
  const [modal, setModal] = useState<'transferir' | 'finalizar' | 'etiquetas' | null>(null);
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nome = displayName({ ...conversation, contactPhone: conversation.contactPhone });
  const numero = numeroDoTicket(conversation.id);

  /**
   * Remove a tag from the open conversation through `DELETE /v1/conversas/:id/etiquetas/:etiquetaId`. This does not close the ticket: source `ADD_TAGS` is separate from `CLOSE_TICKET`.
   */
  async function removerEtiqueta(etiquetaId: string) {
    setError(null);
    try {
      await api.delete(`/v1/conversations/${conversation.id}/labels/${etiquetaId}`);
      atualizarLeituras();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível remover a etiqueta.');
    }
  }

  async function alternarEspera() {
    setMenu(false);
    setError(null);
    try {
      await api.post(`/v1/conversations/${conversation.id}/wait`);
      atualizarLeituras();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : `Falha ao mudar o ticket ${numero} de Modo de Espera`,
      );
    }
  }

  async function reenviar(messageId: string) {
    setError(null);
    try {
      await api.post(`/v1/conversations/${conversation.id}/messages/${messageId}/resend`);
      atualizarLeituras();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ocorreu um erro ao enviar a mensagem.');
    }
  }

  const ocorrencias = search
    ? itens.filter(
        (i) =>
          i.genero === 'mensagem' && (i.conteudo ?? '').toLowerCase().includes(search.toLowerCase()),
      ).length
    : 0;

  return (
    <div className="dk-conversation" id="pane-chat-div">
      <div className="dk-conversation-header">
        <div className="dk-conversation-header-core">
          <div className="dk-conversation-contact">
            <Avatar nome={nome} tamanho={56} />
            <div
              className="dk-conversation-data"
              tabIndex={0}
              role="region"
              aria-label={`Dados do atendimento: ${nome}`}
            >
              <span className="dk-conversation-name" id="customer-name">
                {nome}
              </span>
              <span className="dk-conversation-ticket">
                <span>
                  <b>Ticket:</b>
                  <i id="ticket-sequential-id">{numero}</i>
                </span>
                <span className="dk-some-medio">
                  <b>Fila:</b>
                  <i id="ticket-team">{conversation.queueName ?? 'Transferência direta'}</i>
                </span>
              </span>
            </div>
          </div>
          <div className="dk-conversation-actions">
            {/* Ponytail: `Ligação Ativa` depends on the calling MFE; keep the button where the reference places it. */}
            <button
              type="button"
              className="dk-botao dk-botao-fantasma"
              id="calls-options"
              title="Ligação Ativa"
              aria-label="Ligação Ativa"
              disabled
              style={{ padding: '0 16px' }}
            >
              <IconeDesk nome="ligacao" />
            </button>
            <button
              type="button"
              className="dk-botao-icone"
              title="Pesquisar na conversa"
              aria-label="Pesquisar na conversa"
              aria-pressed={search !== null}
              onClick={() => setSearch((b) => (b === null ? '' : null))}
            >
              <IconeDesk nome="busca" />
            </button>
            <button
              type="button"
              className="dk-botao-icone"
              id="transfer-ticket-button"
              title="Transferir"
              aria-label="Transferir"
              onClick={() => setModal('transferir')}
            >
              <IconeDesk nome="transferir" />
            </button>
            <button
              type="button"
              className="dk-botao dk-finalizar-texto"
              id="close-ticket-button"
              onClick={() => setModal('finalizar')}
            >
              <IconeDesk nome="finalizar" />
              Finalizar
            </button>
            <button
              type="button"
              className="dk-botao-icone dk-primario dk-finalizar-icone"
              id="close-ticket-button-icon"
              title="Finalizar"
              aria-label="Finalizar"
              onClick={() => setModal('finalizar')}
            >
              <IconeDesk nome="finalizar" />
            </button>
            <div className="dk-ficha-menu">
              <button
                type="button"
                className="dk-botao-icone"
                id="pane-chat-header-menu"
                title="Mais opções"
                aria-label="Mais opções"
                aria-expanded={menu}
                onClick={() => setMenu((m) => !m)}
              >
                <IconeDesk nome="mais-opcoes" />
              </button>
              {menu ? (
                <div
                  className="dk-menu"
                  role="menu"
                  style={{ right: 0, left: 'auto' }}
                  onMouseLeave={() => setMenu(false)}
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="dk-menu-item"
                    onClick={() => void alternarEspera()}
                  >
                    <IconeDesk nome="pausa" tamanho={20} />
                    {conversation.state === 'em_espera'
                      ? 'Remover do Modo de Espera'
                      : 'Modo de Espera'}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="dk-menu-item"
                    onClick={() => {
                      setMenu(false);
                      setModal('etiquetas');
                    }}
                  >
                    <IconeDesk nome="etiqueta" tamanho={20} />
                    Adicionar tags
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="dk-menu-item"
                    onClick={() => {
                      setMenu(false);
                      exportTranscription(numero, nome, itens);
                    }}
                  >
                    <IconeDesk nome="externo" tamanho={20} />
                    Exportar ticket
                  </button>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="dk-botao-icone"
              id="show-user-info"
              title={panelOpen ? 'Esconder dados do contato' : 'Mostrar dados do contato'}
              aria-label={panelOpen ? 'Esconder dados do contato' : 'Mostrar dados do contato'}
              aria-expanded={panelOpen}
              onClick={toTogglePanel}
            >
              <IconeDesk nome={panelOpen ? 'seta-direita' : 'seta-esquerda'} />
            </button>
          </div>
        </div>
        <div className="dk-divisor" />
        {conversation.state !== 'encerrada' ? (
          <>
            <div className="dk-etiquetas">
              <button
                type="button"
                className="dk-etiquetas-botao"
                id="add-tags-button"
                onClick={() => setModal('etiquetas')}
              >
                <IconeDesk nome="etiqueta" />
                Adicionar tags
              </button>
              <div className="dk-queue-tags" id="tags-scroll">
                {labelsOfConversation.map((e) => (
                  <span key={e.id} className="dk-chip dk-chip-contorno">
                    {e.nome}
                    <button
                      type="button"
                      className="dk-chip-remover"
                      title={`Remover a etiqueta ${e.nome}`}
                      aria-label={`Remover a etiqueta ${e.nome}`}
                      onClick={() => void removerEtiqueta(e.id)}
                    >
                      <IconeDesk nome="fechar" tamanho={16} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
            <div className="dk-divisor" />
          </>
        ) : null}
        {search !== null ? (
          <div className="dk-search-conversation">
            <label className="dk-campo">
              <span className="dk-campo-icone">
                <IconeDesk nome="busca" />
              </span>
              <input
                autoFocus
                type="search"
                id="search-input-desktop"
                placeholder="Pesquisar nesta conversa"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="dk-botao-icone"
              title="Fechar"
              aria-label="Fechar"
              onClick={() => setSearch(null)}
            >
              <IconeDesk nome="fechar" />
            </button>
            {search ? (
              <div className="dk-search-result">
                <span>
                  {ocorrencias === 0
                    ? 'Nenhum resultado encontrado para '
                    : `${ocorrencias} resultado(s) para `}
                  <b>“{search}”</b>
                </span>
                <span>
                  <button type="button" className="dk-botao-icone" aria-label="Anterior" disabled>
                    <IconeDesk nome="seta-cima" />
                  </button>
                  <button type="button" className="dk-botao-icone" aria-label="Próximo" disabled>
                    <IconeDesk nome="seta-baixo" />
                  </button>
                </span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <Thread
        conversationId={conversation.id}
        itens={itens}
        agora={agora}
        aoReenviar={(id) => void reenviar(id)}
      />
      {error ? (
        <p className="dk-error" style={{ padding: '0 24px' }}>
          {error}
        </p>
      ) : null}
      <Composer
        conversation={conversation}
        respostas={respostas}
        templates={templates}
        agora={agora}
        aoEnviar={() => undefined}
      />

      {modal === 'transferir' ? (
        <ModalTransferir
          conversationId={conversation.id}
          numero={numero}
          colegas={colegas}
          aoFechar={() => setModal(null)}
          aoTransferir={() => {
            setModal(null);
            aoFechar();
          }}
        />
      ) : null}
      {modal === 'finalizar' ? (
        <ModalFinalizar
          conversationId={conversation.id}
          numero={numero}
          etiquetas={etiquetas}
          marcadas={labelsOfConversation.map((e) => e.id)}
          aoFechar={() => setModal(null)}
          aoFinalizar={() => {
            setModal(null);
            aoFechar();
          }}
        />
      ) : null}
      {modal === 'etiquetas' ? (
        <ModalEtiquetas
          conversationId={conversation.id}
          numero={numero}
          etiquetas={etiquetas}
          marcadas={labelsOfConversation.map((e) => e.id)}
          aoFechar={() => setModal(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * `Adicionar tags` on the open conversation mirrors source `ModalType.ADD_TAGS`, separate from `CLOSE_TICKET` (`blip-desk-regras-tecnicas.md` §1.8). Toggle tags without closing: each click persists through `POST`/`DELETE /v1/conversas/:id/etiquetas`. Tags selected here are preselected in Finish because both use `conversa_etiqueta`.
 */
function ModalEtiquetas({
  conversationId,
  numero,
  etiquetas,
  marcadas,
  aoFechar,
}: {
  conversationId: string;
  numero: string;
  etiquetas: EtiquetaDoDesk[];
  marcadas: string[];
  aoFechar: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const aplicadas = new Set(marcadas);

  async function alternar(etiqueta: EtiquetaDoDesk) {
    if (ocupada) return;
    setOcupada(etiqueta.id);
    setError(null);
    try {
      if (aplicadas.has(etiqueta.id)) {
        await api.delete(`/v1/conversations/${conversationId}/labels/${etiqueta.id}`);
      } else {
        await api.post(`/v1/conversations/${conversationId}/labels`, { etiqueta_id: etiqueta.id });
      }
      atualizarLeituras();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível alterar as tags.');
    } finally {
      setOcupada(null);
    }
  }

  return (
    <Modal skin={{ fundo: 'dk-veu', caixa: 'dk-modal' }} rotuloId="modal-title" onFechar={aoFechar}>
      <h2 id="modal-title" style={{ fontSize: 24, fontWeight: 600 }}>
        Adicionar tags ao Ticket {numero}
      </h2>
      {etiquetas.length === 0 ? (
        <p>Nenhuma etiqueta cadastrada para conversas.</p>
      ) : (
        <div className="dk-lista-de-etiquetas" role="group" aria-label="Tags da conversa">
          {etiquetas.map((e) => (
            <label key={e.id} className="dk-option-tag">
              <input
                type="checkbox"
                checked={aplicadas.has(e.id)}
                disabled={ocupada !== null}
                onChange={() => void alternar(e)}
              />
              <span>{e.nome}</span>
            </label>
          ))}
        </div>
      )}
      {error ? <p className="dk-error">{error}</p> : null}
      <div className="dk-modal-actions">
        <button type="button" className="dk-botao" onClick={aoFechar}>
          Concluir
        </button>
      </div>
    </Modal>
  );
}

/**
 * `Transferir atendimento do Ticket #N` (`transfer-modal-content.html`) offers Queue and Agent radio choices, a selector, and `Cancelar` / `Transferir ticket`. As in the reference and `packages/core/src/conversa/maquina.ts`, transfer closes this ticket and opens another.
 */
function ModalTransferir({
  conversationId,
  numero,
  colegas,
  aoFechar,
  aoTransferir,
}: {
  conversationId: string;
  numero: string;
  colegas: Colega[];
  aoFechar: () => void;
  aoTransferir: () => void;
}) {
  const [alvo, setAlvo] = useState<'fila' | 'atendente'>('fila');
  const [queueId, setQueueId] = useState('');
  const [agentId, setAgentId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const queues = useQueues();

  async function transferir() {
    setEnviando(true);
    setError(null);
    try {
      await api.post(`/v1/conversations/${conversationId}/transfer`, {
        ...(alvo === 'fila' ? { forQueueId: queueId } : { forAgentId: agentId }),
      });
      atualizarLeituras();
      aoTransferir();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : `Ops! Houve um erro ao transferir o ticket ${numero}.`,
      );
      setEnviando(false);
    }
  }

  const podeTransferir = alvo === 'fila' ? Boolean(queueId) : Boolean(agentId);

  return (
    <Modal skin={{ fundo: 'dk-veu', caixa: 'dk-modal' }} rotuloId="modal-title" onFechar={aoFechar}>
      <h2 id="modal-title" style={{ fontSize: 24, fontWeight: 600 }}>
        Transferir atendimento do Ticket {numero}
      </h2>
      <div style={{ display: 'flex', gap: 32, marginBottom: 16 }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: 0 }}>
          <input
            type="radio"
            name="alvo"
            checked={alvo === 'fila'}
            onChange={() => setAlvo('fila')}
          />{' '}
          Fila
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: 0 }}>
          <input
            type="radio"
            name="alvo"
            checked={alvo === 'atendente'}
            onChange={() => setAlvo('atendente')}
          />{' '}
          Atendente
        </label>
      </div>
      {alvo === 'fila' ? (
        <>
          <label htmlFor="fila">Fila</label>
          <select id="fila" value={queueId} onChange={(e) => setQueueId(e.target.value)}>
            <option value="">Selecionar fila</option>
            {queues.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </>
      ) : (
        <>
          <label htmlFor="atendente">Atendente</label>
          <select
            id="atendente"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
          >
            <option value="">Selecionar atendente</option>
            {colegas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </>
      )}
      <p style={{ color: 'var(--p-conteudo-desabilitado)', fontSize: 14 }}>
        Escolha a fila que receberá esse atendimento. Lembrando que a transferência gera um novo
        número de ticket.
      </p>
      {error ? <p className="dk-error">{error}</p> : null}
      <div className="dk-modal-actions">
        <button type="button" className="dk-botao dk-botao-secundario" onClick={aoFechar}>
          Cancelar
        </button>
        <button
          type="button"
          className="dk-botao"
          id="confirm-transfer-btn"
          disabled={!podeTransferir || enviando}
          onClick={() => void transferir()}
        >
          Transferir ticket
        </button>
      </div>
    </Modal>
  );
}

/**
 * `Finalizar atendimento do Ticket #N` (`close-modal-container.js`) includes confirmation text, `Adicionar tags`, and `Cancelar` / `Finalizar ticket`. The `api` requires a tag for `POST /encerrar`.
 */
function ModalFinalizar({
  conversationId,
  numero,
  etiquetas,
  marcadas,
  aoFechar,
  aoFinalizar,
}: {
  conversationId: string;
  numero: string;
  etiquetas: EtiquetaDoDesk[];
  marcadas: string[];
  aoFechar: () => void;
  aoFinalizar: () => void;
}) {
  const [etiquetasIds, setEtiquetasIds] = useState(marcadas);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function finalizar() {
    setEnviando(true);
    setError(null);
    try {
      await api.post(`/v1/conversations/${conversationId}/close`, { etiqueta_ids: etiquetasIds });
      atualizarLeituras();
      avisarTicketFinalizado(numero);
      aoFinalizar();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : `Ocorreu um erro na finalização do ticket ${numero}. Por favor, tente finalizá-lo novamente ou recarregue a página.`,
      );
      setEnviando(false);
    }
  }

  return (
    <CardClosureTicket
      numero={numero}
      etiquetas={etiquetas.map((e) => ({
        id: e.id,
        nome: e.nome,
        cor: e.cor,
        requiredInClosure: e.requiredInClosure,
      }))}
      selecionadas={etiquetasIds}
      error={error}
      enviando={enviando}
      aoSelecionar={setEtiquetasIds}
      aoCancelar={aoFechar}
      aoFinalizar={() => void finalizar()}
    />
  );
}


function useQueues(): { id: string; nome: string }[] {
  const read = useRead<{ queues: { id: string; nome: string }[] }>('/v1/desk/queues');
  return read.data?.queues ?? [];
}

/**
 * `Exportar ticket` needs no new backend: all thread `itens` are already loaded, so build a `.txt` transcript and download it in the browser. This is the simple version of reference transcript download (`blip-desk-funcoes.md` §7), without asynchronous email for a 90-day-to-5-year manager report outside this agent screen.
 */
function exportTranscription(numero: string, nome: string, itens: ItemOfConversation[]): void {
  const linhas = itens.map((item) => {
    const hora = new Date(item.criadaEm).toLocaleString('pt-BR');
    if (item.genero === 'nota') return `[${hora}] Nota interna (${item.autor ?? '—'}): ${item.corpo}`;
    const quem = item.direction === 'entrada' ? nome : 'Atendente';
    return `[${hora}] ${quem}: ${item.conteudo ?? `(${item.tipo})`}`;
  });
  const texto = `Ticket ${numero} — ${nome}\n\n${linhas.join('\n')}\n`;
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `ticket-${numero}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
