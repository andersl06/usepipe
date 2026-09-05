import { fusoDoTenant, janelaDeDatas, janelaDeHoje } from '../../../lib/banco';
import { carregarEsforco } from '../../../lib/esforco';
import { dataIso, duracaoLonga, numero, percentual } from '../../../lib/formato';

export const dynamic = 'force-dynamic';

interface Busca {
  de?: string;
  ate?: string;
}

export default async function PaginaEsforco({ searchParams }: { searchParams: Promise<Busca> }) {
  const params = await searchParams;
  const fuso = await fusoDoTenant();
  const hoje = await janelaDeHoje(fuso);

  const ate = params.ate || dataIso(hoje.inicio, fuso);
  const de = params.de || dataIso(new Date(hoje.inicio.getTime() - 6 * 86400e3), fuso);
  const janela = await janelaDeDatas(fuso, de, ate);

  const relatorio = await carregarEsforco(janela);
  const totalEsforco = relatorio.atendentes.reduce((t, a) => t + a.esforcoSeg, 0);
  const totalTickets = relatorio.atendentes.reduce((t, a) => t + a.tickets, 0);

  return (
    <>
      <div className="board-head">
        <h2>Esforço por atendente</h2>
        <span className="sub">
          Régua determinística: 200 caracteres/min escritos, 1.000 lidos, áudio em 1×.
        </span>
      </div>

      <form className="quickfilters" method="get" action="/relatorios/esforco">
        <span className="lbl">Semana</span>
        <input type="date" name="de" defaultValue={de} className="btn" aria-label="De" />
        <input type="date" name="ate" defaultValue={ate} className="btn" aria-label="Até" />
        <button type="submit" className="btn primary">
          Aplicar
        </button>
      </form>

      <div className="mon" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
        <div className="card">
          <h3>Total do período</h3>
          <div className="metrics">
            <div className="metric accent">
              <span className="v">{duracaoLonga(totalEsforco)}</span>
              <span className="k">Esforço somado</span>
              <span className="den">{numero(totalTickets)} tickets</span>
            </div>
            <div className="metric">
              <span className="v">
                {duracaoLonga(totalTickets > 0 ? totalEsforco / totalTickets : null)}
              </span>
              <span className="k">Esforço médio por ticket</span>
              <span className="den">soma ÷ soma, nunca média de médias</span>
            </div>
            <div className="metric">
              <span className="v">{numero(relatorio.conversasConsideradas)}</span>
              <span className="k">Conversas no período</span>
              <span className="den">
                {numero(relatorio.conversasSemAtendente)} sem atendente identificado
              </span>
            </div>
          </div>
          <div className="note">
            A régua assume texto digitado à mão. Por isso o conteúdo vindo de resposta pronta e de
            template sai do esforço e aparece em coluna separada — contá-lo infla o esforço de quem
            só clicou.
          </div>
        </div>
      </div>

      <div className="tblwrap">
        <div className="tblhead">
          <h3>Por atendente</h3>
          <span className="lbl" style={{ marginLeft: 'auto' }}>
            {de} → {ate}
          </span>
        </div>

        {relatorio.atendentes.length === 0 ? (
          <div className="vazio">Nenhuma conversa encerrada com atendente neste período.</div>
        ) : (
          <div className="scroll">
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
                {relatorio.atendentes.map((a) => (
                  <tr key={a.id}>
                    <td className="who">{a.nome}</td>
                    <td className="num">{numero(a.tickets)}</td>
                    <td className="num">{duracaoLonga(a.esforcoSeg)}</td>
                    <td className="num">{duracaoLonga(a.esforcoPorTicketSeg)}</td>
                    <td className="num">{numero(a.charsEscritos)} car.</td>
                    <td className="num">{numero(a.charsLidos)} car.</td>
                    <td className="num">{duracaoLonga(a.audioOuvidoSeg)}</td>
                    <td className="num">{duracaoLonga(a.audioGravadoSeg)}</td>
                    <td className="num">{duracaoLonga(a.sessaoSeg)}</td>
                    <td className="num">{percentual(a.ocupacao)}</td>
                    <td className="num">
                      {numero(a.charsDeRespostaPronta)} car. ·{' '}
                      {duracaoLonga(a.esforcoRespostaProntaSeg)} descontados
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
