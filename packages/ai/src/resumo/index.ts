/**
 * Resumo de atendimento. Duas saídas distintas, porque são dois leitores
 * diferentes: quem vai assumir a conversa agora e quem vai ler a linha do tempo
 * do lead daqui a meses.
 */

import { z } from 'zod';

import type { ChamadaEstruturada, Esforco } from '../cliente/cliente.js';
import { chamadaPadrao } from '../cliente/cliente.js';
import type { Consumo } from '../consumo/index.js';
import { PROMPT_RESUMO_ABERTURA, PROMPT_RESUMO_ENCERRAMENTO } from '../prompts/resumo.js';
import type { EntradaResumo } from '../prompts/resumo.js';
import type { Prompt } from '../prompts/tipos.js';
import { identificador } from '../prompts/tipos.js';
import type { Transcricao } from '../transcricao/transcricao.js';

const EsquemaResumo = z.object({
  resumo: z.string().min(1),
});

export interface OpcoesResumo {
  transcricao: Transcricao;
  /** Fila, produto, campanha — o que ajude a situar a conversa. */
  contexto?: string | null;
  maxPalavras?: number;
  modelo?: string;
  esforco?: Esforco;
  chamar?: ChamadaEstruturada;
}

export interface ResultadoResumo {
  resumo: string;
  consumo: Consumo;
  modelo: string;
  /** `resumo-encerramento@v1` — qual prompt produziu este texto. */
  prompt: string;
}

async function resumirCom(
  prompt: Prompt<EntradaResumo>,
  funcionalidade: string,
  opcoes: OpcoesResumo,
): Promise<ResultadoResumo> {
  const chamar = opcoes.chamar ?? chamadaPadrao;
  const texto = prompt.montar({
    transcricao: opcoes.transcricao.texto,
    truncada: opcoes.transcricao.truncada,
    mensagensOmitidas: opcoes.transcricao.mensagensOmitidas,
    maxPalavras: opcoes.maxPalavras,
    contexto: opcoes.contexto,
  });

  const { dados, consumo, modelo } = await chamar({
    sistema: texto.sistema,
    usuario: texto.usuario,
    esquema: EsquemaResumo,
    funcionalidade,
    modelo: opcoes.modelo,
    esforco: opcoes.esforco,
    maxTokens: 2_000,
  });

  return { resumo: dados.resumo.trim(), consumo, modelo, prompt: identificador(prompt) };
}

/** O que aconteceu antes, para o atendente que está assumindo a conversa. */
export function resumirAbertura(opcoes: OpcoesResumo): Promise<ResultadoResumo> {
  return resumirCom(PROMPT_RESUMO_ABERTURA, 'resumo_abertura', opcoes);
}

/** O que aconteceu agora, para subir na linha do tempo do lead. */
export function resumirEncerramento(opcoes: OpcoesResumo): Promise<ResultadoResumo> {
  return resumirCom(PROMPT_RESUMO_ENCERRAMENTO, 'resumo_encerramento', opcoes);
}
