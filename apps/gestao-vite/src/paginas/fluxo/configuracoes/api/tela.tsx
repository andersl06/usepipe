import { useEffect, useState } from 'react';
import { BotaoBds, CabecalhoDaPagina, CampoBds, CampoCopiavel, Interruptor, Papel } from '../pecas';
import { useLeitura } from '../../../../lib/consulta';
import { salvarConexao, type ConexaoDoFluxo } from './gravar';

/**
 * O miolo de `/configurations/apikey`, cartão por cartão como no template
 * (portal.js, módulo 83981):
 *
 *   bds-paper.ph5.pv4.mb3  usingBuilder  (h1 + p + switch)
 *   bds-paper.ph5.pv4.mb3  usingSdk      (h1 + small + p + switch; campos
 *                          wsEndpoint/tcpEndpoint | identifier em input-clipboard)
 *   bds-paper.ph5.pv4.mb3  usingHttp     (h1 + small + p + switch; form#httpForm
 *                          com urlReceiveMessages/urlReceiveNotifications,
 *                          bds-paper OAuth 2.0 e o "Salvar")
 *   bds-paper.ph5.pv4.mb3  httpEndpoints (sendMessagesUrl/sendNotificationsUrl |
 *                          sendCommandsUrl)
 *
 * O que virou REAL (`GET/PUT /v1/gestao/fluxos/:id/conexao`,
 * `dominio/gestao/integracoes.ts`): o identificador (sempre foi), o
 * endpoint da `api`, o prefixo da chave ativa do fluxo (nunca o segredo — a
 * tela de "Chaves de acesso" é quem emite) e as duas URLs do formulário
 * HTTP, que viram `webhook_saida`.
 *
 * ponytail: `wsEndpoint`/`tcpEndpoint` (SDK) e os "Endpoints HTTP" de baixo
 * (sendMessagesUrl/sendNotificationsUrl/sendCommandsUrl) exigiriam um
 * servidor de SDK e rotas de envio que o Pipe não tem — ficam vazios, como
 * antes. OAuth 2.0 do cartão HTTP também: campo visual, sem gravação (a
 * origem também não resolve `isCheckedOAuth` no mock).
 */
export function TelaDeConexao({ fluxoId }: { fluxoId: string }) {
  const caminho = `/v1/gestao/fluxos/${fluxoId}/conexao`;
  const { data, isLoading } = useLeitura<ConexaoDoFluxo>(caminho);

  const [builder, setBuilder] = useState(false);
  const [sdk, setSdk] = useState(false);
  const [http, setHttp] = useState(false);
  const [sdkAberto, setSdkAberto] = useState(true);
  const [httpAberto, setHttpAberto] = useState(true);
  const [oauth, setOauth] = useState(false);
  const [oauthAberto, setOauthAberto] = useState(true);
  const [urlMensagens, setUrlMensagens] = useState('');
  const [urlNotificacoes, setUrlNotificacoes] = useState('');
  const [urlAutorizacao, setUrlAutorizacao] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [aviso, setAviso] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [sujo, setSujo] = useState(false);

  /* Preenche com o que veio do banco — só enquanto a pessoa não mexeu, para
     não sobrescrever o que ela está digitando quando a leitura revalida. */
  useEffect(() => {
    if (!data || sujo) return;
    setUrlMensagens(data.urlMensagens ?? '');
    setUrlNotificacoes(data.urlNotificacoes ?? '');
  }, [data, sujo]);

  async function salvar() {
    setSalvando(true);
    setAviso('');
    const resultado = await salvarConexao(fluxoId, {
      urlMensagens: urlMensagens.trim() === '' ? null : urlMensagens.trim(),
      urlNotificacoes: urlNotificacoes.trim() === '' ? null : urlNotificacoes.trim(),
    });
    setSalvando(false);
    if (!resultado.ok) {
      setAviso(resultado.erro);
      return;
    }
    setSujo(false);
    setAviso('Configuração salva.');
  }

  return (
    <>
      <CabecalhoDaPagina
        titulo={<h1>Informações de conexão</h1>}
        descricao={
          <p>
            Defina as configurações de envio e recebimento de mensagens e notificações do seu
            chatbot
          </p>
        }
      />
      <div className="cf-container">
        <Papel className="cf-papel--conexao">
          <div className="cf-conexao-topo">
            <div className="cf-conexao-texto">
              <h1>Conectar usando o builder</h1>
              <p>Construa um bot utilizando o bot builder do Pipe</p>
            </div>
            <Interruptor
              ligado={builder}
              aoMudar={setBuilder}
              desabilitado={builder}
              rotulo="Conectar usando o builder"
            />
          </div>
        </Papel>

        <Papel className="cf-papel--conexao">
          <div className="cf-conexao-topo">
            <div className="cf-conexao-texto">
              <h1>
                <span>Conectar usando SDK</span> <small>para C# e JS</small>
              </h1>
              <p>Receba suas credenciais de acesso</p>
            </div>
            <Interruptor
              ligado={sdk}
              aoMudar={(valor) => {
                setSdk(valor);
                setSdkAberto(valor);
              }}
              desabilitado={sdk}
              rotulo="Conectar usando SDK"
            />
          </div>
          {sdkAberto ? (
            <div className="cf-duas-colunas">
              <div className="cf-coluna-metade">
                <CampoCopiavel rotulo="Endpoint WS" valor="" />
                <div className="cf-mt4">
                  <CampoCopiavel rotulo="Endpoint TCP" valor="" />
                </div>
              </div>
              <div className="cf-coluna-metade">
                <CampoCopiavel rotulo="Identificador" valor={fluxoId} />
                <div className="cf-mt4">
                  <CampoCopiavel rotulo="Endpoint HTTP" valor={data?.endpoint ?? ''} />
                </div>
                <div className="cf-mt4">
                  <CampoCopiavel
                    rotulo="Chave de autorização"
                    valor={data?.chavePrefixo ? `${data.chavePrefixo}…` : 'Nenhuma chave emitida'}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </Papel>

        <Papel className="cf-papel--conexao">
          <div className="cf-conexao-topo">
            <div className="cf-conexao-texto">
              <h1>
                <span>Conectar usando HTTP</span> <small>para qualquer linguagem</small>
              </h1>
              <p>
                Informe sua URL para receber mensagens. Caso queira, informe outra URL para receber
                notificações sobre a conversa. Nos dois casos, use um protocolo seguro (HTTPS).
              </p>
            </div>
            <Interruptor
              ligado={http}
              aoMudar={(valor) => {
                setHttp(valor);
                setHttpAberto(valor);
              }}
              desabilitado={http}
              rotulo="Conectar usando HTTP"
            />
          </div>
          {httpAberto ? (
            <form
              id="httpForm"
              className="cf-form-http"
              noValidate
              onSubmit={(evento) => {
                evento.preventDefault();
                void salvar();
              }}
            >
              <div className="cf-linha-campos">
                <div className="cf-w-40">
                  <CampoBds
                    id="urlReceiveMessages"
                    rotulo="Url para receber mensagens"
                    valor={urlMensagens}
                    aoMudar={(valor) => {
                      setUrlMensagens(valor);
                      setSujo(true);
                    }}
                    desabilitado={isLoading || salvando}
                  />
                </div>
                <div className="cf-w-10" />
                <div className="cf-w-40">
                  <CampoBds
                    id="urlReceiveNotifications"
                    rotulo="Url para receber notificações"
                    valor={urlNotificacoes}
                    aoMudar={(valor) => {
                      setUrlNotificacoes(valor);
                      setSujo(true);
                    }}
                    desabilitado={isLoading || salvando}
                  />
                </div>
              </div>

              <Papel className="cf-papel--oauth">
                <div className="cf-oauth">
                  <div className="cf-oauth-topo">
                    <div className="cf-oauth-titulo">
                      <span className="cf-oauth-nome">OAuth 2.0</span>
                      <span className="cf-oauth-legenda">Configurações de autenticação</span>
                    </div>
                    <Interruptor
                      curto
                      ligado={oauth}
                      aoMudar={(valor) => {
                        setOauth(valor);
                        setOauthAberto(valor);
                      }}
                      rotulo="OAuth 2.0"
                    />
                  </div>
                  {oauthAberto ? (
                    <div className="cf-oauth-corpo">
                      <p>
                        OAuth 2.0 é um protocolo de autorização que utiliza um token de acesso para
                        interagir com uma API. Esse token é empregado para autenticar solicitações
                        subsequentes.
                      </p>
                      <div className="cf-linha-campos">
                        <div className="cf-w-40">
                          <CampoBds
                            id="oAuthAuthorizationServerUri"
                            rotulo="URL de autorização"
                            valor={urlAutorizacao}
                            aoMudar={setUrlAutorizacao}
                          />
                        </div>
                        <div className="cf-w-10" />
                        <div className="cf-w-40">
                          <CampoBds
                            rotulo="Grant Type (Tipo de autentificação)"
                            valor="client_credentials"
                            desabilitado
                          />
                        </div>
                      </div>
                      <div className="cf-linha-campos">
                        <div className="cf-w-40">
                          <CampoBds
                            id="oAuthClientId"
                            rotulo="Client ID"
                            valor={clientId}
                            aoMudar={setClientId}
                          />
                        </div>
                        <div className="cf-w-10" />
                        <div className="cf-w-40">
                          <CampoBds
                            id="oAuthClientSecret"
                            rotulo="Client Secret"
                            valor={clientSecret}
                            aoMudar={setClientSecret}
                            senha
                          />
                        </div>
                      </div>
                      <div className="cf-oauth-rodape">
                        <BotaoBds
                          variante="secondary"
                          name="clearOAuth"
                          onClick={() => {
                            setUrlAutorizacao('');
                            setClientId('');
                            setClientSecret('');
                          }}
                        >
                          Limpar dados
                        </BotaoBds>
                      </div>
                    </div>
                  ) : null}
                </div>
              </Papel>

              {aviso ? (
                <p className="cf-aviso" role={aviso === 'Configuração salva.' ? 'status' : 'alert'}>
                  {aviso}
                </p>
              ) : null}
              <div className="cf-form-http-rodape">
                <BotaoBds variante="bot" type="submit" disabled={salvando || isLoading}>
                  {salvando ? 'Salvando…' : 'Salvar'}
                </BotaoBds>
              </div>
            </form>
          ) : null}
        </Papel>

        <Papel className="cf-papel--conexao">
          <h1 className="cf-titulo-cartao">Endpoints HTTP</h1>
          <div className="cf-duas-colunas">
            <div className="cf-coluna-metade">
              <CampoCopiavel rotulo="Url para enviar mensagens" valor="" />
              <div className="cf-mt4">
                <CampoCopiavel rotulo="Url para enviar notificações" valor="" />
              </div>
            </div>
            <div className="cf-coluna-metade">
              <CampoCopiavel rotulo="Url para enviar comandos" valor="" />
            </div>
          </div>
        </Papel>
      </div>
    </>
  );
}
