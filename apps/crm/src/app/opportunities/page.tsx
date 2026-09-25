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
  type LinhaOpportunity,
} from '../../lib/funil';
import { data, money, numero } from '../../lib/format';

export const dynamic = 'force-dynamic';

/**
 * Oportunidades: o mesmo objeto em duas visões.
 *
 * O quadro responde **como está o funil**; a tabela responde **quais são**. São
 * perguntas diferentes, e o Twenty resolve as duas no mesmo endereço trocando o
 * tipo de visão — é o que fazemos com `?vista=`. Uma visão de tela não merece
 * uma rota própria: o endereço é do objeto, não do desenho.
 *
 * Duas diferenças de conteúdo entre elas, e as duas são deliberadas:
 *
 * - **O quadro só mostra oportunidade aberta.** Arrastar uma fechada não faz
 *   sentido, e uma coluna com o histórico inteiro deixaria de caber na tela.
 * - **A tabela mostra as fechadas**, em recortes. É ela que responde "o que
 *   ganhamos" e "o que perdemos, e por quê" — que é a pergunta do fim do mês.
 */

type Vista = 'quadro' | 'tabela';

function vistaValida(value: string | undefined): Vista {
  return value === 'tabela' ? 'tabela' : 'quadro';
}

function colunasDaTabela(hoje: Date, fuso: string): readonly Column<LinhaOpportunity>[] {
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
      // A única cor da tabela: o fechamento que venceu numa oportunidade que
      // continua aberta. É o que exige ação hoje; o resto é categoria.
      celula: (o) => {
        if (o.fechadaEm) {
          return (
            <Etiqueta>
              {o.ganha ? 'Ganha' : 'Perdida'} em {data(o.fechadaEm, fuso)}
            </Etiqueta>
          );
        }
        if (o.closingPrevisto && o.closingPrevisto < hoje) {
          return <Etiqueta tom="alert">venceu em {data(o.closingPrevisto, fuso)}</Etiqueta>;
        }
        return o.closingPrevisto ? (
          <Etiqueta>fecha em {data(o.closingPrevisto, fuso)}</Etiqueta>
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

      {/* Os números são do funil ABERTO nas duas visões, de propósito: eles
          respondem "quanto está em jogo agora", e o que já fechou não está. */}
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
          <OpportunitiesTabela situation={situation} search={search} hoje={hoje} />
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
      valorNum: c.value ?? 0,
      valor: money(c.value),
      detalhe: [
        c.proprietario ?? 'sem proprietário',
        c.score !== null ? `score ${numero(c.score)}` : null,
        c.probability !== null ? `${c.probability}%` : null,
      ]
        .filter((p) => p !== null)
        .join(' · '),
      fase: column.fase,
      // Fechamento no passado numa oportunidade que continua aberta: é a única
      // coisa do quadro que exige ação, e é a única que recebe cor.
      diasVencido:
        c.closingPrevisto && c.closingPrevisto < hoje
          ? Math.floor((hoje.getTime() - c.closingPrevisto.getTime()) / 86_400_000)
          : null,
    })),
  );

  if (funil.quantityGeneral === 0) {
    /*
      O vazio do quadro falava em `pnpm seed:crm`, que é comando de quem constrói
      o produto e não de quem o usa. Aqui ele diz de onde vem uma oportunidade,
      que é a única coisa útil quando não há nenhuma.
    */
    return (
      <EmptyState titulo="Nenhuma oportunidade aberta." illustration="concluido">
        <span>
          Oportunidade nasce de um lead qualificado. Assim que a primeira for aberta, ela aparece
          na coluna da fase em que estiver.
        </span>
        <span className="acoes-erro">
          <Link className="btn" href="/leads?tab=qualificados">
            Ver os leads qualificados
          </Link>
        </span>
      </EmptyState>
    );
  }

  return <QuadroFunil fases={FASES} cards={cards} />;
}

async function OpportunitiesTabela({
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
          <span className="acoes-erro">
            <Link className="btn" href={`/opportunities?${withoutSearch}`}>
              Limpar a busca
            </Link>
          </span>
        </EmptyState>
      ) : (
        <Tabela
          colunas={colunasDaTabela(hoje, fuso)}
          linhas={linhas}
          linhaKey={(o) => o.id}
          empty="Nenhuma oportunidade neste recorte."
        />
      )}
    </>
  );
}
