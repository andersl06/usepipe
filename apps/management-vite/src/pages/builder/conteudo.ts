import { CONTEUDOS_SEM_EFEITO, CONTEUDOS_SUPORTADOS } from '@pipe/core';
import type { Block, EditorInbound, ItemDeConteudo, InboundValidation } from './model';
import { ROTULO_OF_INBOUND, card, gerarId, newInbound } from './model';

/**
 * Block Content tab follows Blip's conversation-like `$contentActions` cards, robot utterances left and user input right. Offer only Pipe channel `CONTEUDOS_SUPORTADOS` (`packages/core/src/fluxo/editor.ts`): text `text/plain` and two `application/vnd.lime.select+json` variants, Menu without `scope` and Quick reply with `scope: "immediate"`. Other Blip menu types (image, audio, video, document, sticker, carousel, HTTP, dynamic content, survey, location, web link, call request) are rejected on publish as unsupported `conteudo:<mime>`. Imported `chatstate` Typing appears but cannot be newly created and runs without effect. Limits match editor copy: 25 content items per block, menus up to 10 options of 24 characters, quick replies up to 3 options of 20 characters.
 */

export const LIMITE_DE_CONTEUDOS = 25;
export const LIMITE_DO_MENU = { opcoes: 10, caracteres: 24 } as const;
export const LIMITE_DO_QUICK_REPLY = { opcoes: 3, caracteres: 20 } as const;

export const ROTULOS_DO_CONTEUDO = {
  aba: 'Conteúdo',
  abaAtendimento: 'Atendimento',
  texto: 'Texto',
  menu: 'Menu',
  quickReply: 'Quick reply',
  entrada: ROTULO_OF_INBOUND,
  digitando: 'Digitando',
  dinamico: 'Conteúdo dinâmico',
  limite: 'Limite de 25 conteúdos atingido',
  limiteDoMenu: 'Para WhastApp, defina até 10 opções para o menu, com no máximo 24 caracteres cada.',
  limiteDoQuickReply: 'Para WhastApp, defina até 3 opções para o Quick Reply, com até 20 caracteres cada.',
  aguardando: 'Aguardando resposta do usuário',
  direto: 'Ir direto para o próximo passo',
  aguardar: 'Aguardar resposta',
  naoAguardar: 'Não aguardar',
  salvarEmVariavel: 'Salvar resposta em variável',
  salvarEmVariavelInfo: 'Para incluir esta variável no fluxo, utilize {{NomeDaVariável}}',
  variavel: 'Variável',
  validar: 'Validar a entrada do usuário',
  tipoDeValidacao: 'Tipo de validação',
  instrucao: 'Instrução de validação',
  regex: 'Expressão regular',
  tipoDeMidia: 'Tipo',
  adicionar: 'Adicionar conteúdo',
  naoSuportado: 'Conteúdo que o Pipe não envia',
} as const;

export const TIPO_TEXTO = 'text/plain';
export const TIPO_SELECT = 'application/vnd.lime.select+json';
export const TIPO_DIGITANDO = 'application/vnd.lime.chatstate+json';

/** The input validation rules, with the label of the editor's `bds-select`. */
export const RULES_OF_VALIDATION = [
  { valor: 'text', rotulo: 'Texto' },
  { valor: 'number', rotulo: 'Número' },
  { valor: 'date', rotulo: 'Data' },
  { valor: 'regex', rotulo: 'Expressão regular' },
  { valor: 'type', rotulo: 'Tipo' },
] as const;

/** The "Instrução de validação" (validation instruction) the editor suggests per rule. */
export const INSTRUCTION_DEFAULT: Record<string, string> = {
  text: 'Digite um texto',
  number: 'Digite um número válido',
  date: 'Por favor, utilize o formato DD/MM/YYYY',
  regex: 'Digite de acordo com o padrão acima',
  type: 'Não entendi, formato não esperado',
};

export interface MenuOption {
  text: string;
  value?: unknown;
}

export type Card =
  | { indice: number; tipo: 'texto'; texto: string }
  | { indice: number; tipo: 'menu' | 'quickReply'; texto: string; options: MenuOption[] }
  | { indice: number; tipo: 'entrada'; inbound: EditorInbound }
  | { indice: number; tipo: 'digitando' }
  | { indice: number; tipo: 'outro'; mime: string; suportado: boolean };

const texto = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

function lerSelect(conteudo: unknown): { texto: string; options: MenuOption[]; imediato: boolean } {
  const c = (conteudo ?? {}) as { text?: unknown; scope?: unknown; options?: unknown };
  const options = Array.isArray(c.options)
    ? c.options.map((o) => {
        const option = (o ?? {}) as { text?: unknown; value?: unknown };
        return { text: texto(option.text), ...(option.value !== undefined ? { value: option.value } : {}) };
      })
    : [];
  return { texto: texto(c.text), options, imediato: c.scope === 'immediate' };
}

/** Render block `$contentActions` as cards in robot-send order. */
export function cardsOf(block: Block): Card[] {
  const cards: Card[] = [];
  (block.$contentActions ?? []).forEach((item, indice) => {
    if (item.input) {
      cards.push({ indice, tipo: 'entrada', inbound: item.input });
      return;
    }
    const acao = item.action;
    if (!acao) return;
    const mime = texto(acao.settings?.['type']);
    if (acao.type === 'SendMessage' && mime === TIPO_TEXTO) {
      cards.push({ indice, tipo: 'texto', texto: texto(acao.settings?.['content']) });
    } else if (acao.type === 'SendMessage' && mime === TIPO_SELECT) {
      const lido = lerSelect(acao.settings?.['content']);
      cards.push({ indice, tipo: lido.imediato ? 'quickReply' : 'menu', texto: lido.texto, options: lido.options });
    } else if (acao.type === 'SendMessage' && mime === TIPO_DIGITANDO) {
      cards.push({ indice, tipo: 'digitando' });
    } else {
      const suportado =
        acao.type === 'SendRawMessage' ? mime === TIPO_TEXTO : CONTEUDOS_SUPORTADOS.has(mime) || CONTEUDOS_SEM_EFEITO.has(mime);
      cards.push({ indice, tipo: 'outro', mime: mime || acao.type, suportado });
    }
  });
  return cards;
}

export const temInbound = (block: Block): boolean => (block.$contentActions ?? []).some((c) => c.input);

function fala(id: string, mime: string, conteudo: unknown, cardTipo: string): ItemDeConteudo {
  return {
    action: {
      $id: id,
      $typeOfContent: cardTipo,
      type: 'SendMessage',
      settings: { id, type: mime, content: conteudo },
      $cardContent: card(id, mime, conteudo, 'left'),
    },
    $invalid: false,
  };
}

export function novoTexto(conteudo = '', id = gerarId()): ItemDeConteudo {
  return fala(id, TIPO_TEXTO, conteudo, 'text');
}

export function novoMenu(conteudo = '', options: MenuOption[] = [], id = gerarId()): ItemDeConteudo {
  return fala(id, TIPO_SELECT, { text: conteudo, options: options }, 'select');
}

export function novoQuickReply(conteudo = '', options: MenuOption[] = [], id = gerarId()): ItemDeConteudo {
  return fala(id, TIPO_SELECT, { text: conteudo, scope: 'immediate', options: options }, 'select-immediate');
}

export type ResultadoDeConteudo = { ok: true; block: Block } | { ok: false; error: string };

/**
 * Add content BEFORE user input: input remains last because the engine sends messages before waiting (`converterEstado` stores `input` outside the action list, while cards show the user's order).
 */
export function adicionarConteudo(block: Block, item: ItemDeConteudo): ResultadoDeConteudo {
  const current = block.$contentActions ?? [];
  if (current.length >= LIMITE_DE_CONTEUDOS) return { ok: false, error: ROTULOS_DO_CONTEUDO.limite };
  const inboundIndice = current.findIndex((c) => c.input);
  const lista = [...current];
  if (item.input) {
    if (inboundIndice >= 0) return { ok: true, block };
    lista.push(item);
  } else if (inboundIndice >= 0) {
    lista.splice(inboundIndice, 0, item);
  } else {
    lista.push(item);
  }
  return { ok: true, block: { ...block, $contentActions: lista } };
}

export function removerConteudo(block: Block, indice: number): Block {
  return { ...block, $contentActions: (block.$contentActions ?? []).filter((_, i) => i !== indice) };
}

/** Move a robot utterance up/down; user input stays last. */
export function moverConteudo(block: Block, de: number, para: number): Block {
  const lista = [...(block.$contentActions ?? [])];
  if (de < 0 || de >= lista.length || para < 0 || para >= lista.length || de === para) return block;
  if (lista[de]!.input || lista[para]!.input) return block;
  const [item] = lista.splice(de, 1);
  lista.splice(para, 0, item!);
  return { ...block, $contentActions: lista };
}

function comSettings(item: ItemDeConteudo, mudar: (s: Record<string, unknown>) => Record<string, unknown>): ItemDeConteudo {
  const acao = item.action;
  if (!acao) return item;
  const settings = mudar({ ...(acao.settings ?? {}) });
  const cardContent = acao.$cardContent as { document?: Record<string, unknown> } | undefined;
  return {
    ...item,
    action: {
      ...acao,
      settings,
      ...(cardContent?.document
        ? { $cardContent: { ...cardContent, document: { ...cardContent.document, content: settings['content'] } } }
        : {}),
    },
  };
}

export function definirTexto(block: Block, indice: number, conteudo: string): Block {
  const lista = (block.$contentActions ?? []).map((item, i) =>
    i === indice ? comSettings(item, (s) => ({ ...s, content: conteudo })) : item,
  );
  return { ...block, $contentActions: lista };
}

/** Change text and options of a menu or quick reply while preserving `scope`. */
export function definirMenu(block: Block, indice: number, conteudo: string, options: MenuOption[]): Block {
  const lista = (block.$contentActions ?? []).map((item, i) => {
    if (i !== indice) return item;
    return comSettings(item, (s) => {
      const atual = (s['content'] ?? {}) as Record<string, unknown>;
      return { ...s, content: { ...atual, text: conteudo, options: options } };
    });
  });
  return { ...block, $contentActions: lista };
}

/** Replace a block's `input`; do nothing when no input exists. */
export function definirInbound(block: Block, inbound: EditorInbound): Block {
  const lista = (block.$contentActions ?? []).map((item) => (item.input ? { ...item, input: inbound } : item));
  return { ...block, $contentActions: lista };
}

/** Aguardar resposta enables waiting; Não aguardar maps to `bypass`. Create an input if none exists. */
export function definirEspera(block: Block, aguardar: boolean): Block {
  const inbound = (block.$contentActions ?? []).find((c) => c.input)?.input;
  if (inbound) return definirInbound(block, { ...inbound, bypass: !aguardar });
  const nova = newInbound();
  nova.input!.bypass = !aguardar;
  const r = adicionarConteudo(block, nova);
  return r.ok ? r.block : block;
}

/** Return validation with a substituted rule and prefilled instruction, as the editor does. */
export function validationWithRule(atual: InboundValidation | null | undefined, regra: string): InboundValidation {
  return {
    rule: regra,
    error: atual?.error?.trim() ? atual.error : INSTRUCTION_DEFAULT[regra] ?? '',
    ...(regra === 'regex' ? { regex: atual?.regex ?? '' } : {}),
    ...(regra === 'type' ? { type: atual?.type ?? '' } : {}),
  };
}

/** Show block-content errors in panel wording. */
export function contentErrors(block: Block): string[] {
  const errors: string[] = [];
  for (const c of cardsOf(block)) {
    if (c.tipo === 'texto' && !c.texto.trim()) errors.push('Texto: campo obrigatório.');
    if (c.tipo === 'menu' || c.tipo === 'quickReply') {
      const limite = c.tipo === 'menu' ? LIMITE_DO_MENU : LIMITE_DO_QUICK_REPLY;
      if (!c.texto.trim()) errors.push(`${c.tipo === 'menu' ? 'Menu' : 'Quick reply'}: texto obrigatório.`);
      if (c.options.length === 0) errors.push(`${c.tipo === 'menu' ? 'Menu' : 'Quick reply'}: informe ao menos uma opção.`);
      if (c.options.some((o) => !o.text.trim())) errors.push('Opção sem texto.');
      if (c.options.length > limite.opcoes || c.options.some((o) => o.text.length > limite.caracteres)) {
        errors.push(c.tipo === 'menu' ? ROTULOS_DO_CONTEUDO.limiteDoMenu : ROTULOS_DO_CONTEUDO.limiteDoQuickReply);
      }
    }
    if (c.tipo === 'entrada') {
      const e = c.inbound;
      if (e.variable?.trim() && !/^[a-zA-Z0-9.]+$/.test(e.variable)) {
        errors.push('O nome da variável de entrada só pode ter letras, números e pontos.');
      }
      const v = e.validation;
      if (v) {
        if (v.rule === 'regex' && !v.regex?.trim()) errors.push('A expressão regular é obrigatória na regra de validação regex.');
        if (v.rule === 'type' && !v.type?.trim()) errors.push('O tipo de mídia é obrigatório na regra de validação type.');
        if (!v.error?.trim()) errors.push('A mensagem de erro da validação é obrigatória.');
      }
    }
  }
  return errors;
}
