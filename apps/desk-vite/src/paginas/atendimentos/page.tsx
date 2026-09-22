import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { FilaDoDesk, RespostaDaConversa } from '@pipe/contracts';
import { useLeitura } from '../../lib/consulta';
import { intervaloDaEntrega } from '../../lib/intervalo-entrega';
import { IconeDesk } from '../../componentes/icones-desk';
import { Coluna } from './coluna';
import { Conversa } from './conversa';
import { Painel } from './painel';

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

export function PaginaAtendimentos() {
  const { id } = useParams();
  const navegar = useNavigate();
  const [agora, setAgora] = useState(() => new Date());
  const [painelAberto, setPainelAberto] = useState(true);

  const fila = useLeitura<FilaDoDesk>('/v1/desk/fila', { refetchInterval: POLLING_INTERVAL });
  const conversa = useLeitura<RespostaDaConversa>(id ? `/v1/desk/conversas/${id}` : null, {
    refetchInterval: (query) => intervaloDaEntrega(query.state.data?.aberta?.itens),
  });

  useEffect(() => {
    const relogio = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(relogio);
  }, []);

  /* Conversa que não é do atendente (ou não existe) volta para a lista, como lá. */
  useEffect(() => {
    if (id && conversa.data && conversa.data.aberta === null) navegar('/', { replace: true });
  }, [id, conversa.data, navegar]);

  const aberta = id ? (conversa.data?.aberta ?? null) : null;
  const estado = fila.data?.status.estado;

  return (
    <div
      className="dk-app-colunas"
      style={{ display: 'contents' }}
      data-painel={painelAberto ? 'aberto' : 'fechado'}
    >
      {fila.data ? (
        <Coluna
          fila={fila.data}
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

      {!fila.data ? (
        <div className="dk-conversa">
          <div className="dk-conversa-vazia">
            <div className="dk-girando" aria-hidden="true" />
            <h1 id="loading-tickets-text">Buscando tickets</h1>
          </div>
        </div>
      ) : aberta ? (
        <Conversa
          aberta={aberta}
          respostas={fila.data.respostas}
          etiquetas={fila.data.etiquetas}
          colegas={fila.data.colegas}
          agora={agora}
          painelAberto={painelAberto}
          aoAlternarPainel={() => setPainelAberto((v) => !v)}
          aoFechar={() => navegar('/')}
        />
      ) : id && conversa.isPending ? (
        <div className="dk-conversa">
          <div className="dk-conversa-vazia">
            <div className="dk-girando" aria-hidden="true" />
          </div>
        </div>
      ) : (estado === 'invisivel' || estado === 'pausa') && fila.data.conversas.length === 0 ? (
        <div className="dk-conversa">
          <div className="dk-conversa-vazia">
            <div className="dk-ilustracao" aria-hidden="true">
              <IconeDesk nome="olho-fechado" />
            </div>
            <h1 className="dk-conversa-titulo">Fique online para atender</h1>
            <p>
              {estado === 'pausa'
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

      {painelAberto ? <Painel aberta={aberta} agora={agora} /> : null}
    </div>
  );
}
