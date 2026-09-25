import type { ReactNode } from 'react';
import { IconePortal, type NomeDeIconePortal } from '../../../../components/icones-portal';
import {
  PERIODOS_DE_CALENDARIO,
  PERIODOS_FIXOS,
  ROTULO_OF_PERIOD,
  comparison,
  diaCurto,
  escalaDoEixo,
  formatar,
  rotuloDoIntervalo,
  variation,
  type DashboardData,
  type Intervalo,
  type Period,
} from '@pipe/core/analise';
import { contactBase } from '../../contact';
import { PeriodCustom } from './period-custom';

/**
 * O miolo do Dashboard — o `iN` do `portal-fragment-analytics`
 * (`analytics-main.js`, linha ~59539), que o portal monta com
 * `<analytics-mfe page="dashboard">`.
 *
 * Só recebe props: é o que deixa desenhar o estado preenchido sem banco. A
 * ordem das seções é a do `iN`, com as flags do roteador de teste (LaunchDarkly):
 * Contatos · Recorrência (`is-displaying-recurrence-section`) · Mensagens ·
 * Canais (`is-displaying-dashboard-analytics-channel-section`) · Fluxo
 * conversacional (`is-displaying-conversational-flow-section`) · Lista de blocos
 * (`is-displaying-block-listing-section`). O botão "Download" do topo está
 * DESLIGADO lá (`is-displaying-analytics-dashboard-download-button` = false), e
 * por isso não existe aqui.
 *
 * Os gráficos da origem são chart.js; aqui são SVG + CSS, o mínimo que refaz o
 * desenho (`GraficoDeLinhas`, `BarrasDeParticipacao`), sem dependência nova.
 */

export interface PropsDoDashboard {
  id: string;
  period: Period;
  intervalo: Intervalo;
  hoje: string;
  data: DashboardData;
  /** A barra lateral aberta (`isDisplayingContactsSidebar`), com a lista já lida. */
  lista: { tipo: 'interacao' | 'rejeicao'; nomes: string[] } | null;
  /**
   * Período em React state (D-30, `std/nav-contract.md` §Gestão): os chips e
   * o "De/Até" personalizado chamam esta função em vez de navegar para
   * `?periodo=`. `undefined` (sem consumidor state) mantém o `href` como
   * fallback de navegação — não deveria acontecer em produção.
   */
  aoMudarPeriodo?: (period: Period, custom?: { de: string; ate: string }) => void;
}

/** O que a URL carrega entre um clique e outro: o período. */
function query(p: PropsDoDashboard, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({ periodo: p.period });
  if (p.period === 'custom') {
    q.set('de', p.intervalo.inicio);
    q.set('ate', p.intervalo.fim);
  }
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  return `?${q.toString()}`;
}

export function TelaDoDashboard(p: PropsDoDashboard) {
  const { dica, foraDoAlcance } = comparison(p.intervalo, p.hoje);
  const cmp: Comparison = { dica, fora: foraDoAlcance };
  return (
    /* `eN` + `.dashboard-container`: largura cheia e 55px em cima. */
    <div className="da-raiz">
      <PeriodFilter {...p} />

      {/* `tN`: min 1024, max 1377, 85% da largura, 30px em cima e embaixo. */}
      <div className="da-miolo">
        {/* `nN`: título à esquerda, `aN` (botões, gap 12) à direita. */}
        <div className="da-cabecalho">
          <div>
            <h1 className="da-t32 da-negrito da-margem">Dashboard</h1>
            <p className="da-t16">{rotuloDoIntervalo(p.intervalo)}</p>
          </div>
          <div className="da-botoes">
            {/* `Le icon="refresh" variant="secondary"`: refaz o pedido com o mesmo filtro. */}
            <a className="da-botao da-botao--secundario" href={query(p)}>
              <IconePortal nome="atualizar" tamanho={24} />
              Atualizar
            </a>
          </div>
        </div>

        <SectionContacts {...p} cmp={cmp} />
        <SectionRecorrencia {...p} cmp={cmp} />
        <SectionMessages {...p} cmp={cmp} />
        <SectionChannels {...p} cmp={cmp} />
        <SectionFlow {...p} cmp={cmp} />
        <SectionBlocks {...p} />
      </div>

      {p.lista ? <ContactsBarra {...p} lista={p.lista} /> : null}
    </div>
  );
}

interface Comparison {
  dica: string;
  fora: boolean;
}

/* =============================================================== o filtro */

/**
 * `xT` (o `ST` do `iN`): a faixa clara de largura cheia, com sombra embaixo e
 * cantos de baixo arredondados (`bT`). O chip ativo é `color="default"`, os
 * outros `outline`; tamanho `tall` (40px). A segunda fileira é da flag
 * `is-displaying-dashboard-fixed-period-chips`.
 */
function PeriodFilter(p: PropsDoDashboard) {
  const chip = (nome: keyof typeof ROTULO_OF_PERIOD) => (
    <a
      key={nome}
      href={`?periodo=${nome}`}
      className={p.period === nome ? 'da-chip da-chip--ativo' : 'da-chip'}
      aria-current={p.period === nome ? 'true' : undefined}
      onClick={(e) => {
        if (!p.aoMudarPeriodo) return;
        e.preventDefault();
        p.aoMudarPeriodo(nome);
      }}
    >
      <span className="da-chip-texto">{ROTULO_OF_PERIOD[nome]}</span>
    </a>
  );
  return (
    <div className="da-filtro">
      <div className="da-filtro-miolo">
        {/* `mT`: rótulo fs-20 bold e a dica `info` sólida. */}
        <div className="da-filtro-rotulo">
          <span className="da-t20 da-negrito">Selecione o período</span>
          <Dica
            position="bottom-center"
            texto="A análise será referente ao período selecionado e a comparação será feita com base no mesmo período anterior (ex: semana atual e semana anterior)."
          >
            <IconePortal nome="informacao-cheia" tamanho={24} />
          </Dica>
        </div>
        {/* `fT` com as duas `gT`. */}
        <div className="da-filtro-chips">
          <div className="da-filtro-fileira">{PERIODOS_FIXOS.map(chip)}</div>
          <div className="da-filtro-fileira">{PERIODOS_DE_CALENDARIO.map(chip)}</div>
        </div>
        <PeriodCustom
          hoje={p.hoje}
          de={p.period === 'custom' ? p.intervalo.inicio : ''}
          ate={p.period === 'custom' ? p.intervalo.fim : ''}
          aoAplicar={
            p.aoMudarPeriodo ? (de, ate) => p.aoMudarPeriodo!('custom', { de, ate }) : undefined
          }
        />
      </div>
    </div>
  );
}

/* ============================================================ as peças */

type Position = 'bottom-center' | 'left-center' | 'left-bottom' | 'top-right';

/** `bds-tooltip`: balão escuro de raio 8 e recheio 8, texto fs-12, seta de 6px. */
function Dica({
  texto,
  position,
  children,
}: {
  texto: string;
  position: Position;
  children: ReactNode;
}) {
  return (
    <span className="da-dica">
      {children}
      <span className={`da-dica-balao da-dica-balao--${position}`} role="tooltip">
        <span className="da-t12">{texto}</span>
      </span>
    </span>
  );
}

/**
 * `XS`, o indicador de comparação: seta + variação inteira com sinal. Sem
 * número ("-") não tem seta. `semDica` é o `hideTooltip` da tabela de canais.
 */
function Indicador({
  value,
  variante,
  cmp,
  semDica = false,
}: {
  value: number | undefined;
  variante: 'claro' | 'escuro' | 'transparente';
  cmp: Comparison;
  semDica?: boolean;
}) {
  const texto = cmp.fora ? '-' : formatar(value, { percentual: true, casas: 0, sinal: true });
  const corpo = (
    <span className={`da-var da-var--${variante}`}>
      {texto !== '-' ? (
        <IconePortal nome={parseFloat(texto) > 0 ? 'cima' : 'baixo'} tamanho={16} />
      ) : null}
      <span className={semDica ? 'da-t12' : 'da-t12 da-semi'}>{texto}</span>
    </span>
  );
  return semDica ? (
    corpo
  ) : (
    <Dica texto={cmp.dica} position="bottom-center">
      {corpo}
    </Dica>
  );
}

/** `kE`: título fs-24 bold (com a margem de 22px do typo) e a dica `info` sólida. */
function SectionTitulo({
  children,
  dica,
  semMargem = false,
}: {
  children: ReactNode;
  dica?: string;
  semMargem?: boolean;
}) {
  return (
    <div className="da-titulo">
      <h2 className={semMargem ? 'da-t24 da-negrito' : 'da-t24 da-negrito da-margem'}>
        {children}
      </h2>
      {dica ? (
        <Dica texto={dica} position="bottom-center">
          <IconePortal nome="informacao-cheia" tamanho={24} className="da-titulo-info" />
        </Dica>
      ) : null}
    </div>
  );
}

/**
 * `wS`: o botão só de ícone que baixa o CSV da seção, com a dica à esquerda.
 * ponytail: o Pipe não gera esses CSVs; o botão tem a cara e o estado da origem
 * (travado quando não há dado), sem ação — quando houver, é um route handler
 * nesta pasta com a mesma consulta de `lib/analise.ts`.
 */
function BotaoCsv({ travado, dica }: { travado: boolean; dica: string }) {
  return (
    <div className="da-csv">
      <Dica texto={dica} position="left-center">
        <button
          type="button"
          className="da-botao da-botao--secundario da-botao--so-icone"
          disabled={travado}
          aria-label={dica}
        >
          <IconePortal nome="baixar" tamanho={24} />
        </button>
      </Dica>
    </div>
  );
}

/** `mE`: o vazio da seção — ícone de 80, título fs-16 bold, texto fs-14 semi-bold. */
function WithoutData({
  icone,
  titulo,
  texto,
}: {
  icone: NomeDeIconePortal;
  titulo: string;
  texto: string;
}) {
  return (
    <div className="da-vazio">
      <IconePortal nome={icone} tamanho={80} className="da-vazio-icone" />
      <p className="da-t16 da-negrito da-vazio-titulo">{titulo}</p>
      <p className="da-t14 da-semi da-vazio-texto">{texto}</p>
    </div>
  );
}

const WITHOUT_CONVERSATIONS = {
  titulo: 'Inicie conversas para acompanhar a performance do seu chatbot!',
  texto:
    'Assim que o chatbot começar a trocar algumas mensagens com seus contatos, todos os dados que você precisa para evoluir seu contato inteligente aparecerão aqui no Dashboard.',
};
const WITHOUT_INFORMATION = 'Não há informações para baixar.';

/* =========================================================== gráficos */

/** Os tiques do eixo de valor: a mesma régua do chart.js que Mensagens ativas usa. */
const escala = (maximo: number) => escalaDoEixo(maximo).tiques;

/**
 * `n_`: o gráfico de linhas das seções Contatos e Mensagens — legenda embaixo
 * com bolinha de 7px, sem grade, eixo a partir de zero, linha de 3px sem ponto
 * (`pointRadius: 0`), título bold 14 alinhado à esquerda quando há.
 *
 * ponytail: o chart.js gira o rótulo do eixo x antes de pular; aqui ele só
 * pula (no máximo 8 rótulos), sem girar.
 */
function GraficoDeLinhas({
  titulo,
  rotulos,
  series,
}: {
  titulo?: string;
  rotulos: string[];
  series: { rotulo: string; cor: string; values: number[] }[];
}) {
  const tiques = escala(Math.max(0, ...series.flatMap((s) => s.values)));
  const topo = tiques[tiques.length - 1] ?? 1;
  const x = (i: number) => (rotulos.length > 1 ? (i / (rotulos.length - 1)) * 100 : 50);
  const pulo = Math.ceil(rotulos.length / 8);
  return (
    <div className="da-linhas">
      {titulo ? <p className="da-linhas-titulo">{titulo}</p> : null}
      <div className="da-linhas-area">
        <div className="da-eixo-y">
          {tiques.map((t) => (
            <span key={t} style={{ bottom: `${(t / topo) * 100}%` }}>
              {t.toLocaleString('pt-BR')}
            </span>
          ))}
        </div>
        <div className="da-plot">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {series.map((s) => (
              <polyline
                key={s.rotulo}
                className={s.cor}
                points={s.values.map((v, i) => `${x(i)},${100 - (v / topo) * 100}`).join(' ')}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          <div className="da-eixo-x">
            {rotulos.map((r, i) =>
              i % pulo === 0 ? (
                <span key={r} style={{ left: `${x(i)}%` }}>
                  {r}
                </span>
              ) : null,
            )}
          </div>
        </div>
      </div>
      <Legenda itens={series} />
    </div>
  );
}

function Legenda({ itens }: { itens: { rotulo: string; cor: string }[] }) {
  return (
    <ul className="da-legenda">
      {itens.map((s) => (
        <li key={s.rotulo}>
          <i className={s.cor} />
          {s.rotulo}
        </li>
      ))}
    </ul>
  );
}

/**
 * `QT`: duas barras deitadas numa categoria só, raio 8, o valor em "%"
 * (`Math.round(100 * v)`) em 24px à direita da ponta, e a folga direita que
 * cresce de 50 a 80px com o maior valor (`PT`).
 */
function ParticipationBarras({
  barras,
}: {
  barras: { rotulo: string; cor: string; fraction: number }[];
}) {
  const tiques = escala(Math.max(0, ...barras.map((b) => b.fraction)));
  const topo = tiques[tiques.length - 1] ?? 1;
  const maior = Math.max(...barras.map((b) => b.fraction));
  const folga = maior < 0.5 ? 50 : maior > 1 ? 80 : ((maior - 0.5) / 0.5) * 30 + 50;
  return (
    <div className="da-barras">
      <div className="da-barras-area" style={{ paddingRight: `${folga}px` }}>
        {barras.map((b) => (
          <div key={b.rotulo} className="da-barras-linha">
            <span
              className={`da-barra ${b.cor}`}
              style={{ width: `${(b.fraction / topo) * 100}%` }}
            />
            <span className="da-barra-valor">{` ${Math.round(100 * b.fraction)}%`}</span>
          </div>
        ))}
      </div>
      <Legenda itens={barras} />
    </div>
  );
}

/* =========================================================== Contatos */

/**
 * `I_`. Com `is-using-contacts-section-identity-quantity-route` ligada, os
 * totais vêm das rotas de quantidade (`engaged-identity-quantity` e
 * `active-identity-quantity`), e as taxas saem deles: interação = com
 * interação ÷ total; rejeição = 1 − interação.
 */
function SectionContacts(p: PropsDoDashboard & { cmp: Comparison }) {
  const { contacts } = p.data;
  const total = contacts.total.atual;
  const com = Math.min(Math.max(contacts.withInteraction.atual, 0), total);
  const comAntes = Math.min(Math.max(contacts.withInteraction.anterior, 0), contacts.total.anterior);
  const semResposta = total - com;
  const semRespostaAntes = contacts.total.anterior - comAntes;
  const interaction = total ? com / total : undefined;
  const rejection = interaction !== undefined ? 1 - interaction : undefined;

  return (
    <section className="da-papel da-contatos">
      <div className="da-secao-cabeca">
        <div className="da-secao-titulos">
          <SectionTitulo dica="Contatos são todas as pessoas que receberam e/ou enviaram mensagens para o seu chatbot.">
            Contatos
          </SectionTitulo>
          <p className="da-t16">
            Acompanhe as métricas relativas aos contatos que conversaram com o seu chatbot.
          </p>
        </div>
        {/* `isDisabled: A` — e o `A` do `iN` nunca sai de `false`. */}
        <BotaoCsv travado={false} dica="Baixar dados de Contatos em csv." />
      </div>

      <div className="da-contatos-corpo">
        {/* `O_` 30% (`#paperCard`): o cartão escuro do total e dois claros. */}
        <div className="da-coluna" style={{ width: '30%' }}>
          <div className="da-papel da-cartao-escuro">
            <span className="da-t14 da-negrito">Total de contatos únicos</span>
            <span className="da-linha">
              <span className="da-t24 da-extra">{formatar(total, { padrao: '0' })}</span>
              <Indicador
                value={variation(total, contacts.total.anterior)}
                variante="claro"
                cmp={p.cmp}
              />
            </span>
          </div>
          <CardClaro
            titulo="Contatos que não responderam"
            dica="É a quantidade de contatos únicos que não responderam a nenhuma mensagem enviada pelo chatbot e não iniciaram nenhuma conversa no período selecionado."
            value={semResposta}
            variation={variation(semResposta, semRespostaAntes)}
            cmp={p.cmp}
          />
          <CardClaro
            titulo="Contatos com interação"
            dica="É a quantidade de contatos únicos que realizaram alguma interação com seu chatbot no período selecionado, seja iniciando uma conversa ou respondendo a uma mensagem enviada."
            value={com}
            variation={variation(com, comAntes)}
            cmp={p.cmp}
          />
        </div>

        <div className="da-coluna" style={{ width: '45%' }}>
          <GraficoDeLinhas
            rotulos={contacts.byDia.map((d) => diaCurto(d.dia))}
            series={[
              {
                rotulo: 'Contatos com interação',
                cor: 'da-cor-oceano',
                values: contacts.byDia.map((d) => d.withInteraction),
              },
              {
                rotulo: 'Contatos que não responderam',
                cor: 'da-cor-cinza',
                values: contacts.byDia.map((d) => d.total - d.withInteraction),
              },
            ]}
          />
        </div>

        <div className="da-coluna" style={{ width: '25%' }}>
          <CardStriped
            p={p}
            titulo="Taxa de rejeição"
            dica="É a porcentagem de contatos que não responderam às mensagens do seu chatbot no período selecionado."
            value={formatar(rejection, { percentual: true, padrao: '0%' })}
            cor="da-borda-apagada"
            contacts={semResposta}
            lista="rejeicao"
          />
          <CardStriped
            p={p}
            titulo="Taxa de interação"
            dica="É a porcentagem de contatos que responderam a alguma mensagem do seu chatbot ou que iniciaram uma conversa com ele no período selecionado."
            value={formatar(interaction, { percentual: true, padrao: '0%' })}
            cor="da-borda-oceano"
            contacts={com}
            lista="interacao"
          />
        </div>
      </div>
    </section>
  );
}

/** `c_`: número fs-24 extra-bold com o indicador escuro e a dica; rótulo fs-12 embaixo. */
function CardClaro(props: {
  titulo: string;
  dica: string;
  value: number;
  variation: number | undefined;
  cmp: Comparison;
}) {
  return (
    <div className="da-papel da-cartao-claro">
      <div className="da-cartao-claro-topo">
        <div />
        <span className="da-linha">
          <span className="da-t24 da-extra">{formatar(props.value, { padrao: '0' })}</span>
          <Indicador value={props.variation} variante="escuro" cmp={props.cmp} />
        </span>
        <Dica texto={props.dica} position="bottom-center">
          <IconePortal nome="informacao-cheia" tamanho={16} />
        </Dica>
      </div>
      <span className="da-t12 da-semi">{props.titulo}</span>
    </div>
  );
}

/**
 * `__`: o cartão com fio colorido embaixo do número. Com
 * `is-displaying-list-contacts-button`, o `external-file` abre a barra lateral
 * — travado (`not-allowed`) quando não há contato.
 */
function CardStriped(props: {
  p?: PropsDoDashboard;
  titulo: string;
  dica: string;
  value: string;
  cor: string;
  contacts?: number;
  lista?: 'interacao' | 'rejeicao';
  variation?: { value: number | undefined; cmp: Comparison };
  sombra?: boolean;
}) {
  const empty = !props.contacts;
  return (
    <div className={props.sombra ? 'da-listrado da-listrado--sombra' : 'da-listrado'}>
      <div className={`da-listrado-conteudo ${props.cor}`}>
        <div className="da-listrado-titulo">
          <span className="da-t12 da-negrito">{props.titulo}</span>
          {props.lista && props.p ? (
            <Dica
              position="bottom-center"
              texto={empty ? 'Não há contatos para serem visualizados' : 'Visualizar contatos'}
            >
              {empty ? (
                <span className="da-abrir da-abrir--travado" aria-disabled="true">
                  <IconePortal nome="abrir-arquivo" tamanho={20} />
                </span>
              ) : (
                <a
                  className="da-abrir"
                  href={query(props.p, { contacts: props.lista })}
                  aria-label="Visualizar contatos"
                >
                  <IconePortal nome="abrir-arquivo" tamanho={20} />
                </a>
              )}
            </Dica>
          ) : null}
        </div>
        <span className="da-linha">
          <span className="da-t24 da-extra da-mr8">{props.value}</span>
          {props.variation ? (
            <Indicador value={props.variation.value} variante="claro" cmp={props.variation.cmp} />
          ) : null}
        </span>
      </div>
      <span className="da-listrado-dica">
        <Dica texto={props.dica} position="left-bottom">
          <IconePortal nome="informacao-cheia" tamanho={16} />
        </Dica>
      </span>
    </div>
  );
}

/* ========================================================= Recorrência */

/** `BR`: dois `DR` à esquerda e a tabela `DT` dos mais recorrentes à direita. */
function SectionRecorrencia(p: PropsDoDashboard & { cmp: Comparison }) {
  const { recorrencia, contacts } = p.data;
  const taxa = contacts.total.atual ? recorrencia.contacts.atual / contacts.total.atual : undefined;
  const tudoZero = recorrencia.contacts.atual === 0 && recorrencia.maisRecorrentes.length === 0;
  return (
    <div className="da-recorrencia">
      <div className="da-meia">
        <CardAzul
          titulo="Taxa de recorrência"
          texto="Taxa de contatos únicos que interagiram com seu chatbot 2 ou mais vezes em intervalos de 24h"
          value={formatar(taxa, { percentual: true, padrao: '0%' })}
        />
        <CardAzul
          titulo="Contatos únicos recorrentes"
          texto="Total de contatos únicos que interagiram com seu chatbot 2 ou mais vezes em intervalos de 24h"
          value={formatar(recorrencia.contacts.atual)}
          indicador={
            <Indicador
              value={variation(recorrencia.contacts.atual, recorrencia.contacts.anterior)}
              variante="claro"
              cmp={p.cmp}
            />
          }
        />
      </div>
      <div className="da-meia">
        <Ranking
          titulo="Contatos com mais recorrência"
          dica="Recorrência é a quantidade de dias dentro do período selecionado que cada contato conversou com o chatbot."
          description="Saiba quem são os contatos que mais vezes interagiram com seu chatbot no período selecionado"
          csv={{
            travado: tudoZero,
            dica: tudoZero
              ? WITHOUT_INFORMATION
              : 'Baixar os contatos mais recorrentes do período selecionado. Limite de até 1000 contatos.',
          }}
          empty={{ icone: 'relogio', ...WITHOUT_CONVERSATIONS }}
          colunas={[
            { cabeca: 'Nome', negrito: true },
            { cabeca: 'Recorrência', largura: '120px', centro: true, negrito: true },
            { cabeca: 'Telefone', centro: true },
          ]}
          linhas={recorrencia.maisRecorrentes.map((r) => [
            r.nome,
            String(r.recorrencia),
            r.telefone ?? '-',
          ])}
          abrir
        />
      </div>
    </div>
  );
}

/** `DR`: papel surface-3, título sem margem, descrição fs-16 e o número fs-24. */
function CardAzul(props: {
  titulo: string;
  texto: string;
  value: string;
  indicador?: ReactNode;
}) {
  return (
    <div className="da-papel da-cartao-azul">
      <SectionTitulo semMargem>{props.titulo}</SectionTitulo>
      <div className="da-cartao-azul-corpo">
        <p className="da-t16">{props.texto}</p>
        <div className="da-cartao-azul-valor">
          <span className="da-linha">
            <span className="da-t24 da-extra da-mr5">{props.value}</span>
            {props.indicador}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * `DT`: o papel com título, descrição, botão de CSV e a tabela numerada ("1º"
 * num círculo de 32px). A tabela rola dentro de `altura` (150px por padrão,
 * 288px nas listas de blocos). `abrir` é a coluna do `external-file` do
 * `onItemClick` — na origem abre o contato no módulo Contatos, que o Pipe não
 * tem: o ícone fica, sem destino.
 */
function Ranking(props: {
  titulo: string;
  dica: string;
  description: ReactNode;
  csv?: { travado: boolean; dica: string };
  empty: { icone: NomeDeIconePortal; titulo: string; texto: string };
  colunas: { cabeca: string; largura?: string; centro?: boolean; negrito?: boolean }[];
  linhas: ReactNode[][];
  altura?: string;
  abrir?: boolean;
}) {
  return (
    <div className="da-papel da-ranking">
      <div className="da-ranking-cabeca">
        <div className="da-ranking-titulos">
          <SectionTitulo dica={props.dica}>{props.titulo}</SectionTitulo>
          <p className="da-t16">{props.description}</p>
        </div>
        {props.csv ? <BotaoCsv {...props.csv} /> : null}
      </div>
      {props.linhas.length ? (
        <table className="da-ranking-tabela">
          <thead>
            <tr>
              <th style={{ width: '62px' }} />
              {props.colunas.map((c) => (
                <th
                  key={c.cabeca}
                  style={{ width: c.largura, textAlign: c.centro ? 'center' : 'left' }}
                >
                  <span className="da-t14 da-negrito">{c.cabeca}</span>
                </th>
              ))}
              <th style={{ width: props.abrir ? '62px' : '24px' }} />
            </tr>
          </thead>
          <tbody style={{ maxHeight: props.altura ?? '150px' }}>
            {props.linhas.map((linha, i) => (
              <tr key={i}>
                <td style={{ width: '62px' }}>
                  <span className="da-posicao">
                    <span className="da-t14 da-negrito">{i + 1}º</span>
                  </span>
                </td>
                {linha.map((celula, j) => (
                  <td
                    key={j}
                    style={{
                      width: props.colunas[j]?.largura,
                      textAlign: props.colunas[j]?.centro ? 'center' : 'left',
                      fontWeight: props.colunas[j]?.negrito ? 700 : undefined,
                    }}
                  >
                    {celula}
                  </td>
                ))}
                {props.abrir ? (
                  <td style={{ width: '62px', textAlign: 'center' }}>
                    <IconePortal nome="abrir-arquivo" tamanho={24} className="da-abrir" />
                  </td>
                ) : (
                  <th style={{ width: '24px' }} />
                )}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="da-ranking-vazio">
          <WithoutData {...props.empty} />
        </div>
      )}
    </div>
  );
}

/* =========================================================== Mensagens */

/** `xR`: barras de participação 20% · cartões 25% · linhas 30% · médias 25%. */
function SectionMessages(p: PropsDoDashboard & { cmp: Comparison }) {
  const { messages, contacts } = p.data;
  const enviadas = messages.enviadas.atual;
  const recebidas = messages.recebidas.atual;
  const total = enviadas + recebidas;
  const totalAntes = messages.enviadas.anterior + messages.recebidas.anterior;
  /* `AS()`: fração da parte no total, zero quando não há total. */
  const parte = (v: number) => (v === 0 ? 0 : v / total);
  const media = (v: number, c: number) => (c ? v / c : 0);
  const mediaRec = media(recebidas, contacts.withInteraction.atual);
  const mediaEnv = media(enviadas, contacts.withInteraction.atual);
  const tudoZero = total === 0;

  return (
    <section className="da-papel da-mensagens">
      <div className="da-secao-cabeca">
        <div className="da-secao-titulos">
          <div style={{ width: '80%' }}>
            <SectionTitulo dica="Mensagens são todos os conteúdos trocados entre o chatbot e seus contatos.">
              Mensagens
            </SectionTitulo>
          </div>
          <p className="da-t16 da-apagado">
            Métricas sobre as mensagens recebidas e enviadas pelo seu chatbot
          </p>
        </div>
        <BotaoCsv
          travado={tudoZero}
          dica={tudoZero ? WITHOUT_INFORMATION : 'Baixar dados de Mensagens em csv.'}
        />
      </div>

      <div className="da-mensagens-corpo">
        <div className="da-mensagens-coluna" style={{ width: '20%' }}>
          <ParticipationBarras
            barras={[
              { rotulo: 'Enviadas', cor: 'da-cor-oceano', fraction: parte(enviadas) },
              { rotulo: 'Recebidas', cor: 'da-cor-azul', fraction: parte(recebidas) },
            ]}
          />
        </div>
        <div className="da-mensagens-coluna" style={{ width: '25%' }}>
          <CardStriped
            titulo="Total de mensagens trafegadas"
            dica="Soma das mensagens enviadas e recebidas pelo chatbot."
            value={formatar(total)}
            cor="da-borda-marca"
            sombra
            variation={{ value: variation(total, totalAntes), cmp: p.cmp }}
          />
          <MessageMetric
            tipo="enviada"
            titulo="Mensagens enviadas"
            value={enviadas}
            variation={variation(enviadas, messages.enviadas.anterior)}
            cmp={p.cmp}
          />
          <MessageMetric
            tipo="recebida"
            titulo="Mensagens recebidas"
            value={recebidas}
            variation={variation(recebidas, messages.recebidas.anterior)}
            cmp={p.cmp}
          />
        </div>
        <div className="da-mensagens-coluna" style={{ width: '30%' }}>
          <GraficoDeLinhas
            titulo="Volume de mensagens no período"
            rotulos={messages.byDia.map((d) => diaCurto(d.dia))}
            series={[
              {
                rotulo: 'Mensagens enviadas',
                cor: 'da-cor-oceano',
                values: messages.byDia.map((d) => d.enviadas),
              },
              {
                rotulo: 'Mensagens recebidas',
                cor: 'da-cor-azul',
                values: messages.byDia.map((d) => d.recebidas),
              },
            ]}
          />
        </div>
        <div className="da-mensagens-coluna" style={{ width: '25%' }}>
          <CardStriped
            titulo="Média de mensagens recebidas"
            dica="Média de mensagens que seu chatbot recebeu de cada contato que interagiu com ele."
            value={formatar(mediaRec)}
            cor="da-borda-marca"
            variation={{
              value: variation(
                mediaRec,
                media(messages.recebidas.anterior, contacts.withInteraction.anterior),
              ),
              cmp: p.cmp,
            }}
          />
          <CardStriped
            titulo="Média de mensagens enviadas"
            dica="Média de mensagens que seu chatbot enviou para cada contato que interagiu com ele."
            value={formatar(mediaEnv)}
            cor="da-borda-oceano"
            variation={{
              value: variation(
                mediaEnv,
                media(messages.enviadas.anterior, contacts.withInteraction.anterior),
              ),
              cmp: p.cmp,
            }}
          />
        </div>
      </div>
    </section>
  );
}

/** `iR`: o círculo de 32px com `message-sent`/`message-received`, rótulo fs-12 e número fs-20. */
function MessageMetric(props: {
  tipo: 'enviada' | 'recebida';
  titulo: string;
  value: number;
  variation: number | undefined;
  cmp: Comparison;
}) {
  return (
    <div className="da-metrica">
      <span
        className={
          props.tipo === 'enviada'
            ? 'da-metrica-icone da-cor-fundo-oceano'
            : 'da-metrica-icone da-cor-fundo-marca'
        }
      >
        <IconePortal
          nome={props.tipo === 'enviada' ? 'mensagem-enviada' : 'mensagem-recebida'}
          tamanho={20}
        />
      </span>
      <div className="da-metrica-textos">
        <span className="da-t12 da-negrito da-mr5">{props.titulo}</span>
        <span className="da-metrica-valor">
          <span className="da-t20 da-extra da-mr8">{formatar(props.value)}</span>
          <Indicador value={props.variation} variante="escuro" cmp={props.cmp} />
        </span>
      </div>
    </div>
  );
}

/* ============================================================== Canais */

/**
 * `OE`. A linha do canal e a de "Totais" são o `zE` e o `PE` do `iN`; o Pipe
 * liga UM canal por contato, então as duas trazem os mesmos números. Sem
 * contato no período a origem recebe a lista vazia e desenha o vazio.
 * "Mensagens ativas enviadas" é "-": o bot do Pipe não manda mensagem ativa
 * (ver `carregarMensagensAtivas`).
 */
function SectionChannels(p: PropsDoDashboard & { cmp: Comparison }) {
  const { contacts, recorrencia, channel } = p.data;
  const total = contacts.total.atual;
  const com = contacts.withInteraction.atual;
  const comAntes = contacts.withInteraction.anterior;
  const taxa = (a: number, b: number) => (b ? a / b : undefined);
  const celulas = [
    { chave: 'Contatos com interação', value: formatar(com), var: variation(com, comAntes) },
    {
      chave: 'Taxa de interação',
      valor: formatar(taxa(com, total), { percentual: true, padrao: '0%' }),
      var: variation(taxa(com, total), taxa(comAntes, contacts.total.anterior)),
    },
    {
      chave: 'Contatos que não responderam',
      valor: formatar(total - com),
      var: variation(total - com, contacts.total.anterior - comAntes),
    },
    {
      chave: 'Taxa de rejeição',
      valor: formatar(total ? 1 - com / total : undefined, { percentual: true, padrao: '0%' }),
      var: variation(
        total ? 1 - com / total : undefined,
        contacts.total.anterior ? 1 - comAntes / contacts.total.anterior : undefined,
      ),
    },
    { chave: 'Mensagens ativas enviadas', valor: '-', var: undefined },
    {
      chave: 'Taxa de recorrência',
      valor: formatar(taxa(recorrencia.contacts.atual, total), { percentual: true, padrao: '0%' }),
      var: variation(recorrencia.contacts.atual, recorrencia.contacts.anterior),
    },
  ];
  const linhas = total > 0 ? [channel ?? '-', 'Totais'] : [];

  return (
    <section className="da-papel da-canais">
      <div className="da-secao-cabeca">
        <div className="da-canais-titulos">
          <SectionTitulo dica="Canais de conversa nos quais o seu chatbot está conectado.">
            Canais
          </SectionTitulo>
          <p className="da-t16 da-mr5">
            Um zoom na sua performance em cada canal de conversa no periodo selecionado
          </p>
        </div>
      </div>
      <div className="da-canais-corpo">
        {linhas.length ? (
          <table className="da-canais-tabela">
            <thead>
              <tr>
                <th />
                {celulas.map((c) => (
                  <th key={c.chave}>{c.chave}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((nome) => (
                <tr key={nome}>
                  <td>{nome}</td>
                  {celulas.map((c) => (
                    <td key={c.chave}>
                      {c.value}
                      <Indicador value={c.var} variante="transparente" cmp={p.cmp} semDica />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <WithoutData icone="relogio" {...WITHOUT_CONVERSATIONS} />
        )}
      </div>
    </section>
  );
}

/* ================================================ Fluxo conversacional */

/**
 * `Yw`. O `isDisabled` que decide o vazio é o `Z` do `iN`: verdadeiro quando
 * TODO número da resposta é zero (`PR`) — aí a origem diz que os dados "estão
 * sendo processados". Botão de CSV desligado pela flag
 * `is-displaying-dashboard-csv-download-conversional-flow-button`.
 */
function SectionFlow(p: PropsDoDashboard & { cmp: Comparison }) {
  const { flow } = p.data;
  const total = flow.total.atual;
  const retidos = total - flow.transbordo.atual;
  const retidosAntes = flow.total.anterior - flow.transbordo.anterior;
  const tudoZero = total === 0 && flow.transbordo.atual === 0;
  return (
    <section className="da-papel da-fluxo">
      <div className="da-secao-cabeca">
        <div className="da-canais-titulos">
          <SectionTitulo dica="Fluxo conversacional é a jornada pela qual seus contatos passam durante as conversas com seu chatbot.">
            Fluxo Conversacional
          </SectionTitulo>
          <p className="da-t16 da-mr5">
            Indicadores sobre a performance do seu fluxo de conversas.
          </p>
        </div>
      </div>
      {tudoZero ? (
        <WithoutData
          icone="relogio"
          titulo="Os dados do seu fluxo conversacional estão sendo processados..."
          texto="Por favor, aguarde até 24 horas. Fluxos conversacionais maiores podem ter um tempo de processamento maior."
        />
      ) : (
        <div className="da-fluxo-corpo">
          <ColumnsCard
            titulo="Contatos em transbordo"
            cor="da-borda-rosa"
            dica="Contatos em transbordo são aqueles que foram transferidos para atendimento humano, ou seja, que saíram do fluxo do chatbot."
            cmp={p.cmp}
            values={[
              {
                texto: 'Taxa de transbordo',
                value: formatar(total ? flow.transbordo.atual / total : undefined, {
                  percentual: true,
                }),
              },
              {
                texto: 'Total de contatos em transbordo',
                value: formatar(flow.transbordo.atual),
                variation: variation(flow.transbordo.atual, flow.transbordo.anterior),
              },
            ]}
          />
          <ColumnsCard
            titulo="Contatos em retenção"
            cor="da-borda-amarela"
            dica="Contatos em retenção são aqueles que permaneceram no fluxo do chatbot e não precisaram ser transferidos para atendimento humano."
            cmp={p.cmp}
            values={[
              {
                texto: 'Taxa de retenção de contatos no fluxo',
                value: formatar(total ? retidos / total : undefined, { percentual: true }),
              },
              {
                texto: 'Total de retenção de contatos no fluxo',
                value: formatar(retidos),
                variation: variation(retidos, retidosAntes),
              },
            ]}
          />
          <ColumnsCard
            titulo="Contatos em exceção"
            cor="da-borda-azul"
            dica="São os contatos que enviaram mensagens que não foram compreendidas pelo chatbot e, portanto, caíram em exceção."
            cmp={p.cmp}
            values={[
              { texto: 'Taxa de contatos em exceção', value: '-' },
              /* Sem `variacao`: o `Vw` só desenha o indicador quando ela existe. */
              { texto: 'Total de contatos em exceção', value: '-' },
            ]}
          />
        </div>
      )}
    </section>
  );
}

/** `Vw`: 139px de altura, fio de 2px na cor da métrica, valores lado a lado. */
function ColumnsCard(props: {
  titulo: string;
  cor: string;
  dica: string;
  cmp: Comparison;
  values: { texto: string; value: string; variation?: number }[];
}) {
  return (
    <div className="da-colunas">
      <div className={`da-colunas-fio ${props.cor}`}>
        <div className="da-colunas-cabeca">
          <span className="da-t12 da-negrito da-mr8">{props.titulo}</span>
          <Dica texto={props.dica} position="bottom-center">
            <IconePortal nome="informacao-cheia" tamanho={16} />
          </Dica>
        </div>
        <div className="da-colunas-valores">
          {props.values.map((v) => (
            <div key={v.texto} className="da-colunas-valor">
              <span className="da-linha">
                <span className="da-t24 da-extra da-mr8">{v.value}</span>
                {'variacao' in v ? (
                  <Indicador value={v.variation} variante="claro" cmp={props.cmp} />
                ) : null}
              </span>
              <p className="da-t10">{v.texto}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================================================================ Blocos */

/**
 * `WT`: as duas listas lado a lado (`bds-grid gap="2"`), 288px de rolagem. O
 * "Clique aqui" abre o Dicionário de Dados em outra aba, no item "Lista de
 * blocos" — a URL da origem é `/analytics/dataDictionary?path=dashboard:listOfBlocks`.
 * No roteador o nome do bloco é texto; no fluxo, link para o Builder.
 */
function SectionBlocks(p: PropsDoDashboard) {
  const dictionary = `${contactBase(p.data.router ? 'roteador' : 'fluxo', p.id)}/analise/dicionario-de-dados?path=dashboard:listOfBlocks`;
  const description = (flow: string, router: string, fim: string) => (
    <>
      {p.data.router ? router : flow}{' '}
      <a className="da-link" href={dictionary} target="_blank" rel="noreferrer">
        Clique aqui
      </a>{' '}
      {fim}
    </>
  );
  const empty = {
    icone: 'nao-gostei' as const,
    titulo: 'Não há dados disponíveis para este período.',
    texto: 'Eles aparecerão aqui assim que o chatbot registrar dados dos últimos 7 dias.',
  };
  const colunas = [
    { cabeca: 'Nome do bloco', negrito: true },
    { cabeca: 'Total de eventos', largura: '120px', centro: true },
  ];
  const nome = (n: string) =>
    p.data.router ? (
      n
    ) : (
      <a className="da-link" href="/builder" target="_blank" rel="noreferrer">
        {n}
      </a>
    );
  return (
    <div className="da-blocos">
      <Ranking
        titulo="Blocos com mais exceção"
        dica="Exceções ocorrem quando o fluxo conversacional esperado é interrompido. Em cada bloco do seu chatbot, é possível configurar as condições da saída para o bloco de exceções."
        description={description(
          'Esses são os blocos que mais tiveram contatos direcionados ao bloco de exceções. Clique em cada um deles para vê-los no Builder.',
          'Esses são os blocos que mais tiveram contatos direcionados ao bloco de exceções dos chatbots conectados a este router.',
          'para entender como analisar as mensagens que ocasionaram essas exceções.',
        )}
        empty={empty}
        colunas={colunas}
        linhas={p.data.blocksException.map((b) => [nome(b.nome), formatar(b.total)])}
        altura="288px"
      />
      <Ranking
        titulo="Blocos com mais transbordo"
        dica="Transbordo é a ação de redirecionar contatos do atendimento automatizado para o atendimento humano. Nesta lista, você confere o número de vezes (eventos) que os contatos foram transbordados."
        description={description(
          'Esses são os blocos que mais tiveram contatos direcionados para atendimento humano. Clique em cada um deles para vê-los no Builder.',
          'Esses são os blocos dos subbots que mais tiveram contatos direcionados para atendimento humano.',
          'para ler mais dicas e insights sobre transbordo.',
        )}
        empty={empty}
        colunas={colunas}
        linhas={p.data.blocosTransbordo.map((b) => [nome(b.nome), formatar(b.total)])}
        altura="288px"
      />
    </div>
  );
}

/* ============================================================ a barra lateral */

/**
 * `uw`: o véu de tela cheia com a coluna de 416px encostada à direita —
 * cabeçalho escuro "Número de Contatos" com o fechar, a faixa surface-3 com o
 * título do cartão, "v1 (v2 contatos)" e "Exportar lista", e a lista rolável.
 * Fechar é voltar à URL sem `contatos`.
 *
 * ponytail: lá o `top` do véu é medido por JavaScript abaixo da barra do
 * portal; aqui ele cobre a tela desde o topo.
 */
function ContactsBarra(p: PropsDoDashboard & { lista: NonNullable<PropsDoDashboard['lista']> }) {
  const { contacts } = p.data;
  const total = contacts.total.atual;
  const com = contacts.withInteraction.atual;
  const interaction = p.lista.tipo === 'interacao';
  const taxa = total ? (interaction ? com / total : 1 - com / total) : undefined;
  const fechar = query(p);
  return (
    <div className="da-veu">
      <a className="da-veu-fundo" href={fechar} aria-label="Fechar" />
      <div className="da-lateral-cabeca">
        <p className="da-t16">Número de Contatos</p>
        <a className="da-botao da-botao--curto da-botao--branco" href={fechar} aria-label="Fechar">
          <IconePortal nome="fechar" tamanho={24} />
        </a>
      </div>
      <div className="da-papel da-lateral">
        <div className="da-papel da-lateral-sub">
          <div className="da-lateral-sub-coluna">
            <div className="da-lateral-sub-titulo">
              <IconePortal nome="canais" tamanho={24} />
              <span className="da-t16 da-negrito">
                {interaction ? 'Taxa de interação' : 'Taxa de rejeição'}
              </span>
            </div>
            <span className="da-t14 da-lateral-sub-dado">
              {`${formatar(taxa, { percentual: true, padrao: '0%' })} (${interaction ? com : total - com} contatos)`}
            </span>
          </div>
          <div className="da-lateral-sub-coluna">
            <Dica texto="Limitado aos 1000 contatos mais recentes" position="left-center">
              <button type="button" className="da-botao da-botao--curto da-botao--terciario">
                <IconePortal nome="baixar" tamanho={24} />
                Exportar lista
              </button>
            </Dica>
          </div>
        </div>
        <div className="da-lateral-lista">
          {p.lista.nomes.map((n, i) => (
            <div key={`${n}-${i}`} className="da-papel da-lateral-item">
              <span className="da-t14">{n}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
