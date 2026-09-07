import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fusoDoTenant } from '../../../lib/banco';
import {
  ROTULO_AVALIADOR,
  ROTULO_ESTADO_AVALIACAO,
  ROTULO_VALOR,
  carregarFicha,
} from '../../../lib/monitoria';
import { fatalReprovado } from '../../../lib/nota-avaliacao';
import { dataHora, numero, percentual } from '../../../lib/formato';

export const dynamic = 'force-dynamic';

/**
 * A ficha de uma avaliação.
 *
 * É a tela que responde “por que 68?”. Cada critério mostra o que a IA
 * respondeu, quantos pontos aquilo valeu **na escala da nota final**, a
 * justificativa que ela escreveu e a **mensagem citada como evidência** —
 * resolvida para o texto de verdade, não para o rótulo `m7` que o modelo usou.
 *
 * A evidência é o que separa monitoria de opinião. `packages/ai` recusa a
 * avaliação quando a IA cita um trecho que não existe na transcrição, e recusa
 * critério não conforme sem evidência; aqui essa disciplina vira leitura: quem
 * discorda da nota tem onde apontar.
 *
 * Os dois números do topo são propositalmente dois: a nota valendo e a nota
 * ANTES do critério fatal. Um zero por fatal com 84 pontos somados é um caso
 * diferente de um zero por atendimento ruim de ponta a ponta, e a diferença
 * decide se a conversa vira feedback ou vira plano de coach.
 */

function rotuloDoValor(tipo: string, valor: string | null): string {
  if (valor === null) return 'Sem resposta';
  if (tipo === 'conforme') return ROTULO_VALOR[valor] ?? valor;
  return valor;
}

export default async function PaginaFichaDeAvaliacao({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const fuso = await fusoDoTenant();
  const ficha = await carregarFicha(id);
  if (!ficha) notFound();

  const c = ficha.cabecalho;
  const semResposta = ficha.grupos.flatMap((g) => g.criterios).filter((x) => x.valor === null);

  return (
    <>
      <div className="board-head">
        <h2>{c.formulario}</h2>
        <span className="sub">
          {c.avaliado ?? 'Sem atendente'} · {c.contato ?? 'Sem contato'} · {c.fila ?? 'Sem fila'} ·
          avaliada em {dataHora(c.avaliadaEm, fuso)} por{' '}
          {ROTULO_AVALIADOR[c.avaliadorTipo] ?? c.avaliadorTipo}
        </span>
      </div>

      <div className="quickfilters">
        <Link href="/monitoria" className="btn">
          ← Todas as avaliações
        </Link>
        <span className="etiqueta">{ROTULO_ESTADO_AVALIACAO[c.estado] ?? c.estado}</span>
        {c.categoria ? <span className="etiqueta">{c.categoria}</span> : null}
        {c.sentimento ? <span className="etiqueta">Sentimento {c.sentimento}</span> : null}
      </div>

      <section className="bloco-rel">
        <h3>A nota</h3>
        <div className="bloco-rel-grade" style={{ '--rel-colunas': 4 } as React.CSSProperties}>
          <div className="cartao-rel">
            <span className="r">Nota valendo</span>
            <span className="v">
              {c.nota === null ? '—' : `${numero(c.nota, 1)} / ${numero(c.notaMaxima)}`}
            </span>
            <span className="den">
              {ficha.fataisReprovados.length > 0
                ? 'zerada por critério fatal'
                : 'sem critério fatal reprovado'}
            </span>
          </div>

          <div className="cartao-rel">
            <span className="r">Antes do critério fatal</span>
            <span className="v">
              {numero(ficha.notaAntesDoFatal, 1)} / {numero(c.notaMaxima)}
            </span>
            <span className="den">soma dos pontos de cada critério — o tamanho do estrago</span>
          </div>

          <div className="cartao-rel">
            <span className="r">Confiança do modelo</span>
            <span className="v">{c.confiancaIa === null ? '—' : percentual(c.confiancaIa)}</span>
            <span className="den">
              {c.avaliadorTipo === 'ia'
                ? 'a nota da IA é sugestão até a revisão humana'
                : 'avaliação humana, sem confiança de modelo'}
            </span>
          </div>

          <div className="cartao-rel">
            <span className="r">Critérios sem resposta</span>
            <span className="v">{numero(semResposta.length)}</span>
            <span className="den">
              {semResposta.length > 0
                ? 'saem do denominador — não valem zero'
                : 'o formulário foi respondido inteiro'}
            </span>
          </div>
        </div>

        {ficha.fataisReprovados.length > 0 ? (
          <p className="note">
            <b>Zerada por critério fatal:</b> {ficha.fataisReprovados.join(', ')}. Critério fatal
            reprovado zera a avaliação inteira, por mais alto que tenha sido o resto — e o resto
            está ali ao lado, em “antes do critério fatal”.
          </p>
        ) : null}
      </section>

      {ficha.resumo ? (
        <section className="bloco-rel">
          <h3>O que a conversa foi</h3>
          <div className="cartao-rel">
            <p className="sub">{ficha.resumo}</p>
            <span className="den">
              Resumo e classificação da IA
              {ficha.modeloClassificacao ? ` · ${ficha.modeloClassificacao}` : ''} — é a leitura da
              conversa, não a avaliação do atendente.
            </span>
          </div>
        </section>
      ) : null}

      {ficha.grupos.map((g) => (
        <section key={g.id} className="bloco-rel">
          <h3>
            {g.nome} <span className="sub">peso {numero(g.peso, 2)}</span>
          </h3>
          <div className="cartao-rel tabela scroll">
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
                  <tr key={k.criterioId}>
                    <td className="who">
                      {k.criterio}
                      {k.fatal ? <span className="den">critério fatal · zera a nota</span> : null}
                      {k.descricao ? <span className="den">{k.descricao}</span> : null}
                    </td>
                    <td>
                      <span
                        className={
                          fatalReprovado(k.tipo, k.fatal, k.valor) ? 'etiqueta alerta' : 'etiqueta'
                        }
                      >
                        {rotuloDoValor(k.tipo, k.valor)}
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
