import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Etiqueta, Icone } from '@pipe/ui';
import { Block } from '../../../../components/settings/cabecalho';
import {
  ConfirmationButton,
  Formulario,
} from '../../../../components/settings/formulario';
import { readRole, permissionsListCatalog } from '../../../../lib/settings-data';
import { ehUuid, type CatalogPermission } from '../../../../lib/settings-comum';
import { numero } from '../../../../lib/format';
import { actionDeleteRole, actionSavePermissions } from '../../actions';

export const dynamic = 'force-dynamic';

/**
 * A role, permission by permission.
 *
 * The grouping follows the catalog itself (`permissao.grupo`), not some new taxonomy:
 * the database already knows `conversa.transferir` belongs to conversation, and
 * inventing another split here would create two truths about the same thing.
 *
 * The checkbox is a real `<input type="checkbox">`, wrapped in a `<label>`: keyboard
 * support, `aria-checked`, and the state read aloud come for free, and the repeated
 * `name="permissao"` is what makes `FormData` arrive as a list on the server.
 * Reimplementing this with a `div` and `role="checkbox"` is work that leaves you
 * with less.
 *
 * The danger zone follows Twenty's pattern, with one difference: here the button only
 * arms after the first click, and refuses when there are still people with the role.
 * Deleting a role that still has members in it takes away someone's access without
 * saying whose.
 */

const NOME_DO_GRUPO: Record<string, string> = {
  conversa: 'Conversa',
  contato: 'Contato',
  crm: 'CRM',
  gestao: 'Gestão',
  monitoria: 'Monitoria',
  automacao: 'Automação',
  administracao: 'Administração',
};

function agrupar(catalogo: CatalogPermission[]): [string, CatalogPermission[]][] {
  const groups = new Map<string, CatalogPermission[]>();
  for (const item of catalogo) {
    const lista = groups.get(item.grupo) ?? [];
    lista.push(item);
    groups.set(item.grupo, lista);
  }
  return [...groups.entries()];
}

export default async function RolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ehUuid(id)) notFound();

  const role = await readRole(id);
  if (!role) notFound();

  const catalogo = await permissionsListCatalog();
  const concedidas = new Set(role.concedidas);

  return (
    <>
      <div className="cfg-cabecalho">
        <Link className="cfg-voltar" href="/settings/roles">
          <Icone nome="esquerda" tamanho={14} />
          Papéis e permissões
        </Link>
        <h2>
          {role.nome}
          {role.deSistema ? <Etiqueta>Sistema</Etiqueta> : null}
        </h2>
        <p className="sub">
          {role.description ? `${role.description} · ` : ''}
          {numero(role.permissions)} de {numero(catalogo.length)} permissões ·{' '}
          {numero(role.members)} pessoa{role.members === 1 ? '' : 's'}
        </p>
      </div>

      {role.deSistema ? (
        <p className="cfg-nota" role="note">
          Este é um dos papéis do dia 1. Ele é a base que a semente garante, e mexer nele mudaria o
          Desk e a Gestão de todo mundo aqui dentro. Para uma combinação diferente,{' '}
          <Link href="/settings/roles">crie um papel próprio</Link>.
        </p>
      ) : null}

      <Block
        titulo="Permissões"
        description="Cada linha é uma capacidade nomeada do produto. Sem marca, o papel não a tem."
      >
        <Formulario acao={actionSavePermissions} rotuloBotao="Salvar permissões">
          <input type="hidden" name="papelId" value={role.id} />
          {agrupar(catalogo).map(([grupo, itens]) => (
            <fieldset className="cfg-permissions" key={grupo}>
              <legend>{NOME_DO_GRUPO[grupo] ?? grupo}</legend>
              {itens.map((item) => (
                <label key={item.codigo}>
                  <input
                    type="checkbox"
                    name="permissao"
                    value={item.codigo}
                    defaultChecked={concedidas.has(item.codigo)}
                    disabled={role.deSistema}
                  />
                  <span>
                    <b>{item.description}</b>
                    <span className="sub mono">{item.codigo}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          ))}
        </Formulario>
      </Block>

      <Block
        titulo="Quem tem este papel"
        description="Trocar o papel de alguém é na tela de Membros."
      >
        {role.membersNames.length === 0 ? (
          <p className="sub">Ninguém ainda.</p>
        ) : (
          <ul className="cfg-pessoas">
            {role.membersNames.map((nome) => (
              <li key={nome}>
                <Etiqueta>{nome}</Etiqueta>
              </li>
            ))}
          </ul>
        )}
      </Block>

      {role.deSistema ? null : (
        <Block
          titulo="Excluir papel"
          description="Só é possível quando ninguém está com ele. Fica registrado no log de auditoria."
        >
          <Formulario
            acao={actionDeleteRole}
            botao={
              <ConfirmationButton
                rotulo="Excluir papel"
                pergunta={`Excluir "${role.nome}"? Isto não volta.`}
                rotuloConfirmar="Excluir mesmo"
              />
            }
          >
            <input type="hidden" name="papelId" value={role.id} />
          </Formulario>
        </Block>
      )}
    </>
  );
}
