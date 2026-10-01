import { memo } from 'react';
import { ManagementIcon } from './icones-management';

/**
 * Render History as cards rather than a table, as in `referencias-blip/fichas/FICHA-history.md` and the results capture: each row is a `bds-paper` card with a checkbox, Ticket, Atendente, Contato, three durations and a button that opens the ticket detail. A card keeps labels beside values across widths. Match their layout (selection bar above; small label over strong value) with our `--p-*` colors, not their hex values. `PageHistory` owns selection because CSV export outside this component depends on it; this component owns Select all and the visible-card count.
 */

export interface CardHistory {
  id: string;
  ticket: string;
  encerrada: string;
  contact: string;
  queue: string;
  agent: string;
  espera: string;
  firstResponse: string;
  attendance: string;
  statusTexto: string;
  statusClasse: string;
  critico: boolean;
  etiquetas: string[];
}

export interface CardsGroup {
  titulo: string;
  cards: CardHistory[];
}

function Campo({ rotulo, value, classe }: { rotulo: string; value: string; classe?: string }) {
  return (
    <div className="cl-campo">
      <span className="r">{rotulo}</span>
      <span className={classe ? `v ${classe}` : 'v'} title={value}>
        {value}
      </span>
    </div>
  );
}


const SEIS_COLUNAS = { '--cl-colunas': 6 } as React.CSSProperties;

/**
 * Memoizing the card is measured necessity, not speculative optimization: a query can return 200 conversations with eight fields each; without `memo`, checking one box rebuilt all 200 cards and froze the screen for tens of seconds. With `memo` and stable `aoAlternar`, only one card rerenders.
 */
const Card = memo(function Cartao({
  card,
  href,
  marcado,
  aoAlternar,
}: {
  card: CardHistory;
  href: string;
  marcado: boolean;
  aoAlternar: (id: string) => void;
}) {
  return (
    <article className="card-list">
      <label className="cl-sel">
        <input
          type="checkbox"
          checked={marcado}
          onChange={() => aoAlternar(card.id)}
          aria-label={`Selecionar o ticket ${card.ticket}`}
        />
      </label>

      <div className="cl-campos" style={SEIS_COLUNAS}>
        <Campo rotulo="Ticket" value={card.ticket} classe="id" />
        <Campo rotulo="Atendente" value={card.agent} />
        <Campo rotulo="Contato" value={card.contact} />
        <Campo rotulo="Tempo de espera" value={card.espera} classe="num" />
        <Campo rotulo="Tempo de 1ª resposta" value={card.firstResponse} classe="num" />
        <Campo rotulo="Tempo de atendimento" value={card.attendance} classe="num" />
      </div>

      <div className="cl-actions">
        <a
          className="iconbtn"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title="Consultar detalhes do ticket"
          aria-label={`Consultar detalhes do ticket ${card.ticket}`}
        >
          <ManagementIcon nome="direita" tamanho={24} />
        </a>
      </div>
    </article>
  );
});

export function ListHistory({
  groups,
  todos,
  marcados,
  aoAlternar,
  aoAlternarTodos,
  hrefDetalhe,
}: {
  groups: readonly CardsGroup[];
  /** Keep one deduplicated list for Select all, rather than repeating cards in each group. */
  todos: readonly CardHistory[];
  marcados: ReadonlySet<string>;
  aoAlternar: (id: string) => void;
  aoAlternarTodos: () => void;
  /** Where the detail of a ticket opens (a new tab, like their chevron button). */
  hrefDetalhe: (card: CardHistory) => string;
}) {
  const selecionados = todos.filter((c) => marcados.has(c.id));
  const tudoMarcado = todos.length > 0 && selecionados.length === todos.length;

  return (
    <>
      <div className="bar-selection">
        <label>
          <input type="checkbox" checked={tudoMarcado} onChange={aoAlternarTodos} />
          Selecionar todos
        </label>

        {selecionados.length > 0 ? (
          <span className="qt-sel">{selecionados.length} selecionada(s)</span>
        ) : null}
      </div>

      <div className="list-cards">
        {groups.map((grupo) => (
          <div key={grupo.titulo || 'todos'} className="list-cards">
            {grupo.titulo ? (
              <div className="group-cards">
                {grupo.titulo} <span className="qt">{grupo.cards.length}</span>
              </div>
            ) : null}

            {grupo.cards.map((c) => (
              <Card
                key={`${grupo.titulo}-${c.id}`}
                card={c}
                href={hrefDetalhe(c)}
                marcado={marcados.has(c.id)}
                aoAlternar={aoAlternar}
              />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
