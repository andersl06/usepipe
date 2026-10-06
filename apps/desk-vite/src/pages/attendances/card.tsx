import { useState } from 'react';
import type { ConversationOfList } from '@pipe/contracts';
import { LogoPortal } from '@pipe/ui/icones-portal';
import { IconeDesk } from '../../components/icones-desk';
import { Avatar } from '../../components/avatar';
import { executar } from '../../lib/actions';
import { ticketNumber } from '@pipe/contracts';
import { channelOf } from '../../lib/channel';
import { cronometro, horarioRelativo } from '../../lib/format';
import { fixada, naoLida, displayName } from '../../lib/order';
import { isClosedTicket } from '../../lib/situation';

/**
 * Reference `<article class="chat-list-item">` list card (`~/desk-clone/capturas/parciais/card-lista.html`, `templates/chat-list-item.html`): upper `.ticket-content` has a `small` avatar and channel badge, name and relative time, message preview, and alert line; lower `.ticket-info` has info icon, `#N`, queue name, and ⋮ menu. Name and preview use `bold="bold"` when unread. The source `TicketMenuOptions` (`PIN`/`UNPIN`, `UNREAD`/`READ`, `blip-desk-regras-tecnicas.md` §1.8) pins and marks unread per agent via `POST /v1/desk/acoes/fixar` and `/marcarNaoLida`. `Modo de Espera` stays in the open-conversation menu.
 */
export function Card({
  conversation,
  selecionada,
  agora,
  aoAbrir,
  aoFalhar,
}: {
  conversation: ConversationOfList;
  selecionada: boolean;
  agora: Date;
  aoAbrir: (id: string) => void;

  aoFalhar?: (error: string) => void;
}) {
  const [menu, setMenu] = useState(false);
  const channel = channelOf(conversation.canalTipo);
  const nome = displayName({
    contactName: conversation.contatoNome,
    contactPhone: conversation.contatoTelefone,
  });
  const naoLidaAgora = naoLida(conversation);
  const fixadaAgora = fixada(conversation);
  const nova = conversation.primeiraRespostaEm === null;

  async function marcar(acao: 'fixar' | 'marcarNaoLida', value: boolean) {
    setMenu(false);
    const campos: Record<string, string> =
      acao === 'fixar'
        ? { conversaId: conversation.id, fixada: String(value) }
        : { conversaId: conversation.id, naoLida: String(value) };
    const r = await executar(acao, campos);
    if (!r.ok) aoFalhar?.(r.error ?? 'Não foi possível marcar a conversa.');
  }
  const emEspera = conversation.emStandby;
  const segundosEmEspera =
    emEspera && conversation.emEsperaDesde
      ? (agora.getTime() - new Date(conversation.emEsperaDesde).getTime()) / 1000
      : 0;
  const ultima = conversation.ultimaMensagemEm ? new Date(conversation.ultimaMensagemEm) : null;

  return (
    <article
      className="dk-card"
      role="listitem"
      tabIndex={0}
      aria-label={`Ticket ${ticketNumber(conversation.sequentialId)} - ${nome}`}
      aria-current={selecionada ? 'true' : undefined}
      data-nao-lida={naoLidaAgora ? 'true' : 'false'}
      onClick={() => aoAbrir(conversation.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') aoAbrir(conversation.id);
      }}
    >
      <section className="dk-card-content" tabIndex={-1}>
        <div className="dk-card-face">
          <Avatar />
          <span className="dk-channel" title={channel.nome}>
            <LogoPortal nome={channel.logo} tamanho={20} />
          </span>
        </div>
        <div className="dk-card-text">
          <div className="dk-card-line">
            <h1 className="dk-card-name" aria-hidden="true">
              {nome}
            </h1>
            <span className="dk-card-hour">
              {ultima ? horarioRelativo(ultima, agora) : ''}
              {isClosedTicket(conversation.estado) ? (
                <span className="dk-card-status" title="Cliente encerrou o atendimento">
                  <IconeDesk nome="encerrado-pelo-cliente" />
                </span>
              ) : null}
            </span>
          </div>
          <div className="dk-card-line">
            <p className="dk-card-preview" aria-hidden="true">
              {previa(conversation)}
            </p>
            <div className="dk-card-alerts">
              {fixadaAgora ? (
                <span className="dk-card-pinned" title="Fixada no topo" aria-label="Fixada no topo">
                  <IconeDesk nome="fixar" />
                </span>
              ) : null}
              {nova ? <span className="dk-chip dk-chip-info">Novo</span> : null}
              {emEspera ? (
                <span className="dk-chip dk-chip-alerta" title="Em espera">
                  <IconeDesk nome="pausa" />
                  {cronometro(segundosEmEspera).slice(3)}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </section>
      <section className="dk-card-info">
        <button
          type="button"
          className="dk-card-info-button"
          tabIndex={-1}
          aria-label="Informações do ticket"
          onClick={(e) => e.stopPropagation()}
        >
          <IconeDesk nome="info" />
        </button>
        <span className="dk-card-number" aria-hidden="true">
          {ticketNumber(conversation.sequentialId)}
        </span>
        <span className="dk-card-queue">
          <b>Fila:</b>
          <span>{conversation.filaNome ?? 'Transferência direta'}</span>
        </span>
        <div className="dk-card-menu-box" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="dk-card-menu"
            aria-label="Mais opções"
            aria-expanded={menu}
            onClick={() => setMenu((m) => !m)}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <IconeDesk nome="mais-opcoes" />
          </button>
          {menu ? (
            <div
              className="dk-menu dk-card-menu-list"
              role="menu"
              onMouseLeave={() => setMenu(false)}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                role="menuitem"
                className="dk-menu-item"
                onClick={() => void marcar('fixar', !fixadaAgora)}
              >
                <IconeDesk nome="fixar" tamanho={20} />
                {fixadaAgora ? 'Desafixar' : 'Fixar no topo'}
              </button>
              <button
                type="button"
                role="menuitem"
                className="dk-menu-item"
                onClick={() => void marcar('marcarNaoLida', conversation.naoLidaEm === null)}
              >
                <IconeDesk nome="notificacao" tamanho={20} />
                {conversation.naoLidaEm !== null ? 'Marcar como lida' : 'Marcar como não lida'}
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </article>
  );
}


function previa(c: ConversationOfList): string {
  if (c.lastMessageType && c.lastMessageType !== 'texto') {
    const tipos: Record<string, string> = {
      imagem: 'Imagem',
      audio: 'Áudio',
      video: 'Vídeo',
      documento: 'Arquivo',
      template: c.lastMessage ?? 'Modelo de mensagem',
    };
    return tipos[c.lastMessageType] ?? c.lastMessage ?? '';
  }
  return c.lastMessage ?? '';
}
