/**
 * Avaliação de atendimento por IA: recebe transcrição e formulário, devolve
 * resposta critério a critério com valor, pontos, justificativa e a mensagem que
 * serve de evidência.
 *
 * Tudo que o modelo devolve é conferido contra o formulário e contra a
 * transcrição antes de virar resultado: id de critério que não existe, rótulo de
 * evidência que não existe e critério não conforme sem evidência **falham**. É a
 * mesma disciplina que no case-sync validava a subcategoria contra a picklist —
 * lá, aceitar a resposta do modelo sem conferir produziu Cases em branco que
 * ninguém viu por meses.
 */

import { z } from 'zod';

import type { ChamadaEstruturada, Esforco } from '../cliente/cliente.js';
import { chamadaPadrao } from '../cliente/cliente.js';
import { ErroFormatoIa } from '../cliente/erros.js';
import { PROMPT_AVALIACAO } from '../prompts/avaliacao.js';
import { identificador } from '../prompts/tipos.js';
import type { Transcricao } from '../transcricao/transcricao.js';
import { calcularNota, fracaoDoValor } from './nota.js';
import type { Formulario, ResultadoAvaliacao, RespostaBruta } from './tipos.js';
import { criteriosDoFormulario } from './tipos.js';

const EsquemaAvaliacao = z.object({
  respostas: z.array(
    z.object({
      criterioId: z.string(),
      valor: z.string(),
      justificativa: z.string(),
      evidencia: z.string().nullable(),
    }),
  ),
  confianca: z.number().min(0).max(1),
});

export type SaidaAvaliacaoIa = z.infer<typeof EsquemaAvaliacao>;

export interface OpcoesAvaliacao {
  formulario: Formulario;
  transcricao: Transcricao;
  contexto?: string | null;
  modelo?: string;
  esforco?: Esforco;
  /** Dublê nos testes; na produção, a chamada real. */
  chamar?: ChamadaEstruturada;
}

/** Sobra folga para justificativa e evidência de cada critério. */
function tetoDeTokens(formulario: Formulario): number {
  const criterios = criteriosDoFormulario(formulario).length;
  return Math.min(32_000, 2_000 + criterios * 400);
}

/**
 * Resolve o rótulo citado (`m12`) para o `mensagem.id` correspondente. Rótulo
 * fora do índice da transcrição é alucinação e derruba a avaliação.
 */
export function resolverEvidencia(
  transcricao: Transcricao,
  criterioId: string,
  evidencia: string | null | undefined,
): string | null {
  const rotulo = evidencia?.trim();
  if (!rotulo) return null;
  const mensagemId = transcricao.indice[rotulo];
  if (!mensagemId) {
    throw new ErroFormatoIa(
      `Evidência "${rotulo}" do critério ${criterioId} não existe na transcrição.`,
      evidencia,
    );
  }
  return mensagemId;
}

export async function avaliarConversa(opcoes: OpcoesAvaliacao): Promise<ResultadoAvaliacao> {
  const { formulario, transcricao } = opcoes;
  const chamar = opcoes.chamar ?? chamadaPadrao;
  const texto = PROMPT_AVALIACAO.montar({
    transcricao: transcricao.texto,
    truncada: transcricao.truncada,
    mensagensOmitidas: transcricao.mensagensOmitidas,
    formulario,
    contexto: opcoes.contexto,
  });

  const { dados, consumo, modelo } = await chamar({
    sistema: texto.sistema,
    usuario: texto.usuario,
    esquema: EsquemaAvaliacao,
    funcionalidade: 'avaliacao',
    modelo: opcoes.modelo,
    esforco: opcoes.esforco ?? 'medium',
    maxTokens: tetoDeTokens(formulario),
  });

  const porId = new Map(
    criteriosDoFormulario(formulario).map(({ criterio }) => [criterio.id, criterio]),
  );
  const enriquecidas: (RespostaBruta & { evidenciaMensagemId: string | null })[] = [];
  const vistos = new Set<string>();

  for (const resposta of dados.respostas) {
    const criterio = porId.get(resposta.criterioId);
    if (!criterio) {
      throw new ErroFormatoIa(
        `O modelo respondeu o critério "${resposta.criterioId}", que não existe no formulário "${formulario.nome}".`,
        dados,
      );
    }
    if (vistos.has(criterio.id)) {
      throw new ErroFormatoIa(`O critério "${criterio.id}" foi respondido duas vezes.`, dados);
    }
    vistos.add(criterio.id);

    const evidenciaMensagemId = resolverEvidencia(transcricao, criterio.id, resposta.evidencia);
    const fracao = fracaoDoValor(criterio, resposta.valor);
    if (fracao !== null && fracao < 1 && !evidenciaMensagemId) {
      throw new ErroFormatoIa(
        `O critério "${criterio.nome}" (${criterio.id}) não saiu conforme e veio sem evidência. ` +
          'Evidência é obrigatória para o atendente poder contestar.',
        dados,
      );
    }

    enriquecidas.push({ ...resposta, evidenciaMensagemId });
  }

  const calculada = calcularNota(formulario, enriquecidas);

  return {
    formularioId: formulario.id,
    nota: calculada.nota,
    notaAntesDoFatal: calculada.notaAntesDoFatal,
    fataisReprovados: calculada.fataisReprovados,
    respostas: calculada.respostas,
    confianca: dados.confianca,
    consumo,
    modelo,
    prompt: identificador(PROMPT_AVALIACAO),
  };
}
