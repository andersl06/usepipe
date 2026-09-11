/**
 * Portado de takenet/blip-sdk-csharp (Apache-2.0),
 * src/Take.Blip.Builder/Models/Flow.cs, State.cs, Input.cs, Output.cs e Action.cs
 * — modificado: C# → TypeScript; as classes viram interfaces sobre o JSON publicado da
 * Blip, com as MESMAS chaves, para o motor ler o fluxo da Blip sem tradução; os
 * `Validate()` viram `validarFluxo`; mensagens em português; `TraceSettings` e
 * `BuilderConfiguration` ficaram de fora.
 */

import type { CondicaoBlip } from './condicao.js';
import { ErroDeValidacao, validarCondicao } from './condicao.js';

/** `Action`. `settings` é o JSON livre de cada tipo (o `JRaw` do original). */
export interface Acao {
  id?: string;
  $title?: string;
  order?: number;
  conditions?: CondicaoBlip[] | null;
  /** Segundos, como no original. */
  timeout?: number | null;
  continueOnError?: boolean;
  executeAsynchronously?: boolean;
  type: string;
  settings?: unknown;
}

export const REGRAS_DE_VALIDACAO = ['text', 'number', 'date', 'regex', 'type'] as const;

/** `InputValidation`. */
export interface ValidacaoDeEntrada {
  rule: string;
  regex?: string | null;
  type?: string | null;
  error?: string | null;
}

/** `Input`: o que o estado espera do usuário. */
export interface Entrada {
  bypass?: boolean;
  conditions?: CondicaoBlip[] | null;
  validation?: ValidacaoDeEntrada | null;
  expiration?: string | null;
  variable?: string | null;
}

/** `Output`: a transição. */
export interface Saida {
  order?: number;
  conditions?: CondicaoBlip[] | null;
  stateId: string;
}

/**
 * `State`. O que não é do modelo (`name`, `$position`, `$tags`…) fica no próprio objeto,
 * como o `ExtensionData` do original — é dali que `{{state.name}}` lê.
 */
export interface Estado {
  id: string;
  root?: boolean;
  end?: boolean;
  inputActions?: Acao[] | null;
  input?: Entrada | null;
  outputActions?: Acao[] | null;
  afterStateChangedActions?: Acao[] | null;
  outputs?: Saida[] | null;
  localCustomActions?: Acao[] | null;
  [extensao: string]: unknown;
}

/** As chaves do modelo; o resto do estado é `ExtensionData`. */
export const CHAVES_DO_ESTADO = new Set([
  'id',
  'root',
  'end',
  'inputActions',
  'input',
  'outputActions',
  'afterStateChangedActions',
  'outputs',
  'localCustomActions',
]);

/** `Flow`. */
export interface FluxoBlip {
  id: string;
  version?: number;
  /** `flow` ou `subflow`. */
  type?: string;
  sessionState?: string;
  inputActions?: Acao[] | null;
  states: Estado[];
  outputActions?: Acao[] | null;
  afterStateChangedActions?: Acao[] | null;
  configuration?: Record<string, string> | null;
}

const VERSAO_ATUAL_DE_SUBFLUXO = 2;
const VARIAVEL_DE_ENTRADA = /^([a-zA-Z0-9.]+)$/;

export const ehSubfluxo = (fluxo: FluxoBlip): boolean => fluxo.type?.toLowerCase() === 'subflow';

/** `stateId` no formato `{{variavel}}`: destino calculado em tempo de execução. */
export const ehVariavelDeContexto = (id: string): boolean =>
  id.startsWith('{{') && id.endsWith('}}');

/** `Action.Validate()`. */
export function validarAcao(acao: Acao): void {
  if (!acao.type) throw new ErroDeValidacao('O tipo da ação é obrigatório.');
}

/** `Input.Validate()`. */
export function validarEntrada(entrada: Entrada): void {
  const v = entrada.validation;
  if (v) {
    if (v.rule?.toLowerCase() === 'regex' && !v.regex?.trim()) {
      throw new ErroDeValidacao('A expressão regular é obrigatória na regra de validação regex.');
    }
    if (!v.error?.trim())
      throw new ErroDeValidacao('A mensagem de erro da validação é obrigatória.');
    if (v.rule?.toLowerCase() === 'type' && !v.type) {
      throw new ErroDeValidacao('O tipo de mídia é obrigatório na regra de validação type.');
    }
  }
  if (entrada.variable?.trim() && !VARIAVEL_DE_ENTRADA.test(entrada.variable)) {
    throw new ErroDeValidacao(
      'O nome da variável de entrada só pode ter letras, números e pontos.',
    );
  }
}

/** `Output.Validate()`. */
export function validarSaida(saida: Saida): void {
  if (!saida.stateId) throw new ErroDeValidacao('O estado de destino da saída é obrigatório.');
  for (const c of saida.conditions ?? []) validarCondicao(c);
}

/** `State.Validate()`. */
export function validarEstado(estado: Estado): void {
  if (!estado.id) throw new ErroDeValidacao('O id do estado é obrigatório.');
  for (const a of estado.inputActions ?? []) validarAcao(a);
  if (estado.input) validarEntrada(estado.input);
  for (const a of estado.outputActions ?? []) validarAcao(a);
  for (const a of estado.afterStateChangedActions ?? []) validarAcao(a);
  for (const s of estado.outputs ?? []) validarSaida(s);
}

/**
 * `Flow.Validate()`: o contrato real de um fluxo válido — um só estado raiz, a raiz
 * espera entrada e não tem condição, ids únicos, destino de saída existente (ou
 * `{{variável}}`) e nenhum laço que não passe por uma entrada.
 */
export function validarFluxo(fluxo: FluxoBlip): void {
  if (!fluxo.id) throw new ErroDeValidacao('O id do fluxo é obrigatório.');
  if (!Array.isArray(fluxo.states))
    throw new ErroDeValidacao('O fluxo precisa de pelo menos um estado.');
  const subfluxo = ehSubfluxo(fluxo);
  if (subfluxo && (fluxo.version ?? 1) < VERSAO_ATUAL_DE_SUBFLUXO) {
    throw new ErroDeValidacao(
      `A versão do subfluxo precisa ser maior ou igual a ${VERSAO_ATUAL_DE_SUBFLUXO}.`,
    );
  }

  const raizes = fluxo.states.filter((s) => s.root);
  if (raizes.length !== 1)
    throw new ErroDeValidacao('O fluxo precisa de exatamente um estado raiz.');
  const raiz = raizes[0]!;
  if (!raiz.input || (!subfluxo && raiz.input.bypass)) {
    throw new ErroDeValidacao('O estado raiz precisa esperar uma entrada.');
  }
  if (raiz.input.conditions?.length) {
    throw new ErroDeValidacao('O estado raiz não pode ter condições de entrada.');
  }

  for (const a of fluxo.inputActions ?? []) validarAcao(a);

  const porId = new Map(fluxo.states.map((s) => [s.id, s]));

  // Existe um caminho direto (sem entrada) de volta a `alvo`?
  const podeSerAlcancado = (alvo: Estado, saida: Saida, vistos: Set<string>): boolean => {
    if (vistos.has(saida.stateId)) return false;
    const estadoDaSaida = porId.get(saida.stateId);
    if (!estadoDaSaida?.outputs?.length) return false;
    if (estadoDaSaida.input && !estadoDaSaida.input.bypass) return false;
    if (estadoDaSaida.outputs.some((o) => o.stateId === alvo.id)) return true;
    vistos.add(saida.stateId);
    return estadoDaSaida.outputs.some((o) => podeSerAlcancado(alvo, o, vistos));
  };

  for (const estado of fluxo.states) {
    validarEstado(estado);
    if (fluxo.states.filter((s) => s.id === estado.id).length > 1) {
      throw new ErroDeValidacao(`O id de estado '${estado.id}' se repete no fluxo.`);
    }
    for (const saida of estado.outputs ?? []) {
      if (!porId.has(saida.stateId) && !ehVariavelDeContexto(saida.stateId)) {
        throw new ErroDeValidacao(`O estado de destino '${saida.stateId}' da saída não existe.`);
      }
      // Igual ao original: a segunda metade testa a entrada da RAIZ, não a do estado.
      // Como a raiz com bypass já foi recusada acima, na prática só estado sem
      // entrada nenhuma é conferido.
      if (!estado.input || (!subfluxo && raiz.input.bypass)) {
        if (podeSerAlcancado(estado, saida, new Set())) {
          throw new ErroDeValidacao(
            `Há um laço no fluxo começando no estado ${estado.id} que não pede entrada do usuário.`,
          );
        }
      }
    }
  }

  for (const a of fluxo.outputActions ?? []) validarAcao(a);
  for (const a of fluxo.afterStateChangedActions ?? []) validarAcao(a);
}
