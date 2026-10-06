import { useEffect, useRef, useState } from 'react';
import type { ItemOfConversation } from '@pipe/contracts';
import { IconeDesk } from '../../components/icones-desk';
import { horarioDoBalao } from '../../lib/format';
import { agrupar, deliverySignal, type Message } from '../../lib/groups';

/**
 * Reference thread `message-list--panechat` (`~/desk-clone/capturas/parciais/thread.html`) groups `.blip-card` bubbles in `.card-group-container` with `.blip-message-group > .blip-card-group.left|right`, with `.group-notification` time on the speaker's side and delivery signal before time for outgoing groups. Put ticket-opening `.ticket .fancy` and `h3` before messages. Show the return-to-bottom button beyond 150px from the bottom (source settings.json `MINIMUM_SCROLL_DISTANCE`).
 */
export function Thread({
  conversationId,
  titulo,
  itens,
  agora,
  aoReenviar,
  onlyRead = false,
}: {
  conversationId: string;
  /** Texto do cabeçalho da conversa (ex.: Ticket #42). */
  titulo: string;
  itens: ItemOfConversation[];
  agora: Date;
  aoReenviar?: (messageId: string) => void;
  onlyRead?: boolean;
}) {
  const rolador = useRef<HTMLDivElement>(null);
  const [longeDoFim, setLongeDoFim] = useState(false);
  const groups = agrupar(itens);

  /* Start at the bottom (`startBottom`) and scroll back to the bottom after each new message. */
  useEffect(() => {
    const el = rolador.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversationId, itens.length]);

  function aoRolar() {
    const el = rolador.current;
    if (!el) return;
    setLongeDoFim(el.scrollHeight - el.scrollTop - el.clientHeight > 150);
  }

  return (
    <div className="dk-conversation-body">
      <div className="dk-thread" ref={rolador} onScroll={aoRolar} tabIndex={-1}>
        <div className="dk-thread-miolo">
          <div className="dk-ticket-linha">
            <p>
              <span>{titulo}</span>
            </p>
          </div>
          {groups.map((g, i) =>
            g.genero === 'nota' ? (
              <div key={g.nota.id} className="dk-nota">
                <b>{g.nota.autor ?? 'Nota interna'}</b>
                {g.nota.corpo}
              </div>
            ) : (
              <BubblesGroup
                key={g.messages[0]?.id ?? i}
                direction={g.direction}
                messages={g.messages}
                agora={agora}
                aoReenviar={onlyRead ? undefined : aoReenviar}
              />
            ),
          )}
        </div>
      </div>
      {longeDoFim ? (
        <button
          type="button"
          className="dk-voltar-fim"
          aria-label="Ir para o fim da conversa"
          onClick={() => {
            const el = rolador.current;
            if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
          }}
        >
          <IconeDesk nome="seta-baixo" />
        </button>
      ) : null}
    </div>
  );
}

function BubblesGroup({
  direction,
  messages,
  agora,
  aoReenviar,
}: {
  direction: 'entrada' | 'saida';
  messages: Message[];
  agora: Date;
  aoReenviar?: (messageId: string) => void;
}) {
  const ultima = messages[messages.length - 1];
  const sinal = direction === 'saida' ? deliverySignal(messages) : null;
  return (
    <div className={`dk-grupo ${direction === 'saida' ? 'dk-grupo-saida' : 'dk-grupo-entrada'}`}>
      {messages.map((m) => (
        <div
          key={m.id}
          className="dk-balao-caixa"
          data-falhou={m.stateDelivery === 'falhou' ? 'true' : 'false'}
        >
          <div
            className="dk-balao"
            tabIndex={0}
            aria-label={`${horarioDoBalao(new Date(m.criadaEm), agora)} ${direction === 'entrada' ? 'Cliente diz:' : 'Agente diz:'} ${m.conteudo ?? ''}`}
          >
            <Conteudo message={m} />
          </div>
          {m.stateDelivery === 'falhou' && aoReenviar ? (
            <button
              type="button"
              className="dk-balao-falha"
              title={m.errorText ?? 'Falha ao enviar a mensagem.'}
              aria-label="Falha ao enviar a mensagem. Reenviar"
              onClick={() => aoReenviar(m.id)}
            >
              <IconeDesk nome="erro" />
            </button>
          ) : null}
        </div>
      ))}
      <div className="dk-grupo-hora" data-delivery={sinal ?? undefined} aria-hidden="true">
        {sinal === 'relogio' ? <IconeDesk nome="relogio" /> : null}
        {sinal === 'check' ? <IconeDesk nome="check" /> : null}
        {sinal === 'duplo-check' || sinal === 'lida' ? <IconeDesk nome="duplo-check" /> : null}
        {sinal === 'erro' ? <IconeDesk nome="erro" /> : null}
        {ultima ? horarioDoBalao(new Date(ultima.criadaEm), agora) : ''}
      </div>
    </div>
  );
}


function Conteudo({ message }: { message: Message }) {
  if (message.tipo === 'texto' || message.tipo === 'template' || !message.tipo) {
    return <div>{message.conteudo ?? ''}</div>;
  }
  if (message.tipo === 'imagem' && message.conteudo?.startsWith('http')) {
    return (
      <img
        src={message.conteudo}
        alt="Imagem enviada"
        style={{ maxWidth: '100%', borderRadius: 8 }}
      />
    );
  }
  const rotulos: Record<string, string> = {
    imagem: 'Imagem',
    audio: 'Mensagem de áudio',
    video: 'Vídeo',
    documento: 'Arquivo',
  };
  return (
    <div>
      {rotulos[message.tipo] ?? 'Conteúdo não suportado'}
      {message.conteudo?.startsWith('http') ? (
        <>
          {' '}
          <a href={message.conteudo} target="_blank" rel="noreferrer">
            abrir
          </a>
        </>
      ) : null}
    </div>
  );
}
