import { useEffect, useState } from 'react';
import type { QueueOfDesk, ResponseOfConversation } from '@pipe/contracts';
import { useRead } from '../../lib/query';
import { deliveryInterval } from '../../lib/delivery-interval';
import { useDeskSelection } from '../../context/desk-selection';
import { IconeDesk } from '../../components/icones-desk';
import { Column } from './column';
import { Conversation } from './conversation';
import { Panel } from './panel';

/**
 * Attendance screen at `/` and `/chat/:id` follows three reference columns: `.sidenav` (25%), `.pane-chat` (50%), `.drawer` (25%). Poll `GET /v1/desk/fila` and `GET /v1/desk/conversas/:id` every 15s, matching source `POLLING_INTERVAL` in settings.json. Advance `agora` every second for relative times and timers. Center states follow source `pane-chat`: `Buscando tickets` before queue load; `Fique online para atender` with a reason when invisible/paused without tickets; `Tudo pronto para atender` without selection; then the conversation.
 */
const POLLING_INTERVAL = 15_000;

export function PageAttendances() {
  const { conversationId: id, openConversation, closeConversation } = useDeskSelection();
  const [agora, setAgora] = useState(() => new Date());
  const [panelOpen, setPanelOpen] = useState(true);

  const queue = useRead<QueueOfDesk>('/v1/desk/queue', { refetchInterval: POLLING_INTERVAL });
  const conversation = useRead<ResponseOfConversation>(id ? `/v1/desk/conversations/${id}` : null, {
    refetchInterval: (query) => deliveryInterval(query.state.data?.aberta?.itens),
  });

  useEffect(() => {
    const relogio = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(relogio);
  }, []);

  /* Conversa que não é do atendente (ou não existe) limpa a seleção, como lá. */
  useEffect(() => {
    if (id && conversation.data && conversation.data.aberta === null) closeConversation();
  }, [id, conversation.data, closeConversation]);

  const aberta = id ? (conversation.data?.aberta ?? null) : null;
  const state = queue.data?.status.estado;

  return (
    <div
      className="dk-app-colunas"
      style={{ display: 'contents' }}
      data-panel={panelOpen ? 'open' : 'closed'}
    >
      {queue.data ? (
        <Column
          queue={queue.data}
          agora={agora}
          selecionada={id ?? null}
          aoAbrir={(c) => openConversation(c)}
        />
      ) : (
        <div className="dk-column">
          <div className="dk-column-header">
            <h1 className="dk-column-title">Atendimentos</h1>
            <div className="dk-modo">Lista</div>
          </div>
          <div className="dk-status" />
          <div className="dk-girando dk-girando-pequeno" aria-label="Carregando" />
        </div>
      )}

      {!queue.data ? (
        <div className="dk-conversation">
          <div className="dk-conversation-empty">
            <div className="dk-girando" aria-hidden="true" />
            <h1 id="loading-tickets-text">Buscando tickets</h1>
          </div>
        </div>
      ) : aberta ? (
        <Conversation
          aberta={aberta}
          respostas={queue.data.respostas}
          etiquetas={queue.data.etiquetas}
          colegas={queue.data.colegas}
          agora={agora}
          panelOpen={panelOpen}
          toTogglePanel={() => setPanelOpen((v) => !v)}
          aoFechar={() => closeConversation()}
        />
      ) : id && conversation.isPending ? (
        <div className="dk-conversation">
          <div className="dk-conversation-empty">
            <div className="dk-girando" aria-hidden="true" />
          </div>
        </div>
      ) : (state === 'invisivel' || state === 'pausa') && queue.data.conversations.length === 0 ? (
        <div className="dk-conversation">
          <div className="dk-conversation-empty">
            <div className="dk-illustration" aria-hidden="true">
              <IconeDesk nome="olho-fechado" />
            </div>
            <h1 className="dk-conversa-titulo">Fique online para atender</h1>
            <p>
              {state === 'pausa'
                ? 'Você está em pausa.'
                : 'Você está invisível e não consigo te ver (rimou!)'}
            </p>
          </div>
        </div>
      ) : (
        <div className="dk-conversation">
          <div className="dk-conversation-empty">
            <div className="dk-illustration" aria-hidden="true">
              <IconeDesk nome="atendimentos" />
            </div>
            <h1 className="dk-conversa-titulo">Tudo pronto para atender</h1>
            <p>Escolha um ticket na lista ao lado para abrir a conversa</p>
          </div>
        </div>
      )}

      {panelOpen ? <Panel aberta={aberta} agora={agora} /> : null}
    </div>
  );
}
