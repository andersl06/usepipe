/**
 * The "Variáveis" tab of Configuração (`$ctrl.editConfig()` → `BuilderConfigurationVariablesView`,
 * `ref/CAPTURAS-F1-F6.md` §F-2): 8 collapsible sections, each writing one key of `flow.configuration`
 * (P:288224). Titles and descriptions are the literal captured texts, copied verbatim, not rewritten.
 *
 * Availability (D-56 item 3): the Pipe engine reads `configuration` through `{{config.X}}`
 * (`packages/core/src/flow/context.ts`) and reads two Blip-reserved keys itself:
 * `builder:stateExpiration` (the saved block expires after that idle time) and
 * `builder:actionExecutionTimeout` (replaces the 30 s default per action, `packages/core/src/flow/manager.ts`).
 * Those three sections are functional, and so is "Variáveis sensíveis" (P11): its secrets live
 * encrypted in `variavel_secreta_do_fluxo` (not in `configuration`) and the engine reads them as
 * `{{secret.X}}` in HTTP actions. The other 4 show the Blip control disabled with the recorded value, if any.
 */

export type ConfigurationControlType =
  | 'slider'
  | 'switch'
  | 'seconds'
  | 'identifier'
  | 'config-vars'
  | 'secret-vars';

export interface ConfigurationSection {
  id: string;
  /** Literal captured title, already uppercase (`ref/CAPTURAS-F1-F6.md` §F-2). */
  titulo: string;
  /** Literal captured description, copied verbatim. */
  descricao: string;
  /** A second literal paragraph, only "Variáveis sensíveis" has one. */
  descricaoExtra?: string;
  controle: ConfigurationControlType;
  /** The `configuration` key the Blip engine would use (P:288224); absent for sections 6–8, which don't map to one fixed key. */
  chave?: string;
  /** The internal field label, for the sections whose control is a labeled input. */
  rotuloCampo?: string;
  /** Whether the Pipe engine actually reads this section's control. */
  disponivel: boolean;
}

export const CONFIGURATION_SECTIONS: readonly ConfigurationSection[] = [
  {
    id: 'confiabilidade-ia',
    titulo: 'CONFIABILIDADE DE IA',
    descricao:
      'Defina o percentual de confiabilidade de uma intenção para ser considerada uma resposta válida.',
    controle: 'slider',
    chave: 'builder:minimumIntentScore',
    // P16: the engine keeps an intent only at or above this score (`@pipe/core` `nlp.ts`).
    disponivel: true,
  },
  {
    id: 'tracking-automatico',
    titulo: 'TRACKING AUTOMÁTICO',
    descricao:
      "Executar automaticamente uma ação de registro de eventos para todo bloco do fluxo. A categoria dos eventos registrados é 'flow' e a ação é o nome de cada bloco.",
    controle: 'switch',
    chave: 'builder:stateTrack',
    disponivel: false,
  },
  {
    id: 'contexto-roteador',
    titulo: 'UTILIZAR CONTEXTO DO ROTEADOR',
    descricao:
      "Executa ações e comandos em nome do roteador. Desta forma as variáveis de contexto, dados do contato, atendimento humano, análise, recursos e inteligência artificial utilizados por este bot virão do roteador. Válido somente para mensagens encaminhadas por um roteador. Esta configuração também pode sobrescrever o valor definido na configuração 'Proprietário do contexto' se presente.",
    controle: 'switch',
    chave: 'builder:useTunnelOwnerContext',
    disponivel: false,
  },
  {
    id: 'expiracao-sessao',
    titulo: 'EXPIRAÇÃO DA SESSÃO',
    descricao:
      'Tempo em segundos de expiração da sessão dos usuários em caso de inatividade. Em caso de expiração da sessão, o usuário volta para o estado inicial do fluxo. Se este valor não estiver definido, a expiração não ocorre.',
    controle: 'seconds',
    chave: 'builder:stateExpiration',
    rotuloCampo: 'Expiração da sessão',
    disponivel: true,
  },
  {
    id: 'tempo-limite-acoes',
    titulo: 'TEMPO LIMITE DE AÇÕES',
    descricao:
      'Tempo em segundos padrão para limitar a execução de cada ação. Se não especificado, o padrão é 30 segundos. Está limitado tempo limite global de processamento de uma mensagem, de 60 segundos.',
    controle: 'seconds',
    chave: 'builder:actionExecutionTimeout',
    rotuloCampo: 'Tempo limite de ações',
    disponivel: true,
  },
  {
    id: 'identificador-fluxo',
    titulo: 'IDENTIFICADOR DO FLUXO',
    descricao:
      'Identificador único do fluxo. As sessões do usuários ficam associadas a este identificador. Se alterado, todas as sessões de usuário são redefinidas.',
    controle: 'identifier',
    rotuloCampo: 'Identificador do fluxo',
    disponivel: false,
  },
  {
    id: 'variaveis-configuracao',
    titulo: 'VARIÁVEIS DE CONFIGURAÇÃO',
    descricao: 'Para mostrar as informações da consulta no fluxo, utilize: {{config.VariableName}}',
    controle: 'config-vars',
    disponivel: true,
  },
  {
    id: 'variaveis-sensiveis',
    titulo: 'VARIÁVEIS SENSÍVEIS',
    descricao: 'Para utilizar as informações sensíveis no fluxo, utilize {{secret.VariableName}}',
    descricaoExtra:
      'Valores suprimidos. Caso queira apenas alterar o valor, insira novamente no campo destinado. Caso queira alterar o nome da chave, ajuste o nome e também reinsira o valor desejado.',
    controle: 'secret-vars',
    disponivel: true,
  },
] as const;

/** `90` → `'00:01:30'` — the `TimeSpan` text Blip stores under `builder:stateExpiration`/`builder:actionExecutionTimeout`. `null` for a negative or non-finite input. */
export function secondsToTimeSpan(totalSeconds: number): string | null {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return null;
  const inteiro = Math.floor(totalSeconds);
  const horas = Math.floor(inteiro / 3600);
  const minutos = Math.floor((inteiro % 3600) / 60);
  const segundos = inteiro % 60;
  const par = (n: number): string => String(n).padStart(2, '0');
  return `${par(horas)}:${par(minutos)}:${par(segundos)}`;
}

/** `'01:00:00'` → `3600`. `null` when the text isn't `hh:mm:ss` with valid minutes/seconds. */
export function timeSpanToSeconds(timeSpan: string): number | null {
  const m = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(timeSpan.trim());
  if (!m) return null;
  const horas = Number(m[1]);
  const minutos = Number(m[2]);
  const segundos = Number(m[3]);
  if (minutos > 59 || segundos > 59) return null;
  return horas * 3600 + minutos * 60 + segundos;
}

/** Blip's Builder default for `builder:minimumIntentScore` (the engine uses the same, `@pipe/core` `nlp.ts`). */
export const DEFAULT_MINIMUM_INTENT_PERCENT = 50;

/** `'0.7'` → `70`: the stored 0..1 fraction as the slider's percentage; the default when absent or invalid. */
export function scoreToPercent(score: string | undefined): number {
  const value = score === undefined || score.trim() === '' ? Number.NaN : Number(score);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? Math.round(value * 100) : DEFAULT_MINIMUM_INTENT_PERCENT;
}

/** `70` → `'0.7'`, clamped to 0..100. */
export function percentToScore(percent: number): string {
  const clamped = Math.min(100, Math.max(0, Math.round(Number.isFinite(percent) ? percent : DEFAULT_MINIMUM_INTENT_PERCENT)));
  return String(clamped / 100);
}
