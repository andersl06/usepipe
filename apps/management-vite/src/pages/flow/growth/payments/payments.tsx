import { Illustration } from '@pipe/ui';
import { IconePortal } from '../../../../components/icones-portal';

/**
 * Growth › Relatório de Pagamentos — `growth/activemessages/paymentsReport` in the origin. Rebuilt from a photo (the owner complained the first version "came out totally different"): the origin doesn't open in the 8790 clone, and the captured HTML doesn't render outside Blip's domain (the `active-campaign-mfe` MFE embeds React with Tailwind classes), so the ruler here is the rendered DOM saved at `referencias-blip/canais/roteador/roteador-relatoriopagamentos__pagina.html`.
 *
 * Two findings that change the previous version's structure:
 * 1. **There's no page title.** `ui-view="content"` receives the MFE directly — no `home-header-testid`, no `<h1>`. The name "Relatório de Pagamentos" only shows up in the sidebar item (`navegacao.tsx`). That's why this version has no `<h1>` — the old one had one the origin doesn't.
 * 2. **It's a two-column side-by-side layout**, not three stacked sections: "Tráfego de mensagens" on the left (two metric cards + one chart card with the legend for the 4 payment methods) and "Pagamentos" on the right (two summary cards side by side + the Top 5 below). Measured: `gap: 32`, cards with `border-radius: 12px; padding: 12px`.
 *
 * The origin shows fixed demo numbers (384,302 messages, R$ 91 million, a Top 5 of fashion products) — sample data for the Blip PRODUCT, not from the captured router. Pipe has no billing for active messages (PIX, card, boleto, link), for real or as a mock: instead of copying the demo numbers (which would look real but aren't), every value shows "—" and the bars don't fake a height — the layout is the same, the data is honest. TODO: once billing integration exists, swap in `lib/growth.ts#relatorioDePagamentos`.
 */
const FORMAS_OF_PAYMENT = [
  { rotulo: 'PIX', cor: 'var(--p-grafico-1)' },
  { rotulo: 'Cartão de crédito', cor: 'var(--p-grafico-2)' },
  { rotulo: 'Boleto', cor: 'var(--p-grafico-3)' },
  { rotulo: 'Link de pagamento', cor: 'var(--p-grafico-4)' },
];

function CardSummary({ rotulo, legenda }: { rotulo: string; legenda: string }) {
  return (
    <div className="pg-card pg-resumo">
      <p className="pg-resumo-rotulo">{rotulo}</p>
      <p className="pg-resumo-legenda">{legenda}</p>
      <p className="pg-summary-value">—</p>
      <div className="pg-barras">
        {FORMAS_OF_PAYMENT.map((forma) => (
          <div className="pg-barra-vertical" key={forma.rotulo}>
            <span className="pg-barra-vertical-cheia" />
            <span className="pg-barra-vertical-rotulo">—</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PaymentsPageReport() {
  return (
    <div className="gr-container pg-page">
      <p className="pg-aviso" role="status">
        O Pipe ainda não recebe dados de pagamento vinculados a mensagens ativas. A disposição
        abaixo segue a mesma da origem — duas colunas, tráfego à esquerda e pagamentos à direita
        —, sem números inventados.
      </p>

      <div className="pg-colunas">
        <section className="pg-column">
          <h2 className="pg-column-title">Tráfego de mensagens</h2>
          <div className="pg-cards">
            <div className="pg-card pg-metrica-linha">
              <div>
                <span className="pg-metrica-rotulo">Enviadas</span>
                <strong className="pg-metric-value">—</strong>
                <div className="pg-barra">
                  <div className="pg-barra-cheia" />
                </div>
              </div>
              <span className="pg-metrica-icone">
                <IconePortal nome="aviao" tamanho={20} />
              </span>
            </div>
            <div className="pg-card pg-metrica-linha">
              <div>
                <span className="pg-metrica-rotulo">Lidas</span>
                <strong className="pg-metric-value">—</strong>
                <div className="pg-barra">
                  <div className="pg-barra-cheia" />
                </div>
              </div>
              <span className="pg-metrica-icone">
                <IconePortal nome="cheque" tamanho={20} />
              </span>
            </div>
          </div>
          <div className="pg-card pg-grafico">
            <h3>Evolução de valores enviados e recebidos</h3>
            <div className="pg-chart-empty">
              <Illustration nome="vazio" tamanho={72} />
              <p>Sem dados suficientes para o gráfico.</p>
            </div>
            <ul className="pg-legenda">
              {FORMAS_OF_PAYMENT.map((forma) => (
                <li key={forma.rotulo}>
                  <span className="pg-legenda-ponto" style={{ background: forma.cor }} />
                  {forma.rotulo}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="pg-column">
          <h2 className="pg-column-title">Pagamentos</h2>
          <div className="pg-par">
            <CardSummary rotulo="Mensagens enviadas" legenda="Quantidade por tipo de pagamento" />
            <CardSummary
              rotulo="Valor estimado de pagamento"
              legenda="Valor total estimado enviado"
            />
          </div>
          <div className="pg-card pg-top5">
            <h3>Top 5 itens mais cobrados</h3>
            <div className="gr-empty">
              <IconePortal nome="pix" tamanho={40} />
              <p>Sem dados de produtos cobrados por mensagem ativa.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
