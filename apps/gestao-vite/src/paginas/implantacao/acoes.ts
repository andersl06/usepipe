import { chamarApi, motivoDaFalha } from '../../lib/api';
import { atualizarLeituras } from '../../lib/acoes';

/**
 * As ações da Implantação — as mesmas Server Actions de antes, agora chamando
 * a `api` do navegador. O cookie vai sozinho; `revalidatePath` virou
 * `atualizarLeituras`.
 */
export interface ResultadoDaAcao {
  ok: boolean;
  erro?: string;
  mensagem?: string;
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
  canalId?: string;
}

function postarJson(caminho: string, corpo: unknown): Promise<Response> {
  return chamarApi(caminho, {
    method: 'POST',
    body: JSON.stringify(corpo),
    headers: { 'content-type': 'application/json' },
  });
}

/** O primeiro passo do cadastro embutido: a `api` gera o estado e diz o modo. */
export async function iniciarCadastroEmbutido(): Promise<InicioDoCadastro> {
  const resposta = await chamarApi('/v1/canais/whatsapp/estado', { method: 'POST' });
  if (!resposta.ok) return { ok: false, erro: await motivoDaFalha(resposta) };
  return { ok: true, ...((await resposta.json()) as Omit<InicioDoCadastro, 'ok'>) };
}

/** O último: o código do Facebook vira canal na `api`. */
export async function concluirCadastroEmbutido(
  credenciais: CredenciaisDoCadastro,
): Promise<ResultadoDaAcao> {
  const resposta = await postarJson('/v1/canais/whatsapp', {
    codigo: credenciais.codigo,
    waba_id: credenciais.wabaId,
    phone_number_id: credenciais.numeroId || undefined,
    business_id: credenciais.businessId || undefined,
    coexistencia: credenciais.coexistencia === true,
    estado: credenciais.estado,
    canal_id: credenciais.canalId,
  });
  if (!resposta.ok) return { ok: false, erro: await motivoDaFalha(resposta) };
  const canal = (await resposta.json()) as {
    numero?: string | null;
    nome?: string;
    motivo?: string | null;
  };
  atualizarLeituras();
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
  const resposta = await postarJson('/v1/canais/whatsapp/manual', {
    waba_id: campo('wabaId'),
    phone_number_id: campo('numeroId'),
    access_token: campo('token'),
    nome: campo('nome') || undefined,
  });
  if (!resposta.ok) return { ok: false, erro: await motivoDaFalha(resposta) };
  const canal = (await resposta.json()) as { nome?: string; erroDeWebhook?: string | null };
  atualizarLeituras();
  return canal.erroDeWebhook
    ? { ok: true, mensagem: `Canal criado, mas o webhook falhou: ${canal.erroDeWebhook}` }
    : { ok: true, mensagem: `Canal ${canal.nome ?? ''} conectado.` };
}

export async function convidar(
  _anterior: ResultadoDaAcao,
  dados: FormData,
): Promise<ResultadoDaAcao> {
  const resposta = await postarJson('/v1/convites', {
    email: String(dados.get('email') ?? '').trim(),
    papel: String(dados.get('papel') ?? '').trim(),
  });
  if (!resposta.ok) return { ok: false, erro: await motivoDaFalha(resposta) };
  const convite = (await resposta.json()) as { email: string; url: string };
  atualizarLeituras();
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
    `/v1/contatos/importacoes?nome=${encodeURIComponent(arquivo.name)}`,
    { method: 'POST', body: await arquivo.text(), headers: { 'content-type': 'text/csv' } },
  );
  if (!resposta.ok) return { ok: false, erro: await motivoDaFalha(resposta) };
  const importacao = (await resposta.json()) as {
    estado: string;
    aceitos: number;
    rejeitados: number;
  };
  atualizarLeituras();
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
