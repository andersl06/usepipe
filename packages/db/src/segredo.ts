import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Cifra de segredo de cliente, em repouso.
 *
 * O que mora em `canal.config` não é configuração comum: é o token permanente da
 * Meta, o `appSecret`, o `verifyToken` e a senha de SMTP. Com o token, qualquer um
 * manda mensagem **pelo número do cliente** — e o schema prometia "cifrado em
 * repouso" desde o primeiro dia sem que ninguém tivesse escrito a cifra. Este
 * arquivo paga essa dívida.
 *
 * O risco que ela fecha não é um cliente ler o outro pela aplicação: a RLS já
 * cuida disso. É o dump. Backup vai para storage de objetos, passa por máquina de
 * quem opera, e um `pg_dump` com token em texto claro entrega a credencial de
 * TODOS os clientes de uma vez.
 *
 * **Envelope com id de chave.** Cada pacote carrega qual chave o cifrou, então
 * rotacionar é adicionar a chave nova como atual e manter a antiga na lista até
 * tudo ter sido regravado. Sem o id, rotação vira migração de tudo numa janela só,
 * que é como se decide nunca rotacionar.
 *
 * **AES-256-GCM**, não CBC: o GCM autentica além de cifrar. Sem autenticação, quem
 * escreve no banco pode alterar o texto cifrado e a aplicação decifra lixo sem
 * perceber — e no caso de um `phoneNumberId`, lixo dirigido é mensagem no número
 * errado.
 *
 * As chaves vivem FORA do banco, em `PIPE_CHAVES_SEGREDO`, no formato
 * `<id>:<32 bytes em base64>` separado por vírgula, e a atual em
 * `PIPE_CHAVE_SEGREDO_ATUAL`. Em produção elas chegam pelo SOPS (ver `infra/`).
 */

/** Marca do envelope. Sem ponto no nome: o ponto é o separador do pacote. */
const MARCA = 'pipev1';

export class SegredoErro extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'SegredoErro';
  }
}

export interface Chaveiro {
  /** id da chave que cifra o que for gravado agora. */
  atual: string;
  /** Todas as chaves conhecidas, inclusive as antigas ainda em uso. */
  chaves: Map<string, Buffer>;
}

/**
 * Lê o chaveiro do ambiente. Falha alto: chave ausente em produção é erro de
 * implantação, e seguir sem cifra seria gravar token em texto achando que não.
 */
export function chaveiroDoAmbiente(env: NodeJS.ProcessEnv = process.env): Chaveiro {
  const cru = env['PIPE_CHAVES_SEGREDO'];
  if (!cru) throw new SegredoErro('PIPE_CHAVES_SEGREDO não está definida.');

  const chaves = new Map<string, Buffer>();
  for (const parte of cru.split(',')) {
    const limpo = parte.trim();
    if (!limpo) continue;
    const corte = limpo.indexOf(':');
    if (corte <= 0) throw new SegredoErro('Chave sem id: use `<id>:<base64>`.');
    const id = limpo.slice(0, corte);
    const material = Buffer.from(limpo.slice(corte + 1), 'base64');
    if (material.length !== 32) {
      throw new SegredoErro(`A chave "${id}" não tem 32 bytes: AES-256 exige exatamente isso.`);
    }
    chaves.set(id, material);
  }
  if (chaves.size === 0) throw new SegredoErro('PIPE_CHAVES_SEGREDO está vazia.');

  const atual = env['PIPE_CHAVE_SEGREDO_ATUAL'] ?? [...chaves.keys()][0]!;
  if (!chaves.has(atual)) {
    throw new SegredoErro(`PIPE_CHAVE_SEGREDO_ATUAL="${atual}" não está no chaveiro.`);
  }
  return { atual, chaves };
}

/** `pipev1.<idChave>.<iv>.<tag>.<cifrado>`, tudo em base64url menos a marca e o id. */
export function cifrar(texto: string, chaveiro: Chaveiro): string {
  const chave = chaveiro.chaves.get(chaveiro.atual);
  if (!chave) throw new SegredoErro('A chave atual sumiu do chaveiro.');

  const iv = randomBytes(12); // 96 bits: o tamanho que o GCM espera, e o único seguro com nonce aleatório
  const cifra = createCipheriv('aes-256-gcm', chave, iv);
  const dado = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()]);
  const tag = cifra.getAuthTag();

  return [
    MARCA,
    chaveiro.atual,
    iv.toString('base64url'),
    tag.toString('base64url'),
    dado.toString('base64url'),
  ].join('.');
}

/** Diz se o valor já é um envelope nosso. Serve para migrar sem cifrar duas vezes. */
export function estaCifrado(valor: string): boolean {
  return valor.startsWith(`${MARCA}.`);
}

export function decifrar(pacote: string, chaveiro: Chaveiro): string {
  if (!estaCifrado(pacote)) {
    throw new SegredoErro('O valor não está cifrado: decifrar texto claro esconderia o defeito.');
  }
  const partes = pacote.split('.');
  if (partes.length !== 5) throw new SegredoErro('Envelope malformado.');
  const [, idChave, ivB64, tagB64, dadoB64] = partes as [string, string, string, string, string];

  const chave = chaveiro.chaves.get(idChave);
  if (!chave) {
    throw new SegredoErro(
      `A chave "${idChave}" não está no chaveiro: ela cifrou este dado e não pode ser descartada.`,
    );
  }

  const decifra = createDecipheriv('aes-256-gcm', chave, Buffer.from(ivB64, 'base64url'));
  decifra.setAuthTag(Buffer.from(tagB64, 'base64url'));
  try {
    return Buffer.concat([
      decifra.update(Buffer.from(dadoB64, 'base64url')),
      decifra.final(),
    ]).toString('utf8');
  } catch {
    // `final()` do GCM lança quando a tag não bate. Não repassamos o erro original:
    // detalhe de falha de autenticação é o que alimenta oráculo.
    throw new SegredoErro('Autenticação falhou: o dado cifrado foi alterado ou a chave é outra.');
  }
}

/**
 * Os campos de `canal.config` que são segredo.
 *
 * Lista fechada, e não "cifra o objeto todo", porque o resto da configuração
 * precisa continuar legível e consultável — `phoneNumberId` aparece em log de
 * diagnóstico, `apiVersao` em suporte. Cifrar tudo transformaria toda pergunta
 * operacional em decifrar primeiro.
 */
export const CAMPOS_SECRETOS_DE_CANAL = [
  'tokenAcesso',
  'appSecret',
  'verifyToken',
  'senhaSmtp',
  'clientSecret',
  // O PIN de duas etapas que o registro do número grava (`configuracao-de-webhook.ts`).
  // Com ele, quem tem o número migra o WhatsApp do cliente para outro provedor.
  'pinVerificacao',
] as const;

type Config = Record<string, unknown>;

/** Cifra os campos secretos de uma configuração de canal. Idempotente. */
export function cifrarConfig(config: Config, chaveiro: Chaveiro): Config {
  const saida: Config = { ...config };
  for (const campo of CAMPOS_SECRETOS_DE_CANAL) {
    const valor = saida[campo];
    if (typeof valor !== 'string' || valor === '' || estaCifrado(valor)) continue;
    saida[campo] = cifrar(valor, chaveiro);
  }
  return saida;
}

/**
 * Decifra os campos secretos na leitura.
 *
 * Valor em texto claro passa direto, de propósito e só aqui: é o que permite ler
 * o que foi gravado antes desta cifra existir sem derrubar a operação. O caminho
 * de escrita não tem essa tolerância — o que for gravado a partir de agora sai
 * cifrado.
 */
export function decifrarConfig(config: Config, chaveiro: Chaveiro): Config {
  const saida: Config = { ...config };
  for (const campo of CAMPOS_SECRETOS_DE_CANAL) {
    const valor = saida[campo];
    if (typeof valor !== 'string' || !estaCifrado(valor)) continue;
    saida[campo] = decifrar(valor, chaveiro);
  }
  return saida;
}

/** Comparação em tempo constante, para segredo que chega de fora (verifyToken). */
export function segredoConfere(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
