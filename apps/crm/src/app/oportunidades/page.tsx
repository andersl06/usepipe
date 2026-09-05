import { QuadroFunil, type CartaoView } from '../../componentes/quadro-funil';
import { carregarFunil, FASES } from '../../lib/funil';
import { dinheiro, numero } from '../../lib/formato';

export const dynamic = 'force-dynamic';

export default async function PaginaOportunidades() {
  const funil = await carregarFunil();

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
      leadId: c.leadId,
      fase: coluna.fase,
    })),
  );

  return (
    <>
      <div className="board-head">
        <h2>Oportunidades</h2>
        <span className="sub">
          Arraste o cartão entre as colunas — a probabilidade acompanha a fase, e é ela que dá o
          valor ponderado.
        </span>
      </div>

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

      <div className="funnel">
        <div className="fh">
          <h3>Funil de oportunidades</h3>
          <span className="lbl" style={{ marginLeft: 'auto' }}>
            quadro
          </span>
        </div>
        {funil.quantidadeGeral === 0 ? (
          <div className="vazio">
            Nenhuma oportunidade aberta. Rode <span className="mono">pnpm --filter @pipe/crm
            seed:crm</span> para semear o tenant demo.
          </div>
        ) : (
          <QuadroFunil fases={FASES} cartoes={cartoes} />
        )}
      </div>
    </>
  );
}
