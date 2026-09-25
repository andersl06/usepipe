import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Icone } from '@pipe/ui';
import { Selection } from './selection';

const TAMANHOS_OF_PAGE = [5, 10, 15, 25, 50, 100, 250, 500] as const;

/**
 * A busca isolada abaixo do cabeçalho — `bds-input icon="search"` numa coluna
 * `w-30`: 30% de largura, 54px, lupa de 20 (`dom/rules.html`).
 */
function SearchTopo({
  search,
  setSearch,
  placeholder,
}: {
  search: string;
  setSearch: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="busca-topo">
      <Icone nome="busca" tamanho={20} />
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </div>
  );
}

/** Os quatro ícones de navegação do rodapé — `FICHA-rules.md`/`FICHA-queue-
 * management.md` §5 (`arrow-first`, `arrow-left`, `arrow-right`, `arrow-last`).
 * Não existem em `@pipe/ui` nem valem a pena lá: só este rodapé os usa. */
function PageSeta({ tipo }: { tipo: 'primeira' | 'anterior' | 'proxima' | 'ultima' }) {
  const caminhos: Record<typeof tipo, string> = {
    primeira: 'M11 7l-5 5l5 5M17 7l-5 5l5 5',
    anterior: 'M15 6l-6 6l6 6',
    proxima: 'M9 6l6 6l-6 6',
    ultima: 'M7 7l5 5l-5 5M13 7l5 5l-5 5',
  };
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={caminhos[tipo]} />
    </svg>
  );
}

/**
 * Rodapé "Resultados por página" — o mesmo das duas telas que o material
 * capturou com paginação (`FICHA-rules.md` e `FICHA-queue-management.md`,
 * ambas §2.5/§5): select de tamanho, contador "X-Y de Z" e as quatro setas.
 * Pagina no navegador, sobre a lista já filtrada pela busca — não há acordo
 * com o servidor, os dados já estão todos carregados.
 */
function PaginationRodape({
  total,
  page,
  tamanho,
  toMudarPage,
  aoMudarTamanho,
  ocultarTamanho = false,
}: {
  total: number;
  page: number;
  tamanho: number;
  toMudarPage: (p: number) => void;
  aoMudarTamanho: (t: number) => void;
  /**
   * `personalizedbreaks` NÃO tem `pagination-and-search-results-select`
   * (`FICHA-atendentes-filas-pausas.md` §b.3/§c) — só contador e setas.
   */
  ocultarTamanho?: boolean;
}) {
  const totalPages = Math.max(1, Math.ceil(total / tamanho));
  const inicio = total === 0 ? 0 : (page - 1) * tamanho + 1;
  const fim = Math.min(page * tamanho, total);
  return (
    <div className="rodape-paginacao">
      {ocultarTamanho ? null : (
        <label className="rp-tamanho">
          Resultados por página
          <Selection value={tamanho} onChange={(e) => aoMudarTamanho(Number(e.target.value))} aria-label="Resultados por página">
            {TAMANHOS_OF_PAGE.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </Selection>
        </label>
      )}
      <span className="rp-contagem">{`${inicio}-${fim} de ${total}`}</span>
      <div className="rp-nav">
        <button type="button" disabled={page <= 1} onClick={() => toMudarPage(1)} aria-label="Primeira página">
          <PageSeta tipo="primeira" />
        </button>
        <button type="button" disabled={page <= 1} onClick={() => toMudarPage(page - 1)} aria-label="Página anterior">
          <PageSeta tipo="anterior" />
        </button>
        <span className="rp-atual">{page}</span>
        <button type="button" disabled={page >= totalPages} onClick={() => toMudarPage(page + 1)} aria-label="Próxima página">
          <PageSeta tipo="proxima" />
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => toMudarPage(totalPages)}
          aria-label="Última página"
        >
          <PageSeta tipo="ultima" />
        </button>
      </div>
    </div>
  );
}

/**
 * Regras como LISTA DE CARTÕES, com a busca no topo.
 *
 * Segue o esqueleto medido em `referencias-blip/pesquisa/blip-telas-atendimento.md` §4 e
 * §5.3: linha do título, busca sozinha na linha logo abaixo, e a lista de
 * cartões. Rótulo pequeno acima do valor forte, situação encostada à direita.
 *
 * **O interruptor por linha, e por que ele demorou.** No cartão deles há criar,
 * editar, excluir e um interruptor. O nosso nasceu só com a situação em
 * etiqueta, porque mexer em configuração sem log de auditoria com autor, valor
 * anterior e horário é passivo — e a auditoria não existia. Ela existe agora
 * (`lib/auditoria.ts`), então o interruptor entrou no `.cl-acoes`, como o
 * comentário anterior previa, sem mexer em mais nada: quem tem `acao` mostra o
 * controle, quem não tem continua com a etiqueta sozinha.
 *
 * A busca, essa sim, funciona: filtra as duas listas já carregadas, no
 * navegador, sem ida ao servidor.
 */

export interface CardRule {
  id: string;
  /** `titulo` é o que o cursor mostra; sem ele, o próprio valor (para o truncado). */
  campos: { rotulo: string; value: string; classe?: string; titulo?: string }[];
  situation: string;
  active: boolean;
  /**
   * O `bds-chip-tag` NA LINHA do cartão — o "Padrão" da regra de SLA deles,
   * que ocupa uma quarta coluna sem rótulo (`dom/sla-policy.html`), e não o
   * rodapé.
   */
  selo?: string;
  /** Tudo que a busca varre, já em minúsculas. */
  procura: string;
  /**
   * Cor do próprio registro, já como `var(--p-…)` — nunca hex. Ocupa a primeira
   * coluna do cartão, que nasceu vazia justamente para isto. Só a fila usa: cor
   * ali é dado do cliente, não estado, e por isso não vira etiqueta colorida.
   */
  cor?: string | null;
  /**
   * Tira do pé do cartão, para a lista que pertence ao registro — os atendentes
   * de uma fila, as filas de um horário. Fica no `.cl-rodape` porque o
   * `.cl-campos` é grade de valor único e uma lista dentro dele vira truncagem.
   */
  rodape?: readonly string[];
  /**
   * Controle do registro, à direita, ao lado da situação — o interruptor do
   * cartão-linha deles. Vem pronto de fora porque é ele que carrega a Server
   * Action, e esta lista é componente de cliente: montar o formulário aqui
   * arrastaria a ação para o pacote do navegador.
   */
  acao?: React.ReactNode;
  /**
   * Slot antes das colunas — a caixa de seleção + avatar do cartão de
   * atendente (`FICHA-atendentes-filas-pausas.md` §b.2: "caixa de seleção,
   * avatar com as iniciais"). `undefined` mantém o `<span>` de sempre (a
   * faixa de cor da fila, quando existe, ou vazio).
   */
  esquerda?: React.ReactNode;
}

export interface RulesSection {
  titulo: string;
  empty: string;
  /**
   * A segunda linha do vazio de página deles ("Crie respostas para agilizar
   * seus atendimentos" sob "Você ainda não criou respostas prontas",
   * `FICHA-replies.md` §6). Sem ela, o vazio é uma frase só.
   */
  emptyDescription?: string;
  cards: CardRule[];
}

/**
 * O cartão-linha deles: as colunas de rótulo 12/400 sobre valor 16/700, o
 * selo na linha quando existe, e à direita SÓ as ações (`bds-button-icon`
 * de editar/excluir e o `bds-switch`) — nenhuma etiqueta "Ativa" ao lado:
 * o interruptor já diz o estado. Sem interruptor (SLA, filas, pausas), a
 * situação só aparece quando o registro está desligado — o que é dado, e
 * não decoração.
 */
function Card({ card }: { card: CardRule }) {
  const colunas = card.campos.length + (card.selo ? 1 : 0);
  return (
    <article className="cartao-lista">
      {card.esquerda ?? (card.cor ? <span className="sw" style={{ background: card.cor }} /> : <span />)}
      <div className="cl-campos" style={{ '--cl-colunas': colunas } as React.CSSProperties}>
        {card.campos.map((c) => (
          <div key={c.rotulo} className="cl-campo">
            <span className="r">{c.rotulo}</span>
            <span className={c.classe ? `v ${c.classe}` : 'v'} title={c.titulo ?? c.value}>
              {c.value}
            </span>
          </div>
        ))}
        {card.selo ? (
          <div className="cl-campo">
            <span className="r" aria-hidden="true">
              &nbsp;
            </span>
            <span className="etiqueta">{card.selo}</span>
          </div>
        ) : null}
      </div>
      <div className="cl-acoes">
        {!card.acao && !card.active ? (
          <span className="etiqueta alerta">{card.situation}</span>
        ) : null}
        {card.acao}
      </div>

      {card.rodape && card.rodape.length > 0 ? (
        <div className="cl-rodape">
          {card.rodape.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function ListaRegras({
  sections,
  placeholder = 'Buscar regra, fila ou escopo',
  sectionOcultarHeader = false,
  paginar = false,
  pageInitialTamanho = 10,
  ocultarSearch = false,
  filters,
  pageOcultarTamanho = false,
}: {
  sections: readonly RulesSection[];
  /** A lista serve outras telas além de Regras; o texto da busca é o único ponto de variação. */
  placeholder?: string;
  /**
   * Blip não repete o título da seção acima da lista de cartões (o cartão
   * vem direto depois da busca) — só esconde aqui, e só quem pede, porque
   * telas com mais de uma seção (horários, por exemplo) ainda precisam do
   * rótulo para separar os grupos.
   */
  sectionOcultarHeader?: boolean;
  /**
   * O rodapé "Resultados por página" que o material capturou em `rules` e
   * em `queue-management` (únicas duas fichas com paginação confirmada). Só
   * funciona com uma seção — as telas que o pedem têm uma só.
   */
  paginar?: boolean;
  pageInitialTamanho?: number;
  /**
   * `personalizedbreaks` não tem busca nem filtro nenhum no material
   * (`FICHA-personalizedbreaks.md` §3) — a lista vem direto depois do
   * cabeçalho. A busca continua ligada por padrão para as telas que a Blip
   * mostra com ela.
   */
  ocultarSearch?: boolean;
  /**
   * Controles que dividem a linha com a busca — o "Filtrar por:" com os
   * seletores de "Modelos de mensagens" (`FICHA-message-template.md` §3), à
   * esquerda da busca, que ali ocupa 69% da linha.
   */
  filters?: ReactNode;
  /** Ver `RodapeDePaginacao.ocultarTamanho` — só a tela de Pausas pede isto. */
  pageOcultarTamanho?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [tamanho, setTamanho] = useState(pageInitialTamanho);
  const [page, setPage] = useState(1);

  const filtradas = useMemo(() => {
    const alvo = search.trim().toLowerCase();
    if (!alvo) return sections;
    return sections.map((s) => ({
      ...s,
      cartoes: s.cards.filter((c) => c.procura.includes(alvo)),
    }));
  }, [sections, search]);

  const nenhuma = filtradas.every((s) => s.cards.length === 0);
  const unicaSection = filtradas.length === 1 ? filtradas[0] : undefined;
  const podePaginar = paginar && unicaSection !== undefined;
  const totalItens = unicaSection && podePaginar ? unicaSection.cards.length : 0;
  const totalPages = Math.max(1, Math.ceil(totalItens / tamanho));
  const pageCurrent = Math.min(page, totalPages);

  // Busca ou tamanho de página novos voltam para a página 1 — senão a pessoa
  // filtra para 3 itens estando na página 4 e vê uma lista vazia por engano.
  useEffect(() => {
    setPage(1);
  }, [search, tamanho]);

  const sectionsShown =
    podePaginar && unicaSection
      ? [
          {
            ...unicaSection,
            cartoes: unicaSection.cards.slice(
              (pageCurrent - 1) * tamanho,
              (pageCurrent - 1) * tamanho + tamanho,
            ),
          },
        ]
      : filtradas;

  return (
    <>
      {ocultarSearch ? null : filters ? (
        <div className="filtrar-por">
          {filters}
          <SearchTopo search={search} setSearch={setSearch} placeholder={placeholder} />
        </div>
      ) : (
        <SearchTopo search={search} setSearch={setSearch} placeholder={placeholder} />
      )}

      {nenhuma && search.trim() ? (
        /* Vazio de BUSCA, com o texto do vazio de busca deles ("Nenhum
           resultado encontrado", `dom/history.html`) e a saída junto: sem
           o botão, a única forma de voltar à lista é apagar o texto na mão. */
        <div className="vazio">
          <b>Nenhum resultado encontrado</b>
          <p>
            Não encontramos nenhum resultado a partir da pesquisa realizada.
            <br />
            Que tal refazer a sua busca?
          </p>
          <button type="button" className="btn contorno-marca" onClick={() => setSearch('')}>
            Redefinir filtros
          </button>
        </div>
      ) : (
        sectionsShown.map((section) => (
          <div key={section.titulo} className="lista-cartoes">
            {sectionOcultarHeader ? null : (
              <div className="grupo-cartoes">
                {section.titulo} <span className="qt">{section.cards.length}</span>
              </div>
            )}
            {section.cards.length === 0 ? (
              /* O vazio de página deles: título 20/700 e, quando existe, a
                 descrição em 16/400 embaixo. */
              <div className="vazio">
                <b>{section.empty}</b>
                {section.emptyDescription ? <p>{section.emptyDescription}</p> : null}
              </div>
            ) : (
              section.cards.map((c) => <Card key={c.id} card={c} />)
            )}
          </div>
        ))
      )}

      {podePaginar && !nenhuma ? (
        <PaginationRodape
          total={totalItens}
          page={pageCurrent}
          tamanho={tamanho}
          toMudarPage={setPage}
          aoMudarTamanho={setTamanho}
          ocultarTamanho={pageOcultarTamanho}
        />
      ) : null}
    </>
  );
}
