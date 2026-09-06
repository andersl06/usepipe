import { Icone } from '@pipe/ui';
import { IconeGestao } from './icones-gestao';

/**
 * Faixa de filtros rápidos.
 *
 * A tela do Monitoramento tem DUAS, no mesmo desenho: uma acima da grade de
 * cartões e outra entre a grade e a tabela. É a disposição da Blip, medida na
 * captura: o rótulo em caixa alta pequena à esquerda, as pílulas em seguida, e
 * o botão "Filtros" com funil encostado à direita.
 *
 * Formulário GET puro: o estado do filtro vive na URL, então recarga periódica,
 * F5 e link compartilhado mostram exatamente a mesma tela. Nada de estado de
 * cliente para isso, e nada de JavaScript para aplicar um filtro.
 *
 * A pílula acende em moss quando tem valor — é o mesmo papel que o azul cumpre
 * na tela deles, com a nossa tinta. Vazia, ela é neutra.
 */

export type Opcao = { id: string; nome: string };

function Pilula({
  nome,
  rotulo,
  valor,
  opcoes,
}: {
  nome: string;
  rotulo: string;
  valor: string;
  opcoes: readonly Opcao[];
}) {
  return (
    <label className={valor ? 'pilula ativa' : 'pilula'}>
      <span className="pilula-rotulo">{rotulo}</span>
      <select name={nome} defaultValue={valor} aria-label={rotulo}>
        <option value="">Todos</option>
        {opcoes.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nome}
          </option>
        ))}
      </select>
      <IconeGestao nome="baixo" tamanho={13} />
    </label>
  );
}

function PilulaTexto({
  nome,
  rotulo,
  valor,
  dica,
}: {
  nome: string;
  rotulo: string;
  valor: string;
  dica: string;
}) {
  return (
    <label className={valor ? 'pilula ativa' : 'pilula'}>
      <span className="pilula-rotulo">{rotulo}</span>
      <input type="search" name={nome} defaultValue={valor} placeholder={dica} aria-label={rotulo} />
    </label>
  );
}

/** O botão da direita, igual nas duas faixas. Aplica o que as pílulas dizem. */
function BotaoFiltros({ limpar }: { limpar: string | null }) {
  return (
    <div className="faixa-fim">
      {limpar ? (
        <a href={limpar} className="btn">
          Limpar
        </a>
      ) : null}
      <button type="submit" className="btn" title="Aplicar os filtros selecionados">
        <Icone nome="funil" tamanho={14} />
        Filtros
      </button>
    </div>
  );
}

type Parametros = {
  fila?: string;
  atendente?: string;
  contato?: string;
  status?: string;
  aba?: string;
};

/** Campos que a faixa não mostra mas precisa carregar para a URL não perder estado. */
function Escondidos({ atual, exceto }: { atual: Parametros; exceto: readonly string[] }) {
  const pares: [string, string | undefined][] = [
    ['fila', atual.fila],
    ['atendente', atual.atendente],
    ['contato', atual.contato],
    ['status', atual.status],
    ['aba', atual.aba ?? 'atribuido'],
  ];
  return (
    <>
      {pares
        .filter(([chave, valor]) => valor && !exceto.includes(chave))
        .map(([chave, valor]) => (
          <input key={chave} type="hidden" name={chave} value={valor} />
        ))}
    </>
  );
}

/**
 * Primeira faixa, acima da grade: recorta a OPERAÇÃO, e por isso muda os
 * cartões junto com a tabela — fila e atendente entram na consulta.
 */
export function FiltrosDaOperacao({
  filas,
  atendentes,
  atual,
}: {
  filas: readonly Opcao[];
  atendentes: readonly Opcao[];
  atual: Parametros;
}) {
  const algum = Boolean(atual.fila || atual.atendente);
  return (
    <form className="faixa-filtros" method="get" action="/">
      <span className="lbl">Filtros rápidos</span>
      <Pilula nome="fila" rotulo="Filas" valor={atual.fila ?? ''} opcoes={filas} />
      <Pilula
        nome="atendente"
        rotulo="Atendentes"
        valor={atual.atendente ?? ''}
        opcoes={atendentes}
      />
      <Escondidos atual={atual} exceto={['fila', 'atendente']} />
      <BotaoFiltros limpar={algum ? '/' : null} />
    </form>
  );
}

const ESTADOS_DE_ATENDENTE: readonly Opcao[] = [
  { id: 'online', nome: 'Online' },
  { id: 'pausa', nome: 'Pausa' },
  { id: 'invisivel', nome: 'Invisível' },
];

/**
 * Segunda faixa, entre a grade e a tabela: recorta a LISTA, e não toca nos
 * cartões — contato e status do atendente filtram linha, não população.
 *
 * "Atendentes" aparece aqui e na faixa de cima porque aparece nas duas na tela
 * deles. É o MESMO parâmetro de URL nos dois lugares, então os dois controles
 * mostram sempre o mesmo valor: um filtro alcançável de dois pontos, não dois
 * filtros que se contradizem.
 */
export function FiltrosDaLista({
  atendentes,
  atual,
}: {
  atendentes: readonly Opcao[];
  atual: Parametros;
}) {
  const algum = Boolean(atual.atendente || atual.contato || atual.status);
  const limpar = atual.fila ? `/?fila=${encodeURIComponent(atual.fila)}` : '/';
  return (
    <form className="faixa-filtros" method="get" action="/">
      <span className="lbl">Filtros rápidos</span>
      <Pilula
        nome="atendente"
        rotulo="Atendentes"
        valor={atual.atendente ?? ''}
        opcoes={atendentes}
      />
      <PilulaTexto
        nome="contato"
        rotulo="Contato"
        valor={atual.contato ?? ''}
        dica="Nome do contato"
      />
      <Pilula
        nome="status"
        rotulo="Status do atendente"
        valor={atual.status ?? ''}
        opcoes={ESTADOS_DE_ATENDENTE}
      />
      <Escondidos atual={atual} exceto={['atendente', 'contato', 'status']} />
      <BotaoFiltros limpar={algum ? limpar : null} />
    </form>
  );
}
