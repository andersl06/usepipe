import { api, chamarApi, motivoDaFalha } from '../../lib/api';
import { atualizarLeituras } from '../../lib/actions';
import { irPara } from '../../lib/navigation';
import { tenantPath } from '../../lib/application-paths';

/**
 * The Members panel's actions — the same ones as before, from the browser app. The `conta.membros.escrever` permission is checked in the `api`, on write; here we only assemble the request and come back with the reason in the URL, the way the screen already knows how to display.
 */
interface ResultadoSimples {
  ok: boolean;
  error?: string;
}

function backWithError(error: string): void {
  irPara(`${tenantPath('tenant/members')}?erro=${encodeURIComponent(error)}`);
}

export async function switchRole(data: FormData): Promise<void> {
  const resultado = await api
    .post<ResultadoSimples>('/v1/management/contract/members/role', {
      papelId: String(data.get('papelId') ?? '').trim(),
      alvos: data.getAll('alvo').map(String),
    })
    .catch((e: Error) => ({ ok: false, error: e.message }) as ResultadoSimples);
  if (!resultado.ok) return backWithError(resultado.error ?? 'Não foi possível alterar o papel.');
  atualizarLeituras();
}

export async function deleteMembers(data: FormData): Promise<void> {
  const resultado = await api
    .post<ResultadoSimples>('/v1/management/contract/members/delete', {
      alvos: data.getAll('alvo').map(String),
    })
    .catch((e: Error) => ({ ok: false, error: e.message }) as ResultadoSimples);
  if (!resultado.ok) return backWithError(resultado.error ?? 'Não foi possível excluir.');
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
 * Resends a pending invite: same email, same role, new link — the old one stops working (`POST /v1/convites/:id/reenviar`). Since Pipe doesn't deliver email, the link comes back in the response for the screen to show again.
 */
export async function resendInvitation(invitationId: string): Promise<ResultadoDoReenvio> {
  const resposta = await chamarApi(`/v1/convites/${invitationId}/reenviar`, { method: 'POST' });
  if (!resposta.ok) return { ok: false, error: await motivoDaFalha(resposta) };
  const corpo = (await resposta.json()) as { email: string; url: string };
  atualizarLeituras();
  return { ok: true, email: corpo.email, url: corpo.url };
}

export async function inviteMembers(
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
  /*
   * In series, not with `Promise.all`: it's few emails, and the order of the links list stays the same as the order the person typed them in.
   */
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
