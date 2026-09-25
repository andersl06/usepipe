import { PROVEDOR_PADRAO } from '@pipe/core';
import type { ConditionBlip } from '@pipe/core';
import type { AcaoDoEditor, Block } from './model';
import { gerarId } from './model';
import { conditionError } from './conditions';

/**
 * As ações de entrada e de saída do bloco — a aba "Ações" do editor da Blip
 * ("Ações de Entrada" / "Ações de Saída", `builder-tabs-actions`), restrita ao
 * que o motor do Pipe EXECUTA (`PROVEDOR_PADRAO` em `packages/core/src/fluxo/
 * acoes.ts`).
 *
 * Do provedor, o que entra no menu "ADICIONAR FERRAMENTAS" do editor:
 * - `SetVariable` → "Definir variável" (Manipular);
 * - `DeleteVariable` → "Excluir variável" (Manipular — o editor da Blip não a
 *   oferece no menu, mas o motor a executa; o rótulo é nosso);
 * - `TrackEvent` → "Registrar eventos" (Manipular), painel "Registro de eventos";
 * - `Redirect` → "Redirecionar para serviço" (Executar), painel "Redirecionar a
 *   um serviço".
 *
 * Também executadas, mas NÃO oferecidas: `SendMessage` e `SendRawMessage` são
 * conteúdo do bloco (aba "Conteúdo"), não ação; `ForwardToDesk`,
 * `LeavingFromDesk` e `CreateTicket` são o miolo do bloco "Humano" — o editor
 * as cria com o bloco e esconde a aba ("o bot não deve interferir nas ações de
 * entrada e saída"). Tudo o que o motor não executa (`ExecuteScript`,
 * `MergeContact`…) aparece só para leitura quando veio num
 * fluxo importado, com a marca "Não executada no Pipe", e pode ser excluído.
 *
 * Limite do editor: 15 ações por lista ("Limite de 15 ações atingidos").
 */

export const ACTIONS_LIMIT = 15;

export interface CampoDaAcao {
  /** A chave em `settings` — com ponto para chave aninhada (`context.type`). */
  key: string;
  rotulo: string;
  ajuda?: string;
  obrigatorio?: boolean;
  /** `texto` é uma linha; `longo` é área de texto. */
  tipo?: 'texto' | 'longo' | 'json' | 'cabecalhos';
  /** Valores fechados usam o mesmo seletor do Builder. */
  options?: readonly string[];
}

export interface TipoDeAcao {
  tipo: string;
  /** O nome no menu "ADICIONAR FERRAMENTAS". */
  rotulo: string;
  /** O título do painel da ação. */
  titulo: string;
  grupo: 'Executar' | 'Manipular';
  info?: string;
  campos: CampoDaAcao[];
}

export const CATALOGO_OF_ACTIONS: readonly TipoDeAcao[] = [
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
    ],
  },
];

export const ROTULOS_OF_ACTIONS = {
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

/** Ações que o motor executa e que são do bloco "Humano", não da pessoa. */
export const ACTIONS_OF_SISTEMA = new Set(['ForwardToDesk', 'LeavingFromDesk', 'CreateTicket']);

export const tipoDeAcao = (tipo: string): TipoDeAcao | undefined =>
  CATALOGO_OF_ACTIONS.find((t) => t.tipo === tipo);

export const rotuloDaAcao = (tipo: string): string => tipoDeAcao(tipo)?.titulo ?? tipo;

/** O motor não a executa: em tempo de execução, lança e a conversa cai na fila. */
export const acaoSemSuporte = (acao: AcaoDoEditor): boolean => !PROVEDOR_PADRAO.has(acao.type);

export const acaoDoSistema = (acao: AcaoDoEditor): boolean => ACTIONS_OF_SISTEMA.has(acao.type);

/** A ação como o "+" a cria: sem título, configurações vazias, sem condição. */
export function novaAcao(tipo: string, id = gerarId()): AcaoDoEditor {
  return {
    $id: id,
    $title: '',
    type: tipo,
    settings: tipo === 'ProcessHttp' ? { method: 'GET' } : {},
    conditions: [],
    $invalid: false,
  };
}

const partes = (key: string): string[] => key.split('.');

/** Lê `settings.a.b` — o Newtonsoft casa chave sem diferenciar maiúscula, e a tela também. */
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

/** Grava `settings.a.b`; texto vazio apaga a chave. */
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
  // Objeto aninhado que ficou vazio some junto (`context: {}` não é contexto).
  for (const parte of caminho.slice(0, -1)) {
    const filho = settings[parte];
    if (filho && typeof filho === 'object' && Object.keys(filho).length === 0)
      delete settings[parte];
  }
  return { ...acao, settings };
}

/** Cabeçalhos precisam continuar objeto no fluxo; texto inválido fica visível para a validação. */
export function comCampoJson(acao: AcaoDoEditor, key: string, value: string): AcaoDoEditor {
  if (!value.trim()) return comCampo(acao, key, '');
  try {
    const json: unknown = JSON.parse(value);
    if (json && typeof json === 'object' && !Array.isArray(json)) {
      return withValue(acao, key, json);
    }
  } catch {
    // A validação abaixo aponta o campo sem apagar o texto digitado.
  }
  return comCampo(acao, key, value);
}

export interface CabecalhoHttp {
  key: string;
  value: string;
}

/** O fluxo guarda cabeçalhos como objeto; o Builder os edita em pares chave/valor. */
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

/** O que falta na ação, nas frases do painel. Ação que o motor não executa não é conferida. */
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

export type ActionsLista = '$enteringCustomActions' | '$leavingCustomActions';

export type ResultadoDeAcao = { ok: true; block: Block } | { ok: false; error: string };

export function adicionarAcao(
  block: Block,
  lista: ActionsLista,
  acao: AcaoDoEditor,
): ResultadoDeAcao {
  const current = block[lista] ?? [];
  if (current.length >= ACTIONS_LIMIT) return { ok: false, error: ROTULOS_OF_ACTIONS.limite };
  return { ok: true, block: { ...block, [lista]: [...current, acao] } };
}

/** Cola uma seleção inteira ou não altera nada; cópias nunca compartilham settings/ids. */
export function colarActions(
  block: Block,
  lista: ActionsLista,
  copiadas: readonly AcaoDoEditor[],
): ResultadoDeAcao {
  const current = block[lista] ?? [];
  if (current.length + copiadas.length > ACTIONS_LIMIT)
    return { ok: false, error: ROTULOS_OF_ACTIONS.limite };
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
  lista: ActionsLista,
  indice: number,
  acao: AcaoDoEditor,
): Block {
  const current = block[lista] ?? [];
  return { ...block, [lista]: current.map((a, i) => (i === indice ? acao : a)) };
}

export function removerAcao(block: Block, lista: ActionsLista, indice: number): Block {
  const current = block[lista] ?? [];
  return { ...block, [lista]: current.filter((_, i) => i !== indice) };
}

/** Sobe ou desce uma ação — elas rodam na ordem da lista. */
export function moverAcao(block: Block, lista: ActionsLista, de: number, para: number): Block {
  const current = [...(block[lista] ?? [])];
  if (de < 0 || de >= current.length || para < 0 || para >= current.length || de === para)
    return block;
  const [acao] = current.splice(de, 1);
  current.splice(para, 0, acao!);
  return { ...block, [lista]: current };
}
