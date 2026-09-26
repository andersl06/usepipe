import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Avatar, Botao, Etiqueta } from '@pipe/ui';
import { useRead } from '../../lib/query';
import {
  permissionsCaminho,
  salvarPermissions,
  type AgentPermissions,
} from '../../lib/agents-gravar';
import { permissionsDescription } from '../../lib/agents';
import { useContact } from '../flow/contact';
import { attendanceBase } from '../operation/shell';

/**
 * The source's `/team/permission` — its OWN PAGE, not a modal (`FICHA-atendentes-filas-pausas.md` §a.1/§a.4: "the permissions part also [opens a page]", a literal owner requirement).
 *
 * Literal form: title "Permissões", the `descricaoDasPermissoes` copy in its three variants, the "Permissões disponíveis" section with the two-column table — "Tipo de permissão" / "Status" — and "Salvar alterações".
 *
 * **The row content is ours.** The source lists ten Blip Desk capabilities; here it's Pipe's permission catalog (`apps/api/src/dominio/gestao/permissoes-do-atendente.ts`), which is what the actual routes check. `usuario_permissao` (migration 0046) is the per-person exception over the role — see that file's comment for the full account.
 */
export function AgentPagePermissions() {
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const { contact } = useContact();
  const base = attendanceBase(contact.tipo, contact.id);
  const ids = (params.get('agents') ?? '').split(',').filter(Boolean);

  const caminho = permissionsCaminho(ids);
  const read = useRead<AgentPermissions>(caminho);

  const [editado, setEditado] = useState<Record<string, boolean>>({});
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!caminho) {
    return (
      <div className="vazio">
        <b>Nenhum atendente selecionado</b>
        <p>
          <button type="button" className="btn" onClick={() => navegar(`${base}/agents/management`)}>
            Voltar para Gestão de atendentes
          </button>
        </p>
      </div>
    );
  }

  if (!read.data) return null;
  const { agents, permissions } = read.data;

  function valueCurrent(codigo: string, ligada: boolean): boolean {
    return codigo in editado ? editado[codigo]! : ligada;
  }

  function alternar(codigo: string, atual: boolean) {
    setEditado((e) => ({ ...e, [codigo]: !atual }));
  }

  async function salvarChanges() {
    if (Object.keys(editado).length === 0) return;
    setSalvando(true);
    setError(null);
    const resultado = await salvarPermissions(
      agents.map((a) => a.id),
      editado,
    );
    setSalvando(false);
    if (resultado.ok) {
      setEditado({});
      navegar(`${base}/agents/management`);
    } else {
      setError(resultado.error);
    }
  }

  return (
    <>
      <div className="board-head">
        <h2>Permissões</h2>
      </div>

      <p className="sub">{permissionsDescription(agents.map((a) => a.nome))}</p>

      <div className="lista-selecionados">
        {agents.map((a) => (
          <span key={a.id} className="selecionado-chip">
            <Avatar nome={a.nome} /> {a.nome}
          </span>
        ))}
      </div>

      <div className="tblwrap">
        <div className="tblhead">
          <h3>Permissões disponíveis</h3>
        </div>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Tipo de permissão</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {permissions.map((p) => {
                const ligada = valueCurrent(p.codigo, p.ligada);
                const parcial = !(p.codigo in editado) && p.parcial;
                return (
                  <tr key={p.codigo}>
                    <td>{p.description}</td>
                    <td>
                      <button
                        type="button"
                        className="interruptor"
                        role="switch"
                        aria-checked={ligada}
                        data-parcial={parcial ? 'true' : undefined}
                        aria-label={p.description}
                        title={parcial ? 'Uns têm, outros não' : undefined}
                        onClick={() => alternar(p.codigo, ligada)}
                      >
                        <span className="interruptor-bolinha" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}

      <div className="cl-acoes">
        <Botao type="button" onClick={() => navegar(`${base}/agents/management`)} disabled={salvando}>
          Cancelar
        </Botao>
        <Botao
          type="button"
          variante="primario"
          onClick={() => void salvarChanges()}
          disabled={salvando || Object.keys(editado).length === 0}
        >
          {salvando ? 'Salvando…' : 'Salvar alterações'}
        </Botao>
      </div>
    </>
  );
}
