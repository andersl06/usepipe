import Link from '../../components/link';
import {
  ROTULO_AVALIADOR,
  LABEL_STATE_EVALUATION,
  LABEL_VALUE,
  type EvaluationRecord,
} from '../../lib/quality-review';
import { useParams } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import { useRead } from '../../lib/query';
import { NaoEncontrado } from '../nao-encontrado';
import { fatalReprovado } from '../../lib/nota-evaluation';
import { dataHora, numero, percentual } from '../../lib/format';
import { useContact } from '../flow/contact';
import { attendanceBase } from './shell';

/**
 * An evaluation's record sheet.
 *
 * It's the screen that answers "why 68?". Each criterion shows what the AI answered, how many points that was worth **on the final-score scale**, the justification it wrote, and the **message cited as evidence** — resolved to the actual text, not to the `m7` label the model used.
 *
 * Evidence is what separates monitoring from opinion. `packages/ai` refuses the evaluation when the AI cites a passage that doesn't exist in the transcript, and refuses a non-conforming criterion without evidence; here that discipline becomes readable: whoever disagrees with the score has something to point at.
 *
 * The two numbers at the top are deliberately two: the score as it stands, and the score BEFORE the fatal criterion. A zero from a fatal criterion on top of 84 summed points is a different case from a zero from poor service start to finish, and that difference decides whether the conversation becomes feedback or a coaching plan.
 */

function valueLabel(tipo: string, value: string | null): string {
  if (value === null) return 'Sem resposta';
  if (tipo === 'conforme') return LABEL_VALUE[value] ?? value;
  return value;
}

export function EvaluationPageRecord() {
  const { id = '' } = useParams();
  const { contact } = useContact();
  const base = attendanceBase(contact);
  const read = useRead<{ fuso: string; record: EvaluationRecord }>(
    `/v1/management/quality-review/${id}`,
  );
  if (read.error instanceof ApiError && read.error.status === 404) return <NaoEncontrado />;
  if (!read.data) return null;
  const { fuso, record: ficha } = read.data;

  const c = ficha.cabecalho;
  const semResposta = ficha.groups.flatMap((g) => g.criterios).filter((x) => x.value === null);

  return (
    <>
      <div className="board-head">
        <h2>{c.form}</h2>
        <span className="sub">
          {c.evaluated ?? 'Sem atendente'} · {c.contact ?? 'Sem contato'} · {c.queue ?? 'Sem fila'} ·
          avaliada em {dataHora(c.evaluatedAt, fuso)} por{' '}
          {ROTULO_AVALIADOR[c.evaluatorType] ?? c.evaluatorType}
        </span>
      </div>

      <div className="quickfilters">
        <Link href={`${base}/quality-assurance`} className="btn">
          ← Todas as avaliações
        </Link>
        <span className="etiqueta">{LABEL_STATE_EVALUATION[c.state] ?? c.state}</span>
        {c.category ? <span className="etiqueta">{c.category}</span> : null}
        {c.sentiment ? <span className="etiqueta">Sentimento {c.sentiment}</span> : null}
      </div>

      <section className="block-rel">
        <h3>A nota</h3>
        <div className="block-rel-grid" style={{ '--rel-colunas': 4 } as React.CSSProperties}>
          <div className="card-rel">
            <span className="r">Nota valendo</span>
            <span className="v">
              {c.note === null ? '—' : `${numero(c.note, 1)} / ${numero(c.noteMaximum)}`}
            </span>
            <span className="den">
              {ficha.fatalRejecteds.length > 0
                ? 'zerada por critério fatal'
                : 'sem critério fatal reprovado'}
            </span>
          </div>

          <div className="card-rel">
            <span className="r">Antes do critério fatal</span>
            <span className="v">
              {numero(ficha.notaAntesDoFatal, 1)} / {numero(c.noteMaximum)}
            </span>
            <span className="den">soma dos pontos de cada critério — o tamanho do estrago</span>
          </div>

          <div className="card-rel">
            <span className="r">Confiança do modelo</span>
            <span className="v">{c.confidenceAi === null ? '—' : percentual(c.confidenceAi)}</span>
            <span className="den">
              {c.evaluatorType === 'ia'
                ? 'a nota da IA é sugestão até a revisão humana'
                : 'avaliação humana, sem confiança de modelo'}
            </span>
          </div>

          <div className="card-rel">
            <span className="r">Critérios sem resposta</span>
            <span className="v">{numero(semResposta.length)}</span>
            <span className="den">
              {semResposta.length > 0
                ? 'saem do denominador — não valem zero'
                : 'o formulário foi respondido inteiro'}
            </span>
          </div>
        </div>

        {ficha.fatalRejecteds.length > 0 ? (
          <p className="note">
            <b>Zerada por critério fatal:</b> {ficha.fatalRejecteds.join(', ')}. Critério fatal
            reprovado zera a avaliação inteira, por mais alto que tenha sido o resto — e o resto
            está ali ao lado, em “antes do critério fatal”.
          </p>
        ) : null}
      </section>

      {ficha.summary ? (
        <section className="block-rel">
          <h3>O que a conversa foi</h3>
          <div className="card-rel">
            <p className="sub">{ficha.summary}</p>
            <span className="den">
              Resumo e classificação da IA
              {ficha.modelClassification ? ` · ${ficha.modelClassification}` : ''} — é a leitura da
              conversa, não a avaliação do atendente.
            </span>
          </div>
        </section>
      ) : null}

      {ficha.groups.map((g) => (
        <section key={g.id} className="block-rel">
          <h3>
            {g.name} <span className="sub">peso {numero(g.peso, 2)}</span>
          </h3>
          <div className="card-rel tabela scroll">
            <table>
              <thead>
                <tr>
                  <th>Critério</th>
                  <th>Resposta</th>
                  <th>Pontos</th>
                  <th>Por quê — e onde está</th>
                </tr>
              </thead>
              <tbody>
                {g.criterios.map((k) => (
                  <tr key={k.criterionId}>
                    <td className="who">
                      {k.criterio}
                      {k.fatal ? <span className="den">critério fatal · zera a nota</span> : null}
                      {k.description ? <span className="den">{k.description}</span> : null}
                    </td>
                    <td>
                      <span
                        className={
                          fatalReprovado(k.type, k.fatal, k.value) ? 'etiqueta alerta' : 'etiqueta'
                        }
                      >
                        {valueLabel(k.type, k.value)}
                      </span>
                    </td>
                    <td className="num">
                      {k.pontos === null ? '—' : numero(k.pontos, 2)}
                      <span className="den">peso {numero(k.peso, 2)}</span>
                    </td>
                    <td className="comentario">
                      {k.justificativa ?? 'Sem justificativa registrada.'}
                      {k.evidencia ? (
                        <span className="den">
                          Evidência ({k.evidenciaAutor ?? 'origem desconhecida'},{' '}
                          {dataHora(k.evidenciaEm, fuso)}): “{k.evidencia}”
                        </span>
                      ) : (
                        <span className="den">Sem trecho citado.</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <p className="note">
        Os pontos de cada linha já estão na escala da nota final: somá-los dá a nota antes do
        critério fatal. É a propriedade que `packages/ai/src/avaliacao/nota.ts` garante, e é ela que
        permite a esta tela dizer onde a nota foi perdida sem refazer conta nenhuma.
      </p>
    </>
  );
}
