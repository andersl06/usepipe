import { useEffect, useState } from 'react';
import { BotaoBds, PageHeader, CampoBds, CampoCopiavel, Interruptor, Role } from '../pecas';
import { useRead } from '../../../../lib/query';
import { NAO_DISPONIVEL } from '../../contacts/regras';
import { salvarConexao, type FlowConnection } from './gravar';

/**
 * The guts of `/configurations/apikey`, card by card as in the template (portal.js, module 83981):
 *
 *   bds-paper.ph5.pv4.mb3  usingBuilder  (h1 + p + switch)
 *   bds-paper.ph5.pv4.mb3  usingSdk      (h1 + small + p + switch; wsEndpoint/tcpEndpoint fields | identifier in input-clipboard)
 *   bds-paper.ph5.pv4.mb3  usingHttp     (h1 + small + p + switch; form#httpForm with urlReceiveMessages/urlReceiveNotifications, OAuth 2.0 bds-paper and the "Salvar")
 *   bds-paper.ph5.pv4.mb3  httpEndpoints (sendMessagesUrl/sendNotificationsUrl | sendCommandsUrl)
 *
 * What became REAL (`GET/PUT /v1/gestao/fluxos/:id/conexao`, `dominio/gestao/integracoes.ts`): the identifier (always was), the `api`'s endpoint, the flow's active key prefix (never the secret — the "Chaves de acesso" screen is what issues it) and the two HTTP form URLs, which become `webhook_saida`.
 *
 * ponytail: `wsEndpoint`/`tcpEndpoint` (SDK) and the "Endpoints HTTP" below (sendMessagesUrl/sendNotificationsUrl/sendCommandsUrl) would require an SDK server and send routes that Pipe doesn't have — they stay empty, as before. Same for the HTTP card's OAuth 2.0: disabled with "não disponível no Pipe" until secrets can be stored encrypted (the source doesn't resolve `isCheckedOAuth` in the mock either).
 */
export function TelaDeConexao({ flowId }: { flowId: string }) {
  const caminho = `/v1/management/flows/${flowId}/connection`;
  const { data, isLoading } = useRead<FlowConnection>(caminho);

  const [modo, setModo] = useState<'builder' | 'sdk' | 'http'>('builder');
  const [oauth, setOauth] = useState(false);
  const [urlMessages, setUrlMessages] = useState('');
  const [urlNotifications, setUrlNotifications] = useState('');
  const [aviso, setAviso] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [sujo, setSujo] = useState(false);

  /*
   * Fills with what came from the database — only while the person hasn't touched it, so as not to overwrite what they're typing when the read revalidates.
   */
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
        <Role className="cf-paper--connection">
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

        <Role className="cf-paper--connection">
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
              <div className="cf-column-half">
                <CampoCopiavel rotulo="Endpoint WS" value="" />
                <div className="cf-mt4">
                  <CampoCopiavel rotulo="Endpoint TCP" value="" />
                </div>
              </div>
              <div className="cf-column-half">
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

        <Role className="cf-paper--connection">
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

              <Role className="cf-paper--oauth">
                <div className="cf-oauth">
                  <div className="cf-oauth-topo">
                    <div className="cf-oauth-titulo">
                      <span className="cf-oauth-nome">OAuth 2.0</span>
                      <span className="cf-oauth-legenda">Configurações de autenticação</span>
                    </div>
                    <Interruptor curto ligado={oauth} aoMudar={setOauth} rotulo="OAuth 2.0" />
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
                            value=""
                            placeholder={NAO_DISPONIVEL}
                            desabilitado
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
                            value=""
                            placeholder={NAO_DISPONIVEL}
                            desabilitado
                          />
                        </div>
                        <div className="cf-w-10" />
                        <div className="cf-w-40">
                          <CampoBds
                            id="oAuthClientSecret"
                            rotulo="Client Secret"
                            value=""
                            placeholder={NAO_DISPONIVEL}
                            desabilitado
                            senha
                          />
                        </div>
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

        <Role className="cf-paper--connection">
          <h1 className="cf-title-card">Endpoints HTTP</h1>
          <div className="cf-duas-colunas">
            <div className="cf-column-half">
              <CampoCopiavel rotulo="Url para enviar mensagens" value="" />
              <div className="cf-mt4">
                <CampoCopiavel rotulo="Url para enviar notificações" value="" />
              </div>
            </div>
            <div className="cf-column-half">
              <CampoCopiavel rotulo="Url para enviar comandos" value="" />
            </div>
          </div>
        </Role>
      </div>
    </>
  );
}
