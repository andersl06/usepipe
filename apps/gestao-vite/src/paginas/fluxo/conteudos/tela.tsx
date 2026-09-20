import { useState } from 'react';
import { IconePortal, type NomeDeIconePortal } from '../../../componentes/icones-portal';
import type { ModeloListado } from '@pipe/contracts';
import { criarModeloNoCanal } from '../../../lib/canais-gravar';
import {
  CATEGORIAS,
  blocosDoMenu,
  erroDoNome,
  estadoDaLista,
  idiomasRepetidos,
  modeloValido,
  mostrarEscolhaDeBloco,
  mostrarVoltar,
  type Categoria,
  type TipoDeConteudo,
  type Traducao,
} from './regras';

/**
 * As variáveis do corpo, na ordem em que aparecem — mesma regra de
 * `variaveisDoTexto` em `dominio/whatsapp/modelos.ts` (o backend valida de
 * novo; isto só evita ida e volta para um erro que dá para ver aqui).
 * Duplicada de propósito, como em `comunicacao-modelos-formulario.tsx`: a
 * tela de cliente não precisa importar módulo do servidor.
 */
function variaveisDoTexto(texto: string): string[] {
  const vistas: string[] = [];
  for (const achado of texto.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) {
    if (!vistas.includes(achado[1]!)) vistas.push(achado[1]!);
  }
  return vistas;
}

/* `messageTemplateSidebar.newTemplate.inputs.menuList.*` e o ícone de cada bloco. */
const BLOCOS: Record<TipoDeConteudo, { rotulo: string; icone: NomeDeIconePortal; classe: string }> =
  {
    texto: { rotulo: 'Texto', icone: 'texto-mensagem', classe: 'ct-bloco-icone--texto' },
    imagem: { rotulo: 'Imagem', icone: 'arquivo-imagem', classe: 'ct-bloco-icone--imagem' },
    documento: { rotulo: 'Documento', icone: 'arquivo-pdf', classe: 'ct-bloco-icone--pdf' },
    video: { rotulo: 'Vídeo', icone: 'video', classe: 'ct-bloco-icone--video' },
    pagamento: { rotulo: 'Pagamento', icone: 'pix', classe: 'ct-bloco-icone--pix' },
    carrossel: { rotulo: 'Carrossel', icone: 'carrossel', classe: 'ct-bloco-icone--carrossel' },
  };

/* `messageTemplate.categories.*` para as três da `fillTemplateCategories`. */
const ROTULO_CATEGORIA: Record<Categoria, string> = {
  autenticacao: 'Autenticação',
  marketing: 'Marketing',
  utilidade: 'Utilidade',
};

/* `messageTemplateLanguages.*` — o recorte que o Pipe já usa em `/comunicacao/modelos`. */
const IDIOMAS: [string, string][] = [
  ['pt_BR', 'Português (BR)'],
  ['en_US', 'Inglês (EUA)'],
  ['es', 'Espanhol'],
];

/* `messageTemplate.status.*` — os quatro que `template_mensagem.status_meta` guarda (a lib fica no servidor; aqui só o rótulo). */
const ROTULO_STATUS: Record<string, string> = {
  aprovado: 'Aprovado',
  pendente: 'Pendente',
  rejeitado: 'Rejeitado',
  pausado: 'Pausado',
};

/* `statusColorMap` do controlador da lista: APPROVED → success, PENDING → info, REJECTED → rejected, PAUSED → paused. */
const COR_DO_STATUS: Record<string, string> = {
  aprovado: 'sucesso',
  pendente: 'info',
  rejeitado: 'rejeitado',
  pausado: 'pausado',
};

/* `attachment.<tipo>.link` e `.compatibility`. */
const ANEXO: Record<'imagem' | 'documento' | 'video', { link: string; compat: string }> = {
  imagem: { link: 'Link da imagem', compat: 'Compatível com JPG, JPEG ou PNG' },
  documento: { link: 'Link do documento', compat: 'Formato PDF' },
  video: { link: 'Link do vídeo', compat: 'Compatível com MP4 até 16MB' },
};

/** `/assets/img/contents/unavailable-message-template.svg` — o balão do WhatsApp em contorno, 110×110. */
function BalaoIndisponivel() {
  return (
    <svg
      className="ct-indisponivel-imagem"
      width="110"
      height="110"
      viewBox="0 0 110 110"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M110 53.585C110 83.177 85.8242 107.166 55.9954 107.166C46.5295 107.166 37.6375 104.745 29.897 100.505L0 110L9.74566 81.2437C4.83158 73.1731 2.0015 63.6965 2.0015 53.5814C2.00509 23.9893 26.1737 0 56.0025 0C85.8278 0.00717384 110 23.9929 110 53.585ZM55.9918 8.54404C30.9587 8.54404 10.5958 28.7527 10.5958 53.5957C10.5958 63.4526 13.8096 72.5777 19.2438 80.0026L13.5765 96.7284L31.0161 91.1866C38.1899 95.8927 46.7734 98.6331 55.9918 98.6331C81.0249 98.6331 101.395 78.428 101.395 53.585C101.402 28.7527 81.0285 8.54404 55.9918 8.54404ZM83.2667 65.9275C82.9295 65.3859 82.0472 65.0559 80.7272 64.3959C79.4108 63.7359 72.8933 60.5615 71.6845 60.1311C70.465 59.6899 69.5826 59.4675 68.7002 60.7839C67.8286 62.1003 65.2891 65.0559 64.5107 65.9383C63.7395 66.8171 62.9683 66.9283 61.6448 66.2791C60.3212 65.6119 56.0528 64.2345 50.9952 59.7616C47.0604 56.2751 44.4025 51.9816 43.6349 50.6652C42.8565 49.3524 43.5559 48.6422 44.2123 47.9894C44.8042 47.3975 45.5359 46.4542 46.1995 45.683C46.8631 44.919 47.0819 44.3773 47.5231 43.4986C47.9571 42.6198 47.7383 41.8557 47.4119 41.1922C47.0819 40.5322 44.4383 34.0757 43.33 31.4465C42.2288 28.8209 41.1276 29.2549 40.3528 29.2549C39.5816 29.2549 38.6993 29.1473 37.8169 29.1473C36.9345 29.1473 35.4997 29.4665 34.2909 30.7829C33.0821 32.0993 29.6602 35.2737 29.6602 41.7374C29.6602 48.2082 34.3985 54.4458 35.0621 55.321C35.7293 56.1927 44.2231 69.8911 57.6776 75.1495C71.1393 80.4044 71.1393 78.6503 73.5641 78.428C75.996 78.2056 81.3979 75.2535 82.4955 72.1903C83.6003 69.1127 83.6003 66.4763 83.2667 65.9275Z"
      />
    </svg>
  );
}

/**
 * A `<aside class="detail-aside fl">` de Conteúdos: `<bds-grid class="sidebar-container"
 * direction="column">` com um `sidebar-item-container > a.sidebar-anchor >
 * bds-grid.sidebar-item` por entrada (título `fs-14` bold, subtítulo `fs-12`,
 * `bds-icon arrow-right` à direita; o ativo leva `.selected-sidebar-item`).
 * Textos de `modules.application.detail.contents.menu.*`.
 *
 * ponytail: "Recursos" (`contents.resource`) ainda não tem tela aqui; fica sem destino.
 */
function LateralDeConteudos() {
  const itens = [
    {
      titulo: 'Modelos de Mensagem',
      descricao: 'Submeta novas mensagens para envio via WhatsApp',
      ativo: true,
    },
    {
      titulo: 'Recursos',
      descricao: 'Recursos podem ser utilizados como conteúdo das mensagens enviadas pelo chatbot',
      ativo: false,
    },
  ];
  return (
    <aside className="ct-lateral">
      <nav className="ct-lateral-lista" aria-label="Conteúdos do fluxo">
        {itens.map((item) => (
          <div className="ct-lateral-item" key={item.titulo}>
            <a
              className={
                item.ativo ? 'ct-lateral-cartao ct-lateral-cartao--ativo' : 'ct-lateral-cartao'
              }
              aria-current={item.ativo ? 'page' : undefined}
              role="link"
              tabIndex={0}
            >
              <span className="ct-lateral-texto">
                <span className="ct-lateral-titulo">{item.titulo}</span>
                <span className="ct-lateral-descricao">{item.descricao}</span>
              </span>
              <span className="ct-lateral-seta">
                <IconePortal nome="direita" tamanho={24} />
              </span>
            </a>
          </div>
        ))}
      </nav>
    </aside>
  );
}

interface TraducaoEmEdicao extends Traducao {
  link: string;
  rodape: string;
  botoes: string[];
  editando: boolean;
  rascunho: string;
  /** Um exemplo por variável do corpo — a Meta exige para aprovar (`{{1}}` → exemplos['1']). */
  exemplos: Record<string, string>;
}

function novaTraducao(idioma = 'pt_BR'): TraducaoEmEdicao {
  return {
    idioma,
    texto: '',
    link: '',
    rodape: '',
    botoes: [],
    editando: false,
    rascunho: '',
    exemplos: {},
  };
}

export function TelaDeConteudos({
  modelos,
  temWhatsapp,
  canalId,
}: {
  modelos: ModeloListado[];
  temWhatsapp: boolean;
  canalId: string | null;
}) {
  const [aberto, setAberto] = useState(false);
  const estado = estadoDaLista(temWhatsapp, modelos.length);

  return (
    <div className="ct-casca">
      <LateralDeConteudos />
      <section className="ct-miolo" id="main-content-area">
        <header className="ct-cabecalho" id="whatsapp-message-templates-header">
          <div className="ct-cabecalho-secao">
            <div className="ct-cabecalho-linha">
              <div className="ct-cabecalho-titulo">
                <h1 className="ct-titulo">Modelos de Mensagem</h1>
                <span
                  className="ct-info"
                  id="message-template__icon-info"
                  title="São formatos para mensagens reutilizáveis que poderão ser enviadas em massa"
                >
                  <IconePortal nome="informacao" tamanho={20} />
                </span>
              </div>
              {temWhatsapp ? (
                <div className="ct-cabecalho-acoes">
                  {modelos.length ? (
                    <button
                      type="button"
                      className="ct-botao-icone"
                      aria-label="Filtrar por nome do modelo"
                      title="Nome do modelo"
                    >
                      <IconePortal nome="busca" tamanho={24} />
                    </button>
                  ) : null}
                  <div className="ct-cabecalho-botoes">
                    <button type="button" className="ct-botao ct-botao--contorno">
                      <IconePortal nome="atualizar" tamanho={24} />
                      <span>Atualizar</span>
                    </button>
                    <button
                      type="button"
                      className="ct-botao ct-botao--principal"
                      onClick={() => setAberto(true)}
                    >
                      Criar modelo
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <div className="ct-container" id="message-template__main-content-area">
          {estado === 'indisponivel' ? (
            <section className="ct-indisponivel">
              <div>
                <BalaoIndisponivel />
              </div>
              <p className="ct-indisponivel-titulo">Recurso exclusivo para WhatsApp</p>
              <div className="ct-indisponivel-descricao">
                <p>
                  <span>
                    A funcionalidade de criação de modelos de mensagem é exclusiva para chatbots
                    integrados ao WhatsApp.
                  </span>{' '}
                  <span className="ct-indisponivel-link">Saiba como contratar</span>
                </p>
              </div>
            </section>
          ) : null}

          {estado === 'vazio' ? (
            <div id="message-templates-no-results" className="ct-sem-resultado">
              <span className="ct-sem-resultado-1">
                Você ainda não adicionou modelos de mensagens
              </span>
              <span className="ct-sem-resultado-2">
                Clique no botão&nbsp;<b>Adicionar novo</b>&nbsp;para adicionar modelos de mensagens
              </span>
            </div>
          ) : null}

          {estado === 'lista' ? (
            <section className="ct-papel">
              <div id="message-templates-infinite-scroll">
                {modelos.map((modelo, indice) => (
                  <div key={modelo.id} id={`message-template-${indice}-card`} className="ct-item">
                    <div className="ct-item-linha">
                      <div className="ct-item-w40">
                        <span className="ct-item-rotulo">Nome do modelo</span>
                        <span className="ct-item-nome">{modelo.nome}</span>
                      </div>
                      <div className="ct-item-w15">
                        <span className="ct-item-rotulo">Categoria</span>
                        <span>
                          {ROTULO_CATEGORIA[modelo.categoria as Categoria] ?? modelo.categoria}
                        </span>
                      </div>
                      <div className="ct-item-w15">
                        <span className="ct-item-rotulo">Recategorizado</span>
                        <span>Não</span>
                      </div>
                      <div className="ct-item-w15">
                        <span className="ct-item-rotulo">Idioma</span>
                        <span>
                          {IDIOMAS.find(([codigo]) => codigo === modelo.idioma)?.[1] ??
                            modelo.idioma}
                        </span>
                      </div>
                      <div className="ct-item-w15">
                        <span className="ct-item-rotulo">Status</span>
                        <span
                          className={`ct-status ct-status--${COR_DO_STATUS[modelo.statusMeta] ?? 'info'}`}
                        >
                          {ROTULO_STATUS[modelo.statusMeta] ?? modelo.statusMeta}
                        </span>
                      </div>
                    </div>
                    <div className="ct-item-divisa" />
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        {aberto ? (
          <SidebarDeNovoModelo
            canalId={canalId}
            existentes={modelos.map((modelo) => modelo.nome)}
            aoFechar={() => setAberto(false)}
          />
        ) : null}
      </section>
    </div>
  );
}

/**
 * `openNewMessageSidebar()` → `SidebarContentService.showSidebar` com o
 * template do módulo 95559 (`#create-message-template-sidebar`, 37.5rem,
 * `.sidebar-header` + `.sidebar-body`): nome, categoria, uma tradução por
 * idioma (idioma + bloco escolhido no `menu-list` + cartão), "Adicionar
 * tradução" e o rodapé "Enviar para avaliação".
 *
 * "Enviar para avaliação" chama `POST /v1/canais/whatsapp/:id/modelos`
 * (`criarModeloNaMeta`) — o MESMO caminho de `comunicacao-modelos-formulario.tsx`
 * em Cadastros — uma vez por idioma (a Meta versiona por (nome, idioma), não
 * por "modelo com traduções"). É o único bloco que esse endpoint aceita hoje:
 * cabeçalho de mídia pede a Resumable Upload API (`modelos.ts`, ponytail
 * registrado lá) e Autenticação tem componentes próprios da Meta, não texto
 * livre — os dois casos ficam com o aviso explicando, sem tentar enviar.
 */
function SidebarDeNovoModelo({
  canalId,
  existentes,
  aoFechar,
}: {
  canalId: string | null;
  existentes: string[];
  aoFechar: () => void;
}) {
  const [nome, setNome] = useState('');
  const [nomeTocado, setNomeTocado] = useState(false);
  const [categoria, setCategoria] = useState<Categoria | ''>('');
  const [tipo, setTipo] = useState<TipoDeConteudo | 'default'>('default');
  const [traducoes, setTraducoes] = useState<TraducaoEmEdicao[]>([novaTraducao()]);
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);

  const erroNome = nomeTocado ? erroDoNome(nome, existentes) : null;
  const repetidos = idiomasRepetidos(traducoes);
  const valido = modeloValido({ nome, categoria, tipo, traducoes, existentes });
  const autenticacao = categoria === 'autenticacao';

  function mudarTraducao(indice: number, mudanca: Partial<TraducaoEmEdicao>) {
    setTraducoes((lista) => lista.map((t, i) => (i === indice ? { ...t, ...mudanca } : t)));
  }

  async function enviarParaAvaliacao() {
    if (!canalId) return setAviso('Este fluxo não tem canal de WhatsApp conectado.');
    if (autenticacao) {
      return setAviso(
        'Autenticação tem componentes próprios da Meta (código e botão de copiar) — não é texto livre. Ainda não dá para enviar esta categoria por aqui.',
      );
    }
    if (tipo !== 'texto') {
      return setAviso(
        'Por aqui só dá para enviar modelo de Texto — cabeçalho de imagem, documento ou vídeo pede o upload do arquivo de exemplo na Meta, que esta tela ainda não faz.',
      );
    }
    for (const t of traducoes) {
      const faltando = variaveisDoTexto(t.texto).filter((v) => !t.exemplos[v]?.trim());
      if (faltando.length) {
        return setAviso(`Dê um exemplo para cada variável do texto (idioma "${t.idioma}").`);
      }
    }
    setEnviando(true);
    setAviso('');
    try {
      for (const t of traducoes) {
        const variaveis = variaveisDoTexto(t.texto);
        const resultado = await criarModeloNoCanal(canalId, {
          nome,
          idioma: t.idioma,
          categoria: categoria as 'marketing' | 'utilidade',
          corpo: t.texto,
          exemplos: variaveis.map((v) => t.exemplos[v]!.trim()),
        });
        if (!resultado.ok) {
          setAviso(`Idioma "${t.idioma}": ${resultado.erro}`);
          return;
        }
      }
      aoFechar();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <div className="ct-sobreposicao" role="presentation" onClick={aoFechar} />
      <div
        id="create-message-template-sidebar"
        className="ct-sidebar"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ct-sidebar-titulo"
      >
        <div className="ct-sidebar-cabecalho">
          <h4 id="ct-sidebar-titulo">Novo modelo de mensagem</h4>
          <button
            type="button"
            className="ct-sidebar-fechar"
            aria-label="Fechar"
            onClick={aoFechar}
          >
            <IconePortal nome="fechar" tamanho={24} />
          </button>
        </div>
        <div className="ct-sidebar-corpo">
          <p className="ct-sidebar-descricao">
            Preencha os campos abaixo para fazer a submissão de um modelo de mensagem. Lembre-se de
            seguir as{' '}
            <a
              href="https://developers.facebook.com/docs/whatsapp/message-templates/guidelines"
              target="_blank"
              rel="noreferrer"
            >
              regras e boas práticas
            </a>{' '}
            propostas pelo Facebook.
          </p>

          <div className="ct-mb3">
            <label className={erroNome ? 'ct-campo ct-campo--invalido' : 'ct-campo'}>
              <span className="ct-campo-rotulo">Nome do modelo</span>
              <input
                type="text"
                value={nome}
                placeholder="Use letras minúsculas, números ou underline"
                onChange={(evento) => {
                  setNome(evento.target.value);
                  setNomeTocado(true);
                }}
              />
            </label>
            {erroNome === 'invalido' ? (
              <p className="ct-erro">
                Use letras minúsculas, números ou underlines, começando com uma letra
              </p>
            ) : null}
            {erroNome === 'usado' ? (
              <p className="ct-erro">Já existe um modelo de mensagem com este nome</p>
            ) : null}
            {erroNome === 'comprido' ? <p className="ct-erro">Máximo de 512 caracteres</p> : null}
          </div>

          <label className="ct-campo ct-mb3">
            <span className="ct-campo-rotulo">Categoria</span>
            <select
              value={categoria}
              onChange={(evento) => {
                setCategoria(evento.target.value as Categoria | '');
                setTipo('default');
              }}
            >
              <option value="">Selecione</option>
              {CATEGORIAS.map((c) => (
                <option value={c} key={c}>
                  {ROTULO_CATEGORIA[c]}
                </option>
              ))}
            </select>
          </label>

          {traducoes.map((traducao, indice) => (
            <div className="ct-traducao" key={indice}>
              <div className="ct-inline">
                <label
                  className={
                    repetidos.includes(traducao.idioma)
                      ? 'ct-campo ct-campo--invalido ct-campo--cheio'
                      : 'ct-campo ct-campo--cheio'
                  }
                >
                  <span className="ct-campo-rotulo">Idioma</span>
                  <select
                    value={traducao.idioma}
                    onChange={(evento) => mudarTraducao(indice, { idioma: evento.target.value })}
                  >
                    <option value="">Selecione</option>
                    {IDIOMAS.map(([codigo, rotulo]) => (
                      <option value={codigo} key={codigo}>
                        {rotulo}
                      </option>
                    ))}
                  </select>
                </label>
                {traducoes.length > 1 ? (
                  <button
                    type="button"
                    className="ct-lixeira"
                    title="Excluir idioma"
                    aria-label="Excluir idioma"
                    onClick={() => setTraducoes((lista) => lista.filter((_, i) => i !== indice))}
                  >
                    <IconePortal nome="lixeira" tamanho={20} />
                  </button>
                ) : null}
              </div>
              {repetidos.includes(traducao.idioma) ? (
                <p className="ct-erro ct-erro--14">
                  Este idioma está sendo usado em outra tradução
                </p>
              ) : null}

              <div className="ct-coluna">
                {indice === 0 && mostrarVoltar(tipo, categoria, traducoes.length) ? (
                  <button
                    type="button"
                    className="ct-voltar"
                    onClick={() => {
                      setTipo('default');
                    }}
                  >
                    <IconePortal nome="esquerda" tamanho={24} />
                    <span>{tipo !== 'default' ? BLOCOS[tipo].rotulo : ''}</span>
                  </button>
                ) : null}

                {indice === 0 && mostrarEscolhaDeBloco(tipo, categoria) ? (
                  <div className="ct-menu-papel">
                    <span className="ct-menu-dica">Escolha um bloco para adicionar</span>
                    {blocosDoMenu(categoria).map((linha, l) => (
                      <div className="ct-menu-lista" key={l}>
                        {linha.map((bloco, b) => (
                          <button
                            type="button"
                            className={
                              linha.length === 3 && b === 1
                                ? 'ct-menu-item ct-menu-item--meio'
                                : 'ct-menu-item'
                            }
                            key={bloco}
                            onClick={() => setTipo(bloco)}
                          >
                            <IconePortal
                              nome={BLOCOS[bloco].icone}
                              tamanho={24}
                              className={`ct-bloco-icone ${BLOCOS[bloco].classe}`}
                            />
                            <span>{BLOCOS[bloco].rotulo}</span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : null}

                {autenticacao ? (
                  <section className="ct-cartao ct-cartao--previa">
                    <span className="ct-cartao-texto">
                      Seu código de verificação é {'{{1}}'}. Para sua segurança, não o compartilhe.
                    </span>
                    <div className="ct-cartao-botoes">
                      <div className="ct-cartao-acao">
                        <IconePortal nome="copiar" tamanho={16} />
                        <span>Copiar código</span>
                      </div>
                    </div>
                  </section>
                ) : null}

                {!autenticacao && tipo === 'texto' ? (
                  <CartaoDeTexto
                    traducao={traducao}
                    aoMudar={(mudanca) => mudarTraducao(indice, mudanca)}
                  />
                ) : null}

                {!autenticacao &&
                (tipo === 'imagem' || tipo === 'documento' || tipo === 'video') ? (
                  <CartaoDeAnexo
                    tipo={tipo}
                    traducao={traducao}
                    somenteTraducao={indice > 0}
                    aoMudar={(mudanca) => mudarTraducao(indice, mudanca)}
                  />
                ) : null}
              </div>

              {traducao.idioma === 'pt_BR' && !autenticacao ? (
                <div className="ct-avaliar">
                  <button
                    type="button"
                    className="ct-botao-texto"
                    disabled={!traducao.texto}
                    onClick={() =>
                      setAviso('A avaliação de mensagem com IA ainda não está disponível.')
                    }
                  >
                    <IconePortal nome="brilho-ia" tamanho={24} />
                    <span>Avaliar mensagem com IA</span>
                  </button>
                </div>
              ) : null}
              {indice < traducoes.length - 1 ? <hr className="ct-divisor" /> : null}
            </div>
          ))}

          <button
            type="button"
            className={
              valido
                ? 'ct-adicionar-traducao ct-adicionar-traducao--ativo'
                : 'ct-adicionar-traducao'
            }
            disabled={!valido}
            onClick={() => setTraducoes((lista) => [...lista, novaTraducao('')])}
          >
            <IconePortal nome="mais" tamanho={24} />
            <span>Adicionar tradução</span>
          </button>

          {aviso ? (
            <p className="ct-erro ct-erro--14" role="alert">
              {aviso}
            </p>
          ) : null}
        </div>
        <div className="ct-sidebar-rodape">
          <button
            type="button"
            className={valido ? 'ct-enviar ct-enviar--ativo' : 'ct-enviar'}
            disabled={!valido || enviando}
            onClick={() => void enviarParaAvaliacao()}
          >
            {enviando ? 'Enviando…' : 'Enviar para avaliação'}
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * `<message-template-card>` (`.mt-card`): fora da edição, o placeholder
 * "Insira aqui o conteúdo da mensagem" (ou a prévia do texto); em edição, o
 * `textarea` de 3 linhas, a barra "+ variável" e os botões redondos de
 * confirmar/fechar no canto. Os ícones de negrito/itálico/tachado são da
 * fonte `blip-toolkit` e não existem aqui (só o "+ variável").
 */
function CartaoDeTexto({
  traducao,
  aoMudar,
}: {
  traducao: TraducaoEmEdicao;
  aoMudar: (mudanca: Partial<TraducaoEmEdicao>) => void;
}) {
  if (!traducao.editando) {
    return (
      <section
        className={traducao.texto ? 'ct-cartao ct-cartao--previa' : 'ct-cartao'}
        onDoubleClick={() => aoMudar({ editando: true, rascunho: traducao.texto })}
      >
        <button
          type="button"
          className="ct-cartao-botao ct-cartao-editar"
          aria-label="Editar"
          onClick={() => aoMudar({ editando: true, rascunho: traducao.texto })}
        >
          <IconePortal nome="editar" tamanho={16} />
        </button>
        {traducao.texto ? (
          <span className="ct-cartao-texto">{traducao.texto}</span>
        ) : (
          <span className="ct-cartao-placeholder">Insira aqui o conteúdo da mensagem</span>
        )}
        {traducao.botoes.length ? (
          <div className="ct-cartao-botoes">
            {traducao.botoes.map((botao, i) => (
              <div className="ct-cartao-resposta" key={i}>
                <span>{botao}</span>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    );
  }
  return (
    <section className="ct-cartao ct-cartao--edicao">
      <button
        type="button"
        className="ct-cartao-botao ct-cartao-fechar"
        aria-label="Cancelar"
        onClick={() => aoMudar({ editando: false })}
      >
        <IconePortal nome="fechar" tamanho={16} />
      </button>
      <button
        type="button"
        className="ct-cartao-botao ct-cartao-confirmar"
        aria-label="Confirmar"
        onClick={() => aoMudar({ editando: false, texto: traducao.rascunho.trim() })}
      >
        <IconePortal nome="cheque" tamanho={16} />
      </button>
      <textarea
        className="ct-cartao-area"
        rows={3}
        maxLength={1024}
        value={traducao.rascunho}
        onChange={(evento) => aoMudar({ rascunho: evento.target.value })}
      />
      <div className="ct-cartao-formatacao">
        <button
          type="button"
          className="ct-cartao-variavel"
          onClick={() =>
            aoMudar({
              rascunho: `${traducao.rascunho}{{${(traducao.rascunho.match(/\{\{\d+\}\}/g)?.length ?? 0) + 1}}}`,
            })
          }
        >
          <IconePortal nome="mais" tamanho={16} />
          variável
        </button>
      </div>
      <ExemplosDeVariavel traducao={traducao} aoMudar={aoMudar} />
      <BotoesDoModelo botoes={traducao.botoes} aoMudar={(botoes) => aoMudar({ botoes })} />
    </section>
  );
}

/**
 * A Meta só aprova um modelo com variável se cada uma vier com um exemplo de
 * preenchimento — não tem tela equivalente na origem (lá isso é passo do
 * `saveMessageTemplate`, sem componente próprio); aqui é o mínimo para
 * `POST /v1/canais/whatsapp/:id/modelos` aceitar o "Enviar para avaliação".
 */
function ExemplosDeVariavel({
  traducao,
  aoMudar,
}: {
  traducao: TraducaoEmEdicao;
  aoMudar: (mudanca: Partial<TraducaoEmEdicao>) => void;
}) {
  const variaveis = variaveisDoTexto(traducao.rascunho);
  if (variaveis.length === 0) return null;
  return (
    <div className="ct-exemplos">
      <span className="ct-campo-rotulo">Um exemplo por variável, para a Meta aprovar</span>
      {variaveis.map((v) => (
        <label className="ct-campo" key={v}>
          <span className="ct-campo-rotulo">{`Exemplo de {{${v}}}`}</span>
          <input
            type="text"
            value={traducao.exemplos[v] ?? ''}
            onChange={(evento) =>
              aoMudar({ exemplos: { ...traducao.exemplos, [v]: evento.target.value } })
            }
          />
        </label>
      ))}
    </div>
  );
}

/**
 * `<message-template-buttons>`: `.menu-buttons-list` com "Botões de ação" e
 * "Respostas rápidas"; nas respostas rápidas, um campo "Texto do botão" por
 * botão (até 3, 20 caracteres) e "Adicionar outro botão". Os ícones
 * `CallToAction`/`QuickReply` são da fonte `blip-toolkit` (não existem aqui).
 * ponytail: os botões de ação (telefone, link, dados do contato) ficam só na
 * escolha; o Pipe ainda não modela botões no `template_mensagem`.
 */
function BotoesDoModelo({
  botoes,
  aoMudar,
}: {
  botoes: string[];
  aoMudar: (botoes: string[]) => void;
}) {
  const [modo, setModo] = useState<'default' | 'quick_reply' | 'call_to_action'>(
    botoes.length ? 'quick_reply' : 'default',
  );
  if (modo === 'default') {
    return (
      <div className="ct-menu-botoes">
        <button
          type="button"
          className="ct-menu-botoes-item"
          onClick={() => setModo('call_to_action')}
        >
          <span>Botões de ação</span>
        </button>
        <button
          type="button"
          className="ct-menu-botoes-item ct-menu-item--meio"
          onClick={() => {
            setModo('quick_reply');
            aoMudar(botoes.length ? botoes : ['']);
          }}
        >
          <span>Respostas rápidas</span>
        </button>
      </div>
    );
  }
  if (modo === 'call_to_action') {
    return (
      <div className="ct-botoes-edicao">
        <label className="ct-campo ct-campo--cheio">
          <span className="ct-campo-rotulo">Tipo</span>
          <select defaultValue="url">
            <option value="url">Link do website</option>
            <option value="phone_number">Número de telefone</option>
            <option value="request_contact_info">Solicitar informação de contato</option>
          </select>
        </label>
        <input className="ct-cartao-entrada" placeholder="Texto do botão" />
        <input className="ct-cartao-entrada" placeholder="https://exemplo.com" />
      </div>
    );
  }
  return (
    <div className="ct-botoes-edicao">
      {botoes.map((botao, i) => (
        <div className="ct-botoes-linha" key={i}>
          <input
            className={
              botao.length > 20
                ? 'ct-cartao-entrada ct-cartao-entrada--invalida'
                : 'ct-cartao-entrada'
            }
            placeholder="Texto do botão"
            value={botao}
            onChange={(evento) =>
              aoMudar(botoes.map((b, j) => (j === i ? evento.target.value : b)))
            }
          />
          {botao.length > 20 ? <span className="ct-erro">Máximo de 20 caracteres</span> : null}
        </div>
      ))}
      {botoes.length < 3 ? (
        <button
          type="button"
          className="ct-botao-tracejado"
          disabled={botoes.some((b) => !b.trim())}
          onClick={() => aoMudar([...botoes, ''])}
        >
          <IconePortal nome="mais" tamanho={20} />
          <span>Adicionar outro botão</span>
        </button>
      ) : null}
    </div>
  );
}

/**
 * `<message-template-attachment-card>` (`.mt-card__attachtment`, 25vw): fora
 * da edição, a área do anexo e "Clique aqui para editar o conteúdo do seu
 * modelo de mensagem"; em edição, o link do anexo (`attachment.<tipo>.link` +
 * compatibilidade), o texto e o rodapé (`attachment.footer`, 60 caracteres).
 * `is-translation`: a tradução herda o anexo e não muda o link.
 */
function CartaoDeAnexo({
  tipo,
  traducao,
  somenteTraducao,
  aoMudar,
}: {
  tipo: 'imagem' | 'documento' | 'video';
  traducao: TraducaoEmEdicao;
  somenteTraducao: boolean;
  aoMudar: (mudanca: Partial<TraducaoEmEdicao>) => void;
}) {
  if (!traducao.editando) {
    return (
      <section
        className="ct-cartao ct-cartao--anexo ct-cartao--anexo-inativo"
        onClick={() => aoMudar({ editando: true, rascunho: traducao.texto })}
        role="button"
        tabIndex={0}
      >
        <div className="ct-anexo-corpo">
          <div className="ct-anexo-area">
            <IconePortal nome={BLOCOS[tipo].icone} tamanho={40} className={BLOCOS[tipo].classe} />
          </div>
          <div className="ct-anexo-titulo">
            {traducao.texto ? (
              <>
                <p className="ct-cartao-texto">{traducao.texto}</p>
                <p className="ct-cartao-rodape">{traducao.rodape}</p>
              </>
            ) : (
              <span>
                <u>Clique aqui</u> para editar o conteúdo do seu modelo de mensagem
              </span>
            )}
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className="ct-cartao ct-cartao--anexo ct-cartao--edicao">
      <div className="ct-mb3">
        <button
          type="button"
          className="ct-cartao-botao ct-cartao-fechar"
          aria-label="Cancelar"
          onClick={() => aoMudar({ editando: false })}
        >
          <IconePortal nome="fechar" tamanho={16} />
        </button>
        <button
          type="button"
          className="ct-cartao-botao ct-cartao-confirmar"
          aria-label="Confirmar"
          onClick={() => aoMudar({ editando: false, texto: traducao.rascunho.trim() })}
        >
          <IconePortal nome="cheque" tamanho={16} />
        </button>
      </div>
      <input
        className="ct-cartao-entrada"
        placeholder={ANEXO[tipo].link}
        value={traducao.link}
        disabled={somenteTraducao}
        onChange={(evento) => aoMudar({ link: evento.target.value })}
      />
      <span className="ct-compat">{ANEXO[tipo].compat}</span>
      <textarea
        className="ct-cartao-area"
        rows={3}
        maxLength={1024}
        value={traducao.rascunho}
        onChange={(evento) => aoMudar({ rascunho: evento.target.value })}
      />
      <div className="ct-cartao-formatacao ct-mb3">
        <button
          type="button"
          className="ct-cartao-variavel"
          onClick={() =>
            aoMudar({
              rascunho: `${traducao.rascunho}{{${(traducao.rascunho.match(/\{\{\d+\}\}/g)?.length ?? 0) + 1}}}`,
            })
          }
        >
          <IconePortal nome="mais" tamanho={16} />
          variável
        </button>
      </div>
      <input
        className="ct-cartao-entrada"
        placeholder="Rodapé"
        maxLength={60}
        value={traducao.rodape}
        onChange={(evento) => aoMudar({ rodape: evento.target.value })}
      />
      <BotoesDoModelo botoes={traducao.botoes} aoMudar={(botoes) => aoMudar({ botoes })} />
    </section>
  );
}
