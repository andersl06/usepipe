import { SEM_ARMAZENAMENTO } from '../../../lib/certificados';

/**
 * Toda escrita de certificado recusa com o mesmo recado, enquanto não houver
 * onde gravar (ver `lib/certificados.ts`). A permissão de escrita a tela já
 * confere pelo `Eu`; quando existir endpoint, ele confere de novo.
 */
export async function gravarCertificados(): Promise<{ ok: false; erro: string }> {
  return { ok: false, erro: SEM_ARMAZENAMENTO };
}
