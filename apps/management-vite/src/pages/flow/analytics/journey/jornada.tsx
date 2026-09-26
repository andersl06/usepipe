import { useMemo, useState } from 'react';
import { IconePortal } from '../../../../components/icones-portal';
import { Selection } from '../../../../components/selection';
import type { ArestaDaJornada } from '@pipe/core/analytics';
import { PageHeader, Card, PeriodSeletor } from '../pecas';
import { desenharSankey } from './sankey';

/**
 * `firstNodeFilterOptions`/the "Começar a partir de" filter: trims the diagram to the subgraph reachable from the chosen starting node — no new request, it's all client-side, over the edges already received from the server.
 */
function filtrarAPartirDoInicio(
  arestas: ArestaDaJornada[],
  inicio: string,
): ArestaDaJornada[] {
  if (!inicio) return arestas;
  const alcancados = new Set(
    arestas.filter((a) => a.passo === 1 && a.de.startsWith(`${inicio} [`)).map((a) => a.de),
  );
  const queue = [...alcancados];
  for (let i = 0; i < queue.length; i += 1) {
    for (const a of arestas) {
      if (a.de === queue[i] && !alcancados.has(a.para)) {
        alcancados.add(a.para);
        queue.push(a.para);
      }
    }
  }
  return arestas.filter((a) => alcancados.has(a.de));
}

/**
 * Contacts Journey — the `contactsJourney` component from the `analyticsComponents` module (template 55218, controller `Sn`), with the `sankeyDiagram` (`Oe`) and the `labeledColorCard` (4233). The context flags: `showing-contacts-journey` (without it the screen redirects elsewhere), `contacts-journey-first-node-filter` (the "Começar a partir de" filter, which removes the "Selecione um nó" phrase from the diagram header), and `contacts-journey-contacts-button` (the "Listar contatos" button). All enabled. Template states: diagram, "carregando" (loading), no data, and generic error. Here the read happens on the server and finishes before the screen renders — there is no "loading" state — and the error has nowhere to come from; only the diagram and "no data" states remain.
 */
export function ContactsJourney({
  arestas,
  de,
  ate,
  min,
  max,
  router,
  aoAplicarPeriodo,
}: {
  arestas: ArestaDaJornada[];
  de: string;
  ate: string;
  min: string;
  max: string;
  /** `isThisMasterApplication()`: changes the "sem dado" (no data) phrasing. */
  router: boolean;
  /** D-30: de/ate em state, nunca mais em `?de=&ate=`. */
  aoAplicarPeriodo?: (de: string, ate: string) => void;
}) {
  /*
   * `firstNodeFilterOptions`: the starting nodes, excluding "Outros"/"Saída", unique and alphabetically ordered. They come from ALL edges — changing the start doesn't narrow the options list, only the diagram.
   */
  const inicios = [
    ...new Set(
      arestas.filter((a) => a.passo === 1).map((a) => a.de.slice(0, a.de.lastIndexOf('[') - 1)),
    ),
  ].sort();
  const [inicio, setInicio] = useState('');
  const arestasFiltradas = useMemo(
    () => filtrarAPartirDoInicio(arestas, inicio),
    [arestas, inicio],
  );
  const temDiagrama = arestasFiltradas.length > 0;

  return (
    <div className="jr-vista" id="contacts-journey-view">
      <PageHeader
        id="contacts-journey-header"
        tituloProprio={
          <div className="jr-titulo">
            <span className="an-t24 jr-titulo-texto">Jornada dos contatos</span>
            <a
              className="jr-titulo-ajuda"
              href="#ajuda-jornada"
              aria-label="O que é a jornada dos contatos?"
            >
              <IconePortal nome="informacao-cheia" tamanho={20} />
            </a>
          </div>
        }
      />

      <div className="jr-miolo" id="contacts-journey">
        <div className="jr-filters">
          <div className="jr-filter-start">
            <span className="an-t16 jr-filter-label">Começar a partir de</span>
            {/* `<bds-autocomplete placeholder="Início">`. */}
            <label className="jr-autocompletar">
              <Selection
                value={inicio}
                onChange={(evento) => setInicio(evento.target.value)}
                aria-label="Começar a partir de"
              >
                <option value="">Início</option>
                {inicios.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Selection>
              <IconePortal nome="baixo" tamanho={24} />
            </label>
          </div>
          <div className="jr-period">
            <PeriodSeletor de={de} ate={ate} min={min} max={max} aoAplicar={aoAplicarPeriodo} />
          </div>
        </div>

        <Card id="contacts-journey-container" className="jr-card">
          {temDiagrama ? (
            <>
              <div className="jr-cabeca-diagrama">
                {/* Disabled until a node is chosen: tooltip "Primeiro selecione um nó". */}
                <div className="jr-button-contacts" title="Primeiro selecione um nó">
                  <button type="button" className="an-bds-btn" disabled>
                    Listar contatos
                  </button>
                </div>
              </div>
              <Diagrama arestas={arestasFiltradas} />
            </>
          ) : (
            <div className="jr-communication" id="diagram-body">
              {/*
 * `/assets/img/clock.svg`, which wasn't included in the capture: the clock icon from our icon set is used instead.
 */}
              <IconePortal nome="relogio" tamanho={96} className="jr-communication-image" />
              <span className="an-t24 jr-communication-title">
                O chatbot não possui dados suficientes para mapeamento de uma jornada no período
                selecionado
              </span>
              <span className="an-t16 jr-communication-text">
                {router
                  ? 'Para visualizar como as pessoas têm utilizado o seu chatbot, é necessário ativar o contexto do roteador no fluxo dos seus sub-bots.'
                  : 'É necessário republicar o seu fluxo e aguardar algumas horas para que os dados comecem a aparecer por aqui.'}
              </span>
              {router ? (
                <div className="jr-saiba">
                  <span className="an-t14 jr-saiba-texto">
                    Saiba como ativar o contexto do roteador
                  </span>
                  <IconePortal nome="abrir-arquivo" tamanho={20} />
                  <span className="pt-obra-selo">em breve</span>
                </div>
              ) : null}
            </div>
          )}
        </Card>

        {temDiagrama ? (
          <Card id="contacts-journey-instructions">
            <div className="jr-instructions">
              <div className="jr-instructions-header">
                <span className="an-t16 jr-negrito">Compreendendo o diagrama</span>
                <span className="an-t14">
                  O título de cada nó é composto por: nome do bloco criado no builder, sinalização
                  númerica da etapa e percentual de contatos que passaram pelo fluxo.
                </span>
              </div>
              <div className="jr-legendas">
                <Legenda cor="padrao" titulo="Nó padrão">
                  Representa cada pessoa que acessou um determinado bloco durante uma sessão, dentro
                  do período filtrado.
                </Legenda>
                <Legenda cor="saida" titulo="Nó saída">
                  Ocorre quando o contato não realizou nenhuma outra ação, dentro do período
                  filtrado.
                </Legenda>
                <Legenda cor="outros" titulo="Nó outros">
                  Um conjunto de vários outros blocos de menor volume.
                </Legenda>
              </div>
            </div>
          </Card>
        ) : null}
      </div>

      <ModalDaJornada />
    </div>
  );
}

/** `<labeled-color-card>`: 10px left border in the node type's color. */
function Legenda({
  cor,
  titulo,
  children,
}: {
  cor: 'padrao' | 'saida' | 'outros';
  titulo: string;
  children: string;
}) {
  return (
    <div className={`an-card jr-legenda jr-legenda--${cor}`}>
      <div className="jr-legenda-texto">
        <span className="an-t14 jr-negrito">{titulo}</span>
        <span className="an-t14">{children}</span>
      </div>
    </div>
  );
}

/**
 * `#contacts-journey-content > .diagram-body.pv5`: the body width is `23% × steps`, with a 100% floor (`adjustJourneyViewWidth()`); past that, the box scrolls horizontally. The drawing is 500 tall (`Ci.height`).
 */
function Diagrama({ arestas }: { arestas: ArestaDaJornada[] }) {
  const etapas = new Set(arestas.map((a) => a.passo)).size;
  const porcento = Math.max(100, 23 * etapas);
  const largura = 10 * porcento;
  const altura = 500;
  const { nos, faixas, colunas } = desenharSankey(arestas, largura, altura);

  return (
    <div className="jr-conteudo" id="contacts-journey-content">
      <div className="jr-corpo" id="diagram-body" style={{ width: `${porcento}%` }}>
        <svg
          viewBox={`-2 -2 ${largura + 4} ${altura + 4}`}
          role="img"
          aria-label="Jornada dos contatos"
        >
          {faixas.map((f, i) => (
            <path key={i} className="jr-faixa" d={f.d}>
              <title>{f.dica}</title>
            </path>
          ))}
          {nos.map((n) => {
            const ultima = n.column === colunas - 1;
            return (
              <g key={n.rotulo}>
                <rect
                  className={`jr-no jr-no--${n.tipo}`}
                  x={n.x}
                  y={n.y}
                  width={15}
                  height={Math.max(n.altura, 1)}
                />
                <text
                  className="jr-rotulo"
                  x={ultima ? n.x - 6 : n.x + 21}
                  y={n.y + n.altura / 2 + 3}
                  textAnchor={ultima ? 'end' : 'start'}
                >
                  {n.rotulo}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/**
 * `showContactsJourneyInfoModalModal()` (template 22616): `bds-modal` with the `sankey-diagram.svg` illustration on the left — not included in the capture, so the column stays empty — and the text from `contactsJourney.infoModal`.
 */
function ModalDaJornada() {
  return (
    <div className="an-modal" id="ajuda-jornada" role="dialog" aria-modal="true">
      <a className="an-modal-fundo an-modal-fundo--bds" href="#" aria-label="Fechar" />
      <div className="an-bds-modal">
        <div className="jr-ajuda">
          <div className="jr-help-image" />
          <div className="jr-ajuda-texto">
            <h4 className="an-t20 jr-negrito">O que é a jornada dos contatos?</h4>
            <p className="an-t14">
              Como seus contatos interagem com seu chatbot? Qual o comportamento da maioria? Como
              está a performance de seu fluxo? De onde essas pessoas vieram e para onde elas foram?
              Na jornada dos contatos, você consegue obter insights sobre seus fluxos em tempo real,
              permitindo que você aprimore, constantemente, seus fluxos de conversa.
            </p>
            <div className="jr-ajuda-link">
              <span className="an-t14 jr-negrito">Ver documentação</span>
              <IconePortal nome="abrir-arquivo" tamanho={16} />
              <span className="pt-obra-selo">em breve</span>
            </div>
          </div>
        </div>
        <div className="an-bds-modal-acao">
          <a className="an-bds-btn" href="#">
            Ok, entendi
          </a>
        </div>
      </div>
    </div>
  );
}
