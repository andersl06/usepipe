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
import { derivarChavePkcs12 } from '../src/dominio/gestao/pfx.js';

/**
 * Um `.pfx` (PKCS#12) de verdade, montado no teste — sem arquivo binário no
 * repositório e sem dependência nova.
 *
 * O `node:crypto` gera a chave RSA e assina, mas não monta certificado X.509
 * nem PKCS#12; o DER dos dois é escrito à mão aqui, no formato que o
 * `openssl pkcs12 -export` do OpenSSL 3 produz por padrão:
 *
 * - a chave em `pkcs8ShroudedKeyBag`, num `data` — é o `EncryptedPrivateKeyInfo`
 *   que o próprio Node exporta (`export({ cipher: 'aes-256-cbc', passphrase })`);
 * - o certificado em `certBag`, num `encryptedData` cifrado com PBES2
 *   (PBKDF2-HMAC-SHA256 + AES-256-CBC), como o `-certpbe` padrão;
 * - o MAC HMAC-SHA256 com a derivação do PKCS#12 (`derivarChavePkcs12`, a
 *   mesma que a `api` usa para os PBEs antigos).
 *
 * Quem confere se isto está certo é o OpenSSL dentro do
 * `tls.createSecureContext` da `api`: se qualquer byte estivesse errado, o
 * cadastro no teste cairia com `pfx_invalido`/`senha_incorreta`.
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

function inteiro(n: number): Buffer {
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
  const codificar = (valor: number) => {
    const grupo: number[] = [valor & 0x7f];
    let resto = Math.floor(valor / 128);
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

/** Certificado v1 autoassinado, `CN=<cn>`, com a validade em UTCTime (`YYMMDDHHMMSSZ`). */
function certificadoAutoAssinado(
  chave: { publicKey: KeyObject; privateKey: KeyObject },
  cn: string,
  validoDesde: string,
  validoAte: string,
): Buffer {
  const nome = seq(conjunto(seq(oid(OID.commonName), utf8(cn))));
  const algoritmo = seq(oid(OID.sha256WithRSA), nulo());
  const spki = chave.publicKey.export({ type: 'spki', format: 'der' });
  const tbs = seq(
    inteiro(1), // serialNumber
    algoritmo,
    nome, // issuer
    seq(utcTime(validoDesde), utcTime(validoAte)),
    nome, // subject
    spki,
  );
  const assinatura = sign('sha256', tbs, chave.privateKey);
  return seq(tbs, algoritmo, bitString(assinatura));
}

/* --------------------------------------------------------- PKCS#12 */

/** PBES2: PBKDF2-HMAC-SHA256 (senha em UTF-8) + AES-256-CBC. */
function cifrarPbes2(dados: Buffer, senha: string): { algoritmo: Buffer; cifrado: Buffer } {
  const sal = randomBytes(8);
  const iv = randomBytes(16);
  const iteracoes = 2048;
  const chave = pbkdf2Sync(Buffer.from(senha, 'utf8'), sal, iteracoes, 32, 'sha256');
  const cifra = createCipheriv('aes-256-cbc', chave, iv);
  const cifrado = Buffer.concat([cifra.update(dados), cifra.final()]);
  const algoritmo = seq(
    oid(OID.pbes2),
    seq(
      seq(
        oid(OID.pbkdf2),
        seq(octetos(sal), inteiro(iteracoes), seq(oid(OID.hmacWithSHA256), nulo())),
      ),
      seq(oid(OID.aes256Cbc), octetos(iv)),
    ),
  );
  return { algoritmo, cifrado };
}

export interface PfxDeTeste {
  pfx: Buffer;
  senha: string;
  /** O DER do certificado, para conferir a impressão digital lida pela `api`. */
  certificado: Buffer;
  /** SHA-256 do certificado como o `X509Certificate.fingerprint256` escreve: `AB:CD:…`. */
  impressaoDigital: string;
  /** `YYYY-MM-DD` do `notAfter`. */
  expiraEm: string;
}

/**
 * Gera chave + certificado autoassinado e embrulha os dois num `.pfx` com a
 * senha. `validoAte` em `YYYY-MM-DD` (até 2049, pelo UTCTime).
 */
export function gerarPfxDeTeste(opcoes: {
  senha: string;
  cn?: string;
  validoDesde?: string;
  validoAte?: string;
}): PfxDeTeste {
  const validoDesde = opcoes.validoDesde ?? '2020-01-01';
  const validoAte = opcoes.validoAte ?? '2035-01-01';
  const emUtcTime = (data: string) => `${data.slice(2).replaceAll('-', '')}000000Z`;

  const chave = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const certificado = certificadoAutoAssinado(
    chave,
    opcoes.cn ?? 'cliente.exemplo.com.br',
    emUtcTime(validoDesde),
    emUtcTime(validoAte),
  );

  // A chave: o EncryptedPrivateKeyInfo que o Node já sabe escrever.
  const chaveCifrada = chave.privateKey.export({
    type: 'pkcs8',
    format: 'der',
    cipher: 'aes-256-cbc',
    passphrase: opcoes.senha,
  });
  const sacoDaChave = seq(oid(OID.pkcs8ShroudedKeyBag), ctx0(chaveCifrada));
  const conteudoDaChave = seq(oid(OID.data), ctx0(octetos(seq(sacoDaChave))));

  // O certificado: certBag dentro de um encryptedData PBES2.
  const sacoDoCertificado = seq(
    oid(OID.certBag),
    ctx0(seq(oid(OID.x509Certificate), ctx0(octetos(certificado)))),
  );
  const { algoritmo, cifrado } = cifrarPbes2(seq(sacoDoCertificado), opcoes.senha);
  const conteudoDoCertificado = seq(
    oid(OID.encryptedData),
    ctx0(seq(inteiro(0), seq(oid(OID.data), algoritmo, tlv(0x80, cifrado)))),
  );

  const authenticatedSafe = seq(conteudoDaChave, conteudoDoCertificado);

  // O MAC: HMAC-SHA256 sobre o AuthenticatedSafe, chave pela derivação do PKCS#12 (id 3).
  const salDoMac = randomBytes(8);
  const iteracoesDoMac = 2048;
  const chaveDoMac = derivarChavePkcs12('sha256', opcoes.senha, salDoMac, iteracoesDoMac, 3, 32);
  const mac = createHmac('sha256', chaveDoMac).update(authenticatedSafe).digest();
  const macData = seq(
    seq(seq(oid(OID.sha256), nulo()), octetos(mac)),
    octetos(salDoMac),
    inteiro(iteracoesDoMac),
  );

  const pfx = seq(inteiro(3), seq(oid(OID.data), ctx0(octetos(authenticatedSafe))), macData);

  const impressaoDigital = createHash('sha256')
    .update(certificado)
    .digest('hex')
    .toUpperCase()
    .match(/.{2}/g)!
    .join(':');

  return { pfx, senha: opcoes.senha, certificado, impressaoDigital, expiraEm: validoAte };
}
