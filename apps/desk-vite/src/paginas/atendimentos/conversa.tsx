import { useState } from 'react';
import type { Colega, ConversaDoDesk, EtiquetaDoDesk, RespostaProntaDoDesk } from '@pipe/contracts';
import { IconeDesk } from '../../componentes/icones-desk';
import { Avatar } from '../../componentes/avatar';
import { api } from '../../lib/api';
import { useLeitura } from '../../lib/consulta';
import { atualizarLeituras } from '../../lib/acoes';
import { numeroDoTicket } from '../../lib/canal';
import { nomeDeExibicao } from '../../lib/ordem';
import { Thread } from './thread';
import { Compositor } from './compositor';

/**
 * O painel da conversa — `.pane-chat` da referência
 * (`~/desk-clone/capturas/parciais/header-conversa.html`, `thread.html`,
 * `composer.html`): cabeçalho com rosto, nome e "Ticket: · Bot: · Fila:", as
 * ações (ligação, pesquisar, transferir, Finalizar, ⋮) e o botão que abre e
 * fecha o painel do contato; a faixa de etiquetas; a busca na conversa; a
 * thread; o compositor.
 *
 * Transferir e Finalizar abrem os modais de lá (`transfer-modal-content`,
 * `close-modal-container`) e chamam `POST /v1/conversas/:id/transferir` e
 * `/encerrar`; a espera vai em `/espera` pelo menu ⋮ ("Modo de Espera").
 */
export function Conversa({
  aberta,
  respostas,
  etiquetas,
  colegas,
  agora,
  painelAberto,
  aoAlternarPainel,
  aoFechar,
}: {
  aberta: ConversaDoDesk;
  respostas: RespostaProntaDoDesk[];
  etiquetas: EtiquetaDoDesk[];
  colegas: Colega[];
  agora: Date;
  painelAberto: boolean;
  aoAlternarPainel: () => void;
  aoFechar: (proximaId?: string) => void;
}) {
  const { conversa, itens, templates, etiquetasDaConversa } = aberta;
  const [modal, setModal] = useState<'transferir' | 'finalizar' | null>(null);
  const [menu, setMenu] = useState(false);
  const [busca, setBusca] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const nome = nomeDeExibicao(conversa);
  const numero = numeroDoTicket(conversa.id);

  async function alternarEspera() {
    setMenu(false);
    setErro(null);
    try {
      await api.post(`/v1/conversas/${conversa.id}/espera`);
      atualizarLeituras();
    } catch (e) {
      setErro(
        e instanceof Error ? e.message : `Falha ao mudar o ticket ${numero} de Modo de Espera`,
      );
    }
  }

  async function reenviar(mensagemId: string) {
    setErro(null);
    try {
      await api.post(`/v1/conversas/${conversa.id}/mensagens/${mensagemId}/reenviar`);
      atualizarLeituras();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Ocorreu um erro ao enviar a mensagem.');
    }
  }

  const ocorrencias = busca
    ? itens.filter(
        (i) =>
          i.genero === 'mensagem' && (i.conteudo ?? '').toLowerCase().includes(busca.toLowerCase()),
      ).length
    : 0;

  return (
    <div className="dk-conversa" id="pane-chat-div">
      <div className="dk-conversa-cabecalho">
        <div className="dk-conversa-cabecalho-miolo">
          <div className="dk-conversa-contato">
            <Avatar nome={nome} tamanho={56} />
            <div
              className="dk-conversa-dados"
              tabIndex={0}
              role="region"
              aria-label={`Dados do atendimento: ${nome}`}
            >
              <span className="dk-conversa-nome" id="customer-name">
                {nome}
              </span>
              <span className="dk-conversa-ticket">
                <span>
                  <b>Ticket:</b>
                  <i id="ticket-sequential-id">{numero}</i>
                </span>
                <span className="dk-some-medio">
                  <b>Fila:</b>
                  <i id="ticket-team">{conversa.filaNome ?? 'Transferência direta'}</i>
                </span>
              </span>
            </div>
          </div>
          <div className="dk-conversa-acoes">
            {/* ponytail: "Ligação Ativa" depende do MFE de chamadas; o botão fica onde a referência o põe. */}
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
              aria-pressed={busca !== null}
              onClick={() => setBusca((b) => (b === null ? '' : null))}
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
                    {conversa.estado === 'em_espera'
                      ? 'Remover do Modo de Espera'
                      : 'Modo de Espera'}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="dk-menu-item"
                    onClick={() => setMenu(false)}
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
              title={painelAberto ? 'Esconder dados do contato' : 'Mostrar dados do contato'}
              aria-label={painelAberto ? 'Esconder dados do contato' : 'Mostrar dados do contato'}
              aria-expanded={painelAberto}
              onClick={aoAlternarPainel}
            >
              <IconeDesk nome={painelAberto ? 'seta-direita' : 'seta-esquerda'} />
            </button>
          </div>
        </div>
        <div className="dk-divisor" />
        {etiquetasDaConversa.length > 0 ? (
          <>
            <div className="dk-etiquetas">
              <button
                type="button"
                className="dk-etiquetas-botao"
                onClick={() => setModal('finalizar')}
              >
                <IconeDesk nome="etiqueta" />
                Adicionar tags
              </button>
              <div className="dk-etiquetas-fila" id="tags-scroll">
                {etiquetasDaConversa.map((e) => (
                  <span key={e.id} className="dk-chip dk-chip-contorno">
                    {e.nome}
                  </span>
                ))}
              </div>
            </div>
            <div className="dk-divisor" />
          </>
        ) : null}
        {busca !== null ? (
          <div className="dk-busca-conversa">
            <label className="dk-campo">
              <span className="dk-campo-icone">
                <IconeDesk nome="busca" />
              </span>
              <input
                autoFocus
                type="search"
                id="search-input-desktop"
                placeholder="Pesquisar nesta conversa"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="dk-botao-icone"
              title="Fechar"
              aria-label="Fechar"
              onClick={() => setBusca(null)}
            >
              <IconeDesk nome="fechar" />
            </button>
            {busca ? (
              <div className="dk-busca-resultado">
                <span>
                  {ocorrencias === 0
                    ? 'Nenhum resultado encontrado para '
                    : `${ocorrencias} resultado(s) para `}
                  <b>“{busca}”</b>
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
        conversaId={conversa.id}
        itens={itens}
        agora={agora}
        aoReenviar={(id) => void reenviar(id)}
      />
      {erro ? (
        <p className="dk-erro" style={{ padding: '0 24px' }}>
          {erro}
        </p>
      ) : null}
      <Compositor
        conversa={conversa}
        respostas={respostas}
        templates={templates}
        agora={agora}
        aoEnviar={() => undefined}
      />

      {modal === 'transferir' ? (
        <ModalTransferir
          conversaId={conversa.id}
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
          conversaId={conversa.id}
          numero={numero}
          etiquetas={etiquetas}
          marcadas={etiquetasDaConversa.map((e) => e.id)}
          aoFechar={() => setModal(null)}
          aoFinalizar={() => {
            setModal(null);
            aoFechar();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * "Transferir atendimento do Ticket #N" (`transfer-modal-content.html`):
 * dois rádios, Fila e Atendente, e um seletor; "Cancelar" / "Transferir
 * ticket". A regra de lá (e a nossa, `packages/core/src/conversa/maquina.ts`):
 * a transferência encerra este ticket e abre outro.
 */
function ModalTransferir({
  conversaId,
  numero,
  colegas,
  aoFechar,
  aoTransferir,
}: {
  conversaId: string;
  numero: string;
  colegas: Colega[];
  aoFechar: () => void;
  aoTransferir: () => void;
}) {
  const [alvo, setAlvo] = useState<'fila' | 'atendente'>('fila');
  const [filaId, setFilaId] = useState('');
  const [atendenteId, setAtendenteId] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const filas = useFilas();

  async function transferir() {
    setEnviando(true);
    setErro(null);
    try {
      await api.post(`/v1/conversas/${conversaId}/transferir`, {
        ...(alvo === 'fila' ? { para_fila_id: filaId } : { para_atendente_id: atendenteId }),
      });
      atualizarLeituras();
      aoTransferir();
    } catch (e) {
      setErro(
        e instanceof Error ? e.message : `Ops! Houve um erro ao transferir o ticket ${numero}.`,
      );
      setEnviando(false);
    }
  }

  const podeTransferir = alvo === 'fila' ? Boolean(filaId) : Boolean(atendenteId);

  return (
    <div className="dk-veu" role="presentation" onClick={aoFechar}>
      <div
        className="dk-modal"
        role="dialog"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()}
      >
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
            <select id="fila" value={filaId} onChange={(e) => setFilaId(e.target.value)}>
              <option value="">Selecionar fila</option>
              {filas.map((f) => (
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
              value={atendenteId}
              onChange={(e) => setAtendenteId(e.target.value)}
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
        {erro ? <p className="dk-erro">{erro}</p> : null}
        <div className="dk-modal-acoes">
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
      </div>
    </div>
  );
}

/**
 * "Finalizar atendimento do Ticket #N" (`close-modal-container.js`): as
 * frases de confirmação, o campo "Adicionar tags" e "Cancelar" / "Finalizar
 * ticket". A etiqueta é obrigatória na `api` (`POST /encerrar`).
 */
function ModalFinalizar({
  conversaId,
  numero,
  etiquetas,
  marcadas,
  aoFechar,
  aoFinalizar,
}: {
  conversaId: string;
  numero: string;
  etiquetas: EtiquetaDoDesk[];
  marcadas: string[];
  aoFechar: () => void;
  aoFinalizar: () => void;
}) {
  const [etiquetaId, setEtiquetaId] = useState(marcadas[0] ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function finalizar() {
    setEnviando(true);
    setErro(null);
    try {
      await api.post(`/v1/conversas/${conversaId}/encerrar`, { etiqueta_id: etiquetaId });
      atualizarLeituras();
      aoFinalizar();
    } catch (e) {
      setErro(
        e instanceof Error
          ? e.message
          : `Ocorreu um erro na finalização do ticket ${numero}. Por favor, tente finalizá-lo novamente ou recarregue a página.`,
      );
      setEnviando(false);
    }
  }

  return (
    <div className="dk-veu" role="presentation" onClick={aoFechar}>
      <div
        className="dk-modal"
        role="dialog"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="modal-title" style={{ fontSize: 24, fontWeight: 600 }}>
          Finalizar atendimento do Ticket {numero}
        </h2>
        <p>Finalizar o atendimento zera as ações do usuário com o bot.</p>
        <p>Novas interações geram um novo Ticket.</p>
        <p>
          <b>Deseja continuar?</b>
        </p>
        <label htmlFor="etiqueta">Adicionar tags</label>
        <select id="etiqueta" value={etiquetaId} onChange={(e) => setEtiquetaId(e.target.value)}>
          <option value="">Tags</option>
          {etiquetas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>
        {erro ? <p className="dk-erro">{erro}</p> : null}
        <div className="dk-modal-acoes">
          <button type="button" className="dk-botao dk-botao-secundario" onClick={aoFechar}>
            Cancelar
          </button>
          <button
            type="button"
            className="dk-botao"
            disabled={!etiquetaId || enviando}
            onClick={() => void finalizar()}
          >
            Finalizar ticket
          </button>
        </div>
      </div>
    </div>
  );
}

/** As filas do tenant, para o seletor de transferência (`GET /v1/desk/filas`). */
function useFilas(): { id: string; nome: string }[] {
  const leitura = useLeitura<{ filas: { id: string; nome: string }[] }>('/v1/desk/filas');
  return leitura.data?.filas ?? [];
}
