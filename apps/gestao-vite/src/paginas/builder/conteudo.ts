import { CONTEUDOS_SEM_EFEITO, CONTEUDOS_SUPORTADOS } from '@pipe/core';
import type { Bloco, EntradaDoEditor, ItemDeConteudo, ValidacaoDaEntrada } from './modelo';
import { ROTULO_DA_ENTRADA, cartao, gerarId, novaEntrada } from './modelo';

/**
 * A aba "Conteúdo" do bloco: a sequência de cartões que o editor da Blip
 * desenha como uma conversa — as falas do robô à esquerda, a "Entrada do
 * usuário" à direita — sobre os `$contentActions` do bloco.
 *
 * O que a tela oferece é o que o canal do Pipe manda hoje
 * (`CONTEUDOS_SUPORTADOS` em `packages/core/src/fluxo/editor.ts`): "Texto"
 * (`text/plain`) e os dois `application/vnd.lime.select+json` — "Menu" (sem
 * `scope`) e "Quick reply" (`scope: "immediate"`, como o editor grava). Os outros
 * tipos do menu do editor (Imagem, Áudio, Vídeo, Documento, Figurinha,
 * Carrossel, Conteúdo HTTP, Conteúdo dinâmico, Pesquisa, localização, Web
 * link, Solicitar ligação) não entram: o motor os recusa ao publicar como
 * `conteudo:<mime>` não suportado. "Digitando" (`chatstate`) roda sem efeito
 * — carregado de um fluxo importado, aparece; não se cria.
 *
 * Limites literais do editor: 25 conteúdos por bloco ("Limite de 25 conteúdos
 * atingido"); menu com até 10 opções de 24 caracteres; quick reply com até 3
 * opções de 20 caracteres (os avisos do WhatsApp na aba).
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
  entrada: ROTULO_DA_ENTRADA,
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

/** As regras de validação da entrada, com o rótulo do `bds-select` do editor. */
export const REGRAS_DE_VALIDACAO = [
  { valor: 'text', rotulo: 'Texto' },
  { valor: 'number', rotulo: 'Número' },
  { valor: 'date', rotulo: 'Data' },
  { valor: 'regex', rotulo: 'Expressão regular' },
  { valor: 'type', rotulo: 'Tipo' },
] as const;

/** A "Instrução de validação" que o editor sugere por regra. */
export const INSTRUCAO_PADRAO: Record<string, string> = {
  text: 'Digite um texto',
  number: 'Digite um número válido',
  date: 'Por favor, utilize o formato DD/MM/YYYY',
  regex: 'Digite de acordo com o padrão acima',
  type: 'Não entendi, formato não esperado',
};

export interface OpcaoDoMenu {
  text: string;
  value?: unknown;
}

export type Cartao =
  | { indice: number; tipo: 'texto'; texto: string }
  | { indice: number; tipo: 'menu' | 'quickReply'; texto: string; opcoes: OpcaoDoMenu[] }
  | { indice: number; tipo: 'entrada'; entrada: EntradaDoEditor }
  | { indice: number; tipo: 'digitando' }
  | { indice: number; tipo: 'outro'; mime: string; suportado: boolean };

const texto = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

function lerSelect(conteudo: unknown): { texto: string; opcoes: OpcaoDoMenu[]; imediato: boolean } {
  const c = (conteudo ?? {}) as { text?: unknown; scope?: unknown; options?: unknown };
  const opcoes = Array.isArray(c.options)
    ? c.options.map((o) => {
        const opcao = (o ?? {}) as { text?: unknown; value?: unknown };
        return { text: texto(opcao.text), ...(opcao.value !== undefined ? { value: opcao.value } : {}) };
      })
    : [];
  return { texto: texto(c.text), opcoes, imediato: c.scope === 'immediate' };
}

/** Os `$contentActions` do bloco como cartões, na ordem em que o robô os manda. */
export function cartoesDe(bloco: Bloco): Cartao[] {
  const cartoes: Cartao[] = [];
  (bloco.$contentActions ?? []).forEach((item, indice) => {
    if (item.input) {
      cartoes.push({ indice, tipo: 'entrada', entrada: item.input });
      return;
    }
    const acao = item.action;
    if (!acao) return;
    const mime = texto(acao.settings?.['type']);
    if (acao.type === 'SendMessage' && mime === TIPO_TEXTO) {
      cartoes.push({ indice, tipo: 'texto', texto: texto(acao.settings?.['content']) });
    } else if (acao.type === 'SendMessage' && mime === TIPO_SELECT) {
      const lido = lerSelect(acao.settings?.['content']);
      cartoes.push({ indice, tipo: lido.imediato ? 'quickReply' : 'menu', texto: lido.texto, opcoes: lido.opcoes });
    } else if (acao.type === 'SendMessage' && mime === TIPO_DIGITANDO) {
      cartoes.push({ indice, tipo: 'digitando' });
    } else {
      const suportado =
        acao.type === 'SendRawMessage' ? mime === TIPO_TEXTO : CONTEUDOS_SUPORTADOS.has(mime) || CONTEUDOS_SEM_EFEITO.has(mime);
      cartoes.push({ indice, tipo: 'outro', mime: mime || acao.type, suportado });
    }
  });
  return cartoes;
}

export const temEntrada = (bloco: Bloco): boolean => (bloco.$contentActions ?? []).some((c) => c.input);

function fala(id: string, mime: string, conteudo: unknown, tipoDoCartao: string): ItemDeConteudo {
  return {
    action: {
      $id: id,
      $typeOfContent: tipoDoCartao,
      type: 'SendMessage',
      settings: { id, type: mime, content: conteudo },
      $cardContent: cartao(id, mime, conteudo, 'left'),
    },
    $invalid: false,
  };
}

export function novoTexto(conteudo = '', id = gerarId()): ItemDeConteudo {
  return fala(id, TIPO_TEXTO, conteudo, 'text');
}

export function novoMenu(conteudo = '', opcoes: OpcaoDoMenu[] = [], id = gerarId()): ItemDeConteudo {
  return fala(id, TIPO_SELECT, { text: conteudo, options: opcoes }, 'select');
}

export function novoQuickReply(conteudo = '', opcoes: OpcaoDoMenu[] = [], id = gerarId()): ItemDeConteudo {
  return fala(id, TIPO_SELECT, { text: conteudo, scope: 'immediate', options: opcoes }, 'select-immediate');
}

export type ResultadoDeConteudo = { ok: true; bloco: Bloco } | { ok: false; erro: string };

/**
 * Um cartão a mais, ANTES da entrada do usuário: a entrada é sempre o último
 * item — o motor manda as falas e só então espera (`converterEstado` põe o
 * `input` fora da lista de ações, mas a ordem dos cartões é o que a pessoa vê).
 */
export function adicionarConteudo(bloco: Bloco, item: ItemDeConteudo): ResultadoDeConteudo {
  const atuais = bloco.$contentActions ?? [];
  if (atuais.length >= LIMITE_DE_CONTEUDOS) return { ok: false, erro: ROTULOS_DO_CONTEUDO.limite };
  const indiceDaEntrada = atuais.findIndex((c) => c.input);
  const lista = [...atuais];
  if (item.input) {
    if (indiceDaEntrada >= 0) return { ok: true, bloco };
    lista.push(item);
  } else if (indiceDaEntrada >= 0) {
    lista.splice(indiceDaEntrada, 0, item);
  } else {
    lista.push(item);
  }
  return { ok: true, bloco: { ...bloco, $contentActions: lista } };
}

export function removerConteudo(bloco: Bloco, indice: number): Bloco {
  return { ...bloco, $contentActions: (bloco.$contentActions ?? []).filter((_, i) => i !== indice) };
}

/** Sobe ou desce uma fala. A entrada não sai do fim. */
export function moverConteudo(bloco: Bloco, de: number, para: number): Bloco {
  const lista = [...(bloco.$contentActions ?? [])];
  if (de < 0 || de >= lista.length || para < 0 || para >= lista.length || de === para) return bloco;
  if (lista[de]!.input || lista[para]!.input) return bloco;
  const [item] = lista.splice(de, 1);
  lista.splice(para, 0, item!);
  return { ...bloco, $contentActions: lista };
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

export function definirTexto(bloco: Bloco, indice: number, conteudo: string): Bloco {
  const lista = (bloco.$contentActions ?? []).map((item, i) =>
    i === indice ? comSettings(item, (s) => ({ ...s, content: conteudo })) : item,
  );
  return { ...bloco, $contentActions: lista };
}

/** O texto e as opções de um menu ou quick reply; o `scope` fica como está. */
export function definirMenu(bloco: Bloco, indice: number, conteudo: string, opcoes: OpcaoDoMenu[]): Bloco {
  const lista = (bloco.$contentActions ?? []).map((item, i) => {
    if (i !== indice) return item;
    return comSettings(item, (s) => {
      const atual = (s['content'] ?? {}) as Record<string, unknown>;
      return { ...s, content: { ...atual, text: conteudo, options: opcoes } };
    });
  });
  return { ...bloco, $contentActions: lista };
}

/** Troca a entrada do bloco (o item `input`). Sem entrada no bloco, nada muda. */
export function definirEntrada(bloco: Bloco, entrada: EntradaDoEditor): Bloco {
  const lista = (bloco.$contentActions ?? []).map((item) => (item.input ? { ...item, input: entrada } : item));
  return { ...bloco, $contentActions: lista };
}

/** "Aguardar resposta" liga a espera; "Não aguardar" é `bypass`. Sem entrada, cria uma. */
export function definirEspera(bloco: Bloco, aguardar: boolean): Bloco {
  const entrada = (bloco.$contentActions ?? []).find((c) => c.input)?.input;
  if (entrada) return definirEntrada(bloco, { ...entrada, bypass: !aguardar });
  const nova = novaEntrada();
  nova.input!.bypass = !aguardar;
  const r = adicionarConteudo(bloco, nova);
  return r.ok ? r.bloco : bloco;
}

/** A validação com a regra trocada: a instrução vem preenchida como no editor. */
export function validacaoComRegra(atual: ValidacaoDaEntrada | null | undefined, regra: string): ValidacaoDaEntrada {
  return {
    rule: regra,
    error: atual?.error?.trim() ? atual.error : INSTRUCAO_PADRAO[regra] ?? '',
    ...(regra === 'regex' ? { regex: atual?.regex ?? '' } : {}),
    ...(regra === 'type' ? { type: atual?.type ?? '' } : {}),
  };
}

/** Os erros do conteúdo do bloco, na frase do painel. */
export function errosDoConteudo(bloco: Bloco): string[] {
  const erros: string[] = [];
  for (const c of cartoesDe(bloco)) {
    if (c.tipo === 'texto' && !c.texto.trim()) erros.push('Texto: campo obrigatório.');
    if (c.tipo === 'menu' || c.tipo === 'quickReply') {
      const limite = c.tipo === 'menu' ? LIMITE_DO_MENU : LIMITE_DO_QUICK_REPLY;
      if (!c.texto.trim()) erros.push(`${c.tipo === 'menu' ? 'Menu' : 'Quick reply'}: texto obrigatório.`);
      if (c.opcoes.length === 0) erros.push(`${c.tipo === 'menu' ? 'Menu' : 'Quick reply'}: informe ao menos uma opção.`);
      if (c.opcoes.some((o) => !o.text.trim())) erros.push('Opção sem texto.');
      if (c.opcoes.length > limite.opcoes || c.opcoes.some((o) => o.text.length > limite.caracteres)) {
        erros.push(c.tipo === 'menu' ? ROTULOS_DO_CONTEUDO.limiteDoMenu : ROTULOS_DO_CONTEUDO.limiteDoQuickReply);
      }
    }
    if (c.tipo === 'entrada') {
      const e = c.entrada;
      if (e.variable?.trim() && !/^[a-zA-Z0-9.]+$/.test(e.variable)) {
        erros.push('O nome da variável de entrada só pode ter letras, números e pontos.');
      }
      const v = e.validation;
      if (v) {
        if (v.rule === 'regex' && !v.regex?.trim()) erros.push('A expressão regular é obrigatória na regra de validação regex.');
        if (v.rule === 'type' && !v.type?.trim()) erros.push('O tipo de mídia é obrigatório na regra de validação type.');
        if (!v.error?.trim()) erros.push('A mensagem de erro da validação é obrigatória.');
      }
    }
  }
  return erros;
}
