/**
 * Reads and validates the JSON reference set. Malformed cases fail early and visibly: running the bench on bad data would return attractive but false numbers, worse than not measuring.
 */

import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { FormatIaError } from '../cliente/errors.js';
import type { CasoReferencia } from './bancada.js';

const EsquemaAttachment = z.object({
  nomeArquivo: z.string().nullish(),
  duracaoSeg: z.number().nullish(),
  transcricao: z.string().nullish(),
});

const EsquemaMessage = z.object({
  id: z.string(),
  criadaEm: z.string(),
  direcao: z.enum(['entrada', 'saida', 'interna']),
  autorTipo: z.enum(['contato', 'atendente', 'bot', 'sistema']),
  autorNome: z.string().nullish(),
  tipo: z.enum(['texto', 'imagem', 'audio', 'video', 'documento', 'localizacao', 'template']),
  conteudo: z.string().nullish(),
  anexo: EsquemaAttachment.nullish(),
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
  mensagens: z.array(EsquemaMessage).min(1),
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
    throw new FormatIaError(`Conjunto de referência inválido: ${lido.error.message}`, bruto);
  }

  return lido.data.casos.map((caso) => {
    const idsDoFormulario = new Set(
      caso.formulario.grupos.flatMap((g) => g.criterios.map((c) => c.id)),
    );
    for (const item of caso.gabarito) {
      if (!idsDoFormulario.has(item.criterioId)) {
        throw new FormatIaError(
          `Caso "${caso.id}": o gabarito cita o critério "${item.criterioId}", que não existe no formulário.`,
          caso.gabarito,
        );
      }
    }
    if (caso.gabarito.length !== idsDoFormulario.size) {
      throw new FormatIaError(
        `Caso "${caso.id}": o gabarito tem ${caso.gabarito.length} respostas para ${idsDoFormulario.size} critérios. Gabarito incompleto não mede nada.`,
        caso.gabarito,
      );
    }

    return {
      id: caso.id,
      description: caso.descricao,
      context: caso.contexto,
      messages: caso.mensagens.map((m) => ({
        id: m.id,
        criadaEm: new Date(m.criadaEm),
        direction: m.direcao,
        autorTipo: m.autorTipo,
        autorNome: m.autorNome,
        tipo: m.tipo,
        conteudo: m.conteudo,
        attachment: m.anexo
          ? {
              nameFile: m.anexo.nomeArquivo,
              durationSeg: m.anexo.duracaoSeg,
              transcription: m.anexo.transcricao,
            }
          : m.anexo,
      })),
      formulario: {
        id: caso.formulario.id,
        nome: caso.formulario.nome,
        notaMaxima: caso.formulario.notaMaxima,
        groups: caso.formulario.grupos.map((grupo) => ({
          id: grupo.id,
          nome: grupo.nome,
          peso: grupo.peso,
          criterios: grupo.criterios.map((criterio) => ({
            id: criterio.id,
            nome: criterio.nome,
            description: criterio.descricao,
            peso: criterio.peso,
            tipo: criterio.tipo,
            fatal: criterio.fatal,
          })),
        })),
      },
      gabarito: caso.gabarito.map((g) => ({ criterioId: g.criterioId, value: g.valor })),
    } as CasoReferencia;
  });
}

export async function lerConjunto(caminho: string): Promise<CasoReferencia[]> {
  return carregarConjunto(JSON.parse(await readFile(caminho, 'utf8')));
}
