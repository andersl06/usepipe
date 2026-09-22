import { Icone } from '@pipe/ui';
import { urlParaLimparFiltros } from '../lib/filtros-monitoramento';
import { Selecao } from './selecao';

/**
 * Faixa de filtros rápidos.
 *
 * A tela do Monitoramento tem DUAS, no mesmo desenho: uma acima da grade de
 * cartões e outra entre a grade e a tabela. É a disposição da Blip, lida em
 * `dom/monitoring.html`: "Filtros rápidos:" em 16/700 à esquerda (com os dois
 * pontos), os botões de 130×40 em seguida, e o botão "Filtros" com funil
 * encostado à direita.
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
    <Selecao className={valor ? 'pilula ativa' : 'pilula'} name={nome} defaultValue={valor} aria-label={rotulo}>
        <option value="">{rotulo}</option>
        {opcoes.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nome}
          </option>
        ))}
    </Selecao>
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
      <input
        type="search"
        name={nome}
        defaultValue={valor}
        /* Sem texto de marca d'água: na faixa deles a pílula mostra só o
           rótulo. A instrução viaja no `title`, que não ocupa a caixa. */
        title={dica}
        /* Um espaço só, para o CSS saber pelo `:placeholder-shown` que está
           vazio e recolher o campo: vazio e sem foco, a pílula é só o rótulo
           centrado, como o `bds-button` deles. */
        placeholder=" "
        aria-label={rotulo}
      />
    </label>
  );
}

/**
 * O botão da direita, igual nas duas faixas: `bds-button icon-left="filter"
 * variant="outline"`, com o funil de 20px (`bds-icon size="small"`). Aplica o
 * que as pílulas dizem. "Limpar" só aparece quando há o que limpar — na tela
 * deles ele mora no rodapé do painel ("Limpar tudo"); aqui fica ao lado
 * porque o painel não abre a partir da faixa.
 */
function BotaoFiltros({
  limpar,
  aoAbrirPainel,
}: {
  limpar: string | null;
  aoAbrirPainel?: () => void;
}) {
  return (
    <div className="faixa-fim">
      {limpar ? (
        <a href={limpar} className="btn fantasma">
          Limpar tudo
        </a>
      ) : null}
      <button
        type={aoAbrirPainel ? 'button' : 'submit'}
        className="btn"
        title="Abrir filtros"
        onClick={aoAbrirPainel}
      >
        <Icone nome="funil" tamanho={20} />
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
 * cartões junto com a tabela — a fila entra na consulta.
 *
 * Na tela deles esta faixa tem UM botão só, "Filas" (`dom/monitoring.html`:
 * a primeira `bds-grid gap="2"` com "Filtros rápidos:" traz um único
 * `bds-button` antes do `ml-a`). "Atendentes" mora só na faixa de baixo.
 */
export function FiltrosDaOperacao({
  filas,
  atual,
  base,
  aoAbrirPainel,
}: {
  filas: readonly Opcao[];
  atual: Parametros;
  base: string;
  aoAbrirPainel: () => void;
}) {
  const algum = Boolean(atual.fila);
  return (
    <form className="faixa-filtros" method="get" action={base}>
      <span className="lbl">Filtros rápidos:</span>
      <Pilula nome="fila" rotulo="Filas" valor={atual.fila ?? ''} opcoes={filas} />
      <Escondidos atual={atual} exceto={['fila']} />
      <BotaoFiltros
        limpar={algum ? urlParaLimparFiltros(base, atual) : null}
        aoAbrirPainel={aoAbrirPainel}
      />
    </form>
  );
}

/* As opções do `bds-select` "Status do atendente" deles: "Online", "Em Pausa",
   "Invisível" (e "Offline", que a nossa carga por atendente não distingue —
   fica de fora em vez de virar opção que nunca casa). */
const ESTADOS_DE_ATENDENTE: readonly Opcao[] = [
  { id: 'online', nome: 'Online' },
  { id: 'pausa', nome: 'Em Pausa' },
  { id: 'invisivel', nome: 'Invisível' },
];

/**
 * Segunda faixa, entre a grade e a tabela: recorta a LISTA, e não toca nos
 * cartões — contato e status do atendente filtram linha, não população.
 *
 * "Atendentes", "Contato" e "Status do atendente" — os três botões da segunda
 * faixa deles, nesta ordem.
 */
export function FiltrosDaLista({
  atendentes,
  atual,
  base,
  aoAbrirPainel,
}: {
  atendentes: readonly Opcao[];
  atual: Parametros;
  base: string;
  aoAbrirPainel: () => void;
}) {
  const algum = Boolean(atual.atendente || atual.contato || atual.status);
  const limpar = urlParaLimparFiltros(base, atual, true);
  return (
    <form className="faixa-filtros" method="get" action={base}>
      <span className="lbl">Filtros rápidos:</span>
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
      <BotaoFiltros limpar={algum ? limpar : null} aoAbrirPainel={aoAbrirPainel} />
    </form>
  );
}
