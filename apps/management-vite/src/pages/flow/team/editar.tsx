import { useState } from 'react';
import { Avatar } from '@pipe/ui';
import type { TeamOfFlow, MemberOfFlow, RoleInFlow, PermissionsInFlow } from '@pipe/contracts';
import { useNavigate, useParams } from 'react-router-dom';
import { IconePortal } from '../../../components/icones-portal';
import { Selection } from '../../../components/selection';
import { atualizarLeituras } from '../../../lib/actions';
import { api, ApiError } from '../../../lib/api';
import { useRead } from '../../../lib/query';
import { NaoEncontrado } from '../../nao-encontrado';
import { ContactBarras, contactBase, useContact } from '../contact';
import { BotaoBds, PageHeader, Role } from '../settings/pecas';
import { PermissionsLista } from './tela';
import {
  NIVEIS_OF_EDIT,
  editNivel,
  permissionsOfNivelOfEdit,
  type EditNivel,
} from './permissions';
import '../settings/settings.css';
import './equipe.css';

/**
 * A página `auth.application.detail.team.edit` da Blip. O bundle prova
 * `url:"/team/edit"`, `back-button="auth.application.detail.team"` e o botão
 * Salvar no cabeçalho; por isso a edição não volta a ser modal.
 */
export function EditMemberPage() {
  const { contact } = useContact();
  const { userId = '' } = useParams();
  const read = useRead<TeamOfFlow>(`/v1/management/flows/${contact.id}/team`);
  const withoutPermission = read.error instanceof ApiError && read.error.status === 403;
  const member = read.data?.members.find((item) => item.userId === userId);

  return (
    <div className="pt-app">
      <ContactBarras ativo="Equipe" />
      <main>
        {withoutPermission ? (
          <p className="cf-aviso cf-container" role="alert">
            Você não tem permissão para editar a equipe.
          </p>
        ) : read.error ? (
          <p className="cf-aviso cf-container" role="alert">
            Não foi possível carregar o membro: {read.error.message}
          </p>
        ) : !read.data ? null : !read.data.podeGerir ? (
          <p className="cf-aviso cf-container" role="alert">
            Você não tem permissão para editar a equipe.
          </p>
        ) : !member ? (
          <NaoEncontrado />
        ) : (
          <Edit
            key={member.userId}
            flowId={contact.id}
            base={contactBase(contact.tipo, contact.id)}
            member={member}
            recursos={read.data.recursos}
          />
        )}
      </main>
    </div>
  );
}

function Edit({
  flowId,
  base,
  member,
  recursos,
}: {
  flowId: string;
  base: string;
  member: MemberOfFlow;
  recursos: TeamOfFlow['recursos'];
}) {
  const navegar = useNavigate();
  const [nivel, setNivel] = useState<EditNivel>(() =>
    editNivel(member.roleInFlow, recursos, member.permissions),
  );
  const [permissions, setPermissions] = useState<PermissionsInFlow>(member.permissions);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');
  const roleInFlow: RoleInFlow = nivel === 'nenhum' ? 'personalizado' : nivel;
  const mudou =
    roleInFlow !== member.roleInFlow ||
    recursos.some(
      (recurso) =>
        (permissions[recurso.key] ?? 'nenhum') !==
        (member.permissions[recurso.key] ?? 'nenhum'),
    );

  function escolher(proximo: EditNivel) {
    setNivel(proximo);
    setPermissions(permissionsOfNivelOfEdit(proximo, recursos, permissions));
  }

  async function salvar() {
    setEnviando(true);
    setAviso('');
    try {
      await api.patch(`/v1/management/flows/${flowId}/team/${member.userId}`, {
        roleInFlow,
        permissions,
      });
      atualizarLeituras();
      navegar(`${base}/team`);
    } catch (error) {
      setAviso((error as Error).message || 'Não foi possível salvar as alterações.');
      setEnviando(false);
    }
  }

  return (
    <>
      <PageHeader
        titulo={
          <div className="cf-equipe-editar-titulo">
            <button
              type="button"
              className="cf-equipe-voltar"
              aria-label="Voltar para Equipe"
              onClick={() => navegar(`${base}/team`)}
            >
              <IconePortal nome="esquerda" tamanho={24} />
            </button>
            <h1>Editar</h1>
          </div>
        }
        actions={
          <BotaoBds variante="bot" disabled={enviando || !mudou} onClick={salvar}>
            Salvar
          </BotaoBds>
        }
      />

      <div className="cf-container cf-equipe-editar">
        <div className="cf-equipe-editar-pessoa">
          <Avatar nome={member.nome} className="cf-equipe-editar-avatar" />
          <div>
            <div className="cf-equipe-editar-nome">
              <strong>{member.nome}</strong>
              {nivel === 'admin' ? <span className="cf-equipe-selo">Admin</span> : null}
            </div>
            <span>{member.email}</span>
          </div>
        </div>

        <Role className="cf-equipe-editar-cartao">
          <div className="cf-equipe-editar-controle">
            <h2>Permissões</h2>
            <Selection
              value={nivel}
              onChange={(evento) => escolher(evento.currentTarget.value as EditNivel)}
              aria-label="Permissões"
            >
              {NIVEIS_OF_EDIT.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.rotulo}
                </option>
              ))}
            </Selection>
          </div>
          <PermissionsLista
            recursos={recursos}
            permissions={permissions}
            editavel={nivel === 'personalizado'}
            toSwitch={(key, value) => {
              setNivel('personalizado');
              setPermissions({ ...permissions, [key]: value });
            }}
          />
          {aviso ? (
            <p className="cf-aviso" role="alert">
              {aviso}
            </p>
          ) : null}
        </Role>
      </div>
    </>
  );
}
