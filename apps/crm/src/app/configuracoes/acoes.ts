'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  atorAtual,
  definirAtivoDoMembro,
  cancelarConvite,
  convidar,
  criarCampoPersonalizado,
  criarChave,
  criarPapel,
  criarWebhook,
  definirAtivoDoWebhook,
  definirPapel,
  excluirCampoPersonalizado,
  excluirPapel,
  excluirWebhook,
  renomearCampoPersonalizado,
  revogarChave,
  salvarEspaco,
  salvarPerfil,
  salvarPermissoesDoPapel,
} from '../../lib/configuracoes-dados';
import { ehUuid, sugerirCodigo, type Resultado } from '../../lib/configuracoes-comum';

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

type Acao = (anterior: Resultado | null, dados: FormData) => Promise<Resultado>;

function texto(dados: FormData, campo: string): string {
  const valor = dados.get(campo);
  return typeof valor === 'string' ? valor : '';
}

function lista(dados: FormData, campo: string): string[] {
  return dados.getAll(campo).filter((v): v is string => typeof v === 'string');
}

function id(dados: FormData, campo: string): string | null {
  const valor = texto(dados, campo);
  return ehUuid(valor) ? valor : null;
}

const DESCONHECIDO: Resultado = { ok: false, erro: 'Não reconheço este registro.' };

function recarregar(...rotas: string[]) {
  for (const rota of rotas) revalidatePath(rota);
}

/* ---------------------------------------------------------------- perfil */

export const acaoSalvarPerfil: Acao = async (_anterior, dados) => {
  const resultado = await salvarPerfil(await atorAtual(), {
    nome: texto(dados, 'nome'),
    avatarUrl: texto(dados, 'avatarUrl'),
  });
  if (resultado.ok) recarregar('/configuracoes/perfil');
  return resultado;
};

/* ------------------------------------------------------ espaço de trabalho */

export const acaoSalvarEspaco: Acao = async (_anterior, dados) => {
  const resultado = await salvarEspaco(await atorAtual(), {
    nome: texto(dados, 'nome'),
    logoUrl: texto(dados, 'logoUrl'),
    fuso: texto(dados, 'fuso'),
  });
  if (resultado.ok) recarregar('/configuracoes/espaco');
  return resultado;
};

/* --------------------------------------------------------------- membros */

export const acaoConvidar: Acao = async (_anterior, dados) => {
  const papelId = id(dados, 'papelId');
  if (!papelId) return { ok: false, erro: 'Escolha o papel de quem está sendo convidado.' };

  const resultado = await convidar(await atorAtual(), { email: texto(dados, 'email'), papelId });
  if (resultado.ok) recarregar('/configuracoes/membros');
  return resultado;
};

export const acaoCancelarConvite: Acao = async (_anterior, dados) => {
  const conviteId = id(dados, 'id');
  if (!conviteId) return DESCONHECIDO;

  const resultado = await cancelarConvite(await atorAtual(), conviteId);
  if (resultado.ok) recarregar('/configuracoes/membros');
  return resultado;
};

export const acaoDefinirPapel: Acao = async (_anterior, dados) => {
  const usuarioId = id(dados, 'usuarioId');
  const papelId = id(dados, 'papelId');
  if (!usuarioId || !papelId) return DESCONHECIDO;

  const resultado = await definirPapel(await atorAtual(), usuarioId, papelId);
  if (resultado.ok) recarregar('/configuracoes/membros', '/configuracoes/papeis');
  return resultado;
};

export const acaoAlternarMembro: Acao = async (_anterior, dados) => {
  const usuarioId = id(dados, 'usuarioId');
  if (!usuarioId) return DESCONHECIDO;

  const resultado = await definirAtivoDoMembro(
    await atorAtual(),
    usuarioId,
    texto(dados, 'ativo') === 'sim',
  );
  if (resultado.ok) recarregar('/configuracoes/membros');
  return resultado;
};

/* ------------------------------------------------------ papéis e permissões */

export const acaoCriarPapel: Acao = async (_anterior, dados) => {
  const resultado = await criarPapel(await atorAtual(), {
    nome: texto(dados, 'nome'),
    descricao: texto(dados, 'descricao'),
  });
  if (resultado.ok) recarregar('/configuracoes/papeis');
  return resultado;
};

export const acaoSalvarPermissoes: Acao = async (_anterior, dados) => {
  const papelId = id(dados, 'papelId');
  if (!papelId) return DESCONHECIDO;

  const resultado = await salvarPermissoesDoPapel(
    await atorAtual(),
    papelId,
    lista(dados, 'permissao'),
  );
  if (resultado.ok) recarregar(`/configuracoes/papeis/${papelId}`, '/configuracoes/papeis');
  return resultado;
};

export const acaoExcluirPapel: Acao = async (_anterior, dados) => {
  const papelId = id(dados, 'papelId');
  if (!papelId) return DESCONHECIDO;

  const resultado = await excluirPapel(await atorAtual(), papelId);
  if (!resultado.ok) return resultado;

  // A tela de onde o clique veio deixou de existir. Ficar nela mostraria um
  // papel que já não está no banco até alguém navegar por conta própria.
  recarregar('/configuracoes/papeis');
  redirect('/configuracoes/papeis');
};

/* --------------------------------------------------- campos personalizados */

export const acaoCriarCampo: Acao = async (_anterior, dados) => {
  const rotulo = texto(dados, 'rotulo');
  // Código em branco vira o rótulo em forma de chave: ninguém precisa aprender a
  // regra do `jsonb` para cadastrar um campo, e quem quiser mandar continua podendo.
  const codigo = texto(dados, 'codigo').trim() || sugerirCodigo(rotulo);

  const resultado = await criarCampoPersonalizado(await atorAtual(), {
    codigo,
    rotulo,
    tipo: texto(dados, 'tipo'),
    descricao: texto(dados, 'descricao'),
  });
  if (resultado.ok) recarregar('/configuracoes/campos');
  return resultado;
};

export const acaoRenomearCampo: Acao = async (_anterior, dados) => {
  const campoId = id(dados, 'id');
  if (!campoId) return DESCONHECIDO;

  const resultado = await renomearCampoPersonalizado(await atorAtual(), campoId, {
    rotulo: texto(dados, 'rotulo'),
    descricao: texto(dados, 'descricao'),
  });
  if (resultado.ok) recarregar('/configuracoes/campos');
  return resultado;
};

export const acaoExcluirCampo: Acao = async (_anterior, dados) => {
  const campoId = id(dados, 'id');
  if (!campoId) return DESCONHECIDO;

  const resultado = await excluirCampoPersonalizado(await atorAtual(), campoId);
  if (resultado.ok) recarregar('/configuracoes/campos');
  return resultado;
};

/* ------------------------------------------------------- chaves e webhooks */

export const acaoCriarChave: Acao = async (_anterior, dados) => {
  const resultado = await criarChave(await atorAtual(), {
    nome: texto(dados, 'nome'),
    escopos: lista(dados, 'escopo'),
  });
  if (resultado.ok) recarregar('/configuracoes/api');
  return resultado;
};

export const acaoRevogarChave: Acao = async (_anterior, dados) => {
  const chaveId = id(dados, 'id');
  if (!chaveId) return DESCONHECIDO;

  const resultado = await revogarChave(await atorAtual(), chaveId);
  if (resultado.ok) recarregar('/configuracoes/api');
  return resultado;
};

export const acaoCriarWebhook: Acao = async (_anterior, dados) => {
  const resultado = await criarWebhook(await atorAtual(), {
    url: texto(dados, 'url'),
    eventos: lista(dados, 'evento'),
  });
  if (resultado.ok) recarregar('/configuracoes/api');
  return resultado;
};

export const acaoAlternarWebhook: Acao = async (_anterior, dados) => {
  const webhookId = id(dados, 'id');
  if (!webhookId) return DESCONHECIDO;

  const resultado = await definirAtivoDoWebhook(
    await atorAtual(),
    webhookId,
    texto(dados, 'ativo') === 'sim',
  );
  if (resultado.ok) recarregar('/configuracoes/api');
  return resultado;
};

export const acaoExcluirWebhook: Acao = async (_anterior, dados) => {
  const webhookId = id(dados, 'id');
  if (!webhookId) return DESCONHECIDO;

  const resultado = await excluirWebhook(await atorAtual(), webhookId);
  if (resultado.ok) recarregar('/configuracoes/api');
  return resultado;
};
