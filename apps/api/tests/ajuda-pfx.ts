import {
  createCipheriv,
  createHash,
  createHmac,
  generateKeyPairSync,
  pbkdf2Sync,
  randomBytes,
  sign,
} from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { derivarKeyPkcs12 } from '../src/domain/management/pfx.js';

/**
 * A real `.pfx` (PKCS#12), built in the test — no binary file in the repository and no new dependency.
 *
 * `node:crypto` generates the RSA key and signs, but does not build an X.509 certificate or PKCS#12; both DERs are written by hand here, in the format that OpenSSL 3's `openssl pkcs12 -export` produces by default:
 *
 * - the key in `pkcs8ShroudedKeyBag`, inside a `data` — it's the `EncryptedPrivateKeyInfo` that Node itself exports (`export({ cipher: 'aes-256-cbc', passphrase })`);
 * - the certificate in `certBag`, inside an `encryptedData` encrypted with PBES2 (PBKDF2-HMAC-SHA256 + AES-256-CBC), like the default `-certpbe`;
 * - the HMAC-SHA256 MAC with the PKCS#12 derivation (`derivarChavePkcs12`, the same one `api` uses for the old PBEs).
 *
 * OpenSSL, inside `api`'s `tls.createSecureContext`, is what checks whether this is correct: if any byte were wrong, registration in the test would fail with `pfx_invalido`/`senha_incorreta`.
 */

/* ------------------------------------------------------------- DER */

function tlv(tag: number, ...partes: Buffer[]): Buffer {
  const corpo = Buffer.concat(partes);
  const n = corpo.length;
  let tamanho: Buffer;
  if (n < 0x80) tamanho = Buffer.from([n]);
  else if (n < 0x100) tamanho = Buffer.from([0x81, n]);
  else if (n < 0x10000) tamanho = Buffer.from([0x82, n >> 8, n & 0xff]);
  else tamanho = Buffer.from([0x83, n >> 16, (n >> 8) & 0xff, n & 0xff]);
  return Buffer.concat([Buffer.from([tag]), tamanho, corpo]);
}

const seq = (...partes: Buffer[]) => tlv(0x30, ...partes);
const conjunto = (...partes: Buffer[]) => tlv(0x31, ...partes);
const ctx0 = (...partes: Buffer[]) => tlv(0xa0, ...partes);
const octetos = (dados: Buffer) => tlv(0x04, dados);
const nulo = () => Buffer.from([0x05, 0x00]);
const utf8 = (texto: string) => tlv(0x0c, Buffer.from(texto, 'utf8'));
const utcTime = (texto: string) => tlv(0x17, Buffer.from(texto, 'ascii'));
const bitString = (dados: Buffer) => tlv(0x03, Buffer.from([0]), dados);

function integer(n: number): Buffer {
  const bytes: number[] = [];
  let resto = n;
  do {
    bytes.unshift(resto & 0xff);
    resto = Math.floor(resto / 256);
  } while (resto > 0);
  if (bytes[0]! & 0x80) bytes.unshift(0);
  return tlv(0x02, Buffer.from(bytes));
}

function oid(pontuado: string): Buffer {
  const arcos = pontuado.split('.').map(Number);
  const bytes: number[] = [];
  const codificar = (value: number) => {
    const grupo: number[] = [value & 0x7f];
    let resto = Math.floor(value / 128);
    while (resto > 0) {
      grupo.unshift((resto & 0x7f) | 0x80);
      resto = Math.floor(resto / 128);
    }
    bytes.push(...grupo);
  };
  codificar(arcos[0]! * 40 + arcos[1]!);
  for (const arco of arcos.slice(2)) codificar(arco);
  return tlv(0x06, Buffer.from(bytes));
}

const OID = {
  data: '1.2.840.113549.1.7.1',
  encryptedData: '1.2.840.113549.1.7.6',
  certBag: '1.2.840.113549.1.12.10.1.3',
  pkcs8ShroudedKeyBag: '1.2.840.113549.1.12.10.1.2',
  x509Certificate: '1.2.840.113549.1.9.22.1',
  pbes2: '1.2.840.113549.1.5.13',
  pbkdf2: '1.2.840.113549.1.5.12',
  hmacWithSHA256: '1.2.840.113549.2.9',
  aes256Cbc: '2.16.840.1.101.3.4.1.42',
  sha256: '2.16.840.1.101.3.4.2.1',
  sha256WithRSA: '1.2.840.113549.1.1.11',
  commonName: '2.5.4.3',
} as const;

/* ---------------------------------------------------------- X.509 */

/** Self-signed v1 certificate, `CN=<cn>`, with validity in UTCTime (`YYMMDDHHMMSSZ`). */
function certificadoAutoAssinado(
  key: { publicKey: KeyObject; privateKey: KeyObject },
  cn: string,
  validoDesde: string,
  validoAte: string,
): Buffer {
  const nome = seq(conjunto(seq(oid(OID.commonName), utf8(cn))));
  const algoritmo = seq(oid(OID.sha256WithRSA), nulo());
  const spki = key.publicKey.export({ type: 'spki', format: 'der' });
  const tbs = seq(
    integer(1), // serialNumber
    algoritmo,
    nome, // issuer
    seq(utcTime(validoDesde), utcTime(validoAte)),
    nome, // subject
    spki,
  );
  const assinatura = sign('sha256', tbs, key.privateKey);
  return seq(tbs, algoritmo, bitString(assinatura));
}

/* --------------------------------------------------------- PKCS#12 */

/** PBES2: PBKDF2-HMAC-SHA256 (senha em UTF-8) + AES-256-CBC. */
function cifrarPbes2(data: Buffer, senha: string): { algoritmo: Buffer; cifrado: Buffer } {
  const sal = randomBytes(8);
  const iv = randomBytes(16);
  const iterations = 2048;
  const key = pbkdf2Sync(Buffer.from(senha, 'utf8'), sal, iterations, 32, 'sha256');
  const cifra = createCipheriv('aes-256-cbc', key, iv);
  const cifrado = Buffer.concat([cifra.update(data), cifra.final()]);
  const algoritmo = seq(
    oid(OID.pbes2),
    seq(
      seq(
        oid(OID.pbkdf2),
        seq(octetos(sal), integer(iterations), seq(oid(OID.hmacWithSHA256), nulo())),
      ),
      seq(oid(OID.aes256Cbc), octetos(iv)),
    ),
  );
  return { algoritmo, cifrado };
}

export interface PfxOfTest {
  pfx: Buffer;
  senha: string;
  /** The certificate's DER, to check the fingerprint `api` reads. */
  certificado: Buffer;
  /** SHA-256 do certificado como o `X509Certificate.fingerprint256` escreve: `AB:CD:…`. */
  impressaoDigital: string;
  /** `YYYY-MM-DD` do `notAfter`. */
  expiraEm: string;
}

/**
 * Generates a key plus self-signed certificate and wraps both in a `.pfx` with the password. `validoAte` in `YYYY-MM-DD` (up to 2049, per UTCTime).
 */
export function generatePfxOfTest(options: {
  senha: string;
  cn?: string;
  validoDesde?: string;
  validoAte?: string;
}): PfxOfTest {
  const validoDesde = options.validoDesde ?? '2020-01-01';
  const validoAte = options.validoAte ?? '2035-01-01';
  const emUtcTime = (data: string) => `${data.slice(2).replaceAll('-', '')}000000Z`;

  const chave = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const certificado = certificadoAutoAssinado(
    chave,
    options.cn ?? 'cliente.exemplo.com.br',
    emUtcTime(validoDesde),
    emUtcTime(validoAte),
  );

  // // The key: the EncryptedPrivateKeyInfo that Node already knows how to write.
  const keyEncrypted = chave.privateKey.export({
    type: 'pkcs8',
    format: 'der',
    cipher: 'aes-256-cbc',
    passphrase: options.senha,
  });
  const sacoOfKey = seq(oid(OID.pkcs8ShroudedKeyBag), ctx0(keyEncrypted));
  const contentOfKey = seq(oid(OID.data), ctx0(octetos(seq(sacoOfKey))));

  // O certificado: certBag dentro de um encryptedData PBES2.
  const sacoDoCertificado = seq(
    oid(OID.certBag),
    ctx0(seq(oid(OID.x509Certificate), ctx0(octetos(certificado)))),
  );
  const { algoritmo, cifrado } = cifrarPbes2(seq(sacoDoCertificado), options.senha);
  const conteudoDoCertificado = seq(
    oid(OID.encryptedData),
    ctx0(seq(integer(0), seq(oid(OID.data), algoritmo, tlv(0x80, cifrado)))),
  );

  const authenticatedSafe = seq(contentOfKey, conteudoDoCertificado);

  // // The MAC: HMAC-SHA256 over the AuthenticatedSafe, keyed by the PKCS#12 derivation (id 3).
  const salDoMac = randomBytes(8);
  const iterationsOfMac = 2048;
  const keyOfMac = derivarKeyPkcs12('sha256', options.senha, salDoMac, iterationsOfMac, 3, 32);
  const mac = createHmac('sha256', keyOfMac).update(authenticatedSafe).digest();
  const macData = seq(
    seq(seq(oid(OID.sha256), nulo()), octetos(mac)),
    octetos(salDoMac),
    integer(iterationsOfMac),
  );

  const pfx = seq(integer(3), seq(oid(OID.data), ctx0(octetos(authenticatedSafe))), macData);

  const impressaoDigital = createHash('sha256')
    .update(certificado)
    .digest('hex')
    .toUpperCase()
    .match(/.{2}/g)!
    .join(':');

  return { pfx, senha: options.senha, certificado, impressaoDigital, expiraEm: validoAte };
}
