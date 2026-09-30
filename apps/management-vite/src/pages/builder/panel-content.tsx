import { useLayoutEffect, useRef, useState } from 'react';
import { Campo, Etiqueta, Icone } from '@pipe/ui';
import { engineContentErrors } from '@pipe/core';
import { ManagementIcon } from '../../components/icones-management';
import { IconePortal } from '@pipe/ui/icones-portal';
import { Select } from '@pipe/ui/select';
import type { Block, EditorInbound, ItemDeConteudo } from './model';
import { ehAttendance, newInbound } from './model';
import {
  LIMITE_DO_MENU,
  LIMITE_DO_QUICK_REPLY,
  RULES_OF_VALIDATION,
  ROTULOS_DO_CONTEUDO,
  adicionarConteudo,
  cardsOf,
  contentErrorsOfCard,
  setInbound,
  definirEspera,
  definirMenu,
  definirConteudoInterativo,
  definirConteudoDinamico,
  definirConteudoHttp,
  definirMidia,
  definirTexto,
  moverConteudo,
  novaFigurinha,
  novaImagem,
  novoAudio,
  novoDigitando,
  novoDocumento,
  novoMenu,
  novoQuickReply,
  novoPedirLocalizacao,
  novoWebLink,
  novoConteudoDinamico,
  novoConteudoHttp,
  novoTexto,
  novoVideo,
  novaLocalizacao,
  removerConteudo,
  hasInbound,
  inactivityEnabled,
  inactivityMinutes,
  validationWithRule,
  withInactivity,
  withInactivityMinutes,
  TIPO_MEDIA,
} from './conteudo';
import type { Card, MenuOption, TypeOfMediaCard } from './conteudo';

/** Menu label and icon per media card, in the frozen inventory's order (items 1-5 of 18). */
const MEDIA_MENU_ITEMS: { midia: TypeOfMediaCard; rotulo: keyof typeof ROTULOS_DO_CONTEUDO; icone: 'figurinha' | 'audio' | 'imagem' | 'video' | 'documento'; criar: () => ItemDeConteudo }[] = [
  { midia: 'sticker', rotulo: 'figurinha', icone: 'figurinha', criar: () => novaFigurinha() },
  { midia: 'audio', rotulo: 'audio', icone: 'audio', criar: () => novoAudio() },
  { midia: 'image', rotulo: 'imagem', icone: 'imagem', criar: () => novaImagem() },
  { midia: 'video', rotulo: 'video', icone: 'video', criar: () => novoVideo() },
  { midia: 'document', rotulo: 'documento', icone: 'documento', criar: () => novoDocumento() },
];

const LABEL_OF_MEDIA_CARD: Record<TypeOfMediaCard, string> = {
  sticker: ROTULOS_DO_CONTEUDO.figurinha,
  audio: ROTULOS_DO_CONTEUDO.audio,
  image: ROTULOS_DO_CONTEUDO.imagem,
  video: ROTULOS_DO_CONTEUDO.video,
  document: ROTULOS_DO_CONTEUDO.documento,
};

const ICON_OF_MEDIA: Record<TypeOfMediaCard, 'figurinha' | 'audio' | 'imagem' | 'video' | 'documento'> = {
  sticker: 'figurinha',
  audio: 'audio',
  image: 'imagem',
  video: 'video',
  document: 'documento',
};

/**
 * The editor's "Conteúdo" tab: the block's conversation as cards — the bot's messages on the left (Texto, Menu, Quick reply), the "Entrada do usuário" on the right — and the "+" that offers the types. Each card edits in place; the input opens its own panel: "Salvar resposta em variável" (with the "Variável" field), "Validar a entrada do usuário" ("Tipo de validação", "Expressão regular", "Instrução de validação"), and the choice between "Aguardar resposta" and "Não aguardar".
 *
 * On the attendance block the tab is called "Atendimento" and only has the input, which waits for the attendance to end — nothing to edit besides the variable.
 */

export function ContentPanel({
  block,
  onMudar,
  onAviso,
}: {
  block: Block;
  onMudar: (block: Block) => void;
  onAviso: (texto: string) => void;
}) {
  const cards = cardsOf(block);
  const [menuAberto, setMenuAberto] = useState(false);
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const conteudo = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (selecionado !== null) conteudo.current?.closest('.bl-panel-body')?.scrollTo(0, 0);
  }, [selecionado]);
  const [alterarEspera, setAlterarEspera] = useState(false);
  const attendance = ehAttendance(block.id);
  const raiz = !!block.root;

  function adicionar(item: ItemDeConteudo): void {
    setMenuAberto(false);
    const r = adicionarConteudo(block, item);
    if (r.ok) {
      onMudar(r.block);
      setSelecionado(r.block.$contentActions?.indexOf(item) ?? null);
    } else onAviso(r.error);
  }

  return (
    <div ref={conteudo} className="bl-aba-corpo bl-content-block">
      <span className="bl-conteudo-contador">
        {cards.filter((c) => c.tipo !== 'entrada' && c.tipo !== 'digitando').length}/25
      </span>
      {raiz ? (
        <div className="bl-content-introduction">
          <h4>Início</h4>
          <p>
            A conversa do seu chatbot sempre inicia através da <em>Entrada do usuário</em>. Crie
            novos blocos para adicionar conteúdos e desenvolva uma conversa com seu cliente.
          </p>
        </div>
      ) : null}
      {attendance ? (
        <div className="bl-content-introduction">
          <h4>Atendimento humano</h4>
          <p>Este bloco encaminhará a conversa para a sua fila de atendimento.</p>
          <p>
            Para utilizar este recurso, você precisará ativar a integração com o{' '}
            <strong>Blip Desk</strong>.
          </p>
          <small>v.{block.deskStateVersion ?? '3.0.0'}</small>
        </div>
      ) : null}
      <div className="bl-conversation-content bl-lista-de-cartoes">
        {!attendance
          ? cards.map((c) => (
              <div
                key={c.indice}
                className={`bl-previa-linha${c.tipo === 'entrada' ? ' bl-preview-line--inbound' : ''}`}
              >
                <button
                  type="button"
                  className="bl-previa-conteudo"
                  onClick={() => setSelecionado(c.indice)}
                >
                  {c.tipo === 'entrada'
                    ? raiz
                      ? ROTULOS_DO_CONTEUDO.entrada
                      : c.inbound.bypass
                        ? ROTULOS_DO_CONTEUDO.direto
                        : ROTULOS_DO_CONTEUDO.aguardando
                    : c.tipo === 'outro'
                      ? c.mime
                      : c.tipo === 'digitando'
                        ? ROTULOS_DO_CONTEUDO.digitando
                        : c.tipo === 'midia'
                          ? `${LABEL_OF_MEDIA_CARD[c.midia]}${c.uri ? `: ${c.uri}` : ''}`
                          : c.tipo === 'localizacao'
                            ? `${c.latitude}, ${c.longitude}`
                            : c.tipo === 'pedirLocalizacao'
                              ? c.texto || 'Pedir localização'
                            : c.tipo === 'webLink'
                              ? c.texto || c.uri || 'Web link'
                              : c.tipo === 'http'
                                ? c.uri || ROTULOS_DO_CONTEUDO.http
                                : c.tipo === 'dinamico'
                                  ? c.variavel || ROTULOS_DO_CONTEUDO.dinamico
                                  : c.tipo === 'pesquisa'
                                    ? ROTULOS_DO_CONTEUDO.pesquisa
                                : c.texto || ROTULOS_DO_CONTEUDO[c.tipo]}
                  {c.tipo === 'menu' || c.tipo === 'quickReply' ? (
                    <span className="bl-preview-options">
                      {c.options.map((o, i) => (
                        <span key={i}>{o.text}</span>
                      ))}
                    </span>
                  ) : null}
                </button>
                {c.tipo === 'entrada' && !raiz ? (
                  <div className="bl-espera-controle">
                    <span>
                      {c.inbound.bypass
                        ? ROTULOS_DO_CONTEUDO.naoAguardar
                        : ROTULOS_DO_CONTEUDO.aguardar}
                    </span>
                    <button
                      type="button"
                      className="bl-alterar"
                      aria-expanded={alterarEspera}
                      onClick={() => setAlterarEspera(!alterarEspera)}
                    >
                      (Alterar)
                    </button>
                    {alterarEspera ? (
                      <div className="bl-menu-actions">
                        {[true, false].map((aguardar) => (
                          <button
                            type="button"
                            key={String(aguardar)}
                            onClick={() => {
                              onMudar(definirEspera(block, aguardar));
                              setAlterarEspera(false);
                            }}
                          >
                            {aguardar
                              ? ROTULOS_DO_CONTEUDO.aguardar
                              : ROTULOS_DO_CONTEUDO.naoAguardar}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))
          : null}
      </div>

      {!raiz && !attendance ? (
        <div className="bl-adicionar-acao bl-adicionar-conteudo">
          <button type="button" className="bl-mais" onClick={() => setMenuAberto((v) => !v)}>
            + {ROTULOS_DO_CONTEUDO.adicionar}
          </button>
          {menuAberto ? (
            <div className="bl-menu-actions" role="menu">
              {MEDIA_MENU_ITEMS.map((item) => (
                <button
                  key={item.midia}
                  type="button"
                  role="menuitem"
                  onClick={() => adicionar(item.criar())}
                >
                  <Icone nome={item.icone} tamanho={16} /> {ROTULOS_DO_CONTEUDO[item.rotulo]}
                </button>
              ))}
              <button type="button" role="menuitem" onClick={() => adicionar(novoTexto())}>
                {ROTULOS_DO_CONTEUDO.texto}
              </button>
              <button type="button" role="menuitem" onClick={() => adicionar(novoMenu())}>
                {ROTULOS_DO_CONTEUDO.menu}
              </button>
              <button type="button" role="menuitem" onClick={() => adicionar(novoQuickReply())}>
                {ROTULOS_DO_CONTEUDO.quickReply}
              </button>
              <button type="button" role="menuitem" onClick={() => adicionar(novoDigitando())}>Digitando</button>
              <button type="button" role="menuitem" onClick={() => adicionar(novoPedirLocalizacao())}>Pedir localização</button>
              <button type="button" role="menuitem" onClick={() => adicionar(novaLocalizacao())}>Enviar localização</button>
              <button type="button" role="menuitem" onClick={() => adicionar(novoWebLink())}>Web link</button>
              <button type="button" role="menuitem" onClick={() => adicionar(novoConteudoHttp())}>{ROTULOS_DO_CONTEUDO.http}</button>
              <button type="button" role="menuitem" onClick={() => adicionar(novoConteudoDinamico())}>{ROTULOS_DO_CONTEUDO.dinamico}</button>
              {!hasInbound(block) ? (
                <button type="button" role="menuitem" onClick={() => adicionar(newInbound())}>
                  {ROTULOS_DO_CONTEUDO.entrada}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <a
        className="bl-conteudo-ajuda"
        href="https://help.blip.ai/hc/pt-br/articles/4474418203287-Criando-mensagens-interativas-no-WhatsApp"
        target="_blank"
        rel="noreferrer"
      >
        Entenda como funcionam os tipos de conteúdo
      </a>
      {selecionado !== null && cards.some((c) => c.indice === selecionado) ? (
        <section className="bl-detalhe" aria-label="Detalhes do conteúdo">
          <header className="bl-detalhe-cabecalho">
            <button
              type="button"
              className="iconbtn"
              aria-label="Voltar para conteúdo"
              onClick={() => setSelecionado(null)}
            >
              <IconePortal nome="voltar" tamanho={24} />
            </button>
            <h4>
              {(() => {
                const c = cards.find((c) => c.indice === selecionado)!;
                if (c.tipo === 'outro') return c.mime;
                if (c.tipo === 'midia') return LABEL_OF_MEDIA_CARD[c.midia];
                if (c.tipo === 'pedirLocalizacao') return 'Pedir localização';
                if (c.tipo === 'localizacao') return 'Enviar localização';
                if (c.tipo === 'webLink') return 'Web link';
                if (c.tipo === 'http') return ROTULOS_DO_CONTEUDO.http;
                if (c.tipo === 'dinamico') return ROTULOS_DO_CONTEUDO.dinamico;
                if (c.tipo === 'pesquisa') return ROTULOS_DO_CONTEUDO.pesquisa;
                return ROTULOS_DO_CONTEUDO[c.tipo];
              })()}
            </h4>
          </header>
          <ContentCard
            card={cards.find((c) => c.indice === selecionado)!}
            block={block}
            fixo={raiz || attendance}
            first={selecionado === 0}
            ultimo={selecionado === cards.length - 1}
            onMudar={onMudar}
          />
        </section>
      ) : null}
    </div>
  );
}

function ContentCard({
  card,
  block,
  fixo,
  first,
  ultimo,
  onMudar,
}: {
  card: Card;
  block: Block;
  /** Início and attendance: the input can't be removed nor swapped for "Não aguardar". */
  fixo: boolean;
  first: boolean;
  ultimo: boolean;
  onMudar: (block: Block) => void;
}) {
  const i = card.indice;
  const inbound = card.tipo === 'entrada';
  // F-6.1 F: the invalid card gets a red border, no text — the message stays where it always was.
  const comErro = contentErrorsOfCard(card).length > 0;
  const classeErro = comErro ? ' bl-card--erro' : '';
  const order =
    inbound || fixo ? null : (
      <span className="bl-output-order">
        <button
          type="button"
          className="iconbtn"
          title="Subir"
          aria-label="Subir"
          disabled={first}
          onClick={() => onMudar(moverConteudo(block, i, i - 1))}
        >
          <Icone nome="cima" tamanho={16} />
        </button>
        <button
          type="button"
          className="iconbtn"
          title="Descer"
          aria-label="Descer"
          disabled={ultimo || block.$contentActions?.[i + 1]?.input !== undefined}
          onClick={() => onMudar(moverConteudo(block, i, i + 1))}
        >
          <Icone nome="baixo" tamanho={16} />
        </button>
      </span>
    );
  const excluir =
    fixo && inbound ? null : (
      <button
        type="button"
        className="iconbtn"
        title="Excluir"
        aria-label="Excluir"
        onClick={() => onMudar(removerConteudo(block, i))}
      >
        <ManagementIcon nome="lixeira" tamanho={18} />
      </button>
    );

  switch (card.tipo) {
    case 'texto':
      return (
        <article className={`bl-card bl-card--bot${classeErro}`}>
          <header>
            <b>{ROTULOS_DO_CONTEUDO.texto}</b>
            {order}
            {excluir}
          </header>
          <textarea
            className="campo bl-campo-longo"
            rows={3}
            value={card.texto}
            placeholder="Digite a mensagem"
            onChange={(e) => onMudar(definirTexto(block, i, e.target.value))}
          />
        </article>
      );
    case 'menu':
    case 'quickReply': {
      const menu = card.tipo === 'menu';
      const limite = menu ? LIMITE_DO_MENU : LIMITE_DO_QUICK_REPLY;
      const switchOptions = (options: MenuOption[]): void =>
        onMudar(definirMenu(block, i, card.texto, options));
      return (
        <article className={`bl-card bl-card--bot${classeErro}`}>
          <header>
            <b>{menu ? ROTULOS_DO_CONTEUDO.menu : ROTULOS_DO_CONTEUDO.quickReply}</b>
            {order}
            {excluir}
          </header>
          <textarea
            className="campo bl-campo-longo"
            rows={2}
            value={card.texto}
            placeholder="Texto do menu"
            onChange={(e) => onMudar(definirMenu(block, i, e.target.value, card.options))}
          />
          <ol className="bl-options">
            {card.options.map((o, j) => (
              <li key={j}>
                <Campo
                  value={o.text}
                  maxLength={limite.caracteres}
                  placeholder={`Opção ${j + 1}`}
                  onChange={(e) =>
                    switchOptions(
                      card.options.map((x, k) => (k === j ? { ...x, text: e.target.value } : x)),
                    )
                  }
                />
                <button
                  type="button"
                  className="iconbtn"
                  title="Remover opção"
                  aria-label="Remover opção"
                  onClick={() => switchOptions(card.options.filter((_, k) => k !== j))}
                >
                  <Icone nome="x" tamanho={14} />
                </button>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="bl-mais"
            disabled={card.options.length >= limite.opcoes}
            onClick={() => switchOptions([...card.options, { text: '' }])}
          >
            + Adicionar opção
          </button>
          <p className="bl-ajuda">
            {menu ? ROTULOS_DO_CONTEUDO.limiteDoMenu : ROTULOS_DO_CONTEUDO.limiteDoQuickReply}
          </p>
        </article>
      );
    }
    case 'midia': {
      const erros = engineContentErrors(TIPO_MEDIA, card.settings);
      return (
        <article className={`bl-card bl-card--bot${classeErro}`}>
          <header>
            <b>
              <Icone nome={ICON_OF_MEDIA[card.midia]} tamanho={16} /> {LABEL_OF_MEDIA_CARD[card.midia]}
            </b>
            {order}
            {excluir}
          </header>
          <label className="bl-campo">
            <span className="sub">{ROTULOS_DO_CONTEUDO.campoUri}</span>
            <Campo
              value={card.uri}
              placeholder="https://..."
              onChange={(e) => onMudar(definirMidia(block, i, e.target.value, card.legenda))}
            />
          </label>
          <label className="bl-campo">
            <span className="sub">{ROTULOS_DO_CONTEUDO.campoLegenda}</span>
            <Campo
              value={card.legenda}
              onChange={(e) => onMudar(definirMidia(block, i, card.uri, e.target.value))}
            />
          </label>
          {erros.length > 0 ? <Etiqueta tom="alerta">{erros[0]}</Etiqueta> : null}
        </article>
      );
    }
    case 'entrada':
      return (
        <InboundCard inbound={card.inbound} block={block} fixo={fixo} comErro={comErro} onMudar={onMudar} />
      );
    case 'digitando':
      return (
        <article className={`bl-card bl-card--bot bl-card--deleted${classeErro}`}>
          <header>
            <b>{ROTULOS_DO_CONTEUDO.digitando}</b>
            {order}
            {excluir}
          </header>
          <p className="sub">O canal pode não exibir o indicador.</p>
        </article>
      );
    case 'pedirLocalizacao':
      return <InteractiveFields title="Pedir localização" order={order} excluir={excluir} value={card.texto} placeholder="Texto do pedido" comErro={comErro} onChange={(text) => onMudar(definirConteudoInterativo(block, i, { text }))} />;
    case 'localizacao':
      return (
        <article className={`bl-card bl-card--bot${classeErro}`}><header><b>Enviar localização</b>{order}{excluir}</header>
          <label className="bl-campo"><span className="sub">Latitude</span><Campo value={card.latitude} onChange={(e) => onMudar(definirConteudoInterativo(block, i, { latitude: Number(e.target.value), longitude: Number(card.longitude) }))} /></label>
          <label className="bl-campo"><span className="sub">Longitude</span><Campo value={card.longitude} onChange={(e) => onMudar(definirConteudoInterativo(block, i, { latitude: Number(card.latitude), longitude: Number(e.target.value) }))} /></label>
        </article>
      );
    case 'webLink':
      return (
        <article className={`bl-card bl-card--bot${classeErro}`}><header><b>Web link</b>{order}{excluir}</header>
          <label className="bl-campo"><span className="sub">URL</span><Campo value={card.uri} placeholder="https://..." onChange={(e) => onMudar(definirConteudoInterativo(block, i, { uri: e.target.value, text: card.texto, target: 'blank' }))} /></label>
          <label className="bl-campo"><span className="sub">Texto</span><Campo value={card.texto} onChange={(e) => onMudar(definirConteudoInterativo(block, i, { uri: card.uri, text: e.target.value, target: 'blank' }))} /></label>
          {card.uri.startsWith('https://') ? <a href={card.uri} target="_blank" rel="noopener noreferrer">{card.texto || card.uri}</a> : null}
        </article>
      );
    case 'http': {
      const headers = (): Record<string, string> => {
        try { return JSON.parse(card.cabecalhos) as Record<string, string>; } catch { return {}; }
      };
      const mudar = (next: Partial<{ uri: string; mime: string; cabecalhos: string; timeout: string }>) => {
        const cabecalhos = next.cabecalhos ?? card.cabecalhos;
        onMudar(definirConteudoHttp(block, i, {
          uri: next.uri ?? card.uri, type: next.mime ?? card.mime,
          headers: next.cabecalhos === undefined ? headers() : (() => { try { return JSON.parse(cabecalhos); } catch { return {}; } })(),
          requestTimeout: Number(next.timeout ?? card.timeout) || 60,
        }));
      };
      return <article className={`bl-card bl-card--bot${classeErro}`}><header><b>{ROTULOS_DO_CONTEUDO.http}</b>{order}{excluir}</header>
        <label className="bl-campo"><span className="sub">URL</span><Campo value={card.uri} placeholder="https://..." onChange={(e) => mudar({ uri: e.target.value })} /></label>
        <label className="bl-campo"><span className="sub">MIME type</span><Campo value={card.mime} placeholder="text/plain" onChange={(e) => mudar({ mime: e.target.value })} /></label>
        <label className="bl-campo"><span className="sub">Cabeçalhos (JSON)</span><textarea className="campo bl-campo-longo" rows={3} value={card.cabecalhos} onChange={(e) => mudar({ cabecalhos: e.target.value })} /></label>
        <label className="bl-campo"><span className="sub">Timeout (segundos)</span><Campo value={card.timeout} onChange={(e) => mudar({ timeout: e.target.value })} /></label>
      </article>;
    }
    case 'dinamico':
      return <article className={`bl-card bl-card--bot${classeErro}`}><header><b>{ROTULOS_DO_CONTEUDO.dinamico}</b>{order}{excluir}</header>
        <label className="bl-campo"><span className="sub">Variável</span><Campo value={card.variavel} placeholder="conteudoLime" onChange={(e) => onMudar(definirConteudoDinamico(block, i, e.target.value))} /></label>
        <p className="bl-ajuda">A variável deve conter o JSON LIME completo.</p>
      </article>;
    case 'pesquisa':
      return <article className="bl-card bl-card--bot"><header><b>{ROTULOS_DO_CONTEUDO.pesquisa}</b>{order}{excluir}</header><p className="bl-ajuda">Edite a pesquisa no bloco de satisfação.</p></article>;
    case 'outro':
      return (
        <article className={`bl-card bl-card--bot bl-card--deleted${classeErro}`}>
          <header>
            <b>{card.mime}</b>
            {order}
            {excluir}
          </header>
          {!card.suportado ? (
            <Etiqueta tom="alerta">{ROTULOS_DO_CONTEUDO.naoSuportado}</Etiqueta>
          ) : null}
        </article>
      );
  }
}

function InteractiveFields({ title, order, excluir, value, placeholder, comErro, onChange }: { title: string; order: React.ReactNode; excluir: React.ReactNode; value: string; placeholder: string; comErro?: boolean; onChange: (value: string) => void }) {
  return <article className={`bl-card bl-card--bot${comErro ? ' bl-card--erro' : ''}`}><header><b>{title}</b>{order}{excluir}</header><Campo value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /></article>;
}

function InboundCard({
  inbound,
  block,
  fixo,
  comErro,
  onMudar,
}: {
  inbound: EditorInbound;
  block: Block;
  fixo: boolean;
  comErro?: boolean;
  onMudar: (block: Block) => void;
}) {
  const validando = !!inbound.validation;
  const aguardando = !inbound.bypass;
  const atualizar = (nova: EditorInbound): void => onMudar(setInbound(block, nova));
  // Typed minutes stay as typed (an invalid value stores empty text and shows the hint).
  const [minutos, setMinutos] = useState(() => inactivityMinutes(inbound));
  const minutosValidos = !inactivityEnabled(inbound) || withInactivityMinutes(inbound, minutos).valid;

  return (
    <article className={`bl-card bl-card--client${comErro ? ' bl-card--erro' : ''}`}>
      <header>
        <b>{ROTULOS_DO_CONTEUDO.entrada}</b>
        <span className="sub">
          {aguardando ? ROTULOS_DO_CONTEUDO.aguardando : ROTULOS_DO_CONTEUDO.direto}
        </span>
      </header>
      {
        <div className="bl-entrada">
          {!fixo ? (
            <div className="bl-escolha" role="radiogroup" aria-label="Espera">
              <label>
                <input
                  type="radio"
                  checked={aguardando}
                  onChange={() => onMudar(definirEspera(block, true))}
                />{' '}
                {ROTULOS_DO_CONTEUDO.aguardar}
              </label>
              <label>
                <input
                  type="radio"
                  checked={!aguardando}
                  onChange={() => onMudar(definirEspera(block, false))}
                />{' '}
                {ROTULOS_DO_CONTEUDO.naoAguardar}
              </label>
            </div>
          ) : null}

          <section className="bl-section">
            <h5 className="bl-section-subtitle">{ROTULOS_DO_CONTEUDO.salvarEmVariavel}</h5>
            <p className="bl-ajuda">{ROTULOS_DO_CONTEUDO.salvarEmVariavelInfo}</p>
            <label className="bl-campo">
              <span className="sub">{ROTULOS_DO_CONTEUDO.variavel}</span>
              <Campo
                value={inbound.variable ?? ''}
                placeholder="nomeDaVariavel"
                onChange={(e) => atualizar({ ...inbound, variable: e.target.value || null })}
              />
            </label>
          </section>

          {aguardando && !ehAttendance(block.id) ? (
            <section className="bl-section">
              <label className="form-caixa">
                <input
                  type="checkbox"
                  checked={validando}
                  onChange={(e) =>
                    atualizar({
                      ...inbound,
                      validation: e.target.checked
                        ? validationWithRule(inbound.validation, 'text')
                        : null,
                    })
                  }
                />
                <span className="bl-section-subtitle">{ROTULOS_DO_CONTEUDO.validar}</span>
              </label>
              {inbound.validation ? (
                <>
                  <label className="bl-campo">
                    <span className="sub">{ROTULOS_DO_CONTEUDO.tipoDeValidacao}</span>
                    <Select
                      value={inbound.validation.rule}
                      onChange={(e) =>
                        atualizar({
                          ...inbound,
                          validation: validationWithRule(inbound.validation, e.target.value),
                        })
                      }
                    >
                      {RULES_OF_VALIDATION.map((r) => (
                        <option key={r.valor} value={r.valor}>
                          {r.rotulo}
                        </option>
                      ))}
                    </Select>
                  </label>
                  {inbound.validation.rule === 'regex' ? (
                    <label className="bl-campo">
                      <span className="sub">{ROTULOS_DO_CONTEUDO.regex}</span>
                      <Campo
                        value={inbound.validation.regex ?? ''}
                        onChange={(e) =>
                          atualizar({
                            ...inbound,
                            validation: { ...inbound.validation!, regex: e.target.value },
                          })
                        }
                      />
                    </label>
                  ) : null}
                  {inbound.validation.rule === 'type' ? (
                    <label className="bl-campo">
                      <span className="sub">{ROTULOS_DO_CONTEUDO.tipoDeMidia}</span>
                      <Campo
                        value={inbound.validation.type ?? ''}
                        placeholder="image/jpeg"
                        onChange={(e) =>
                          atualizar({
                            ...inbound,
                            validation: { ...inbound.validation!, type: e.target.value },
                          })
                        }
                      />
                    </label>
                  ) : null}
                  <label className="bl-campo">
                    <span className="sub">{ROTULOS_DO_CONTEUDO.instrucao}</span>
                    <Campo
                      value={inbound.validation.error ?? ''}
                      onChange={(e) =>
                        atualizar({
                          ...inbound,
                          validation: { ...inbound.validation!, error: e.target.value },
                        })
                      }
                    />
                  </label>
                </>
              ) : null}
            </section>
          ) : null}

          {aguardando && !ehAttendance(block.id) ? (
            <section className="bl-section">
              <label className="form-caixa">
                <input
                  type="checkbox"
                  checked={inactivityEnabled(inbound)}
                  onChange={(e) => {
                    setMinutos(e.target.checked ? minutos : '');
                    atualizar(withInactivity(inbound, e.target.checked));
                  }}
                />
                <span className="bl-section-subtitle">{ROTULOS_DO_CONTEUDO.tempoDeInatividade}</span>
              </label>
              <p className="bl-ajuda">{ROTULOS_DO_CONTEUDO.tempoDeInatividadeInfo}</p>
              {inactivityEnabled(inbound) ? (
                <label className="bl-campo">
                  <span className="sub">{ROTULOS_DO_CONTEUDO.minutosDeInatividade}</span>
                  <Campo
                    type="number"
                    min={1}
                    max={1380}
                    value={minutos}
                    aria-invalid={!minutosValidos}
                    onChange={(e) => {
                      setMinutos(e.target.value);
                      atualizar(withInactivityMinutes(inbound, e.target.value).inbound);
                    }}
                  />
                  {!minutosValidos ? <Etiqueta tom="erro">{ROTULOS_DO_CONTEUDO.minutosInvalidos}</Etiqueta> : null}
                </label>
              ) : null}
            </section>
          ) : null}
        </div>
      }
    </article>
  );
}
