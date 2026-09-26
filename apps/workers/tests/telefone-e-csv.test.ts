import { describe, expect, it } from 'vitest';
import { NormalizadorBrasil, candidatosDoTelefone, paraE164 } from '@pipe/core';
import { CsvMalformado, escreverCsv, lerCsv } from '../src/csv.js';
import { keyOfColumn } from '../src/import-of-contacts.js';

/**
 * Test Chatwoot-ported phone normalization and CSV reading without a database. Brazilian cases come from `brazil_phone_normalizer_spec.rb` and `phone_number_normalization_service_spec.rb`.
 */

describe('nono dígito do Brasil (brazil_phone_normalizer)', () => {
  const br = new NormalizadorBrasil();

  it('Leave incomplete phone numbers unchanged', () => {
    expect(br.contactCandidatos('55')).toEqual(['55']);
  });

  it('celular antigo de oito dígitos ganha o 9', () => {
    expect(br.normalizar('554188887777')).toBe('5541988887777');
  });

  it('fixo (começa com 2 a 5) não ganha o 9', () => {
    expect(br.normalizar('554132345678')).toBe('554132345678');
  });

  it('Return both mobile number variants with the canonical form first', () => {
    expect(br.variantes('5541988887777')).toEqual(['5541988887777', '554188887777']);
    expect(br.variantes('554188887777')).toEqual(['5541988887777', '554188887777']);
  });

  it('não tira o 9 quando o que sobra seria um fixo', () => {
    expect(br.variantes('5541932345678')).toEqual(['5541932345678']);
  });

  it('país sem normalizador devolve só a própria forma', () => {
    expect(candidatosDoTelefone('447700900123')).toEqual(['447700900123']);
  });
});

describe('Normalize human-entered Brazilian phone numbers to E.164', () => {
  const casos: [string | null, string | null][] = [
    ['(11) 8888-7777', '+5511988887777'],
    ['11 98765-4321', '+5511987654321'],
    ['011 98765-4321', '+5511987654321'],
    ['+55 11 3232-4545', '+551132324545'],
    ['5511988887777', '+5511988887777'],
    ['+1 (234) 567-8900', '+12345678900'],
    ['  ', null],
    [null, null],
  ];
  for (const [inbound, saida] of casos) {
    it(`${JSON.stringify(inbound)} → ${String(saida)}`, () => {
      expect(paraE164(inbound)).toBe(saida);
    });
  }
});

describe('leitor de CSV', () => {
  it('aspas protegem vírgula e quebra de linha; "" é uma aspa', () => {
    const tabela = lerCsv('nome,obs\n"Silva, Ana","disse ""oi""\nem duas linhas"\n');
    expect(tabela.cabecalhos).toEqual(['nome', 'obs']);
    expect(tabela.linhas).toEqual([['Silva, Ana', 'disse "oi"\nem duas linhas']]);
  });

  it('detecta ponto e vírgula, que é como o Excel em português salva', () => {
    expect(lerCsv('nome;telefone\r\nAna;11 9888-7777\r\n').linhas).toEqual([['Ana', '11 9888-7777']]);
  });

  it('tira o BOM e pula linha em branco', () => {
    expect(lerCsv('﻿nome\n\nAna\n\n').linhas).toEqual([['Ana']]);
  });

  it('Reject malformed CSV quoting with `CSV::MalformedCSVError`', () => {
    expect(() => lerCsv('a,b\n1,"Clarice,"missing,2\n')).toThrow(CsvMalformado);
    expect(() => lerCsv('a\n"sem fechar\n')).toThrow(CsvMalformado);
    expect(() => lerCsv('a\nmeio"de campo\n')).toThrow(CsvMalformado);
  });

  it('escreve e relê o mesmo conteúdo', () => {
    const registros = [
      ['nome', 'erros'],
      ['Silva, Ana', 'Telefone deve estar no formato e164'],
      ['Diz "oi"', 'E-mail inválido'],
    ];
    const relido = lerCsv(escreverCsv(registros));
    expect([relido.cabecalhos, ...relido.linhas]).toEqual(registros);
  });
});

describe('cabeçalhos em português', () => {
  it('viram as colunas que o porte reconhece', () => {
    expect(keyOfColumn(' Telefone ')).toBe('phone_number');
    expect(keyOfColumn('Celular')).toBe('phone_number');
    expect(keyOfColumn('E-mail')).toBe('email');
    expect(keyOfColumn('Nome')).toBe('name');
    expect(keyOfColumn('plano')).toBe('plano');
  });
});
