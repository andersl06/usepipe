import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

/**
 * A porta do storage, no formato do S3.
 *
 * "Formato do S3" quer dizer: **bucket + chave opaca + objeto**, e nada de caminho de
 * sistema de arquivos vazando para quem chama. Trocar o backend por S3, R2 ou MinIO é
 * escrever outra implementação desta interface — nenhum chamador muda.
 *
 * A decisão de HOJE é disco com volume, e não MinIO, por três motivos:
 *
 * 1. **RAM é o gargalo desta infra.** Já medimos ~1,9 GB por instância de CRM
 *    (`2026-09-07-integracao-twenty.md` §5.3). Um contêiner a mais por VPS custa
 *    justamente o recurso que está apertado.
 * 2. **A compatibilidade que o requisito pede é da INTERFACE**, e ela está aqui. O
 *    protocolo S3 não precisa existir na máquina para o chamador estar pronto para ele.
 * 3. **A URL assinada é nossa e simples.** O modelo da Blip não é bucket público com
 *    presign: é *file token com 15 minutos* — e é exatamente isso que `assinar` faz,
 *    com HMAC do chaveiro que já protege os outros segredos.
 *
 * ponytail: disco em host único, sem replicação. No dia em que a `api` rodar em mais de
 * uma máquina, o arquivo escrito numa não aparece na outra — aí entra o backend S3,
 * que é um arquivo novo implementando esta mesma interface.
 */

export interface ObjetoGuardado {
  /** A chave dentro do bucket. Opaca para quem chama. */
  chave: string;
  bytes: number;
}

export interface ObjetoLido {
  dados: Uint8Array;
  bytes: number;
}

export interface Armazenamento {
  guardar(chave: string, dados: Uint8Array): Promise<ObjetoGuardado>;
  ler(chave: string): Promise<ObjetoLido | null>;
  remover(chave: string): Promise<void>;
}

/**
 * A chave de um anexo. **O `tenantId` é o primeiro segmento, sempre.**
 *
 * É o isolamento por tenant no caminho do objeto: um cliente nunca compartilha prefixo
 * com outro, e no dia em que isto virar bucket S3 a política de acesso por prefixo já
 * está desenhada. O `uuid` no fim é o que impede adivinhar o objeto do vizinho mesmo
 * que alguém descubra o `tenant_id`.
 */
export function chaveDeAnexo(tenantId: string, nomeOriginal: string | null): string {
  const agora = new Date();
  const ano = agora.getUTCFullYear();
  const mes = String(agora.getUTCMonth() + 1).padStart(2, '0');
  return `${tenantId}/${ano}/${mes}/${randomUUID()}${extensaoDe(nomeOriginal)}`;
}

/**
 * A extensão só entra para o arquivo ter cara de arquivo quando alguém baixa. Ela
 * **não** decide tipo em lugar nenhum — quem decide é `tipoReal`.
 */
function extensaoDe(nome: string | null): string {
  const ponto = (nome ?? '').lastIndexOf('.');
  if (ponto < 1) return '';
  const bruta = (nome ?? '').slice(ponto + 1).toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(bruta) ? `.${bruta}` : '';
}

/**
 * Chave que sai da faixa do tenant é recusada.
 *
 * A defesa contra `../` e contra id de outro cliente na URL. Vale mesmo com o link
 * assinado: assinatura prova que o link saiu de nós, não que ele é do tenant certo.
 */
export function chaveDoTenant(chave: string, tenantId: string): boolean {
  if (chave.includes('..') || chave.startsWith('/') || chave.includes('\\')) return false;
  return chave.startsWith(`${tenantId}/`);
}

export interface LinkAssinado {
  expiraEm: number;
  assinatura: string;
}

/**
 * Assina `<anexoId>.<expiraEm>` com HMAC-SHA256.
 *
 * O segredo é o do chaveiro (`PIPE_CHAVES_SEGREDO`), o mesmo que cifra o token da
 * Meta. Quem tem o link tem o arquivo até vencer — por isso a validade é curta e igual
 * à da Blip: 15 minutos.
 */
export function assinar(anexoId: string, expiraEm: number, segredo: string): string {
  return createHmac('sha256', segredo).update(`${anexoId}.${expiraEm}`).digest('hex');
}

/** Confere a assinatura e a validade. Comparação em tempo constante. */
export function assinaturaValida(
  anexoId: string,
  expiraEm: number,
  assinatura: string,
  segredo: string,
  agora = Date.now(),
): boolean {
  if (!Number.isFinite(expiraEm) || expiraEm <= agora) return false;
  const esperada = Buffer.from(assinar(anexoId, expiraEm, segredo));
  const recebida = Buffer.from(assinatura);
  if (esperada.length !== recebida.length) return false;
  return timingSafeEqual(esperada, recebida);
}
