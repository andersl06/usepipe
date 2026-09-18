import { memo, useCallback, useMemo, useState } from 'react';
import { montarCsv } from '../lib/csv-historico';

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
 * rótulo pequeno acima do valor forte, ação em massa no topo. A cor sai dos
 * `--p-*`, e nenhum hex deles entra aqui.
 *
 * **A ação em massa é exportar, não enviar por e-mail.** A deles dispara um
 * e-mail; a nossa gera o CSV no próprio navegador, a partir das linhas que já
 * estão na tela. Resolve o mesmo problema — tirar estes tickets da ferramenta
 * — sem inventar fila de e-mail que ninguém pediu.
 *
 * **Nenhum item desabilitado**: o botão de exportar só existe quando há
 * seleção de verdade. Botão que não faz nada é item desabilitado com outro
 * nome.
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

function baixarCsv(cartoes: readonly CartaoHistorico[]) {
  const url = URL.createObjectURL(
    new Blob([montarCsv(cartoes)], { type: 'text/csv;charset=utf-8' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `historico-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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

export function ListaHistorico({ grupos }: { grupos: readonly GrupoDeCartoes[] }) {
  const [marcados, setMarcados] = useState<ReadonlySet<string>>(new Set());

  /*
   * Agrupar por etiqueta repete a mesma conversa em mais de um grupo, de
   * propósito. A seleção é por id, então a lista única é a que manda no
   * "selecionar todos" e no CSV — senão o total exportado passaria do total
   * de conversas.
   */
  const todos = useMemo(() => {
    const vistos = new Map<string, CartaoHistorico>();
    for (const g of grupos) for (const c of g.cartoes) vistos.set(c.id, c);
    return [...vistos.values()];
  }, [grupos]);

  const selecionados = todos.filter((c) => marcados.has(c.id));
  const tudoMarcado = todos.length > 0 && selecionados.length === todos.length;

  /* Estável entre renders: é o que deixa o `memo` do cartão valer alguma coisa. */
  const alternar = useCallback(
    (id: string) =>
      setMarcados((atual) => {
        const proximo = new Set(atual);
        if (!proximo.delete(id)) proximo.add(id);
        return proximo;
      }),
    [],
  );

  return (
    <>
      <div className="barra-selecao">
        <label>
          <input
            type="checkbox"
            checked={tudoMarcado}
            onChange={() => setMarcados(tudoMarcado ? new Set() : new Set(todos.map((c) => c.id)))}
          />
          Selecionar todos
        </label>

        {selecionados.length > 0 ? (
          <span className="qt-sel">
            {selecionados.length} selecionada(s)
            <button type="button" className="btn primary" onClick={() => baixarCsv(selecionados)}>
              Exportar CSV
            </button>
          </span>
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
                aoAlternar={alternar}
              />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
