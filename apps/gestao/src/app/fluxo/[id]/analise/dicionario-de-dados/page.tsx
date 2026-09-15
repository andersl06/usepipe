import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { IconePortal } from '../../../../../componentes/icones-portal';
import { PAGINAS, SobreDados } from './paginas';
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
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Dicionário de dados · Pipe',
};

/** O `id` vem da URL, e URL é texto de fora: sem isto o Postgres recusa o uuid. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Item {
  chave: string;
  rotulo: string;
  /** `isActive` do `valuesItemMenu`: o inativo abre o alerta em vez de navegar. */
  ativo: boolean;
}

interface Secao {
  chave: string;
  titulo: string;
  /** `active` do `ZV`/`AV`: inativa ganha o selo "Em Breve" (`SV`). */
  ativa: boolean;
  /** Presente = acordeão (`AV`); ausente = item único (`ZV`). */
  itens?: readonly Item[];
}

/*
 * O menu `HV`, na ordem do JSX, com os rótulos pt de `BV` (seções) e
 * `TV.menuOne` (subseções). "Lista de blocos" existe porque a flag
 * `is-displaying-block-listing-section` do roteador é `true` (`hidden: !a`).
 */
const SECOES: readonly Secao[] = [
  { chave: 'aboutData', titulo: 'Sobre dados', ativa: true },
  {
    chave: 'dashboard',
    titulo: 'Dashboard',
    ativa: true,
    itens: [
      { chave: 'dateFilter', rotulo: 'Filtro de data', ativo: true },
      { chave: 'comparisonIndicator', rotulo: 'Indicador de comparação', ativo: true },
      { chave: 'contacts', rotulo: 'Contatos', ativo: true },
      { chave: 'recurrence', rotulo: 'Recorrência', ativo: true },
      { chave: 'messages', rotulo: 'Mensagens', ativo: true },
      { chave: 'channels', rotulo: 'Canais (Em breve)', ativo: false },
      { chave: 'conversationalFlow', rotulo: 'Fluxo conversacional', ativo: true },
      { chave: 'listOfBlocks', rotulo: 'Lista de blocos', ativo: true },
      { chave: 'frequentlyAskedQuestions', rotulo: 'Perguntas frequentes', ativo: true },
    ],
  },
  { chave: 'overview', titulo: 'Visão Geral', ativa: false },
  { chave: 'contactJourney', titulo: 'Jornada dos Contatos', ativa: false },
  { chave: 'customReport', titulo: 'Relatórios Personalizados', ativa: false },
  {
    chave: 'reportManager',
    titulo: 'Gerenciador de Relatórios',
    ativa: true,
    itens: [
      { chave: 'activeMessages', rotulo: 'Mensagens ativas', ativo: true },
      { chave: 'eventTracking', rotulo: 'Rastreamento de eventos', ativo: true },
      { chave: 'chatbotUserMetrics', rotulo: 'Métricas de chatbot e usuários', ativo: true },
      { chave: 'statusAttendants', rotulo: 'Status dos atendentes', ativo: true },
      { chave: 'serviceMetrics', rotulo: 'Métricas de atendimento', ativo: true },
      { chave: 'serviceHistory', rotulo: 'Histórico de atendimento', ativo: true },
    ],
  },
];

/** O `id` do alerta único; os itens inativos o abrem por `popovertarget`. */
const ALERTA = 'dd-alerta';

export default async function PaginaDoDicionario({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ path?: string | string[] }>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const { path } = await searchParams;
  const [pedida, subPedida] = (typeof path === 'string' ? path : '').split(':');
  /* O `mV` do `bV`: sem `path` (ou com lixo), a seção é "Sobre dados". */
  const secao = SECOES.find((s) => s.ativa && s.chave === pedida) ?? SECOES[0]!;
  const item = secao.itens?.find((i) => i.ativo && i.chave === subPedida);
  const Pagina = PAGINAS[item?.chave ?? secao.chave] ?? SobreDados;

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
              {SECOES.map((s) =>
                s.itens ? (
                  <Acordeao
                    key={s.chave}
                    secao={s}
                    aberta={s.chave === secao.chave}
                    selecionado={item?.chave ?? null}
                  />
                ) : (
                  <ItemUnico key={s.chave} secao={s} aberta={s.chave === secao.chave} />
                ),
              )}
            </div>
          </nav>

          <div className="dd-area">
            <Pagina />
          </div>
        </div>
      </div>

      <Alerta />
    </div>
  );
}

/* ------------------------------------------------------------------ peças */

/** A classe de cor do título: `open` (primária) na seção clicada, `active` no resto. */
function corDoTitulo(ativa: boolean, aberta: boolean) {
  if (!ativa) return '';
  return aberta ? 'dd-aberto' : 'dd-ativo';
}

/**
 * `ZV` — item de uma linha só: "Sobre dados" e os três "Em Breve". O ativo navega
 * (`handleSectionClick`); o inativo abre o alerta (`r(e => !e)`).
 */
function ItemUnico({ secao, aberta }: { secao: Secao; aberta: boolean }) {
  const miolo = (
    <span className="dd-unico-linha">
      <span className={`dd-unico-titulo ${corDoTitulo(secao.ativa, aberta)}`}>{secao.titulo}</span>
      {secao.ativa ? null : (
        <span className="dd-embreve">
          <span>Em Breve</span>
        </span>
      )}
    </span>
  );
  return secao.ativa ? (
    <Link className="dd-unico" href={`?path=${secao.chave}`}>
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
  secao,
  aberta,
  selecionado,
}: {
  secao: Secao;
  aberta: boolean;
  selecionado: string | null;
}) {
  const cor = corDoTitulo(secao.ativa, aberta);
  return (
    <div className="dd-acordeao">
      <Link className="dd-acordeao-cabeca" href={`?path=${secao.chave}`}>
        <span className={`dd-acordeao-titulo ${cor}`}>{secao.titulo}</span>
        <IconePortal
          nome={aberta ? 'baixo' : 'direita'}
          tamanho={24}
          className={`dd-acordeao-seta ${cor}`}
        />
      </Link>

      {aberta
        ? secao.itens?.map((i) => {
            /* `wV`: bolinha da marca no item escolhido; `open` nele, `active` nos
               demais, e nenhuma das duas no inativo (fica fantasma). */
            const escolhido = i.ativo && i.chave === selecionado;
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
              <Link key={i.chave} className="dd-sub" href={`?path=${secao.chave}:${i.chave}`}>
                {miolo}
              </Link>
            ) : (
              <button key={i.chave} type="button" className="dd-sub" popoverTarget={ALERTA}>
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
