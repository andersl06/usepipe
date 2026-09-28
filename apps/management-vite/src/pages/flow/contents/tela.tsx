import { useState } from 'react';
import { IconePortal, type NomeDeIconePortal } from '../../../components/icones-portal';
import { Selection } from '../../../components/selection';
import type { TemplateListed } from '@pipe/contracts';
import { createTemplateInChannel } from '../../../lib/channels-gravar';
import {
  CATEGORIAS,
  blocosDoMenu,
  nameError,
  listState,
  idiomasRepetidos,
  templateValid,
  blockShowChoice,
  mostrarVoltar,
  type Categoria,
  type TipoDeConteudo,
  type Translation,
} from './regras';

/**
 * The body variables, in the order they appear — same rule as `textVariables` in `dominio/whatsapp/modelos.ts` (the backend validates again; this only avoids a round trip for an error visible right here). Duplicated on purpose, as in `comunicacao-modelos-formulario.tsx`: the client screen shouldn't need to import a server module.
 */
function textVariables(texto: string): string[] {
  const vistas: string[] = [];
  for (const achado of texto.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) {
    if (!vistas.includes(achado[1]!)) vistas.push(achado[1]!);
  }
  return vistas;
}

/* `messageTemplateSidebar.newTemplate.inputs.menuList.*` and each block's icon. */
const BLOCOS: Record<TipoDeConteudo, { rotulo: string; icone: NomeDeIconePortal; classe: string }> =
  {
    texto: { rotulo: 'Texto', icone: 'texto-mensagem', classe: 'ct-bloco-icone--texto' },
    imagem: { rotulo: 'Imagem', icone: 'arquivo-imagem', classe: 'ct-block-icon--image' },
    documento: { rotulo: 'Documento', icone: 'arquivo-pdf', classe: 'ct-bloco-icone--pdf' },
    video: { rotulo: 'Vídeo', icone: 'video', classe: 'ct-bloco-icone--video' },
    pagamento: { rotulo: 'Pagamento', icone: 'pix', classe: 'ct-bloco-icone--pix' },
    carrossel: { rotulo: 'Carrossel', icone: 'carrossel', classe: 'ct-bloco-icone--carrossel' },
  };

/* `messageTemplate.categories.*` for the three from `fillTemplateCategories`. */
const ROTULO_CATEGORIA: Record<Categoria, string> = {
  autenticacao: 'Autenticação',
  marketing: 'Marketing',
  utilidade: 'Utilidade',
};

/* `messageTemplateLanguages.*` — the same subset Pipe already uses in `/comunicacao/modelos`. */
const IDIOMAS: [string, string][] = [
  ['pt_BR', 'Português (BR)'],
  ['en_US', 'Inglês (EUA)'],
  ['es', 'Espanhol'],
];

/* `messageTemplate.status.*` — the four values `template_mensagem.status_meta` stores (the library stays on the server; here it's just the label). */
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
const ATTACHMENT: Record<'imagem' | 'documento' | 'video', { link: string; compat: string }> = {
  imagem: { link: 'Link da imagem', compat: 'Compatível com JPG, JPEG ou PNG' },
  documento: { link: 'Link do documento', compat: 'Formato PDF' },
  video: { link: 'Link do vídeo', compat: 'Compatível com MP4 até 16MB' },
};

/** `/assets/img/contents/unavailable-message-template.svg` — the WhatsApp bubble outline, 110×110. */
function BalaoIndisponivel() {
  return (
    <svg
      className="ct-unavailable-image"
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
 * Conteúdos' `<aside class="detail-aside fl">`: `<bds-grid class="sidebar-container" direction="column">` with one `sidebar-item-container > a.sidebar-anchor > bds-grid.sidebar-item` per entry (title fs-14 bold, subtitle fs-12, `bds-icon arrow-right` on the right; the active one gets `.selected-sidebar-item`). Text from `modules.application.detail.contents.menu.*`.
 *
 * ponytail: "Recursos" (`contents.resource`) still has no screen here; it's left without a destination.
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
                item.ativo ? 'ct-side-card ct-side-card--active' : 'ct-side-card'
              }
              aria-current={item.ativo ? 'page' : undefined}
              role="link"
              tabIndex={0}
            >
              <span className="ct-lateral-texto">
                <span className="ct-lateral-titulo">{item.titulo}</span>
                <span className="ct-side-description">{item.descricao}</span>
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

interface TranslationInEdit extends Translation {
  link: string;
  rodape: string;
  buttons: string[];
  editando: boolean;
  rascunho: string;
  /** One example per body variable — Meta requires it for approval (`{{1}}` → `exemplos['1']`). */
  exemplos: Record<string, string>;
}

function newTranslation(idioma = 'pt_BR'): TranslationInEdit {
  return {
    idioma,
    texto: '',
    link: '',
    rodape: '',
    buttons: [],
    editando: false,
    rascunho: '',
    exemplos: {},
  };
}

export function TelaDeConteudos({
  modelos,
  temWhatsapp,
  channelId,
}: {
  modelos: TemplateListed[];
  temWhatsapp: boolean;
  channelId: string | null;
}) {
  const [aberto, setAberto] = useState(false);
  const state = listState(temWhatsapp, modelos.length);

  return (
    <div className="ct-shell">
      <LateralDeConteudos />
      <section className="ct-miolo" id="main-content-area">
        <header className="ct-cabecalho" id="whatsapp-message-templates-header">
          <div className="ct-header-section">
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
                <div className="ct-header-actions">
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
                  <div className="ct-header-buttons">
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
          {state === 'indisponivel' ? (
            <section className="ct-indisponivel">
              <div>
                <BalaoIndisponivel />
              </div>
              <p className="ct-indisponivel-titulo">Recurso exclusivo para WhatsApp</p>
              <div className="ct-unavailable-description">
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

          {state === 'vazio' ? (
            <div id="message-templates-no-results" className="ct-sem-resultado">
              <span className="ct-sem-resultado-1">
                Você ainda não adicionou modelos de mensagens
              </span>
              <span className="ct-sem-resultado-2">
                Clique no botão&nbsp;<b>Adicionar novo</b>&nbsp;para adicionar modelos de mensagens
              </span>
            </div>
          ) : null}

          {state === 'lista' ? (
            <section className="ct-paper">
              <div id="message-templates-infinite-scroll">
                {modelos.map((template, indice) => (
                  <div key={template.id} id={`message-template-${indice}-card`} className="ct-item">
                    <div className="ct-item-linha">
                      <div className="ct-item-w40">
                        <span className="ct-item-rotulo">Nome do modelo</span>
                        <span className="ct-item-nome">{template.name}</span>
                      </div>
                      <div className="ct-item-w15">
                        <span className="ct-item-rotulo">Categoria</span>
                        <span>
                          {ROTULO_CATEGORIA[template.category as Categoria] ?? template.category}
                        </span>
                      </div>
                      <div className="ct-item-w15">
                        <span className="ct-item-rotulo">Recategorizado</span>
                        <span>Não</span>
                      </div>
                      <div className="ct-item-w15">
                        <span className="ct-item-rotulo">Idioma</span>
                        <span>
                          {IDIOMAS.find(([codigo]) => codigo === template.idioma)?.[1] ??
                            template.idioma}
                        </span>
                      </div>
                      <div className="ct-item-w15">
                        <span className="ct-item-rotulo">Status</span>
                        <span
                          className={`ct-status ct-status--${COR_DO_STATUS[template.statusMeta] ?? 'info'}`}
                        >
                          {ROTULO_STATUS[template.statusMeta] ?? template.statusMeta}
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
          <NewTemplateSidebar
            channelId={channelId}
            existentes={modelos.map((template) => template.name)}
            aoFechar={() => setAberto(false)}
          />
        ) : null}
      </section>
    </div>
  );
}

/**
 * `openNewMessageSidebar()` → `SidebarContentService.showSidebar` with module 95559's template (`#create-message-template-sidebar`, 37.5rem, `.sidebar-header` + `.sidebar-body`): name, category, one translation per language (language + block chosen in the `menu-list` + card), "Adicionar tradução", and the "Enviar para avaliação" footer.
 *
 * "Enviar para avaliação" calls `POST /v1/canais/whatsapp/:id/modelos` (`criarModeloNaMeta`) — the SAME path as `comunicacao-modelos-formulario.tsx` in Cadastros — once per language (Meta versions by (name, language), not by "template with translations"). It's the only block this endpoint accepts today: a media header needs the Resumable Upload API (`modelos.ts`, ponytail logged there), and Autenticação has Meta-specific components, not free text — both cases get the explanatory notice instead of attempting to send.
 */
function NewTemplateSidebar({
  channelId,
  existentes,
  aoFechar,
}: {
  channelId: string | null;
  existentes: string[];
  aoFechar: () => void;
}) {
  const [nome, setNome] = useState('');
  const [nomeTocado, setNomeTocado] = useState(false);
  const [categoria, setCategoria] = useState<Categoria | ''>('');
  const [tipo, setTipo] = useState<TipoDeConteudo | 'default'>('default');
  const [translations, setTranslations] = useState<TranslationInEdit[]>([newTranslation()]);
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);

  const errorName = nomeTocado ? nameError(nome, existentes) : null;
  const repetidos = idiomasRepetidos(translations);
  const valido = templateValid({ nome, categoria, tipo, translations, existentes });
  const authentication = categoria === 'autenticacao';

  function changeTranslation(indice: number, mudanca: Partial<TranslationInEdit>) {
    setTranslations((lista) => lista.map((t, i) => (i === indice ? { ...t, ...mudanca } : t)));
  }

  async function sendForEvaluation() {
    if (!channelId) return setAviso('Este fluxo não tem canal de WhatsApp conectado.');
    if (authentication) {
      return setAviso(
        'Autenticação tem componentes próprios da Meta (código e botão de copiar) — não é texto livre. Ainda não dá para enviar esta categoria por aqui.',
      );
    }
    if (tipo !== 'texto') {
      return setAviso(
        'Por aqui só dá para enviar modelo de Texto — cabeçalho de imagem, documento ou vídeo pede o upload do arquivo de exemplo na Meta, que esta tela ainda não faz.',
      );
    }
    for (const t of translations) {
      const faltando = textVariables(t.texto).filter((v) => !t.exemplos[v]?.trim());
      if (faltando.length) {
        return setAviso(`Dê um exemplo para cada variável do texto (idioma "${t.idioma}").`);
      }
    }
    setEnviando(true);
    setAviso('');
    try {
      for (const t of translations) {
        const variables = textVariables(t.texto);
        const resultado = await createTemplateInChannel(channelId, {
          nome,
          idioma: t.idioma,
          categoria: categoria as 'marketing' | 'utilidade',
          corpo: t.texto,
          exemplos: variables.map((v) => t.exemplos[v]!.trim()),
        });
        if (!resultado.ok) {
          setAviso(`Idioma "${t.idioma}": ${resultado.error}`);
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
      <div className="ct-overlay" role="presentation" onClick={aoFechar} />
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
          <p className="ct-sidebar-description">
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
            <label className={errorName ? 'ct-campo ct-campo--invalido' : 'ct-campo'}>
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
            {errorName === 'invalido' ? (
              <p className="ct-error">
                Use letras minúsculas, números ou underlines, começando com uma letra
              </p>
            ) : null}
            {errorName === 'usado' ? (
              <p className="ct-error">Já existe um modelo de mensagem com este nome</p>
            ) : null}
            {errorName === 'comprido' ? <p className="ct-error">Máximo de 512 caracteres</p> : null}
          </div>

          <label className="ct-campo ct-mb3">
            <span className="ct-campo-rotulo">Categoria</span>
            <Selection
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
            </Selection>
          </label>

          {translations.map((translation, indice) => (
            <div className="ct-traducao" key={indice}>
              <div className="ct-inline">
                <label
                  className={
                    repetidos.includes(translation.idioma)
                      ? 'ct-campo ct-campo--invalido ct-campo--cheio'
                      : 'ct-campo ct-campo--cheio'
                  }
                >
                  <span className="ct-campo-rotulo">Idioma</span>
                  <Selection
                    value={translation.idioma}
                    onChange={(evento) => changeTranslation(indice, { idioma: evento.target.value })}
                  >
                    <option value="">Selecione</option>
                    {IDIOMAS.map(([codigo, rotulo]) => (
                      <option value={codigo} key={codigo}>
                        {rotulo}
                      </option>
                    ))}
                  </Selection>
                </label>
                {translations.length > 1 ? (
                  <button
                    type="button"
                    className="ct-trash"
                    title="Excluir idioma"
                    aria-label="Excluir idioma"
                    onClick={() => setTranslations((lista) => lista.filter((_, i) => i !== indice))}
                  >
                    <IconePortal nome="lixeira" tamanho={20} />
                  </button>
                ) : null}
              </div>
              {repetidos.includes(translation.idioma) ? (
                <p className="ct-error ct-error--14">
                  Este idioma está sendo usado em outra tradução
                </p>
              ) : null}

              <div className="ct-column">
                {indice === 0 && mostrarVoltar(tipo, categoria, translations.length) ? (
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

                {indice === 0 && blockShowChoice(tipo, categoria) ? (
                  <div className="ct-menu-paper">
                    <span className="ct-menu-dica">Escolha um bloco para adicionar</span>
                    {blocosDoMenu(categoria).map((linha, l) => (
                      <div className="ct-menu-lista" key={l}>
                        {linha.map((block, b) => (
                          <button
                            type="button"
                            className={
                              linha.length === 3 && b === 1
                                ? 'ct-menu-item ct-menu-item--meio'
                                : 'ct-menu-item'
                            }
                            key={block}
                            onClick={() => setTipo(block)}
                          >
                            <IconePortal
                              nome={BLOCOS[block].icone}
                              tamanho={24}
                              className={`ct-bloco-icone ${BLOCOS[block].classe}`}
                            />
                            <span>{BLOCOS[block].rotulo}</span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : null}

                {authentication ? (
                  <section className="ct-card ct-card--preview">
                    <span className="ct-card-text">
                      Seu código de verificação é {'{{1}}'}. Para sua segurança, não o compartilhe.
                    </span>
                    <div className="ct-card-buttons">
                      <div className="ct-card-action">
                        <IconePortal nome="copiar" tamanho={16} />
                        <span>Copiar código</span>
                      </div>
                    </div>
                  </section>
                ) : null}

                {!authentication && tipo === 'texto' ? (
                  <TextCard
                    translation={translation}
                    aoMudar={(mudanca) => changeTranslation(indice, mudanca)}
                  />
                ) : null}

                {!authentication &&
                (tipo === 'imagem' || tipo === 'documento' || tipo === 'video') ? (
                  <AttachmentCard
                    tipo={tipo}
                    translation={translation}
                    onlyTranslation={indice > 0}
                    aoMudar={(mudanca) => changeTranslation(indice, mudanca)}
                  />
                ) : null}
              </div>

              {translation.idioma === 'pt_BR' && !authentication ? (
                <div className="ct-avaliar">
                  <button
                    type="button"
                    className="ct-botao-texto"
                    disabled={!translation.texto}
                    onClick={() =>
                      setAviso('A avaliação de mensagem com IA ainda não está disponível.')
                    }
                  >
                    <IconePortal nome="brilho-ia" tamanho={24} />
                    <span>Avaliar mensagem com IA</span>
                  </button>
                </div>
              ) : null}
              {indice < translations.length - 1 ? <hr className="ct-divisor" /> : null}
            </div>
          ))}

          <button
            type="button"
            className={
              valido
                ? 'ct-add-translation ct-add-translation--active'
                : 'ct-add-translation'
            }
            disabled={!valido}
            onClick={() => setTranslations((lista) => [...lista, newTranslation('')])}
          >
            <IconePortal nome="mais" tamanho={24} />
            <span>Adicionar tradução</span>
          </button>

          {aviso ? (
            <p className="ct-error ct-error--14" role="alert">
              {aviso}
            </p>
          ) : null}
        </div>
        <div className="ct-sidebar-rodape">
          <button
            type="button"
            className={valido ? 'ct-enviar ct-enviar--ativo' : 'ct-enviar'}
            disabled={!valido || enviando}
            onClick={() => void sendForEvaluation()}
          >
            {enviando ? 'Enviando…' : 'Enviar para avaliação'}
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * `<message-template-card>` (`.mt-card`): outside edit mode, the placeholder "Insira aqui o conteúdo da mensagem" (or the text preview); in edit mode, a 3-line `textarea`, the "+ variável" bar, and the round confirm/close buttons in the corner. The bold/italic/strikethrough icons come from the `blip-toolkit` font and don't exist here (only "+ variável").
 */
function TextCard({
  translation,
  aoMudar,
}: {
  translation: TranslationInEdit;
  aoMudar: (mudanca: Partial<TranslationInEdit>) => void;
}) {
  if (!translation.editando) {
    return (
      <section
        className={translation.texto ? 'ct-card ct-card--preview' : 'ct-card'}
        onDoubleClick={() => aoMudar({ editando: true, rascunho: translation.texto })}
      >
        <button
          type="button"
          className="ct-card-button ct-card-edit"
          aria-label="Editar"
          onClick={() => aoMudar({ editando: true, rascunho: translation.texto })}
        >
          <IconePortal nome="editar" tamanho={16} />
        </button>
        {translation.texto ? (
          <span className="ct-card-text">{translation.texto}</span>
        ) : (
          <span className="ct-card-placeholder">Insira aqui o conteúdo da mensagem</span>
        )}
        {translation.buttons.length ? (
          <div className="ct-card-buttons">
            {translation.buttons.map((botao, i) => (
              <div className="ct-card-reply" key={i}>
                <span>{botao}</span>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    );
  }
  return (
    <section className="ct-card ct-card--edit">
      <button
        type="button"
        className="ct-card-button ct-card-close"
        aria-label="Cancelar"
        onClick={() => aoMudar({ editando: false })}
      >
        <IconePortal nome="fechar" tamanho={16} />
      </button>
      <button
        type="button"
        className="ct-card-button ct-card-confirm"
        aria-label="Confirmar"
        onClick={() => aoMudar({ editando: false, texto: translation.rascunho.trim() })}
      >
        <IconePortal nome="cheque" tamanho={16} />
      </button>
      <textarea
        className="ct-card-area"
        rows={3}
        maxLength={1024}
        value={translation.rascunho}
        onChange={(evento) => aoMudar({ rascunho: evento.target.value })}
      />
      <div className="ct-card-formatting">
        <button
          type="button"
          className="ct-card-variable"
          onClick={() =>
            aoMudar({
              rascunho: `${translation.rascunho}{{${(translation.rascunho.match(/\{\{\d+\}\}/g)?.length ?? 0) + 1}}}`,
            })
          }
        >
          <IconePortal nome="mais" tamanho={16} />
          variável
        </button>
      </div>
      <VariableExamples translation={translation} aoMudar={aoMudar} />
      <TemplateButtons buttons={translation.buttons} aoMudar={(buttons) => aoMudar({ buttons })} />
    </section>
  );
}

/**
 * Meta only approves a template with a variable if each one ships with a fill-in example — there's no equivalent screen in the origin (there it's a step of `saveMessageTemplate`, with no component of its own); here it's the minimum for `POST /v1/canais/whatsapp/:id/modelos` to accept "Enviar para avaliação".
 */
function VariableExamples({
  translation,
  aoMudar,
}: {
  translation: TranslationInEdit;
  aoMudar: (mudanca: Partial<TranslationInEdit>) => void;
}) {
  const variables = textVariables(translation.rascunho);
  if (variables.length === 0) return null;
  return (
    <div className="ct-exemplos">
      <span className="ct-campo-rotulo">Um exemplo por variável, para a Meta aprovar</span>
      {variables.map((v) => (
        <label className="ct-campo" key={v}>
          <span className="ct-campo-rotulo">{`Exemplo de {{${v}}}`}</span>
          <input
            type="text"
            value={translation.exemplos[v] ?? ''}
            onChange={(evento) =>
              aoMudar({ exemplos: { ...translation.exemplos, [v]: evento.target.value } })
            }
          />
        </label>
      ))}
    </div>
  );
}

/**
 * `<message-template-buttons>`: `.menu-buttons-list` with "Botões de ação" and "Respostas rápidas"; under quick replies, one "Texto do botão" field per button (up to 3, 20 characters) and "Adicionar outro botão". The `CallToAction`/`QuickReply` icons come from the `blip-toolkit` font (not present here).
 * ponytail: action buttons (phone, link, contact data) stay choice-only; Pipe doesn't model buttons in `template_mensagem` yet.
 */
function TemplateButtons({
  buttons,
  aoMudar,
}: {
  buttons: string[];
  aoMudar: (buttons: string[]) => void;
}) {
  const [modo, setModo] = useState<'default' | 'quick_reply' | 'call_to_action'>(
    buttons.length ? 'quick_reply' : 'default',
  );
  if (modo === 'default') {
    return (
      <div className="ct-menu-buttons">
        <button
          type="button"
          className="ct-menu-buttons-item"
          onClick={() => setModo('call_to_action')}
        >
          <span>Botões de ação</span>
        </button>
        <button
          type="button"
          className="ct-menu-buttons-item ct-menu-item--meio"
          onClick={() => {
            setModo('quick_reply');
            aoMudar(buttons.length ? buttons : ['']);
          }}
        >
          <span>Respostas rápidas</span>
        </button>
      </div>
    );
  }
  if (modo === 'call_to_action') {
    return (
      <div className="ct-buttons-edit">
        <label className="ct-campo ct-campo--cheio">
          <span className="ct-campo-rotulo">Tipo</span>
          <Selection defaultValue="url" aria-label="Tipo">
            <option value="url">Link do website</option>
            <option value="phone_number">Número de telefone</option>
            <option value="request_contact_info">Solicitar informação de contato</option>
          </Selection>
        </label>
        <input className="ct-card-input" placeholder="Texto do botão" />
        <input className="ct-card-input" placeholder="https://exemplo.com" />
      </div>
    );
  }
  return (
    <div className="ct-buttons-edit">
      {buttons.map((botao, i) => (
        <div className="ct-buttons-line" key={i}>
          <input
            className={
              botao.length > 20
                ? 'ct-card-input ct-card-input--invalid'
                : 'ct-card-input'
            }
            placeholder="Texto do botão"
            value={botao}
            onChange={(evento) =>
              aoMudar(buttons.map((b, j) => (j === i ? evento.target.value : b)))
            }
          />
          {botao.length > 20 ? <span className="ct-error">Máximo de 20 caracteres</span> : null}
        </div>
      ))}
      {buttons.length < 3 ? (
        <button
          type="button"
          className="ct-botao-tracejado"
          disabled={buttons.some((b) => !b.trim())}
          onClick={() => aoMudar([...buttons, ''])}
        >
          <IconePortal nome="mais" tamanho={20} />
          <span>Adicionar outro botão</span>
        </button>
      ) : null}
    </div>
  );
}

/**
 * `<message-template-attachment-card>` (`.mt-card__attachtment`, 25vw): outside edit mode, the attachment area and "Clique aqui para editar o conteúdo do seu modelo de mensagem"; in edit mode, the attachment link (`attachment.<tipo>.link` + compatibility), the text, and the footer (`attachment.footer`, 60 characters). `is-translation`: the translation inherits the attachment and doesn't change the link.
 */
function AttachmentCard({
  tipo,
  translation,
  onlyTranslation,
  aoMudar,
}: {
  tipo: 'imagem' | 'documento' | 'video';
  translation: TranslationInEdit;
  onlyTranslation: boolean;
  aoMudar: (mudanca: Partial<TranslationInEdit>) => void;
}) {
  if (!translation.editando) {
    return (
      <section
        className="ct-card ct-card--attachment ct-card--attachment-inactive"
        onClick={() => aoMudar({ editando: true, rascunho: translation.texto })}
        role="button"
        tabIndex={0}
      >
        <div className="ct-attachment-body">
          <div className="ct-attachment-area">
            <IconePortal nome={BLOCOS[tipo].icone} tamanho={40} className={BLOCOS[tipo].classe} />
          </div>
          <div className="ct-attachment-title">
            {translation.texto ? (
              <>
                <p className="ct-card-text">{translation.texto}</p>
                <p className="ct-card-footer">{translation.rodape}</p>
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
    <section className="ct-card ct-card--attachment ct-card--edit">
      <div className="ct-mb3">
        <button
          type="button"
          className="ct-card-button ct-card-close"
          aria-label="Cancelar"
          onClick={() => aoMudar({ editando: false })}
        >
          <IconePortal nome="fechar" tamanho={16} />
        </button>
        <button
          type="button"
          className="ct-card-button ct-card-confirm"
          aria-label="Confirmar"
          onClick={() => aoMudar({ editando: false, texto: translation.rascunho.trim() })}
        >
          <IconePortal nome="cheque" tamanho={16} />
        </button>
      </div>
      <input
        className="ct-card-input"
        placeholder={ATTACHMENT[tipo].link}
        value={translation.link}
        disabled={onlyTranslation}
        onChange={(evento) => aoMudar({ link: evento.target.value })}
      />
      <span className="ct-compat">{ATTACHMENT[tipo].compat}</span>
      <textarea
        className="ct-card-area"
        rows={3}
        maxLength={1024}
        value={translation.rascunho}
        onChange={(evento) => aoMudar({ rascunho: evento.target.value })}
      />
      <div className="ct-card-formatting ct-mb3">
        <button
          type="button"
          className="ct-card-variable"
          onClick={() =>
            aoMudar({
              rascunho: `${translation.rascunho}{{${(translation.rascunho.match(/\{\{\d+\}\}/g)?.length ?? 0) + 1}}}`,
            })
          }
        >
          <IconePortal nome="mais" tamanho={16} />
          variável
        </button>
      </div>
      <input
        className="ct-card-input"
        placeholder="Rodapé"
        maxLength={60}
        value={translation.rodape}
        onChange={(evento) => aoMudar({ rodape: evento.target.value })}
      />
      <TemplateButtons buttons={translation.buttons} aoMudar={(buttons) => aoMudar({ buttons })} />
    </section>
  );
}
