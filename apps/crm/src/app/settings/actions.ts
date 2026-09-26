'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  atorAtual,
  memberDefinirActive,
  cancelarInvitation,
  convidar,
  createFieldCustom,
  createKey,
  createRole,
  createWebhook,
  definirAtivoDoWebhook,
  definirRole,
  excluirCampoPersonalizado,
  excluirRole,
  excluirWebhook,
  renomearCampoPersonalizado,
  revogarKey,
  salvarEspaco,
  salvarPerfil,
  roleSalvarPermissions,
} from '../../lib/settings-data';
import { ehUuid, sugerirCodigo, type Resultado } from '../../lib/settings-comum';

/**
 * The settings area's write actions.
 *
 * This layer is thin on purpose, and the boundary it guards is in the README ("Who talks
 * to the database"): what lives here is Next-specific — reading `FormData`,
 * revalidating the route — and nothing else. Querying and auditing live in
 * `lib/configuracoes-dados.ts`, which doesn't know Next exists. When the CRM moves
 * to Vite and `apps/api` becomes the only door to Postgres, this file is the
 * one that gets thrown away; the other one moves.
 *
 * Every action has the `useActionState` signature: it receives the previous result and
 * the `FormData`, and returns the new result. That's what makes the form work
 * **without JavaScript** and still show the complaint in Portuguese on screen.
 *
 * The `id` that arrives from the browser is never trusted: it passes through `ehUuid` before
 * becoming a `where` clause. It's the same rule as `app/leads/acoes.ts` — client input
 * never determines a write value.
 */

type Acao = (anterior: Resultado | null, data: FormData) => Promise<Resultado>;

function texto(data: FormData, campo: string): string {
  const value = data.get(campo);
  return typeof value === 'string' ? value : '';
}

function lista(data: FormData, campo: string): string[] {
  return data.getAll(campo).filter((v): v is string => typeof v === 'string');
}

function id(data: FormData, campo: string): string | null {
  const value = texto(data, campo);
  return ehUuid(value) ? value : null;
}

const DESCONHECIDO: Resultado = { ok: false, error: 'Não reconheço este registro.' };

function recarregar(...rotas: string[]) {
  for (const rota of rotas) revalidatePath(rota);
}

/* ---------------------------------------------------------------- perfil */

export const acaoSalvarPerfil: Acao = async (_anterior, data) => {
  const resultado = await salvarPerfil(await atorAtual(), {
    nome: texto(data, 'nome'),
    avatarUrl: texto(data, 'avatarUrl'),
  });
  if (resultado.ok) recarregar('/settings/profile');
  return resultado;
};

/* ------------------------------------------------------ workspace */

export const acaoSalvarEspaco: Acao = async (_anterior, data) => {
  const resultado = await salvarEspaco(await atorAtual(), {
    nome: texto(data, 'nome'),
    logoUrl: texto(data, 'logoUrl'),
    fuso: texto(data, 'fuso'),
  });
  if (resultado.ok) recarregar('/settings/workspace');
  return resultado;
};

/* --------------------------------------------------------------- membros */

export const acaoConvidar: Acao = async (_anterior, data) => {
  const roleId = id(data, 'papelId');
  if (!roleId) return { ok: false, error: 'Escolha o papel de quem está sendo convidado.' };

  const resultado = await convidar(await atorAtual(), { email: texto(data, 'email'), roleId });
  if (resultado.ok) recarregar('/settings/members');
  return resultado;
};

export const actionCancelarInvitation: Acao = async (_anterior, data) => {
  const invitationId = id(data, 'id');
  if (!invitationId) return DESCONHECIDO;

  const resultado = await cancelarInvitation(await atorAtual(), invitationId);
  if (resultado.ok) recarregar('/settings/members');
  return resultado;
};

export const actionDefinirRole: Acao = async (_anterior, data) => {
  const userId = id(data, 'usuarioId');
  const roleId = id(data, 'papelId');
  if (!userId || !roleId) return DESCONHECIDO;

  const resultado = await definirRole(await atorAtual(), userId, roleId);
  if (resultado.ok) recarregar('/settings/members', '/settings/roles');
  return resultado;
};

export const actionAlternarMember: Acao = async (_anterior, data) => {
  const userId = id(data, 'usuarioId');
  if (!userId) return DESCONHECIDO;

  const resultado = await memberDefinirActive(
    await atorAtual(),
    userId,
    texto(data, 'ativo') === 'sim',
  );
  if (resultado.ok) recarregar('/settings/members');
  return resultado;
};

/* ------------------------------------------------------ roles and permissions */

export const actionCreateRole: Acao = async (_anterior, data) => {
  const resultado = await createRole(await atorAtual(), {
    nome: texto(data, 'nome'),
    description: texto(data, 'descricao'),
  });
  if (resultado.ok) recarregar('/settings/roles');
  return resultado;
};

export const actionSalvarPermissions: Acao = async (_anterior, data) => {
  const roleId = id(data, 'papelId');
  if (!roleId) return DESCONHECIDO;

  const resultado = await roleSalvarPermissions(
    await atorAtual(),
    roleId,
    lista(data, 'permissao'),
  );
  if (resultado.ok) recarregar(`/settings/roles/${roleId}`, '/settings/roles');
  return resultado;
};

export const actionExcluirRole: Acao = async (_anterior, data) => {
  const roleId = id(data, 'papelId');
  if (!roleId) return DESCONHECIDO;

  const resultado = await excluirRole(await atorAtual(), roleId);
  if (!resultado.ok) return resultado;

  // A tela de onde o clique veio deixou de existir. Ficar nela mostraria um
  // role that's no longer in the database, until someone navigates away on their own.
  recarregar('/settings/roles');
  redirect('/settings/roles');
};

/* --------------------------------------------------- campos personalizados */

export const actionCreateField: Acao = async (_anterior, data) => {
  const rotulo = texto(data, 'rotulo');
  // A blank code turns into the label written as a key: nobody needs to learn the
  // regra do `jsonb` para cadastrar um campo, e quem quiser mandar continua podendo.
  const codigo = texto(data, 'codigo').trim() || sugerirCodigo(rotulo);

  const resultado = await createFieldCustom(await atorAtual(), {
    codigo,
    rotulo,
    tipo: texto(data, 'tipo'),
    description: texto(data, 'descricao'),
  });
  if (resultado.ok) recarregar('/settings/fields');
  return resultado;
};

export const acaoRenomearCampo: Acao = async (_anterior, data) => {
  const campoId = id(data, 'id');
  if (!campoId) return DESCONHECIDO;

  const resultado = await renomearCampoPersonalizado(await atorAtual(), campoId, {
    rotulo: texto(data, 'rotulo'),
    description: texto(data, 'descricao'),
  });
  if (resultado.ok) recarregar('/settings/fields');
  return resultado;
};

export const acaoExcluirCampo: Acao = async (_anterior, data) => {
  const campoId = id(data, 'id');
  if (!campoId) return DESCONHECIDO;

  const resultado = await excluirCampoPersonalizado(await atorAtual(), campoId);
  if (resultado.ok) recarregar('/settings/fields');
  return resultado;
};

/* ------------------------------------------------------- chaves e webhooks */

export const actionCreateKey: Acao = async (_anterior, data) => {
  const resultado = await createKey(await atorAtual(), {
    nome: texto(data, 'nome'),
    scopes: lista(data, 'escopo'),
  });
  if (resultado.ok) recarregar('/settings/api');
  return resultado;
};

export const actionRevogarKey: Acao = async (_anterior, data) => {
  const keyId = id(data, 'id');
  if (!keyId) return DESCONHECIDO;

  const resultado = await revogarKey(await atorAtual(), keyId);
  if (resultado.ok) recarregar('/settings/api');
  return resultado;
};

export const actionCreateWebhook: Acao = async (_anterior, data) => {
  const resultado = await createWebhook(await atorAtual(), {
    url: texto(data, 'url'),
    eventos: lista(data, 'evento'),
  });
  if (resultado.ok) recarregar('/settings/api');
  return resultado;
};

export const acaoAlternarWebhook: Acao = async (_anterior, data) => {
  const webhookId = id(data, 'id');
  if (!webhookId) return DESCONHECIDO;

  const resultado = await definirAtivoDoWebhook(
    await atorAtual(),
    webhookId,
    texto(data, 'ativo') === 'sim',
  );
  if (resultado.ok) recarregar('/settings/api');
  return resultado;
};

export const acaoExcluirWebhook: Acao = async (_anterior, data) => {
  const webhookId = id(data, 'id');
  if (!webhookId) return DESCONHECIDO;

  const resultado = await excluirWebhook(await atorAtual(), webhookId);
  if (resultado.ok) recarregar('/settings/api');
  return resultado;
};
