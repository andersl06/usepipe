import { useState } from 'react';
import { Avatar } from '@pipe/ui';
import type { TeamOfFlow, MemberOfFlow, RoleInFlow, PermissionsInFlow } from '@pipe/contracts';
import { useNavigate, useParams } from 'react-router-dom';
import { IconePortal } from '@pipe/ui/icones-portal';
import { Selection } from '../../../components/selection';
import { atualizarLeituras } from '../../../lib/actions';
import { api, ApiError } from '@pipe/ui/api';
import { useRead } from '../../../lib/query';
import { NaoEncontrado } from '../../nao-encontrado';
import { ContactBars, contactPath, useContact } from '../contact';
import { BotaoBds, PageHeader, Role } from '../settings/pecas';
import { PermissionsList } from './tela';
import {
  LEVELS_OF_EDIT,
  editLevel,
  permissionsOfLevelOfEdit,
  type EditLevel,
} from './permissions';
import '../settings/settings.css';
import './equipe.css';

/**
 * Blip's `auth.application.detail.team.edit` page. The bundle shows `url:"/team/edit"`, `back-button="auth.application.detail.team"`, and the Save button in the header; that's why editing doesn't go back to being a modal.
 */
export function EditMemberPage() {
  const { contact } = useContact();
  const { userId = '' } = useParams();
  const read = useRead<TeamOfFlow>(`/v1/management/flows/${contact.id}/team`);
  const withoutPermission = read.error instanceof ApiError && read.error.status === 403;
  const member = read.data?.members.find((item) => item.userId === userId);

  return (
    <div className="pt-app">
      <ContactBars ativo="Equipe" />
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
            base={contactPath(contact)}
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
  const [nivel, setNivel] = useState<EditLevel>(() =>
    editLevel(member.roleInFlow, recursos, member.permissions),
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

  function escolher(proximo: EditLevel) {
    setNivel(proximo);
    setPermissions(permissionsOfLevelOfEdit(proximo, recursos, permissions));
  }

  async function salvar() {
    setEnviando(true);
    setAviso('');
    try {
      await api.patch(`/v1/management/flows/${flowId}/team/${member.userId}`, {
        papelNoFluxo: roleInFlow,
        permissoes: permissions,
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

        <Role className="cf-team-edit-card">
          <div className="cf-equipe-editar-controle">
            <h2>Permissões</h2>
            <Selection
              value={nivel}
              onChange={(evento) => escolher(evento.currentTarget.value as EditLevel)}
              aria-label="Permissões"
            >
              {LEVELS_OF_EDIT.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.rotulo}
                </option>
              ))}
            </Selection>
          </div>
          <PermissionsList
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
