'use server';

import { exigirEu } from '../../../lib/banco';
import { SEM_ARMAZENAMENTO } from '../../../lib/certificados';

/**
 * As escritas da tela de Certificados de autenticação.
 *
 * Na origem são três comandos LIME para `postmaster@mtls.blip.ai` — `set
 * /certificates-mtls` (depois do upload do .pfx), `delete
 * /certificate-mtls/{tenant}/{id}` e `delete
 * /certificate-mtls/{tenant}/host/{hostId}` — e o fragmento não confere papel
 * nenhum antes de mandar: quem recusa é o servidor.
 *
 * Aqui os três caem nesta mesma ação, porque nenhum tem onde gravar: ela confere
 * a permissão de verdade e devolve o recado. Quando existir a tabela (ver o
 * `ponytail:` de `carregarCertificados`), vira três ações com o formulário de
 * cada uma.
 */
export async function gravarCertificados(): Promise<{ ok: false; erro: string }> {
  const eu = await exigirEu();
  if (!eu.permissoes.includes('conta.membros.escrever')) {
    return {
      ok: false,
      erro: 'Você não tem permissão para gerenciar os certificados deste contrato.',
    };
  }
  return { ok: false, erro: SEM_ARMAZENAMENTO };
}
