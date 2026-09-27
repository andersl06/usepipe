import { PROVEDOR_PADRAO } from '@pipe/core';
import type { ConditionBlip } from '@pipe/core';
import type { AcaoDoEditor, Block } from './model';
import { gerarId } from './model';
import { conditionError } from './conditions';

/**
 * Block enter/leave actions follow Blip editor Actions tab and offer every action executed by
 * `PROVEDOR_PADRAO`. Content actions and attendance system actions keep their existing owners.
 * Limit each action list to 15.
 */

export const ACTIONS_LIMIT = 15;

export interface CampoDaAcao {
  /** A `settings` key may use a dot for nested keys, such as `context.type`. */
  key: string;
  rotulo: string;
  ajuda?: string;
  obrigatorio?: boolean;
  /** `texto` is one line; `longo` uses a textarea; `code` is script source; `variableList` is a list of variable names; `functionId` picks a function from the library (D-22). */
  tipo?: 'texto' | 'longo' | 'json' | 'cabecalhos' | 'code' | 'variableList' | 'functionId';
  /** Valores fechados usam o mesmo seletor do Builder. */
  options?: readonly string[];
}

export interface TipoDeAcao {
  tipo: string;
  /** O nome no menu "ADICIONAR FERRAMENTAS". */
  rotulo: string;

  titulo: string;
  grupo: 'Executar' | 'Manipular';
  info?: string;
  campos: CampoDaAcao[];
}

/** `ExecuteScript` and `ExecuteScriptV2` share the same editor fields in the reference. */
const SCRIPT_FIELDS: CampoDaAcao[] = [
  { key: 'source', rotulo: 'Código-fonte', obrigatorio: true, tipo: 'code' },
  {
    key: 'inputVariables',
    rotulo: 'Variáveis de entrada',
    tipo: 'variableList',
    ajuda: 'Você pode utilizar uma das variáveis pré-determinadas na lista ou definidas em resposta do usuário',
  },
  { key: 'outputVariable', rotulo: 'Variável para o valor de retorno', obrigatorio: true },
];

/** Starting source for a new script action; input variables arrive as `run` parameters. */
export const SCRIPT_TEMPLATE = 'function run() {\n  return;\n}\n';

/** Shared by `ExecuteTemplate` and `ExecuteBlipFunction`: the engine (`actions.ts`) reads input variables as call arguments and writes the result to `outputVariable`, same contract as the script actions. */
const INPUT_VARIABLES_FIELD: CampoDaAcao = {
  key: 'inputVariables',
  rotulo: 'Variáveis de entrada',
  tipo: 'variableList',
  ajuda: 'Você pode utilizar uma das variáveis pré-determinadas na lista ou definidas em resposta do usuário',
};

/** `ExecuteTemplate` renders Handlebars; `{{nome}}`/`{{pedido.numero}}` are read from the input variables above. */
const TEMPLATE_FIELDS: CampoDaAcao[] = [
  { key: 'template', rotulo: 'Template', obrigatorio: true, tipo: 'longo', ajuda: 'Adicione o template para execução correta da funcionalidade.' },
  INPUT_VARIABLES_FIELD,
  { key: 'outputVariable', rotulo: 'Salvar retorno', obrigatorio: true, ajuda: 'Para mostrar as informações da consulta no fluxo, utilize: {{NomeDaVariável}}' },
];

/** `ExecuteBlipFunction` runs a named function from the library (D-22) instead of inline source. */
const BLIP_FUNCTION_FIELDS: CampoDaAcao[] = [
  { key: 'functionId', rotulo: 'Definição da função', obrigatorio: true, tipo: 'functionId' },
  INPUT_VARIABLES_FIELD,
  { key: 'outputVariable', rotulo: 'Variável para o valor de retorno', obrigatorio: true },
];

// CATALOGO_OF_ACTIONS is the applied Phase 1 symbol recorded by the catalog gate.
export const CATALOG_OF_ACTIONS: readonly TipoDeAcao[] = [
  {
    tipo: 'Redirect',
    rotulo: 'Redirecionar para serviço',
    titulo: 'Redirecionar a um serviço',
    grupo: 'Executar',
    info: 'Para executar esta ação é necessário que seu projeto esteja em um bot router.',
    campos: [
      { key: 'address', rotulo: 'Serviço', obrigatorio: true },
      { key: 'context.type', rotulo: 'Tipo do contexto' },
      { key: 'context.value', rotulo: 'Valor do contexto', tipo: 'longo' },
    ],
  },
  {
    tipo: 'ProcessHttp',
    rotulo: 'Requisição HTTP',
    titulo: 'Requisição HTTP',
    grupo: 'Executar',
    info: 'A chamada é feita fora da transação e a resposta pode ser guardada em variáveis de contexto.',
    campos: [
      {
        key: 'method',
        rotulo: 'Método HTTP',
        obrigatorio: true,
        options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      },
      { key: 'uri', rotulo: 'URL', obrigatorio: true },
      { key: 'headers', rotulo: 'Cabeçalhos', tipo: 'cabecalhos' },
      { key: 'body', rotulo: 'Corpo', tipo: 'longo' },
      { key: 'requestTimeout', rotulo: 'Tempo limite (segundos)' },
      { key: 'responseStatusVariable', rotulo: 'Variável do status' },
      { key: 'responseBodyVariable', rotulo: 'Variável do corpo' },
    ],
  },
  {
    tipo: 'SendMessageFromHttp',
    rotulo: 'Enviar mensagem via HTTP',
    titulo: 'Enviar mensagem via HTTP',
    grupo: 'Executar',
    info: 'Busca o conteúdo por GET e envia a resposta como uma mensagem do tipo informado.',
    campos: [
      { key: 'uri', rotulo: 'URL', obrigatorio: true },
      { key: 'type', rotulo: 'Tipo de conteúdo (MIME)', obrigatorio: true },
      { key: 'headers', rotulo: 'Cabeçalhos', tipo: 'cabecalhos' },
      { key: 'requestTimeout', rotulo: 'Tempo limite (segundos)' },
    ],
  },
  {
    tipo: 'ExecuteScript',
    rotulo: 'Executar script',
    titulo: 'Executar script',
    grupo: 'Executar',
    campos: SCRIPT_FIELDS,
  },
  {
    tipo: 'ExecuteScriptV2',
    rotulo: 'Executar script 2.0',
    titulo: 'Executar script 2.0',
    grupo: 'Executar',
    campos: SCRIPT_FIELDS,
  },
  {
    tipo: 'ExecuteTemplate',
    rotulo: 'Executar template',
    titulo: 'Executar template',
    grupo: 'Executar',
    info: 'Renderiza um template Handlebars — sem execução de script arbitrário.',
    campos: TEMPLATE_FIELDS,
  },
  {
    tipo: 'ExecuteBlipFunction',
    rotulo: 'Função da biblioteca',
    titulo: 'Função da biblioteca',
    grupo: 'Executar',
    info: 'Selecione uma função criada na Biblioteca de funções ou crie uma nova para ser utilizada como uma ação.',
    campos: BLIP_FUNCTION_FIELDS,
  },
  {
    tipo: 'MergeContact',
    rotulo: 'Definir contato',
    titulo: 'Definir contato',
    grupo: 'Manipular',
    info: 'Atualiza os dados do contato desta execução.',
    campos: [
      { key: 'name', rotulo: 'Nome' },
      { key: 'email', rotulo: 'E-mail' },
      { key: 'city', rotulo: 'Cidade' },
      { key: 'gender', rotulo: 'Gênero', options: ['Masculino', 'Feminino'] },
      { key: 'taxDocument', rotulo: 'Documento' },
      { key: 'phoneNumber', rotulo: 'Telefone' },
      { key: 'extras', rotulo: 'Extras', tipo: 'json' },
    ],
  },
  {
    tipo: 'SetVariable',
    rotulo: 'Definir variável',
    titulo: 'Definir variável',
    grupo: 'Manipular',
    info: 'Essa ação permite a definição do valor de uma variável de context no fluxo. Para utilizar a variável, utilize {{context.variableName}}',
    campos: [
      {
        key: 'variable',
        rotulo: 'Nome da variável',
        obrigatorio: true,
      },
      { key: 'value', rotulo: 'Valor' },
      { key: 'expiration', rotulo: 'Expiração (segundos)' },
    ],
  },
  {
    tipo: 'DeleteVariable',
    rotulo: 'Excluir variável',
    titulo: 'Excluir variável',
    grupo: 'Manipular',
    campos: [{ key: 'variable', rotulo: 'Nome da variável', obrigatorio: true }],
  },
  {
    tipo: 'TrackEvent',
    rotulo: 'Registrar eventos',
    titulo: 'Registro de eventos',
    grupo: 'Manipular',
    info: 'Os eventos são agregados por categoria, ação e dia.',
    campos: [
      { key: 'category', rotulo: 'Categoria', obrigatorio: true },
      { key: 'action', rotulo: 'Ação', obrigatorio: true },
      { key: 'label', rotulo: 'Rótulo (opcional)' },
      { key: 'value', rotulo: 'Valor (opcional)' },
      { key: 'extras', rotulo: 'Extras', tipo: 'json' },
      { key: 'fireAndForget', rotulo: 'Continuar sem aguardar', options: ['true', 'false'] },
    ],
  },
];

export const actionsOfGroup = (group: TipoDeAcao['grupo']): readonly TipoDeAcao[] =>
  CATALOG_OF_ACTIONS.filter((action) => action.grupo === group);

export const LABELS_OF_ACTIONS = {
  aba: 'Ações',
  entrada: 'Ações de Entrada',
  entradaDescricao: 'Inclua ações que serão executadas antes do envio do primeiro conteúdo',
  adicionarEntrada: 'Adicionar ação de entrada',
  saida: 'Ações de Saída',
  saidaDescricao:
    'Inclua ações que serão executadas após o envio do último conteúdo ou resposta do usuário',
  adicionarSaida: 'Adicionar ação de saída',
  nome: 'Nome da ação',
  detalhe: 'Detalhes da ação',
  excluir: 'Excluir ação',
  limite: 'Limite de 15 ações atingidos',
  menu: 'ADICIONAR FERRAMENTAS',
  condicao: 'Condição para executar a ação',
  adicionarCondicao: '+ Adicionar condição de execução',
  atendimento:
    'O bloco de atendimento representa o ponto do fluxo que um atendente está trocando mensagens com o usuário, portanto o bot não deve interferir nas ações de entrada e saída.',
  naoExecutada: 'Não executada no Pipe',
  doSistema: 'Ação do bloco de atendimento',
} as const;

/** System-run actions belong to the Human block, not the person. */
export const ACTIONS_OF_SYSTEM = new Set(['ForwardToDesk', 'LeavingFromDesk', 'CreateTicket']);

export const tipoDeAcao = (tipo: string): TipoDeAcao | undefined =>
  CATALOG_OF_ACTIONS.find((t) => t.tipo === tipo);

export const rotuloDaAcao = (tipo: string): string => tipoDeAcao(tipo)?.titulo ?? tipo;

/** The engine does not execute this action: it throws at runtime and the conversation falls into the queue. */
export const acaoSemSuporte = (acao: AcaoDoEditor): boolean => !PROVEDOR_PADRAO.has(acao.type);

export const acaoDoSistema = (acao: AcaoDoEditor): boolean => ACTIONS_OF_SYSTEM.has(acao.type);

/** Create an action like the plus button: no title, empty settings, no condition. */
export function novaAcao(tipo: string, id = gerarId()): AcaoDoEditor {
  const settings: Record<string, unknown> =
    tipo === 'ProcessHttp' ? { method: 'GET' } :
    tipo === 'SendMessageFromHttp' ? { requestTimeout: 60 } :
    tipo === 'TrackEvent' ? { extras: {}, fireAndForget: true } :
    tipo === 'ExecuteScript' ? { function: 'run', source: SCRIPT_TEMPLATE, inputVariables: [] } :
    tipo === 'ExecuteScriptV2' ? { source: SCRIPT_TEMPLATE, inputVariables: [] } : {};
  return {
    $id: id,
    $title: '',
    type: tipo,
    settings,
    conditions: [],
    $invalid: false,
  };
}

const partes = (key: string): string[] => key.split('.');

/** Read `settings.a.b` case-insensitively because Newtonsoft matches keys without regard to case, and the screen must agree. */
export function fieldValue(acao: AcaoDoEditor, key: string): string {
  let atual: unknown = acao.settings ?? {};
  for (const parte of partes(key)) {
    if (!atual || typeof atual !== 'object') return '';
    const objeto = atual as Record<string, unknown>;
    const real = Object.keys(objeto).find((k) => k.toLowerCase() === parte.toLowerCase());
    atual = real === undefined ? undefined : objeto[real];
  }
  if (atual === undefined || atual === null) return '';
  return typeof atual === 'string' ? atual : JSON.stringify(atual);
}

/** Write `settings.a.b`; empty text deletes the key. */
export function comCampo(acao: AcaoDoEditor, key: string, value: string): AcaoDoEditor {
  const settings = JSON.parse(JSON.stringify(acao.settings ?? {})) as Record<string, unknown>;
  const caminho = partes(key);
  let atual = settings;
  for (const parte of caminho.slice(0, -1)) {
    const proximo = atual[parte];
    if (!proximo || typeof proximo !== 'object') atual[parte] = {};
    atual = atual[parte] as Record<string, unknown>;
  }
  const ultima = caminho[caminho.length - 1]!;
  if (value === '') delete atual[ultima];
  else atual[ultima] = value;
  // Remove an empty nested object too; `context: {}` is not meaningful context.
  for (const parte of caminho.slice(0, -1)) {
    const filho = settings[parte];
    if (filho && typeof filho === 'object' && Object.keys(filho).length === 0)
      delete settings[parte];
  }
  return { ...acao, settings };
}

/** Flow headers must stay objects; leave invalid text visible for validation instead of silently discarding it. */
export function comCampoJson(acao: AcaoDoEditor, key: string, value: string): AcaoDoEditor {
  if (!value.trim()) return comCampo(acao, key, '');
  try {
    const json: unknown = JSON.parse(value);
    if (json && typeof json === 'object' && !Array.isArray(json)) {
      return withValue(acao, key, json);
    }
  } catch {
    // Point to the invalid field without erasing what the user typed.
  }
  return comCampo(acao, key, value);
}

export interface CabecalhoHttp {
  key: string;
  value: string;
}

/** Flow stores headers as an object; Builder edits them as key/value pairs. */
export function cabecalhosDoCampo(acao: AcaoDoEditor, key: string): CabecalhoHttp[] {
  const bruto = acao.settings?.[key];
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return [];
  return Object.entries(bruto).map(([nome, value]) => ({ key: nome, value: String(value ?? '') }));
}

export function comCabecalhos(acao: AcaoDoEditor, key: string, cabecalhos: CabecalhoHttp[]): AcaoDoEditor {
  const value = Object.fromEntries(
    cabecalhos.filter(({ key }) => key.trim()).map(({ key, value }) => [key.trim(), value]),
  );
  return Object.keys(value).length ? withValue(acao, key, value) : comCampo(acao, key, '');
}

/** Script input variables are stored as an array of names. */
export function variablesOfField(acao: AcaoDoEditor, key: string): string[] {
  const bruto = acao.settings?.[key];
  return Array.isArray(bruto) ? bruto.map((v) => String(v ?? '')) : [];
}

export function withVariables(acao: AcaoDoEditor, key: string, names: string[]): AcaoDoEditor {
  return withValue(acao, key, names);
}

function withValue(acao: AcaoDoEditor, key: string, value: unknown): AcaoDoEditor {
  const settings = JSON.parse(JSON.stringify(acao.settings ?? {})) as Record<string, unknown>;
  settings[key] = value;
  return { ...acao, settings };
}

export function comTitulo(acao: AcaoDoEditor, titulo: string): AcaoDoEditor {
  return { ...acao, $title: titulo };
}

export function withConditions(acao: AcaoDoEditor, conditions: ConditionBlip[]): AcaoDoEditor {
  return { ...acao, conditions: conditions };
}

/** Return missing action fields in panel wording; skip validation for actions the engine cannot execute. */
export function actionErrors(acao: AcaoDoEditor): string[] {
  const errors: string[] = [];
  const tipo = tipoDeAcao(acao.type);
  for (const campo of tipo?.campos ?? []) {
    if (campo.obrigatorio && !fieldValue(acao, campo.key).trim()) {
      errors.push(`${campo.rotulo}: campo obrigatório.`);
    }
    if (campo.tipo === 'json') {
      const bruto = acao.settings?.[campo.key];
      if (bruto !== undefined && (!bruto || typeof bruto !== 'object' || Array.isArray(bruto))) {
        errors.push(`${campo.rotulo}: informe um objeto JSON válido.`);
      }
    }
  }
  if (tipo?.tipo === 'SetVariable' || tipo?.tipo === 'DeleteVariable') {
    const nome = fieldValue(acao, 'variable').trim();
    if (nome && !/^[a-zA-Z0-9.]+$/.test(nome)) {
      errors.push('O nome da variável de entrada só pode ter letras, números e pontos.');
    }
  }
  for (const c of acao.conditions ?? []) {
    const error = conditionError(c);
    if (error && !errors.includes(error)) errors.push(error);
  }
  return errors;
}

export type ActionsList = '$enteringCustomActions' | '$leavingCustomActions';

export type ResultadoDeAcao = { ok: true; block: Block } | { ok: false; error: string };

export function adicionarAcao(
  block: Block,
  lista: ActionsList,
  acao: AcaoDoEditor,
): ResultadoDeAcao {
  const current = block[lista] ?? [];
  if (current.length >= ACTIONS_LIMIT) return { ok: false, error: LABELS_OF_ACTIONS.limite };
  return { ok: true, block: { ...block, [lista]: [...current, acao] } };
}

/** Paste a full selection atomically or change nothing; copies must not share settings objects or IDs. */
export function pasteActions(
  block: Block,
  lista: ActionsList,
  copiadas: readonly AcaoDoEditor[],
): ResultadoDeAcao {
  const current = block[lista] ?? [];
  if (current.length + copiadas.length > ACTIONS_LIMIT)
    return { ok: false, error: LABELS_OF_ACTIONS.limite };
  return {
    ok: true,
    block: {
      ...block,
      [lista]: [
        ...current,
        ...copiadas.map((acao) => ({ ...structuredClone(acao), $id: gerarId() })),
      ],
    },
  };
}

export function substituirAcao(
  block: Block,
  lista: ActionsList,
  indice: number,
  acao: AcaoDoEditor,
): Block {
  const current = block[lista] ?? [];
  return { ...block, [lista]: current.map((a, i) => (i === indice ? acao : a)) };
}

export function removerAcao(block: Block, lista: ActionsList, indice: number): Block {
  const current = block[lista] ?? [];
  return { ...block, [lista]: current.filter((_, i) => i !== indice) };
}

/** Move an action up/down in execution order. */
export function moverAcao(block: Block, lista: ActionsList, de: number, para: number): Block {
  const current = [...(block[lista] ?? [])];
  if (de < 0 || de >= current.length || para < 0 || para >= current.length || de === para)
    return block;
  const [acao] = current.splice(de, 1);
  current.splice(para, 0, acao!);
  return { ...block, [lista]: current };
}
