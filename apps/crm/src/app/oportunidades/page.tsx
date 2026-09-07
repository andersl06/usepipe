import Link from 'next/link';
import { Campo, Etiqueta, EstadoVazio, Tabela, type Coluna } from '@pipe/ui';
import { QuadroFunil, type CartaoView } from '../../componentes/quadro-funil';
import { fusoDoTenant } from '../../lib/banco';
import {
  carregarFunil,
  FASES,
  LIMITE_LISTA,
  listarOportunidades,
  SITUACOES,
  situacaoValida,
  type LinhaOportunidade,
} from '../../lib/funil';
import { data, dinheiro, numero } from '../../lib/formato';

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

function vistaValida(valor: string | undefined): Vista {
  return valor === 'tabela' ? 'tabela' : 'quadro';
}

function colunasDaTabela(hoje: Date, fuso: string): readonly Coluna<LinhaOportunidade>[] {
  return [
    {
      chave: 'nome',
      rotulo: 'Oportunidade',
      celula: (o) => <Link href={`/oportunidades/${o.id}`}>{o.nome}</Link>,
    },
    {
      chave: 'conta',
      rotulo: 'Conta',
      celula: (o) =>
        o.contaId ? <Link href={`/contas/${o.contaId}`}>{o.contaNome}</Link> : '—',
    },
    { chave: 'fase', rotulo: 'Fase', celula: (o) => <Etiqueta>{o.fase}</Etiqueta> },
    { chave: 'valor', rotulo: 'Valor', numerica: true, celula: (o) => dinheiro(o.valor) },
    {
      chave: 'probabilidade',
      rotulo: 'Probabilidade',
      numerica: true,
      celula: (o) => (o.probabilidade === null ? '—' : `${o.probabilidade}%`),
    },
    { chave: 'dono', rotulo: 'Proprietário', celula: (o) => o.proprietario ?? '—' },
    {
      chave: 'situacao',
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
        if (o.fechamentoPrevisto && o.fechamentoPrevisto < hoje) {
          return <Etiqueta tom="alerta">venceu em {data(o.fechamentoPrevisto, fuso)}</Etiqueta>;
        }
        return o.fechamentoPrevisto ? (
          <Etiqueta>fecha em {data(o.fechamentoPrevisto, fuso)}</Etiqueta>
        ) : (
          '—'
        );
      },
    },
  ];
}

export default async function PaginaOportunidades({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; situacao?: string; q?: string }>;
}) {
  const params = await searchParams;
  const vista = vistaValida(params.vista);
  const situacao = situacaoValida(params.situacao);
  const busca = params.q ?? '';

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
          <b>{numero(funil.quantidadeGeral)}</b>
          <span>oportunidades abertas</span>
        </div>
        <div>
          <b>{dinheiro(funil.totalGeral)}</b>
          <span>valor em negociação</span>
        </div>
        <div>
          <b>{dinheiro(funil.ponderadoGeral)}</b>
          <span>ponderado pela probabilidade</span>
        </div>
      </div>

      <div className="tblwrap">
        <div className="tabs" role="tablist">
          <Link href="/oportunidades" role="tab" aria-current={vista === 'quadro' ? 'true' : undefined}>
            Quadro
          </Link>
          <Link
            href="/oportunidades?vista=tabela"
            role="tab"
            aria-current={vista === 'tabela' ? 'true' : undefined}
          >
            Tabela
          </Link>
        </div>

        {vista === 'quadro' ? (
          <QuadroDoFunil funil={funil} />
        ) : (
          <TabelaDeOportunidades situacao={situacao} busca={busca} hoje={hoje} />
        )}
      </div>
    </>
  );
}

function QuadroDoFunil({ funil }: { funil: Awaited<ReturnType<typeof carregarFunil>> }) {
  const hoje = new Date();

  const cartoes: CartaoView[] = funil.colunas.flatMap((coluna) =>
    coluna.cartoes.map((c) => ({
      id: c.id,
      nome: c.nome,
      valorNum: c.valor ?? 0,
      valor: dinheiro(c.valor),
      detalhe: [
        c.proprietario ?? 'sem proprietário',
        c.score !== null ? `score ${numero(c.score)}` : null,
        c.probabilidade !== null ? `${c.probabilidade}%` : null,
      ]
        .filter((p) => p !== null)
        .join(' · '),
      fase: coluna.fase,
      // Fechamento no passado numa oportunidade que continua aberta: é a única
      // coisa do quadro que exige ação, e é a única que recebe cor.
      diasVencido:
        c.fechamentoPrevisto && c.fechamentoPrevisto < hoje
          ? Math.floor((hoje.getTime() - c.fechamentoPrevisto.getTime()) / 86_400_000)
          : null,
    })),
  );

  if (funil.quantidadeGeral === 0) {
    /*
      O vazio do quadro falava em `pnpm seed:crm`, que é comando de quem constrói
      o produto e não de quem o usa. Aqui ele diz de onde vem uma oportunidade,
      que é a única coisa útil quando não há nenhuma.
    */
    return (
      <EstadoVazio titulo="Nenhuma oportunidade aberta." ilustracao="concluido">
        <span>
          Oportunidade nasce de um lead qualificado. Assim que a primeira for aberta, ela aparece
          na coluna da fase em que estiver.
        </span>
        <span className="acoes-erro">
          <Link className="btn" href="/leads?aba=qualificados">
            Ver os leads qualificados
          </Link>
        </span>
      </EstadoVazio>
    );
  }

  return <QuadroFunil fases={FASES} cartoes={cartoes} />;
}

async function TabelaDeOportunidades({
  situacao,
  busca,
  hoje,
}: {
  situacao: ReturnType<typeof situacaoValida>;
  busca: string;
  hoje: Date;
}) {
  const fuso = await fusoDoTenant();
  const linhas = await listarOportunidades(situacao, busca);
  const semBusca = new URLSearchParams({ vista: 'tabela', situacao }).toString();

  return (
    <>
      <form className="tblhead" method="get" action="/oportunidades">
        <input type="hidden" name="vista" value="tabela" />
        <label className="agrupador">
          Situação
          <select className="seletor" name="situacao" defaultValue={situacao} aria-label="Situação">
            {SITUACOES.map((s) => (
              <option key={s.chave} value={s.chave}>
                {s.rotulo}
              </option>
            ))}
          </select>
        </label>
        <Campo
          type="search"
          name="q"
          defaultValue={busca}
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

      {linhas.length === 0 && busca ? (
        <EstadoVazio titulo="Nenhuma oportunidade para esta busca." ilustracao="busca">
          <span>Nada casou com “{busca}” no nome da oportunidade nem no da conta.</span>
          <span className="acoes-erro">
            <Link className="btn" href={`/oportunidades?${semBusca}`}>
              Limpar a busca
            </Link>
          </span>
        </EstadoVazio>
      ) : (
        <Tabela
          colunas={colunasDaTabela(hoje, fuso)}
          linhas={linhas}
          chaveDaLinha={(o) => o.id}
          vazio="Nenhuma oportunidade neste recorte."
        />
      )}
    </>
  );
}
