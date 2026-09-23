import { memo } from 'react';

/**
 * Histórico como LISTA DE CARTÕES, e não como tabela.
 *
 * É a diferença mais funda entre a tela deles e a nossa, medida em
 * `docs/pesquisa/blip-telas-atendimento.md` §3 e §5.2: seis das oito telas do
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

export interface CartaoHistorico {
  id: string;
  ticket: string;
  encerrada: string;
  contato: string;
  fila: string;
  atendente: string;
  espera: string;
  primeiraResposta: string;
  atendimento: string;
  statusTexto: string;
  statusClasse: string;
  critico: boolean;
  etiquetas: string[];
}

export interface GrupoDeCartoes {
  titulo: string;
  cartoes: CartaoHistorico[];
}

function Campo({ rotulo, valor, classe }: { rotulo: string; valor: string; classe?: string }) {
  return (
    <div className="cl-campo">
      <span className="r">{rotulo}</span>
      <span className={classe ? `v ${classe}` : 'v'} title={valor}>
        {valor}
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
const Cartao = memo(function Cartao({
  cartao,
  marcado,
  aoAlternar,
}: {
  cartao: CartaoHistorico;
  marcado: boolean;
  aoAlternar: (id: string) => void;
}) {
  return (
    <article className={cartao.critico ? 'cartao-lista critico' : 'cartao-lista'}>
      <label className="cl-sel">
        <input
          type="checkbox"
          checked={marcado}
          onChange={() => aoAlternar(cartao.id)}
          aria-label={`Selecionar o ticket ${cartao.ticket}`}
        />
      </label>

      <div className="cl-campos" style={OITO_COLUNAS}>
        <Campo rotulo="Ticket" valor={cartao.ticket} classe="id" />
        <Campo rotulo="Encerrada" valor={cartao.encerrada} classe="num" />
        <Campo rotulo="Contato" valor={cartao.contato} />
        <Campo rotulo="Fila" valor={cartao.fila} />
        <Campo rotulo="Atendente" valor={cartao.atendente} />
        <Campo rotulo="Espera do cliente" valor={cartao.espera} classe="num" />
        <Campo rotulo="1ª resposta" valor={cartao.primeiraResposta} classe="num" />
        <Campo rotulo="Atendimento" valor={cartao.atendimento} classe="num" />
      </div>

      <div className="cl-acoes">
        <span className={cartao.statusClasse}>{cartao.statusTexto}</span>
      </div>

      {cartao.etiquetas.length > 0 ? (
        <div className="cl-rodape">
          {cartao.etiquetas.map((e) => (
            <span key={e} className="etiqueta">
              {e}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
});

export function ListaHistorico({
  grupos,
  todos,
  marcados,
  aoAlternar,
  aoAlternarTodos,
}: {
  grupos: readonly GrupoDeCartoes[];
  /** A lista única, sem repetição por grupo — quem manda no "selecionar todos". */
  todos: readonly CartaoHistorico[];
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
        {grupos.map((grupo) => (
          <div key={grupo.titulo || 'todos'} className="lista-cartoes">
            {grupo.titulo ? (
              <div className="grupo-cartoes">
                {grupo.titulo} <span className="qt">{grupo.cartoes.length}</span>
              </div>
            ) : null}

            {grupo.cartoes.map((c) => (
              <Cartao
                key={`${grupo.titulo}-${c.id}`}
                cartao={c}
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
