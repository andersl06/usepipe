import { useState } from 'react';
import Link from '../../../../componentes/link';
import { IconePortal } from '../../../../componentes/icones-portal';
import { useLeitura } from '../../../../lib/consulta';
import { ModalConfirmacao } from '../../../cadastros/_modal';
import { Interruptor } from '../interruptor';
import { IlustracaoIntegracao } from '../ilustracoes';
import { LIMITE_URLS, adicionarUrl, removerUrl, salvarDesabilitado, urlValida } from './regras';
import {
  criarWebhook,
  editarWebhook,
  excluirWebhook,
  testarWebhook,
  type AutenticacaoEntrada,
  type CabecalhoCustomizado,
  type TipoAutenticacao,
  type WebhookListado,
} from './gravar';

/**
 * A tela do Webhook — `auth.application.detail.integrations.webhook`
 * (portal.js, módulo 29045): abas "Visão Geral"/"Configurações", o cartão
 * `bds-paper`, a lista de URLs com "+ Adicionar"/"Salvar" no rodapé,
 * "Configurações avançadas (Opcional)" com Tipos de envio, autenticação
 * (switch + OAuth 2.0/Básica) e cabeçalhos customizados
 * (`referencias-blip/pesquisa/blip-integracoes-webhook.md`).
 *
 * A origem grava UM webhook com várias URLs, todas com a MESMA configuração;
 * o Pipe grava em `webhook_saida` (`apis.md` §5.5) o inverso — várias LINHAS,
 * cada uma com sua própria URL, eventos, autenticação e cabeçalhos. A tela
 * concilia os dois: o formulário "Novo webhook" é o da origem (lista de
 * URLs com `adicionarUrl`/`removerUrl`/`urlValida` de `regras.ts`, uma
 * "Configurações avançadas" só), e "Salvar" cria UM `webhook_saida` por URL
 * preenchida, todos com a mesma configuração — a lista de URLs da origem
 * virando a lista de linhas do Pipe.
 *
 * ponytail: eventos/autenticação/cabeçalhos de um webhook JÁ CRIADO só se
 * editam recriando (excluir + criar de novo); não há edição inline dessas
 * três coisas por linha — a tela original também não tinha edição de URL/
 * eventos pós-criação, só ativar/desativar, testar e excluir. Adicionar
 * edição completa por linha, se pedirem.
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

function rotuloDaAutenticacao(tipo: TipoAutenticacao): string {
  if (tipo === 'basica') return 'Autenticação básica';
  if (tipo === 'oauth2_client_credentials') return 'OAuth 2.0';
  return 'Sem autenticação';
}

type Aba = 'visao-geral' | 'configuracoes';

export function TelaDoWebhook({ base }: { base: string }) {
  const { data, isLoading } = useLeitura<WebhookListado[]>('/v1/gestao/webhooks');
  const webhooks = data ?? [];
  const algumAtivo = webhooks.some((w) => w.ativo);

  const [aba, setAba] = useState<Aba>('visao-geral');
  const [avancadoAberto, setAvancadoAberto] = useState(false);

  const [urls, setUrls] = useState<string[]>(['']);
  const [eventos, setEventos] = useState<string[]>([...TODOS_OS_EVENTOS]);
  const [tipoAuth, setTipoAuth] = useState<TipoAutenticacao>('nenhuma');
  const [authUsuario, setAuthUsuario] = useState('');
  const [authSenha, setAuthSenha] = useState('');
  const [oauthUrl, setOauthUrl] = useState('');
  const [oauthClientId, setOauthClientId] = useState('');
  const [oauthClientSecret, setOauthClientSecret] = useState('');
  const [cabecalhos, setCabecalhos] = useState<CabecalhoCustomizado[]>([]);

  const [criando, setCriando] = useState(false);
  const [avisoDeCriacao, setAvisoDeCriacao] = useState('');
  const [segredosGerados, setSegredosGerados] = useState<{ url: string; segredo: string }[]>([]);

  const [excluindo, setExcluindo] = useState<WebhookListado | null>(null);
  const [excluindoAgora, setExcluindoAgora] = useState(false);
  const [erroDeExclusao, setErroDeExclusao] = useState<string | null>(null);
  const [testeDe, setTesteDe] = useState<Record<string, string>>({});

  const urlsAparadas = urls.map((u) => u.trim());
  const urlsPreenchidas = urlsAparadas.filter((u) => u !== '');
  const todasAsUrls = [...webhooks.map((w) => w.url), ...urlsPreenchidas];
  const algumaUrlRepeteWebhookExistente = urlsPreenchidas.some((u) =>
    webhooks.some((w) => w.url === u),
  );
  const autenticacaoIncompleta =
    (tipoAuth === 'basica' && (!authUsuario.trim() || !authSenha)) ||
    (tipoAuth === 'oauth2_client_credentials' &&
      (!oauthUrl.trim() || !oauthClientId.trim() || !oauthClientSecret));
  const salvarBloqueado =
    criando ||
    urlsPreenchidas.length === 0 ||
    salvarDesabilitado(urlsAparadas) ||
    algumaUrlRepeteWebhookExistente ||
    eventos.length === 0 ||
    autenticacaoIncompleta;

  function autenticacaoParaEnvio(): AutenticacaoEntrada {
    if (tipoAuth === 'basica') return { tipo: 'basica', usuario: authUsuario.trim(), senha: authSenha };
    if (tipoAuth === 'oauth2_client_credentials') {
      return {
        tipo: 'oauth2_client_credentials',
        urlAutorizacao: oauthUrl.trim(),
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
    setAuthUsuario('');
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
    setAvisoDeCriacao('');
    const autenticacao = autenticacaoParaEnvio();
    const cabecalhosPreenchidos = cabecalhos
      .map((c) => ({ chave: c.chave.trim(), valor: c.valor }))
      .filter((c) => c.chave !== '');

    const criados: { url: string; segredo: string }[] = [];
    for (const url of urlsPreenchidas) {
      const resultado = await criarWebhook(url, eventos, autenticacao, cabecalhosPreenchidos);
      if (!resultado.ok) {
        setCriando(false);
        setAvisoDeCriacao(resultado.erro);
        if (criados.length > 0) setSegredosGerados(criados);
        return;
      }
      criados.push({ url: resultado.valor.url, segredo: resultado.valor.segredo });
    }
    setCriando(false);
    setSegredosGerados(criados);
    limparRascunho();
  }

  async function alternarAtivo(webhook: WebhookListado) {
    await editarWebhook(webhook.id, { ativo: !webhook.ativo });
  }

  async function testar(webhook: WebhookListado) {
    setTesteDe((atual) => ({ ...atual, [webhook.id]: 'Testando…' }));
    const resultado = await testarWebhook(webhook.id);
    let texto: string;
    if (!resultado.ok) {
      texto = resultado.erro;
    } else if (resultado.valor.ok) {
      texto = `Entregue (HTTP ${resultado.valor.status}).`;
      if (resultado.valor.corpo) texto += ` Resposta: "${resultado.valor.corpo}"`;
    } else {
      texto = `Falhou: ${resultado.valor.erro ?? `HTTP ${resultado.valor.status}`}`;
      if (resultado.valor.corpo) texto += ` — "${resultado.valor.corpo}"`;
    }
    setTesteDe((atual) => ({ ...atual, [webhook.id]: texto }));
  }

  async function confirmarExclusao() {
    if (!excluindo) return;
    setExcluindoAgora(true);
    setErroDeExclusao(null);
    const resultado = await excluirWebhook(excluindo.id);
    setExcluindoAgora(false);
    if (!resultado.ok) {
      setErroDeExclusao(resultado.erro);
      return;
    }
    setExcluindo(null);
  }

  return (
    <>
      <header className="ph-cabecalho">
        <div className="ph-conteudo">
          <div className="ph-voltar-caixa">
            <Link className="ph-voltar" href={`${base}/integracoes`} aria-label="Voltar">
              <IconePortal nome="voltar" tamanho={22} />
            </Link>
          </div>
          <div className="ph-titulo-caixa">
            <h1 className="ph-titulo">Webhook</h1>
          </div>
        </div>
      </header>

      <div className="ig-grade">
        <section className="ig-papel">
          <div className="ig-papel-miolo">
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
              <div className="ig-painel">
                <IlustracaoIntegracao nome="webhook" altura={72} className="ig-figura-grande" />
                <div className="ig-painel-texto">
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
              <div className="ig-painel-texto">
                {segredosGerados.length > 0 ? (
                  <div className="ig-form ig-segredo-gerado">
                    <p className="ig-typo-16">
                      <strong>
                        {segredosGerados.length === 1
                          ? 'Webhook criado.'
                          : `${segredosGerados.length} webhooks criados.`}
                      </strong>{' '}
                      Copie os segredos agora: por segurança, eles não podem ser mostrados de novo.
                    </p>
                    {segredosGerados.map((gerado) => (
                      <div key={gerado.url} className="ig-mb3">
                        <p className="ig-typo-14">{gerado.url}</p>
                        <div className="cf-copiavel">
                          <input readOnly value={gerado.segredo} aria-label={`Segredo de ${gerado.url}`} />
                          <button
                            type="button"
                            className="cf-copiavel-botao"
                            aria-label={`Copiar segredo de ${gerado.url}`}
                            onClick={() => void navigator.clipboard?.writeText(gerado.segredo)}
                          >
                            Copiar
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="ig-botao ig-botao--fantasma"
                      onClick={() => setSegredosGerados([])}
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
                            valor={url}
                            erro={
                              invalida
                                ? 'O endereço precisa ser HTTPS, não repetir e não apontar para rede privada.'
                                : undefined
                            }
                            aoMudar={(valor) =>
                              setUrls((atual) => atual.map((u, i) => (i === indice ? valor : u)))
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
                            <p className="ig-campo-erro">Ao menos um tipo deve estar selecionado.</p>
                          ) : null}
                        </div>

                        <div className="ig-autenticacao ig-mb4">
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
                                  setAuthUsuario('');
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
                                <div className="ig-oauth-fileira">
                                  <Campo
                                    className="ig-w40"
                                    rotulo="URL de autorização"
                                    valor={oauthUrl}
                                    aoMudar={setOauthUrl}
                                    placeholder="https://exemplo.com/oauth/token"
                                  />
                                  <Campo
                                    className="ig-w10"
                                    rotulo="Grant Type"
                                    valor="client_credentials"
                                    somenteLeitura
                                  />
                                  <Campo
                                    className="ig-w40"
                                    rotulo="Client ID"
                                    valor={oauthClientId}
                                    aoMudar={setOauthClientId}
                                  />
                                </div>
                                <div className="ig-oauth-fileira">
                                  <Campo
                                    className="ig-w40"
                                    tipo="password"
                                    rotulo="Client Secret"
                                    valor={oauthClientSecret}
                                    aoMudar={setOauthClientSecret}
                                  />
                                </div>
                              </div>
                            </div>
                          ) : null}

                          {tipoAuth === 'basica' ? (
                            <div className="ig-oauth">
                              <div className="ig-oauth-miolo">
                                <div className="ig-oauth-fileira">
                                  <Campo
                                    className="ig-w40"
                                    rotulo="Usuário"
                                    valor={authUsuario}
                                    aoMudar={setAuthUsuario}
                                  />
                                  <Campo
                                    className="ig-w40"
                                    tipo="password"
                                    rotulo="Senha"
                                    valor={authSenha}
                                    aoMudar={setAuthSenha}
                                  />
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>

                        <div className="ig-cabecalhos-bloco">
                          <p className="ig-typo-14 ig-mb3">Cabeçalhos customizados</p>
                          {cabecalhos.map((cabecalho, indice) => (
                            <div className="ig-cabecalho-fileira" key={indice}>
                              <Campo
                                className="ig-cabecalho-campo ig-w40"
                                rotulo="Chave"
                                valor={cabecalho.chave}
                                aoMudar={(valor) =>
                                  setCabecalhos((atual) =>
                                    atual.map((c, i) => (i === indice ? { ...c, chave: valor } : c)),
                                  )
                                }
                              />
                              <Campo
                                className="ig-cabecalho-campo ig-w40"
                                rotulo="Valor"
                                valor={cabecalho.valor}
                                aoMudar={(valor) =>
                                  setCabecalhos((atual) =>
                                    atual.map((c, i) => (i === indice ? { ...c, valor } : c)),
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
                              setCabecalhos((atual) => [...atual, { chave: '', valor: '' }])
                            }
                          >
                            + Adicionar cabeçalho
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {avisoDeCriacao ? (
                    <p role="alert" className="ig-aviso">
                      {avisoDeCriacao}
                    </p>
                  ) : null}
                  <div className="ig-acoes">
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
                          ligado={webhook.ativo}
                          rotulo={webhook.ativo ? 'Desativar webhook' : 'Ativar webhook'}
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
                            setErroDeExclusao(null);
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
                        <span className="ig-chip">{rotuloDaAutenticacao(webhook.autenticacao.tipo)}</span>
                        {webhook.cabecalhos.length > 0 ? (
                          <span className="ig-chip">
                            {webhook.cabecalhos.length}{' '}
                            {webhook.cabecalhos.length === 1 ? 'cabeçalho customizado' : 'cabeçalhos customizados'}
                          </span>
                        ) : null}
                      </div>
                      {testeDe[webhook.id] ? <p className="ig-typo-14">{testeDe[webhook.id]}</p> : null}
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

      <ModalConfirmacao
        aberto={excluindo !== null}
        titulo="Excluir webhook"
        mensagem={<>Quer mesmo excluir o webhook para &quot;{excluindo?.url}&quot;?</>}
        erro={erroDeExclusao}
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
  valor,
  erro,
  placeholder,
  className,
  tipo = 'text',
  somenteLeitura,
  aoMudar,
}: {
  id?: string;
  rotulo?: string;
  valor: string;
  erro?: string;
  placeholder?: string;
  className?: string;
  tipo?: 'text' | 'password';
  somenteLeitura?: boolean;
  aoMudar?: (valor: string) => void;
}) {
  return (
    <div
      className={[
        'ig-campo',
        erro ? 'ig-campo--erro' : '',
        somenteLeitura ? 'ig-campo--desabilitado' : '',
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
            autoComplete="off"
            autoCapitalize="off"
            readOnly={somenteLeitura}
            onChange={(evento) => aoMudar?.(evento.target.value)}
          />
        </div>
      </div>
      {erro ? <p className="ig-campo-erro">{erro}</p> : null}
    </div>
  );
}
