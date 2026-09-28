import { useSearchParams } from 'react-router-dom';
import type { ReportEffort } from '../../lib/effort';
import { useRead } from '../../lib/query';
import { dataOuNada, durationLong, numero, percentual } from '../../lib/format';
import { useContact } from '../flow/contact';
import { attendanceBase } from './shell';

interface EffortResponse {
  fuso: string;
  de: string;
  ate: string;
  relatorio: ReportEffort;
}

interface Search {
  de?: string;
  ate?: string;
}

export function PageEffort() {
  const { contact } = useContact();
  const base = attendanceBase(contact);
  const [search] = useSearchParams();
  const crus = Object.fromEntries(search.entries()) as Search;
  /*
   * Malformed date becomes "no filter": `?de=abc` used to reach Postgres's `::date` cast and take down the whole screen with a 500.
   */
  const params: Search = { de: dataOuNada(crus.de), ate: dataOuNada(crus.ate) };
  const q = new URLSearchParams();
  if (params.de) q.set('from', params.de);
  if (params.ate) q.set('to', params.ate);
  const read = useRead<EffortResponse>(`/v1/management/reports/effort?${q}`);
  if (!read.data) return null;
  const { de, ate, relatorio: report } = read.data;
  const totalEffort = report.agents.reduce((t, a) => t + a.effortSeg, 0);
  const totalTickets = report.agents.reduce((t, a) => t + a.tickets, 0);

  return (
    <>
      <div className="board-head">
        <h2>Esforço por atendente</h2>
        <span className="sub">
          Régua determinística: 200 caracteres/min escritos, 1.000 lidos, áudio em 1×.
        </span>
      </div>

      {/*
 * 56px filter strip, in the place and order of their strip: label and controls on the left, period and action on the right.
 */}
      <form className="quickfilters" method="get" action={`${base}/effort`}>
        <span className="lbl">Filtros rápidos:</span>
        <input type="date" name="de" defaultValue={de} className="btn" aria-label="De" />
        <input type="date" name="ate" defaultValue={ate} className="btn" aria-label="Até" />
        <div className="faixa-fim">
          <button type="submit" className="btn primary">
            Aplicar
          </button>
        </div>
      </form>

      {/*
 * ------------------------------------------------------------ block 1
 * Their reports' block structure, measured in `referencias-blip/pesquisa/blip-medidas-monitoramento.md` §6: a card that CONTAINS cards. The label comes on top in 14/600 and the value below in 20/700 — the opposite of the Monitoramento card, where the value comes first and is 24/400.
 */}
      <section className="block-rel">
        <h3>Total do período</h3>
        <div className="block-rel-grid" style={{ '--rel-colunas': 3 } as React.CSSProperties}>
          <div className="card-rel">
            <span className="r">Esforço somado</span>
            <span className="v">{durationLong(totalEffort)}</span>
            <span className="den">{numero(totalTickets)} tickets</span>
          </div>
          <div className="card-rel">
            <span className="r">Esforço médio por ticket</span>
            <span className="v">
              {durationLong(totalTickets > 0 ? totalEffort / totalTickets : null)}
            </span>
            <span className="den">soma ÷ soma, nunca média de médias</span>
          </div>
          <div className="card-rel">
            <span className="r">Conversas no período</span>
            <span className="v">{numero(report.conversationsConsidered)}</span>
            <span className="den">
              {numero(report.conversationsWithoutAgent)} sem atendente identificado
            </span>
          </div>
        </div>
        <p className="note">
          A régua assume texto digitado à mão. Por isso o conteúdo vindo de resposta pronta e de
          template sai do esforço e aparece em coluna separada, porque contá-lo infla o esforço de
          quem só clicou.
        </p>
      </section>

      {/* ------------------------------------------------------ bloco 2 */}
      <section className="block-rel">
        <h3>
          Por atendente <span className="sub">{`${de} → ${ate}`}</span>
        </h3>

        {report.agents.length === 0 ? (
          <div className="card-rel">
            <div className="empty">
              <b>
                Nenhuma conversa encerrada com atendente entre {de} e {ate}.
              </b>
              <p>
                {report.conversationsWithoutAgent > 0
                  ? `${numero(report.conversationsWithoutAgent)} conversa(s) do período fecharam sem atendente identificado — elas não têm a quem atribuir esforço.`
                  : 'Só entra aqui conversa já encerrada. Alargue o período acima para alcançar o movimento anterior.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="card-rel tabela scroll">
            <table>
              <thead>
                <tr>
                  <th>Atendente</th>
                  <th>Tickets</th>
                  <th>Esforço</th>
                  <th>Por ticket</th>
                  <th>Escrito</th>
                  <th>Lido</th>
                  <th>Áudio ouvido</th>
                  <th>Áudio gravado</th>
                  <th>Sessão</th>
                  <th>Ocupação</th>
                  <th>Resposta pronta e template</th>
                </tr>
              </thead>
              <tbody>
                {report.agents.map((a) => (
                  <tr key={a.id}>
                    <td className="who">{a.name}</td>
                    <td className="num">{numero(a.tickets)}</td>
                    <td className="num">{durationLong(a.effortSeg)}</td>
                    <td className="num">{durationLong(a.effortByTicketSeg)}</td>
                    <td className="num">{numero(a.charsEscritos)} car.</td>
                    <td className="num">{numero(a.charsLidos)} car.</td>
                    <td className="num">{durationLong(a.audioOuvidoSeg)}</td>
                    <td className="num">{durationLong(a.audioGravadoSeg)}</td>
                    <td className="num">{durationLong(a.sessionSeg)}</td>
                    <td className="num">{percentual(a.occupancy)}</td>
                    <td className="num">
                      {numero(a.charsDeRespostaPronta)} car. ·{' '}
                      {durationLong(a.effortResponseReadySeg)} descontados
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
