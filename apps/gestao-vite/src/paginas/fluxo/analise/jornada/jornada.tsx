import { IconePortal } from '../../../../componentes/icones-portal';
import type { ArestaDaJornada } from '@pipe/core/analise';
import { CabecalhoDaPagina, Cartao, SeletorDePeriodo } from '../pecas';
import { desenharSankey } from './sankey';

/**
 * Jornada dos Contatos — o componente `contactsJourney` do módulo
 * `analyticsComponents` (template 55218, controlador `Sn`), com o
 * `sankeyDiagram` (`Oe`) e o `labeledColorCard` (4233).
 *
 * As flags do contexto: `showing-contacts-journey` (sem ela a tela manda para
 * outro lugar), `contacts-journey-first-node-filter` (o filtro "Começar a
 * partir de", que tira a frase "Selecione um nó" do cabeçalho do diagrama) e
 * `contacts-journey-contacts-button` (o "Listar contatos"). Todas ligadas.
 *
 * Estados do template: diagrama, "carregando", sem dado e erro genérico. Aqui
 * a leitura é do servidor e termina antes da tela — não há "carregando" — e o
 * erro não tem de onde vir; ficam o diagrama e o "sem dado".
 */
export function JornadaDosContatos({
  arestas,
  de,
  ate,
  min,
  max,
  roteador,
}: {
  arestas: ArestaDaJornada[];
  de: string;
  ate: string;
  min: string;
  max: string;
  /** `isThisMasterApplication()`: muda a frase do "sem dado". */
  roteador: boolean;
}) {
  const temDiagrama = arestas.length > 0;
  /* `firstNodeFilterOptions`: os nós de partida, sem "Outros"/"Saída", únicos e
     em ordem alfabética. */
  const inicios = [
    ...new Set(
      arestas.filter((a) => a.passo === 1).map((a) => a.de.slice(0, a.de.lastIndexOf('[') - 1)),
    ),
  ].sort();

  return (
    <div className="jr-vista" id="contacts-journey-view">
      <CabecalhoDaPagina
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
        <div className="jr-filtros">
          <div className="jr-filtro-inicio">
            <span className="an-t16 jr-filtro-rotulo">Começar a partir de</span>
            {/* `<bds-autocomplete placeholder="Início">`. */}
            <label className="jr-autocompletar">
              <select defaultValue="" aria-label="Começar a partir de">
                <option value="">Início</option>
                {inicios.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <IconePortal nome="baixo" tamanho={24} />
            </label>
          </div>
          <div className="jr-periodo">
            <SeletorDePeriodo de={de} ate={ate} min={min} max={max} />
          </div>
        </div>

        <Cartao id="contacts-journey-container" className="jr-cartao">
          {temDiagrama ? (
            <>
              <div className="jr-cabeca-diagrama">
                {/* Desligado até um nó ser escolhido: dica "Primeiro selecione um nó". */}
                <div className="jr-botao-contatos" title="Primeiro selecione um nó">
                  <button type="button" className="an-bds-btn" disabled>
                    Listar contatos
                  </button>
                </div>
              </div>
              <Diagrama arestas={arestas} />
            </>
          ) : (
            <div className="jr-comunicacao" id="diagram-body">
              {/* `/assets/img/clock.svg`, que não veio na captura: no lugar, o
                  relógio do jogo de ícones. */}
              <IconePortal nome="relogio" tamanho={96} className="jr-comunicacao-imagem" />
              <span className="an-t24 jr-comunicacao-titulo">
                O chatbot não possui dados suficientes para mapeamento de uma jornada no período
                selecionado
              </span>
              <span className="an-t16 jr-comunicacao-texto">
                {roteador
                  ? 'Para visualizar como as pessoas têm utilizado o seu chatbot, é necessário ativar o contexto do roteador no fluxo dos seus sub-bots.'
                  : 'É necessário republicar o seu fluxo e aguardar algumas horas para que os dados comecem a aparecer por aqui.'}
              </span>
              {roteador ? (
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
        </Cartao>

        {temDiagrama ? (
          <Cartao id="contacts-journey-instructions">
            <div className="jr-instrucoes">
              <div className="jr-instrucoes-cabeca">
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
          </Cartao>
        ) : null}
      </div>

      <ModalDaJornada />
    </div>
  );
}

/** `<labeled-color-card>`: borda esquerda de 10px na cor do tipo de nó. */
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
 * `#contacts-journey-content > .diagram-body.pv5`: a largura do corpo é
 * `23% × etapas`, com piso de 100% (`adjustJourneyViewWidth()`); passou disso,
 * a caixa rola na horizontal. O desenho tem 500 de altura (`Ci.height`).
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
            const ultima = n.coluna === colunas - 1;
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
 * `showContactsJourneyInfoModalModal()` (template 22616): `bds-modal` com a
 * ilustração `sankey-diagram.svg` à esquerda — não veio na captura, a coluna
 * fica vazia — e o texto de `contactsJourney.infoModal`.
 */
function ModalDaJornada() {
  return (
    <div className="an-modal" id="ajuda-jornada" role="dialog" aria-modal="true">
      <a className="an-modal-fundo an-modal-fundo--bds" href="#" aria-label="Fechar" />
      <div className="an-bds-modal">
        <div className="jr-ajuda">
          <div className="jr-ajuda-imagem" />
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
