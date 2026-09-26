import { createDecipheriv, createHash, createPrivateKey, pbkdf2Sync, X509Certificate } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { createSecureContext } from 'node:tls';
import { PipeError } from '../../errors.js';

/**
 * Read server-side `.pfx` (PKCS#12) with Node APIs. Blip delegates uploaded `password` and `file` to `postmaster@mtls.blip.ai`, returning `status` and `expiration_date` (`referencias-blip/pesquisa/blip-certificados-mtls.md`). First `tls.createSecureContext({ pfx, passphrase })` lets OpenSSL verify the password MAC, decrypt the private key and require a matching certificate; the same pair is used by `https.Agent` in `dominio/mtls.ts`. Then `X509Certificate` reads expiry, issuer, subject and SHA-256 fingerprint from DER/PEM. Since Node has no public PKCS#12 certificate extraction API, the minimal ASN.1 parser (RFC 7292) opens the envelope and decrypts PBES2/AES or PKCS#12 3DES certificate bags. RC2/RC4 PBEs from old Windows or OpenSSL 1.x exports require OpenSSL 3's `legacy` provider, unavailable to Node; step one rejects them as 'unsupported' and asks for AES re-export.
 */

export interface ReadOfPfx {
  /** `notAfter` of the certificate matching the private key. */
  expiraEm: Date;
  validoDesde: Date;
  /** Uppercase colon-separated SHA-256 hex, matching Node's `fingerprint256`. */
  impressaoDigital: string;
  emissor: string;
  sujeito: string;
  /** Number of additional chain certificates beyond the matching certificate. */
  certificadosNaCadeia: number;
}

/* ------------------------------------------------------------ ASN.1 DER */

interface Tlv {
  tag: number;
  content: Buffer;
  /** Keep the whole element (tag, length, content) for passing to OpenSSL. */
  bruto: Buffer;
}

const TAG = {
  INTEIRO: 0x02,
  OCTETOS: 0x04,
  OID: 0x06,
  SEQUENCIA: 0x30,
  CONJUNTO: 0x31,
  /** Explicit constructed `[0]`. */
  CTX0: 0xa0,
  /** Primitive implicit `[0]`, the PKCS#7 `encryptedContent`. */
  CTX0_PRIMITIVO: 0x80,
} as const;

class Asn1Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErroDeAsn1';
  }
}

/** Read consecutive DER elements of `dados` from start to end. */
function lerTlvs(data: Buffer): Tlv[] {
  const lidos: Tlv[] = [];
  let pos = 0;
  while (pos < data.length) {
    const tag = data[pos]!;
    if ((tag & 0x1f) === 0x1f) throw new Asn1Error('tag longa não é usada em PKCS#12');
    const primeiro = data[pos + 1];
    if (primeiro === undefined) throw new Asn1Error('elemento truncado');
    let inicio = pos + 2;
    let tamanho = primeiro;
    if (primeiro & 0x80) {
      const n = primeiro & 0x7f;
      // `0x80` denotes indefinite BER length, unused by supported `.pfx` exporters.
      if (n === 0 || n > 4 || inicio + n > data.length) throw new Asn1Error('tamanho inválido');
      tamanho = 0;
      for (let i = 0; i < n; i++) tamanho = tamanho * 256 + data[inicio + i]!;
      inicio += n;
    }
    const fim = inicio + tamanho;
    if (fim > data.length) throw new Asn1Error('elemento truncado');
    lidos.push({ tag, content: data.subarray(inicio, fim), bruto: data.subarray(pos, fim) });
    pos = fim;
  }
  return lidos;
}

function esperar(tlv: Tlv | undefined, tag: number, oQue: string): Tlv {
  if (!tlv || tlv.tag !== tag) throw new Asn1Error(`esperava ${oQue}`);
  return tlv;
}

/** Os filhos de um SEQUENCE/SET/[0]. */
function filhos(tlv: Tlv | undefined, tag: number, oQue: string): Tlv[] {
  return lerTlvs(esperar(tlv, tag, oQue).content);
}

function oidDe(tlv: Tlv | undefined): string {
  const { content: conteudo } = esperar(tlv, TAG.OID, 'OID');
  const arcos: number[] = [];
  let value = 0;
  for (const byte of conteudo) {
    value = value * 128 + (byte & 0x7f);
    if (byte & 0x80) continue;
    if (arcos.length === 0) {
      const first = value < 40 ? 0 : value < 80 ? 1 : 2;
      arcos.push(first, value - first * 40);
    } else {
      arcos.push(value);
    }
    value = 0;
  }
  return arcos.join('.');
}

function integerOf(tlv: Tlv | undefined): number {
  const { content: conteudo } = esperar(tlv, TAG.INTEIRO, 'INTEGER');
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

/** PKCS#12 PBEs available in OpenSSL 3 only through the `legacy` provider, which Node does not load. */
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

const CIFRA_DO_PBES2: Record<string, { name: string; key: number }> = {
  '2.16.840.1.101.3.4.1.2': { name: 'aes-128-cbc', key: 16 },
  '2.16.840.1.101.3.4.1.22': { name: 'aes-192-cbc', key: 24 },
  '2.16.840.1.101.3.4.1.42': { name: 'aes-256-cbc', key: 32 },
  '1.2.840.113549.3.7': { name: 'des-ede3-cbc', key: 24 },
};



/** Repeat `parte` until `tamanho` bytes are filled (appendix B.2 steps 2/3). */
function encher(parte: Buffer, tamanho: number): Buffer {
  if (parte.length === 0 || tamanho === 0) return Buffer.alloc(0);
  const copias: Buffer[] = [];
  for (let feito = 0; feito < tamanho; feito += parte.length) copias.push(parte);
  return Buffer.concat(copias).subarray(0, tamanho);
}

/**
 * Encode the password as PKCS#12 BMPString: UTF-16 big-endian including the two-zero terminator in the length, as OpenSSL `OPENSSL_utf82uni` does.
 */
function senhaComoBmpString(senha: string): Buffer {
  const utf16 = Buffer.from(senha, 'utf16le').swap16();
  return Buffer.concat([utf16, Buffer.alloc(2)]);
}

/**
 * Derive PKCS#12 keys per RFC 7292 appendix B.2 for legacy PBEs (`pbeWithSHA1And3-KeyTripleDES-CBC`) and file MAC. `id` selects purpose: 1 cipher key, 2 IV, 3 MAC key. Exported so tests build a real `.pfx` without a binary fixture; `createSecureContext` in OpenSSL verifies its MAC and would fail on wrong derivation.
 */
export function deriveKeyPkcs12(
  hash: 'sha1' | 'sha256',
  senha: string,
  sal: Buffer,
  iterations: number,
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
    for (let r = 1; r < iterations; r++) A = createHash(hash).update(A).digest();
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
    throw PipeError.request(
      'pfx_format_old',
      'O arquivo usa uma cifra antiga (RC2/RC4) que não é mais suportada. Exporte o certificado de novo com AES-256 (no OpenSSL: `openssl pkcs12 -export` sem `-legacy`).',
    );
  }

  if (oid === OID.pbes2) {
    const [kdf, esquema] = filhos(parametros, TAG.SEQUENCIA, 'PBES2-params');
    const [kdfOid, kdfParametros] = filhos(kdf, TAG.SEQUENCIA, 'keyDerivationFunc');
    if (oidDe(kdfOid) !== OID.pbkdf2) throw new Asn1Error('PBES2 sem PBKDF2');
    const partes = filhos(kdfParametros, TAG.SEQUENCIA, 'PBKDF2-params');
    const sal = esperar(partes[0], TAG.OCTETOS, 'salt').content;
    const iterations = integerOf(partes[1]);
    // `keyLength` (INTEGER) and `prf` (SEQUENCE) are optional, in that order.
    const prfTlv = partes.find((p, i) => i >= 2 && p.tag === TAG.SEQUENCIA);
    const prf = prfTlv ? (PRF_DO_PBKDF2[oidDe(lerTlvs(prfTlv.content)[0])] ?? null) : 'sha1';
    if (!prf) throw new Asn1Error('PRF do PBKDF2 desconhecida');

    const [cifraOid, ivTlv] = filhos(esquema, TAG.SEQUENCIA, 'encryptionScheme');
    const cifra = CIFRA_DO_PBES2[oidDe(cifraOid)];
    if (!cifra) throw new Asn1Error('cifra do PBES2 desconhecida');
    const iv = esperar(ivTlv, TAG.OCTETOS, 'IV').content;
    // PBES2 uses UTF-8 password bytes, without PKCS#12 BMPString,
    // as OpenSSL `PKCS5_PBKDF2_HMAC` does.
    const key = pbkdf2Sync(Buffer.from(senha, 'utf8'), sal, iterations, cifra.key, prf);
    const decifra = createDecipheriv(cifra.name, key, iv);
    return Buffer.concat([decifra.update(cifrado), decifra.final()]);
  }

  if (oid === OID.pbeSha1E3DES || oid === OID.pbeSha1E2DES) {
    const partes = filhos(parametros, TAG.SEQUENCIA, 'pkcs-12PbeParams');
    const sal = esperar(partes[0], TAG.OCTETOS, 'salt').content;
    const iteracoes = integerOf(partes[1]);
    const tresChaves = oid === OID.pbeSha1E3DES;
    const chave = deriveKeyPkcs12('sha1', senha, sal, iteracoes, 1, tresChaves ? 24 : 16);
    const iv = deriveKeyPkcs12('sha1', senha, sal, iteracoes, 2, 8);
    const decifra = createDecipheriv(tresChaves ? 'des-ede3-cbc' : 'des-ede-cbc', chave, iv);
    return Buffer.concat([decifra.update(cifrado), decifra.final()]);
  }

  throw new Asn1Error(`cifra ${oid} não suportada`);
}

/* --------------------------------------------------------------- o PFX */

interface ConteudoDoPfx {
  /** DER de cada certificado achado nos sacos. */
  certificados: Buffer[];
  /** DER de cada chave (`PrivateKeyInfo` ou `EncryptedPrivateKeyInfo`). */
  chaves: Buffer[];
}

/** Contents of `[0]` wrapping an OCTET STRING (`data` `ContentInfo`). */
function octetosDentroDeCtx0(tlv: Tlv | undefined): Buffer {
  const [interno] = filhos(tlv, TAG.CTX0, '[0]');
  return esperar(interno, TAG.OCTETOS, 'OCTET STRING').content;
}

/** `encryptedContent [0] IMPLICIT OCTET STRING` is primitive in DER, constructed by rare BER exporters. */
function conteudoCifradoDe(tlv: Tlv | undefined): Buffer {
  if (!tlv) throw new Asn1Error('encryptedContent ausente');
  if (tlv.tag === TAG.CTX0_PRIMITIVO) return tlv.content;
  if (tlv.tag === TAG.CTX0) {
    return Buffer.concat(lerTlvs(tlv.content).map((p) => esperar(p, TAG.OCTETOS, 'pedaço').content));
  }
  throw new Asn1Error('encryptedContent com tag inesperada');
}

/** `SafeContents ::= SEQUENCE OF SafeBag` — o DER inteiro, com o SEQUENCE de fora. */
function lerSacos(safeContents: Buffer, saida: ConteudoDoPfx): void {
  const [sequencia] = lerTlvs(safeContents);
  for (const saco of filhos(sequencia, TAG.SEQUENCIA, 'SafeContents')) {
    const [idTlv, value] = filhos(saco, TAG.SEQUENCIA, 'SafeBag');
    const id = oidDe(idTlv);
    if (id === OID.certBag) {
      const [certBag] = filhos(value, TAG.CTX0, 'bagValue');
      const [tipoTlv, certTlv] = filhos(certBag, TAG.SEQUENCIA, 'CertBag');
      if (oidDe(tipoTlv) !== OID.x509Certificate) continue; // SDSI e outros: não nos servem
      saida.certificados.push(octetosDentroDeCtx0(certTlv));
    } else if (id === OID.pkcs8ShroudedKeyBag || id === OID.keyBag) {
      const [key] = filhos(value, TAG.CTX0, 'bagValue');
      saida.chaves.push(esperar(key, TAG.SEQUENCIA, 'PrivateKeyInfo').bruto);
    }
    // Outros sacos (secretBag, safeContentsBag aninhado, CRL): ignorados.
  }
}

/** Parse PKCS#12 through the bags containing DER certificates and keys. */
function abrirPfx(pfx: Buffer, senha: string): ConteudoDoPfx {
  const raiz = lerTlvs(pfx);
  const [versao, authSafe] = filhos(raiz[0], TAG.SEQUENCIA, 'PFX');
  if (integerOf(versao) !== 3) throw new Asn1Error('versão do PFX não é 3');

  const [tipoTlv, conteudoTlv] = filhos(authSafe, TAG.SEQUENCIA, 'authSafe');
  if (oidDe(tipoTlv) !== OID.data) throw new Asn1Error('authSafe não é `data` (assinado não é suportado)');
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
      if (!algoritmo) throw new Asn1Error('EncryptedContentInfo sem algoritmo');
      lerSacos(decifrarConteudo(algoritmo, conteudoCifradoDe(cifrado), senha), saida);
    }
  }
  return saida;
}

/* --------------------------------------------------------------- leitura */

/** Join `X509Certificate` `CN=...\nO=...` lines into one. */
function nomeNumaLinha(nome: string): string {
  return nome.split('\n').filter(Boolean).join(', ');
}

/**
 * Select the certificate matching the private key rather than an intermediate chain certificate. If no readable key exists, choose the certificate that issued no other certificate in the file.
 */
function escolherProprio(certificados: X509Certificate[], chave: KeyObject | null): X509Certificate {
  if (chave) {
    const casa = certificados.find((c) => c.checkPrivateKey(chave));
    if (casa) return casa;
  }
  const folha = certificados.find((c) => !certificados.some((o) => o !== c && o.checkIssued(c)));
  return folha ?? certificados[0]!;
}

function classificarFalhaDoOpenSsl(falha: unknown): PipeError {
  // Node includes the OpenSSL reason ('mac verify failure') in the message and
  // the code in `code` (`ERR_OSSL_PKCS12_MAC_VERIFY_FAILURE`); inspect both.
  const error = falha as { message?: string; code?: string } | null;
  const message = `${error?.code ?? ''} ${error?.message ?? ''}`;
  if (/mac[ _]verify[ _]failure/i.test(message)) {
    return PipeError.request('password_incorrect', 'A senha do certificado está incorreta.');
  }
  if (/unsupported/i.test(message)) {
    return PipeError.request(
      'pfx_format_old',
      'O arquivo usa uma cifra antiga (RC2/RC4) que não é mais suportada. Exporte o certificado de novo com AES-256 (no OpenSSL: `openssl pkcs12 -export` sem `-legacy`).',
    );
  }
  // Do not expose the OpenSSL message: it describes internal file structure,
  // while the registrant only needs to know this is not a usable `.pfx`.
  return PipeError.request(
    'pfx_invalid',
    'O arquivo não é um .pfx válido, ou não tem a chave privada junto do certificado.',
  );
}

/**
 * Read `.pfx` with its password and throw `ErroPipe` 400 (`senha_incorreta`, `pfx_invalido`, `pfx_formato_antigo`, `pfx_ilegivel`) without exposing password or file bytes in messages.
 */
export function lerPfx(pfx: Buffer, senha: string): ReadOfPfx {
  // First let OpenSSL verify the password MAC, decrypted key and key-certificate match.
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
    if (falha instanceof PipeError) throw falha;
    throw PipeError.request(
      'pfx_unreadable',
      'O arquivo abriu com a senha, mas o certificado dentro dele não pôde ser lido.',
    );
  }
  const certificados: X509Certificate[] = [];
  for (const der of conteudo.certificados) {
    try {
      certificados.push(new X509Certificate(der));
    } catch {
      /* A corrupt chain certificate does not invalidate the leaf certificate. */
    }
  }
  if (certificados.length === 0) {
    throw PipeError.request('pfx_unreadable', 'O arquivo não tem nenhum certificado X.509 legível.');
  }

  // Use the private key only to identify the matching leaf certificate; it lives
  // only within this function and is discarded on return.
  let chave: KeyObject | null = null;
  for (const der of conteudo.chaves) {
    try {
      chave = createPrivateKey({ key: der, format: 'der', type: 'pkcs8', passphrase: senha });
      break;
    } catch {
      /* If OpenSSL cannot open this key-bag format here, use the certificate heuristic. */
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
