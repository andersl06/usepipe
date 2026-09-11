/**
 * Ler e escrever CSV, com o comportamento do `CSV.new(io, headers: true)` do Ruby
 * que o `DataImportJob` do Chatwoot usa (ver `importacao-de-contatos.ts`):
 *
 * - campo entre aspas pode ter separador e quebra de linha; `""` é uma aspa;
 * - aspas malformadas são ERRO (`CsvMalformado`, o `CSV::MalformedCSVError` de
 *   lá), e a importação inteira falha em vez de importar meia linha errada;
 * - o BOM do UTF-8 do começo sai (`delete_prefix("\xEF\xBB\xBF")`).
 *
 * Escrito aqui, e não trazido de biblioteca, porque não há leitor de CSV no
 * monorepo e são quarenta linhas — uma dependência nova mexeria no lockfile que
 * três frentes compartilham.
 *
 * Acréscimos do Pipe ao comportamento do Ruby:
 * - o separador é detectado na linha de cabeçalho (`;` ou `,`): o Excel em
 *   português salva com ponto e vírgula, e o Chatwoot só aceita vírgula;
 * - linha inteira em branco é pulada, em vez de virar contato vazio.
 */

export class CsvMalformado extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'CsvMalformado';
  }
}

export interface TabelaCsv {
  cabecalhos: string[];
  linhas: string[][];
}

function detectarSeparador(texto: string): ',' | ';' {
  const fim = texto.search(/\r|\n/);
  const primeira = fim < 0 ? texto : texto.slice(0, fim);
  const pontoEVirgula = primeira.split(';').length;
  const virgula = primeira.split(',').length;
  return pontoEVirgula > virgula ? ';' : ',';
}

export function lerCsv(bruto: string): TabelaCsv {
  const texto = bruto.startsWith('﻿') ? bruto.slice(1) : bruto;
  const separador = detectarSeparador(texto);

  const registros: string[][] = [];
  let registro: string[] = [];
  let campo = '';
  let entreAspas = false;
  let linha = 1;

  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i]!;
    if (entreAspas) {
      if (c !== '"') {
        if (c === '\n') linha += 1;
        campo += c;
        continue;
      }
      if (texto[i + 1] === '"') {
        campo += '"';
        i += 1;
        continue;
      }
      entreAspas = false;
      const proximo = texto[i + 1];
      if (proximo !== undefined && proximo !== separador && proximo !== '\n' && proximo !== '\r') {
        throw new CsvMalformado(`Aspas malformadas na linha ${linha}.`);
      }
      continue;
    }

    if (c === '"') {
      if (campo !== '') throw new CsvMalformado(`Aspas no meio de um campo na linha ${linha}.`);
      entreAspas = true;
    } else if (c === separador) {
      registro.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      registro.push(campo);
      registros.push(registro);
      registro = [];
      campo = '';
      if (c === '\r' && texto[i + 1] === '\n') i += 1;
      linha += 1;
    } else {
      campo += c;
    }
  }
  if (entreAspas) throw new CsvMalformado(`Aspas sem fechamento a partir da linha ${linha}.`);
  if (campo !== '' || registro.length > 0) {
    registro.push(campo);
    registros.push(registro);
  }

  const cheios = registros.filter((r) => r.some((valor) => valor.trim() !== ''));
  const [cabecalhos = [], ...linhas] = cheios;
  return { cabecalhos, linhas };
}

/** `CSV.generate`: aspas só onde precisa. Vírgula como separador, como o original. */
export function escreverCsv(registros: readonly (readonly string[])[]): string {
  const campo = (valor: string) =>
    /[",\r\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
  return registros.map((r) => r.map(campo).join(',')).join('\n') + '\n';
}
