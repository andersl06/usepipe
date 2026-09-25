import { useSearchParams } from 'react-router-dom';
import Link from '../../../../componentes/link';
import { IconePortal } from '../../../../componentes/icones-portal';
import { PAGES, AboutData } from './paginas';
import './dicionario.css';

/**
 * Dicionário de dados da Análise do contato — a página `dataDictionary` do
 * `portal-fragment-analytics`, que o portal monta com
 * `<analytics-mfe page="dataDictionary" params="…">`.
 *
 * A régua é `cap6s/portalmfe/analytics-main.js`: o componente `iC` (a moldura),
 * o `HV` (o menu), o provedor `bV` (o estado) e uma função por página (`zN`,
 * `SU`, `lU`… ver `paginas.tsx`). Nada aqui lê banco: o dicionário da origem é
 * texto fixo no próprio bundle.
 *
 * ═══ O ESTADO MORA NA URL, COMO LÁ ═══
 *
 * O `bV` lê `params` no formato `secao:subsecao` — é o `?path=dashboard:listOfBlocks`
 * que o Dashboard da origem monta no link "Clique aqui" (`WT`, linha ~58787).
 * Aqui o mesmo `path` vira `searchParams`, e cada clique do menu é um link: sem
 * JavaScript de cliente. As chaves são as DELES, para o link do Dashboard valer.
 *
 * Duas divergências de comportamento, ambas por não ter estado de cliente:
 * - `?path=dashboard` sem subseção abre a página "Dashboard" (`vU`). Lá, ENTRAR
 *   pela URL assim deixa a página "Sobre dados" com o acordeão aberto; CLICAR na
 *   seção é que troca a página. Seguimos o clique, que é o caminho normal.
 * - Clicar de novo numa seção aberta, lá, fecha o acordeão mantendo a página
 *   (`handleSectionClick` alterna `selectedSection`). Aqui o link reabre.
 *   ponytail: sem estado de "fechado" na URL; entra um parâmetro se alguém sentir falta.
 */
interface Item {
  key: string;
  rotulo: string;
  /** `isActive` do `valuesItemMenu`: o inativo abre o alerta em vez de navegar. */
  ativo: boolean;
}

interface Section {
  key: string;
  titulo: string;
  /** `active` do `ZV`/`AV`: inativa ganha o selo "Em Breve" (`SV`). */
  active: boolean;
  /** Presente = acordeão (`AV`); ausente = item único (`ZV`). */
  itens?: readonly Item[];
}

/*
 * O menu `HV`, na ordem do JSX, com os rótulos pt de `BV` (seções) e
 * `TV.menuOne` (subseções). "Lista de blocos" existe porque a flag
 * `is-displaying-block-listing-section` do roteador é `true` (`hidden: !a`).
 */
const SECTIONS: readonly Section[] = [
  { key: 'aboutData', titulo: 'Sobre dados', active: true },
  {
    key: 'dashboard',
    titulo: 'Dashboard',
    active: true,
    itens: [
      { key: 'dateFilter', rotulo: 'Filtro de data', ativo: true },
      { key: 'comparisonIndicator', rotulo: 'Indicador de comparação', ativo: true },
      { key: 'contacts', rotulo: 'Contatos', ativo: true },
      { key: 'recurrence', rotulo: 'Recorrência', ativo: true },
      { key: 'messages', rotulo: 'Mensagens', ativo: true },
      { key: 'channels', rotulo: 'Canais (Em breve)', ativo: false },
      { key: 'conversationalFlow', rotulo: 'Fluxo conversacional', ativo: true },
      { key: 'listOfBlocks', rotulo: 'Lista de blocos', ativo: true },
      { key: 'frequentlyAskedQuestions', rotulo: 'Perguntas frequentes', ativo: true },
    ],
  },
  { key: 'overview', titulo: 'Visão Geral', active: false },
  { key: 'contactJourney', titulo: 'Jornada dos Contatos', active: false },
  { key: 'customReport', titulo: 'Relatórios Personalizados', active: false },
  {
    key: 'reportManager',
    titulo: 'Gerenciador de Relatórios',
    active: true,
    itens: [
      { key: 'activeMessages', rotulo: 'Mensagens ativas', ativo: true },
      { key: 'eventTracking', rotulo: 'Rastreamento de eventos', ativo: true },
      { key: 'chatbotUserMetrics', rotulo: 'Métricas de chatbot e usuários', ativo: true },
      { key: 'statusAttendants', rotulo: 'Status dos atendentes', ativo: true },
      { key: 'serviceMetrics', rotulo: 'Métricas de atendimento', ativo: true },
      { key: 'serviceHistory', rotulo: 'Histórico de atendimento', ativo: true },
    ],
  },
];

/** O `id` do alerta único; os itens inativos o abrem por `popovertarget`. */
const ALERTA = 'dd-alerta';

export function DictionaryPage() {
  const [search] = useSearchParams();
  const [pedida, subPedida] = (search.get('path') ?? '').split(':');
  /* O `mV` do `bV`: sem `path` (ou com lixo), a seção é "Sobre dados". */
  const section = SECTIONS.find((s) => s.active && s.key === pedida) ?? SECTIONS[0]!;
  const item = section.itens?.find((i) => i.ativo && i.key === subPedida);
  const Page = PAGES[item?.key ?? section.key] ?? AboutData;

  return (
    /* `nC` + `oC`: 60 em cima; coluna de 85%, entre 1024 e 2560, centrada. */
    <div className="dd-pagina">
      <div className="dd-coluna">
        {/* `bds-grid xxs=12` > `bds-typo fs-32 bold` (margem de typo fs-32: 22). */}
        <h1 className="dd-titulo">Dicionário de Dados</h1>

        {/* `rC`: o `bds-paper` com recheio de 10, menu à esquerda e a página ao
            lado (`aC`). */}
        <div className="dd-papel">
          <nav className="dd-menu" aria-label="Dicionário de dados">
            <div className="dd-menu-lista">
              {SECTIONS.map((s) =>
                s.itens ? (
                  <Acordeao
                    key={s.key}
                    section={s}
                    aberta={s.key === section.key}
                    selecionado={item?.key ?? null}
                  />
                ) : (
                  <ItemUnico key={s.key} section={s} aberta={s.key === section.key} />
                ),
              )}
            </div>
          </nav>

          <div className="dd-area">
            <Page />
          </div>
        </div>
      </div>

      <Alerta />
    </div>
  );
}

/* ------------------------------------------------------------------ peças */

/** A classe de cor do título: `open` (primária) na seção clicada, `active` no resto. */
function corDoTitulo(active: boolean, aberta: boolean) {
  if (!active) return '';
  return aberta ? 'dd-aberto' : 'dd-ativo';
}

/**
 * `ZV` — item de uma linha só: "Sobre dados" e os três "Em Breve". O ativo navega
 * (`handleSectionClick`); o inativo abre o alerta (`r(e => !e)`).
 */
function ItemUnico({ section, aberta }: { section: Section; aberta: boolean }) {
  const miolo = (
    <span className="dd-unico-linha">
      <span className={`dd-unico-titulo ${corDoTitulo(section.active, aberta)}`}>{section.titulo}</span>
      {section.active ? null : (
        <span className="dd-embreve">
          <span>Em Breve</span>
        </span>
      )}
    </span>
  );
  return section.active ? (
    <Link className="dd-unico" href={`?path=${section.key}`}>
      {miolo}
    </Link>
  ) : (
    <button type="button" className="dd-unico" popoverTarget={ALERTA}>
      {miolo}
    </button>
  );
}

/**
 * `AV` — o acordeão (`details.accordion` na origem). Fechado, o `max-height: 50px`
 * do `QV` só deixa o sumário à mostra; aqui fechado simplesmente não desenha os
 * itens. A seta é `arrow-down` aberto e `arrow-right` fechado (`WV`).
 */
function Acordeao({
  section,
  aberta,
  selecionado,
}: {
  section: Section;
  aberta: boolean;
  selecionado: string | null;
}) {
  const cor = corDoTitulo(section.active, aberta);
  return (
    <div className="dd-acordeao">
      <Link className="dd-acordeao-cabeca" href={`?path=${section.key}`}>
        <span className={`dd-acordeao-titulo ${cor}`}>{section.titulo}</span>
        <IconePortal
          nome={aberta ? 'baixo' : 'direita'}
          tamanho={24}
          className={`dd-acordeao-seta ${cor}`}
        />
      </Link>

      {aberta
        ? section.itens?.map((i) => {
            /* `wV`: bolinha da marca no item escolhido; `open` nele, `active` nos
               demais, e nenhuma das duas no inativo (fica fantasma). */
            const escolhido = i.ativo && i.key === selecionado;
            const miolo = (
              <>
                <span className="dd-sub-marca">
                  {escolhido ? <span className="dd-sub-bolinha" /> : null}
                </span>
                <span
                  className={`dd-sub-texto ${i.ativo ? (escolhido ? 'dd-aberto' : 'dd-ativo') : ''}`}
                >
                  {i.rotulo}
                </span>
              </>
            );
            return i.ativo ? (
              <Link key={i.key} className="dd-sub" href={`?path=${section.key}:${i.key}`}>
                {miolo}
              </Link>
            ) : (
              <button key={i.key} type="button" className="dd-sub" popoverTarget={ALERTA}>
                {miolo}
              </button>
            );
          })
        : null}
    </div>
  );
}

/**
 * O `bds-alert` do `jV` (em `ZV` e em `AV`): cabeçalho `variant="error"` com o
 * ícone `error`, o texto, e "Fechar" como botão secundário. Na origem é estado de
 * React; aqui é `popover` nativo — abre e fecha sem JavaScript nosso.
 */
function Alerta() {
  return (
    <div id={ALERTA} popover="auto" className="dd-alerta" role="alertdialog">
      <div className="dd-alerta-caixa">
        <div className="dd-alerta-cabeca">
          <IconePortal nome="erro-contorno" tamanho={32} />
          <h2>Ops! Este conteúdo ainda não está disponivel.</h2>
        </div>
        <p className="dd-alerta-corpo">
          Estamos trabalhando para trazer muito em breve o melhor conteúdo de análise de performace
          do seu contato inteligente.
        </p>
        <div className="dd-alerta-acoes">
          <button
            type="button"
            className="dd-botao-secundario"
            popoverTarget={ALERTA}
            popoverTargetAction="hide"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
