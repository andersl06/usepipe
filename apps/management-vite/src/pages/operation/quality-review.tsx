import Link from '../../components/link';
import { Selection } from '../../components/selection';
import { useSearchParams } from 'react-router-dom';
import { useRead } from '../../lib/query';
import { useContact } from '../flow/contact';
import { attendanceBase } from './shell';
import {
  ROTULO_AVALIADOR,
  ROTULO_STATE_EVALUATION,
  type QualityReviewPanel,
} from '../../lib/quality-review';
import type { Catalogos } from '../../lib/history';
import {
  dataHora,
  dataOuNada,
  denominador,
  numero,
  percentual,
  uuidOuNada,
} from '../../lib/format';

interface QualityReviewResposta {
  fuso: string;
  de: string;
  ate: string;
  catalogos: Catalogos;
  panel: QualityReviewPanel;
}

interface Search {
  de?: string;
  ate?: string;
  agent?: string;
  avaliador?: string;
}

/**
 * AI Monitoring — the list of evaluated conversations.
 *
 * `packages/ai` scores criterion by criterion, computes the score deterministically, and cites the message backing each answer. Until now this only lived in the database: the product paid for the model call and the supervisor had nowhere to read it.
 *
 * The metrics ruler applies the same way. The score average shows **how many evaluations it came from** and how many were left out — a draft or a scoreless evaluation are exactly the kind of exclusion that flatters an average. And evaluations **zeroed by a fatal criterion** appear in their own column, because an average of 82 with three zeros inside is not the same operation as an average of 82 with none.
 *
 * Population: COMPLETED evaluations within the period (`avaliada_em`), with the clock stopped — the same split from §3 that applies to the reports.
 */
export function PageQualityReview() {
  const { contact } = useContact();
  const base = attendanceBase(contact.tipo, contact.id);
  const [search] = useSearchParams();
  const crus = Object.fromEntries(search.entries()) as Search;
  /* Conferido na entrada: id torto e data torta viram "sem filtro", em vez de
     virarem 500 no `::uuid` e no `::date` do Postgres. */
  const params: Search = {
    ...crus,
    agent: uuidOuNada(crus.agent),
    de: dataOuNada(crus.de),
    ate: dataOuNada(crus.ate),
  };
  const q = new URLSearchParams();
  for (const key of ['agent', 'avaliador', 'de', 'ate'] as const) {
    if (params[key]) q.set(key, params[key] as string);
  }
  const read = useRead<QualityReviewResposta>(`/v1/management/quality-review?${q}`);
  if (!read.data) return null;
  const { fuso, de, ate, catalogos, panel } = read.data;

  const zeradas = panel.byAgent.reduce((s, l) => s + l.zeradas, 0);

  return (
    <>
      <div className="board-head">
        <h2>Monitoria com IA</h2>
        <span className="sub">
          Avaliações concluídas no período. A nota é calculada aqui, nunca pelo modelo: ele responde
          critério a critério, e o peso e a escala fazem o resto.
        </span>
      </div>

      <form className="quickfilters" method="get" action={`${base}/quality-review`}>
        <span className="lbl">Período</span>
        <input type="date" name="de" defaultValue={de} className="btn" aria-label="De" />
        <input type="date" name="ate" defaultValue={ate} className="btn" aria-label="Até" />

        <Selection
          name="atendente"
          defaultValue={params.agent ?? ''}
          className="btn"
          aria-label="Atendente avaliado"
        >
          <option value="">Todos os avaliados</option>
          {catalogos.agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nome}
            </option>
          ))}
        </Selection>

        <Selection
          name="avaliador"
          defaultValue={params.avaliador ?? ''}
          className="btn"
          aria-label="Quem avaliou"
        >
          <option value="">IA e humano</option>
          <option value="ia">Só a IA</option>
          <option value="humano">Só humano</option>
        </Selection>

        <div className="faixa-fim">
          <a href={`${base}/quality-review`} className="btn">
            Limpar
          </a>
          <button type="submit" className="btn primary">
            Aplicar
          </button>
        </div>
      </form>

      <section className="block-rel">
        <h3>
          Nota média <span className="sub">{`${de} → ${ate}`}</span>
        </h3>
        <div className="block-rel-grid" style={{ '--rel-colunas': 4 } as React.CSSProperties}>
          <div className="card-rel">
            <span className="r">Nota média</span>
            <span className="v">
              {panel.media.value === null
                ? '—'
                : `${numero(panel.media.value, 1)} / ${numero(panel.escala)}`}
            </span>
            <span className="den">{denominador(panel.media, 'sem nota fechada')}</span>
          </div>

          <div className="card-rel">
            <span className="r">Zeradas por critério fatal</span>
            <span className="v">{numero(zeradas)}</span>
            <span className="den">
              entram na média como zero — sem esta linha, a média parece um problema pequeno
            </span>
          </div>

          <div className="card-rel">
            <span className="r">Confiança da IA</span>
            <span className="v">
              {panel.confiancaIa.value === null ? '—' : percentual(panel.confiancaIa.value)}
            </span>
            <span className="den">
              {denominador(panel.confiancaIa, 'sem confiança declarada')}
            </span>
          </div>

          <div className="card-rel">
            <span className="r">Quem avaliou</span>
            <span className="v">{numero(panel.evaluations.length)}</span>
            <span className="den">
              {panel.byAvaliador.length === 0
                ? 'nenhuma avaliação no período'
                : panel.byAvaliador
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

      <section className="block-rel">
        <h3>Por atendente</h3>
        {panel.byAgent.length === 0 ? (
          <div className="card-rel">
            <div className="empty">
              <b>Nenhuma avaliação neste período.</b>
              <p>
                A monitoria roda sobre conversas já encerradas. Sem formulário de avaliação
                cadastrado, ou sem a rotina de avaliação ligada, esta tela fica vazia — e vazia é o
                que ela deve ficar, em vez de inventar número.
              </p>
            </div>
          </div>
        ) : (
          <div className="card-rel tabela scroll">
            <table>
              <thead>
                <tr>
                  <th>Atendente</th>
                  <th>Nota média</th>
                  <th>Zeradas por fatal</th>
                </tr>
              </thead>
              <tbody>
                {panel.byAgent.map((l) => (
                  <tr key={l.agent}>
                    <td className="who">{l.agent}</td>
                    <td className="num">
                      {l.media.value === null ? '—' : numero(l.media.value, 1)}
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

      <section className="block-rel">
        <h3>Conversas avaliadas</h3>
        {panel.evaluations.length === 0 ? (
          <div className="card-rel">
            <div className="empty">
              <b>Nada avaliado no período.</b>
              <p>Alargue as datas ou tire o filtro de avaliador.</p>
            </div>
          </div>
        ) : (
          <div className="card-rel tabela scroll">
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
                {panel.evaluations.map((a) => (
                  <tr key={a.id}>
                    <td className="mono">{dataHora(a.avaliadaEm, fuso)}</td>
                    <td className="who">{a.contact ?? 'Sem contato'}</td>
                    <td>{a.avaliado ?? 'Sem atendente'}</td>
                    <td>{a.queue ?? 'Sem fila'}</td>
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
                        {ROTULO_STATE_EVALUATION[a.state] ?? a.state}
                      </span>
                    </td>
                    <td>
                      <Link href={`${base}/quality-review/${a.id}`}>Abrir</Link>
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
