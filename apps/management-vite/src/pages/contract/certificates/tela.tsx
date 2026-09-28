import { useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { IconePortal } from '../../../components/icones-portal';
import {
  expirationData,
  etiquetaDoStatus,
  hostValido,
  informationComplete,
  readFileAsDataUrl,
  problemInFile,
  type CertificadoMtls,
  type HostDigitado,
} from '../../../lib/certificados';
import { cadastrarCertificado, excluirCertificado, excluirHostDoCertificado } from './actions';
import type { PedidoDeCertificado } from './actions';

/**
 * The authentication Certificados screen, following the mechanics of their `zt` (`main.e8593b01.chunk.js`): two stacked `bds-paper`s — the presentation one (`xt`) and the listing one (`Pt`) — and four modals: the three-step registration (`bds-modal#certificate-modal`), the certificate's hosts (`bds-modal#hosts-modal`), and the two delete warnings (`bds-alert#remove-certificate-alert` and `#remove-host-alert`). It's client-side because the source is: opening a modal, moving through the steps, and tracking which certificate is in hand are screen state. The measurements are in `certificados.css`; here are the copy and the rules. Every write falls through to `./acoes.ts` (`POST/DELETE /v1/gestao/contrato/certificados*`), which checks the permission on the server and returns the reason — shown in place of their toast. The `.pfx` and the password really do go out on "Finalizar" (data URL + password in the JSON): the `api` reads the file, extracts validity and fingerprint, stores both encrypted, and computes the status the column shows (`etiquetaDoStatus`).
 */

/** The screen's texts, in pt-BR, from the `Et`, `Ct`, `ut`, `Dt`, `Mt` and `Tt` dictionaries. */
const TEXTO = {
  apresentacao: {
    titulo: 'Criptografia ponta a ponta',
    subtitulo:
      'O mTLS (abreviação de TLS mútuo no inglês) é um método de autenticação que verifica se cada parte em uma conexão de rede tem uma chave privada para garantir autenticidade da identifcação. Você pode cadastrar certificados de autenticação que serão usados nas suas operações no Pipe.',
    botao: 'Cadastrar novo certificado',
  },
  lista: {
    titulo: 'Certificados MTLS',
    subtitulo: 'Listagem de certificados MTLS',
    colunas: ['Descrição', 'Expiração', 'Status', 'Ações'],
    tituloDosHosts: 'Hosts do certificado',
  },
  passo: { proximo: 'Próximo', voltar: 'Voltar', finalizar: 'Finalizar' },
  upload: {
    titulo: 'Upload do certificado',
    subtitulo: 'Arraste o certificate .pfx ou clique para selecionar',
    soltar: 'Arraste e solte seus arquivos aqui ou clique para fazer upload do arquivo',
    senha: 'Senha',
    senhaDica: 'Insira a senha do certificado',
  },
  info: {
    titulo: 'Informações do certificado',
    descricao: 'Descrição',
    descricaoDica: 'Insira a descrição do certificado',
    descricaoInvalida: 'Insira uma descrição válida para o certificado',
    url: 'URL',
    urlDica: 'Insira a URL do certificado',
    urlInvalida: 'Insira uma URL HTTPS válida',
  },
  conferencia: {
    titulo: 'Conferência',
    subtitulo: 'Confirme as informações do certificado',
    arquivo: 'Arquivo',
    descricao: 'Descrição',
    url: 'URL',
  },
  hosts: { titulo: 'Gerencie o host do certificado ', host: 'Host', acoes: 'Ações' },
  alerta: {
    atencao: 'Atenção',
    cancelar: 'Cancelar',
    deletar: 'Deletar',
    certificado: 'Deseja realmente deletar esse certificado? Esta ação nao pode ser desfeita!',
    host: 'Deseja realmente deletar esse host? Esta ação nao pode ser desfeita!',
  },
} as const;

const PASSOS = [TEXTO.upload.titulo, TEXTO.info.titulo, TEXTO.conferencia.titulo];

interface Entradas {
  file: File | null;
  senha: string;
  description: string;
  hosts: HostDigitado[];
}

/** The `j` of `zt`: the blank form, with one URL field. */
const EMPTY: Entradas = {
  file: null,
  senha: '',
  description: '',
  hosts: [{ host: '', valido: true }],
};

export function TelaDeCertificados({
  certificados,
  podeEscrever,
}: {
  certificados: CertificadoMtls[];
  podeEscrever: boolean;
}) {
  const registration = useRef<HTMLDialogElement>(null);
  const hostsWindow = useRef<HTMLDialogElement>(null);
  const alertaDeCertificado = useRef<HTMLDialogElement>(null);
  const alertaDeHost = useRef<HTMLDialogElement>(null);

  const [emMao, marcarEmMao] = useState<string | null>(null);
  const [hostEmMao, marcarHostEmMao] = useState<string | null>(null);
  const [enviando, marcarEnviando] = useState(false);
  const [aviso, avisar] = useState<string | null>(null);

  const certificado = certificados.find((c) => c.id === emMao) ?? null;

  async function cadastrar(pedido: PedidoDeCertificado): Promise<boolean> {
    marcarEnviando(true);
    try {
      const resultado = await cadastrarCertificado(pedido);
      if (!resultado.ok) {
        avisar(resultado.error);
        return false;
      }
      return true;
    } finally {
      marcarEnviando(false);
    }
  }

  async function deletarCertificado() {
    if (!emMao) return;
    marcarEnviando(true);
    try {
      const resultado = await excluirCertificado(emMao);
      if (!resultado.ok) {
        avisar(resultado.error ?? 'Falha ao tentar deletar certificado.');
        return;
      }
      alertaDeCertificado.current?.close();
    } finally {
      marcarEnviando(false);
    }
  }

  async function deletarHost() {
    if (!emMao || !hostEmMao) return;
    marcarEnviando(true);
    try {
      const resultado = await excluirHostDoCertificado(emMao, hostEmMao);
      if (!resultado.ok) {
        avisar(resultado.error ?? 'Falha ao tentar deletar host.');
        return;
      }
      alertaDeHost.current?.close();
      // "If the certificate ends up without a host, the hosts modal closes and the list
      // reloads after 1s" — the domain's `excluirHostDoCertificado` already
      // deletes the certificate too when it was the last one; here we only close the
      // hosts window if it no longer exists in the reloaded list.
      if ((certificado?.hosts.length ?? 0) <= 1) hostsWindow.current?.close();
    } finally {
      marcarEnviando(false);
    }
  }

  return (
    <div id="certificates" className="cm-grade">
      {/* `xt`: the presentation paper. */}
      <section className="cm-paper">
        <div className="cm-presentation">
          {/*
 * Their `bds-illustration type="spots" name="lock-2"` is left out: it wasn't captured and we don't have one.
 */}
          <div className="cm-presentation-text">
            <div className="cm-cabeca">
              <h2 className="cm-t24 cm-t24--margem">{TEXTO.apresentacao.titulo}</h2>
              <p className="cm-t16">{TEXTO.apresentacao.subtitulo}</p>
            </div>
            {podeEscrever ? (
              <div>
                <button
                  type="button"
                  className="cm-botao"
                  onClick={() => registration.current?.showModal()}
                >
                  {/* `icon="add"`, medium (24): o nosso `mais`. */}
                  <IconePortal nome="mais" tamanho={24} />
                  {TEXTO.apresentacao.botao}
                </button>
                <Registration
                  window={registration}
                  enviando={enviando}
                  aoAvisar={avisar}
                  aoFinalizar={cadastrar}
                />
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* `Pt`: o paper da listagem. */}
      <section className="cm-paper">
        <div className="cm-lista">
          <div className="cm-cabeca">
            <h2 className="cm-t24">{TEXTO.lista.titulo}</h2>
            <p className="cm-t16">{TEXTO.lista.subtitulo}</p>
          </div>

          {/*
 * With no certificates the table shows only the header: the source has no empty-list message.
 */}
          <Tabela id="certificates-table" colunas={TEXTO.lista.colunas}>
            {certificados.map((c) => {
              return (
                <tr key={c.id} data-testid={c.id}>
                  <td className="cm-col-description" title={c.description}>
                    {c.description}
                  </td>
                  <td>{expirationData(c.expiresAt)}</td>
                  <td>
                    {/*
 * `bds-chip-tag` by `status` — the source's computed chip, with the fingerprint and subject in the tooltip.
 */}
                    <Etiqueta certificado={c} />
                  </td>
                  <td className="cm-col-actions">
                    {podeEscrever ? (
                      <span className="cm-actions">
                        <BotaoDeIcone
                          nome="lixeira"
                          rotulo={`Deletar ${c.description}`}
                          aoClicar={() => {
                            marcarEmMao(c.id);
                            alertaDeCertificado.current?.showModal();
                          }}
                        />
                        <BotaoDeIcone
                          nome="editar"
                          rotulo={`Hosts de ${c.description}`}
                          aoClicar={() => {
                            marcarEmMao(c.id);
                            hostsWindow.current?.showModal();
                          }}
                        />
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </Tabela>

          <Alerta
            window={alertaDeCertificado}
            id="remove-certificate-alert"
            message={TEXTO.alerta.certificado}
            enviando={enviando}
            aoDeletar={deletarCertificado}
          />

          {/*
 * `bds-modal#hosts-modal title="Hosts do certificado"`: in the web component, `title` is the HTML attribute — a tooltip, not a header.
 */}
          <dialog
            ref={hostsWindow}
            id="hosts-modal"
            className="cm-modal"
            title={TEXTO.lista.tituloDosHosts}
          >
            <CloseWindow window={hostsWindow} />
            <div className="cm-paper">
              <div className="cm-lista">
                <div className="cm-cabeca">
                  <p className="cm-t20">
                    {TEXTO.hosts.titulo}
                    {certificado?.description ?? ''}
                  </p>
                </div>
                <div className="cm-scroll">
                  <Tabela id="hosts-table" colunas={[TEXTO.hosts.host, TEXTO.hosts.acoes]}>
                    {(certificado?.hosts ?? []).map((h) => (
                      <tr key={h.id} data-testid={h.id}>
                        <td className="cm-col-description">{h.host}</td>
                        <td className="cm-col-actions">
                          {podeEscrever ? (
                            <BotaoDeIcone
                              nome="lixeira"
                              rotulo={`Deletar ${h.host}`}
                              aoClicar={() => {
                                marcarHostEmMao(h.id);
                                alertaDeHost.current?.showModal();
                              }}
                            />
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </Tabela>
                </div>
              </div>
            </div>
            <Alerta
              window={alertaDeHost}
              id="remove-host-alert"
              message={TEXTO.alerta.host}
              enviando={enviando}
              aoDeletar={deletarHost}
            />
          </dialog>
        </div>
      </section>

      <Aviso texto={aviso} aoSumir={() => avisar(null)} />
    </div>
  );
}

/* ---------------------------------------------------------------- pieces */

function Tabela({
  id,
  colunas,
  children,
}: {
  id: string;
  colunas: readonly string[];
  children: ReactNode;
}) {
  return (
    <div className="cm-tabela-moldura">
      <table id={id} className="cm-tabela">
        <thead>
          <tr>
            {colunas.map((c) => (
              <th key={c}>
                <span>{c}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/**
 * `bds-chip-tag` for the Status column: `success`/`disabled`/`default` per `etiquetaDoStatus`. The tooltip carries what the `api` read from the `.pfx`.
 */
function Etiqueta({ certificado }: { certificado: CertificadoMtls }) {
  const { texto, classe } = etiquetaDoStatus(certificado.status);
  const dica = [
    certificado.subject ? `Sujeito: ${certificado.subject}` : null,
    certificado.issuer ? `Emissor: ${certificado.issuer}` : null,
    `SHA-256: ${certificado.impressaoDigital}`,
  ]
    .filter(Boolean)
    .join('\n');
  return (
    <span className={`cm-etiqueta cm-etiqueta--${classe}`} title={dica} data-status={certificado.status}>
      <span>{texto}</span>
    </span>
  );
}

/** `bds-button-icon size="short" variant="secondary"`. */
function BotaoDeIcone({
  nome,
  rotulo,
  aoClicar,
}: {
  nome: 'lixeira' | 'editar';
  rotulo: string;
  aoClicar: () => void;
}) {
  return (
    <button type="button" className="cm-botao-icone-so" aria-label={rotulo} onClick={aoClicar}>
      <IconePortal nome={nome} tamanho={24} />
    </button>
  );
}

/** The `bds-modal`'s `close-button`: the `close` icon (medium, 24), our `fechar`. */
function CloseWindow({ window }: { window: RefObject<HTMLDialogElement | null> }) {
  return (
    <button
      type="button"
      className="cm-fechar"
      aria-label="Fechar"
      onClick={() => window.current?.close()}
    >
      <IconePortal nome="fechar" tamanho={24} />
    </button>
  );
}

function Alerta({
  window,
  id,
  message,
  enviando,
  aoDeletar,
}: {
  window: RefObject<HTMLDialogElement | null>;
  id: string;
  message: string;
  enviando: boolean;
  aoDeletar: () => void;
}) {
  return (
    <dialog ref={window} id={id} className="cm-alerta">
      <div className="cm-alerta-topo">
        <IconePortal nome="alerta" tamanho={32} />
        <b>{TEXTO.alerta.atencao}</b>
      </div>
      <p className="cm-alerta-corpo">{message}</p>
      <div className="cm-alert-actions">
        <button
          type="button"
          className="cm-botao cm-botao--secundario"
          disabled={enviando}
          onClick={() => window.current?.close()}
        >
          {TEXTO.alerta.cancelar}
        </button>
        <button
          type="button"
          className="cm-botao cm-botao--secundario"
          disabled={enviando}
          onClick={aoDeletar}
        >
          {TEXTO.alerta.deletar}
        </button>
      </div>
    </dialog>
  );
}

/**
 * Their toast (`Object(m.g)({ type, message })`). `popover` so it stays on top even over an open modal, the way their toast does; disappears on its own.
 */
function Aviso({ texto, aoSumir }: { texto: string | null; aoSumir: () => void }) {
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = caixa.current;
    if (!el || !texto) return;
    el.showPopover();
    const relogio = setTimeout(aoSumir, 6000);
    return () => {
      clearTimeout(relogio);
      if (el.matches(':popover-open')) el.hidePopover();
    };
  }, [texto, aoSumir]);

  return (
    <div ref={caixa} popover="manual" role="alert" className="cm-aviso">
      {texto}
    </div>
  );
}

/* ------------------------------------------------------------- cadastro */

/**
 * The `yt`: the `bds-stepper` with three steps, the 40×18rem scrollable box and the button row. "Próximo" only unlocks once the current step is filled in; the file is only checked at "Finalizar", same as there. **What changes from the source**: there, step 1 unlocks with just the filename, and the wrong password shows up at "Finalizar"; here the password is also required to advance, because the `api` refuses the registration without it — getting the password wrong is still the "Finalizar" toast ("A senha do certificado está incorreta."). What goes to `POST /v1/gestao/contrato/certificados`: file (data URL), password, description and hosts.
 */
function Registration({
  window,
  enviando,
  aoAvisar,
  aoFinalizar,
}: {
  window: RefObject<HTMLDialogElement | null>;
  enviando: boolean;
  aoAvisar: (texto: string) => void;
  aoFinalizar: (pedido: PedidoDeCertificado) => Promise<boolean>;
}) {
  const [passo, irPara] = useState(0);
  const [entradas, preencher] = useState<Entradas>(EMPTY);
  const [tocado, marcarTocado] = useState(false);

  const hasFile = entradas.file !== null && entradas.senha !== '';
  const infoOk = informationComplete(entradas.description, entradas.hosts);

  function switchHost(indice: number, value: string) {
    preencher((antes) => ({
      ...antes,
      hosts: antes.hosts.map((h, i) =>
        i === indice ? { host: value, valido: hostValido(value, antes.hosts) } : h,
      ),
    }));
  }

  async function finalizar() {
    if (!hasFile || !infoOk || !entradas.file) return;
    const problema = problemInFile(entradas.file);
    if (problema) return aoAvisar(problema);

    let file: string;
    try {
      file = await readFileAsDataUrl(entradas.file);
    } catch {
      return aoAvisar(problemInFile(null) ?? '');
    }

    const gravou = await aoFinalizar({
      description: entradas.description,
      hosts: entradas.hosts.map((h) => h.host),
      senha: entradas.senha,
      file,
    });
    // Success: form cleared, back to step 1, and closes — failure: the source
    // shows the toast and leaves the window open (`aoAvisar` already handled the toast).
    if (gravou) {
      preencher(EMPTY);
      marcarTocado(false);
      irPara(0);
      window.current?.close();
    }
  }

  return (
    <dialog ref={window} id="certificate-modal" className="cm-modal cm-modal--registration">
      <CloseWindow window={window} />

      <ol className="cm-passos">
        {PASSOS.map((rotulo, i) => (
          <li
            key={rotulo}
            className={`cm-passo${i === passo ? ' cm-passo--ativo' : ''}${i < passo ? ' cm-passo--feito' : ''}`}
          >
            {/* Completed swaps the number for the `bds-icon name="true"` (medium): our `concluido`. */}
            <span className="cm-passo-bola">
              {i < passo ? <IconePortal nome="concluido" tamanho={24} /> : i + 1}
            </span>
            <span className="cm-passo-texto">{rotulo}</span>
          </li>
        ))}
      </ol>

      <div className="cm-caixa">
        {passo === 0 ? (
          <div className="cm-column">
            {/* `bds-upload#certificate-upload`. */}
            <div className="cm-upload">
              <div className="cm-upload-topo">
                {/* `bds-icon name="upload" size="xxx-large"` (40): o nosso `enviar-arquivo`. */}
                <IconePortal nome="enviar-arquivo" tamanho={40} className="cm-upload-icone" />
                <div className="cm-upload-textos">
                  <b className="cm-t16">{TEXTO.upload.titulo}</b>
                  <span className="cm-t14">{TEXTO.upload.subtitulo}</span>
                </div>
              </div>
              {entradas.file ? (
                <div className="cm-upload-previa">
                  {/* `bds-icon size="x-small" name="attach"` (16): o nosso `anexo`. */}
                  <IconePortal nome="anexo" tamanho={16} />
                  <p>{entradas.file.name}</p>
                  <BotaoDeIcone
                    nome="lixeira"
                    rotulo={`Remover ${entradas.file.name}`}
                    aoClicar={() => preencher((antes) => ({ ...antes, file: null }))}
                  />
                </div>
              ) : null}
              <label className="cm-upload-soltar">
                <span className="cm-t14">{TEXTO.upload.soltar}</span>
                <input
                  type="file"
                  accept=".pfx,.p12,application/x-pkcs12"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    preencher((antes) => ({ ...antes, file }));
                  }}
                />
              </label>
            </div>
            <div className="cm-metade">
              <Campo
                rotulo={TEXTO.upload.senha}
                tipo="password"
                value={entradas.senha}
                dica={TEXTO.upload.senhaDica}
                aoMudar={(senha) => preencher((antes) => ({ ...antes, senha }))}
              />
            </div>
          </div>
        ) : null}

        {passo === 1 ? (
          <div className="cm-column">
            <Campo
              rotulo={TEXTO.info.descricao}
              value={entradas.description}
              dica={TEXTO.info.descricaoDica}
              maximo={50}
              error={tocado && entradas.description === '' ? TEXTO.info.descricaoInvalida : null}
              aoSair={() => marcarTocado(true)}
              aoMudar={(description) => preencher((antes) => ({ ...antes, description }))}
            />
            {entradas.hosts.map((h, i) => (
              <div key={i} className="cm-linha-de-host">
                <div className="cm-linha-de-host-campo">
                  <Campo
                    rotulo={TEXTO.info.url}
                    value={h.host}
                    dica={TEXTO.info.urlDica}
                    maximo={100}
                    error={h.valido ? null : TEXTO.info.urlInvalida}
                    aoMudar={(value) => switchHost(i, value)}
                  />
                </div>
                <div className="cm-host-buttons-row">
                  {entradas.hosts.length > 1 ? (
                    <button
                      type="button"
                      className="cm-botao cm-botao--apagar"
                      onClick={() =>
                        preencher((antes) => ({
                          ...antes,
                          hosts: antes.hosts.filter((_, j) => j !== i),
                        }))
                      }
                    >
                      -
                    </button>
                  ) : null}
                  {i === entradas.hosts.length - 1 ? (
                    <button
                      type="button"
                      className="cm-botao"
                      onClick={() =>
                        preencher((antes) => ({
                          ...antes,
                          hosts: [...antes.hosts, { host: '', valido: true }],
                        }))
                      }
                    >
                      +
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {passo === 2 ? (
          <div>
            <p className="cm-t20 cm-t20--forte cm-t20--margem">{TEXTO.conferencia.subtitulo}</p>
            <b className="cm-t16">{TEXTO.conferencia.arquivo}</b>
            <p className="cm-item">{entradas.file?.name ?? ''}</p>
            <b className="cm-t16">{TEXTO.conferencia.descricao}</b>
            <p className="cm-item">{entradas.description}</p>
            <b className="cm-t16">{TEXTO.conferencia.url}</b>
            {entradas.hosts.map((h, i) => (
              <p key={i} className="cm-item">
                {h.host}
              </p>
            ))}
          </div>
        ) : null}
      </div>

      <div className="cm-rodape">
        {passo > 0 ? (
          <button
            type="button"
            className="cm-botao"
            disabled={enviando}
            onClick={() => irPara(passo - 1)}
          >
            {TEXTO.passo.voltar}
          </button>
        ) : null}
        {passo < 2 ? (
          <button
            type="button"
            className="cm-botao"
            disabled={passo === 0 ? !hasFile : !infoOk}
            onClick={() => irPara(passo + 1)}
          >
            {TEXTO.passo.proximo}
          </button>
        ) : (
          <button
            type="button"
            className="cm-botao"
            disabled={enviando || !hasFile || !infoOk}
            onClick={finalizar}
          >
            {enviando ? 'Enviando…' : TEXTO.passo.finalizar}
          </button>
        )}
      </div>
    </dialog>
  );
}

/** `bds-input`: the label on top, inside the same border, and the message below. */
function Campo({
  rotulo,
  value,
  dica,
  tipo = 'text',
  maximo,
  error = null,
  aoMudar,
  aoSair,
}: {
  rotulo: string;
  value: string;
  dica: string;
  tipo?: 'text' | 'password' | 'date';
  maximo?: number;
  error?: string | null;
  aoMudar: (value: string) => void;
  aoSair?: () => void;
}) {
  return (
    <div className="cm-campo-bloco">
      <label className={`cm-campo${error ? ' cm-field--error' : ''}`}>
        <b>{rotulo}</b>
        <input
          type={tipo}
          value={value}
          placeholder={dica}
          maxLength={maximo}
          onChange={(e) => aoMudar(e.target.value)}
          onBlur={aoSair}
        />
      </label>
      {error ? (
        <p className="cm-field-error">
          {/* `bds-icon name="error" size="x-small"`: our `fechar-chip` is their `error`. */}
          <IconePortal nome="fechar-chip" tamanho={16} />
          {error}
        </p>
      ) : null}
    </div>
  );
}
