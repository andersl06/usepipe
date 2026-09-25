import { chamarApi, motivoDaFalha } from '../../lib/api';
import { atualizarLeituras } from '../../lib/actions';

/**
 * As ações da Implantação — as mesmas Server Actions de antes, agora chamando
 * a `api` do navegador. O cookie vai sozinho; `revalidatePath` virou
 * `atualizarLeituras`.
 */
export interface ResultadoDaAcao {
  ok: boolean;
  error?: string;
  message?: string;
  link?: string;
}

export interface RegistrationStart {
  ok: boolean;
  error?: string;
  state?: string;
  appId?: string;
  configId?: string;
  versao?: string;
  modo?: 'real' | 'duble';
}

export interface RegistrationCredentials {
  codigo: string;
  wabaId: string;
  numeroId?: string;
  businessId?: string;
  coexistencia?: boolean;
  state: string;
  channelId?: string;
  /** Conexão feita de dentro do bot: o canal nasce ligado a ele (`fluxo_id`). */
  flowId?: string;
}

function postarJson(caminho: string, corpo: unknown): Promise<Response> {
  return chamarApi(caminho, {
    method: 'POST',
    body: JSON.stringify(corpo),
    headers: { 'content-type': 'application/json' },
  });
}

/** O primeiro passo do cadastro embutido: a `api` gera o estado e diz o modo. */
export async function iniciarRegistrationEmbedded(): Promise<RegistrationStart> {
  const resposta = await chamarApi('/v1/channels/whatsapp/estado', { method: 'POST' });
  if (!resposta.ok) return { ok: false, error: await motivoDaFalha(resposta) };
  return { ok: true, ...((await resposta.json()) as Omit<RegistrationStart, 'ok'>) };
}

/** O último: o código do Facebook vira canal na `api`. */
export async function concluirRegistrationEmbedded(
  credentials: RegistrationCredentials,
): Promise<ResultadoDaAcao> {
  const resposta = await postarJson('/v1/channels/whatsapp', {
    codigo: credentials.codigo,
    waba_id: credentials.wabaId,
    phone_number_id: credentials.numeroId || undefined,
    business_id: credentials.businessId || undefined,
    coexistencia: credentials.coexistencia === true,
    estado: credentials.state,
    canal_id: credentials.channelId,
    fluxo_id: credentials.flowId,
  });
  if (!resposta.ok) return { ok: false, error: await motivoDaFalha(resposta) };
  const channel = (await resposta.json()) as {
    numero?: string | null;
    nome?: string;
    motivo?: string | null;
  };
  atualizarLeituras();
  if (channel.motivo === 'reautorizacao_pendente') {
    return {
      ok: true,
      message: 'O número foi ligado, mas a Meta não aceitou a configuração do webhook. Reconecte.',
    };
  }
  return {
    ok: true,
    message: credentials.channelId
      ? 'Reautorização concluída.'
      : `WhatsApp conectado: ${channel.numero ?? channel.nome ?? 'número novo'}.`,
  };
}

export async function conectarManual(
  _anterior: ResultadoDaAcao,
  data: FormData,
): Promise<ResultadoDaAcao> {
  const campo = (nome: string) => String(data.get(nome) ?? '').trim();
  const resposta = await postarJson('/v1/channels/whatsapp/manual', {
    waba_id: campo('wabaId'),
    phone_number_id: campo('numeroId'),
    access_token: campo('token'),
    nome: campo('nome') || undefined,
  });
  if (!resposta.ok) return { ok: false, error: await motivoDaFalha(resposta) };
  const channel = (await resposta.json()) as { nome?: string; webhookError?: string | null };
  atualizarLeituras();
  return channel.webhookError
    ? { ok: true, message: `Canal criado, mas o webhook falhou: ${channel.webhookError}` }
    : { ok: true, message: `Canal ${channel.nome ?? ''} conectado.` };
}

export async function convidar(
  _anterior: ResultadoDaAcao,
  data: FormData,
): Promise<ResultadoDaAcao> {
  const resposta = await postarJson('/v1/convites', {
    email: String(data.get('email') ?? '').trim(),
    papel: String(data.get('papel') ?? '').trim(),
  });
  if (!resposta.ok) return { ok: false, error: await motivoDaFalha(resposta) };
  const invitation = (await resposta.json()) as { email: string; url: string };
  atualizarLeituras();
  return { ok: true, message: `Convite para ${invitation.email} criado.`, link: invitation.url };
}

export async function importContacts(
  _anterior: ResultadoDaAcao,
  data: FormData,
): Promise<ResultadoDaAcao> {
  const file = data.get('arquivo');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Escolha um arquivo CSV.' };
  }
  const resposta = await chamarApi(
    `/v1/contacts/imports?nome=${encodeURIComponent(file.name)}`,
    { method: 'POST', body: await file.text(), headers: { 'content-type': 'text/csv' } },
  );
  if (!resposta.ok) return { ok: false, error: await motivoDaFalha(resposta) };
  const import = (await resposta.json()) as {
    state: string;
    aceitos: number;
    rejeitados: number;
  };
  atualizarLeituras();
  if (import.estado === 'falhou') {
    return { ok: false, error: 'O arquivo tem aspas malformadas e nada foi importado.' };
  }
  if (import.estado === 'concluida') {
    return {
      ok: true,
      message: `${import.aceitos} contato(s) importado(s), ${import.rejeitados} linha(s) rejeitada(s).`,
    };
  }
  return { ok: true, message: 'Arquivo recebido. A importação roda em segundo plano.' };
}
