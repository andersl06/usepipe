import { IconePortal } from '../../../../componentes/icones-portal';

/**
 * Growth › Relatório de Pagamentos — `growth/activemessages/paymentsReport`
 * na origem (LEIA.md, rodada 3). Lá o próprio microfrontend avisa "Essa é uma
 * demonstração": os números (384.302 mensagens, R$ 91 milhões, top 5 de
 * produtos) são dado de exemplo do PRODUTO Blip, não do roteador capturado.
 *
 * A estrutura reproduzida é a de lá — "Tráfego de mensagens", "Pagamentos" e
 * "Top 5 itens mais cobrados" —, mas o Pipe não tem cobrança por mensagem
 * ativa (PIX/cartão/boleto/link) nem para valer nem de mentira. Em vez de
 * copiar os números de demonstração da Blip (que pareceriam reais e não
 * são), cada seção mostra o estado vazio honesto. TODO: quando existir a
 * integração de cobrança, trocar por `lib/growth.ts#relatorioDePagamentos`.
 */
export default function PaginaRelatorioDePagamentos() {
  return (
    <div className="gr-container">
      <div className="gr-cabeca">
        <div>
          <h1>Relatório de Pagamentos</h1>
          <p>Pagamentos vinculados a mensagens ativas, por PIX, cartão, boleto e link.</p>
        </div>
      </div>

      <p className="pg-aviso" role="status">
        O Pipe ainda não recebe dados de pagamento vinculados a mensagens ativas. As seções abaixo
        seguem a mesma estrutura da origem, sem números inventados.
      </p>

      <section className="pg-secao">
        <h2>Tráfego de mensagens</h2>
        <div className="pg-metricas">
          <div className="gr-metrica">
            <span>Enviadas</span>
            <strong>—</strong>
          </div>
          <div className="gr-metrica">
            <span>Lidas</span>
            <strong>—</strong>
          </div>
        </div>
      </section>

      <section className="pg-secao">
        <h2>Pagamentos</h2>
        <div className="pg-metricas">
          <div className="gr-metrica">
            <span>Mensagens enviadas</span>
            <strong>—</strong>
          </div>
          <div className="gr-metrica">
            <span>Valor estimado de pagamento</span>
            <strong>—</strong>
          </div>
        </div>
      </section>

      <section className="pg-secao">
        <h2>Top 5 itens mais cobrados</h2>
        <div className="gr-vazio">
          <IconePortal nome="pix" tamanho={40} />
          <p>Sem dados de produtos cobrados por mensagem ativa.</p>
        </div>
      </section>
    </div>
  );
}
