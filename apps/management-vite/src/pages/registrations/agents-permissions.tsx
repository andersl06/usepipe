import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Botao, Etiqueta } from '@pipe/ui';
import { useRead } from '../../lib/query';
import { permissionsPath, savePermissions, type AgentPermissions } from '../../lib/agents-gravar';
import { permissionsDescription } from '../../lib/agents';
import { TabelaCarregando, TabelaErro } from '../../components/estados-tabela';
import { CabecalhoAtendente, SubtituloAtendente } from './agents-pagina';
import { useContact } from '../flow/contact';
import { attendanceBase } from '../operation/shell';

/**
 * The source's `/team/permission` — its OWN PAGE, not a modal (`FICHA-atendentes-filas-pausas.md` §a.1/§a.4: "the permissions part also [opens a page]", a literal owner requirement).
 *
 * Literal form: title "Permissões", the `permissionsDescription` copy in its three variants, the "Permissões disponíveis" section with the two-column table — "Tipo de permissão" / "Status" — and "Salvar alterações".
 *
 * **The ten rows are the source's Desk capabilities**, in its order and with its labels (`DESK_PERMISSIONS` in `apps/api/src/domain/management/permissions-of-agent.ts`). Only rows whose permission code the routes enforce have a working switch; the others are disabled with the reason, never a switch that does nothing. `usuario_permissao` (migration 0046) is the per-person exception over the role — see that file's comment for the full account.
 */
export function AgentPagePermissions() {
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const { contact } = useContact();
  const base = attendanceBase(contact);
  const ids = (params.get('agents') ?? '').split(',').filter(Boolean);

  const caminho = permissionsPath(ids);
  const read = useRead<AgentPermissions>(caminho);

  const [editado, setEditado] = useState<Record<string, boolean>>({});
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!caminho) {
    return (
      <div className="empty">
        <b>Nenhum atendente selecionado</b>
        <p>
          <button type="button" className="btn" onClick={() => navegar(`${base}/team`)}>
            Voltar para Gestão de atendentes
          </button>
        </p>
      </div>
    );
  }

  if (read.isError && !read.data) return <TabelaErro aoTentar={() => void read.refetch()} />;
  if (!read.data) return <TabelaCarregando colunas={2} />;
  const { agents, permissions } = read.data;

  function valueCurrent(code: string, ligada: boolean): boolean {
    return code in editado ? editado[code]! : ligada;
  }

  function alternar(code: string, atual: boolean) {
    setEditado((e) => ({ ...e, [code]: !atual }));
  }

  async function saveChanges() {
    if (Object.keys(editado).length === 0) return;
    setSalvando(true);
    setError(null);
    const resultado = await savePermissions(
      agents.map((a) => a.id),
      editado,
    );
    setSalvando(false);
    if (resultado.ok) {
      setEditado({});
      navegar(`${base}/team`);
    } else {
      setError(resultado.error);
    }
  }

  return (
    <>
      <CabecalhoAtendente titulo="Permissões" aoVoltar={() => navegar(`${base}/team`)} />
      <SubtituloAtendente nome={agents.map((a) => a.name).join(', ')}>
        {permissionsDescription(agents.map((a) => a.name))}
      </SubtituloAtendente>

      <div className="atend-cartao atend-cartao-permissoes">
        <section role="table" aria-label="Permissões gerais">
          <div className="atend-perm-cab" role="row">
            <span role="columnheader">Gerais</span>
            <span role="columnheader">Status</span>
          </div>
          {permissions.map((p) => {
            const code = p.code;
            const ativa = p.estado === 'ativa' && code !== null;
            const ligada = ativa ? valueCurrent(code, p.ligada) : false;
            const parcial = ativa && !(code in editado) && p.parcial;
            return (
              <div key={p.key} className="atend-perm-linha" role="row">
                <span role="cell">
                  {p.description}
                  {ativa ? null : (
                    <small className="atend-perm-aviso" role="status">
                      {p.estado === 'em_breve'
                        ? 'Este recurso será liberado em breve para este fluxo.'
                        : 'O controle de acesso desta função ainda não está ativo.'}
                    </small>
                  )}
                </span>
                <span role="cell" className="atend-perm-celula">
                  <button
                    type="button"
                    className="interruptor interruptor-curto"
                    role="switch"
                    aria-checked={ligada}
                    data-parcial={parcial ? 'true' : undefined}
                    aria-label={p.description}
                    title={parcial ? 'Uns têm, outros não' : undefined}
                    disabled={!ativa}
                    onClick={() => ativa && alternar(code, ligada)}
                  >
                    <span className="interruptor-bolinha" />
                  </button>
                </span>
              </div>
            );
          })}
        </section>
      </div>

      {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}

      <div className="atend-rodape">
        <Botao type="button" onClick={() => navegar(`${base}/team`)} disabled={salvando}>
          Cancelar
        </Botao>
        <Botao
          type="button"
          variante="primario"
          onClick={() => void saveChanges()}
          disabled={salvando || Object.keys(editado).length === 0}
        >
          {salvando ? 'Salvando…' : 'Salvar'}
        </Botao>
      </div>
    </>
  );
}
