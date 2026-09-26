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
 * Membros — o cartão "Adicione e exclua membros do contrato" do painel, que na
 * origem abre a rota `/panel` do fragmento.
 *
 * Quem entra aqui precisa de `conta.membros.ler`, e a conferência é a DE
 * VERDADE: o `?demo=1` do painel é só desenho e não abre porta nenhuma. Quem
 * chegar sem a permissão volta para o painel.
 *
 * O contrato de dados da origem está em `referencias-blip/pesquisa/blip-membros-do-contrato.md`.
 * A casca é a de lá: a seta de voltar e "Membros do contrato {nome}" no alto
 * (`setHeaderContent({ redirect: "/", text: … })`), e abaixo um cartão só, com a
 * tabela de seleção dentro. O que o painel chama de descrição do cartão
 * ("Adicione e exclua membros do contrato") **não** se repete aqui: lá também
 * não se repete.
 *
 * Os papéis são os três DA CONTA (migração 0021) e aparecem com os rótulos
 * deles — "Admin", "Pode editar", "Pode visualizar" —, nunca com o nome do
 * banco. Gestor, supervisor, atendente e avaliador são de atendimento e não
 * entram aqui: na origem eles são dados por contato.
 *
 * **Convidar** fica abaixo da tabela, à direita, só para quem escreve — como o
 * `bp-btn--blip-dark` deles. Quem grava é a `api` (`POST /v1/convites`), e o
 * link volta pelo estado do modal, nunca pela URL (ver `convidarMembros`). Os
 * convites emitidos aparecem na lista com "(Pendente)", como na origem.
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

  /* Na ordem da origem (guest, member, admin), que é a ordem das chaves do mapa. */
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
            <div className="mb-cartao">
              <MembersAbas podeEscrever={podeEscrever}>
                <MembersTabela
                  podeEscrever={podeEscrever}
                  papeis={roleOptions}
                  /* Você não entra na sua própria lista — é o filtro deles
                     (`userIdentity !== loggedUser.identity`). Quem quer sair usa
                     "Deixar contrato", no cartão de resumo do painel. */
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
