import { carregarRegras, ROTULO_ALVO, ROTULO_ESCOPO } from '../../../lib/configuracoes';
import { duracao, numero } from '../../../lib/formato';

export const dynamic = 'force-dynamic';

/**
 * Regras: o que decide o SLA e a capacidade de cada fila.
 *
 * É a resposta para a pergunta que a coluna SLA do monitoramento levantava e
 * não respondia: "estourou o quê, contra qual prazo?". Somente leitura por
 * enquanto — ver o comentário de `lib/configuracoes.ts`.
 */
export default async function PaginaRegras() {
  const { filas, regras } = await carregarRegras();

  return (
    <>
      <div className="board-head">
        <h2>Regras</h2>
        <span className="sub">
          O prazo que a coluna SLA do monitoramento compara, e a capacidade que a distribuição
          respeita.
        </span>
      </div>

      <div className="tblwrap">
        <div className="tblhead">
          <h3>Regras de SLA</h3>
          <span className="sub" style={{ marginLeft: 'auto' }}>
            a regra de fila vence a da operação inteira
          </span>
        </div>

        {regras.length === 0 ? (
          <div className="vazio">
            Nenhuma regra de SLA cadastrada — toda conversa aparece como “Sem regra”.
          </div>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Regra</th>
                  <th>Alvo</th>
                  <th>Prazo</th>
                  <th>Alerta</th>
                  <th>Escopo</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {regras.map((r) => (
                  <tr key={r.id}>
                    <td className="who">{r.nome}</td>
                    <td>{ROTULO_ALVO[r.alvo] ?? r.alvo}</td>
                    <td className="num">{duracao(r.prazoSeg)}</td>
                    <td className="num">{r.alertaSeg === null ? '—' : duracao(r.alertaSeg)}</td>
                    <td>
                      {ROTULO_ESCOPO[r.escopoTipo] ?? r.escopoTipo}
                      {r.escopoNome ? ` · ${r.escopoNome}` : ''}
                    </td>
                    <td>{r.ativa ? 'Ativa' : <span className="etiqueta">Desativada</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="tblwrap">
        <div className="tblhead">
          <h3>Filas</h3>
          <span className="sub" style={{ marginLeft: 'auto' }}>
            {numero(filas.length)} filas
          </span>
        </div>

        {filas.length === 0 ? (
          <div className="vazio">Nenhuma fila cadastrada.</div>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Fila</th>
                  <th>Capacidade padrão</th>
                  <th>Ordem</th>
                  <th>Horário de atendimento</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id}>
                    <td className="who">{f.nome}</td>
                    <td className="num">{numero(f.capacidadePadrao)}</td>
                    <td className="num">{numero(f.ordem)}</td>
                    <td>{f.temHorario ? 'Definido' : 'Sem horário — o relógio corre sempre'}</td>
                    <td>{f.ativa ? 'Ativa' : <span className="etiqueta">Desativada</span>}</td>
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
