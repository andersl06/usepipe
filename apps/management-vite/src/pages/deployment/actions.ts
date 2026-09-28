import { chamarApi, motivoDaFalha } from '../../lib/api';
import { atualizarLeituras } from '../../lib/actions';

/**
 * Implantação's actions — the same Server Actions as before, now calling the browser's `api`. The cookie goes along on its own; `revalidatePath` became `atualizarLeituras`.
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
export async function startRegistrationEmbedded(): Promise<RegistrationStart> {
  const resposta = await chamarApi('/v1/channels/whatsapp/state', { method: 'POST' });
  if (!resposta.ok) return { ok: false, error: await motivoDaFalha(resposta) };
  return { ok: true, ...((await resposta.json()) as Omit<RegistrationStart, 'ok'>) };
}

/** The last one: the Facebook code becomes a channel in the `api`. */
export async function completeRegistrationEmbedded(
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
    number?: string | null;
    name?: string;
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
      : `WhatsApp conectado: ${channel.number ?? channel.name ?? 'número novo'}.`,
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
    name: campo('nome') || undefined,
  });
  if (!resposta.ok) return { ok: false, error: await motivoDaFalha(resposta) };
  const channel = (await resposta.json()) as { name?: string; webhookError?: string | null };
  atualizarLeituras();
  return channel.webhookError
    ? { ok: true, message: `Canal criado, mas o webhook falhou: ${channel.webhookError}` }
    : { ok: true, message: `Canal ${channel.name ?? ''} conectado.` };
}

export async function convidar(
  _anterior: ResultadoDaAcao,
  data: FormData,
): Promise<ResultadoDaAcao> {
  const resposta = await postarJson('/v1/convites', {
    email: String(data.get('email') ?? '').trim(),
    role: String(data.get('papel') ?? '').trim(),
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
  const importResult = (await resposta.json()) as {
    state: string;
    accepted: number;
    rejeitados: number;
  };
  atualizarLeituras();
  if (importResult.state === 'falhou') {
    return { ok: false, error: 'O arquivo tem aspas malformadas e nada foi importado.' };
  }
  if (importResult.state === 'concluida') {
    return {
      ok: true,
      message: `${importResult.accepted} contato(s) importado(s), ${importResult.rejeitados} linha(s) rejeitada(s).`,
    };
  }
  return { ok: true, message: 'Arquivo recebido. A importação roda em segundo plano.' };
}
