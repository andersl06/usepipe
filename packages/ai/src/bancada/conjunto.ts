/**
 * Leitura do conjunto de referência a partir de JSON, validada.
 *
 * Conjunto malformado falha aqui, alto e cedo. Bancada que roda com dado torto
 * devolve número bonito e mentiroso — que é pior do que não medir.
 */

import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { ErroFormatoIa } from '../cliente/erros.js';
import type { CasoReferencia } from './bancada.js';

const EsquemaAnexo = z.object({
  nomeArquivo: z.string().nullish(),
  duracaoSeg: z.number().nullish(),
  transcricao: z.string().nullish(),
});

const EsquemaMensagem = z.object({
  id: z.string(),
  criadaEm: z.string(),
  direcao: z.enum(['entrada', 'saida', 'interna']),
  autorTipo: z.enum(['contato', 'atendente', 'bot', 'sistema']),
  autorNome: z.string().nullish(),
  tipo: z.enum(['texto', 'imagem', 'audio', 'video', 'documento', 'localizacao', 'template']),
  conteudo: z.string().nullish(),
  anexo: EsquemaAnexo.nullish(),
});

const EsquemaCriterio = z.object({
  id: z.string(),
  nome: z.string(),
  descricao: z.string().nullish(),
  peso: z.number(),
  tipo: z.enum(['conforme', 'escala', 'nota']),
  fatal: z.boolean(),
});

const EsquemaFormulario = z.object({
  id: z.string(),
  nome: z.string(),
  notaMaxima: z.number(),
  grupos: z
    .array(
      z.object({
        id: z.string(),
        nome: z.string(),
        peso: z.number(),
        criterios: z.array(EsquemaCriterio).min(1),
      }),
    )
    .min(1),
});

const EsquemaCaso = z.object({
  id: z.string(),
  descricao: z.string().optional(),
  contexto: z.string().nullish(),
  mensagens: z.array(EsquemaMensagem).min(1),
  formulario: EsquemaFormulario,
  gabarito: z.array(z.object({ criterioId: z.string(), valor: z.string() })).min(1),
});

const EsquemaConjunto = z.object({
  nome: z.string().optional(),
  casos: z.array(EsquemaCaso).min(1),
});

/** Valida o JSON e converte os carimbos de tempo em `Date`. */
export function carregarConjunto(bruto: unknown): CasoReferencia[] {
  const lido = EsquemaConjunto.safeParse(bruto);
  if (!lido.success) {
    throw new ErroFormatoIa(`Conjunto de referência inválido: ${lido.error.message}`, bruto);
  }

  return lido.data.casos.map((caso) => {
    const idsDoFormulario = new Set(
      caso.formulario.grupos.flatMap((g) => g.criterios.map((c) => c.id)),
    );
    for (const item of caso.gabarito) {
      if (!idsDoFormulario.has(item.criterioId)) {
        throw new ErroFormatoIa(
          `Caso "${caso.id}": o gabarito cita o critério "${item.criterioId}", que não existe no formulário.`,
          caso.gabarito,
        );
      }
    }
    if (caso.gabarito.length !== idsDoFormulario.size) {
      throw new ErroFormatoIa(
        `Caso "${caso.id}": o gabarito tem ${caso.gabarito.length} respostas para ${idsDoFormulario.size} critérios. Gabarito incompleto não mede nada.`,
        caso.gabarito,
      );
    }

    return {
      ...caso,
      mensagens: caso.mensagens.map((m) => ({ ...m, criadaEm: new Date(m.criadaEm) })),
    } as CasoReferencia;
  });
}

export async function lerConjunto(caminho: string): Promise<CasoReferencia[]> {
  return carregarConjunto(JSON.parse(await readFile(caminho, 'utf8')));
}
