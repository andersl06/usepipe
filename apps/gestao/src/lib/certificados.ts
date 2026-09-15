/**
 * Certificados de autenticação (mTLS) do contrato — o que a tela
 * `/contrato/certificados` lê, e as regras dela.
 *
 * Na origem tudo é comando LIME para `postmaster@mtls.blip.ai`
 * (`docs/pesquisa/blip-certificados-mtls.md`). Este arquivo não importa banco
 * nem Next de propósito: a tela de cliente usa as regras, e o teste as importa
 * direto.
 */

/** Um host do certificado — o `{ host_id, host }` de `hosts` na origem. */
export interface HostDoCertificado {
  id: string;
  host: string;
}

/** O item de `GET /certificates-mtls/{tenant}`, com os nomes em português. */
export interface CertificadoMtls {
  /** `certificate_id` — lá é `{storage_id}:{tenant}-{nome do arquivo}`. */
  id: string;
  descricao: string;
  /** `expiration_date`, em ISO. */
  expiraEm: string;
  /** `status`: `valid`, `invalid` ou `underValidation`. Texto livre na origem. */
  status: string;
  hosts: HostDoCertificado[];
}

export async function carregarCertificados(): Promise<CertificadoMtls[]> {
  // ponytail: sem armazenamento — não existe tabela de certificado, então a
  // lista volta sempre vazia e a tela mostra o estado vazio. Caminho: tabelas
  // `certificado_mtls` e `certificado_mtls_host` por tenant (o .pfx num cofre,
  // não no banco) e `GET/POST/DELETE /v1/certificados` na `api`, no formato de
  // `/certificates-mtls/{tenant}` da origem.
  return [];
}

/** O recado de toda escrita enquanto não houver onde gravar. */
export const SEM_ARMAZENAMENTO =
  'O Pipe ainda não guarda certificados: nada foi gravado nem apagado.';

/**
 * Os três estados e a cor do `bds-chip-tag`, na ordem do array `g` do `Pt`
 * deles. O que não casa (maiúscula e minúscula não contam) cai em "Em
 * validação", com a cor padrão — as funções `h` e `j` de lá.
 */
const ESTADOS = [
  { status: 'valid', cor: 'sucesso', texto: 'Válido' },
  { status: 'invalid', cor: 'desabilitado', texto: 'Inválido' },
  { status: 'underValidation', cor: 'padrao', texto: 'Em validação' },
] as const;

export type CorDaEtiqueta = (typeof ESTADOS)[number]['cor'];

export function etiquetaDoStatus(status: string): { cor: CorDaEtiqueta; texto: string } {
  const achado = ESTADOS.find((e) => e.status.toLowerCase() === status.toLowerCase());
  return achado
    ? { cor: achado.cor, texto: achado.texto }
    : { cor: 'padrao', texto: 'Em validação' };
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
 */
export function problemaNoArquivo(arquivo: { type: string; size: number } | null): string | null {
  if (!arquivo) {
    return 'Ocorreu um erro ao fazer o upload do arquivo, verifique se o certificado e a senha estão corretos';
  }
  if (arquivo.type !== 'application/x-pkcs12') return 'O arquivo deve ser do tipo .pfx';
  if (arquivo.size / 1048576 > 10) return 'O arquivo deve ter no máximo 10MB';
  return null;
}
