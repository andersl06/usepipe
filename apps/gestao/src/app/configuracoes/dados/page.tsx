import { carregarDados } from '../../../lib/configuracoes';
import { numero } from '../../../lib/formato';

export const dynamic = 'force-dynamic';

const ROTULO_TIPO: Record<string, string> = {
  whatsapp_cloud: 'WhatsApp',
  instagram: 'Instagram',
  email: 'E-mail',
  widget: 'Site',
};

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
export default async function PaginaDados() {
  const { etiquetas, canais } = await carregarDados();

  return (
    <>
      <div className="board-head">
        <h2>Dados</h2>
        <span className="sub">Etiquetas e canais: o vocabulário que o Desk oferece no encerramento.</span>
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

      <div className="tblwrap">
        <div className="tblhead">
          <h3>Canais</h3>
        </div>

        {canais.length === 0 ? (
          <div className="vazio">Nenhum canal conectado.</div>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Canal</th>
                  <th>Tipo</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {canais.map((c) => (
                  <tr key={c.id}>
                    <td className="who">{c.nome}</td>
                    <td>{ROTULO_TIPO[c.tipo] ?? c.tipo}</td>
                    <td>{c.ativo ? 'Ativo' : <span className="etiqueta">Desativado</span>}</td>
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
