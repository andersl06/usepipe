import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * Redação recursiva de documentos jsonb antes de virarem fixture committada.
 *
 * Regra: qualquer valor sob uma CHAVE que pareça segredo vira `"REDACTED"`,
 * independente do formato. Fora disso, string que parece e-mail ou telefone
 * também é trocada — mesmo sem a chave dar pista (campo `contato.atributos`
 * livre por tenant pode guardar e-mail sob qualquer nome). Nunca redige a
 * própria CHAVE: o que o `jsonb-keys` verifica é justamente o nome dela.
 */

const PADRAO_CHAVE_SEGREDO =
  /token|secret|segredo|senha|password|chave|key|authorization|cookie|certificado|pfx/i;
const PADRAO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** E.164 e afins: opcional `+`, 8 a 15 dígitos, nada mais (não pega uuid nem id numérico curto). */
const PADRAO_TELEFONE = /^\+?\d{8,15}$/;

export function redigir(valor: unknown): unknown {
  let proximoEmail = 0;
  let proximoTelefone = 0;

  function andar(v: unknown, chaveSegredo: boolean): unknown {
    if (chaveSegredo) {
      // A chave já denuncia segredo: qualquer valor escalar vira REDACTED. Objeto/array
      // sob uma chave assim (ex.: `credenciais: {...}`) também é substituído inteiro.
      if (v === null || v === undefined) return v;
      return 'REDACTED';
    }
    if (typeof v === 'string') {
      if (PADRAO_EMAIL.test(v)) return `user${++proximoEmail}@example.com`;
      if (PADRAO_TELEFONE.test(v)) return `+5500000000${++proximoTelefone}`;
      return v;
    }
    if (Array.isArray(v)) return v.map((item) => andar(item, false));
    if (v && typeof v === 'object') {
      const saida: Record<string, unknown> = {};
      for (const [chave, filho] of Object.entries(v as Record<string, unknown>)) {
        saida[chave] = andar(filho, PADRAO_CHAVE_SEGREDO.test(chave));
      }
      return saida;
    }
    return v;
  }

  return andar(valor, false);
}

/**
 * Uso como CLI pelo `dump-jsonb-fixtures.sh`: lê um array de registros do stdin
 * (`[{id, value}, ...]` ou `[{id, antes, depois}, ...]`, etc.) e redige todo
 * campo que não seja `id`, escrevendo o array redigido no stdout.
 */
function ehChamadaDireta(): boolean {
  const argv1 = process.argv[1];
  return !!argv1 && import.meta.url === pathToFileURL(argv1).href;
}

if (ehChamadaDireta()) {
  const bruto = readFileSync(0, 'utf8').trim();
  const registros = (bruto ? JSON.parse(bruto) : []) as Record<string, unknown>[];
  const saida = registros.map((registro) => {
    const copia: Record<string, unknown> = {};
    for (const [chave, valor] of Object.entries(registro)) {
      copia[chave] = chave === 'id' ? valor : redigir(valor);
    }
    return copia;
  });
  process.stdout.write(`${JSON.stringify(saida, null, 2)}\n`);
}
