import Link from '../../../../componentes/link';
import { useState, type ReactNode } from 'react';
import { IconePortal } from '../../../../componentes/icones-portal';
import { Interruptor } from '../interruptor';
import { IlustracaoIntegracao } from '../ilustracoes';
import {
  LIMITE_URLS,
  adicionarUrl,
  interruptorDesabilitado,
  removerUrl,
  salvarDesabilitado,
  urlValida,
} from './regras';

/**
 * A tela do Webhook — `auth.application.detail.integrations.webhook`, template
 * do módulo 29045 de portal.js:
 *
 *   <page-header back-button="…integrations" page-title="Webhook">
 *     <custom-content> <bds-tooltip …disabledSwitchTooltip> <bds-switch id="webhook-switch" class="pa1"/> </bds-tooltip>
 *                      <bds-typo tag="span" bold variant="fs-16" class="pa1">utils.forms.activate</bds-typo>
 *   <bds-grid> <bds-paper class="integration-card"> <bds-grid padding="3" direction="column">
 *     <bds-grid row align-items="center" gap="3"> <bds-tabs class="tabs"> <bds-tab group="webhook-tab-1" label="utils.misc.overview"/> <bds-tab group="webhook-tab-2" label="webhook.page.configurations.title"/>
 *                                              <a class="docs-link">webhook.page.documentation.title</a>   ← escondido: link para ajuda da origem
 *     <bds-tab-panel group="webhook-tab-1"> <bds-grid padding="3" row gap="3" align-items="flex-start"> <img webhook.svg> <bds-grid column gap="1"> <bds-typo fs-16> description </bds-typo> <bds-banner variant="warning" ng-if="!isActive"> activationWarning
 *     <bds-tab-panel group="webhook-tab-2"> <bds-grid padding="3" row gap="3" align-items="flex-start"> <img webhook.svg>
 *       <form id="webhookForm">
 *         <div class="mb4"> <bds-typo> webhook.page.configurations.header </bds-typo> </div>
 *         <div class="form-group-small flex flex-column" ng-repeat="url in urls">
 *           <div class="flex flex-row items-center"> <bds-input class="url-input-field" label="…integrationUrl" error-message="…inputError"/> <bds-button-icon icon="close" variant="secondary" size="short"/> </div>
 *           <expandable-content class="advanced-settings pv3"> <item-header> <span class="bp-fs-6">…advancedConfigs</span>
 *             <item-body class="w-100 mv3 pa0">
 *               <bds-select-chips class="url-input-field mb3" label="…dispatchTypes" placeholder="…dispatchTypesPlaceHolder" can-add-new="false"/>
 *               <div class="flex flex-column items-left"> <div class="mb3"> <bds-typo> …oauthheader </bds-typo> </div>
 *                 <div class="flex"> <bds-switch size="short" class="pv2"/> <bds-typo class="advanced-settings__switch-label pv2 ph4" variant="fs-14"> OAuth 2.0
 *               <oauth-form ng-if="isOAuthEnabled(url)"/>   (módulo 75264)
 *               <custom-headers/>                            (módulo do template `customHeaders`)
 *         <bds-grid row gap="1" padding="none"> <bds-button id="add-url" variant="ghost">utils.forms.addplus</bds-button> <bds-button id="save-webhook" variant="primary" type="submit">utils.forms.save</bds-button>
 *
 * Textos (pt-BR, arquivo de traduções): "Visão Geral", "Configurações",
 * "Endereço HTTPS", "O endereço não é válido", "Configurações avançadas
 * (Opcional)", "Tipos de envio", "Selecione o tipo de envio que deseja para
 * este Webhook", "Configurações de autenticação", "OAuth 2.0", "Cabeçalhos
 * customizados", "+ Adicionar cabeçalho", "+ Adicionar", "Salvar".
 *
 * ponytail: não há configuração de webhook por bot na API do Pipe. Tudo aqui
 * é visual e local; salvar devolve a indisponibilidade controlada. As feature
 * flags da origem (`is-showing-dispatchTypes-settings`, `is-showing-oauth-on-
 * webhooks`, `is-showing-custom-headers-on-webhooks`) estão todas ligadas na
 * conta capturada, então as três seções avançadas aparecem.
 */

type Cabecalho = { chave: string; valor: string };
type Aba = 'visao' | 'configuracoes';

const TIPOS_DE_ENVIO = [
  { valor: 'contacts', rotulo: 'Contatos' },
  { valor: 'messages', rotulo: 'Mensagens' },
  { valor: 'eventtrackings', rotulo: 'Eventos' },
] as const;

export function TelaDoWebhook({ fluxoId }: { fluxoId: string }) {
  const [aba, setAba] = useState<Aba>('visao');
  const [ativo, setAtivo] = useState(false);
  const [urls, setUrls] = useState<string[]>(['']);
  const [tocadas, setTocadas] = useState<boolean[]>([false]);
  const [abertas, setAbertas] = useState<boolean[]>([false]);
  const [tipos, setTipos] = useState<string[][]>([TIPOS_DE_ENVIO.map((t) => t.valor)]);
  const [oauth, setOauth] = useState<boolean[]>([false]);
  const [cabecalhos, setCabecalhos] = useState<Cabecalho[][]>([[]]);
  const [aviso, setAviso] = useState('');

  const trocar = <T,>(lista: T[], indice: number, valor: T) =>
    lista.map((item, posicao) => (posicao === indice ? valor : item));
  const tirar = <T,>(lista: T[], indice: number) =>
    lista.filter((_, posicao) => posicao !== indice);

  const linhaInvalida = (indice: number) => tocadas[indice] && !urlValida(urls[indice] ?? '', urls);
  /* `handleSwitchBehavior()` olha as URLs SALVAS (roda no carregamento e depois de
     salvar), não o que está sendo digitado. ponytail: como salvar não grava, a
     lista salva é sempre vazia e o interruptor fica desabilitado, com a dica. */
  const urlsSalvas: string[] = [];
  const semUrlSalva = interruptorDesabilitado(urlsSalvas);

  return (
    <>
      <header className="ph-cabecalho">
        <div className="ph-conteudo">
          <div className="ph-voltar-caixa">
            <Link className="ph-voltar" href={`/fluxo/${fluxoId}/integracoes`} aria-label="Voltar">
              <IconePortal nome="voltar" tamanho={22} />
            </Link>
          </div>
          <div className="ph-titulo-caixa">
            <h1 className="ph-titulo">Webhook</h1>
          </div>
          <div className="ph-direita">
            <span
              className="ig-pa1"
              title={
                semUrlSalva
                  ? 'Você deve salvar uma url antes de habilitar a integração via webhook.'
                  : undefined
              }
            >
              <Interruptor
                id="webhook-switch"
                ligado={ativo}
                desabilitado={semUrlSalva}
                aoMudar={setAtivo}
              />
            </span>
            <span className="ph-ativar ig-pa1">Ativar</span>
          </div>
        </div>
      </header>

      <div className="ig-grade">
        <section className="ig-papel">
          <div className="ig-papel-miolo">
            <div className="ig-abas-linha">
              <div className="ig-abas" role="tablist">
                <button
                  type="button"
                  role="tab"
                  className="ig-aba"
                  aria-selected={aba === 'visao'}
                  onClick={() => setAba('visao')}
                >
                  Visão Geral
                </button>
                <button
                  type="button"
                  role="tab"
                  className="ig-aba"
                  aria-selected={aba === 'configuracoes'}
                  onClick={() => setAba('configuracoes')}
                >
                  Configurações
                </button>
              </div>
            </div>

            {aba === 'visao' ? (
              <div className="ig-painel" role="tabpanel">
                <IlustracaoIntegracao nome="webhook" altura={72} className="ig-figura-grande" />
                <div className="ig-painel-texto">
                  <p className="ig-typo-16">Envie os dados do seu chatbot para sua aplicação.</p>
                  {!ativo ? (
                    <div className="ig-faixa-alerta" role="status">
                      <IconePortal nome="alerta" tamanho={24} />
                      <p className="ig-typo-16">
                        Esta integração precisa ser configurada antes de ser ativada.
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="ig-painel" role="tabpanel">
                <IlustracaoIntegracao nome="webhook" altura={72} className="ig-figura-grande" />
                <form
                  id="webhookForm"
                  className="ig-form"
                  noValidate
                  onSubmit={(evento) => {
                    evento.preventDefault();
                    /* ponytail: sem gravação de configuração do webhook na API. */
                    setAviso('Salvar a configuração do webhook está indisponível.');
                  }}
                >
                  <div className="ig-mb4">
                    <p className="ig-typo-16">
                      Para enviar dados de análise para uma aplicação externa, adicione um ou mais
                      endereços (URLs) usando um protocolo seguro (HTTPS).
                    </p>
                  </div>

                  {urls.map((url, indice) => (
                    <div className="ig-grupo-url" key={indice}>
                      <div className="ig-linha-url">
                        <Campo
                          id={`url-integration-${indice}`}
                          className="ig-campo-url"
                          rotulo="Endereço HTTPS"
                          valor={url}
                          erro={linhaInvalida(indice) ? 'O endereço não é válido' : undefined}
                          aoMudar={(valor) => {
                            setUrls(trocar(urls, indice, valor));
                            setTocadas(trocar(tocadas, indice, true));
                          }}
                        />
                        <button
                          type="button"
                          id={`remove-url-${indice}`}
                          className="ig-botao-icone"
                          aria-label="Remover endereço"
                          onClick={() => {
                            setUrls(removerUrl(urls, indice));
                            setTocadas(tirar(tocadas, indice));
                            setAbertas(tirar(abertas, indice));
                            setTipos(tirar(tipos, indice));
                            setOauth(tirar(oauth, indice));
                            setCabecalhos(tirar(cabecalhos, indice));
                          }}
                        >
                          <IconePortal nome="fechar" tamanho={24} />
                        </button>
                      </div>

                      <div className="ig-avancado" id={`advanced-settings-${indice}`}>
                        <button
                          type="button"
                          className="ig-avancado-cabeca"
                          aria-expanded={abertas[indice]}
                          onClick={() => setAbertas(trocar(abertas, indice, !abertas[indice]))}
                        >
                          <span className="ig-avancado-seta">
                            <IconePortal
                              nome={abertas[indice] ? 'baixo' : 'direita'}
                              tamanho={16}
                            />
                          </span>
                          <span className="ig-typo-14">Configurações avançadas (Opcional)</span>
                        </button>
                        {abertas[indice] ? (
                          <div className="ig-avancado-corpo">
                            <SeletorDeTipos
                              id={`url-dispatch-types-${indice}`}
                              escolhidos={tipos[indice] ?? []}
                              aoMudar={(valor) => setTipos(trocar(tipos, indice, valor))}
                            />

                            <div className="ig-autenticacao">
                              <div className="ig-mb3">
                                <p className="ig-typo-16">Configurações de autenticação</p>
                              </div>
                              <div className="ig-flex">
                                <Interruptor
                                  id={`oauth-enabled-${indice}`}
                                  curto
                                  className="ig-pv2"
                                  ligado={oauth[indice] ?? false}
                                  desabilitado={!urlValida(url, urls)}
                                  aoMudar={(valor) => setOauth(trocar(oauth, indice, valor))}
                                />
                                <span className="ig-rotulo-interruptor ig-typo-14">OAuth 2.0</span>
                              </div>
                            </div>

                            {oauth[indice] ? <FormularioOAuth indice={indice} /> : null}

                            <CabecalhosCustomizados
                              id={`custom-headers-${indice}`}
                              lista={cabecalhos[indice] ?? []}
                              aoMudar={(valor) => setCabecalhos(trocar(cabecalhos, indice, valor))}
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}

                  {aviso ? (
                    <p role="alert" className="ig-aviso">
                      {aviso}
                    </p>
                  ) : null}
                  <div className="ig-acoes">
                    <button
                      id="add-url"
                      type="button"
                      className="ig-botao ig-botao--fantasma"
                      disabled={urls.length >= LIMITE_URLS}
                      onClick={() => {
                        setUrls(adicionarUrl(urls));
                        setTocadas([...tocadas, false]);
                        setAbertas([...abertas, false]);
                        setTipos([...tipos, TIPOS_DE_ENVIO.map((t) => t.valor)]);
                        setOauth([...oauth, false]);
                        setCabecalhos([...cabecalhos, []]);
                        setAviso('');
                      }}
                    >
                      + Adicionar
                    </button>
                    <button
                      id="save-webhook"
                      type="submit"
                      className="ig-botao ig-botao--principal"
                      disabled={salvarDesabilitado(urls.filter((_, i) => tocadas[i]))}
                    >
                      Salvar
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

/* ---- `bds-input`: div.input > div.input__container > label (fs-12 bold) + input (14px). */
function Campo({
  id,
  rotulo,
  valor,
  erro,
  placeholder,
  tipo = 'text',
  desabilitado,
  className,
  acessorio,
  aoMudar,
}: {
  id?: string;
  rotulo?: string;
  valor: string;
  erro?: string;
  placeholder?: string;
  tipo?: 'text' | 'password';
  desabilitado?: boolean;
  className?: string;
  acessorio?: ReactNode;
  aoMudar?: (valor: string) => void;
}) {
  return (
    <div
      className={[
        'ig-campo',
        erro ? 'ig-campo--erro' : '',
        desabilitado ? 'ig-campo--desabilitado' : '',
        className ?? '',
      ]
        .join(' ')
        .trim()}
    >
      <div className="ig-campo-caixa">
        <div className="ig-campo-miolo">
          {rotulo ? <label htmlFor={id}>{rotulo}</label> : null}
          <input
            id={id}
            type={tipo}
            value={valor}
            placeholder={placeholder}
            disabled={desabilitado}
            autoComplete="off"
            autoCapitalize="off"
            onChange={(evento) => aoMudar?.(evento.target.value)}
          />
        </div>
        {acessorio}
      </div>
      {erro ? <p className="ig-campo-erro">{erro}</p> : null}
    </div>
  );
}

/* ---- `bds-select-chips` (label "Tipos de envio", chips + placeholder + seta). Não aceita
   valor novo (`can-add-new="false"`); ao menos um tipo precisa ficar marcado. */
function SeletorDeTipos({
  id,
  escolhidos,
  aoMudar,
}: {
  id: string;
  escolhidos: string[];
  aoMudar: (valor: string[]) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const restantes = TIPOS_DE_ENVIO.filter((tipo) => !escolhidos.includes(tipo.valor));
  const erro = escolhidos.length === 0 ? 'Ao menos um tipo deve estar selecionado.' : undefined;
  return (
    <div
      id={id}
      className={['ig-campo ig-campo-url ig-chips', erro ? 'ig-campo--erro' : ''].join(' ').trim()}
    >
      <div className="ig-campo-caixa">
        <div className="ig-campo-miolo">
          <label htmlFor={`${id}-entrada`}>Tipos de envio</label>
          <div className="ig-chips-linha">
            {escolhidos.map((valor) => (
              <span className="ig-chip" key={valor}>
                {TIPOS_DE_ENVIO.find((tipo) => tipo.valor === valor)?.rotulo ?? valor}
                <button
                  type="button"
                  aria-label={`Remover ${valor}`}
                  onClick={() => aoMudar(escolhidos.filter((item) => item !== valor))}
                >
                  <IconePortal nome="fechar-chip" tamanho={16} />
                </button>
              </span>
            ))}
            <input
              id={`${id}-entrada`}
              readOnly
              placeholder={
                escolhidos.length ? '' : 'Selecione o tipo de envio que deseja para este Webhook'
              }
              onClick={() => setAberto(!aberto)}
            />
          </div>
        </div>
        <button
          type="button"
          className="ig-campo-icone"
          aria-label="Abrir opções"
          aria-expanded={aberto}
          onClick={() => setAberto(!aberto)}
        >
          <IconePortal nome="baixo" tamanho={24} />
        </button>
      </div>
      {aberto ? (
        <ul className="ig-chips-opcoes" role="listbox">
          {restantes.length ? (
            restantes.map((tipo) => (
              <li key={tipo.valor}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => {
                    aoMudar([...escolhidos, tipo.valor]);
                    setAberto(false);
                  }}
                >
                  {tipo.rotulo}
                </button>
              </li>
            ))
          ) : (
            <li className="ig-chips-vazio">Nenhum resultado encontrado</li>
          )}
        </ul>
      ) : null}
      {erro ? <p className="ig-campo-erro">{erro}</p> : null}
    </div>
  );
}

/* ---- `oauth-form` (módulo 75264): p.bp-fs-6 + duas fileiras w-40 / w-10 / w-40. */
function FormularioOAuth({ indice }: { indice: number }) {
  const [urlAutorizacao, setUrlAutorizacao] = useState('');
  const [clientId, setClientId] = useState('');
  const [segredo, setSegredo] = useState('');
  const [mostrar, setMostrar] = useState(false);
  return (
    <div className="ig-oauth">
      <div className="ig-oauth-miolo">
        <p className="ig-oauth-info">
          OAuth 2.0 é um protocolo de autorização que utiliza um token de acesso para interagir com
          uma API. Esse token é empregado para autenticar solicitações subsequentes.
        </p>
        <div className="ig-oauth-fileira">
          <div className="ig-w40">
            <Campo
              id={`oAuthAuthorizationServerUri-${indice}`}
              rotulo="URL de autorização"
              valor={urlAutorizacao}
              aoMudar={setUrlAutorizacao}
            />
          </div>
          <div className="ig-w10" />
          <div className="ig-w40">
            <Campo
              rotulo="Grant Type (Tipo de autentificação)"
              valor="client_credentials"
              desabilitado
            />
          </div>
        </div>
        <div className="ig-oauth-fileira">
          <div className="ig-w40">
            <Campo
              id={`oAuthClientId-${indice}`}
              rotulo="Client ID"
              valor={clientId}
              aoMudar={setClientId}
            />
          </div>
          <div className="ig-w10" />
          <div className="ig-w40">
            <Campo
              id={`oAuthClientSecret-${indice}`}
              rotulo="Client Secret"
              tipo={mostrar ? 'text' : 'password'}
              valor={segredo}
              aoMudar={setSegredo}
              acessorio={
                <button
                  type="button"
                  className="ig-campo-icone"
                  aria-label={mostrar ? 'Ocultar segredo' : 'Mostrar segredo'}
                  onClick={() => setMostrar(!mostrar)}
                >
                  <IconePortal nome="olho" tamanho={24} />
                </button>
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- `custom-headers`: div.flex.mv5 > div.w-60 > título + fileiras (Chave / Valor / lixeira) + botão tracejado. */
function CabecalhosCustomizados({
  id,
  lista,
  aoMudar,
}: {
  id: string;
  lista: Cabecalho[];
  aoMudar: (valor: Cabecalho[]) => void;
}) {
  return (
    <div id={id} className="ig-cabecalhos">
      <div className="ig-w60">
        <div className="ig-mb3">
          <p className="ig-typo-16">Cabeçalhos customizados</p>
        </div>
        {lista.map((cabecalho, posicao) => (
          <div className="ig-cabecalho-fileira" key={posicao}>
            <Campo
              className="ig-cabecalho-campo"
              placeholder="Chave"
              valor={cabecalho.chave}
              aoMudar={(chave) =>
                aoMudar(lista.map((item, i) => (i === posicao ? { ...item, chave } : item)))
              }
            />
            <Campo
              className="ig-cabecalho-campo"
              placeholder="Valor"
              valor={cabecalho.valor}
              aoMudar={(valor) =>
                aoMudar(lista.map((item, i) => (i === posicao ? { ...item, valor } : item)))
              }
            />
            <button
              type="button"
              className="ig-botao-icone"
              aria-label="Remover cabeçalho"
              onClick={() => aoMudar(lista.filter((_, i) => i !== posicao))}
            >
              <IconePortal nome="lixeira" tamanho={24} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="ig-botao-tracejado"
          onClick={() => aoMudar([...lista, { chave: '', valor: '' }])}
        >
          + Adicionar cabeçalho
        </button>
      </div>
    </div>
  );
}
