import { api, ApiError } from '../../../lib/api';
import { atualizarLeituras } from '../../../lib/actions';
import type { CertificadoMtls } from '../../../lib/certificados';

/**
 * The Certificados screen's writes, now in `POST/DELETE /v1/gestao/contrato/certificados*` (`apps/api/.../dominio/gestao/certificados.ts`). The permission (`conta.membros.escrever`) is checked again in the `api`; here we only assemble the request and return the reason, as in `../acoes.ts`.
 */
interface ResultadoSimples {
  ok: boolean;
  error?: string;
}

/**
 * What the source sends on "Finalizar": `password` + `file` on upload, then `description` + `hosts` on `set` — here it's all in a single POST. The password and the file only pass through here; the `api` stores them encrypted and never returns them.
 */
export interface PedidoDeCertificado {
  description: string;
  hosts: string[];
  senha: string;
  /** Data URL do `.pfx` (`lerArquivoComoDataUrl`). */
  file: string;
}

export async function cadastrarCertificado(
  pedido: PedidoDeCertificado,
): Promise<{ ok: true; certificado: CertificadoMtls } | { ok: false; error: string }> {
  try {
    const certificado = await api.post<CertificadoMtls>('/v1/management/contract/certificates', pedido);
    atualizarLeituras();
    return { ok: true, certificado };
  } catch (e) {
    return { ok: false, error: errorReason(e) };
  }
}

/**
 * The `erro.mensagem` from the `api`'s body ("A senha do certificado está incorreta.", "O arquivo não é um .pfx válido…"): it's what the source shows in the toast instead of the status.
 */
function errorReason(e: unknown): string {
  if (e instanceof ApiError) {
    const corpo = e.corpo as { error?: { message?: string } } | null;
    if (corpo?.error?.message) return corpo.error.message;
    if (e.status === 413) return 'O arquivo deve ter no máximo 10MB';
  }
  return e instanceof Error ? e.message : 'Não foi possível cadastrar.';
}

export async function excluirCertificado(id: string): Promise<ResultadoSimples> {
  try {
    const resultado = await api.delete<ResultadoSimples>(`/v1/management/contract/certificates/${id}`);
    if (resultado.ok) atualizarLeituras();
    return resultado;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Falha ao tentar deletar certificado.' };
  }
}

export async function excluirHostDoCertificado(
  certificadoId: string,
  hostId: string,
): Promise<ResultadoSimples> {
  try {
    const resultado = await api.delete<ResultadoSimples>(
      `/v1/management/contract/certificates/${certificadoId}/hosts/${hostId}`,
    );
    if (resultado.ok) atualizarLeituras();
    return resultado;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Falha ao tentar deletar host.' };
  }
}
