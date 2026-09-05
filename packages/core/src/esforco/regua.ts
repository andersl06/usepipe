/**
 * Régua determinística de esforço de atendimento.
 *
 * Origem: Anexo B do `Relatorio_Capacidade_Capital_Escola_90dias.docx`, já
 * validado em produção e coletado por `~/digisac-esforco`. Repetida em
 * `2026-09-05-pipe-design.md` §4.4. Não é classificação por IA: é conta.
 *
 * B.1 — esforço por conversa (em segundos):
 *  - caracteres escritos pelo atendente ÷ 200 por minuto (digitação)
 *  - caracteres recebidos do cliente ÷ 1.000 por minuto (leitura)
 *  - duração dos áudios recebidos (escuta em 1×)
 *  - duração dos áudios gravados (fala)
 *  - áudio sem metadado de duração: estimado pelo tamanho, Opus ~16 kbps → 2 KB/s
 *
 * Ressalva do relatório original, que o produto precisa expor: a régua assume
 * texto digitado à mão. Por isso o conteúdo vindo de resposta pronta sai do
 * esforço e vai para coluna separada.
 */

import { MINUTO } from '../comum/tempo.js';

/** Caracteres por minuto digitados pelo atendente. */
export const CARACTERES_POR_MINUTO_ESCRITA = 200;

/** Caracteres por minuto lidos pelo atendente. */
export const CARACTERES_POR_MINUTO_LEITURA = 1000;

/**
 * Bytes por segundo de áudio Opus a ~16 kbps.
 * 16.000 bits/s ÷ 8 = 2.000 bytes/s. O "2 KB/s" do relatório é decimal, não 2 KiB.
 */
export const BYTES_POR_SEGUNDO_AUDIO = 2000;

export type AutorMensagem = 'contato' | 'atendente' | 'bot' | 'sistema';
export type DirecaoMensagem = 'entrada' | 'saida' | 'interna';
export type TipoMensagem =
  | 'texto'
  | 'imagem'
  | 'audio'
  | 'video'
  | 'documento'
  | 'localizacao'
  | 'template';

export interface AnexoEsforco {
  /** Duração em segundos vinda do metadado do provedor. `null` quando não veio. */
  duracaoSeg?: number | null;
  /** Tamanho do arquivo, usado para estimar duração quando falta metadado. */
  bytes?: number | null;
}

export interface MensagemEsforco {
  conversaId: string;
  em: Date;
  autor: AutorMensagem;
  direcao: DirecaoMensagem;
  tipo: TipoMensagem;
  /** Texto efetivamente trafegado. */
  conteudo?: string | null;
  /** Atendente responsável pela mensagem (mensagem de bot não tem). */
  usuarioId?: string | null;
  /** Preenchido quando o corpo veio de resposta pronta — não foi digitado à mão. */
  respostaProntaId?: string | null;
  anexo?: AnexoEsforco | null;
}

/** Espelha `esforco_conversa` do modelo de dados (§4). */
export interface EsforcoConversa {
  conversaId: string;
  atendenteId: string | null;
  /** Caracteres digitados à mão pelo atendente (já sem resposta pronta). */
  charsEscritos: number;
  /** Caracteres do cliente lidos pelo atendente. */
  charsLidos: number;
  audioOuvidoSeg: number;
  audioGravadoSeg: number;
  /** Caracteres que vieram de resposta pronta — coluna separada, fora do esforço. */
  charsDeRespostaPronta: number;
  /** Esforço total em segundos, sem o que veio de resposta pronta. */
  esforcoSeg: number;
  /** O que a resposta pronta acrescentaria se fosse contada como digitação. */
  esforcoRespostaProntaSeg: number;
  /** Áudios que entraram com duração zero por falta de metadado e de tamanho. */
  audiosSemMetadado: number;
}

/** Segundos de digitação para uma quantidade de caracteres. */
export function segundosDeEscrita(caracteres: number): number {
  return (caracteres * MINUTO) / CARACTERES_POR_MINUTO_ESCRITA;
}

/** Segundos de leitura para uma quantidade de caracteres. */
export function segundosDeLeitura(caracteres: number): number {
  return (caracteres * MINUTO) / CARACTERES_POR_MINUTO_LEITURA;
}

/**
 * Duração de um áudio: metadado quando existe, estimativa por tamanho quando não.
 * Sem nenhum dos dois, devolve `null` — a régua não inventa duração.
 */
export function duracaoDeAudio(anexo: AnexoEsforco | null | undefined): number | null {
  if (!anexo) return null;
  if (typeof anexo.duracaoSeg === 'number' && anexo.duracaoSeg >= 0) return anexo.duracaoSeg;
  if (typeof anexo.bytes === 'number' && anexo.bytes > 0) return anexo.bytes / BYTES_POR_SEGUNDO_AUDIO;
  return null;
}

/** Conta caracteres de um texto. `null`/vazio conta zero. */
export function contarCaracteres(texto: string | null | undefined): number {
  return texto ? texto.length : 0;
}

/**
 * Aplica a régua sobre as mensagens de uma conversa.
 *
 * Decisões onde a spec não é literal:
 * - nota interna (`direcao: 'interna'`) escrita pelo atendente **conta** como
 *   digitação: o atendente digitou;
 * - mensagem de bot ou de sistema não gera esforço nenhum — nem de escrita, nem
 *   de leitura, porque ninguém a digitou nem precisou lê-la para atender;
 * - o atendente não "ouve" o próprio áudio: áudio de saída é fala, não escuta.
 */
export function calcularEsforcoConversa(
  mensagens: readonly MensagemEsforco[],
  opcoes: { conversaId?: string; atendenteId?: string | null } = {},
): EsforcoConversa {
  let charsEscritos = 0;
  let charsLidos = 0;
  let charsDeRespostaPronta = 0;
  let audioOuvidoSeg = 0;
  let audioGravadoSeg = 0;
  let audiosSemMetadado = 0;
  let atendenteId: string | null = opcoes.atendenteId ?? null;

  for (const mensagem of mensagens) {
    if (mensagem.autor === 'atendente' && !atendenteId && mensagem.usuarioId) {
      atendenteId = mensagem.usuarioId;
    }

    if (mensagem.autor === 'atendente') {
      if (mensagem.tipo === 'audio') {
        const duracao = duracaoDeAudio(mensagem.anexo);
        if (duracao === null) audiosSemMetadado += 1;
        else audioGravadoSeg += duracao;
      } else {
        const caracteres = contarCaracteres(mensagem.conteudo);
        // Resposta pronta e template não foram digitados à mão: saem do esforço
        // e vão para a coluna separada, como manda a ressalva do relatório.
        const veioPronto = !!mensagem.respostaProntaId || mensagem.tipo === 'template';
        if (veioPronto) charsDeRespostaPronta += caracteres;
        else charsEscritos += caracteres;
      }
      continue;
    }

    if (mensagem.autor === 'contato') {
      if (mensagem.tipo === 'audio') {
        const duracao = duracaoDeAudio(mensagem.anexo);
        if (duracao === null) audiosSemMetadado += 1;
        else audioOuvidoSeg += duracao;
      } else {
        charsLidos += contarCaracteres(mensagem.conteudo);
      }
      continue;
    }
    // bot e sistema: fora da régua.
  }

  const esforcoSeg =
    segundosDeEscrita(charsEscritos) +
    segundosDeLeitura(charsLidos) +
    audioOuvidoSeg +
    audioGravadoSeg;

  return {
    conversaId: opcoes.conversaId ?? mensagens[0]?.conversaId ?? '',
    atendenteId,
    charsEscritos,
    charsLidos,
    audioOuvidoSeg,
    audioGravadoSeg,
    charsDeRespostaPronta,
    esforcoSeg,
    esforcoRespostaProntaSeg: segundosDeEscrita(charsDeRespostaPronta),
    audiosSemMetadado,
  };
}

/** Agrupa mensagens por conversa e aplica a régua em cada uma. */
export function calcularEsforcoPorConversa(
  mensagens: readonly MensagemEsforco[],
): EsforcoConversa[] {
  const grupos = new Map<string, MensagemEsforco[]>();
  for (const mensagem of mensagens) {
    const atual = grupos.get(mensagem.conversaId);
    if (atual) atual.push(mensagem);
    else grupos.set(mensagem.conversaId, [mensagem]);
  }
  return [...grupos.keys()]
    .sort()
    .map((conversaId) =>
      calcularEsforcoConversa(grupos.get(conversaId) as MensagemEsforco[], { conversaId }),
    );
}
