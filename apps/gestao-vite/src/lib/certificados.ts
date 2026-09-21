/**
 * Certificados de autenticação (mTLS) do contrato — o que a tela
 * `/contrato/certificados` lê, e as regras dela.
 *
 * Na origem tudo é comando LIME para `postmaster@mtls.blip.ai`, que sobe o
 * `.pfx` com a senha para o serviço deles e extrai validade/status sozinho
 * (`docs/pesquisa/blip-certificados-mtls.md`). O Pipe faz o mesmo:
 * `POST /v1/gestao/contrato/certificados` leva o arquivo (base64) e a senha, a
 * `api` lê o `.pfx` (`apps/api/.../dominio/gestao/pfx.ts`), guarda os dois
 * cifrados e devolve validade, impressão digital, emissor, sujeito e status —
 * e os apresenta quando chama os hosts cadastrados (`dominio/mtls.ts`).
 */

/** Um host do certificado — o `{ host_id, host }` de `hosts` na origem. */
export interface HostDoCertificado {
  id: string;
  host: string;
}

/**
 * O `status` do item da origem (`valid` | `invalid` | `underValidation`), com
 * nome pelo motivo. `sem_arquivo` é o que foi cadastrado à mão antes de a
 * `api` guardar o `.pfx` — não autentica nada.
 */
export type StatusDoCertificado = 'valido' | 'expirado' | 'sem_arquivo';

/** O item de `GET /v1/gestao/contrato/certificados`, com os nomes em português. Nunca traz o arquivo nem a senha. */
export interface CertificadoMtls {
  id: string;
  descricao: string;
  /** ISO 8601. Lida do `.pfx` pela `api`. */
  expiraEm: string;
  /** SHA-256 `AB:CD:…`, lida do `.pfx`. */
  impressaoDigital: string;
  emissor: string | null;
  sujeito: string | null;
  status: StatusDoCertificado;
  hosts: HostDoCertificado[];
}

/**
 * O `bds-chip-tag` da coluna Status (`Pt`): `valid` → `success` "Válido";
 * `invalid` → `disabled` "Inválido"; o resto → `default` "Em validação". Aqui
 * o motivo vai no texto, porque a `api` o sabe.
 */
export function etiquetaDoStatus(status: StatusDoCertificado): {
  texto: string;
  classe: 'sucesso' | 'desabilitado' | 'padrao';
} {
  if (status === 'valido') return { texto: 'Válido', classe: 'sucesso' };
  if (status === 'expirado') return { texto: 'Expirado', classe: 'desabilitado' };
  return { texto: 'Sem arquivo', classe: 'padrao' };
}

/** A expiração como eles escrevem: `wt.a(data, "pt-BR")`, dia/mês/ano em UTC. */
export function dataDeExpiracao(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
  });
}

/** Um campo de URL do passo "Informações do certificado". */
export interface HostDigitado {
  host: string;
  valido: boolean;
}

/**
 * O `o` do `vt` deles: a URL não pode repetir uma das que já estão na lista e
 * precisa ser HTTPS com domínio. A lista comparada é a de ANTES da digitação,
 * como lá.
 */
export function hostValido(valor: string, hostsAtuais: readonly HostDigitado[]): boolean {
  return (
    hostsAtuais.every((h) => h.host !== valor) &&
    /^https:\/\/[a-zA-Z0-9\-.]+\.[a-zA-Z]{2,}(:\d+)?(\/.*)?$/.test(valor)
  );
}

/** O `ht` deles: descrição preenchida e toda URL preenchida e válida. */
export function informacoesCompletas(descricao: string, hosts: readonly HostDigitado[]): boolean {
  return hosts.every((h) => h.valido && h.host !== '') && descricao !== '';
}

/**
 * A conferência do arquivo ao clicar "Finalizar" — a função de três ramos do
 * `h` do `yt`. Devolve a frase do toast deles, ou `null` quando o arquivo passa.
 *
 * O tipo `application/x-pkcs12` é o que o navegador declara para `.pfx` no
 * Windows; em outros sistemas ele vem vazio, e aí vale a extensão — a `api`
 * confere os bytes de qualquer jeito.
 */
export function problemaNoArquivo(
  arquivo: { name?: string; type: string; size: number } | null,
): string | null {
  if (!arquivo) {
    return 'Ocorreu um erro ao fazer o upload do arquivo, verifique se o certificado e a senha estão corretos';
  }
  const pelaExtensao = /\.(pfx|p12)$/i.test(arquivo.name ?? '');
  if (arquivo.type !== 'application/x-pkcs12' && !(arquivo.type === '' && pelaExtensao)) {
    return 'O arquivo deve ser do tipo .pfx';
  }
  if (arquivo.size / 1048576 > 10) return 'O arquivo deve ter no máximo 10MB';
  return null;
}

/** O `.pfx` como data URL (`data:…;base64,…`) — o corpo que a `api` aceita. */
export function lerArquivoComoDataUrl(arquivo: Blob): Promise<string> {
  return new Promise((resolver, rejeitar) => {
    const leitor = new FileReader();
    leitor.onload = () => resolver(String(leitor.result));
    leitor.onerror = () => rejeitar(leitor.error ?? new Error('Não foi possível ler o arquivo.'));
    leitor.readAsDataURL(arquivo);
  });
}
