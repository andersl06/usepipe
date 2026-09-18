'use client';

import { useState } from 'react';
import { BotaoBds, CabecalhoDaPagina, CampoBds, CampoCopiavel, Interruptor, Papel } from '../pecas';

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
 * Textos do pacote pt-BR (`modules.application.detail.templates.api.*`,
 * `templates.webhook.*`, `templates.oauth.*`, `builder-tabs-actions.processHttp.*`).
 *
 * O `accessKey` (`channels.keyAccess`) e o `headerAuthentication` só aparecem
 * com `!isTokenManagementEnable`; a régua tem a gestão de chaves ligada
 * (a lateral mostra "Chaves de acesso"), então nenhum dos dois entra — e é
 * assim que a tela nunca exibe credencial.
 *
 * A régua mostra os três interruptores desligados com o miolo de cada cartão
 * à vista (o `ng-show` não fecha porque o mock não resolve `isSdkActive`);
 * a foto é essa. ponytail: `activateTemplateType` (que confirma a troca com
 * `changeConnectionDisclaimer` e publica) não existe aqui — o interruptor
 * só abre/fecha o cartão, e "Salvar" devolve o erro controlado.
 */
export function TelaDeConexao({ identificador }: { identificador: string }) {
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
                <CampoCopiavel rotulo="Identificador" valor={identificador} />
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
                setAviso('A configuração de conexão HTTP ainda não está disponível.');
              }}
            >
              <div className="cf-linha-campos">
                <div className="cf-w-40">
                  <CampoBds
                    id="urlReceiveMessages"
                    rotulo="Url para receber mensagens"
                    valor={urlMensagens}
                    aoMudar={setUrlMensagens}
                    obrigatorio
                  />
                </div>
                <div className="cf-w-10" />
                <div className="cf-w-40">
                  <CampoBds
                    id="urlReceiveNotifications"
                    rotulo="Url para receber notificações"
                    valor={urlNotificacoes}
                    aoMudar={setUrlNotificacoes}
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
                <p className="cf-aviso" role="alert">
                  {aviso}
                </p>
              ) : null}
              <div className="cf-form-http-rodape">
                <BotaoBds variante="bot" type="submit">
                  Salvar
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
