import Link from '../../componentes/link';
import { useLeitura } from '../../lib/consulta';
import type { CanalConfigurado, EtiquetaConfigurada } from '../../lib/configuracoes';
import { numero } from '../../lib/formato';

const ROTULO_ESCOPO_ETIQUETA: Record<string, string> = {
  conversa: 'Conversa',
  contato: 'Contato',
  ambos: 'Conversa e contato',
};

/**
 * Dados: o vocabulário da operação.
 *
 * A coluna de usos existe porque etiqueta sem uso é o entulho que faz a lista
 * do encerramento crescer sem informar — e o supervisor só descobre isso
 * contando.
 */
export function PaginaDados() {
  const leitura = useLeitura<{ etiquetas: EtiquetaConfigurada[]; canais: CanalConfigurado[] }>(
    '/v1/gestao/configuracoes/dados',
  );
  if (!leitura.data) return null;
  const { etiquetas, canais } = leitura.data;

  return (
    <>
      <div className="board-head">
        <h2>Dados</h2>
        <span className="sub">
          Etiquetas e canais: o vocabulário que o Desk oferece no encerramento.
        </span>
      </div>

      <div className="tblwrap">
        <div className="tblhead">
          <h3>Etiquetas</h3>
          <span className="sub" style={{ marginLeft: 'auto' }}>
            {numero(etiquetas.length)} etiquetas
          </span>
        </div>

        {etiquetas.length === 0 ? (
          <div className="vazio">Nenhuma etiqueta cadastrada.</div>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Etiqueta</th>
                  <th>Escopo</th>
                  <th>Obrigatória no encerramento</th>
                  <th>Conversas etiquetadas</th>
                </tr>
              </thead>
              <tbody>
                {etiquetas.map((e) => (
                  <tr key={e.id}>
                    <td className="who">{e.nome}</td>
                    <td>{ROTULO_ESCOPO_ETIQUETA[e.escopo] ?? e.escopo}</td>
                    <td>{e.obrigatoriaNoEncerramento ? 'Sim' : 'Não'}</td>
                    <td className="num">{numero(e.usos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="note">
        Os canais saíram daqui: viraram módulo próprio, na barra de cima.{' '}
        <Link href="/canais">Ver os {numero(canais.length)} canais</Link> — com a caixa de entrada
        de cada um e a fila para onde ela manda.
      </div>
    </>
  );
}
