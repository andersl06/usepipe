import { useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { IconePortal } from '../../../componentes/icones-portal';
import {
  dataDeExpiracao,
  etiquetaDoStatus,
  hostValido,
  informacoesCompletas,
  problemaNoArquivo,
  type CertificadoMtls,
  type HostDigitado,
} from '../../../lib/certificados';
import { gravarCertificados } from './acoes';

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
 * Toda escrita cai em `gravarCertificados`, que confere a permissão no servidor
 * e volta com o recado de que não há onde gravar — mostrado no lugar do toast
 * deles.
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
  arquivo: File | null;
  senha: string;
  descricao: string;
  hosts: HostDigitado[];
}

/** O `j` do `zt`: o formulário em branco, com um campo de URL. */
const VAZIO: Entradas = {
  arquivo: null,
  senha: '',
  descricao: '',
  hosts: [{ host: '', valido: true }],
};

export function TelaDeCertificados({ certificados }: { certificados: CertificadoMtls[] }) {
  const cadastro = useRef<HTMLDialogElement>(null);
  const janelaDeHosts = useRef<HTMLDialogElement>(null);
  const alertaDeCertificado = useRef<HTMLDialogElement>(null);
  const alertaDeHost = useRef<HTMLDialogElement>(null);

  const [emMao, marcarEmMao] = useState<string | null>(null);
  const [enviando, marcarEnviando] = useState(false);
  const [aviso, avisar] = useState<string | null>(null);

  const certificado = certificados.find((c) => c.id === emMao) ?? null;

  /* Toda escrita passa por aqui: a origem mostra o toast de falha e deixa a
     janela aberta. */
  async function gravar(depois?: () => void) {
    marcarEnviando(true);
    try {
      const resposta = await gravarCertificados();
      avisar(resposta.erro);
    } finally {
      marcarEnviando(false);
      depois?.();
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
            <div>
              <button
                type="button"
                className="cm-botao"
                onClick={() => cadastro.current?.showModal()}
              >
                {/* `icon="add"`, medium (24): o nosso `mais`. */}
                <IconePortal nome="mais" tamanho={24} />
                {TEXTO.apresentacao.botao}
              </button>
              <Cadastro
                janela={cadastro}
                enviando={enviando}
                aoAvisar={avisar}
                aoFinalizar={() => gravar()}
              />
            </div>
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
              const etiqueta = etiquetaDoStatus(c.status);
              return (
                <tr key={c.id} data-testid={c.id}>
                  <td className="cm-col-descricao" title={c.descricao}>
                    {c.descricao}
                  </td>
                  <td>{dataDeExpiracao(c.expiraEm)}</td>
                  <td>
                    <span className={`cm-etiqueta cm-etiqueta--${etiqueta.cor}`}>
                      <span>{etiqueta.texto}</span>
                    </span>
                  </td>
                  <td className="cm-col-acoes">
                    <span className="cm-acoes">
                      <BotaoDeIcone
                        nome="lixeira"
                        rotulo={`Deletar ${c.descricao}`}
                        aoClicar={() => {
                          marcarEmMao(c.id);
                          alertaDeCertificado.current?.showModal();
                        }}
                      />
                      <BotaoDeIcone
                        nome="editar"
                        rotulo={`Hosts de ${c.descricao}`}
                        aoClicar={() => {
                          marcarEmMao(c.id);
                          janelaDeHosts.current?.showModal();
                        }}
                      />
                    </span>
                  </td>
                </tr>
              );
            })}
          </Tabela>

          <Alerta
            janela={alertaDeCertificado}
            id="remove-certificate-alert"
            mensagem={TEXTO.alerta.certificado}
            enviando={enviando}
            aoDeletar={() => gravar(() => alertaDeCertificado.current?.close())}
          />

          {/* `bds-modal#hosts-modal title="Hosts do certificado"`: no web
              component o `title` é o atributo do HTML — dica, não cabeçalho. */}
          <dialog
            ref={janelaDeHosts}
            id="hosts-modal"
            className="cm-modal"
            title={TEXTO.lista.tituloDosHosts}
          >
            <FecharJanela janela={janelaDeHosts} />
            <div className="cm-papel">
              <div className="cm-lista">
                <div className="cm-cabeca">
                  <p className="cm-t20">
                    {TEXTO.hosts.titulo}
                    {certificado?.descricao ?? ''}
                  </p>
                </div>
                <div className="cm-rolagem">
                  <Tabela id="hosts-table" colunas={[TEXTO.hosts.host, TEXTO.hosts.acoes]}>
                    {(certificado?.hosts ?? []).map((h) => (
                      <tr key={h.id} data-testid={h.id}>
                        <td className="cm-col-descricao">{h.host}</td>
                        <td className="cm-col-acoes">
                          <BotaoDeIcone
                            nome="lixeira"
                            rotulo={`Deletar ${h.host}`}
                            aoClicar={() => alertaDeHost.current?.showModal()}
                          />
                        </td>
                      </tr>
                    ))}
                  </Tabela>
                </div>
              </div>
            </div>
            <Alerta
              janela={alertaDeHost}
              id="remove-host-alert"
              mensagem={TEXTO.alerta.host}
              enviando={enviando}
              aoDeletar={() => gravar(() => alertaDeHost.current?.close())}
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
function FecharJanela({ janela }: { janela: RefObject<HTMLDialogElement | null> }) {
  return (
    <button
      type="button"
      className="cm-fechar"
      aria-label="Fechar"
      onClick={() => janela.current?.close()}
    >
      <IconePortal nome="fechar" tamanho={24} />
    </button>
  );
}

function Alerta({
  janela,
  id,
  mensagem,
  enviando,
  aoDeletar,
}: {
  janela: RefObject<HTMLDialogElement | null>;
  id: string;
  mensagem: string;
  enviando: boolean;
  aoDeletar: () => void;
}) {
  return (
    <dialog ref={janela} id={id} className="cm-alerta">
      <div className="cm-alerta-topo">
        <IconePortal nome="alerta" tamanho={32} />
        <b>{TEXTO.alerta.atencao}</b>
      </div>
      <p className="cm-alerta-corpo">{mensagem}</p>
      <div className="cm-alerta-acoes">
        <button
          type="button"
          className="cm-botao cm-botao--secundario"
          disabled={enviando}
          onClick={() => janela.current?.close()}
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
 */
function Cadastro({
  janela,
  enviando,
  aoAvisar,
  aoFinalizar,
}: {
  janela: RefObject<HTMLDialogElement | null>;
  enviando: boolean;
  aoAvisar: (texto: string) => void;
  aoFinalizar: () => Promise<void>;
}) {
  const [passo, irPara] = useState(0);
  const [entradas, preencher] = useState<Entradas>(VAZIO);
  const [tocado, marcarTocado] = useState(false);

  const temArquivo = entradas.arquivo !== null;
  const infoOk = informacoesCompletas(entradas.descricao, entradas.hosts);

  function trocarHost(indice: number, valor: string) {
    preencher((antes) => ({
      ...antes,
      hosts: antes.hosts.map((h, i) =>
        i === indice ? { host: valor, valido: hostValido(valor, antes.hosts) } : h,
      ),
    }));
  }

  async function finalizar() {
    if (!temArquivo || !infoOk) return;
    const problema = problemaNoArquivo(entradas.arquivo);
    if (problema) return aoAvisar(problema);
    await aoFinalizar();
  }

  return (
    <dialog ref={janela} id="certificate-modal" className="cm-modal cm-modal--cadastro">
      <FecharJanela janela={janela} />

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
              {entradas.arquivo ? (
                <div className="cm-upload-previa">
                  {/* `bds-icon size="x-small" name="attach"` (16): o nosso `anexo`. */}
                  <IconePortal nome="anexo" tamanho={16} />
                  <p>{entradas.arquivo.name}</p>
                  <BotaoDeIcone
                    nome="lixeira"
                    rotulo={`Remover ${entradas.arquivo.name}`}
                    aoClicar={() => preencher((antes) => ({ ...antes, arquivo: null }))}
                  />
                </div>
              ) : null}
              <label className="cm-upload-soltar">
                <span className="cm-t14">{TEXTO.upload.soltar}</span>
                <input
                  type="file"
                  accept=".pfx"
                  onChange={(e) => {
                    const arquivo = e.target.files?.[0] ?? null;
                    preencher((antes) => ({ ...antes, arquivo }));
                  }}
                />
              </label>
            </div>
            <div className="cm-metade">
              <Campo
                rotulo={TEXTO.upload.senha}
                tipo="password"
                valor={entradas.senha}
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
              valor={entradas.descricao}
              dica={TEXTO.info.descricaoDica}
              maximo={50}
              erro={tocado && entradas.descricao === '' ? TEXTO.info.descricaoInvalida : null}
              aoSair={() => marcarTocado(true)}
              aoMudar={(descricao) => preencher((antes) => ({ ...antes, descricao }))}
            />
            {entradas.hosts.map((h, i) => (
              <div key={i} className="cm-linha-de-host">
                <div className="cm-linha-de-host-campo">
                  <Campo
                    rotulo={TEXTO.info.url}
                    valor={h.host}
                    dica={TEXTO.info.urlDica}
                    maximo={100}
                    erro={h.valido ? null : TEXTO.info.urlInvalida}
                    aoMudar={(valor) => trocarHost(i, valor)}
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
            <p className="cm-item">{entradas.arquivo?.name ?? ''}</p>
            <b className="cm-t16">{TEXTO.conferencia.descricao}</b>
            <p className="cm-item">{entradas.descricao}</p>
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
            disabled={passo === 0 ? !temArquivo : !infoOk}
            onClick={() => irPara(passo + 1)}
          >
            {TEXTO.passo.proximo}
          </button>
        ) : (
          <button
            type="button"
            className="cm-botao"
            disabled={enviando || !temArquivo || !infoOk}
            onClick={finalizar}
          >
            {TEXTO.passo.finalizar}
          </button>
        )}
      </div>
    </dialog>
  );
}

/** `bds-input`: o rótulo em cima, dentro da mesma borda, e a mensagem embaixo. */
function Campo({
  rotulo,
  valor,
  dica,
  tipo = 'text',
  maximo,
  erro = null,
  aoMudar,
  aoSair,
}: {
  rotulo: string;
  valor: string;
  dica: string;
  tipo?: 'text' | 'password';
  maximo?: number;
  erro?: string | null;
  aoMudar: (valor: string) => void;
  aoSair?: () => void;
}) {
  return (
    <div className="cm-campo-bloco">
      <label className={`cm-campo${erro ? ' cm-campo--erro' : ''}`}>
        <b>{rotulo}</b>
        <input
          type={tipo}
          value={valor}
          placeholder={dica}
          maxLength={maximo}
          onChange={(e) => aoMudar(e.target.value)}
          onBlur={aoSair}
        />
      </label>
      {erro ? (
        <p className="cm-campo-erro">
          {/* `bds-icon name="error" size="x-small"`: o nosso `fechar-chip` é o `error`. */}
          <IconePortal nome="fechar-chip" tamanho={16} />
          {erro}
        </p>
      ) : null}
    </div>
  );
}
