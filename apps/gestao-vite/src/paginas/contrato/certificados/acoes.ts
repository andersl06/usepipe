import { api } from '../../../lib/api';
import { atualizarLeituras } from '../../../lib/acoes';
import type { CertificadoMtls } from '../../../lib/certificados';

/**
 * As escritas da tela de Certificados, agora em `POST/DELETE
 * /v1/gestao/contrato/certificados*` (`apps/api/.../dominio/gestao/certificados.ts`).
 * A permissão (`conta.membros.escrever`) é conferida de novo na `api`; aqui só
 * se monta o pedido e se devolve o motivo, como em `../acoes.ts`.
 */
interface ResultadoSimples {
  ok: boolean;
  erro?: string;
}

export interface PedidoDeCertificado {
  descricao: string;
  expiraEm: string;
  impressaoDigital: string;
  hosts: string[];
}

export async function cadastrarCertificado(
  pedido: PedidoDeCertificado,
): Promise<{ ok: true; certificado: CertificadoMtls } | { ok: false; erro: string }> {
  try {
    const certificado = await api.post<CertificadoMtls>('/v1/gestao/contrato/certificados', pedido);
    atualizarLeituras();
    return { ok: true, certificado };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Não foi possível cadastrar.' };
  }
}

export async function excluirCertificado(id: string): Promise<ResultadoSimples> {
  try {
    const resultado = await api.delete<ResultadoSimples>(`/v1/gestao/contrato/certificados/${id}`);
    if (resultado.ok) atualizarLeituras();
    return resultado;
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Falha ao tentar deletar certificado.' };
  }
}

export async function excluirHostDoCertificado(
  certificadoId: string,
  hostId: string,
): Promise<ResultadoSimples> {
  try {
    const resultado = await api.delete<ResultadoSimples>(
      `/v1/gestao/contrato/certificados/${certificadoId}/hosts/${hostId}`,
    );
    if (resultado.ok) atualizarLeituras();
    return resultado;
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Falha ao tentar deletar host.' };
  }
}
