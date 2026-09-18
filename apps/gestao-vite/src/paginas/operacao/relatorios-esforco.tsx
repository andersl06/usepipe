import { useSearchParams } from 'react-router-dom';
import type { RelatorioEsforco } from '../../lib/esforco';
import { useLeitura } from '../../lib/consulta';
import { dataOuNada, duracaoLonga, numero, percentual } from '../../lib/formato';

interface RespostaDoEsforco {
  fuso: string;
  de: string;
  ate: string;
  relatorio: RelatorioEsforco;
}

interface Busca {
  de?: string;
  ate?: string;
}

export function PaginaEsforco() {
  const [busca] = useSearchParams();
  const crus = Object.fromEntries(busca.entries()) as Busca;
  /* Data torta vira "sem filtro": `?de=abc` chegava ao `::date` do Postgres e
     derrubava a tela inteira em 500. */
  const params: Busca = { de: dataOuNada(crus.de), ate: dataOuNada(crus.ate) };
  const q = new URLSearchParams();
  if (params.de) q.set('de', params.de);
  if (params.ate) q.set('ate', params.ate);
  const leitura = useLeitura<RespostaDoEsforco>(`/v1/gestao/relatorios/esforco?${q}`);
  if (!leitura.data) return null;
  const { de, ate, relatorio } = leitura.data;
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

      {/* Faixa de filtros de 56px, no lugar e na ordem da faixa deles:
          rótulo e controles à esquerda, período e ação à direita. */}
      <form className="quickfilters" method="get" action="/relatorios/esforco">
        <span className="lbl">Filtros rápidos:</span>
        <input type="date" name="de" defaultValue={de} className="btn" aria-label="De" />
        <input type="date" name="ate" defaultValue={ate} className="btn" aria-label="Até" />
        <div className="faixa-fim">
          <button type="submit" className="btn primary">
            Aplicar
          </button>
        </div>
      </form>

      {/* ------------------------------------------------------ bloco 1
          A estrutura de bloco dos relatórios deles, medida em
          `docs/pesquisa/blip-medidas-monitoramento.md` §6: um cartão que
          CONTÉM cartões. O rótulo vem em cima em 14/600 e o valor embaixo em
          20/700 — o oposto do cartão de Monitoramento, onde o valor vem
          primeiro e é 24/400. */}
      <section className="bloco-rel">
        <h3>Total do período</h3>
        <div className="bloco-rel-grade" style={{ '--rel-colunas': 3 } as React.CSSProperties}>
          <div className="cartao-rel">
            <span className="r">Esforço somado</span>
            <span className="v">{duracaoLonga(totalEsforco)}</span>
            <span className="den">{numero(totalTickets)} tickets</span>
          </div>
          <div className="cartao-rel">
            <span className="r">Esforço médio por ticket</span>
            <span className="v">
              {duracaoLonga(totalTickets > 0 ? totalEsforco / totalTickets : null)}
            </span>
            <span className="den">soma ÷ soma, nunca média de médias</span>
          </div>
          <div className="cartao-rel">
            <span className="r">Conversas no período</span>
            <span className="v">{numero(relatorio.conversasConsideradas)}</span>
            <span className="den">
              {numero(relatorio.conversasSemAtendente)} sem atendente identificado
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
      <section className="bloco-rel">
        <h3>
          Por atendente <span className="sub">{`${de} → ${ate}`}</span>
        </h3>

        {relatorio.atendentes.length === 0 ? (
          <div className="cartao-rel">
            <div className="vazio">
              <b>
                Nenhuma conversa encerrada com atendente entre {de} e {ate}.
              </b>
              <p>
                {relatorio.conversasSemAtendente > 0
                  ? `${numero(relatorio.conversasSemAtendente)} conversa(s) do período fecharam sem atendente identificado — elas não têm a quem atribuir esforço.`
                  : 'Só entra aqui conversa já encerrada. Alargue o período acima para alcançar o movimento anterior.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="cartao-rel tabela scroll">
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
      </section>
    </>
  );
}
