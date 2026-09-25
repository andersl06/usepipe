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
 * As ações de escrita da área de configurações.
 *
 * Esta camada é fina de propósito, e a fronteira que ela guarda está no README
 * ("Quem fala com o banco"): aqui mora o que é do Next — ler o `FormData`,
 * revalidar a rota —, e nada mais. A consulta e a auditoria vivem em
 * `lib/configuracoes-dados.ts`, que não sabe que o Next existe. Quando o CRM for
 * para o Vite e a `apps/api` virar a única porta do Postgres, este arquivo é o
 * que se joga fora; o outro se move.
 *
 * Toda ação tem a assinatura de `useActionState`: recebe o resultado anterior e
 * o `FormData`, devolve o novo resultado. É o que faz o formulário funcionar
 * **sem JavaScript** e ainda assim mostrar a queixa em português na tela.
 *
 * O `id` que chega do navegador nunca é confiado: passa por `ehUuid` antes de
 * virar `where`. É a mesma regra de `app/leads/acoes.ts` — entrada de cliente
 * não define valor de escrita.
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
  if (resultado.ok) recarregar('/configuracoes/perfil');
  return resultado;
};

/* ------------------------------------------------------ espaço de trabalho */

export const acaoSalvarEspaco: Acao = async (_anterior, data) => {
  const resultado = await salvarEspaco(await atorAtual(), {
    nome: texto(data, 'nome'),
    logoUrl: texto(data, 'logoUrl'),
    fuso: texto(data, 'fuso'),
  });
  if (resultado.ok) recarregar('/configuracoes/espaco');
  return resultado;
};

/* --------------------------------------------------------------- membros */

export const acaoConvidar: Acao = async (_anterior, data) => {
  const roleId = id(data, 'papelId');
  if (!roleId) return { ok: false, error: 'Escolha o papel de quem está sendo convidado.' };

  const resultado = await convidar(await atorAtual(), { email: texto(data, 'email'), roleId });
  if (resultado.ok) recarregar('/configuracoes/membros');
  return resultado;
};

export const actionCancelarInvitation: Acao = async (_anterior, data) => {
  const invitationId = id(data, 'id');
  if (!invitationId) return DESCONHECIDO;

  const resultado = await cancelarInvitation(await atorAtual(), invitationId);
  if (resultado.ok) recarregar('/configuracoes/membros');
  return resultado;
};

export const actionDefinirRole: Acao = async (_anterior, data) => {
  const userId = id(data, 'usuarioId');
  const roleId = id(data, 'papelId');
  if (!userId || !roleId) return DESCONHECIDO;

  const resultado = await definirRole(await atorAtual(), userId, roleId);
  if (resultado.ok) recarregar('/configuracoes/membros', '/configuracoes/papeis');
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
  if (resultado.ok) recarregar('/configuracoes/membros');
  return resultado;
};

/* ------------------------------------------------------ papéis e permissões */

export const actionCreateRole: Acao = async (_anterior, data) => {
  const resultado = await createRole(await atorAtual(), {
    nome: texto(data, 'nome'),
    description: texto(data, 'descricao'),
  });
  if (resultado.ok) recarregar('/configuracoes/papeis');
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
  if (resultado.ok) recarregar(`/configuracoes/papeis/${roleId}`, '/configuracoes/papeis');
  return resultado;
};

export const actionExcluirRole: Acao = async (_anterior, data) => {
  const roleId = id(data, 'papelId');
  if (!roleId) return DESCONHECIDO;

  const resultado = await excluirRole(await atorAtual(), roleId);
  if (!resultado.ok) return resultado;

  // A tela de onde o clique veio deixou de existir. Ficar nela mostraria um
  // papel que já não está no banco até alguém navegar por conta própria.
  recarregar('/configuracoes/papeis');
  redirect('/settings/roles');
};

/* --------------------------------------------------- campos personalizados */

export const actionCreateField: Acao = async (_anterior, data) => {
  const rotulo = texto(data, 'rotulo');
  // Código em branco vira o rótulo em forma de chave: ninguém precisa aprender a
  // regra do `jsonb` para cadastrar um campo, e quem quiser mandar continua podendo.
  const codigo = texto(data, 'codigo').trim() || sugerirCodigo(rotulo);

  const resultado = await createFieldCustom(await atorAtual(), {
    codigo,
    rotulo,
    tipo: texto(data, 'tipo'),
    description: texto(data, 'descricao'),
  });
  if (resultado.ok) recarregar('/configuracoes/campos');
  return resultado;
};

export const acaoRenomearCampo: Acao = async (_anterior, data) => {
  const campoId = id(data, 'id');
  if (!campoId) return DESCONHECIDO;

  const resultado = await renomearCampoPersonalizado(await atorAtual(), campoId, {
    rotulo: texto(data, 'rotulo'),
    description: texto(data, 'descricao'),
  });
  if (resultado.ok) recarregar('/configuracoes/campos');
  return resultado;
};

export const acaoExcluirCampo: Acao = async (_anterior, data) => {
  const campoId = id(data, 'id');
  if (!campoId) return DESCONHECIDO;

  const resultado = await excluirCampoPersonalizado(await atorAtual(), campoId);
  if (resultado.ok) recarregar('/configuracoes/campos');
  return resultado;
};

/* ------------------------------------------------------- chaves e webhooks */

export const actionCreateKey: Acao = async (_anterior, data) => {
  const resultado = await createKey(await atorAtual(), {
    nome: texto(data, 'nome'),
    scopes: lista(data, 'escopo'),
  });
  if (resultado.ok) recarregar('/configuracoes/api');
  return resultado;
};

export const actionRevogarKey: Acao = async (_anterior, data) => {
  const keyId = id(data, 'id');
  if (!keyId) return DESCONHECIDO;

  const resultado = await revogarKey(await atorAtual(), keyId);
  if (resultado.ok) recarregar('/configuracoes/api');
  return resultado;
};

export const actionCreateWebhook: Acao = async (_anterior, data) => {
  const resultado = await createWebhook(await atorAtual(), {
    url: texto(data, 'url'),
    eventos: lista(data, 'evento'),
  });
  if (resultado.ok) recarregar('/configuracoes/api');
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
  if (resultado.ok) recarregar('/configuracoes/api');
  return resultado;
};

export const acaoExcluirWebhook: Acao = async (_anterior, data) => {
  const webhookId = id(data, 'id');
  if (!webhookId) return DESCONHECIDO;

  const resultado = await excluirWebhook(await atorAtual(), webhookId);
  if (resultado.ok) recarregar('/configuracoes/api');
  return resultado;
};
