import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Avatar, Botao, Etiqueta } from '@pipe/ui';
import { useRead } from '../../lib/consulta';
import {
  permissionsCaminho,
  salvarPermissions,
  type AgentPermissions,
} from '../../lib/atendentes-gravar';
import { permissionsDescription } from '../../lib/atendentes';
import { useContact } from '../fluxo/contato';
import { attendanceBase } from '../operacao/casca';

/**
 * `/team/permission` da origem — PÁGINA PRÓPRIA, não modal
 * (`FICHA-atendentes-filas-pausas.md` §a.1/§a.4: "a parte de permissões
 * também [abre página]", cobrança literal do dono).
 *
 * Forma literal: título "Permissões", a descrição de `descricaoDasPermissoes`
 * nas três variantes, a seção "Permissões disponíveis" com a tabela de duas
 * colunas — "Tipo de permissão" / "Status" — e "Salvar alterações".
 *
 * **O conteúdo das linhas é nosso.** A origem lista dez capacidades do Blip
 * Desk; aqui é o catálogo de permissões do Pipe
 * (`apps/api/src/dominio/gestao/permissoes-do-atendente.ts`), que é o que as
 * rotas de verdade conferem. `usuario_permissao` (migração 0046) é a exceção
 * por pessoa sobre o papel — ver o comentário daquele arquivo para a conta
 * completa.
 */
export function AgentPagePermissions() {
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const { contact } = useContact();
  const base = attendanceBase(contact.tipo, contact.id);
  const ids = (params.get('atendentes') ?? '').split(',').filter(Boolean);

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
          <button type="button" className="btn" onClick={() => navegar(`${base}/atendentes/gestao`)}>
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
      navegar(`${base}/atendentes/gestao`);
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
        <Botao type="button" onClick={() => navegar(`${base}/atendentes/gestao`)} disabled={salvando}>
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
