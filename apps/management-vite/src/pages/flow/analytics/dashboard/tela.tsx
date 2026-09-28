import type { ReactNode } from 'react';
import { IconePortal, type NomeDeIconePortal } from '../../../../components/icones-portal';
import {
  PERIODOS_DE_CALENDARIO,
  PERIODOS_FIXOS,
  LABEL_OF_PERIOD,
  comparison,
  diaCurto,
  escalaDoEixo,
  formatar,
  rotuloDoIntervalo,
  variation,
  type DashboardData,
  type Intervalo,
  type Period,
} from '@pipe/core/analytics';
import { contactBase } from '../../contact';
import { PeriodCustom } from './period-custom';

/**
 * The Dashboard core — the `iN` of `portal-fragment-analytics`
 * (`analytics-main.js`, line ~59539), which the portal mounts with
 * `<analytics-mfe page="dashboard">`.
 *
 * Only receives props: that's what lets it render the filled-in state without a
 * database. Section order matches `iN`, with the test router's flags
 * (LaunchDarkly): Contatos · Recorrência
 * (`is-displaying-recurrence-section`) · Mensagens · Canais
 * (`is-displaying-dashboard-analytics-channel-section`) · Fluxo conversacional
 * (`is-displaying-conversational-flow-section`) · Lista de blocos
 * (`is-displaying-block-listing-section`). The top "Download" button is OFF there
 * (`is-displaying-analytics-dashboard-download-button` = false), which is why it
 * doesn't exist here.
 *
 * The source's charts are chart.js; here they're SVG + CSS, the minimum that
 * recreates the look (`GraficoDeLinhas`, `BarrasDeParticipacao`), without a new
 * dependency.
 */

export interface PropsDoDashboard {
  id: string;
  period: Period;
  intervalo: Intervalo;
  hoje: string;
  data: DashboardData;
  /**
   * Whether the sidebar is open (`isDisplayingContactsSidebar`), with the list
   * already loaded.
   */
  lista: { type: 'interacao' | 'rejeicao'; nomes: string[] } | null;
  /**
   * Período em React state (D-30, `std/nav-contract.md` §Gestão): os chips e
   * o "De/Até" personalizado chamam esta função em vez de navegar para
   * `?periodo=`. `undefined` (sem consumidor state) mantém o `href` como
   * fallback de navegação — não deveria acontecer em produção.
   */
  aoMudarPeriodo?: (period: Period, custom?: { de: string; ate: string }) => void;
}

/** What the URL carries between one click and the next: the period. */
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
        {/* `nN`: title on the left, `aN` (buttons, 12 gap) on the right. */}
        <div className="da-cabecalho">
          <div>
            <h1 className="da-t32 da-negrito da-margem">Dashboard</h1>
            <p className="da-t16">{rotuloDoIntervalo(p.intervalo)}</p>
          </div>
          <div className="da-buttons">
            {/* `Le icon="refresh" variant="secondary"`: refaz o pedido com o mesmo filtro. */}
            <a className="da-botao da-botao--secundario" href={query(p)}>
              <IconePortal nome="atualizar" tamanho={24} />
              Atualizar
            </a>
          </div>
        </div>

        <SectionContacts {...p} cmp={cmp} />
        <SectionRecurrence {...p} cmp={cmp} />
        <SectionMessages {...p} cmp={cmp} />
        <SectionChannels {...p} cmp={cmp} />
        <SectionFlow {...p} cmp={cmp} />
        <SectionBlocks {...p} />
      </div>

      {p.lista ? <ContactsBar {...p} lista={p.lista} /> : null}
    </div>
  );
}

interface Comparison {
  dica: string;
  fora: boolean;
}

/* =============================================================== o filtro */

/**
 * `xT` (the `ST` of `iN`): the full-width light strip, with a shadow underneath and
 * rounded bottom corners (`bT`). The active chip is `color="default"`, the others
 * `outline`; size `tall` (40px). The second row is behind the
 * `is-displaying-dashboard-fixed-period-chips` flag.
 */
function PeriodFilter(p: PropsDoDashboard) {
  const chip = (nome: keyof typeof LABEL_OF_PERIOD) => (
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
      <span className="da-chip-texto">{LABEL_OF_PERIOD[nome]}</span>
    </a>
  );
  return (
    <div className="da-filter">
      <div className="da-filter-core">
        {/* `mT`: fs-20 bold label and the solid `info` tooltip icon. */}
        <div className="da-filter-label">
          <span className="da-t20 da-negrito">Selecione o período</span>
          <Dica
            position="bottom-center"
            texto="A análise será referente ao período selecionado e a comparação será feita com base no mesmo período anterior (ex: semana atual e semana anterior)."
          >
            <IconePortal nome="informacao-cheia" tamanho={24} />
          </Dica>
        </div>
        {/* `fT` com as duas `gT`. */}
        <div className="da-filter-chips">
          <div className="da-filter-row">{PERIODOS_FIXOS.map(chip)}</div>
          <div className="da-filter-row">{PERIODOS_DE_CALENDARIO.map(chip)}</div>
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



type Position = 'bottom-center' | 'left-center' | 'left-bottom' | 'top-right';

/** `bds-tooltip`: dark balloon, 8 radius and 8 padding, fs-12 text, 6px arrow. */
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
 * `XS`, the comparison indicator: arrow + whole-number signed variation. No number
 * ("-") means no arrow. `semDica` is the channel table's `hideTooltip`.
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

/**
 * `kE`: fs-24 bold title (with the typo's 22px margin) and the solid `info`
 * tooltip icon.
 */
function SectionTitle({
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
 * `wS`: the icon-only button that downloads the section's CSV, with the tooltip on
 * the left.
 * ponytail: Pipe doesn't generate these CSVs; the button has the source's look and
 * state (locked when there's no data), with no action — when it exists, it's a
 * route handler in this folder using the same query as `lib/analise.ts`.
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

/**
 * `mE`: the section's empty state — 80px icon, fs-16 bold title, fs-14 semi-bold
 * text.
 */
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
    <div className="da-empty">
      <IconePortal nome={icone} tamanho={80} className="da-empty-icon" />
      <p className="da-t16 da-negrito da-empty-title">{titulo}</p>
      <p className="da-t14 da-semi da-empty-text">{texto}</p>
    </div>
  );
}

const WITHOUT_CONVERSATIONS = {
  titulo: 'Inicie conversas para acompanhar a performance do seu chatbot!',
  texto:
    'Assim que o chatbot começar a trocar algumas mensagens com seus contatos, todos os dados que você precisa para evoluir seu contato inteligente aparecerão aqui no Dashboard.',
};
const WITHOUT_INFORMATION = 'Não há informações para baixar.';



/** The value axis ticks: the same chart.js scale that Mensagens ativas uses. */
const escala = (maximo: number) => escalaDoEixo(maximo).tiques;

/**
 * `n_`: the line chart for the Contatos and Mensagens sections — legend below with
 * a 7px dot, no gridlines, axis starting at zero, 3px line with no point
 * (`pointRadius: 0`), bold 14 title left-aligned when present.
 *
 * ponytail: chart.js rotates the x-axis label before skipping; here it only skips
 * (at most 8 labels), without rotating.
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
 * `QT`: two horizontal bars in a single category, 8 radius, the value in "%"
 * (`Math.round(100 * v)`) at 24px to the right of the tip, and the right-side gap
 * growing from 50 to 80px with the largest value (`PT`).
 */
function ParticipationBars({
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
            <span className="da-bar-value">{` ${Math.round(100 * b.fraction)}%`}</span>
          </div>
        ))}
      </div>
      <Legenda itens={barras} />
    </div>
  );
}

/* =========================================================== Contatos */

/**
 * `I_`. With `is-using-contacts-section-identity-quantity-route` on, the totals
 * come from the quantity routes (`engaged-identity-quantity` and
 * `active-identity-quantity`), and the rates are derived from them: interaction =
 * engaged ÷ total; bounce = 1 − interaction.
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
    <section className="da-paper da-contacts">
      <div className="da-section-header">
        <div className="da-section-titles">
          <SectionTitle dica="Contatos são todas as pessoas que receberam e/ou enviaram mensagens para o seu chatbot.">
            Contatos
          </SectionTitle>
          <p className="da-t16">
            Acompanhe as métricas relativas aos contatos que conversaram com o seu chatbot.
          </p>
        </div>
        {/* `isDisabled: A` — and `iN`'s `A` never leaves `false`. */}
        <BotaoCsv travado={false} dica="Baixar dados de Contatos em csv." />
      </div>

      <div className="da-contacts-body">
        {/* `O_` 30% (`#paperCard`): the dark total card and two light ones. */}
        <div className="da-column" style={{ width: '30%' }}>
          <div className="da-paper da-card-dark">
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
          <CardLight
            titulo="Contatos que não responderam"
            dica="É a quantidade de contatos únicos que não responderam a nenhuma mensagem enviada pelo chatbot e não iniciaram nenhuma conversa no período selecionado."
            value={semResposta}
            variation={variation(semResposta, semRespostaAntes)}
            cmp={p.cmp}
          />
          <CardLight
            titulo="Contatos com interação"
            dica="É a quantidade de contatos únicos que realizaram alguma interação com seu chatbot no período selecionado, seja iniciando uma conversa ou respondendo a uma mensagem enviada."
            value={com}
            variation={variation(com, comAntes)}
            cmp={p.cmp}
          />
        </div>

        <div className="da-column" style={{ width: '45%' }}>
          <GraficoDeLinhas
            rotulos={contacts.byDay.map((d) => diaCurto(d.dia))}
            series={[
              {
                rotulo: 'Contatos com interação',
                cor: 'da-cor-oceano',
                values: contacts.byDay.map((d) => d.withInteraction),
              },
              {
                rotulo: 'Contatos que não responderam',
                cor: 'da-cor-cinza',
                values: contacts.byDay.map((d) => d.total - d.withInteraction),
              },
            ]}
          />
        </div>

        <div className="da-column" style={{ width: '25%' }}>
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

/**
 * `c_`: fs-24 extra-bold number with the dark indicator and tooltip; fs-12 label
 * underneath.
 */
function CardLight(props: {
  titulo: string;
  dica: string;
  value: number;
  variation: number | undefined;
  cmp: Comparison;
}) {
  return (
    <div className="da-paper da-card-light">
      <div className="da-card-light-top">
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
 * `__`: the card with a colored line under the number. With
 * `is-displaying-list-contacts-button`, `external-file` opens the sidebar —
 * locked (`not-allowed`) when there's no contact.
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



/** `BR`: two `DR` on the left and the `DT` table of most recurrent on the right. */
function SectionRecurrence(p: PropsDoDashboard & { cmp: Comparison }) {
  const { recorrencia, contacts } = p.data;
  const taxa = contacts.total.atual ? recorrencia.contacts.atual / contacts.total.atual : undefined;
  const tudoZero = recorrencia.contacts.atual === 0 && recorrencia.maisRecorrentes.length === 0;
  return (
    <div className="da-recorrencia">
      <div className="da-meia">
        <CardBlue
          titulo="Taxa de recorrência"
          texto="Taxa de contatos únicos que interagiram com seu chatbot 2 ou mais vezes em intervalos de 24h"
          value={formatar(taxa, { percentual: true, padrao: '0%' })}
        />
        <CardBlue
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

/** `DR`: surface-3 card, title with no margin, fs-16 description, and fs-24 number. */
function CardBlue(props: {
  titulo: string;
  texto: string;
  value: string;
  indicador?: ReactNode;
}) {
  return (
    <div className="da-paper da-card-blue">
      <SectionTitle semMargem>{props.titulo}</SectionTitle>
      <div className="da-card-blue-body">
        <p className="da-t16">{props.texto}</p>
        <div className="da-card-blue-value">
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
 * `DT`: the card with title, description, CSV button, and the numbered table ("1º"
 * in a 32px circle). The table scrolls within `altura` (150px by default, 288px in
 * block listings). `abrir` is the `external-file` column from `onItemClick` — in
 * the source it opens the contact in the Contacts module, which Pipe doesn't have:
 * the icon stays, with no destination.
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
    <div className="da-paper da-ranking">
      <div className="da-ranking-cabeca">
        <div className="da-ranking-titulos">
          <SectionTitle dica={props.dica}>{props.titulo}</SectionTitle>
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
                  <span className="da-position">
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
        <div className="da-ranking-empty">
          <WithoutData {...props.empty} />
        </div>
      )}
    </div>
  );
}

/* =========================================================== Mensagens */

/** `xR`: participation bars 20% · cards 25% · lines 30% · averages 25%. */
function SectionMessages(p: PropsDoDashboard & { cmp: Comparison }) {
  const { messages, contacts } = p.data;
  const enviadas = messages.enviadas.atual;
  const recebidas = messages.recebidas.atual;
  const total = enviadas + recebidas;
  const totalAntes = messages.enviadas.anterior + messages.recebidas.anterior;
  /* `AS()`: the part's fraction of the total, zero when there's no total. */
  const parte = (v: number) => (v === 0 ? 0 : v / total);
  const media = (v: number, c: number) => (c ? v / c : 0);
  const mediaRec = media(recebidas, contacts.withInteraction.atual);
  const mediaEnv = media(enviadas, contacts.withInteraction.atual);
  const tudoZero = total === 0;

  return (
    <section className="da-paper da-messages">
      <div className="da-section-header">
        <div className="da-section-titles">
          <div style={{ width: '80%' }}>
            <SectionTitle dica="Mensagens são todos os conteúdos trocados entre o chatbot e seus contatos.">
              Mensagens
            </SectionTitle>
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

      <div className="da-messages-body">
        <div className="da-messages-column" style={{ width: '20%' }}>
          <ParticipationBars
            barras={[
              { rotulo: 'Enviadas', cor: 'da-cor-oceano', fraction: parte(enviadas) },
              { rotulo: 'Recebidas', cor: 'da-cor-azul', fraction: parte(recebidas) },
            ]}
          />
        </div>
        <div className="da-messages-column" style={{ width: '25%' }}>
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
        <div className="da-messages-column" style={{ width: '30%' }}>
          <GraficoDeLinhas
            titulo="Volume de mensagens no período"
            rotulos={messages.byDay.map((d) => diaCurto(d.dia))}
            series={[
              {
                rotulo: 'Mensagens enviadas',
                cor: 'da-cor-oceano',
                values: messages.byDay.map((d) => d.enviadas),
              },
              {
                rotulo: 'Mensagens recebidas',
                cor: 'da-cor-azul',
                values: messages.byDay.map((d) => d.recebidas),
              },
            ]}
          />
        </div>
        <div className="da-messages-column" style={{ width: '25%' }}>
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

/**
 * `iR`: the 32px circle with `message-sent`/`message-received`, fs-12 label, and
 * fs-20 number.
 */
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
        <span className="da-metric-value">
          <span className="da-t20 da-extra da-mr8">{formatar(props.value)}</span>
          <Indicador value={props.variation} variante="escuro" cmp={props.cmp} />
        </span>
      </div>
    </div>
  );
}

/* ============================================================== Canais */

/**
 * `OE`. The channel row and the "Totais" row are `iN`'s `zE` and `PE`; Pipe
 * connects ONE channel per contact, so both bring the same numbers. With no
 * contact in the period the source gets an empty list and renders the empty state.
 * "Mensagens ativas enviadas" is "-": Pipe's bot doesn't send active messages (see
 * `carregarMensagensAtivas`).
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
    <section className="da-paper da-channels">
      <div className="da-section-header">
        <div className="da-channels-titles">
          <SectionTitle dica="Canais de conversa nos quais o seu chatbot está conectado.">
            Canais
          </SectionTitle>
          <p className="da-t16 da-mr5">
            Um zoom na sua performance em cada canal de conversa no periodo selecionado
          </p>
        </div>
      </div>
      <div className="da-channels-body">
        {linhas.length ? (
          <table className="da-channels-table">
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
 * `Yw`. The `isDisabled` that decides the empty state is `iN`'s `Z`: true when
 * EVERY number in the response is zero (`PR`) — in that case the source says the
 * data "estão sendo processados". CSV button turned off by the
 * `is-displaying-dashboard-csv-download-conversional-flow-button` flag.
 */
function SectionFlow(p: PropsDoDashboard & { cmp: Comparison }) {
  const { flow } = p.data;
  const total = flow.total.atual;
  const retidos = total - flow.transbordo.atual;
  const retidosAntes = flow.total.anterior - flow.transbordo.anterior;
  const tudoZero = total === 0 && flow.transbordo.atual === 0;
  return (
    <section className="da-paper da-flow">
      <div className="da-section-header">
        <div className="da-channels-titles">
          <SectionTitle dica="Fluxo conversacional é a jornada pela qual seus contatos passam durante as conversas com seu chatbot.">
            Fluxo Conversacional
          </SectionTitle>
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
        <div className="da-flow-body">
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
              /* No `variacao`: `Vw` only draws the indicator when it exists. */
              { texto: 'Total de contatos em exceção', value: '-' },
            ]}
          />
        </div>
      )}
    </section>
  );
}

/** `Vw`: 139px tall, 2px line in the metric's color, values side by side. */
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
        <div className="da-columns-values">
          {props.values.map((v) => (
            <div key={v.texto} className="da-columns-value">
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
 * `WT`: the two side-by-side lists (`bds-grid gap="2"`), 288px of scroll. "Clique
 * aqui" opens the Data Dictionary in another tab, at the "Lista de blocos" item —
 * the source's URL is
 * `/analytics/dataDictionary?path=dashboard:listOfBlocks`. In the router the block
 * name is plain text; in the flow, a link to the Builder.
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
 * `uw`: the full-screen veil with the 416px column against the right edge — dark
 * header "Número de Contatos" with the close button, the surface-3 strip with the
 * card's title, "v1 (v2 contatos)" and "Exportar lista", and the scrollable list.
 * Closing means going back to the URL without `contatos`.
 *
 * ponytail: there the veil's `top` is measured by JavaScript below the portal bar;
 * here it covers the screen from the top.
 */
function ContactsBar(p: PropsDoDashboard & { lista: NonNullable<PropsDoDashboard['lista']> }) {
  const { contacts } = p.data;
  const total = contacts.total.atual;
  const com = contacts.withInteraction.atual;
  const interaction = p.lista.type === 'interacao';
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
      <div className="da-paper da-lateral">
        <div className="da-paper da-lateral-sub">
          <div className="da-side-sub-column">
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
          <div className="da-side-sub-column">
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
            <div key={`${n}-${i}`} className="da-paper da-lateral-item">
              <span className="da-t14">{n}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
