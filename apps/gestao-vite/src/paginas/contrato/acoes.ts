import { api, chamarApi, motivoDaFalha } from '../../lib/api';
import { atualizarLeituras } from '../../lib/acoes';
import { irPara } from '../../lib/navegacao';

/**
 * As ações do painel de Membros — as mesmas de antes, do navegador. A permissão
 * `conta.membros.escrever` é conferida na `api`, na gravação; aqui só se monta
 * o pedido e se volta com o motivo na URL, como a tela já sabe mostrar.
 */
interface ResultadoSimples {
  ok: boolean;
  error?: string;
}

function voltarWithError(error: string): void {
  irPara(`/contract/members?erro=${encodeURIComponent(error)}`);
}

export async function switchRole(data: FormData): Promise<void> {
  const resultado = await api
    .post<ResultadoSimples>('/v1/management/contract/members/role', {
      papelId: String(data.get('papelId') ?? '').trim(),
      alvos: data.getAll('alvo').map(String),
    })
    .catch((e: Error) => ({ ok: false, error: e.message }) as ResultadoSimples);
  if (!resultado.ok) return voltarWithError(resultado.error ?? 'Não foi possível alterar o papel.');
  atualizarLeituras();
}

export async function excluirMembers(data: FormData): Promise<void> {
  const resultado = await api
    .post<ResultadoSimples>('/v1/management/contract/members/delete', {
      alvos: data.getAll('alvo').map(String),
    })
    .catch((e: Error) => ({ ok: false, error: e.message }) as ResultadoSimples);
  if (!resultado.ok) return voltarWithError(resultado.error ?? 'Não foi possível excluir.');
  atualizarLeituras();
}

export interface InvitationResult {
  links: { email: string; url: string }[];
  errors: string[];
}

export interface ResultadoDoReenvio {
  ok: boolean;
  email?: string;
  url?: string;
  error?: string;
}

/**
 * Reenvia um convite pendente: mesmo e-mail, mesmo papel, link novo — o de
 * antes para de funcionar (`POST /v1/convites/:id/reenviar`). Como o Pipe não
 * entrega e-mail, o link volta na resposta para a tela mostrar de novo.
 */
export async function reenviarInvitation(invitationId: string): Promise<ResultadoDoReenvio> {
  const resposta = await chamarApi(`/v1/convites/${invitationId}/reenviar`, { method: 'POST' });
  if (!resposta.ok) return { ok: false, error: await motivoDaFalha(resposta) };
  const corpo = (await resposta.json()) as { email: string; url: string };
  atualizarLeituras();
  return { ok: true, email: corpo.email, url: corpo.url };
}

export async function convidarMembers(
  _anterior: InvitationResult | null,
  data: FormData,
): Promise<InvitationResult> {
  const role = String(data.get('papel') ?? '').trim();
  const emails = [
    ...new Set(
      String(data.get('emails') ?? '')
        .split(/[\s,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (!role) return { links: [], errors: ['Escolha a permissão de quem está sendo convidado.'] };
  if (emails.length === 0) return { links: [], errors: ['Informe ao menos um e-mail.'] };
  const resultado: InvitationResult = { links: [], errors: [] };
  /* Em série, e não em `Promise.all`: são poucos e-mails, e a ordem da lista
     de links fica igual à ordem em que a pessoa digitou. */
  for (const email of emails) {
    const resposta = await chamarApi('/v1/convites', {
      method: 'POST',
      body: JSON.stringify({ email, role }),
      headers: { 'content-type': 'application/json' },
    });
    if (resposta.ok) {
      const corpo = (await resposta.json()) as { email: string; url: string };
      resultado.links.push({ email: corpo.email, url: corpo.url });
    } else {
      resultado.errors.push(`${email}: ${await motivoDaFalha(resposta)}`);
    }
  }
  if (resultado.links.length > 0) atualizarLeituras();
  return resultado;
}
