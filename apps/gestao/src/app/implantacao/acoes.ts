'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { COOKIE_SESSAO, chamarApi } from '../../lib/sessao';

/**
 * Server Actions do assistente de implantação.
 *
 * Diferente das outras telas da Gestão, que gravam no banco pelo `consultar`,
 * estas passam pela `api`: conectar grava o token da Meta cifrado, convidar é
 * regra de identidade, importar é trabalho do worker. A Gestão só repassa, com o
 * cookie da sessão — e a `api` decide o tenant pela sessão, nunca pelo corpo.
 *
 * Mesmo formato de resultado das outras ações: o erro esperado volta como valor,
 * não como exceção, para o `useActionState` mostrar a mensagem.
 */

export interface ResultadoDaAcao {
  ok: boolean;
  erro?: string;
  mensagem?: string;
  /** Só no convite: o link que a pessoa convidada abre. */
  link?: string;
}

export interface InicioDoCadastro {
  ok: boolean;
  erro?: string;
  estado?: string;
  appId?: string;
  configId?: string;
  versao?: string;
  modo?: 'real' | 'duble';
}

export interface CredenciaisDoCadastro {
  codigo: string;
  wabaId: string;
  numeroId?: string;
  businessId?: string;
  coexistencia?: boolean;
  estado: string;
  /** Presente, é reautorização daquele canal. */
  canalId?: string;
}

async function cookieDaSessao(): Promise<string> {
  const cookie = (await cookies()).get(COOKIE_SESSAO);
  return cookie ? `${COOKIE_SESSAO}=${cookie.value}` : '';
}

/** A frase que a `api` mandou em `{ erro: { mensagem } }`, ou o status. */
async function erroDaApi(resposta: Response): Promise<string> {
  try {
    const corpo = (await resposta.json()) as { erro?: { mensagem?: string } };
    return corpo.erro?.mensagem ?? `A API respondeu ${resposta.status}.`;
  } catch {
    return `A API respondeu ${resposta.status}.`;
  }
}

function postarJson(cookie: string, caminho: string, corpo: unknown): Promise<Response> {
  return chamarApi(cookie, caminho, {
    method: 'POST',
    body: JSON.stringify(corpo),
    headers: { 'content-type': 'application/json' },
  });
}

function atualizarTelas(): void {
  revalidatePath('/implantacao');
  revalidatePath('/canais');
}

/** O `state` desta abertura e o que o SDK da Meta precisa. Chamado ANTES do popup. */
export async function iniciarCadastroEmbutido(): Promise<InicioDoCadastro> {
  const resposta = await chamarApi(await cookieDaSessao(), '/v1/canais/whatsapp/estado', {
    method: 'POST',
  });
  if (!resposta.ok) return { ok: false, erro: await erroDaApi(resposta) };
  return { ok: true, ...((await resposta.json()) as Omit<InicioDoCadastro, 'ok'>) };
}

/**
 * Entrega o `code` do popup à `api`. O `code` vive 30 segundos: esta chamada
 * sai no instante em que o popup devolve, sem nada no meio.
 */
export async function concluirCadastroEmbutido(
  credenciais: CredenciaisDoCadastro,
): Promise<ResultadoDaAcao> {
  const resposta = await postarJson(await cookieDaSessao(), '/v1/canais/whatsapp', {
    codigo: credenciais.codigo,
    waba_id: credenciais.wabaId,
    phone_number_id: credenciais.numeroId || undefined,
    business_id: credenciais.businessId || undefined,
    coexistencia: credenciais.coexistencia === true,
    estado: credenciais.estado,
    canal_id: credenciais.canalId,
  });
  if (!resposta.ok) return { ok: false, erro: await erroDaApi(resposta) };

  const canal = (await resposta.json()) as { numero?: string | null; nome?: string; motivo?: string | null };
  atualizarTelas();
  if (canal.motivo === 'reautorizacao_pendente') {
    return {
      ok: true,
      mensagem: 'O número foi ligado, mas a Meta não aceitou a configuração do webhook. Reconecte.',
    };
  }
  return {
    ok: true,
    mensagem: credenciais.canalId
      ? 'Reautorização concluída.'
      : `WhatsApp conectado: ${canal.numero ?? canal.nome ?? 'número novo'}.`,
  };
}

export async function conectarManual(
  _anterior: ResultadoDaAcao,
  dados: FormData,
): Promise<ResultadoDaAcao> {
  const campo = (nome: string) => String(dados.get(nome) ?? '').trim();
  const resposta = await postarJson(await cookieDaSessao(), '/v1/canais/whatsapp/manual', {
    waba_id: campo('wabaId'),
    phone_number_id: campo('numeroId'),
    access_token: campo('token'),
    nome: campo('nome') || undefined,
  });
  if (!resposta.ok) return { ok: false, erro: await erroDaApi(resposta) };

  const canal = (await resposta.json()) as { nome?: string; erroDeWebhook?: string | null };
  atualizarTelas();
  return canal.erroDeWebhook
    ? { ok: true, mensagem: `Canal criado, mas o webhook falhou: ${canal.erroDeWebhook}` }
    : { ok: true, mensagem: `Canal ${canal.nome ?? ''} conectado.` };
}

/** Reaproveita `POST /v1/convites`: o link sai daqui e não volta a aparecer. */
export async function convidar(_anterior: ResultadoDaAcao, dados: FormData): Promise<ResultadoDaAcao> {
  const resposta = await postarJson(await cookieDaSessao(), '/v1/convites', {
    email: String(dados.get('email') ?? '').trim(),
    papel: String(dados.get('papel') ?? '').trim(),
  });
  if (!resposta.ok) return { ok: false, erro: await erroDaApi(resposta) };

  const convite = (await resposta.json()) as { email: string; url: string };
  revalidatePath('/implantacao');
  return { ok: true, mensagem: `Convite para ${convite.email} criado.`, link: convite.url };
}

export async function importarContatos(
  _anterior: ResultadoDaAcao,
  dados: FormData,
): Promise<ResultadoDaAcao> {
  const arquivo = dados.get('arquivo');
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { ok: false, erro: 'Escolha um arquivo CSV.' };
  }

  const resposta = await chamarApi(
    await cookieDaSessao(),
    `/v1/contatos/importacoes?nome=${encodeURIComponent(arquivo.name)}`,
    { method: 'POST', body: await arquivo.text(), headers: { 'content-type': 'text/csv' } },
  );
  if (!resposta.ok) return { ok: false, erro: await erroDaApi(resposta) };

  const importacao = (await resposta.json()) as {
    estado: string;
    aceitos: number;
    rejeitados: number;
  };
  revalidatePath('/implantacao');
  if (importacao.estado === 'falhou') {
    return { ok: false, erro: 'O arquivo tem aspas malformadas e nada foi importado.' };
  }
  if (importacao.estado === 'concluida') {
    return {
      ok: true,
      mensagem: `${importacao.aceitos} contato(s) importado(s), ${importacao.rejeitados} linha(s) rejeitada(s).`,
    };
  }
  return { ok: true, mensagem: 'Arquivo recebido. A importação roda em segundo plano.' };
}
