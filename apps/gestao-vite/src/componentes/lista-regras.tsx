import { useEffect, useMemo, useState } from 'react';
import { Icone } from '@pipe/ui';

const TAMANHOS_DE_PAGINA = [5, 10, 15, 25, 50, 100, 250, 500] as const;

/** Os quatro ícones de navegação do rodapé — `FICHA-rules.md`/`FICHA-queue-
 * management.md` §5 (`arrow-first`, `arrow-left`, `arrow-right`, `arrow-last`).
 * Não existem em `@pipe/ui` nem valem a pena lá: só este rodapé os usa. */
function SetaDePagina({ tipo }: { tipo: 'primeira' | 'anterior' | 'proxima' | 'ultima' }) {
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
function RodapeDePaginacao({
  total,
  pagina,
  tamanho,
  aoMudarPagina,
  aoMudarTamanho,
}: {
  total: number;
  pagina: number;
  tamanho: number;
  aoMudarPagina: (p: number) => void;
  aoMudarTamanho: (t: number) => void;
}) {
  const totalPaginas = Math.max(1, Math.ceil(total / tamanho));
  const inicio = total === 0 ? 0 : (pagina - 1) * tamanho + 1;
  const fim = Math.min(pagina * tamanho, total);
  return (
    <div className="rodape-paginacao">
      <label className="rp-tamanho">
        Resultados por página
        <select value={tamanho} onChange={(e) => aoMudarTamanho(Number(e.target.value))}>
          {TAMANHOS_DE_PAGINA.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
      <span className="rp-contagem">{`${inicio}-${fim} de ${total}`}</span>
      <div className="rp-nav">
        <button type="button" disabled={pagina <= 1} onClick={() => aoMudarPagina(1)} aria-label="Primeira página">
          <SetaDePagina tipo="primeira" />
        </button>
        <button type="button" disabled={pagina <= 1} onClick={() => aoMudarPagina(pagina - 1)} aria-label="Página anterior">
          <SetaDePagina tipo="anterior" />
        </button>
        <span className="rp-atual">{pagina}</span>
        <button type="button" disabled={pagina >= totalPaginas} onClick={() => aoMudarPagina(pagina + 1)} aria-label="Próxima página">
          <SetaDePagina tipo="proxima" />
        </button>
        <button
          type="button"
          disabled={pagina >= totalPaginas}
          onClick={() => aoMudarPagina(totalPaginas)}
          aria-label="Última página"
        >
          <SetaDePagina tipo="ultima" />
        </button>
      </div>
    </div>
  );
}

/**
 * Regras como LISTA DE CARTÕES, com a busca no topo.
 *
 * Segue o esqueleto medido em `docs/pesquisa/blip-telas-atendimento.md` §4 e
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

export interface CartaoRegra {
  id: string;
  campos: { rotulo: string; valor: string; classe?: string }[];
  situacao: string;
  ativa: boolean;
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
}

export interface SecaoDeRegras {
  titulo: string;
  vazio: string;
  cartoes: CartaoRegra[];
}

function Cartao({ cartao }: { cartao: CartaoRegra }) {
  return (
    <article className="cartao-lista">
      {cartao.cor ? <span className="sw" style={{ background: cartao.cor }} /> : <span />}
      <div
        className="cl-campos"
        style={{ '--cl-colunas': cartao.campos.length } as React.CSSProperties}
      >
        {cartao.campos.map((c) => (
          <div key={c.rotulo} className="cl-campo">
            <span className="r">{c.rotulo}</span>
            <span className={c.classe ? `v ${c.classe}` : 'v'} title={c.valor}>
              {c.valor}
            </span>
          </div>
        ))}
      </div>
      <div className="cl-acoes">
        <span className={cartao.ativa ? 'etiqueta' : 'etiqueta alerta'}>{cartao.situacao}</span>
        {cartao.acao}
      </div>

      {cartao.rodape && cartao.rodape.length > 0 ? (
        <div className="cl-rodape">
          {cartao.rodape.map((item) => (
            <span key={item} className="etiqueta">
              {item}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function ListaRegras({
  secoes,
  placeholder = 'Buscar regra, fila ou escopo',
  ocultarCabecalhoDeSecao = false,
  paginar = false,
  tamanhoDePaginaInicial = 10,
  ocultarBusca = false,
}: {
  secoes: readonly SecaoDeRegras[];
  /** A lista serve outras telas além de Regras; o texto da busca é o único ponto de variação. */
  placeholder?: string;
  /**
   * Blip não repete o título da seção acima da lista de cartões (o cartão
   * vem direto depois da busca) — só esconde aqui, e só quem pede, porque
   * telas com mais de uma seção (horários, por exemplo) ainda precisam do
   * rótulo para separar os grupos.
   */
  ocultarCabecalhoDeSecao?: boolean;
  /**
   * O rodapé "Resultados por página" que o material capturou em `rules` e
   * em `queue-management` (únicas duas fichas com paginação confirmada). Só
   * funciona com uma seção — as telas que o pedem têm uma só.
   */
  paginar?: boolean;
  tamanhoDePaginaInicial?: number;
  /**
   * `personalizedbreaks` não tem busca nem filtro nenhum no material
   * (`FICHA-personalizedbreaks.md` §3) — a lista vem direto depois do
   * cabeçalho. A busca continua ligada por padrão para as telas que a Blip
   * mostra com ela.
   */
  ocultarBusca?: boolean;
}) {
  const [busca, setBusca] = useState('');
  const [tamanho, setTamanho] = useState(tamanhoDePaginaInicial);
  const [pagina, setPagina] = useState(1);

  const filtradas = useMemo(() => {
    const alvo = busca.trim().toLowerCase();
    if (!alvo) return secoes;
    return secoes.map((s) => ({
      ...s,
      cartoes: s.cartoes.filter((c) => c.procura.includes(alvo)),
    }));
  }, [secoes, busca]);

  const nenhuma = filtradas.every((s) => s.cartoes.length === 0);
  const unicaSecao = filtradas.length === 1 ? filtradas[0] : undefined;
  const podePaginar = paginar && unicaSecao !== undefined;
  const totalItens = unicaSecao && podePaginar ? unicaSecao.cartoes.length : 0;
  const totalPaginas = Math.max(1, Math.ceil(totalItens / tamanho));
  const paginaAtual = Math.min(pagina, totalPaginas);

  // Busca ou tamanho de página novos voltam para a página 1 — senão a pessoa
  // filtra para 3 itens estando na página 4 e vê uma lista vazia por engano.
  useEffect(() => {
    setPagina(1);
  }, [busca, tamanho]);

  const secoesExibidas =
    podePaginar && unicaSecao
      ? [
          {
            ...unicaSecao,
            cartoes: unicaSecao.cartoes.slice(
              (paginaAtual - 1) * tamanho,
              (paginaAtual - 1) * tamanho + tamanho,
            ),
          },
        ]
      : filtradas;

  return (
    <>
      {ocultarBusca ? null : (
        <div className="busca-topo">
          <Icone nome="busca" tamanho={15} />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
          />
        </div>
      )}

      {nenhuma && busca.trim() ? (
        /* Vazio de BUSCA, que é causa diferente de vazio de cadastro — e por
           isso frase diferente, com a saída junto. Sem o botão, a única forma
           de voltar à lista é apagar o texto na mão, e quem não percebeu que
           filtrou conclui que a base está vazia. */
        <div className="vazio">
          <b>Nada encontrado para “{busca.trim()}”.</b>
          <p>Os cadastros continuam lá — é a busca que não achou este texto.</p>
          <button type="button" className="btn" onClick={() => setBusca('')}>
            Limpar busca
          </button>
        </div>
      ) : (
        secoesExibidas.map((secao) => (
          <div key={secao.titulo} className="lista-cartoes">
            {ocultarCabecalhoDeSecao ? null : (
              <div className="grupo-cartoes">
                {secao.titulo} <span className="qt">{secao.cartoes.length}</span>
              </div>
            )}
            {secao.cartoes.length === 0 ? (
              <div className="vazio">{secao.vazio}</div>
            ) : (
              secao.cartoes.map((c) => <Cartao key={c.id} cartao={c} />)
            )}
          </div>
        ))
      )}

      {podePaginar && !nenhuma ? (
        <RodapeDePaginacao
          total={totalItens}
          pagina={paginaAtual}
          tamanho={tamanho}
          aoMudarPagina={setPagina}
          aoMudarTamanho={setTamanho}
        />
      ) : null}
    </>
  );
}
