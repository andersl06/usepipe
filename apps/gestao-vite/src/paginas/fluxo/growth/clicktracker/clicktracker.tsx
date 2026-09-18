import { Ilustracao } from '@pipe/ui';
import { IconePortal, LogoPortal } from '../../../../componentes/icones-portal';

/* Painel do Click Tracker como o microfrontend `portal-fragment-click-tracker`
   renderiza na rota `growth/clicktracker` (medido na cópia com a régua):
   título fs-32 com dica, "Evento de conversão" + "Período analisado", papel do
   evento com chip de edição e seletor De/Até, papel do token (faixa de status,
   logo, "Token de acesso à Marketing API" / "Conectado", "Alterar token"),
   separador, "Desempenho resumido de seus anúncios" com quatro indicadores e o
   estado vazio "Nenhum dado encontrado". A tela "Eventos de otimização" é
   outra rota da origem (`growth/conversation-settings/events`).
   ponytail: nada aqui conecta conta externa nem dispara evento; é só visual. */

const INDICADORES = [
  { rotulo: 'Total de anúncios', valor: '0', rodape: null, alerta: false },
  { rotulo: 'Conversas iniciadas', valor: '0', rodape: 'Custo médio por conversa:', alerta: false },
  { rotulo: 'Total de conversão', valor: null, rodape: 'Custo médio por conversão:', alerta: true },
  { rotulo: 'Taxa média de conversão', valor: null, rodape: null, alerta: true },
];

function periodoAnalisado(hoje: Date) {
  const inicio = new Date(hoje);
  inicio.setDate(inicio.getDate() - 7);
  return { de: inicio.toLocaleDateString('pt-BR'), ate: hoje.toLocaleDateString('pt-BR') };
}

export default function PaginaClickTracker() {
  const periodo = periodoAnalisado(new Date());
  return (
    <div className="ck-pagina">
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
                <div className="ck-papel ck-evento">
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
                    <input className="ck-data-texto" readOnly value={periodo.de} />
                  </span>
                </label>
                <label className="ck-data">
                  <span className="ck-data-icone">
                    <IconePortal nome="calendario" tamanho={20} />
                  </span>
                  <span className="ck-data-container">
                    <span className="ck-data-rotulo">Até</span>
                    <input className="ck-data-texto" readOnly value={periodo.ate} />
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="ck-container">
        <div className="ck-token-margem">
          <div className="ck-papel ck-token">
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
                <div className="ck-col-4 ck-token-conta">
                  <LogoPortal nome="meta" tamanho={64} className="ck-token-logo" />
                  <div className="ck-token-texto">
                    <strong>Token de acesso à Marketing API</strong>
                    <small>Conectado</small>
                  </div>
                </div>
                <div className="ck-col-8 ck-token-acoes">
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
          <div className="ck-papel ck-desempenho">
            <div className="ck-desempenho-coluna">
              <strong className="ck-desempenho-titulo">Desempenho resumido de seus anúncios</strong>
              <span className="ck-desempenho-sub">
                Detalhes sobre a performance de seus anúncios Click To WhatsApp
              </span>
              <div className="ck-indicadores">
                {INDICADORES.map((indicador) => (
                  <div className="ck-col-3" key={indicador.rotulo}>
                    <div className="ck-indicador">
                      <div className="ck-indicador-valor">
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
                            <span className="ck-indicador-rodape-valor">$ 0,00</span>
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

      <div className="ck-vazio">
        <div className="ck-vazio-ilustracao">
          <Ilustracao nome="busca" tamanho={128} />
        </div>
        <strong className="ck-vazio-titulo">Nenhum dado encontrado</strong>
        <p className="ck-vazio-texto">
          Não encontramos dados de conversas iniciadas a partir de anúncios de Click To WhatsApp
          <br />
          no período selecionado.
        </p>
      </div>
    </div>
  );
}
