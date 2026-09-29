import { useState } from 'react';
import Link from '../../../../components/link';
import { IconePortal } from '@pipe/ui/icones-portal';
import { useRead } from '../../../../lib/query';
import { ConfirmModal } from '@pipe/ui/modal';
import { Interruptor } from '../interruptor';
import { IllustrationIntegration } from '../illustrations';
import { LIMITE_URLS, adicionarUrl, removerUrl, salvarDesabilitado, urlValida } from './regras';
import {
  createWebhook,
  editarWebhook,
  excluirWebhook,
  testarWebhook,
  type AuthenticationInbound,
  type CabecalhoCustomizado,
  type TypeAuthentication,
  type WebhookListado,
} from './gravar';

/**
 * The Webhook screen — `auth.application.detail.integrations.webhook` (portal.js, module 29045): "Visão Geral"/"Configurações" tabs, the `bds-paper` card, the URL list with "+ Adicionar"/"Salvar" in the footer, "Configurações avançadas (Opcional)" with dispatch types, authentication (switch + OAuth 2.0/Básica), and custom headers (`referencias-blip/pesquisa/blip-integracoes-webhook.md`).
 *
 * The origin saves ONE webhook with several URLs, all with the SAME configuration; Pipe saves the opposite in `webhook_saida` (`apis.md` §5.5) — several ROWS, each with its own URL, events, authentication, and headers. The screen reconciles both: the "Novo webhook" form is the origin's (URL list with `adicionarUrl`/`removerUrl`/`urlValida` from `regras.ts`, a single "Configurações avançadas"), and "Salvar" creates ONE `webhook_saida` per filled URL, all with the same configuration — the origin's URL list becoming Pipe's row list.
 *
 * ponytail: events/authentication/headers for an ALREADY-CREATED webhook can only be edited by recreating it (delete + create again); there's no inline editing of those three things per row — the original screen also had no post-creation editing of URL/events, only enable/disable, test, and delete. Add full per-row editing if it's requested.
 */

const EVENTOS_ROTULOS: Record<string, string> = {
  'conversa.criada': 'Conversa criada',
  'conversa.estado_alterado': 'Conversa mudou de estado',
  'conversa.atribuida': 'Conversa atribuída',
  'conversa.encerrada': 'Conversa encerrada',
  'mensagem.criada': 'Mensagem criada',
  'mensagem.estado_entrega_alterado': 'Mensagem mudou de estado de entrega',
  'contato.criado': 'Contato criado',
  'modelo.recategorizado': 'Modelo de mensagem recategorizado',
};
const TODOS_OS_EVENTOS = Object.keys(EVENTOS_ROTULOS);
const LIMITE_CABECALHOS = 20;

function rotuloDoEvento(evento: string): string {
  return EVENTOS_ROTULOS[evento] ?? evento;
}

function authenticationLabel(tipo: TypeAuthentication): string {
  if (tipo === 'basica') return 'Autenticação básica';
  if (tipo === 'oauth2_client_credentials') return 'OAuth 2.0';
  return 'Sem autenticação';
}

type Aba = 'visao-geral' | 'configuracoes';

export function TelaDoWebhook({ base }: { base: string }) {
  const { data, isLoading } = useRead<WebhookListado[]>('/v1/management/webhooks');
  const webhooks = data ?? [];
  const algumAtivo = webhooks.some((w) => w.active);

  const [aba, setAba] = useState<Aba>('visao-geral');
  const [avancadoAberto, setAvancadoAberto] = useState(false);

  const [urls, setUrls] = useState<string[]>(['']);
  const [eventos, setEventos] = useState<string[]>([...TODOS_OS_EVENTOS]);
  const [tipoAuth, setTipoAuth] = useState<TypeAuthentication>('nenhuma');
  const [authUser, setAuthUser] = useState('');
  const [authSenha, setAuthSenha] = useState('');
  const [oauthUrl, setOauthUrl] = useState('');
  const [oauthClientId, setOauthClientId] = useState('');
  const [oauthClientSecret, setOauthClientSecret] = useState('');
  const [cabecalhos, setCabecalhos] = useState<CabecalhoCustomizado[]>([]);

  const [criando, setCriando] = useState(false);
  const [creationNotice, creationSetNotice] = useState('');
  const [secretsGenerated, setSecretsGenerated] = useState<{ url: string; secret: string }[]>([]);

  const [excluindo, setExcluindo] = useState<WebhookListado | null>(null);
  const [excluindoAgora, setExcluindoAgora] = useState(false);
  const [deletionError, deletionSetError] = useState<string | null>(null);
  const [testOf, setTestOf] = useState<Record<string, string>>({});

  const urlsAparadas = urls.map((u) => u.trim());
  const urlsPreenchidas = urlsAparadas.filter((u) => u !== '');
  const todasAsUrls = [...webhooks.map((w) => w.url), ...urlsPreenchidas];
  const algumaUrlRepeteWebhookExistente = urlsPreenchidas.some((u) =>
    webhooks.some((w) => w.url === u),
  );
  const authenticationIncomplete =
    (tipoAuth === 'basica' && (!authUser.trim() || !authSenha)) ||
    (tipoAuth === 'oauth2_client_credentials' &&
      (!oauthUrl.trim() || !oauthClientId.trim() || !oauthClientSecret));
  const salvarBloqueado =
    criando ||
    urlsPreenchidas.length === 0 ||
    salvarDesabilitado(urlsAparadas) ||
    algumaUrlRepeteWebhookExistente ||
    eventos.length === 0 ||
    authenticationIncomplete;

  function authenticationForSending(): AuthenticationInbound {
    if (tipoAuth === 'basica') return { tipo: 'basica', user: authUser.trim(), senha: authSenha };
    if (tipoAuth === 'oauth2_client_credentials') {
      return {
        tipo: 'oauth2_client_credentials',
        urlAuthorization: oauthUrl.trim(),
        clientId: oauthClientId.trim(),
        clientSecret: oauthClientSecret,
      };
    }
    return { tipo: 'nenhuma' };
  }

  function limparRascunho() {
    setUrls(['']);
    setEventos([...TODOS_OS_EVENTOS]);
    setTipoAuth('nenhuma');
    setAuthUser('');
    setAuthSenha('');
    setOauthUrl('');
    setOauthClientId('');
    setOauthClientSecret('');
    setCabecalhos([]);
    setAvancadoAberto(false);
  }

  async function salvar() {
    if (salvarBloqueado) return;
    setCriando(true);
    creationSetNotice('');
    const authentication = authenticationForSending();
    const cabecalhosPreenchidos = cabecalhos
      .map((c) => ({ key: c.key.trim(), value: c.value }))
      .filter((c) => c.key !== '');

    const criados: { url: string; secret: string }[] = [];
    for (const url of urlsPreenchidas) {
      const resultado = await createWebhook(url, eventos, authentication, cabecalhosPreenchidos);
      if (!resultado.ok) {
        setCriando(false);
        creationSetNotice(resultado.error);
        if (criados.length > 0) setSecretsGenerated(criados);
        return;
      }
      criados.push({ url: resultado.value.url, secret: resultado.value.secret });
    }
    setCriando(false);
    setSecretsGenerated(criados);
    limparRascunho();
  }

  async function alternarAtivo(webhook: WebhookListado) {
    await editarWebhook(webhook.id, { active: !webhook.active });
  }

  async function testar(webhook: WebhookListado) {
    setTestOf((atual) => ({ ...atual, [webhook.id]: 'Testando…' }));
    const resultado = await testarWebhook(webhook.id);
    let texto: string;
    if (!resultado.ok) {
      texto = resultado.error;
    } else if (resultado.value.ok) {
      texto = `Entregue (HTTP ${resultado.value.status}).`;
      if (resultado.value.corpo) texto += ` Resposta: "${resultado.value.corpo}"`;
    } else {
      texto = `Falhou: ${resultado.value.error ?? `HTTP ${resultado.value.status}`}`;
      if (resultado.value.corpo) texto += ` — "${resultado.value.corpo}"`;
    }
    setTestOf((atual) => ({ ...atual, [webhook.id]: texto }));
  }

  async function confirmarExclusao() {
    if (!excluindo) return;
    setExcluindoAgora(true);
    deletionSetError(null);
    const resultado = await excluirWebhook(excluindo.id);
    setExcluindoAgora(false);
    if (!resultado.ok) {
      deletionSetError(resultado.error);
      return;
    }
    setExcluindo(null);
  }

  return (
    <>
      <header className="ph-cabecalho">
        <div className="ph-conteudo">
          <div className="ph-voltar-caixa">
            <Link className="ph-voltar" href={`${base}/integrations`} aria-label="Voltar">
              <IconePortal nome="voltar" tamanho={22} />
            </Link>
          </div>
          <div className="ph-titulo-caixa">
            <h1 className="ph-titulo">Webhook</h1>
          </div>
        </div>
      </header>

      <div className="ig-grade">
        <section className="ig-paper">
          <div className="ig-paper-core">
            <div className="ig-abas-linha">
              <div className="ig-abas" role="tablist" aria-label="Webhook">
                <button
                  type="button"
                  role="tab"
                  aria-selected={aba === 'visao-geral'}
                  className="ig-aba"
                  onClick={() => setAba('visao-geral')}
                >
                  Visão Geral
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={aba === 'configuracoes'}
                  className="ig-aba"
                  onClick={() => setAba('configuracoes')}
                >
                  Configurações
                </button>
              </div>
            </div>

            {aba === 'visao-geral' ? (
              <div className="ig-panel">
                <IllustrationIntegration nome="webhook" altura={72} className="ig-figura-grande" />
                <div className="ig-panel-text">
                  <p className="ig-typo-16">
                    Envie os dados do seu chatbot para sua aplicação, por HTTPS, assinados por HMAC
                    (`X-Pipe-Signature`).
                  </p>
                  {!algumAtivo && !isLoading ? (
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
              <div className="ig-panel-text">
                {secretsGenerated.length > 0 ? (
                  <div className="ig-form ig-secret-generated">
                    <p className="ig-typo-16">
                      <strong>
                        {secretsGenerated.length === 1
                          ? 'Webhook criado.'
                          : `${secretsGenerated.length} webhooks criados.`}
                      </strong>{' '}
                      Copie os segredos agora: por segurança, eles não podem ser mostrados de novo.
                    </p>
                    {secretsGenerated.map((gerado) => (
                      <div key={gerado.url} className="ig-mb3">
                        <p className="ig-typo-14">{gerado.url}</p>
                        <div className="cf-copiavel">
                          <input readOnly value={gerado.secret} aria-label={`Segredo de ${gerado.url}`} />
                          <button
                            type="button"
                            className="cf-copiavel-botao"
                            aria-label={`Copiar segredo de ${gerado.url}`}
                            onClick={() => void navigator.clipboard?.writeText(gerado.secret)}
                          >
                            Copiar
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="ig-botao ig-botao--fantasma"
                      onClick={() => setSecretsGenerated([])}
                    >
                      Já copiei
                    </button>
                  </div>
                ) : null}

                <form
                  className="ig-form"
                  noValidate
                  onSubmit={(evento) => {
                    evento.preventDefault();
                    void salvar();
                  }}
                >
                  <div className="ig-mb4">
                    <p className="ig-typo-16">Novo webhook</p>
                  </div>

                  {urls.map((url, indice) => {
                    const aparada = url.trim();
                    const invalida = aparada !== '' && !urlValida(aparada, todasAsUrls);
                    return (
                      <div className="ig-grupo-url" key={indice}>
                        <div className="ig-linha-url">
                          <Campo
                            id={`url-webhook-${indice}`}
                            className="ig-campo-url"
                            rotulo="Endereço HTTPS"
                            value={url}
                            error={
                              invalida
                                ? 'O endereço precisa ser HTTPS, não repetir e não apontar para rede privada.'
                                : undefined
                            }
                            aoMudar={(value) =>
                              setUrls((atual) => atual.map((u, i) => (i === indice ? value : u)))
                            }
                            placeholder="https://minha-aplicacao.com/webhook"
                          />
                          {urls.length > 1 ? (
                            <button
                              type="button"
                              className="ig-botao-icone"
                              aria-label="Remover endereço"
                              onClick={() => setUrls((atual) => removerUrl(atual, indice))}
                            >
                              <IconePortal nome="fechar" tamanho={20} />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}

                  <div className="ig-avancado">
                    <button
                      type="button"
                      className="ig-avancado-cabeca"
                      aria-expanded={avancadoAberto}
                      onClick={() => setAvancadoAberto((atual) => !atual)}
                    >
                      <span className="ig-avancado-seta">
                        <IconePortal nome={avancadoAberto ? 'cima' : 'baixo'} tamanho={16} />
                      </span>
                      <span className="ig-typo-14">Configurações avançadas (Opcional)</span>
                    </button>

                    {avancadoAberto ? (
                      <div className="ig-avancado-corpo">
                        <div className="ig-chips ig-mb4">
                          <p className="ig-typo-14 ig-mb3">Tipos de envio</p>
                          <div className="ig-chips-linha">
                            {TODOS_OS_EVENTOS.map((evento) => (
                              <label key={evento} className="ig-chip-checkbox">
                                <input
                                  type="checkbox"
                                  checked={eventos.includes(evento)}
                                  onChange={(e) =>
                                    setEventos((atual) =>
                                      e.target.checked
                                        ? [...atual, evento]
                                        : atual.filter((item) => item !== evento),
                                    )
                                  }
                                />
                                {rotuloDoEvento(evento)}
                              </label>
                            ))}
                          </div>
                          {eventos.length === 0 ? (
                            <p className="ig-field-error">Ao menos um tipo deve estar selecionado.</p>
                          ) : null}
                        </div>

                        <div className="ig-authentication ig-mb4">
                          <p className="ig-typo-14 ig-mb3">Configurações de autenticação</p>
                          <div className="ig-interruptor-linha">
                            <Interruptor
                              id="webhook-autenticacao-ligada"
                              curto
                              ligado={tipoAuth !== 'nenhuma'}
                              rotulo="Autenticação"
                              aoMudar={(ligado) => {
                                if (!ligado) {
                                  setTipoAuth('nenhuma');
                                  setAuthUser('');
                                  setAuthSenha('');
                                  setOauthUrl('');
                                  setOauthClientId('');
                                  setOauthClientSecret('');
                                } else {
                                  setTipoAuth('oauth2_client_credentials');
                                }
                              }}
                            />
                            <span className="ig-rotulo-interruptor">Autenticação</span>
                          </div>

                          {tipoAuth !== 'nenhuma' ? (
                            <div className="ig-chips-linha ig-mb3">
                              <label className="ig-chip-checkbox">
                                <input
                                  type="radio"
                                  name="tipo-autenticacao"
                                  checked={tipoAuth === 'oauth2_client_credentials'}
                                  onChange={() => setTipoAuth('oauth2_client_credentials')}
                                />
                                OAuth 2.0
                              </label>
                              <label className="ig-chip-checkbox">
                                <input
                                  type="radio"
                                  name="tipo-autenticacao"
                                  checked={tipoAuth === 'basica'}
                                  onChange={() => setTipoAuth('basica')}
                                />
                                Autenticação básica
                              </label>
                            </div>
                          ) : null}

                          {tipoAuth === 'oauth2_client_credentials' ? (
                            <div className="ig-oauth">
                              <div className="ig-oauth-miolo">
                                <p className="ig-oauth-info">
                                  Informe os dados de acesso do OAuth 2.0 para autenticar as chamadas
                                  enviadas a este webhook.
                                </p>
                                <div className="ig-oauth-row">
                                  <Campo
                                    className="ig-w40"
                                    rotulo="URL de autorização"
                                    value={oauthUrl}
                                    aoMudar={setOauthUrl}
                                    placeholder="https://exemplo.com/oauth/token"
                                  />
                                  <Campo
                                    className="ig-w10"
                                    rotulo="Grant Type"
                                    value="client_credentials"
                                    onlyRead
                                  />
                                  <Campo
                                    className="ig-w40"
                                    rotulo="Client ID"
                                    value={oauthClientId}
                                    aoMudar={setOauthClientId}
                                  />
                                </div>
                                <div className="ig-oauth-row">
                                  <Campo
                                    className="ig-w40"
                                    tipo="password"
                                    rotulo="Client Secret"
                                    value={oauthClientSecret}
                                    aoMudar={setOauthClientSecret}
                                  />
                                </div>
                              </div>
                            </div>
                          ) : null}

                          {tipoAuth === 'basica' ? (
                            <div className="ig-oauth">
                              <div className="ig-oauth-miolo">
                                <div className="ig-oauth-row">
                                  <Campo
                                    className="ig-w40"
                                    rotulo="Usuário"
                                    value={authUser}
                                    aoMudar={setAuthUser}
                                  />
                                  <Campo
                                    className="ig-w40"
                                    tipo="password"
                                    rotulo="Senha"
                                    value={authSenha}
                                    aoMudar={setAuthSenha}
                                  />
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>

                        <div className="ig-headers-block">
                          <p className="ig-typo-14 ig-mb3">Cabeçalhos customizados</p>
                          {cabecalhos.map((cabecalho, indice) => (
                            <div className="ig-header-row" key={indice}>
                              <Campo
                                className="ig-cabecalho-campo ig-w40"
                                rotulo="Chave"
                                value={cabecalho.key}
                                aoMudar={(value) =>
                                  setCabecalhos((atual) =>
                                    atual.map((c, i) => (i === indice ? { ...c, key: value } : c)),
                                  )
                                }
                              />
                              <Campo
                                className="ig-cabecalho-campo ig-w40"
                                rotulo="Valor"
                                value={cabecalho.value}
                                aoMudar={(value) =>
                                  setCabecalhos((atual) =>
                                    atual.map((c, i) => (i === indice ? { ...c, value } : c)),
                                  )
                                }
                              />
                              <button
                                type="button"
                                className="ig-botao-icone"
                                aria-label="Remover cabeçalho"
                                onClick={() =>
                                  setCabecalhos((atual) => atual.filter((_, i) => i !== indice))
                                }
                              >
                                <IconePortal nome="lixeira" tamanho={20} />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            className="ig-botao-tracejado"
                            disabled={cabecalhos.length >= LIMITE_CABECALHOS}
                            onClick={() =>
                              setCabecalhos((atual) => [...atual, { key: '', value: '' }])
                            }
                          >
                            + Adicionar cabeçalho
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {creationNotice ? (
                    <p role="alert" className="ig-aviso">
                      {creationNotice}
                    </p>
                  ) : null}
                  <div className="ig-actions">
                    <button
                      type="button"
                      className="ig-botao ig-botao--fantasma"
                      disabled={urls.length >= LIMITE_URLS}
                      onClick={() => setUrls((atual) => adicionarUrl(atual))}
                    >
                      + Adicionar
                    </button>
                    <button type="submit" className="ig-botao ig-botao--principal" disabled={salvarBloqueado}>
                      {criando ? 'Salvando…' : 'Salvar'}
                    </button>
                  </div>
                </form>

                <ul className="ig-lista-webhooks">
                  {webhooks.map((webhook) => (
                    <li key={webhook.id} className="ig-grupo-url">
                      <div className="ig-linha-url">
                        <span className="ig-typo-16">{webhook.url}</span>
                        <Interruptor
                          id={`webhook-ativo-${webhook.id}`}
                          ligado={webhook.active}
                          rotulo={webhook.active ? 'Desativar webhook' : 'Ativar webhook'}
                          aoMudar={() => void alternarAtivo(webhook)}
                        />
                        <button
                          type="button"
                          className="ig-botao-icone"
                          aria-label="Testar webhook"
                          onClick={() => void testar(webhook)}
                        >
                          <IconePortal nome="testar" tamanho={24} />
                        </button>
                        <button
                          type="button"
                          className="ig-botao-icone"
                          aria-label="Excluir webhook"
                          onClick={() => {
                            deletionSetError(null);
                            setExcluindo(webhook);
                          }}
                        >
                          <IconePortal nome="lixeira" tamanho={24} />
                        </button>
                      </div>
                      <div className="ig-chips-linha">
                        {webhook.eventos.map((evento) => (
                          <span className="ig-chip" key={evento}>
                            {rotuloDoEvento(evento)}
                          </span>
                        ))}
                        <span className="ig-chip">{authenticationLabel(webhook.authentication.type)}</span>
                        {webhook.cabecalhos.length > 0 ? (
                          <span className="ig-chip">
                            {webhook.cabecalhos.length}{' '}
                            {webhook.cabecalhos.length === 1 ? 'cabeçalho customizado' : 'cabeçalhos customizados'}
                          </span>
                        ) : null}
                      </div>
                      {testOf[webhook.id] ? <p className="ig-typo-14">{testOf[webhook.id]}</p> : null}
                    </li>
                  ))}
                  {webhooks.length === 0 && !isLoading ? (
                    <li className="ig-typo-14">Nenhum webhook configurado ainda.</li>
                  ) : null}
                </ul>
              </div>
            )}
          </div>
        </section>
      </div>

      <ConfirmModal
        aberto={excluindo !== null}
        titulo="Excluir webhook"
        message={<>Quer mesmo excluir o webhook para &quot;{excluindo?.url}&quot;?</>}
        error={deletionError}
        confirmando={excluindoAgora}
        onConfirmar={() => void confirmarExclusao()}
        onCancelar={() => setExcluindo(null)}
      />
    </>
  );
}

/* ---- `bds-input`: div.input > div.input__container > label (fs-12 bold) + input (14px). */
function Campo({
  id,
  rotulo,
  value,
  error,
  placeholder,
  className,
  tipo = 'text',
  onlyRead,
  aoMudar,
}: {
  id?: string;
  rotulo?: string;
  value: string;
  error?: string;
  placeholder?: string;
  className?: string;
  tipo?: 'text' | 'password';
  onlyRead?: boolean;
  aoMudar?: (value: string) => void;
}) {
  return (
    <div
      className={[
        'ig-campo',
        error ? 'ig-field--error' : '',
        onlyRead ? 'ig-campo--desabilitado' : '',
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
            value={value}
            placeholder={placeholder}
            autoComplete="off"
            autoCapitalize="off"
            readOnly={onlyRead}
            onChange={(evento) => aoMudar?.(evento.target.value)}
          />
        </div>
      </div>
      {error ? <p className="ig-field-error">{error}</p> : null}
    </div>
  );
}
