import Link from 'next/link';
import { fusoDoTenant, janelaDoMes } from '../lib/banco';
import { carregarIndicadores, leadsPorFase, leadsPorOrigem } from '../lib/painel';
import { carregarFunil } from '../lib/funil';
import { dinheiroCurto, numero, percentual } from '../lib/formato';

export const dynamic = 'force-dynamic';

/** Variação em pontos percentuais ou percentual, com o sinal e a cor certos. */
function Variacao({ atual, anterior, sufixo }: { atual: number; anterior: number; sufixo: string }) {
  if (anterior === 0) return <span className="d">sem base de comparação</span>;
  const delta = (atual - anterior) / anterior;
  const classe = delta >= 0 ? 'd up' : 'd down';
  const sinal = delta >= 0 ? '+' : '−';
  return (
    <span className={classe}>
      {sinal}
      {percentual(Math.abs(delta))} {sufixo}
    </span>
  );
}

export default async function PaginaPainel() {
  const fuso = await fusoDoTenant();
  const mes = await janelaDoMes(fuso);
  const mesAnterior = await janelaDoMes(fuso, 1);
  const ind = await carregarIndicadores(mes, mesAnterior);
  const funil = await carregarFunil();
  const origens = await leadsPorOrigem(mes);
  const fases = await leadsPorFase();

  const nomeDoMes = mes.inicio.toLocaleDateString('pt-BR', {
    timeZone: fuso,
    month: 'long',
    year: 'numeric',
  });
  const taxa = ind.leadsNoMes > 0 ? ind.qualificadosNoMes / ind.leadsNoMes : null;
  const maiorOrigem = origens.reduce((m, o) => Math.max(m, o.n), 0);

  return (
    <>
      <div className="board-head">
        <h2>Painel</h2>
        <span className="sub">
          {nomeDoMes.charAt(0).toUpperCase() + nomeDoMes.slice(1)} · números do mês corrente no fuso
          do tenant
        </span>
        <div className="filters">
          <Link href="/leads" className="btn">
            Ver leads
          </Link>
          <Link href="/oportunidades" className="btn primary">
            Abrir o funil
          </Link>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <span className="v">{numero(ind.leadsNoMes)}</span>
          <span className="k">Leads no mês</span>
          <Variacao atual={ind.leadsNoMes} anterior={ind.leadsNoMesAnterior} sufixo="vs. mês ant." />
        </div>
        <div className="kpi">
          <span className="v">{percentual(taxa)}</span>
          <span className="k">Taxa de qualificação</span>
          <span className="d">
            {numero(ind.qualificadosNoMes)} de {numero(ind.leadsNoMes)}
          </span>
        </div>
        <div className="kpi">
          <span className="v">{numero(ind.oportunidadesAbertas)}</span>
          <span className="k">Oportunidades abertas</span>
          <span className="d">
            {ind.diasMediosAbertas === null
              ? '—'
              : `média de ${numero(ind.diasMediosAbertas)} dias em aberto`}
          </span>
        </div>
        <div className="kpi">
          <span className="v">{dinheiroCurto(ind.emNegociacao)}</span>
          <span className="k">Em negociação</span>
          <span className="d">valor ponderado {dinheiroCurto(ind.valorPonderado)}</span>
        </div>
        <div className="kpi">
          <span className="v">{dinheiroCurto(ind.fechadoNoMes)}</span>
          <span className="k">Fechado no mês</span>
          <Variacao
            atual={ind.fechadoNoMes}
            anterior={ind.fechadoNoMesAnterior}
            sufixo="vs. mês ant."
          />
        </div>
      </div>

      <div className="crmgrid">
        <div className="funnel">
          <div className="fh">
            <h3>Funil de oportunidades</h3>
            <span className="lbl" style={{ marginLeft: 'auto' }}>
              {numero(funil.quantidadeGeral)} abertas · {dinheiroCurto(funil.totalGeral)}
            </span>
          </div>
          <div className="bars">
            {funil.colunas.map((c) => (
              <div className="bar-row" key={c.fase}>
                <span className="nome">
                  <span>{c.fase}</span>
                </span>
                <span className="track">
                  <span
                    className="fill"
                    style={{
                      width: `${funil.totalGeral > 0 ? Math.round((c.total / funil.totalGeral) * 100) : 0}%`,
                    }}
                  />
                </span>
                <span className="n">{dinheiroCurto(c.total)}</span>
              </div>
            ))}
          </div>
          <div className="mensagem">
            Valor ponderado pela probabilidade da fase: {dinheiroCurto(funil.ponderadoGeral)}. Perdido
            no mês: {dinheiroCurto(ind.perdidoNoMes)}.
          </div>
        </div>

        <div className="coluna">
          <div className="bloco-card">
            <header>
              <b>Origem dos leads</b>
              <span className="lbl">no mês</span>
            </header>
            {origens.length === 0 ? (
              <div className="vazio">Nenhum lead neste mês.</div>
            ) : (
              <div className="bars">
                {origens.map((o) => (
                  <div className="bar-row" key={o.origem}>
                    <span className="nome">
                      <span>{o.origem}</span>
                    </span>
                    <span className="track">
                      <span
                        className="fill"
                        style={{
                          width: `${maiorOrigem > 0 ? Math.round((o.n / maiorOrigem) * 100) : 0}%`,
                        }}
                      />
                    </span>
                    <span className="n">{numero(o.n)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bloco-card">
            <header>
              <b>Leads por fase</b>
              <span className="lbl">parados há 7 dias</span>
            </header>
            <div className="campos">
              {fases.map((f) => (
                <div key={f.fase}>
                  <span className="k">{f.fase}</span>
                  <span className="v">
                    {numero(f.n)}
                    {f.parados > 0 ? (
                      <>
                        {' '}
                        <Link href="/leads?aba=parados" className="pill hi">
                          {numero(f.parados)} parados
                        </Link>
                      </>
                    ) : null}
                  </span>
                </div>
              ))}
              {fases.length === 0 ? <div className="vazio">Sem leads em andamento.</div> : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
