import { CONTEUDOS_SEM_EFEITO, CONTEUDOS_SUPORTADOS, engineContentErrors } from '@pipe/core';
import type { Block, EditorInbound, ItemDeConteudo, InboundValidation } from './model';
import { LABEL_OF_INBOUND, card, gerarId, newInbound } from './model';

/**
 * Block Content tab follows Blip's conversation-like `$contentActions` cards, robot utterances left and user input right. Pipe resolves HTTP and dynamic-content envelopes immediately before channel delivery; the native survey MIME is recognized here even though its dedicated block owns the survey lifecycle. Limits match editor copy: 25 content items per block, menus up to 10 options of 24 characters, quick replies up to 3 options of 20 characters.
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
  entrada: LABEL_OF_INBOUND,
  digitando: 'Digitando',
  dinamico: 'Conteúdo dinâmico',
  http: 'Conteúdo HTTP',
  pesquisa: 'Pesquisa',
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
  figurinha: 'Figurinha',
  audio: 'Áudio',
  imagem: 'Imagem',
  video: 'Vídeo',
  documento: 'Documento',
  campoUri: 'Link do arquivo',
  campoLegenda: 'Legenda (opcional)',
} as const;

export const TIPO_TEXTO = 'text/plain';
export const TIPO_SELECT = 'application/vnd.lime.select+json';
export const TIPO_DIGITANDO = 'application/vnd.lime.chatstate+json';
export const TIPO_MEDIA = 'application/vnd.lime.media-link+json';
export const TIPO_PEDIR_LOCALIZACAO = 'application/vnd.lime.input+json';
export const TIPO_LOCALIZACAO = 'application/vnd.lime.location+json';
export const TIPO_WEB_LINK = 'application/vnd.lime.web-link+json';
export const TIPO_CONTEUDO_HTTP = 'application/vnd.pipe.http-content+json';
export const TIPO_CONTEUDO_DINAMICO = 'application/vnd.pipe.dynamic-content+json';
export const TIPO_PESQUISA = 'application/vnd.lime.satisfaction-survey+json';

/**
 * `$typeOfContent` per media card, in the frozen inventory's menu order (items 1-5 of 18,
 * `ref/inventario-conteudo.md`). The reference does not distinguish them at the MIME/motor
 * level — only the editor remembers which card the author picked, the same way it already
 * does for Menu vs Quick reply on `application/vnd.lime.select+json`.
 */
export const TYPES_OF_MEDIA_CARD = ['sticker', 'audio', 'image', 'video', 'document'] as const;
export type TypeOfMediaCard = (typeof TYPES_OF_MEDIA_CARD)[number];

/** Default real MIME per card: there is no upload widget yet (`ref/inventario-conteudo.md`, capturas #4-#8 pendentes), so the author supplies the link and this fills the `media-link` `type` field the motor validates. */
const MEDIA_MIME_DEFAULT: Record<TypeOfMediaCard, string> = {
  sticker: 'image/webp',
  audio: 'audio/mp3',
  image: 'image/png',
  video: 'video/mp4',
  document: 'application/pdf',
};

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
  | { indice: number; tipo: 'pedirLocalizacao'; texto: string }
  | { indice: number; tipo: 'localizacao'; latitude: string; longitude: string }
  | { indice: number; tipo: 'webLink'; uri: string; texto: string }
  | { indice: number; tipo: 'http'; uri: string; mime: string; cabecalhos: string; timeout: string }
  | { indice: number; tipo: 'dinamico'; variavel: string }
  | { indice: number; tipo: 'pesquisa' }
  | {
      indice: number;
      tipo: 'midia';
      midia: TypeOfMediaCard;
      uri: string;
      legenda: string;
      settings: unknown;
    }
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

/**
 * `media-link` category to reopen the right card: prefer the editor's own `$typeOfContent`
 * (what the author picked); a block never edited here (imported, or another future card of
 * this same envelope) falls back to the real MIME prefix, same rule `engineContentErrors`
 * (`@pipe/core`) uses to validate — figurinha and imagem both read as `image` then, since
 * the reference does not distinguish them beyond MIME either.
 */
function categoriaDaMidia(typeOfContent: string, mimeReal: string): TypeOfMediaCard {
  if ((TYPES_OF_MEDIA_CARD as readonly string[]).includes(typeOfContent)) {
    return typeOfContent as TypeOfMediaCard;
  }
  const m = mimeReal.toLowerCase();
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('image/')) return 'image';
  return 'document';
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
    } else if (acao.type === 'SendMessage' && mime === TIPO_PEDIR_LOCALIZACAO) {
      cards.push({ indice, tipo: 'pedirLocalizacao', texto: texto((acao.settings?.['content'] as { text?: unknown })?.text) });
    } else if (acao.type === 'SendMessage' && mime === TIPO_LOCALIZACAO) {
      const localizacao = acao.settings?.['content'] as { latitude?: unknown; longitude?: unknown };
      cards.push({ indice, tipo: 'localizacao', latitude: texto(localizacao?.latitude), longitude: texto(localizacao?.longitude) });
    } else if (acao.type === 'SendMessage' && mime === TIPO_WEB_LINK) {
      const link = acao.settings?.['content'] as { uri?: unknown; text?: unknown };
      cards.push({ indice, tipo: 'webLink', uri: texto(link?.uri), texto: texto(link?.text) });
    } else if (acao.type === 'SendMessage' && mime === TIPO_CONTEUDO_HTTP) {
      const http = (acao.settings?.['content'] ?? {}) as { uri?: unknown; type?: unknown; headers?: unknown; requestTimeout?: unknown };
      cards.push({ indice, tipo: 'http', uri: texto(http.uri), mime: texto(http.type), cabecalhos: JSON.stringify(http.headers ?? {}), timeout: texto(http.requestTimeout ?? 60) });
    } else if (acao.type === 'SendRawMessage' && mime === TIPO_CONTEUDO_DINAMICO) {
      let variavel = '';
      try { variavel = texto((JSON.parse(texto(acao.settings?.['rawContent'])) as { variable?: unknown }).variable); } catch {}
      cards.push({ indice, tipo: 'dinamico', variavel });
    } else if (mime === TIPO_PESQUISA) {
      cards.push({ indice, tipo: 'pesquisa' });
    } else if (acao.type === 'SendMessage' && mime === TIPO_MEDIA) {
      const conteudoMidia = (acao.settings?.['content'] ?? {}) as { uri?: unknown; type?: unknown; title?: unknown };
      cards.push({
        indice,
        tipo: 'midia',
        midia: categoriaDaMidia(texto(acao['$typeOfContent']), texto(conteudoMidia.type)),
        uri: texto(conteudoMidia.uri),
        legenda: texto(conteudoMidia.title),
        settings: acao.settings,
      });
    } else {
      const suportado =
        acao.type === 'SendRawMessage' ? mime === TIPO_TEXTO : CONTEUDOS_SUPORTADOS.has(mime) || CONTEUDOS_SEM_EFEITO.has(mime);
      cards.push({ indice, tipo: 'outro', mime: mime || acao.type, suportado });
    }
  });
  return cards;
}

export const hasInbound = (block: Block): boolean => (block.$contentActions ?? []).some((c) => c.input);

function fala(id: string, mime: string, conteudo: unknown, cardType: string): ItemDeConteudo {
  return {
    action: {
      $id: id,
      $typeOfContent: cardType,
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

export function novoDigitando(id = gerarId()): ItemDeConteudo {
  return fala(id, TIPO_DIGITANDO, { state: 'composing' }, 'typing');
}

export function novoPedirLocalizacao(conteudo = 'Envie sua localização.', id = gerarId()): ItemDeConteudo {
  return fala(id, TIPO_PEDIR_LOCALIZACAO, { text: conteudo }, 'ask-location');
}

export function novaLocalizacao(latitude = '', longitude = '', id = gerarId()): ItemDeConteudo {
  return fala(id, TIPO_LOCALIZACAO, { latitude: Number(latitude), longitude: Number(longitude) }, 'location');
}

export function novoWebLink(uri = '', conteudo = '', id = gerarId()): ItemDeConteudo {
  return fala(id, TIPO_WEB_LINK, { uri, text: conteudo, target: 'blank' }, 'web-link');
}

export function novoConteudoHttp(uri = '', mime = 'text/plain', cabecalhos: Record<string, string> = {}, timeout = 60, id = gerarId()): ItemDeConteudo {
  return fala(id, TIPO_CONTEUDO_HTTP, { uri, type: mime, headers: cabecalhos, requestTimeout: timeout }, 'http-content');
}

export function novoConteudoDinamico(variavel = '', id = gerarId()): ItemDeConteudo {
  return {
    action: {
      $id: id, $typeOfContent: 'raw-content', type: 'SendRawMessage',
      settings: { id, type: TIPO_CONTEUDO_DINAMICO, rawContent: JSON.stringify({ variable: variavel }) },
      $cardContent: card(id, TIPO_CONTEUDO_DINAMICO, variavel, 'left'),
    },
    $invalid: false,
  };
}

/** Shared by the five `conteudo-midia` cards: `uri` is what the inventory confirms as required for all of them, `title` the optional caption they also share (`ref/inventario-conteudo.md`). */
function novaMidia(cardType: TypeOfMediaCard, uri: string, legenda: string, id: string): ItemDeConteudo {
  const content: Record<string, unknown> = { uri, type: MEDIA_MIME_DEFAULT[cardType] };
  if (legenda.trim()) content['title'] = legenda;
  return fala(id, TIPO_MEDIA, content, cardType);
}

export function novaFigurinha(uri = '', legenda = '', id = gerarId()): ItemDeConteudo {
  return novaMidia('sticker', uri, legenda, id);
}

export function novoAudio(uri = '', legenda = '', id = gerarId()): ItemDeConteudo {
  return novaMidia('audio', uri, legenda, id);
}

export function novaImagem(uri = '', legenda = '', id = gerarId()): ItemDeConteudo {
  return novaMidia('image', uri, legenda, id);
}

export function novoVideo(uri = '', legenda = '', id = gerarId()): ItemDeConteudo {
  return novaMidia('video', uri, legenda, id);
}

export function novoDocumento(uri = '', legenda = '', id = gerarId()): ItemDeConteudo {
  return novaMidia('document', uri, legenda, id);
}

export type ResultadoDeConteudo = { ok: true; block: Block } | { ok: false; error: string };

/**
 * Add content BEFORE user input: input remains last because the engine sends messages before waiting (`converterEstado` stores `input` outside the action list, while cards show the user's order).
 */
export function adicionarConteudo(block: Block, item: ItemDeConteudo): ResultadoDeConteudo {
  const current = block.$contentActions ?? [];
  if (current.length >= LIMITE_DE_CONTEUDOS) return { ok: false, error: ROTULOS_DO_CONTEUDO.limite };
  const inboundIndex = current.findIndex((c) => c.input);
  const lista = [...current];
  if (item.input) {
    if (inboundIndex >= 0) return { ok: true, block };
    lista.push(item);
  } else if (inboundIndex >= 0) {
    lista.splice(inboundIndex, 0, item);
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

/** Change a media card's link and caption while preserving its real MIME (`content.type`). */
export function definirMidia(block: Block, indice: number, uri: string, legenda: string): Block {
  const lista = (block.$contentActions ?? []).map((item, i) => {
    if (i !== indice) return item;
    return comSettings(item, (s) => {
      const atual = (s['content'] ?? {}) as Record<string, unknown>;
      const content: Record<string, unknown> = { ...atual, uri };
      if (legenda.trim()) content['title'] = legenda;
      else delete content['title'];
      return { ...s, content };
    });
  });
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

export function definirConteudoInterativo(block: Block, indice: number, conteudo: Record<string, unknown>): Block {
  return {
    ...block,
    $contentActions: (block.$contentActions ?? []).map((item, i) =>
      i === indice ? comSettings(item, (settings) => ({ ...settings, content: conteudo })) : item,
    ),
  };
}

export function definirConteudoHttp(block: Block, indice: number, conteudo: Record<string, unknown>): Block {
  return definirConteudoInterativo(block, indice, conteudo);
}

export function definirConteudoDinamico(block: Block, indice: number, variavel: string): Block {
  return {
    ...block,
    $contentActions: (block.$contentActions ?? []).map((item, i) => i === indice
      ? comSettings(item, (settings) => ({ ...settings, rawContent: JSON.stringify({ variable: variavel }) }))
      : item),
  };
}

/** Replace a block's `input`; do nothing when no input exists. */
export function setInbound(block: Block, inbound: EditorInbound): Block {
  const lista = (block.$contentActions ?? []).map((item) => (item.input ? { ...item, input: inbound } : item));
  return { ...block, $contentActions: lista };
}

/** Aguardar resposta enables waiting; Não aguardar maps to `bypass`. Create an input if none exists. */
export function definirEspera(block: Block, aguardar: boolean): Block {
  const inbound = (block.$contentActions ?? []).find((c) => c.input)?.input;
  if (inbound) return setInbound(block, { ...inbound, bypass: !aguardar });
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
    // Same function the motor calls at publish time (`engineContentErrors`, `@pipe/core`):
    // required field and per-category format/size limit share one literal message (D-24).
    if (c.tipo === 'midia') {
      for (const erro of engineContentErrors(TIPO_MEDIA, c.settings)) errors.push(erro);
    }
    if (c.tipo === 'pedirLocalizacao' && !c.texto.trim()) errors.push('Pedir localização: texto obrigatório.');
    if (c.tipo === 'localizacao') {
      for (const erro of engineContentErrors(TIPO_LOCALIZACAO, {
        content: { latitude: Number(c.latitude), longitude: Number(c.longitude) },
      })) errors.push(erro);
    }
    if (c.tipo === 'webLink') {
      for (const erro of engineContentErrors(TIPO_WEB_LINK, { content: { uri: c.uri } })) errors.push(erro);
    }
    if (c.tipo === 'http') {
      if (!c.uri.trim()) errors.push('Conteúdo HTTP: URL obrigatória.');
      if (!c.mime.trim()) errors.push('Conteúdo HTTP: MIME type obrigatório.');
      try { JSON.parse(c.cabecalhos); } catch { errors.push('Conteúdo HTTP: cabeçalhos devem ser JSON válido.'); }
    }
    if (c.tipo === 'dinamico' && !c.variavel.trim()) errors.push('Conteúdo dinâmico: variável obrigatória.');
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
