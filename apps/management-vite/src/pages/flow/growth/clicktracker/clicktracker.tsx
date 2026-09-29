import { Illustration } from '@pipe/ui';
import { IconePortal, LogoPortal } from '@pipe/ui/icones-portal';

/*
 * The Click Tracker panel as the `portal-fragment-click-tracker` microfrontend renders it on the `growth/clicktracker` route (measured on the copy with a ruler): fs-32 title with a tooltip, "Evento de conversão" + "Período analisado", the event field with an edit chip and a From/To picker, the token field (status stripe, logo, "Token de acesso à Marketing API" / "Conectado", "Alterar token"), a divider, "Desempenho resumido de seus anúncios" with four indicators, and the empty state "Nenhum dado encontrado". The "Eventos de otimização" screen is another origin route (`growth/conversation-settings/events`).
 * ponytail: nothing here connects an external account or fires an event; it's visual only.
 */

const INDICADORES = [
  { rotulo: 'Total de anúncios', valor: '0', rodape: null, alerta: false },
  { rotulo: 'Conversas iniciadas', valor: '0', rodape: 'Custo médio por conversa:', alerta: false },
  { rotulo: 'Total de conversão', valor: null, rodape: 'Custo médio por conversão:', alerta: true },
  { rotulo: 'Taxa média de conversão', valor: null, rodape: null, alerta: true },
];

function periodAnalyzed(hoje: Date) {
  const inicio = new Date(hoje);
  inicio.setDate(inicio.getDate() - 7);
  return { de: inicio.toLocaleDateString('pt-BR'), ate: hoje.toLocaleDateString('pt-BR') };
}

export default function PageClickTracker() {
  const period = periodAnalyzed(new Date());
  return (
    <div className="ck-page">
      <div className="ck-topo">
        <div className="ck-espaco" />
        <div className="ck-linha">
          <div className="ck-container">
            <div className="ck-col-8 ck-titulo-linha">
              <h1 className="ck-titulo">Click Tracker</h1>
              <span className="ck-dica-titulo">
                <button
                  className="ck-botao-icone"
                  type="button"
                  title="Sobre o Click Tracker"
                  aria-label="Sobre o Click Tracker"
                >
                  <IconePortal nome="informacao" tamanho={24} />
                </button>
              </span>
            </div>
          </div>
        </div>
        <div className="ck-espaco" />
        <div className="ck-linha">
          <div className="ck-container">
            <div className="ck-col-8 ck-rotulo-linha">
              <span className="ck-rotulo">
                Evento de conversão
                <span className="ck-info" title="Evento de conversão que será analisado.">
                  <IconePortal nome="informacao" tamanho={20} />
                </span>
              </span>
            </div>
            <div className="ck-col-4 ck-rotulo-linha">
              <span className="ck-rotulo">
                Período analisado
                <span className="ck-info" title="Período de análise do evento de conversão.">
                  <IconePortal nome="informacao" tamanho={20} />
                </span>
              </span>
            </div>
          </div>
        </div>
        <div className="ck-linha">
          <div className="ck-container">
            <div className="ck-col-8">
              <div className="ck-evento-caixa">
                <div className="ck-paper ck-evento">
                  <button
                    className="ck-chip"
                    type="button"
                    aria-label="Escolher evento de conversão"
                  >
                    <IconePortal nome="editar" tamanho={16} />
                    <span className="ck-chip-texto" />
                  </button>
                </div>
              </div>
            </div>
            <div className="ck-col-4">
              <div className="ck-datas">
                <label className="ck-data">
                  <span className="ck-data-icone">
                    <IconePortal nome="calendario" tamanho={20} />
                  </span>
                  <span className="ck-data-container">
                    <span className="ck-data-rotulo">De</span>
                    <input className="ck-data-texto" readOnly value={period.de} />
                  </span>
                </label>
                <label className="ck-data">
                  <span className="ck-data-icone">
                    <IconePortal nome="calendario" tamanho={20} />
                  </span>
                  <span className="ck-data-container">
                    <span className="ck-data-rotulo">Até</span>
                    <input className="ck-data-texto" readOnly value={period.ate} />
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="ck-container">
        <div className="ck-token-margem">
          <div className="ck-paper ck-token">
            <div className="ck-col-12">
              <div className="ck-token-status">
                <span className="ck-token-status-texto">
                  Tudo certo com o seu Token
                  <span className="ck-info" title="Tudo certo com o seu Token">
                    <IconePortal nome="informacao" tamanho={20} />
                  </span>
                </span>
              </div>
            </div>
            <div className="ck-col-12">
              <div className="ck-token-linha">
                <div className="ck-col-4 ck-token-account">
                  <LogoPortal nome="meta" tamanho={64} className="ck-token-logo" />
                  <div className="ck-token-texto">
                    <strong>Token de acesso à Marketing API</strong>
                    <small>Conectado</small>
                  </div>
                </div>
                <div className="ck-col-8 ck-token-actions">
                  <button className="ck-botao-fantasma" type="button">
                    <IconePortal nome="loja" tamanho={24} />
                    Alterar token
                  </button>
                  <span className="ck-ponto" aria-hidden="true" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="ck-container">
        <div className="ck-col-12">
          <hr className="ck-separador" />
        </div>
      </div>

      <div className="ck-container">
        <div className="ck-col-12">
          <div className="ck-paper ck-desempenho">
            <div className="ck-performance-column">
              <strong className="ck-desempenho-titulo">Desempenho resumido de seus anúncios</strong>
              <span className="ck-desempenho-sub">
                Detalhes sobre a performance de seus anúncios Click To WhatsApp
              </span>
              <div className="ck-indicadores">
                {INDICADORES.map((indicador) => (
                  <div className="ck-col-3" key={indicador.rotulo}>
                    <div className="ck-indicador">
                      <div className="ck-indicator-value">
                        {indicador.alerta ? (
                          <span
                            className="ck-indicador-alerta"
                            title="Evento de conversão não encontrado"
                          >
                            <IconePortal nome="alerta" tamanho={28} />
                          </span>
                        ) : (
                          indicador.valor
                        )}
                      </div>
                      <div className="ck-indicador-rotulo">
                        {indicador.rotulo}
                        <span className="ck-info">
                          <IconePortal nome="informacao" tamanho={16} />
                        </span>
                      </div>
                      <div className="ck-indicador-linha" />
                      <div className="ck-indicador-rodape">
                        {indicador.rodape ? (
                          <>
                            <span className="ck-indicador-rodape-texto">{indicador.rodape}</span>
                            <span className="ck-indicator-footer-value">$ 0,00</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="ck-empty">
        <div className="ck-empty-illustration">
          <Illustration nome="busca" tamanho={128} />
        </div>
        <strong className="ck-empty-title">Nenhum dado encontrado</strong>
        <p className="ck-empty-text">
          Não encontramos dados de conversas iniciadas a partir de anúncios de Click To WhatsApp
          <br />
          no período selecionado.
        </p>
      </div>
    </div>
  );
}
