/**
 * The "Variáveis" tab of Configuração (`$ctrl.editConfig()` → `BuilderConfigurationVariablesView`,
 * `ref/CAPTURAS-F1-F6.md` §F-2): 8 collapsible sections, each writing one key of `flow.configuration`
 * (P:288224). Titles and descriptions are the literal captured texts, copied verbatim, not rewritten.
 *
 * Availability (D-56 item 3): the Pipe engine only reads `configuration` generically through
 * `{{config.X}}` (`packages/core/src/flow/context.ts`, `config: (nome, c) => c.flow.configuration?.[nome]`).
 * None of the Blip-reserved `builder:*` keys have engine behavior behind them — `defaultActionTimeLimitMs`
 * (`packages/core/src/flow/manager.ts`) is a fixed manager setting, not read per-flow from
 * `configuration['builder:actionExecutionTimeout']`. So only "Variáveis de configuração" (arbitrary user
 * keys) is functional; the other 7 sections show the Blip control disabled with the recorded value, if any.
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
    disponivel: false,
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
    disponivel: false,
  },
  {
    id: 'tempo-limite-acoes',
    titulo: 'TEMPO LIMITE DE AÇÕES',
    descricao:
      'Tempo em segundos padrão para limitar a execução de cada ação. Se não especificado, o padrão é 30 segundos. Está limitado tempo limite global de processamento de uma mensagem, de 60 segundos.',
    controle: 'seconds',
    chave: 'builder:actionExecutionTimeout',
    rotuloCampo: 'Tempo limite de ações',
    disponivel: false,
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
    disponivel: false,
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
