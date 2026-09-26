import Link from 'next/link';
import { Campo, Etiqueta, EmptyState, Tabela, type Column } from '@pipe/ui';
import { QuadroFunil, type CardView } from '../../components/quadro-funil';
import { fusoDoTenant } from '../../lib/database';
import {
  carregarFunil,
  FASES,
  LIMITE_LISTA,
  listOpportunities,
  SITUATIONS,
  situationValid,
  type OpportunityRow,
} from '../../lib/funil';
import { data, money, numero } from '../../lib/format';

export const dynamic = 'force-dynamic';

/**
 * Opportunities: the same object in two views.
 *
 * The board answers **how the funnel looks**; the table answers **which ones
 * there are**. They're different questions, and Twenty solves both at the same
 * address by swapping the view type — that's what we do with `?vista=`. A screen
 * view doesn't deserve its own route: the address belongs to the object, not to
 * the layout.
 *
 * Two content differences between them, and both are deliberate:
 *
 * - **The board only shows open opportunities.** Dragging a closed one makes no
 *   sense, and a column with the entire history would stop fitting on screen.
 * - **The table shows the closed ones**, in slices. It's the one that answers
 *   "what did we win" and "what did we lose, and why" — which is the
 *   end-of-month question.
 */

type Vista = 'quadro' | 'tabela';

function vistaValida(value: string | undefined): Vista {
  return value === 'tabela' ? 'tabela' : 'quadro';
}

function colunasDaTabela(hoje: Date, fuso: string): readonly Column<OpportunityRow>[] {
  return [
    {
      key: 'nome',
      rotulo: 'Oportunidade',
      celula: (o) => <Link href={`/opportunities/${o.id}`}>{o.nome}</Link>,
    },
    {
      key: 'conta',
      rotulo: 'Conta',
      celula: (o) =>
        o.accountId ? <Link href={`/accounts/${o.accountId}`}>{o.accountName}</Link> : '—',
    },
    { key: 'fase', rotulo: 'Fase', celula: (o) => <Etiqueta>{o.fase}</Etiqueta> },
    { key: 'valor', rotulo: 'Valor', numerica: true, celula: (o) => money(o.value) },
    {
      key: 'probabilidade',
      rotulo: 'Probabilidade',
      numerica: true,
      celula: (o) => (o.probability === null ? '—' : `${o.probability}%`),
    },
    { key: 'dono', rotulo: 'Proprietário', celula: (o) => o.proprietario ?? '—' },
    {
      key: 'situacao',
      rotulo: 'Situação',
      // The table's only color: an overdue close date on an opportunity that
      // is still open. It's what demands action today; everything else is a category.
      celula: (o) => {
        if (o.fechadaEm) {
          return (
            <Etiqueta>
              {o.ganha ? 'Ganha' : 'Perdida'} em {data(o.fechadaEm, fuso)}
            </Etiqueta>
          );
        }
        if (o.closingExpected && o.closingExpected < hoje) {
          return <Etiqueta tom="alerta">venceu em {data(o.closingExpected, fuso)}</Etiqueta>;
        }
        return o.closingExpected ? (
          <Etiqueta>fecha em {data(o.closingExpected, fuso)}</Etiqueta>
        ) : (
          '—'
        );
      },
    },
  ];
}

export default async function PageOpportunities({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; situation?: string; q?: string }>;
}) {
  const params = await searchParams;
  const vista = vistaValida(params.vista);
  const situation = situationValid(params.situation);
  const search = params.q ?? '';

  const funil = await carregarFunil();
  const hoje = new Date();

  return (
    <>
      <div className="p-cabecalho">
        <h2>Oportunidades</h2>
        <span className="sub">
          {vista === 'quadro'
            ? 'Arraste o cartão entre as colunas — a probabilidade acompanha a fase, e é ela que dá o valor ponderado.'
            : 'A tabela mostra também as fechadas: é ela que responde o que foi ganho e o que foi perdido.'}
        </span>
      </div>

      {/*
 * The numbers are for the OPEN funnel in both views, on purpose: they answer
 * "how much is at stake right now", and what's already closed isn't part of
 * that.
 */}
      <div className="resumo">
        <div>
          <b>{numero(funil.quantityGeneral)}</b>
          <span>oportunidades abertas</span>
        </div>
        <div>
          <b>{money(funil.totalGeral)}</b>
          <span>valor em negociação</span>
        </div>
        <div>
          <b>{money(funil.ponderadoGeral)}</b>
          <span>ponderado pela probabilidade</span>
        </div>
      </div>

      <div className="tblwrap">
        <div className="tabs" role="tablist">
          <Link href="/opportunities" role="tab" aria-current={vista === 'quadro' ? 'true' : undefined}>
            Quadro
          </Link>
          <Link
            href="/opportunities?vista=tabela"
            role="tab"
            aria-current={vista === 'tabela' ? 'true' : undefined}
          >
            Tabela
          </Link>
        </div>

        {vista === 'quadro' ? (
          <QuadroDoFunil funil={funil} />
        ) : (
          <OpportunitiesTable situation={situation} search={search} hoje={hoje} />
        )}
      </div>
    </>
  );
}

function QuadroDoFunil({ funil }: { funil: Awaited<ReturnType<typeof carregarFunil>> }) {
  const hoje = new Date();

  const cards: CardView[] = funil.colunas.flatMap((column) =>
    column.cards.map((c) => ({
      id: c.id,
      nome: c.nome,
      valueNum: c.value ?? 0,
      value: money(c.value),
      detalhe: [
        c.proprietario ?? 'sem proprietário',
        c.score !== null ? `score ${numero(c.score)}` : null,
        c.probability !== null ? `${c.probability}%` : null,
      ]
        .filter((p) => p !== null)
        .join(' · '),
      fase: column.fase,
      // An overdue close date on an opportunity that's still open: it's the only
      // thing on the board that demands action, and it's the only one that gets color.
      diasVencido:
        c.closingExpected && c.closingExpected < hoje
          ? Math.floor((hoje.getTime() - c.closingExpected.getTime()) / 86_400_000)
          : null,
    })),
  );

  if (funil.quantityGeneral === 0) {
    /*
     * The board's empty state used to mention `pnpm seed:crm`, which is a command
     * for whoever builds the product, not whoever uses it. Here it says where an
     * opportunity comes from, which is the only useful thing to say when there are
     * none.
     */
    return (
      <EmptyState titulo="Nenhuma oportunidade aberta." illustration="concluido">
        <span>
          Oportunidade nasce de um lead qualificado. Assim que a primeira for aberta, ela aparece
          na coluna da fase em que estiver.
        </span>
        <span className="actions-error">
          <Link className="btn" href="/leads?tab=qualificados">
            Ver os leads qualificados
          </Link>
        </span>
      </EmptyState>
    );
  }

  return <QuadroFunil fases={FASES} cards={cards} />;
}

async function OpportunitiesTable({
  situation,
  search,
  hoje,
}: {
  situation: ReturnType<typeof situationValid>;
  search: string;
  hoje: Date;
}) {
  const fuso = await fusoDoTenant();
  const linhas = await listOpportunities(situation, search);
  const withoutSearch = new URLSearchParams({ vista: 'tabela', situation }).toString();

  return (
    <>
      <form className="tblhead" method="get" action="/opportunities">
        <input type="hidden" name="vista" value="tabela" />
        <label className="agrupador">
          Situação
          <select className="seletor" name="situacao" defaultValue={situation} aria-label="Situação">
            {SITUATIONS.map((s) => (
              <option key={s.chave} value={s.chave}>
                {s.rotulo}
              </option>
            ))}
          </select>
        </label>
        <Campo
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Buscar por oportunidade ou conta"
          aria-label="Buscar oportunidade"
        />
        <button type="submit" className="btn">
          Aplicar
        </button>
        <span className="sub" style={{ marginLeft: 'auto' }}>
          {numero(linhas.length)} oportunidades
          {linhas.length === LIMITE_LISTA ? ` · teto de ${LIMITE_LISTA}` : ''}
        </span>
      </form>

      {linhas.length === 0 && search ? (
        <EmptyState titulo="Nenhuma oportunidade para esta busca." illustration="busca">
          <span>Nada casou com “{search}” no nome da oportunidade nem no da conta.</span>
          <span className="actions-error">
            <Link className="btn" href={`/opportunities?${withoutSearch}`}>
              Limpar a busca
            </Link>
          </span>
        </EmptyState>
      ) : (
        <Tabela
          colunas={colunasDaTabela(hoje, fuso)}
          linhas={linhas}
          rowKey={(o) => o.id}
          empty="Nenhuma oportunidade neste recorte."
        />
      )}
    </>
  );
}
