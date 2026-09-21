/**
 * Portado de takenet/blip-sdk-csharp (Apache-2.0),
 * src/Take.Blip.Builder/ContextBase.cs, ContextExtensions.cs, StateManager.cs, LazyInput.cs,
 * Utils/VariableReplacer.cs e Variables/{VariableSource,InputVariableProvider,
 * StateVariableProvider,ContactVariableProvider}.cs
 * — modificado: C# → TypeScript; o contexto do usuário, que na Blip mora num serviço
 * remoto, aqui é um mapa em memória carregado de `execucao_fluxo.contexto` (quem lê e
 * grava no banco é a `api`); `LazyInput` sem IA (intenção e entidade chegam prontas ou
 * nulas); a expiração de variável não é guardada; provedores que dependem de serviço da
 * Blip (bucket, resource, tunnel, calendar, secret…) não existem e lançam, como o
 * original lança para fonte sem provedor.
 */

import type { FluxoBlip } from './modelos.js';
import { CHAVES_DO_ESTADO } from './modelos.js';

/** `VariableSource`, na ordem do original. */
export const FONTES_DE_VARIAVEL = [
  'context',
  'contact',
  'calendar',
  'random',
  'bucket',
  'config',
  'input',
  'state',
  'tunnel',
  'application',
  'ticket',
  'resource',
  'aianswers',
  'secret',
  'blipfunction',
  'aiagent',
] as const;
export type FonteDeVariavel = (typeof FONTES_DE_VARIAVEL)[number];

/** As fontes que têm provedor no Pipe. As demais lançam, como na Blip sem o provedor. */
export const FONTES_SUPORTADAS: ReadonlySet<FonteDeVariavel> = new Set([
  'context',
  'contact',
  'config',
  'input',
  'state',
  'ticket',
]);

/** A mensagem que chegou, no vocabulário LIME: `tipo` é o MIME (`text/plain`…). */
export interface MensagemDeEntrada {
  id: string;
  tipo: string;
  conteudo: unknown;
  de?: string;
  para?: string;
}

export interface Intencao {
  id?: string;
  name?: string;
  score?: number;
  answer?: unknown;
}

export interface Entidade {
  id?: string;
  name?: string;
  value?: string;
}

/** `LazyInput`. */
export interface EntradaPreguicosa {
  mensagem: MensagemDeEntrada;
  /** `SerializedContent`: texto puro como está, documento JSON serializado. */
  conteudoSerializado: string;
  intencao?: Intencao | null;
  entidades?: Entidade[] | null;
}

export function criarEntrada(
  mensagem: MensagemDeEntrada,
  ia?: { intencao?: Intencao | null; entidades?: Entidade[] | null },
): EntradaPreguicosa {
  const conteudoSerializado =
    typeof mensagem.conteudo === 'string'
      ? mensagem.conteudo
      : JSON.stringify(mensagem.conteudo ?? null);
  return {
    mensagem,
    conteudoSerializado,
    intencao: ia?.intencao ?? null,
    entidades: ia?.entidades ?? null,
  };
}

/** O que o motor manda sair: o `Message` do `ISender.SendMessageAsync`. */
export interface MensagemDeSaida {
  tipo: string;
  conteudo: unknown;
  metadados?: Record<string, string> | null;
  /** `SendRawMessage`: o conteúdo é o texto serializado, a desserializar pelo tipo. */
  bruto?: boolean;
}

/** O atendimento humano aberto. É o `Ticket` da Blip. */
export interface Atendimento {
  id: string;
  [campo: string]: unknown;
}

export interface PedidoDeHttp {
  metodo: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  cabecalhos: Record<string, string>;
  corpo?: string;
  timeoutMs: number;
}

export interface RespostaDeHttp {
  status: number;
  corpo: string;
}

/**
 * As dependências externas do motor — o `ISender` e as extensões da Blip. Quem
 * implementa é a `api`; ações com rede devem ser executadas fora da transação da entrada.
 */
export interface ServicosDoMotor {
  enviar(mensagem: MensagemDeSaida): Promise<void>;
  encaminharParaAtendimento(pedido: {
    origem: string;
    settings: Record<string, unknown> | null;
  }): Promise<Atendimento>;
  registrarEvento(evento: Record<string, unknown>): Promise<void>;
  /** A api executa isto; o core só descreve a chamada e não faz rede. */
  chamarHttp?(pedido: PedidoDeHttp): Promise<RespostaDeHttp>;
  /**
   * `IRedirectManager.RedirectUserAsync`: manda o contato para outro serviço do roteador.
   * Ausente = o fluxo não está atrás de um roteador, e o `Redirect` falha — "o
   * redirecionamento funciona apenas no Bot Router" (help.blip.ai).
   */
  redirecionar?(pedido: { endereco: string; contexto: unknown }): Promise<void>;
}

export type ProvedorDeVariavel = (
  nome: string,
  contexto: Contexto,
) => Promise<string | null> | string | null;

/** `IContext`. */
export interface Contexto {
  /** `UserIdentity`. */
  usuario: string;
  fluxo: FluxoBlip;
  entrada: EntradaPreguicosa;
  /** O contexto do usuário, persistido. Na Blip, tudo aqui é texto. */
  variaveis: Record<string, string>;
  /** `InputContext`: vale só durante esta entrada (estado atual, ticket criado…). */
  entradaContexto: Map<string, unknown>;
  /** O contato no vocabulário da Blip (`name`, `phoneNumber`, `email`, `extras`…). */
  contato?: Record<string, unknown> | null;
  /** Provedores extras, ou para trocar os padrão. */
  provedores?: Partial<Record<FonteDeVariavel, ProvedorDeVariavel>>;
  servicos: ServicosDoMotor;
}

// --- ContextExtensions ---

export const CHAVE_DO_TICKET = 'ticket';
export const CHAVE_DO_ESTADO_ATUAL = 'current-state-id';

// --- IContext: armazenamento ---

/** `GetContextVariableAsync`: o valor cru, sem fonte nem propriedade. */
export function obterVariavelDeContexto(contexto: Contexto, nome: string): string | null {
  return Object.prototype.hasOwnProperty.call(contexto.variaveis, nome)
    ? (contexto.variaveis[nome] ?? null)
    : null;
}

/**
 * `SetVariableAsync`. ponytail: a expiração (`expiration`) do original não é guardada —
 * a variável vale até ser apagada ou sobrescrita. Guardar exige carimbo por chave.
 */
export function definirVariavel(contexto: Contexto, nome: string, valor: string | null): void {
  contexto.variaveis[nome] = valor ?? '';
}

export function apagarVariavel(contexto: Contexto, nome: string): void {
  delete contexto.variaveis[nome];
}

// --- StateManager ---

export const chaveDoEstado = (fluxoId: string): string => `stateId@${fluxoId}`;
const chaveDoEstadoAnterior = (fluxoId: string): string => `previous-stateId@${fluxoId}`;

export const obterEstadoId = (c: Contexto): string | null =>
  obterVariavelDeContexto(c, chaveDoEstado(c.fluxo.id));
export const obterEstadoAnteriorId = (c: Contexto): string | null =>
  obterVariavelDeContexto(c, chaveDoEstadoAnterior(c.fluxo.id));
export const definirEstadoId = (c: Contexto, id: string): void =>
  definirVariavel(c, chaveDoEstado(c.fluxo.id), id);
export const definirEstadoAnteriorId = (c: Contexto, id: string): void =>
  definirVariavel(c, chaveDoEstadoAnterior(c.fluxo.id), id);
export const apagarEstadoId = (c: Contexto): void => apagarVariavel(c, chaveDoEstado(c.fluxo.id));

/** Lê o estado guardado num contexto já persistido, sem montar `Contexto`. */
export const estadoGuardado = (variaveis: Record<string, string>, fluxoId: string): string | null =>
  variaveis[chaveDoEstado(fluxoId)] ?? null;

// --- ContextBase.GetVariableAsync ---

const NOME_DE_VARIAVEL =
  /^(?<fonteOuNome>[\p{L}\p{N}_]+)(\.(?<nome>[\p{L}\p{N}_.]+))?(@(?<propriedade>([\p{L}\p{N}_.](\[(\d+|\$n)\])?)+))?$/iu;

/** `VariableName.Parse`: `fonte.nome@propriedade`; sem fonte, é variável de contexto. */
export function lerNomeDeVariavel(texto: string): {
  fonte: FonteDeVariavel;
  nome: string;
  propriedade: string | null;
} {
  const m = NOME_DE_VARIAVEL.exec(texto);
  if (!m?.groups) throw new Error(`Nome de variável inválido: '${texto}'.`);
  const { fonteOuNome = '', nome, propriedade } = m.groups;
  if (nome !== undefined) {
    const fonte = FONTES_DE_VARIAVEL.find((f) => f === fonteOuNome.toLowerCase());
    if (!fonte) throw new Error(`Fonte de variável inválida: '${fonteOuNome}'.`);
    return { fonte, nome, propriedade: propriedade ?? null };
  }
  return { fonte: 'context', nome: fonteOuNome, propriedade: propriedade ?? null };
}

/** `JToken.ToString(Formatting.None).Trim('"')`. */
function comoTextoDeToken(valor: unknown): string {
  return JSON.stringify(valor).replace(/^"+|"+$/g, '');
}

/** `GetJsonProperty`: a propriedade (com pontos) de um valor que é objeto JSON. */
function propriedadeJson(valor: string, propriedade: string): string | null {
  let json: unknown;
  try {
    json = JSON.parse(valor);
  } catch {
    return null;
  }
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return null;
  for (const parte of propriedade.split('.')) {
    if (json === null || typeof json !== 'object') return null;
    json = (json as Record<string, unknown>)[parte];
    if (json === undefined) return null;
  }
  return comoTextoDeToken(json);
}

/** Leitura de propriedade sem diferenciar maiúscula — o `GetProperty` por reflexão. */
function propriedadeDeObjeto(objeto: unknown, nome: string): string | null {
  if (objeto === null || typeof objeto !== 'object') return null;
  const chave = Object.keys(objeto).find((k) => k.toLowerCase() === nome.toLowerCase());
  if (chave === undefined) return null;
  const valor = (objeto as Record<string, unknown>)[chave];
  if (valor === null || valor === undefined) return null;
  return typeof valor === 'object' ? JSON.stringify(valor) : String(valor);
}

/** `InputVariableProvider`. */
function provedorDeEntrada(nome: string, c: Contexto): string | null {
  const entrada = c.entrada;
  const minusculo = nome.toLowerCase();
  switch (minusculo) {
    case 'content':
      return entrada.conteudoSerializado;
    case 'message':
      return JSON.stringify(entrada.mensagem);
    case 'type':
      return entrada.mensagem.tipo;
    case 'length':
      return String(entrada.conteudoSerializado.length);
    case 'analysis':
      return null;
  }
  if (minusculo.startsWith('intent.')) {
    return propriedadeDeObjeto(entrada.intencao, minusculo.split('.')[1] ?? '');
  }
  if (minusculo.startsWith('entity.')) {
    const [, entidade, prop] = minusculo.split('.');
    if (!entidade || !prop) return null;
    const achada = entrada.entidades?.find((e) => e.name?.toLowerCase() === entidade);
    return propriedadeDeObjeto(achada, prop);
  }
  if (minusculo.startsWith('message.')) {
    const prop = minusculo.split('.')[1];
    if (prop === 'id') return entrada.mensagem.id;
    if (prop === 'from' || prop === 'fromidentity') return entrada.mensagem.de ?? null;
    if (prop === 'to' || prop === 'toidentity') return entrada.mensagem.para ?? null;
  }
  return null;
}

/** `StateVariableProvider`. */
function provedorDeEstado(nome: string, c: Contexto): string | null {
  const nomes = nome.toLowerCase().split('.');
  let estadoId: string | null;
  if (nomes.length > 1) {
    if (nomes[0] === 'previous') estadoId = obterEstadoAnteriorId(c);
    else if (nomes[0] === 'current') estadoId = obterEstadoId(c);
    else return null;
    nomes.shift();
  } else {
    estadoId = obterEstadoId(c);
  }
  const estado = c.fluxo.states.find((s) => s.id === estadoId);
  if (!estado) return null;
  const variavel = nomes[0] ?? '';
  if (variavel === 'id') return estado.id;
  if (CHAVES_DO_ESTADO.has(variavel) || !(variavel in estado)) return null;
  return comoTextoDeToken(estado[variavel]);
}

/** `ContactVariableProvider`: `extras.x`, `serialized` ou a propriedade do contato. */
function provedorDeContato(nome: string, c: Contexto): string | null {
  const contato = c.contato;
  if (!contato) return null;
  if (nome.toLowerCase().startsWith('extras.')) {
    return propriedadeDeObjeto(contato['extras'], nome.slice('extras.'.length));
  }
  if (nome.toLowerCase() === 'serialized') return JSON.stringify(contato);
  return propriedadeDeObjeto(contato, nome);
}

const PROVEDORES_PADRAO: Partial<Record<FonteDeVariavel, ProvedorDeVariavel>> = {
  input: provedorDeEntrada,
  state: provedorDeEstado,
  contact: provedorDeContato,
  config: (nome, c) => c.fluxo.configuration?.[nome] ?? null,
  ticket: (nome, c) => propriedadeDeObjeto(c.entradaContexto.get(CHAVE_DO_TICKET), nome),
};

/** `ContextBase.GetVariableAsync`. */
export async function obterVariavel(contexto: Contexto, nome: string): Promise<string | null> {
  const variavel = lerNomeDeVariavel(nome);
  let valor: string | null = '';
  if (variavel.fonte === 'context') {
    valor = obterVariavelDeContexto(contexto, variavel.nome);
  } else {
    const provedor = contexto.provedores?.[variavel.fonte] ?? PROVEDORES_PADRAO[variavel.fonte];
    if (!provedor) throw new Error(`Não há provedor para a fonte de variável '${variavel.fonte}'.`);
    valor = await provedor(variavel.nome, contexto);
  }
  if (!valor?.trim() || !variavel.propriedade?.trim()) return valor;
  return propriedadeJson(valor, variavel.propriedade);
}

// --- VariableReplacer ---

const VARIAVEIS_NO_TEXTO = /{{([a-zA-Z0-9.@_-]+)}}/g;

/** `VariableReplacer.ReplaceAsync`: troca `{{nome}}` pelo valor, escapado para JSON. */
export async function substituirVariaveis(valor: string, contexto: Contexto): Promise<string> {
  const valores = new Map<string, string | null>();
  for (const m of valor.matchAll(VARIAVEIS_NO_TEXTO)) {
    const nome = m[1]!;
    if (valores.has(nome)) continue;
    valores.set(nome, escaparTexto(await obterVariavel(contexto, nome)));
  }
  if (valores.size === 0) return valor;
  return valor.replace(VARIAVEIS_NO_TEXTO, (_todo, nome: string) => valores.get(nome) ?? '');
}

/** `EscapeString`: o valor entra dentro de uma string JSON e não pode quebrá-la. */
export function escaparTexto(src: string | null): string | null {
  if (src === null || src.trim() === '') return src;
  let saida = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (!precisaEscapar(src, i)) {
      saida += c;
      continue;
    }
    switch (c) {
      case '\b':
        saida += '\\b';
        break;
      case '\f':
        saida += '\\f';
        break;
      case '\n':
        saida += '\\n';
        break;
      case '\r':
        saida += '\\r';
        break;
      case '\t':
        saida += '\\t';
        break;
      case '"':
        saida += '\\"';
        break;
      case '\\':
        saida += '\\\\';
        break;
      case '/':
        saida += '\\/';
        break;
      default:
        saida += `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`;
    }
  }
  return saida;
}

function precisaEscapar(src: string, i: number): boolean {
  const c = src.charCodeAt(i);
  const antes = i > 0 ? src.charCodeAt(i - 1) : -1;
  const depois = i < src.length - 1 ? src.charCodeAt(i + 1) : -1;
  return (
    c < 32 ||
    c === 0x22 ||
    c === 0x5c ||
    // Surrogate alto sem par
    (c >= 0xd800 && c <= 0xdbff && (depois < 0xdc00 || depois > 0xdfff)) ||
    // Surrogate baixo sem par
    (c >= 0xdc00 && c <= 0xdfff && (antes < 0xd800 || antes > 0xdbff)) ||
    c === 0x2028 ||
    c === 0x2029 ||
    (c === 0x2f && antes === 0x3c)
  );
}
