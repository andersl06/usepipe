import { createDecipheriv, createHash, createPrivateKey, pbkdf2Sync, X509Certificate } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { createSecureContext } from 'node:tls';
import { ErroPipe } from '../../erros.js';

/**
 * Leitura do `.pfx` (PKCS#12) no servidor, só com o que o Node traz.
 *
 * Na origem quem lê o arquivo é o serviço de `postmaster@mtls.blip.ai`: a tela
 * sobe `password` + `file` e volta `status`, `expiration_date`
 * (`docs/pesquisa/blip-certificados-mtls.md`). Aqui a leitura é em dois passos:
 *
 * 1. **`tls.createSecureContext({ pfx, passphrase })`** é o juiz. O OpenSSL por
 *    baixo confere o MAC do arquivo com a senha (senha errada → "mac verify
 *    failure"), decifra a chave privada e exige que ela case com um certificado
 *    do arquivo. Se passa aqui, o mesmo par vai funcionar no `https.Agent` de
 *    `dominio/mtls.ts` — é literalmente o mesmo caminho.
 * 2. **`X509Certificate`** lê validade, emissor, sujeito e a impressão digital
 *    SHA-256 — mas só de um certificado DER/PEM, não de um PKCS#12. O Node não
 *    tem API pública para tirar o certificado de dentro do `.pfx`; por isso o
 *    parser ASN.1 mínimo abaixo (RFC 7292): abre o envelope, decifra o saco de
 *    certificados (PBES2/AES ou o 3DES do PKCS#12) e entrega o DER de cada um.
 *
 * O que fica de fora, e por quê: os PBEs com RC2/RC4 (`.pfx` do Windows antigo
 * e do OpenSSL 1.x por padrão) não existem no OpenSSL 3 sem o provedor
 * `legacy`, que o Node não carrega — o passo 1 já recusa esses arquivos com
 * "unsupported", e a mensagem pede reexportar com AES.
 */

export interface LeituraDoPfx {
  /** `notAfter` do certificado que casa com a chave privada. */
  expiraEm: Date;
  validoDesde: Date;
  /** SHA-256 em hexadecimal maiúsculo separado por `:` — o `fingerprint256` do Node. */
  impressaoDigital: string;
  emissor: string;
  sujeito: string;
  /** Quantos certificados vieram no arquivo além do próprio (a cadeia). */
  certificadosNaCadeia: number;
}

/* ------------------------------------------------------------ ASN.1 DER */

interface Tlv {
  tag: number;
  conteudo: Buffer;
  /** O elemento inteiro (tag + tamanho + conteúdo), para repassar ao OpenSSL. */
  bruto: Buffer;
}

const TAG = {
  INTEIRO: 0x02,
  OCTETOS: 0x04,
  OID: 0x06,
  SEQUENCIA: 0x30,
  CONJUNTO: 0x31,
  /** `[0]` explícito (construído). */
  CTX0: 0xa0,
  /** `[0]` implícito primitivo — o `encryptedContent` do PKCS#7. */
  CTX0_PRIMITIVO: 0x80,
} as const;

class ErroDeAsn1 extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroDeAsn1';
  }
}

/** Lê os elementos DER consecutivos de `dados`, do começo ao fim. */
function lerTlvs(dados: Buffer): Tlv[] {
  const lidos: Tlv[] = [];
  let pos = 0;
  while (pos < dados.length) {
    const tag = dados[pos]!;
    if ((tag & 0x1f) === 0x1f) throw new ErroDeAsn1('tag longa não é usada em PKCS#12');
    const primeiro = dados[pos + 1];
    if (primeiro === undefined) throw new ErroDeAsn1('elemento truncado');
    let inicio = pos + 2;
    let tamanho = primeiro;
    if (primeiro & 0x80) {
      const n = primeiro & 0x7f;
      // `0x80` é tamanho indefinido (BER): nenhum exportador de .pfx usa.
      if (n === 0 || n > 4 || inicio + n > dados.length) throw new ErroDeAsn1('tamanho inválido');
      tamanho = 0;
      for (let i = 0; i < n; i++) tamanho = tamanho * 256 + dados[inicio + i]!;
      inicio += n;
    }
    const fim = inicio + tamanho;
    if (fim > dados.length) throw new ErroDeAsn1('elemento truncado');
    lidos.push({ tag, conteudo: dados.subarray(inicio, fim), bruto: dados.subarray(pos, fim) });
    pos = fim;
  }
  return lidos;
}

function esperar(tlv: Tlv | undefined, tag: number, oQue: string): Tlv {
  if (!tlv || tlv.tag !== tag) throw new ErroDeAsn1(`esperava ${oQue}`);
  return tlv;
}

/** Os filhos de um SEQUENCE/SET/[0]. */
function filhos(tlv: Tlv | undefined, tag: number, oQue: string): Tlv[] {
  return lerTlvs(esperar(tlv, tag, oQue).conteudo);
}

function oidDe(tlv: Tlv | undefined): string {
  const { conteudo } = esperar(tlv, TAG.OID, 'OID');
  const arcos: number[] = [];
  let valor = 0;
  for (const byte of conteudo) {
    valor = valor * 128 + (byte & 0x7f);
    if (byte & 0x80) continue;
    if (arcos.length === 0) {
      const primeiro = valor < 40 ? 0 : valor < 80 ? 1 : 2;
      arcos.push(primeiro, valor - primeiro * 40);
    } else {
      arcos.push(valor);
    }
    valor = 0;
  }
  return arcos.join('.');
}

function inteiroDe(tlv: Tlv | undefined): number {
  const { conteudo } = esperar(tlv, TAG.INTEIRO, 'INTEGER');
  let n = 0;
  for (const byte of conteudo) n = n * 256 + byte;
  return n;
}

const OID = {
  data: '1.2.840.113549.1.7.1',
  encryptedData: '1.2.840.113549.1.7.6',
  certBag: '1.2.840.113549.1.12.10.1.3',
  keyBag: '1.2.840.113549.1.12.10.1.1',
  pkcs8ShroudedKeyBag: '1.2.840.113549.1.12.10.1.2',
  x509Certificate: '1.2.840.113549.1.9.22.1',
  pbes2: '1.2.840.113549.1.5.13',
  pbkdf2: '1.2.840.113549.1.5.12',
  pbeSha1E3DES: '1.2.840.113549.1.12.1.3',
  pbeSha1E2DES: '1.2.840.113549.1.12.1.4',
} as const;

/** Os PBEs do PKCS#12 que o OpenSSL 3 só tem no provedor `legacy` (o Node não carrega). */
const PBE_ANTIGO = new Set([
  '1.2.840.113549.1.12.1.1', // pbeWithSHA1And128BitRC4
  '1.2.840.113549.1.12.1.2', // pbeWithSHA1And40BitRC4
  '1.2.840.113549.1.12.1.5', // pbeWithSHA1And128BitRC2-CBC
  '1.2.840.113549.1.12.1.6', // pbeWithSHA1And40BitRC2-CBC
]);

const PRF_DO_PBKDF2: Record<string, string> = {
  '1.2.840.113549.2.7': 'sha1',
  '1.2.840.113549.2.8': 'sha224',
  '1.2.840.113549.2.9': 'sha256',
  '1.2.840.113549.2.10': 'sha384',
  '1.2.840.113549.2.11': 'sha512',
};

const CIFRA_DO_PBES2: Record<string, { nome: string; chave: number }> = {
  '2.16.840.1.101.3.4.1.2': { nome: 'aes-128-cbc', chave: 16 },
  '2.16.840.1.101.3.4.1.22': { nome: 'aes-192-cbc', chave: 24 },
  '2.16.840.1.101.3.4.1.42': { nome: 'aes-256-cbc', chave: 32 },
  '1.2.840.113549.3.7': { nome: 'des-ede3-cbc', chave: 24 },
};

/* ------------------------------------------------------- derivação PKCS#12 */

/** Repete `parte` até encher `tamanho` bytes (o passo 2/3 do apêndice B.2). */
function encher(parte: Buffer, tamanho: number): Buffer {
  if (parte.length === 0 || tamanho === 0) return Buffer.alloc(0);
  const copias: Buffer[] = [];
  for (let feito = 0; feito < tamanho; feito += parte.length) copias.push(parte);
  return Buffer.concat(copias).subarray(0, tamanho);
}

/**
 * A senha como o PKCS#12 quer: BMPString — UTF-16 big-endian com o terminador
 * de dois zeros incluído na contagem (é assim que o OpenSSL monta em
 * `OPENSSL_utf82uni`).
 */
function senhaComoBmpString(senha: string): Buffer {
  const utf16 = Buffer.from(senha, 'utf16le').swap16();
  return Buffer.concat([utf16, Buffer.alloc(2)]);
}

/**
 * A derivação de chave do PKCS#12 (RFC 7292, apêndice B.2) — o que os PBEs
 * antigos (`pbeWithSHA1And3-KeyTripleDES-CBC`) e o MAC do arquivo usam. O
 * `id` diz para quê: 1 = chave de cifra, 2 = IV, 3 = chave do MAC.
 *
 * Exportada para o teste montar um `.pfx` de verdade sem arquivo binário no
 * repositório: o MAC do arquivo de teste sai daqui, e o `createSecureContext`
 * (OpenSSL) é quem confere — se a derivação estivesse errada, o teste cairia.
 */
export function derivarChavePkcs12(
  hash: 'sha1' | 'sha256',
  senha: string,
  sal: Buffer,
  iteracoes: number,
  id: 1 | 2 | 3,
  tamanho: number,
): Buffer {
  const u = hash === 'sha1' ? 20 : 32;
  const v = 64; // bloco de 512 bits, tanto no SHA-1 quanto no SHA-256
  const D = Buffer.alloc(v, id);
  const P = senhaComoBmpString(senha);
  const I = Buffer.concat([
    encher(sal, v * Math.ceil(sal.length / v)),
    encher(P, v * Math.ceil(P.length / v)),
  ]);
  const voltas = Math.ceil(tamanho / u);
  const saida: Buffer[] = [];
  for (let i = 0; i < voltas; i++) {
    let A = createHash(hash).update(D).update(I).digest();
    for (let r = 1; r < iteracoes; r++) A = createHash(hash).update(A).digest();
    saida.push(A);
    if (i === voltas - 1) break;
    // I_j = (I_j + B + 1) mod 2^v, bloco a bloco, big-endian.
    const B = encher(A, v);
    for (let j = 0; j < I.length; j += v) {
      let vai = 1;
      for (let k = v - 1; k >= 0; k--) {
        const soma = I[j + k]! + B[k]! + vai;
        I[j + k] = soma & 0xff;
        vai = soma >> 8;
      }
    }
  }
  return Buffer.concat(saida).subarray(0, tamanho);
}

/* ------------------------------------------------------------- decifrar */

/** Decifra um `EncryptedContentInfo` pelo `AlgorithmIdentifier` dele. */
function decifrarConteudo(algoritmo: Tlv, cifrado: Buffer, senha: string): Buffer {
  const [oidTlv, parametros] = filhos(algoritmo, TAG.SEQUENCIA, 'AlgorithmIdentifier');
  const oid = oidDe(oidTlv);

  if (PBE_ANTIGO.has(oid)) {
    throw ErroPipe.requisicao(
      'pfx_formato_antigo',
      'O arquivo usa uma cifra antiga (RC2/RC4) que não é mais suportada. Exporte o certificado de novo com AES-256 (no OpenSSL: `openssl pkcs12 -export` sem `-legacy`).',
    );
  }

  if (oid === OID.pbes2) {
    const [kdf, esquema] = filhos(parametros, TAG.SEQUENCIA, 'PBES2-params');
    const [kdfOid, kdfParametros] = filhos(kdf, TAG.SEQUENCIA, 'keyDerivationFunc');
    if (oidDe(kdfOid) !== OID.pbkdf2) throw new ErroDeAsn1('PBES2 sem PBKDF2');
    const partes = filhos(kdfParametros, TAG.SEQUENCIA, 'PBKDF2-params');
    const sal = esperar(partes[0], TAG.OCTETOS, 'salt').conteudo;
    const iteracoes = inteiroDe(partes[1]);
    // `keyLength` (INTEGER) e `prf` (SEQUENCE) são opcionais, nessa ordem.
    const prfTlv = partes.find((p, i) => i >= 2 && p.tag === TAG.SEQUENCIA);
    const prf = prfTlv ? (PRF_DO_PBKDF2[oidDe(lerTlvs(prfTlv.conteudo)[0])] ?? null) : 'sha1';
    if (!prf) throw new ErroDeAsn1('PRF do PBKDF2 desconhecida');

    const [cifraOid, ivTlv] = filhos(esquema, TAG.SEQUENCIA, 'encryptionScheme');
    const cifra = CIFRA_DO_PBES2[oidDe(cifraOid)];
    if (!cifra) throw new ErroDeAsn1('cifra do PBES2 desconhecida');
    const iv = esperar(ivTlv, TAG.OCTETOS, 'IV').conteudo;
    // No PBES2 a senha entra como os bytes UTF-8, sem o BMPString do PKCS#12
    // (é o que o `PKCS5_PBKDF2_HMAC` do OpenSSL recebe).
    const chave = pbkdf2Sync(Buffer.from(senha, 'utf8'), sal, iteracoes, cifra.chave, prf);
    const decifra = createDecipheriv(cifra.nome, chave, iv);
    return Buffer.concat([decifra.update(cifrado), decifra.final()]);
  }

  if (oid === OID.pbeSha1E3DES || oid === OID.pbeSha1E2DES) {
    const partes = filhos(parametros, TAG.SEQUENCIA, 'pkcs-12PbeParams');
    const sal = esperar(partes[0], TAG.OCTETOS, 'salt').conteudo;
    const iteracoes = inteiroDe(partes[1]);
    const tresChaves = oid === OID.pbeSha1E3DES;
    const chave = derivarChavePkcs12('sha1', senha, sal, iteracoes, 1, tresChaves ? 24 : 16);
    const iv = derivarChavePkcs12('sha1', senha, sal, iteracoes, 2, 8);
    const decifra = createDecipheriv(tresChaves ? 'des-ede3-cbc' : 'des-ede-cbc', chave, iv);
    return Buffer.concat([decifra.update(cifrado), decifra.final()]);
  }

  throw new ErroDeAsn1(`cifra ${oid} não suportada`);
}

/* --------------------------------------------------------------- o PFX */

interface ConteudoDoPfx {
  /** DER de cada certificado achado nos sacos. */
  certificados: Buffer[];
  /** DER de cada chave (`PrivateKeyInfo` ou `EncryptedPrivateKeyInfo`). */
  chaves: Buffer[];
}

/** O conteúdo de um `[0]` que embrulha um OCTET STRING (o `ContentInfo` de `data`). */
function octetosDentroDeCtx0(tlv: Tlv | undefined): Buffer {
  const [interno] = filhos(tlv, TAG.CTX0, '[0]');
  return esperar(interno, TAG.OCTETOS, 'OCTET STRING').conteudo;
}

/** O `encryptedContent [0] IMPLICIT OCTET STRING` — primitivo no DER; construído (BER) em raríssimos exportadores. */
function conteudoCifradoDe(tlv: Tlv | undefined): Buffer {
  if (!tlv) throw new ErroDeAsn1('encryptedContent ausente');
  if (tlv.tag === TAG.CTX0_PRIMITIVO) return tlv.conteudo;
  if (tlv.tag === TAG.CTX0) {
    return Buffer.concat(lerTlvs(tlv.conteudo).map((p) => esperar(p, TAG.OCTETOS, 'pedaço').conteudo));
  }
  throw new ErroDeAsn1('encryptedContent com tag inesperada');
}

/** `SafeContents ::= SEQUENCE OF SafeBag` — o DER inteiro, com o SEQUENCE de fora. */
function lerSacos(safeContents: Buffer, saida: ConteudoDoPfx): void {
  const [sequencia] = lerTlvs(safeContents);
  for (const saco of filhos(sequencia, TAG.SEQUENCIA, 'SafeContents')) {
    const [idTlv, valor] = filhos(saco, TAG.SEQUENCIA, 'SafeBag');
    const id = oidDe(idTlv);
    if (id === OID.certBag) {
      const [certBag] = filhos(valor, TAG.CTX0, 'bagValue');
      const [tipoTlv, certTlv] = filhos(certBag, TAG.SEQUENCIA, 'CertBag');
      if (oidDe(tipoTlv) !== OID.x509Certificate) continue; // SDSI e outros: não nos servem
      saida.certificados.push(octetosDentroDeCtx0(certTlv));
    } else if (id === OID.pkcs8ShroudedKeyBag || id === OID.keyBag) {
      const [chave] = filhos(valor, TAG.CTX0, 'bagValue');
      saida.chaves.push(esperar(chave, TAG.SEQUENCIA, 'PrivateKeyInfo').bruto);
    }
    // Outros sacos (secretBag, safeContentsBag aninhado, CRL): ignorados.
  }
}

/** Abre o PKCS#12 até os sacos: certificados e chaves, em DER. */
function abrirPfx(pfx: Buffer, senha: string): ConteudoDoPfx {
  const raiz = lerTlvs(pfx);
  const [versao, authSafe] = filhos(raiz[0], TAG.SEQUENCIA, 'PFX');
  if (inteiroDe(versao) !== 3) throw new ErroDeAsn1('versão do PFX não é 3');

  const [tipoTlv, conteudoTlv] = filhos(authSafe, TAG.SEQUENCIA, 'authSafe');
  if (oidDe(tipoTlv) !== OID.data) throw new ErroDeAsn1('authSafe não é `data` (assinado não é suportado)');
  // `AuthenticatedSafe ::= SEQUENCE OF ContentInfo`, dentro do OCTET STRING.
  const [authenticatedSafe] = lerTlvs(octetosDentroDeCtx0(conteudoTlv));

  const saida: ConteudoDoPfx = { certificados: [], chaves: [] };
  for (const contentInfo of filhos(authenticatedSafe, TAG.SEQUENCIA, 'AuthenticatedSafe')) {
    const [oidTlv, corpo] = filhos(contentInfo, TAG.SEQUENCIA, 'ContentInfo');
    const oid = oidDe(oidTlv);
    if (oid === OID.data) {
      lerSacos(octetosDentroDeCtx0(corpo), saida);
    } else if (oid === OID.encryptedData) {
      const [encryptedData] = filhos(corpo, TAG.CTX0, '[0]');
      const [, encryptedContentInfo] = filhos(encryptedData, TAG.SEQUENCIA, 'EncryptedData');
      const [, algoritmo, cifrado] = filhos(encryptedContentInfo, TAG.SEQUENCIA, 'EncryptedContentInfo');
      if (!algoritmo) throw new ErroDeAsn1('EncryptedContentInfo sem algoritmo');
      lerSacos(decifrarConteudo(algoritmo, conteudoCifradoDe(cifrado), senha), saida);
    }
  }
  return saida;
}

/* --------------------------------------------------------------- leitura */

/** Junta as linhas `CN=...\nO=...` do `X509Certificate` numa só. */
function nomeNumaLinha(nome: string): string {
  return nome.split('\n').filter(Boolean).join(', ');
}

/**
 * O certificado que casa com a chave privada — o "próprio", e não um da
 * cadeia. Sem chave legível, fica o que não emitiu nenhum outro do arquivo.
 */
function escolherProprio(certificados: X509Certificate[], chave: KeyObject | null): X509Certificate {
  if (chave) {
    const casa = certificados.find((c) => c.checkPrivateKey(chave));
    if (casa) return casa;
  }
  const folha = certificados.find((c) => !certificados.some((o) => o !== c && o.checkIssued(c)));
  return folha ?? certificados[0]!;
}

function classificarFalhaDoOpenSsl(falha: unknown): ErroPipe {
  // O Node põe a razão do OpenSSL na mensagem ("mac verify failure") e o
  // código em `code` (`ERR_OSSL_PKCS12_MAC_VERIFY_FAILURE`); olhamos os dois.
  const erro = falha as { message?: string; code?: string } | null;
  const mensagem = `${erro?.code ?? ''} ${erro?.message ?? ''}`;
  if (/mac[ _]verify[ _]failure/i.test(mensagem)) {
    return ErroPipe.requisicao('senha_incorreta', 'A senha do certificado está incorreta.');
  }
  if (/unsupported/i.test(mensagem)) {
    return ErroPipe.requisicao(
      'pfx_formato_antigo',
      'O arquivo usa uma cifra antiga (RC2/RC4) que não é mais suportada. Exporte o certificado de novo com AES-256 (no OpenSSL: `openssl pkcs12 -export` sem `-legacy`).',
    );
  }
  // Não repassamos a mensagem do OpenSSL: ela descreve a estrutura do arquivo,
  // e o que interessa a quem cadastra é que o arquivo não é um .pfx que sirva.
  return ErroPipe.requisicao(
    'pfx_invalido',
    'O arquivo não é um .pfx válido, ou não tem a chave privada junto do certificado.',
  );
}

/**
 * Lê o `.pfx` com a senha. Lança `ErroPipe` 400 (`senha_incorreta`,
 * `pfx_invalido`, `pfx_formato_antigo`, `pfx_ilegivel`) — nunca com a senha
 * nem com bytes do arquivo na mensagem.
 */
export function lerPfx(pfx: Buffer, senha: string): LeituraDoPfx {
  // 1. O OpenSSL julga: MAC com a senha, chave decifrada, chave casando com o certificado.
  try {
    createSecureContext({ pfx, passphrase: senha });
  } catch (falha) {
    throw classificarFalhaDoOpenSsl(falha);
  }

  // 2. Os certificados de dentro do arquivo.
  let conteudo: ConteudoDoPfx;
  try {
    conteudo = abrirPfx(pfx, senha);
  } catch (falha) {
    if (falha instanceof ErroPipe) throw falha;
    throw ErroPipe.requisicao(
      'pfx_ilegivel',
      'O arquivo abriu com a senha, mas o certificado dentro dele não pôde ser lido.',
    );
  }
  const certificados: X509Certificate[] = [];
  for (const der of conteudo.certificados) {
    try {
      certificados.push(new X509Certificate(der));
    } catch {
      /* um certificado corrompido na cadeia não invalida o próprio */
    }
  }
  if (certificados.length === 0) {
    throw ErroPipe.requisicao('pfx_ilegivel', 'O arquivo não tem nenhum certificado X.509 legível.');
  }

  // A chave só serve para apontar qual certificado é o próprio: vive nesta
  // função e morre com ela.
  let chave: KeyObject | null = null;
  for (const der of conteudo.chaves) {
    try {
      chave = createPrivateKey({ key: der, format: 'der', type: 'pkcs8', passphrase: senha });
      break;
    } catch {
      /* saco de chave em formato que o OpenSSL não abre por aqui: cai na heurística */
    }
  }

  const proprio = escolherProprio(certificados, chave);
  return {
    expiraEm: proprio.validToDate ?? new Date(proprio.validTo),
    validoDesde: proprio.validFromDate ?? new Date(proprio.validFrom),
    impressaoDigital: proprio.fingerprint256,
    emissor: nomeNumaLinha(proprio.issuer),
    sujeito: nomeNumaLinha(proprio.subject),
    certificadosNaCadeia: certificados.length - 1,
  };
}
