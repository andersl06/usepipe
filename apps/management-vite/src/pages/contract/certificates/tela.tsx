import { useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { IconePortal } from '../../../components/icones-portal';
import {
  expirationData,
  etiquetaDoStatus,
  hostValido,
  informationCompletas,
  readFileAsDataUrl,
  problemaInFile,
  type CertificadoMtls,
  type HostDigitado,
} from '../../../lib/certificados';
import { cadastrarCertificado, excluirCertificado, excluirHostDoCertificado } from './actions';
import type { PedidoDeCertificado } from './actions';

/**
 * A tela de Certificados de autenticação, na mecânica do `zt` deles
 * (`main.e8593b01.chunk.js`): dois `bds-paper` empilhados — o de apresentação
 * (`xt`) e o da listagem (`Pt`) — e quatro janelas: o cadastro em três passos
 * (`bds-modal#certificate-modal`), os hosts do certificado
 * (`bds-modal#hosts-modal`) e os dois avisos de exclusão
 * (`bds-alert#remove-certificate-alert` e `#remove-host-alert`).
 *
 * É cliente porque a origem é: abrir janela, andar no passo a passo e marcar
 * qual certificado está em mão são estado de tela. As medidas estão em
 * `certificados.css`; aqui ficam os textos e as regras.
 *
 * Toda escrita cai em `./acoes.ts` (`POST/DELETE
 * /v1/gestao/contrato/certificados*`), que confere a permissão no servidor e
 * volta com o motivo — mostrado no lugar do toast deles. O `.pfx` e a senha
 * vão de verdade no "Finalizar" (data URL + senha no JSON): a `api` lê o
 * arquivo, tira validade e impressão digital, guarda os dois cifrados e
 * calcula o status que a coluna mostra (`etiquetaDoStatus`).
 */

/** Os textos da tela, em pt-BR, dos dicionários `Et`, `Ct`, `ut`, `Dt`, `Mt` e `Tt`. */
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

/** O `j` do `zt`: o formulário em branco, com um campo de URL. */
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
      // "Se o certificado fica sem host, o modal de hosts fecha e a lista
      // recarrega depois de 1s" — o `excluirHostDoCertificado` do domínio já
      // apaga o certificado junto quando era o último; aqui só se fecha a
      // janela de hosts se ele não existir mais na lista recarregada.
      if ((certificado?.hosts.length ?? 0) <= 1) hostsWindow.current?.close();
    } finally {
      marcarEnviando(false);
    }
  }

  return (
    <div id="certificates" className="cm-grade">
      {/* `xt`: o paper de apresentação. */}
      <section className="cm-papel">
        <div className="cm-apresentacao">
          {/* A `bds-illustration type="spots" name="lock-2"` da origem fica de
              fora: não foi capturada e não temos uma. */}
          <div className="cm-apresentacao-texto">
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
      <section className="cm-papel">
        <div className="cm-lista">
          <div className="cm-cabeca">
            <h2 className="cm-t24">{TEXTO.lista.titulo}</h2>
            <p className="cm-t16">{TEXTO.lista.subtitulo}</p>
          </div>

          {/* Sem certificado a tabela fica só com o cabeçalho: a origem não
              tem mensagem de lista vazia. */}
          <Tabela id="certificates-table" colunas={TEXTO.lista.colunas}>
            {certificados.map((c) => {
              return (
                <tr key={c.id} data-testid={c.id}>
                  <td className="cm-col-descricao" title={c.description}>
                    {c.description}
                  </td>
                  <td>{expirationData(c.expiraEm)}</td>
                  <td>
                    {/* `bds-chip-tag` pelo `status` — o chip calculado da origem,
                        com a impressão digital e o sujeito na dica. */}
                    <Etiqueta certificado={c} />
                  </td>
                  <td className="cm-col-acoes">
                    {podeEscrever ? (
                      <span className="cm-acoes">
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

          {/* `bds-modal#hosts-modal title="Hosts do certificado"`: no web
              component o `title` é o atributo do HTML — dica, não cabeçalho. */}
          <dialog
            ref={hostsWindow}
            id="hosts-modal"
            className="cm-modal"
            title={TEXTO.lista.tituloDosHosts}
          >
            <FecharWindow window={hostsWindow} />
            <div className="cm-papel">
              <div className="cm-lista">
                <div className="cm-cabeca">
                  <p className="cm-t20">
                    {TEXTO.hosts.titulo}
                    {certificado?.description ?? ''}
                  </p>
                </div>
                <div className="cm-rolagem">
                  <Tabela id="hosts-table" colunas={[TEXTO.hosts.host, TEXTO.hosts.acoes]}>
                    {(certificado?.hosts ?? []).map((h) => (
                      <tr key={h.id} data-testid={h.id}>
                        <td className="cm-col-descricao">{h.host}</td>
                        <td className="cm-col-acoes">
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

/* ---------------------------------------------------------------- peças */

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
 * `bds-chip-tag` da coluna Status: `success`/`disabled`/`default` conforme
 * `etiquetaDoStatus`. A dica traz o que a `api` leu do `.pfx`.
 */
function Etiqueta({ certificado }: { certificado: CertificadoMtls }) {
  const { texto, classe } = etiquetaDoStatus(certificado.status);
  const dica = [
    certificado.sujeito ? `Sujeito: ${certificado.sujeito}` : null,
    certificado.emissor ? `Emissor: ${certificado.emissor}` : null,
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

/** O `close-button` do `bds-modal`: ícone `close` (medium, 24), o nosso `fechar`. */
function FecharWindow({ window }: { window: RefObject<HTMLDialogElement | null> }) {
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
        <IconePortal nome="alert" tamanho={32} />
        <b>{TEXTO.alerta.atencao}</b>
      </div>
      <p className="cm-alerta-corpo">{message}</p>
      <div className="cm-alerta-acoes">
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
 * O toast deles (`Object(m.g)({ type, message })`). `popover` para ficar por
 * cima até de uma janela aberta, como o toast fica; some sozinho.
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
 * O `yt`: o `bds-stepper` com três passos, a caixa rolável de 40×18rem e a
 * fileira de botões. "Próximo" só destrava com o passo atual preenchido; o
 * arquivo só é conferido em "Finalizar", como lá.
 *
 * **O que muda da origem**: lá o passo 1 destrava só com o nome do arquivo e
 * a senha errada aparece no "Finalizar"; aqui a senha também é exigida para
 * avançar, porque a `api` recusa o cadastro sem ela — errar a senha continua
 * sendo o toast do "Finalizar" ("A senha do certificado está incorreta.").
 * O que vai para `POST /v1/gestao/contrato/certificados`: arquivo (data URL),
 * senha, descrição e hosts.
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

  const temFile = entradas.file !== null && entradas.senha !== '';
  const infoOk = informationCompletas(entradas.description, entradas.hosts);

  function switchHost(indice: number, value: string) {
    preencher((antes) => ({
      ...antes,
      hosts: antes.hosts.map((h, i) =>
        i === indice ? { host: value, valido: hostValido(value, antes.hosts) } : h,
      ),
    }));
  }

  async function finalizar() {
    if (!temFile || !infoOk || !entradas.file) return;
    const problema = problemaInFile(entradas.file);
    if (problema) return aoAvisar(problema);

    let file: string;
    try {
      file = await readFileAsDataUrl(entradas.file);
    } catch {
      return aoAvisar(problemaInFile(null) ?? '');
    }

    const gravou = await aoFinalizar({
      description: entradas.description,
      hosts: entradas.hosts.map((h) => h.host),
      senha: entradas.senha,
      file,
    });
    // Sucesso: formulário limpo, volta ao passo 1 e fecha — falha: a origem
    // mostra o toast e deixa a janela aberta (`aoAvisar` já cuidou do toast).
    if (gravou) {
      preencher(EMPTY);
      marcarTocado(false);
      irPara(0);
      window.current?.close();
    }
  }

  return (
    <dialog ref={window} id="certificate-modal" className="cm-modal cm-modal--cadastro">
      <FecharWindow window={window} />

      <ol className="cm-passos">
        {PASSOS.map((rotulo, i) => (
          <li
            key={rotulo}
            className={`cm-passo${i === passo ? ' cm-passo--ativo' : ''}${
              i < passo ? ' cm-passo--feito' : ''
            }`}
          >
            {/* O concluído troca o número pelo `bds-icon name="true"` (medium): o nosso `concluido`. */}
            <span className="cm-passo-bola">
              {i < passo ? <IconePortal nome="concluido" tamanho={24} /> : i + 1}
            </span>
            <span className="cm-passo-texto">{rotulo}</span>
          </li>
        ))}
      </ol>

      <div className="cm-caixa">
        {passo === 0 ? (
          <div className="cm-coluna">
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
          <div className="cm-coluna">
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
                <div className="cm-linha-de-host-botoes">
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
            disabled={passo === 0 ? !temFile : !infoOk}
            onClick={() => irPara(passo + 1)}
          >
            {TEXTO.passo.proximo}
          </button>
        ) : (
          <button
            type="button"
            className="cm-botao"
            disabled={enviando || !temFile || !infoOk}
            onClick={finalizar}
          >
            {enviando ? 'Enviando…' : TEXTO.passo.finalizar}
          </button>
        )}
      </div>
    </dialog>
  );
}

/** `bds-input`: o rótulo em cima, dentro da mesma borda, e a mensagem embaixo. */
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
      <label className={`cm-campo${error ? ' cm-campo--erro' : ''}`}>
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
        <p className="cm-campo-erro">
          {/* `bds-icon name="error" size="x-small"`: o nosso `fechar-chip` é o `error`. */}
          <IconePortal nome="fechar-chip" tamanho={16} />
          {error}
        </p>
      ) : null}
    </div>
  );
}
