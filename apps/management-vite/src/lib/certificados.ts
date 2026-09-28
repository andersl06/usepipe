/**
 * Contract mTLS certificates for `/contrato/certificados`. The reference sends a password-protected `.pfx` to `postmaster@mtls.blip.ai` through LIME commands and derives expiry/status (`referencias-blip/pesquisa/blip-certificados-mtls.md`). Pipe sends base64 file and password to `POST /v1/gestao/contrato/certificados`; `api` parses the `.pfx` (`apps/api/.../dominio/gestao/pfx.ts`), stores file and password encrypted, returns expiry/fingerprint/issuer/subject/status, and uses them for registered hosts (`dominio/mtls.ts`).
 */

/** Um host do certificado — o `{ host_id, host }` de `hosts` na origem. */
export interface HostDoCertificado {
  id: string;
  host: string;
}

/**
 * Map reference `status` values `valid`, `invalid`, `underValidation` to named reasons. `sem_arquivo` means a manual legacy entry before `api` stored `.pfx`; it authenticates nothing.
 */
export type StatusDoCertificado = 'valido' | 'expirado' | 'sem_arquivo';

/** `GET /v1/gestao/contrato/certificados` never returns file or password. */
export interface CertificadoMtls {
  id: string;
  description: string;
  /** ISO 8601. Lida do `.pfx` pela `api`. */
  expiresAt: string;
  /** SHA-256 `AB:CD:…`, lida do `.pfx`. */
  impressaoDigital: string;
  issuer: string | null;
  subject: string | null;
  status: StatusDoCertificado;
  hosts: HostDoCertificado[];
}

/**
 * Reference Status-column `bds-chip-tag` (`Pt`) maps `valid` to `success` and `Válido`, `invalid` to `disabled` and `Inválido`, otherwise `default` and `Em validação`. Include the reason in text because `api` knows it.
 */
export function etiquetaDoStatus(status: StatusDoCertificado): {
  texto: string;
  classe: 'sucesso' | 'desabilitado' | 'padrao';
} {
  if (status === 'valido') return { texto: 'Válido', classe: 'sucesso' };
  if (status === 'expirado') return { texto: 'Expirado', classe: 'desabilitado' };
  return { texto: 'Sem arquivo', classe: 'padrao' };
}

/** Format expiry like reference `wt.a(data, "pt-BR")`: day/month/year in UTC. */
export function expirationData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
  });
}


export interface HostDigitado {
  host: string;
  valido: boolean;
}

/**
 * Reference `o` in `vt` rejects a URL already in the prior list and requires an HTTPS domain. Compare against the list from before this input, as the reference does.
 */
export function hostValido(value: string, hostsCurrent: readonly HostDigitado[]): boolean {
  return (
    hostsCurrent.every((h) => h.host !== value) &&
    /^https:\/\/[a-zA-Z0-9\-.]+\.[a-zA-Z]{2,}(:\d+)?(\/.*)?$/.test(value)
  );
}

/** Reference `ht` requires description and every URL to be filled and valid. */
export function informationComplete(description: string, hosts: readonly HostDigitado[]): boolean {
  return hosts.every((h) => h.valido && h.host !== '') && description !== '';
}

/**
 * On Finalizar, validate the file through the reference `h` function's three branches in `yt`; return its toast text or `null` on success. Windows reports `.pfx` as `application/x-pkcs12`, while other browsers may leave MIME empty, so accept extension there; `api` still checks bytes.
 */
export function problemInFile(
  file: { name?: string; type: string; size: number } | null,
): string | null {
  if (!file) {
    return 'Ocorreu um erro ao fazer o upload do arquivo, verifique se o certificado e a senha estão corretos';
  }
  const pelaExtensao = /\.(pfx|p12)$/i.test(file.name ?? '');
  if (file.type !== 'application/x-pkcs12' && !(file.type === '' && pelaExtensao)) {
    return 'O arquivo deve ser do tipo .pfx';
  }
  if (file.size / 1048576 > 10) return 'O arquivo deve ter no máximo 10MB';
  return null;
}

/** Encode the `.pfx` as `data:…;base64,…`, the body accepted by `api`. */
export function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolver, rejeitar) => {
    const leitor = new FileReader();
    leitor.onload = () => resolver(String(leitor.result));
    leitor.onerror = () => rejeitar(leitor.error ?? new Error('Não foi possível ler o arquivo.'));
    leitor.readAsDataURL(file);
  });
}
