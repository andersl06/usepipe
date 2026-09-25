import { useEffect, useState } from 'react';
import { BotaoBds, PageHeader, CampoBds, CampoCopiavel, Interruptor, Role } from '../pecas';
import { useRead } from '../../../../lib/consulta';
import { salvarConexao, type FlowConexao } from './gravar';

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
export function TelaDeConexao({ flowId }: { flowId: string }) {
  const caminho = `/v1/gestao/fluxos/${flowId}/conexao`;
  const { data, isLoading } = useRead<FlowConexao>(caminho);

  const [modo, setModo] = useState<'builder' | 'sdk' | 'http'>('builder');
  const [oauth, setOauth] = useState(false);
  const [urlMessages, setUrlMessages] = useState('');
  const [urlNotifications, setUrlNotifications] = useState('');
  const [urlAuthorization, setUrlAuthorization] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [aviso, setAviso] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [sujo, setSujo] = useState(false);

  /* Preenche com o que veio do banco — só enquanto a pessoa não mexeu, para
     não sobrescrever o que ela está digitando quando a leitura revalida. */
  useEffect(() => {
    if (!data || sujo) return;
    setUrlMessages(data.urlMessages ?? '');
    setUrlNotifications(data.urlNotifications ?? '');
    setModo(data.urlMessages || data.urlNotifications ? 'http' : 'builder');
  }, [data, sujo]);

  async function salvar() {
    setSalvando(true);
    setAviso('');
    const resultado = await salvarConexao(flowId, {
      urlMessages: urlMessages.trim() === '' ? null : urlMessages.trim(),
      urlNotifications: urlNotifications.trim() === '' ? null : urlNotifications.trim(),
    });
    setSalvando(false);
    if (!resultado.ok) {
      setAviso(resultado.error);
      return;
    }
    setSujo(false);
    setAviso('Configuração salva.');
  }

  return (
    <>
      <PageHeader
        titulo={<h1>Informações de conexão</h1>}
        description={
          <p>
            Defina as configurações de envio e recebimento de mensagens e notificações do seu
            chatbot
          </p>
        }
      />
      <div className="cf-container">
        <Role className="cf-papel--conexao">
          <div className="cf-conexao-topo">
            <div className="cf-conexao-texto">
              <h1>Conectar usando o builder</h1>
              <p>Construa um bot utilizando o bot builder do Pipe</p>
            </div>
            <Interruptor
              ligado={modo === 'builder'}
              aoMudar={() => setModo('builder')}
              desabilitado={modo === 'builder'}
              rotulo="Conectar usando o builder"
            />
          </div>
        </Role>

        <Role className="cf-papel--conexao">
          <div className="cf-conexao-topo">
            <div className="cf-conexao-texto">
              <h1>
                <span>Conectar usando SDK</span> <small>para C# e JS</small>
              </h1>
              <p>Receba suas credenciais de acesso</p>
            </div>
            <Interruptor
              ligado={modo === 'sdk'}
              aoMudar={() => setModo('sdk')}
              desabilitado={modo === 'sdk'}
              rotulo="Conectar usando SDK"
            />
          </div>
          {modo === 'sdk' ? (
            <div className="cf-duas-colunas">
              <div className="cf-coluna-metade">
                <CampoCopiavel rotulo="Endpoint WS" value="" />
                <div className="cf-mt4">
                  <CampoCopiavel rotulo="Endpoint TCP" value="" />
                </div>
              </div>
              <div className="cf-coluna-metade">
                <CampoCopiavel rotulo="Identificador" value={flowId} />
                <div className="cf-mt4">
                  <CampoCopiavel rotulo="Endpoint HTTP" value={data?.endpoint ?? ''} />
                </div>
                <div className="cf-mt4">
                  <CampoCopiavel
                    rotulo="Chave de autorização"
                    value={data?.keyPrefix ? `${data.keyPrefix}…` : 'Nenhuma chave emitida'}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </Role>

        <Role className="cf-papel--conexao">
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
              ligado={modo === 'http'}
              aoMudar={() => setModo('http')}
              desabilitado={modo === 'http'}
              rotulo="Conectar usando HTTP"
            />
          </div>
          {modo === 'http' ? (
            <form
              id="httpForm"
              className="cf-form-http"
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
                    tipo="url"
                    value={urlMessages}
                    aoMudar={(value) => {
                      setUrlMessages(value);
                      setSujo(true);
                    }}
                    desabilitado={isLoading || salvando}
                    obrigatorio
                  />
                </div>
                <div className="cf-w-10" />
                <div className="cf-w-40">
                  <CampoBds
                    id="urlReceiveNotifications"
                    rotulo="Url para receber notificações"
                    tipo="url"
                    value={urlNotifications}
                    aoMudar={(value) => {
                      setUrlNotifications(value);
                      setSujo(true);
                    }}
                    desabilitado={isLoading || salvando}
                  />
                </div>
              </div>

              <Role className="cf-papel--oauth">
                <div className="cf-oauth">
                  <div className="cf-oauth-topo">
                    <div className="cf-oauth-titulo">
                      <span className="cf-oauth-nome">OAuth 2.0</span>
                      <span className="cf-oauth-legenda">Configurações de autenticação</span>
                    </div>
                    <Interruptor
                      curto
                      ligado={oauth}
                      aoMudar={setOauth}
                      rotulo="OAuth 2.0"
                    />
                  </div>
                  {oauth ? (
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
                            value={urlAuthorization}
                            aoMudar={setUrlAuthorization}
                          />
                        </div>
                        <div className="cf-w-10" />
                        <div className="cf-w-40">
                          <CampoBds
                            rotulo="Grant Type (Tipo de autentificação)"
                            value="client_credentials"
                            desabilitado
                          />
                        </div>
                      </div>
                      <div className="cf-linha-campos">
                        <div className="cf-w-40">
                          <CampoBds
                            id="oAuthClientId"
                            rotulo="Client ID"
                            value={clientId}
                            aoMudar={setClientId}
                          />
                        </div>
                        <div className="cf-w-10" />
                        <div className="cf-w-40">
                          <CampoBds
                            id="oAuthClientSecret"
                            rotulo="Client Secret"
                            value={clientSecret}
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
                            setUrlAuthorization('');
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
              </Role>

              {aviso ? (
                <p className="cf-aviso" role={aviso === 'Configuração salva.' ? 'status' : 'alert'}>
                  {aviso}
                </p>
              ) : null}
              <div className="cf-form-http-rodape">
                <BotaoBds
                  variante="bot"
                  type="submit"
                  disabled={salvando || isLoading || !sujo || !urlMessages.trim()}
                >
                  {salvando ? 'Salvando…' : 'Salvar'}
                </BotaoBds>
              </div>
            </form>
          ) : null}
        </Role>

        <Role className="cf-papel--conexao">
          <h1 className="cf-titulo-cartao">Endpoints HTTP</h1>
          <div className="cf-duas-colunas">
            <div className="cf-coluna-metade">
              <CampoCopiavel rotulo="Url para enviar mensagens" value="" />
              <div className="cf-mt4">
                <CampoCopiavel rotulo="Url para enviar notificações" value="" />
              </div>
            </div>
            <div className="cf-coluna-metade">
              <CampoCopiavel rotulo="Url para enviar comandos" value="" />
            </div>
          </div>
        </Role>
      </div>
    </>
  );
}
