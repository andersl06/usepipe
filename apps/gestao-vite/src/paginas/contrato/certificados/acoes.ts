import { api, ErroDaApi } from '../../../lib/api';
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

/**
 * O que a origem manda no "Finalizar": `password` + `file` no upload e depois
 * `description` + `hosts` no `set` — aqui tudo num POST só. A senha e o
 * arquivo só passam por aqui; a `api` os guarda cifrados e nunca os devolve.
 */
export interface PedidoDeCertificado {
  descricao: string;
  hosts: string[];
  senha: string;
  /** Data URL do `.pfx` (`lerArquivoComoDataUrl`). */
  arquivo: string;
}

export async function cadastrarCertificado(
  pedido: PedidoDeCertificado,
): Promise<{ ok: true; certificado: CertificadoMtls } | { ok: false; erro: string }> {
  try {
    const certificado = await api.post<CertificadoMtls>('/v1/gestao/contrato/certificados', pedido);
    atualizarLeituras();
    return { ok: true, certificado };
  } catch (e) {
    return { ok: false, erro: motivoDoErro(e) };
  }
}

/**
 * O `erro.mensagem` do corpo da `api` ("A senha do certificado está
 * incorreta.", "O arquivo não é um .pfx válido…"): é o que a origem mostra no
 * toast em vez do status.
 */
function motivoDoErro(e: unknown): string {
  if (e instanceof ErroDaApi) {
    const corpo = e.corpo as { erro?: { mensagem?: string } } | null;
    if (corpo?.erro?.mensagem) return corpo.erro.mensagem;
    if (e.status === 413) return 'O arquivo deve ter no máximo 10MB';
  }
  return e instanceof Error ? e.message : 'Não foi possível cadastrar.';
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
