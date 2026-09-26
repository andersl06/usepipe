import Link from 'next/link';
import { Etiqueta } from '@pipe/ui';
import { fusoDoTenant, monthWindow } from '../lib/database';
import { carregarIndicadores, leadsByStage, leadsByOrigin } from '../lib/panel';
import { carregarFunil } from '../lib/funil';
import { money, moneyShort, numero, percentual } from '../lib/format';

export const dynamic = 'force-dynamic';

/**
 * Variation against the previous month. Only shows up when there's a basis for
 * comparison.
 *
 * It comes with a sign and no color: a worse month than the last one isn't an
 * error someone fixes by clicking, and painting red something the person can't
 * fix is what burns out the color before it matters.
 */
function Variation({ atual, anterior }: { atual: number; anterior: number }) {
  if (anterior === 0) return null;
  const delta = (atual - anterior) / anterior;
  return (
    <span className="var">
      {delta >= 0 ? '+' : '−'}
      {percentual(Math.abs(delta))}
    </span>
  );
}

export default async function PagePanel() {
  const fuso = await fusoDoTenant();
  const mes = await monthWindow(fuso);
  const mesAnterior = await monthWindow(fuso, 1);
  const ind = await carregarIndicadores(mes, mesAnterior);
  const funil = await carregarFunil();
  const origens = await leadsByOrigin(mes);
  const fases = await leadsByStage();

  const nomeDoMes = mes.inicio.toLocaleDateString('pt-BR', {
    timeZone: fuso,
    month: 'long',
    year: 'numeric',
  });
  const taxa = ind.leadsNoMes > 0 ? ind.qualificadosNoMes / ind.leadsNoMes : null;
  const maiorOrigem = origens.reduce((m, o) => Math.max(m, o.n), 0);
  const longestColumn = funil.colunas.reduce((m, c) => Math.max(m, c.total), 0);

  return (
    <>
      <div className="p-cabecalho">
        <h2>Painel</h2>
        <span className="sub">{nomeDoMes.charAt(0).toUpperCase() + nomeDoMes.slice(1)}</span>
      </div>

      {/*
 * The indicators are the month's caption, not the main subject: a single line,
 * smaller type, no box. When five cards carry the same visual weight as the
 * funnel, the eye doesn't know where to start.
 */}
      <div className="resumo">
        <div>
          <b>{numero(ind.leadsNoMes)}</b>
          <span>
            leads no mês <Variation atual={ind.leadsNoMes} anterior={ind.leadsNoMesAnterior} />
          </span>
        </div>
        <div>
          <b>{percentual(taxa)}</b>
          <span>
            qualificados · {numero(ind.qualificadosNoMes)} de {numero(ind.leadsNoMes)}
          </span>
        </div>
        <div>
          <b>{numero(ind.opportunitiesOpen)}</b>
          <span>
            oportunidades abertas
            {ind.diasMediosAbertas === null ? '' : ` · ${numero(ind.diasMediosAbertas)} dias em média`}
          </span>
        </div>
        <div>
          <b>{moneyShort(ind.inNegotiation)}</b>
          <span>em negociação · {moneyShort(ind.valueWeighted)} ponderado</span>
        </div>
        <div>
          <b>{moneyShort(ind.fechadoNoMes)}</b>
          <span>
            fechado no mês{' '}
            <Variation atual={ind.fechadoNoMes} anterior={ind.fechadoNoMesAnterior} />
          </span>
        </div>
      </div>

      {/*
 * The screen's subject: how the month is going. It takes the full width because
 * it's what gets read first.
 */}
      <div className="tblwrap">
        <header>
          <h3>Funil de oportunidades</h3>
          <span className="sub">
            {numero(funil.quantityGeneral)} abertas · {money(funil.totalGeral)}
          </span>
          <Link href="/opportunities" className="btn" style={{ marginLeft: 'auto' }}>
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
                    width: `${longestColumn > 0 ? Math.round((c.total / longestColumn) * 100) : 0}%`,
                  }}
                />
              </span>
              <span className="value">{money(c.total)}</span>
              <span className="qtd">{numero(c.quantity)}</span>
            </div>
          ))}
        </div>
        <footer>
          Ponderado pela probabilidade da fase: {money(funil.ponderadoGeral)}. Perdido no mês:{' '}
          {money(ind.perdidoNoMes)}.
        </footer>
      </div>

      <div className="apoio">
        <div className="tblwrap">
          <header>
            <b>Origem dos leads</b>
            <span className="lbl">no mês</span>
          </header>
          {origens.length === 0 ? (
            <div className="empty">Nenhum lead neste mês.</div>
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
            <div className="empty">Sem leads em andamento.</div>
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
 * This card's only color. A stalled lead is what costs money and is what
 * someone fixes by clicking — the rest of the row is a count, and a count
 * doesn't call for action.
 */}
                        <Link href="/leads?tab=parados">
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
