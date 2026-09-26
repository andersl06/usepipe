import Link from '../../../components/link';
import { BarraDoPortal } from '../../../components/barra-do-portal';
import { IconePortal } from '../../../components/icones-portal';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useEu } from '../../../context/session';
import { portalUseShell } from '../../../lib/shell';
import { useRead } from '../../../lib/query';
import type { ContractMember, AccountRole, ContractSummary } from '../../../lib/contract';
import { PAPEIS_DA_ORIGEM, accountEhRole } from '../catalogo';
import '../contract.css';
import { ConvidarMembers } from './convidar';
import { MembersAbas, MembersTabela } from './tabela';

/**
 * Members — the panel's "Adicione e exclua membros do contrato" card, which in the source opens the fragment's `/panel` route. Anyone getting here needs `conta.membros.ler`, and the check is the REAL one: the panel's `?demo=1` is purely cosmetic and opens no door. Anyone arriving without the permission is sent back to the panel. The source data contract is at `referencias-blip/pesquisa/blip-membros-do-contrato.md`. The shell matches theirs: the back arrow and "Membros do contrato {nome}" at the top (`setHeaderContent({ redirect: "/", text: … })`), and below it a single card with the selection table inside. What the panel calls the card's description ("Adicione e exclua membros do contrato") **is not** repeated here: it isn't repeated there either. The roles are the three ACCOUNT roles (migration 0021) and appear with their labels — "Admin", "Pode editar", "Pode visualizar" —, never the DB name. Manager, supervisor, agent and evaluator belong to attendance and don't appear here: in the source they're per-contact data. **Convidar** sits below the table, on the right, only for those who can write — like their `bp-btn--blip-dark`. The `api` (`POST /v1/convites`) is what saves, and the link comes back through the modal's state, never through the URL (see `convidarMembros`). Issued invites show up in the list as "(Pendente)", as in the source.
 */
export function MembersPage() {
  const eu = useEu();
  const shell = portalUseShell();
  const [search] = useSearchParams();
  const parametros = { erro: search.get('erro') ?? undefined };
  const podeLer = eu.permissions.includes('conta.membros.ler');
  const resumo = useRead<ContractSummary>(podeLer ? '/v1/management/contract/summary' : null);
  const lista = useRead<{ members: ContractMember[]; papeis: AccountRole[] }>(
    podeLer ? '/v1/management/contract/members' : null,
  );
  if (!podeLer) return <Navigate to="/contract" replace />;
  if (!resumo.data || !lista.data) return null;
  const contract = resumo.data;
  const { members, papeis } = lista.data;

  const podeEscrever = eu.permissions.includes('conta.membros.escrever');

  /* In the source order (guest, member, admin), which is the order of the map's keys. */
  const order = Object.keys(PAPEIS_DA_ORIGEM);
  const roleOptions = papeis
    .flatMap((p) =>
      accountEhRole(p.nome) ? [{ id: p.id, roleId: p.nome, ...PAPEIS_DA_ORIGEM[p.nome] }] : [],
    )
    .sort((a, b) => order.indexOf(a.roleId) - order.indexOf(b.roleId));

  return (
    <div className="pt-app">
      <BarraDoPortal data={shell} />

      <main className="pt-conteudo">
        <div className="mb-tela">
          <div className="mb-cabecalho">
            <Link className="mb-voltar" href="/contract" aria-label="Voltar ao painel do contrato">
              <IconePortal nome="esquerda" tamanho={24} />
            </Link>
            <h1>Membros do contrato {contract.nome}</h1>
          </div>

          {parametros.erro ? (
            <p className="ct-aviso" role="alert">
              {parametros.erro}
            </p>
          ) : null}

          <div className="mb-quadro">
            <div className="mb-card">
              <MembersAbas podeEscrever={podeEscrever}>
                <MembersTabela
                  podeEscrever={podeEscrever}
                  papeis={roleOptions}
                  /*
                   * You don't appear in your own list — it's their filter (`userIdentity !== loggedUser.identity`). Anyone who wants to leave uses "Deixar contrato", on the panel's summary card.
                   */
                  members={members
                    .filter((m) => !(m.tipo === 'usuario' && m.id === eu.user.id))
                    .map((m) => ({
                      id: m.id,
                      tipo: m.tipo,
                      nome: m.nome,
                      email: m.email,
                      role: accountEhRole(m.roleName)
                        ? PAPEIS_DA_ORIGEM[m.roleName].rotulo
                        : '',
                    }))}
                />
                {podeEscrever ? (
                  <ConvidarMembers
                    papeis={roleOptions}
                    membersEmails={members
                      .filter((m) => m.tipo === 'usuario')
                      .map((m) => m.email.toLowerCase())}
                  />
                ) : null}
              </MembersAbas>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
