import { carregarOperacao } from '../../../lib/configuracoes';
import { numero } from '../../../lib/formato';

export const dynamic = 'force-dynamic';

const ROTULO_ESTADO: Record<string, string> = {
  online: 'Online',
  pausa: 'Em pausa',
  invisivel: 'Invisível',
  offline: 'Offline',
};

/**
 * Operação: quem atende e por que para de atender.
 *
 * O motivo de pausa mora aqui porque é ele que o Desk lista ao atendente e é
 * a duração sugerida daqui que o Monitoramento usa para contar pausa
 * estourada. Dois lugares lendo o mesmo cadastro, e nenhum deles mostrava o
 * cadastro.
 */
export default async function PaginaOperacao() {
  const { motivos, atendentes } = await carregarOperacao();

  return (
    <>
      <div className="board-head">
        <h2>Operação</h2>
        <span className="sub">
          Motivo de pausa e quadro de atendentes. É o mesmo cadastro que o Desk oferece e que o
          Monitoramento cobra.
        </span>
      </div>

      <div className="tblwrap">
        <div className="tblhead">
          <h3>Motivos de pausa</h3>
          <span className="sub" style={{ marginLeft: 'auto' }}>
            a duração sugerida é o que conta pausa estourada
          </span>
        </div>

        {motivos.length === 0 ? (
          <div className="vazio">
            Nenhum motivo cadastrado. Sem motivo, o atendente não consegue entrar em pausa.
          </div>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Motivo</th>
                  <th>Duração sugerida</th>
                  <th>Conta como produtivo</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {motivos.map((m) => (
                  <tr key={m.id}>
                    <td className="who">{m.nome}</td>
                    <td className="num">
                      {m.duracaoSugeridaMin === null ? '—' : `${numero(m.duracaoSugeridaMin)} min`}
                    </td>
                    <td>{m.contaComoProdutivo ? 'Sim' : 'Não'}</td>
                    <td>{m.ativo ? 'Ativo' : <span className="etiqueta">Desativado</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="tblwrap">
        <div className="tblhead">
          <h3>Atendentes</h3>
          <span className="sub" style={{ marginLeft: 'auto' }}>
            {numero(atendentes.length)} pessoas
          </span>
        </div>

        {atendentes.length === 0 ? (
          <div className="vazio">Nenhum usuário cadastrado neste tenant.</div>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Pessoa</th>
                  <th>E-mail</th>
                  <th>Status agora</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {atendentes.map((a) => (
                  <tr key={a.id}>
                    <td className="who">{a.nome}</td>
                    <td>{a.email}</td>
                    <td>{a.estado ? (ROTULO_ESTADO[a.estado] ?? a.estado) : 'Nunca conectou'}</td>
                    <td>{a.ativo ? 'Ativo' : <span className="etiqueta">Desativado</span>}</td>
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
