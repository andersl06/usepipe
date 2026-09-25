import { memo } from 'react';

/**
 * Histórico como LISTA DE CARTÕES, e não como tabela.
 *
 * É a diferença mais funda entre a tela deles e a nossa, medida em
 * `referencias-blip/pesquisa/blip-telas-atendimento.md` §3 e §5.2: seis das oito telas do
 * módulo Atendimento da Blip usam este cartão, e nenhuma usa tabela. Com dez
 * colunas, a tabela obriga a ler o cabeçalho e descer o olho; o cartão traz o
 * rótulo colado no valor e sobrevive a qualquer largura de tela.
 *
 * A DISPOSIÇÃO É A DELES, A TINTA É A NOSSA: barra de seleção acima da lista,
 * rótulo pequeno acima do valor forte. A cor sai dos `--p-*`, e nenhum hex
 * deles entra aqui.
 *
 * A seleção é controlada pela página (`PaginaHistorico`): a exportação em CSV
 * precisa saber se há seleção para acender, e mora fora deste componente.
 * Aqui ficam "Selecionar todos" e a contagem dos cartões visíveis.
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

/** As oito colunas do cartão, fora do componente para não virar objeto novo a cada render. */
const OITO_COLUNAS = { '--cl-colunas': 8 } as React.CSSProperties;

/**
 * O cartão é memoizado, e isso não é otimização prematura: são 200 conversas
 * no teto da consulta, cada uma com oito campos. Sem `memo`, marcar UMA caixa
 * de seleção reconstruía os 200 cartões, e a tela congelava por dezenas de
 * segundos — medido, não suposto. Com `memo` e um `aoAlternar` estável, marcar
 * uma caixa redesenha um cartão só.
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
  /** A lista única, sem repetição por grupo — quem manda no "selecionar todos". */
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
