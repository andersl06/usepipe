import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { QueueOfDesk, ResponseOfConversation } from '@pipe/contracts';
import { useRead } from '../../lib/query';
import { deliveryInterval } from '../../lib/delivery-interval';
import { IconeDesk } from '../../components/icones-desk';
import { Column } from './column';
import { Conversation } from './conversation';
import { Panel } from './panel';

/**
 * A tela de Atendimentos — `/` e `/chat/:id` — nas três colunas da
 * referência: `.sidenav` (25%), `.pane-chat` (50%), `.drawer` (25%).
 *
 * A fila (`GET /v1/desk/fila`) é recarregada a cada 15 s — o
 * `POLLING_INTERVAL` do settings.json de lá — e a conversa aberta
 * (`GET /v1/desk/conversas/:id`) também. O relógio `agora` avança a cada
 * segundo para os horários relativos e os cronômetros.
 *
 * Os estados do meio, na ordem da função de desenho `pane-chat` de lá:
 * "Buscando tickets" enquanto a fila não veio; "Fique online para atender"
 * com o motivo quando está invisível/em pausa e sem tickets; "Tudo pronto
 * para atender" sem conversa escolhida; e a conversa.
 */
const POLLING_INTERVAL = 15_000;

export function PageAttendances() {
  const { id } = useParams();
  const navegar = useNavigate();
  const [agora, setAgora] = useState(() => new Date());
  const [panelAberto, setPanelAberto] = useState(true);

  const queue = useRead<QueueOfDesk>('/v1/desk/queue', { refetchInterval: POLLING_INTERVAL });
  const conversation = useRead<ResponseOfConversation>(id ? `/v1/desk/conversations/${id}` : null, {
    refetchInterval: (query) => deliveryInterval(query.state.data?.aberta?.itens),
  });

  useEffect(() => {
    const relogio = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(relogio);
  }, []);

  /* Conversa que não é do atendente (ou não existe) volta para a lista, como lá. */
  useEffect(() => {
    if (id && conversation.data && conversation.data.aberta === null) navegar('/', { replace: true });
  }, [id, conversation.data, navegar]);

  const aberta = id ? (conversation.data?.aberta ?? null) : null;
  const state = queue.data?.status.estado;

  return (
    <div
      className="dk-app-colunas"
      style={{ display: 'contents' }}
      data-painel={panelAberto ? 'aberto' : 'fechado'}
    >
      {queue.data ? (
        <Column
          queue={queue.data}
          agora={agora}
          selecionada={id ?? null}
          aoAbrir={(c) => navegar(`/chat/${c}`)}
        />
      ) : (
        <div className="dk-coluna">
          <div className="dk-coluna-cabecalho">
            <h1 className="dk-coluna-titulo">Atendimentos</h1>
            <div className="dk-modo">Lista</div>
          </div>
          <div className="dk-estado" />
          <div className="dk-girando dk-girando-pequeno" aria-label="Carregando" />
        </div>
      )}

      {!queue.data ? (
        <div className="dk-conversa">
          <div className="dk-conversa-vazia">
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
          panelAberto={panelAberto}
          toAlternarPanel={() => setPanelAberto((v) => !v)}
          aoFechar={() => navegar('/')}
        />
      ) : id && conversation.isPending ? (
        <div className="dk-conversa">
          <div className="dk-conversa-vazia">
            <div className="dk-girando" aria-hidden="true" />
          </div>
        </div>
      ) : (state === 'invisivel' || state === 'pausa') && queue.data.conversations.length === 0 ? (
        <div className="dk-conversa">
          <div className="dk-conversa-vazia">
            <div className="dk-ilustracao" aria-hidden="true">
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
        <div className="dk-conversa">
          <div className="dk-conversa-vazia">
            <div className="dk-ilustracao" aria-hidden="true">
              <IconeDesk nome="atendimentos" />
            </div>
            <h1 className="dk-conversa-titulo">Tudo pronto para atender</h1>
            <p>Escolha um ticket na lista ao lado para abrir a conversa</p>
          </div>
        </div>
      )}

      {panelAberto ? <Panel aberta={aberta} agora={agora} /> : null}
    </div>
  );
}
