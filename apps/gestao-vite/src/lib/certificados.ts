/**
 * Certificados de autenticação (mTLS) do contrato — o que a tela
 * `/contrato/certificados` lê, e as regras dela.
 *
 * Na origem tudo é comando LIME para `postmaster@mtls.blip.ai`, que sobe o
 * `.pfx` para o serviço deles e extrai validade/impressão digital sozinho
 * (`docs/pesquisa/blip-certificados-mtls.md`). O Pipe cadastra de verdade
 * (`GET/POST/DELETE /v1/gestao/contrato/certificados*`,
 * `apps/api/.../dominio/gestao/certificados.ts`) mas **nunca guarda o arquivo
 * nem a senha**: validade e impressão digital são digitadas por quem cadastra,
 * não extraídas do `.pfx` — ver o `EM_BREVE_UPLOAD` abaixo.
 */

/** Um host do certificado — o `{ host_id, host }` de `hosts` na origem. */
export interface HostDoCertificado {
  id: string;
  host: string;
}

/** O item de `GET /v1/gestao/contrato/certificados`, com os nomes em português. */
export interface CertificadoMtls {
  id: string;
  descricao: string;
  /** ISO 8601. Digitada por quem cadastra — ver `EM_BREVE_UPLOAD`. */
  expiraEm: string;
  /** Digitada por quem cadastra, pela mesma razão. */
  impressaoDigital: string;
  hosts: HostDoCertificado[];
}

/**
 * ponytail: a origem lê o `.pfx` no servidor deles e tira sozinha a validade,
 * a impressão digital e o `status` (`valid`/`invalid`/`underValidation`) — um
 * proxy mTLS de verdade, que o Pipe não tem. Sem ele, ler o arquivo automático
 * seria fingir uma verificação que não existe; por isso o cadastro pede os
 * dois campos à mão, e a coluna "Status" da tabela vira este selo em vez de um
 * chip calculado. Caminho: biblioteca de PKCS12 + proxy de saída com o
 * certificado, no dia em que o Pipe tiver um.
 */
export const EM_BREVE_UPLOAD =
  'Leitura automática do certificado: em breve. Por enquanto, preencha a validade e a impressão digital abaixo.';

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

/**
 * O `ht` deles, mais os dois campos que aqui são digitados à mão em vez de
 * extraídos do `.pfx` (ver `EM_BREVE_UPLOAD`): descrição, validade e
 * impressão digital preenchidas, e toda URL preenchida e válida.
 */
export function informacoesCompletas(
  descricao: string,
  hosts: readonly HostDigitado[],
  expiraEm: string,
  impressaoDigital: string,
): boolean {
  return (
    hosts.every((h) => h.valido && h.host !== '') &&
    descricao !== '' &&
    expiraEm !== '' &&
    impressaoDigital.trim() !== ''
  );
}

/**
 * A conferência do arquivo ao clicar "Finalizar" — a função de três ramos do
 * `h` do `yt`. Devolve a frase do toast deles, ou `null` quando o arquivo passa.
 */
export function problemaNoArquivo(arquivo: { type: string; size: number } | null): string | null {
  if (!arquivo) {
    return 'Ocorreu um erro ao fazer o upload do arquivo, verifique se o certificado e a senha estão corretos';
  }
  if (arquivo.type !== 'application/x-pkcs12') return 'O arquivo deve ser do tipo .pfx';
  if (arquivo.size / 1048576 > 10) return 'O arquivo deve ter no máximo 10MB';
  return null;
}
