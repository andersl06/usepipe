import Link from '../../components/link';
import { useRead } from '../../lib/query';
import type { ChannelConfigured, EtiquetaConfigurada } from '../../lib/settings';
import { numero } from '../../lib/format';
import { useContact } from '../flow/contact';
import { attendanceBase } from '../operation/shell';

const ROTULO_SCOPE_TAG: Record<string, string> = {
  conversa: 'Conversa',
  contact: 'Contato',
  ambos: 'Conversa e contato',
};

/**
 * Data: the operation's vocabulary. The usage column exists because a tag with no usage is the clutter that makes the closing-out list grow without informing anything — and the supervisor only finds out by counting.
 */
export function PageData() {
  const { contact } = useContact();
  const base = attendanceBase(contact.tipo, contact.id);
  const read = useRead<{ etiquetas: EtiquetaConfigurada[]; channels: ChannelConfigured[] }>(
    '/v1/management/settings/data',
  );
  if (!read.data) return null;
  const { etiquetas, channels } = read.data;

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
          <div className="empty">Nenhuma etiqueta cadastrada.</div>
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
                    <td>{ROTULO_SCOPE_TAG[e.scope] ?? e.scope}</td>
                    <td>{e.requiredInClosure ? 'Sim' : 'Não'}</td>
                    <td className="num">{numero(e.usos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="note">
        Os canais saíram daqui: viraram tela própria, em Preferências.{' '}
        <Link href={`${base}/channels`}>Ver os {numero(channels.length)} canais</Link> — com a caixa de
        entrada de cada um e a fila para onde ela manda.
      </div>
    </>
  );
}
