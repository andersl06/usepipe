import { memo } from 'react';

/**
 * Render History as cards rather than a ten-column table, as measured in `referencias-blip/pesquisa/blip-telas-atendimento.md` Sections 3 and 5.2: six of eight Blip Attendance screens use cards and none use a table. A card keeps labels beside values across widths. Match their layout (selection bar above; small label over strong value) with our `--p-*` colors, not their hex values. `PaginaHistorico` owns selection because CSV export outside this component depends on it; this component owns Select all and the visible-card count.
 */

export interface CardHistory {
  id: string;
  ticket: string;
  encerrada: string;
  contact: string;
  queue: string;
  agent: string;
  espera: string;
  firstResposta: string;
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


const OITO_COLUNAS = { '--cl-colunas': 8 } as React.CSSProperties;

/**
 * Memoizing the card is measured necessity, not speculative optimization: a query can return 200 conversations with eight fields each; without `memo`, checking one box rebuilt all 200 cards and froze the screen for tens of seconds. With `memo` and stable `aoAlternar`, only one card rerenders.
 */
const Card = memo(function Cartao({
  card,
  marcado,
  aoAlternar,
}: {
  card: CardHistory;
  marcado: boolean;
  aoAlternar: (id: string) => void;
}) {
  return (
    <article className={card.critico ? 'cartao-lista critico' : 'cartao-lista'}>
      <label className="cl-sel">
        <input
          type="checkbox"
          checked={marcado}
          onChange={() => aoAlternar(card.id)}
          aria-label={`Selecionar o ticket ${card.ticket}`}
        />
      </label>

      <div className="cl-campos" style={OITO_COLUNAS}>
        <Campo rotulo="Ticket" value={card.ticket} classe="id" />
        <Campo rotulo="Encerrada" value={card.encerrada} classe="num" />
        <Campo rotulo="Contato" value={card.contact} />
        <Campo rotulo="Fila" value={card.queue} />
        <Campo rotulo="Atendente" value={card.agent} />
        <Campo rotulo="Espera do cliente" value={card.espera} classe="num" />
        <Campo rotulo="1ª resposta" value={card.firstResposta} classe="num" />
        <Campo rotulo="Atendimento" value={card.attendance} classe="num" />
      </div>

      <div className="cl-acoes">
        <span className={card.statusClasse}>{card.statusTexto}</span>
      </div>

      {card.etiquetas.length > 0 ? (
        <div className="cl-rodape">
          {card.etiquetas.map((e) => (
            <span key={e} className="etiqueta">
              {e}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
});

export function ListaHistory({
  groups,
  todos,
  marcados,
  aoAlternar,
  aoAlternarTodos,
}: {
  groups: readonly CardsGroup[];
  /** Keep one deduplicated list for Select all, rather than repeating cards in each group. */
  todos: readonly CardHistory[];
  marcados: ReadonlySet<string>;
  aoAlternar: (id: string) => void;
  aoAlternarTodos: () => void;
}) {
  const selecionados = todos.filter((c) => marcados.has(c.id));
  const tudoMarcado = todos.length > 0 && selecionados.length === todos.length;

  return (
    <>
      <div className="barra-selecao">
        <label>
          <input type="checkbox" checked={tudoMarcado} onChange={aoAlternarTodos} />
          Selecionar todos
        </label>

        {selecionados.length > 0 ? (
          <span className="qt-sel">{selecionados.length} selecionada(s)</span>
        ) : null}
      </div>

      <div className="lista-cartoes">
        {groups.map((grupo) => (
          <div key={grupo.titulo || 'todos'} className="lista-cartoes">
            {grupo.titulo ? (
              <div className="grupo-cartoes">
                {grupo.titulo} <span className="qt">{grupo.cards.length}</span>
              </div>
            ) : null}

            {grupo.cards.map((c) => (
              <Card
                key={`${grupo.titulo}-${c.id}`}
                card={c}
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
