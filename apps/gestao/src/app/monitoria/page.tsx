import Link from 'next/link';
import { fusoDoTenant, janelaDeDatas, janelaDeHoje } from '../../lib/banco';
import { carregarMonitoria, ROTULO_AVALIADOR, ROTULO_ESTADO_AVALIACAO } from '../../lib/monitoria';
import { carregarCatalogos } from '../../lib/historico';
import {
  dataHora,
  dataIso,
  dataOuNada,
  denominador,
  numero,
  percentual,
  uuidOuNada,
} from '../../lib/formato';

export const dynamic = 'force-dynamic';

interface Busca {
  de?: string;
  ate?: string;
  atendente?: string;
  avaliador?: string;
}

/**
 * Monitoria com IA — a lista de conversas avaliadas.
 *
 * `packages/ai` avalia critério a critério, calcula a nota de forma
 * determinística e cita a mensagem que sustenta cada resposta. Até aqui isso
 * ficava só no banco: o produto pagava a chamada de modelo e o supervisor não
 * tinha onde ler.
 *
 * A régua de métricas vale igual. A média das notas mostra **de quantas
 * avaliações ela saiu** e quantas ficaram de fora — rascunho e avaliação sem
 * nota são exatamente o tipo de exclusão que embeleza a média. E as avaliações
 * **zeradas por critério fatal** aparecem em coluna própria, porque uma média 82
 * com três zeros dentro não é a mesma operação que uma média 82 sem nenhum.
 *
 * População: avaliações CONCLUÍDAS dentro do período (`avaliada_em`), com o
 * cronômetro parado — a mesma separação de §3 que vale para os relatórios.
 */
export default async function PaginaMonitoria({ searchParams }: { searchParams: Promise<Busca> }) {
  const crus = await searchParams;
  /* Conferido na entrada: id torto e data torta viram "sem filtro", em vez de
     virarem 500 no `::uuid` e no `::date` do Postgres. */
  const params: Busca = {
    ...crus,
    atendente: uuidOuNada(crus.atendente),
    de: dataOuNada(crus.de),
    ate: dataOuNada(crus.ate),
  };
  const fuso = await fusoDoTenant();
  const hoje = await janelaDeHoje(fuso);

  const ate = params.ate || dataIso(hoje.inicio, fuso);
  const de = params.de || dataIso(new Date(hoje.inicio.getTime() - 29 * 86400e3), fuso);
  const janela = await janelaDeDatas(fuso, de, ate);

  const catalogos = await carregarCatalogos();
  const painel = await carregarMonitoria(janela, {
    atendenteId: params.atendente,
    avaliadorTipo: params.avaliador || undefined,
  });

  const zeradas = painel.porAtendente.reduce((s, l) => s + l.zeradas, 0);

  return (
    <>
      <div className="board-head">
        <h2>Monitoria com IA</h2>
        <span className="sub">
          Avaliações concluídas no período. A nota é calculada aqui, nunca pelo modelo: ele responde
          critério a critério, e o peso e a escala fazem o resto.
        </span>
      </div>

      <form className="quickfilters" method="get" action="/monitoria">
        <span className="lbl">Período</span>
        <input type="date" name="de" defaultValue={de} className="btn" aria-label="De" />
        <input type="date" name="ate" defaultValue={ate} className="btn" aria-label="Até" />

        <select
          name="atendente"
          defaultValue={params.atendente ?? ''}
          className="btn"
          aria-label="Atendente avaliado"
        >
          <option value="">Todos os avaliados</option>
          {catalogos.atendentes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nome}
            </option>
          ))}
        </select>

        <select
          name="avaliador"
          defaultValue={params.avaliador ?? ''}
          className="btn"
          aria-label="Quem avaliou"
        >
          <option value="">IA e humano</option>
          <option value="ia">Só a IA</option>
          <option value="humano">Só humano</option>
        </select>

        <div className="faixa-fim">
          <a href="/monitoria" className="btn">
            Limpar
          </a>
          <button type="submit" className="btn primary">
            Aplicar
          </button>
        </div>
      </form>

      <section className="bloco-rel">
        <h3>
          Nota média <span className="sub">{`${de} → ${ate}`}</span>
        </h3>
        <div className="bloco-rel-grade" style={{ '--rel-colunas': 4 } as React.CSSProperties}>
          <div className="cartao-rel">
            <span className="r">Nota média</span>
            <span className="v">
              {painel.media.valor === null
                ? '—'
                : `${numero(painel.media.valor, 1)} / ${numero(painel.escala)}`}
            </span>
            <span className="den">{denominador(painel.media, 'sem nota fechada')}</span>
          </div>

          <div className="cartao-rel">
            <span className="r">Zeradas por critério fatal</span>
            <span className="v">{numero(zeradas)}</span>
            <span className="den">
              entram na média como zero — sem esta linha, a média parece um problema pequeno
            </span>
          </div>

          <div className="cartao-rel">
            <span className="r">Confiança da IA</span>
            <span className="v">
              {painel.confiancaIa.valor === null ? '—' : percentual(painel.confiancaIa.valor)}
            </span>
            <span className="den">
              {denominador(painel.confiancaIa, 'sem confiança declarada')}
            </span>
          </div>

          <div className="cartao-rel">
            <span className="r">Quem avaliou</span>
            <span className="v">{numero(painel.avaliacoes.length)}</span>
            <span className="den">
              {painel.porAvaliador.length === 0
                ? 'nenhuma avaliação no período'
                : painel.porAvaliador
                    .map((p) => `${numero(p.total)} ${ROTULO_AVALIADOR[p.tipo] ?? p.tipo}`)
                    .join(' · ')}
            </span>
          </div>
        </div>
        <p className="note">
          A nota da IA nasce como <b>sugestão</b>: ela vira efetiva conforme a política do tenant —
          sempre, só acima de um limiar de confiança, ou nunca. Por isso a confiança fica ao lado da
          média, e não escondida na ficha. Avaliação em rascunho não entra em nenhum dos dois
          números, e a contagem excluída está no denominador.
        </p>
      </section>

      <section className="bloco-rel">
        <h3>Por atendente</h3>
        {painel.porAtendente.length === 0 ? (
          <div className="cartao-rel">
            <div className="vazio">
              <b>Nenhuma avaliação neste período.</b>
              <p>
                A monitoria roda sobre conversas já encerradas. Sem formulário de avaliação
                cadastrado, ou sem a rotina de avaliação ligada, esta tela fica vazia — e vazia é o
                que ela deve ficar, em vez de inventar número.
              </p>
            </div>
          </div>
        ) : (
          <div className="cartao-rel tabela scroll">
            <table>
              <thead>
                <tr>
                  <th>Atendente</th>
                  <th>Nota média</th>
                  <th>Zeradas por fatal</th>
                </tr>
              </thead>
              <tbody>
                {painel.porAtendente.map((l) => (
                  <tr key={l.atendente}>
                    <td className="who">{l.atendente}</td>
                    <td className="num">
                      {l.media.valor === null ? '—' : numero(l.media.valor, 1)}
                      <span className="den">{denominador(l.media, 'sem nota fechada')}</span>
                    </td>
                    <td className="num">{numero(l.zeradas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="note">
          Média ponderada por volume — soma das notas ÷ número de avaliações, nunca média de médias.
          Quem foi avaliado dez vezes pesa dez, e não uma.
        </p>
      </section>

      <section className="bloco-rel">
        <h3>Conversas avaliadas</h3>
        {painel.avaliacoes.length === 0 ? (
          <div className="cartao-rel">
            <div className="vazio">
              <b>Nada avaliado no período.</b>
              <p>Alargue as datas ou tire o filtro de avaliador.</p>
            </div>
          </div>
        ) : (
          <div className="cartao-rel tabela scroll">
            <table>
              <thead>
                <tr>
                  <th>Avaliada em</th>
                  <th>Contato</th>
                  <th>Atendente</th>
                  <th>Fila</th>
                  <th>Formulário</th>
                  <th>Avaliador</th>
                  <th>Nota</th>
                  <th>Situação</th>
                  <th>Ficha</th>
                </tr>
              </thead>
              <tbody>
                {painel.avaliacoes.map((a) => (
                  <tr key={a.id}>
                    <td className="mono">{dataHora(a.avaliadaEm, fuso)}</td>
                    <td className="who">{a.contato ?? 'Sem contato'}</td>
                    <td>{a.avaliado ?? 'Sem atendente'}</td>
                    <td>{a.fila ?? 'Sem fila'}</td>
                    <td>{a.formulario}</td>
                    <td>
                      {ROTULO_AVALIADOR[a.avaliadorTipo] ?? a.avaliadorTipo}
                      {a.confiancaIa !== null ? (
                        <span className="den">confiança {percentual(a.confiancaIa)}</span>
                      ) : null}
                    </td>
                    <td className="num">
                      {a.nota === null ? '—' : `${numero(a.nota, 1)} / ${numero(a.notaMaxima)}`}
                      {a.conceito ? <span className="den">{a.conceito}</span> : null}
                    </td>
                    <td>
                      <span className={a.nota === 0 ? 'etiqueta alerta' : 'etiqueta'}>
                        {ROTULO_ESTADO_AVALIACAO[a.estado] ?? a.estado}
                      </span>
                    </td>
                    <td>
                      <Link href={`/monitoria/${a.id}`}>Abrir</Link>
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
