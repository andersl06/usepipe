import Link from 'next/link';
import { Etiqueta } from '@pipe/ui';
import { fusoDoTenant, janelaDoMes } from '../lib/banco';
import { carregarIndicadores, leadsPorFase, leadsPorOrigem } from '../lib/painel';
import { carregarFunil } from '../lib/funil';
import { dinheiro, dinheiroCurto, numero, percentual } from '../lib/formato';

export const dynamic = 'force-dynamic';

/**
 * Variação contra o mês anterior. Só aparece quando há base de comparação.
 *
 * Vem com sinal e sem cor: um mês pior que o anterior não é um erro que
 * alguém resolva clicando, e pintar de vermelho o que a pessoa não pode
 * consertar é o que gasta a cor antes da hora.
 */
function Variacao({ atual, anterior }: { atual: number; anterior: number }) {
  if (anterior === 0) return null;
  const delta = (atual - anterior) / anterior;
  return (
    <span className="var">
      {delta >= 0 ? '+' : '−'}
      {percentual(Math.abs(delta))}
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
  const maiorColuna = funil.colunas.reduce((m, c) => Math.max(m, c.total), 0);

  return (
    <>
      <div className="p-cabecalho">
        <h2>Painel</h2>
        <span className="sub">{nomeDoMes.charAt(0).toUpperCase() + nomeDoMes.slice(1)}</span>
      </div>

      {/*
        Os indicadores são a legenda do mês, não o assunto: uma linha só, tipografia
        menor, sem caixa. Quando cinco cartões têm o mesmo peso do funil, o olho não
        sabe onde começar.
      */}
      <div className="resumo">
        <div>
          <b>{numero(ind.leadsNoMes)}</b>
          <span>
            leads no mês <Variacao atual={ind.leadsNoMes} anterior={ind.leadsNoMesAnterior} />
          </span>
        </div>
        <div>
          <b>{percentual(taxa)}</b>
          <span>
            qualificados · {numero(ind.qualificadosNoMes)} de {numero(ind.leadsNoMes)}
          </span>
        </div>
        <div>
          <b>{numero(ind.oportunidadesAbertas)}</b>
          <span>
            oportunidades abertas
            {ind.diasMediosAbertas === null ? '' : ` · ${numero(ind.diasMediosAbertas)} dias em média`}
          </span>
        </div>
        <div>
          <b>{dinheiroCurto(ind.emNegociacao)}</b>
          <span>em negociação · {dinheiroCurto(ind.valorPonderado)} ponderado</span>
        </div>
        <div>
          <b>{dinheiroCurto(ind.fechadoNoMes)}</b>
          <span>
            fechado no mês{' '}
            <Variacao atual={ind.fechadoNoMes} anterior={ind.fechadoNoMesAnterior} />
          </span>
        </div>
      </div>

      {/* O assunto da tela: como está o mês. Ocupa a largura porque é o que se lê primeiro. */}
      <div className="tblwrap">
        <header>
          <h3>Funil de oportunidades</h3>
          <span className="sub">
            {numero(funil.quantidadeGeral)} abertas · {dinheiro(funil.totalGeral)}
          </span>
          <Link href="/oportunidades" className="btn" style={{ marginLeft: 'auto' }}>
            Abrir o quadro
          </Link>
        </header>
        <div className="funil-barras">
          {funil.colunas.map((c) => (
            <div className="etapa" key={c.fase}>
              <span className="nome">{c.fase}</span>
              <span className="track">
                <span
                  className="fill"
                  style={{
                    width: `${maiorColuna > 0 ? Math.round((c.total / maiorColuna) * 100) : 0}%`,
                  }}
                />
              </span>
              <span className="valor">{dinheiro(c.total)}</span>
              <span className="qtd">{numero(c.quantidade)}</span>
            </div>
          ))}
        </div>
        <footer>
          Ponderado pela probabilidade da fase: {dinheiro(funil.ponderadoGeral)}. Perdido no mês:{' '}
          {dinheiro(ind.perdidoNoMes)}.
        </footer>
      </div>

      <div className="apoio">
        <div className="tblwrap">
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
                  <span className="nome">{o.origem}</span>
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

        <div className="tblwrap">
          <header>
            <b>Leads por fase</b>
            <span className="lbl">parados há 7 dias</span>
          </header>
          {fases.length === 0 ? (
            <div className="vazio">Sem leads em andamento.</div>
          ) : (
            <div className="campos">
              {fases.map((f) => (
                <div key={f.fase}>
                  <span className="k">{f.fase}</span>
                  <span className="v">
                    {numero(f.n)}
                    {f.parados > 0 ? (
                      <>
                        {' '}
                        {/*
                          A única cor deste cartão. Lead parado é o que custa dinheiro
                          e é o que alguém resolve clicando — o resto da linha é
                          contagem, e contagem não pede ação.
                        */}
                        <Link href="/leads?aba=parados">
                          <Etiqueta tom="alerta">{numero(f.parados)} parados</Etiqueta>
                        </Link>
                      </>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
