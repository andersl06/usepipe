import { Ilustracao } from '@pipe/ui';
import { IconePortal } from '../../../../componentes/icones-portal';

/**
 * Growth › Relatório de Pagamentos — `growth/activemessages/paymentsReport`
 * na origem. Refeito por foto (dono reclamou que a primeira versão "ficou
 * totalmente diferente"): a origem não abre no clone de 8790 nem o HTML
 * capturado renderiza fora do domínio da Blip (o MFE `active-campaign-mfe`
 * embute React com classes Tailwind), então a régua aqui é o DOM renderizado
 * salvo em `referencias-blip/canais/roteador/roteador-relatoriopagamentos__pagina.html`.
 *
 * Duas descobertas que mudam a estrutura da versão anterior:
 * 1. **Não existe título de página.** O `ui-view="content"` recebe o MFE
 *    direto — sem `home-header-testid`, sem `<h1>`. O nome "Relatório de
 *    Pagamentos" só aparece no item da lateral (`navegacao.tsx`). Por isso
 *    esta versão não tem `<h1>` — a antiga tinha um que a origem não tem.
 * 2. **É um layout de duas colunas lado a lado**, não três seções
 *    empilhadas: "Tráfego de mensagens" à esquerda (dois cartões de métrica
 *    + um cartão de gráfico com a legenda das 4 formas de pagamento) e
 *    "Pagamentos" à direita (dois cartões de resumo lado a lado + o Top 5
 *    embaixo). Medido: `gap: 32`, cartões com `border-radius: 12px;
 *    padding: 12px`.
 *
 * A origem mostra números de demonstração fixos (384.302 mensagens, R$ 91
 * milhões, Top 5 de produtos de moda) — dado de exemplo do PRODUTO Blip, não
 * do roteador capturado. O Pipe não tem cobrança por mensagem ativa (PIX,
 * cartão, boleto, link) nem para valer nem de mentira: em vez de copiar os
 * números de demonstração (que pareceriam reais e não são), cada valor fica
 * em "—" e as barras não fabricam altura — a disposição é a mesma, o dado é
 * honesto. TODO: quando existir a integração de cobrança, trocar por
 * `lib/growth.ts#relatorioDePagamentos`.
 */
const FORMAS_DE_PAGAMENTO = [
  { rotulo: 'PIX', cor: 'var(--p-grafico-1)' },
  { rotulo: 'Cartão de crédito', cor: 'var(--p-grafico-2)' },
  { rotulo: 'Boleto', cor: 'var(--p-grafico-3)' },
  { rotulo: 'Link de pagamento', cor: 'var(--p-grafico-4)' },
];

function CartaoResumo({ rotulo, legenda }: { rotulo: string; legenda: string }) {
  return (
    <div className="pg-cartao pg-resumo">
      <p className="pg-resumo-rotulo">{rotulo}</p>
      <p className="pg-resumo-legenda">{legenda}</p>
      <p className="pg-resumo-valor">—</p>
      <div className="pg-barras">
        {FORMAS_DE_PAGAMENTO.map((forma) => (
          <div className="pg-barra-vertical" key={forma.rotulo}>
            <span className="pg-barra-vertical-cheia" />
            <span className="pg-barra-vertical-rotulo">—</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PaginaRelatorioDePagamentos() {
  return (
    <div className="gr-container pg-pagina">
      <p className="pg-aviso" role="status">
        O Pipe ainda não recebe dados de pagamento vinculados a mensagens ativas. A disposição
        abaixo segue a mesma da origem — duas colunas, tráfego à esquerda e pagamentos à direita
        —, sem números inventados.
      </p>

      <div className="pg-colunas">
        <section className="pg-coluna">
          <h2 className="pg-coluna-titulo">Tráfego de mensagens</h2>
          <div className="pg-cartoes">
            <div className="pg-cartao pg-metrica-linha">
              <div>
                <span className="pg-metrica-rotulo">Enviadas</span>
                <strong className="pg-metrica-valor">—</strong>
                <div className="pg-barra">
                  <div className="pg-barra-cheia" />
                </div>
              </div>
              <span className="pg-metrica-icone">
                <IconePortal nome="aviao" tamanho={20} />
              </span>
            </div>
            <div className="pg-cartao pg-metrica-linha">
              <div>
                <span className="pg-metrica-rotulo">Lidas</span>
                <strong className="pg-metrica-valor">—</strong>
                <div className="pg-barra">
                  <div className="pg-barra-cheia" />
                </div>
              </div>
              <span className="pg-metrica-icone">
                <IconePortal nome="cheque" tamanho={20} />
              </span>
            </div>
          </div>
          <div className="pg-cartao pg-grafico">
            <h3>Evolução de valores enviados e recebidos</h3>
            <div className="pg-grafico-vazio">
              <Ilustracao nome="vazio" tamanho={72} />
              <p>Sem dados suficientes para o gráfico.</p>
            </div>
            <ul className="pg-legenda">
              {FORMAS_DE_PAGAMENTO.map((forma) => (
                <li key={forma.rotulo}>
                  <span className="pg-legenda-ponto" style={{ background: forma.cor }} />
                  {forma.rotulo}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="pg-coluna">
          <h2 className="pg-coluna-titulo">Pagamentos</h2>
          <div className="pg-par">
            <CartaoResumo rotulo="Mensagens enviadas" legenda="Quantidade por tipo de pagamento" />
            <CartaoResumo
              rotulo="Valor estimado de pagamento"
              legenda="Valor total estimado enviado"
            />
          </div>
          <div className="pg-cartao pg-top5">
            <h3>Top 5 itens mais cobrados</h3>
            <div className="gr-vazio">
              <IconePortal nome="pix" tamanho={40} />
              <p>Sem dados de produtos cobrados por mensagem ativa.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
