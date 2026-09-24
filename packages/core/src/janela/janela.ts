/**
 * Janela de atendimento de 24 horas do WhatsApp.
 *
 * `2026-09-05-pipe-design.md` §4.3: conceito de primeira classe, não detalhe de
 * integração. Governa a tela (texto livre × seletor de template), o custo
 * (categoria de cobrança por mensagem) e o relatório (a janela conta a partir do
 * envio, não pelo dia do calendário).
 *
 * Regras levantadas em `referencias-blip/pesquisa/regras-blip.md` §1.1:
 * - 24 horas corridas a partir da **última mensagem do cliente**;
 * - fora dela, só template pré-aprovado pela Meta;
 * - qualquer mensagem nova do cliente reabre a janela.
 *
 * Preço não entra aqui: a tabela da Meta muda com frequência e é configuração
 * por categoria, nunca constante de código.
 */

import { HORA } from '../comum/tempo.js';

export const JANELA_HORAS = 24;
export const JANELA_SEG = JANELA_HORAS * HORA;

export type TipoCanal = 'whatsapp_cloud' | 'email' | 'widget';

export type CategoriaTemplate = 'utilidade' | 'marketing' | 'autenticacao';

/** `mensagem.categoria_cobranca` do modelo de dados (§3). */
export type CategoriaCobranca = 'livre' | CategoriaTemplate;

/** O que o Desk pode oferecer ao atendente neste instante. */
export type ModoDeEnvio = 'texto_livre' | 'somente_template';

export interface EstadoJanela {
  /** `conversa.janela_expira_em`. `null` = canal sem janela. */
  expiraEm: Date | null;
  /** `conversa.janela_aberta_por_mensagem_id`. */
  abertaPorMensagemId?: string | null;
}

/**
 * Expiração a partir da última mensagem do contato.
 * `null` de entrada devolve `null` — sem mensagem do cliente não há janela.
 */
export function calcularExpiracao(ultimaMensagemDoContatoEm: Date | null): Date | null {
  if (!ultimaMensagemDoContatoEm) return null;
  return new Date(ultimaMensagemDoContatoEm.getTime() + JANELA_SEG * 1000);
}

/** Recalcula a janela a cada mensagem de entrada do contato. */
export function registrarMensagemDoContato(em: Date, mensagemId?: string): EstadoJanela {
  const estado: EstadoJanela = { expiraEm: calcularExpiracao(em) };
  if (mensagemId) estado.abertaPorMensagemId = mensagemId;
  return estado;
}

/**
 * A janela está aberta?
 *
 * Comparação **estrita**: no exato instante da expiração a janela já está
 * fechada. Empatar a favor do envio é o jeito de tomar erro da Meta depois do
 * envio, que é justamente o que a tela deve evitar.
 */
export function janelaAberta(expiraEm: Date | null | undefined, agora: Date): boolean {
  if (!expiraEm) return false;
  return agora.getTime() < expiraEm.getTime();
}

/** Segundos restantes da janela. Zero quando fechada ou inexistente. */
export function segundosRestantes(expiraEm: Date | null | undefined, agora: Date): number {
  if (!expiraEm) return 0;
  return Math.max(0, (expiraEm.getTime() - agora.getTime()) / 1000);
}

/** Conversa perto de expirar — a que a lista do Desk destaca. */
export function pertoDeExpirar(
  expiraEm: Date | null | undefined,
  agora: Date,
  limiarSeg = HORA,
): boolean {
  if (!janelaAberta(expiraEm, agora)) return false;
  return segundosRestantes(expiraEm, agora) <= limiarSeg;
}

export interface ConsultaEnvio {
  canal: TipoCanal;
  expiraEm: Date | null;
  agora: Date;
  /** O que o atendente quer mandar. */
  conteudo: 'texto_livre' | 'template';
  /** Obrigatória quando `conteudo` é `template`. */
  categoriaTemplate?: CategoriaTemplate | null;
}

export type MotivoBloqueio = 'janela_fechada' | 'template_sem_categoria';

export interface AvaliacaoEnvio {
  permitido: boolean;
  /** O que a tela deve oferecer agora. */
  modo: ModoDeEnvio;
  motivo: MotivoBloqueio | null;
  restanteSeg: number;
  /** Como a mensagem entra no relatório de custo, se for enviada. */
  categoriaCobranca: CategoriaCobranca | null;
  dentroDaJanela: boolean;
}

/**
 * E-mail e widget não têm janela: `janela_expira_em` fica nulo, a regra é do
 * canal e a tela é a mesma.
 */
export function canalTemJanela(canal: TipoCanal): boolean {
  return canal === 'whatsapp_cloud';
}

/**
 * Classificação de custo de uma mensagem de saída.
 *
 * Template sempre cobra pela própria categoria, inclusive dentro da janela —
 * quem define isso é a Meta, não nós. Texto livre dentro da janela é `livre`.
 */
export function classificarCusto(entrada: {
  conteudo: 'texto_livre' | 'template';
  dentroDaJanela: boolean;
  categoriaTemplate?: CategoriaTemplate | null;
}): CategoriaCobranca | null {
  if (entrada.conteudo === 'template') return entrada.categoriaTemplate ?? null;
  return entrada.dentroDaJanela ? 'livre' : null;
}

/**
 * Decide se o envio é permitido, o que a tela deve mostrar e como o custo entra.
 *
 * Fora da janela, o campo de texto livre é substituído pelo seletor de template
 * **com o motivo escrito** — não um erro depois do envio.
 */
export function avaliarEnvio(consulta: ConsultaEnvio): AvaliacaoEnvio {
  const temJanela = canalTemJanela(consulta.canal);
  const dentroDaJanela = temJanela ? janelaAberta(consulta.expiraEm, consulta.agora) : true;
  const restanteSeg = temJanela ? segundosRestantes(consulta.expiraEm, consulta.agora) : 0;
  const modo: ModoDeEnvio = dentroDaJanela ? 'texto_livre' : 'somente_template';

  if (consulta.conteudo === 'template') {
    const categoria = consulta.categoriaTemplate ?? null;
    if (temJanela && !categoria) {
      return {
        permitido: false,
        modo,
        motivo: 'template_sem_categoria',
        restanteSeg,
        categoriaCobranca: null,
        dentroDaJanela,
      };
    }
    return {
      permitido: true,
      modo,
      motivo: null,
      restanteSeg,
      categoriaCobranca: classificarCusto({
        conteudo: 'template',
        dentroDaJanela,
        categoriaTemplate: categoria,
      }),
      dentroDaJanela,
    };
  }

  if (!dentroDaJanela) {
    return {
      permitido: false,
      modo,
      motivo: 'janela_fechada',
      restanteSeg,
      categoriaCobranca: null,
      dentroDaJanela,
    };
  }

  return {
    permitido: true,
    modo,
    motivo: null,
    restanteSeg,
    categoriaCobranca: 'livre',
    dentroDaJanela,
  };
}
