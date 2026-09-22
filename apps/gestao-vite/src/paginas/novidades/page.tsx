import Link from '../../componentes/link';
import { BarraDoPortal } from '../../componentes/barra-do-portal';
import { IconeBusca, IconePortal } from '../../componentes/icones-portal';
import { Selecao } from '../../componentes/selecao';
import { useSearchParams } from 'react-router-dom';
import { useCascaDoPortal } from '../../lib/casca';
import { CATEGORIAS, NOVIDADES, type Novidade } from './conteudo';
import './novidades.css';

/**
 * Novidades — o "Novidades na Blip" do portal deles, com o desenho do blog do
 * Barboo.
 *
 * DUAS RÉGUAS, e é de propósito. O LUGAR é o deles: o cartão do portal abre uma
 * tela pendurada na barra escura, e é só isso que a `ui-view` mostra. O DESENHO
 * é o do blog do Barboo, escolhido pelo dono — sobretítulo, título grande,
 * subtítulo, a busca e o filtro em pílula, um cartão grande em destaque e a
 * grade abaixo.
 *
 * O que a origem faz e nós NÃO fazemos: eles embutem o blog num `<iframe>` de
 * 100%×100%. Aqui a lista é nossa, servida do próprio aplicativo — quadro de
 * site de fora não tem a nossa tipografia, não responde ao nosso tema e pode
 * recusar enframe a qualquer momento.
 *
 * Busca e filtro são `<form method="get">`: a lista é do servidor, e a URL fica
 * compartilhável. Nenhum estado de cliente nesta tela.
 */
export function PaginaNovidades() {
  const casca = useCascaDoPortal();
  const [parametrosDaUrl] = useSearchParams();
  const parametros = Object.fromEntries(parametrosDaUrl.entries());

  const busca = primeiro(parametros['q']).trim();
  const categoria = primeiro(parametros['categoria']).trim();

  const achados = NOVIDADES.filter((n) => {
    const combinaCategoria = !categoria || categoria === CATEGORIAS[0] || n.categoria === categoria;
    const combinaBusca =
      !busca || `${n.titulo} ${n.resumo}`.toLowerCase().includes(busca.toLowerCase());
    return combinaCategoria && combinaBusca;
  });

  /* O cartão grande só existe na lista inteira: filtrada, destacar o primeiro
     resultado seria dar peso a um acaso da busca. */
  const filtrando = Boolean(busca || (categoria && categoria !== CATEGORIAS[0]));
  const destaque = filtrando ? null : (achados.find((n) => n.destaque) ?? achados[0] ?? null);
  const demais = destaque ? achados.filter((n) => n !== destaque) : achados;

  return (
    <div className="pt-app">
      <BarraDoPortal dados={casca} />

      <main className="nv-conteudo">
        <div className="nv-coluna">
          <p className="nv-sobretitulo">Novidades</p>
          <h1 className="nv-titulo">O que mudou no Pipe</h1>
          <p className="nv-subtitulo">
            O que chegou, o que mudou de lugar e o que ainda está a caminho — na ordem em que foi ao
            ar.
          </p>

          <form className="nv-filtros" method="get" action="/novidades" role="search">
            <div className="nv-campo">
              <IconeBusca tamanho={20} />
              <input
                type="search"
                name="q"
                defaultValue={busca}
                placeholder="Buscar por tema…"
                aria-label="Buscar novidades"
              />
            </div>
            <div className="nv-campo nv-campo-lista">
              <Selecao
                name="categoria"
                defaultValue={categoria || CATEGORIAS[0]}
                aria-label="Categoria"
              >
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Selecao>
              <IconePortal nome="baixo" tamanho={20} />
            </div>
            {/* Sem JavaScript: o filtro aplica no envio, como a busca do portal. */}
            <button type="submit" className="btn">
              Filtrar
            </button>
          </form>

          {achados.length === 0 ? (
            <p className="nv-nada">Nenhuma novidade encontrada com esse filtro.</p>
          ) : null}

          {destaque ? <Cartao novidade={destaque} grande /> : null}

          {demais.length > 0 ? (
            <div className="nv-grade">
              {demais.map((n) => (
                <Cartao key={n.id} novidade={n} />
              ))}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}

/**
 * O cartão do blog deles: a faixa da capa com a etiqueta da categoria por cima,
 * e o corpo branco com título, resumo, a linha de data e o "Ler artigo →".
 *
 * A capa é uma FAIXA DE COR, e não uma foto: não temos banco de imagem, e uma
 * foto de banco genérica em cima de um aviso de versão mente sobre o conteúdo.
 * A cor vem da categoria, então a grade continua legível de longe.
 */
function Cartao({ novidade, grande }: { novidade: Novidade; grande?: boolean }) {
  return (
    <article className={grande ? 'nv-cartao nv-cartao-grande' : 'nv-cartao'}>
      <div className="nv-capa" data-categoria={novidade.categoria}>
        <span className="nv-capa-etq">{novidade.categoria}</span>
      </div>

      <div className="nv-corpo">
        {grande ? <span className="nv-destaque">Destaque</span> : null}
        <h2 className="nv-cartao-titulo">{novidade.titulo}</h2>
        <p className="nv-resumo">{novidade.resumo}</p>
        <p className="nv-meta">
          <time dateTime={novidade.data}>{porExtenso(novidade.data)}</time>
          {' · '}
          {novidade.leitura} min de leitura
        </p>
        {/* Cada novidade ainda não tem página própria; o link leva à lista com
            o tema já filtrado, que é o mais perto de útil sem inventar rota. */}
        <Link
          className="nv-ler"
          href={`/novidades?categoria=${encodeURIComponent(novidade.categoria)}`}
        >
          Ler mais <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}

/** "20 de julho de 2026" — o formato que o blog usa, em caixa alta pelo CSS. */
function porExtenso(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const meses = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
  ];
  return `${dia} de ${meses[(mes ?? 1) - 1]} de ${ano}`;
}

/** O primeiro valor de um parâmetro que pode vir repetido na URL. */
function primeiro(valor: string | string[] | undefined): string {
  return Array.isArray(valor) ? (valor[0] ?? '') : (valor ?? '');
}
