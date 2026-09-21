import { PROVEDOR_PADRAO } from '@pipe/core';
import type { CondicaoBlip } from '@pipe/core';
import type { AcaoDoEditor, Bloco } from './modelo';
import { gerarId } from './modelo';
import { erroDaCondicao } from './condicoes';

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
 * `ProcessHttp`, `MergeContact`…) aparece só para leitura quando veio num
 * fluxo importado, com a marca "Não executada no Pipe", e pode ser excluído.
 *
 * Limite do editor: 15 ações por lista ("Limite de 15 ações atingidos").
 */

export const LIMITE_DE_ACOES = 15;

export interface CampoDaAcao {
  /** A chave em `settings` — com ponto para chave aninhada (`context.type`). */
  chave: string;
  rotulo: string;
  ajuda?: string;
  obrigatorio?: boolean;
  /** `texto` é uma linha; `longo` é área de texto. */
  tipo?: 'texto' | 'longo';
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

export const CATALOGO_DE_ACOES: readonly TipoDeAcao[] = [
  {
    tipo: 'Redirect',
    rotulo: 'Redirecionar para serviço',
    titulo: 'Redirecionar a um serviço',
    grupo: 'Executar',
    info: 'Para executar esta ação é necessário que seu projeto esteja em um bot router.',
    campos: [
      { chave: 'address', rotulo: 'Serviço', obrigatorio: true },
      { chave: 'context.type', rotulo: 'Tipo do contexto' },
      { chave: 'context.value', rotulo: 'Valor do contexto', tipo: 'longo' },
    ],
  },
  {
    tipo: 'SetVariable',
    rotulo: 'Definir variável',
    titulo: 'Definir variável',
    grupo: 'Manipular',
    info: 'Essa ação permite a definição do valor de uma variável de context no fluxo. Para utilizar a variável, utilize {{variableName}}',
    campos: [
      {
        chave: 'variable',
        rotulo: 'Nome da variável',
        ajuda: 'Utilize apenas letras minúsculas e números',
        obrigatorio: true,
      },
      { chave: 'value', rotulo: 'Valor', tipo: 'longo' },
    ],
  },
  {
    tipo: 'DeleteVariable',
    rotulo: 'Excluir variável',
    titulo: 'Excluir variável',
    grupo: 'Manipular',
    campos: [{ chave: 'variable', rotulo: 'Nome da variável', obrigatorio: true }],
  },
  {
    tipo: 'TrackEvent',
    rotulo: 'Registrar eventos',
    titulo: 'Registro de eventos',
    grupo: 'Manipular',
    info: 'Os eventos são agregados por categoria, ação e dia.',
    campos: [
      { chave: 'category', rotulo: 'Categoria', obrigatorio: true },
      { chave: 'action', rotulo: 'Ação', obrigatorio: true },
      { chave: 'label', rotulo: 'Rótulo (opcional)' },
      { chave: 'value', rotulo: 'Valor (opcional)' },
    ],
  },
];

export const ROTULOS_DAS_ACOES = {
  aba: 'Ações',
  entrada: 'Ações de Entrada',
  entradaDescricao: 'Inclua ações que serão executadas antes do envio do primeiro conteúdo',
  adicionarEntrada: 'Adicionar ação de entrada',
  saida: 'Ações de Saída',
  saidaDescricao: 'Inclua ações que serão executadas após o envio do último conteúdo ou resposta do usuário',
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
export const ACOES_DO_SISTEMA = new Set(['ForwardToDesk', 'LeavingFromDesk', 'CreateTicket']);

export const tipoDeAcao = (tipo: string): TipoDeAcao | undefined =>
  CATALOGO_DE_ACOES.find((t) => t.tipo === tipo);

export const rotuloDaAcao = (tipo: string): string => tipoDeAcao(tipo)?.titulo ?? tipo;

/** O motor não a executa: em tempo de execução, lança e a conversa cai na fila. */
export const acaoSemSuporte = (acao: AcaoDoEditor): boolean => !PROVEDOR_PADRAO.has(acao.type);

export const acaoDoSistema = (acao: AcaoDoEditor): boolean => ACOES_DO_SISTEMA.has(acao.type);

/** A ação como o "+" a cria: sem título, configurações vazias, sem condição. */
export function novaAcao(tipo: string, id = gerarId()): AcaoDoEditor {
  return { $id: id, $title: '', type: tipo, settings: {}, conditions: [], $invalid: false };
}

const partes = (chave: string): string[] => chave.split('.');

/** Lê `settings.a.b` — o Newtonsoft casa chave sem diferenciar maiúscula, e a tela também. */
export function valorDoCampo(acao: AcaoDoEditor, chave: string): string {
  let atual: unknown = acao.settings ?? {};
  for (const parte of partes(chave)) {
    if (!atual || typeof atual !== 'object') return '';
    const objeto = atual as Record<string, unknown>;
    const real = Object.keys(objeto).find((k) => k.toLowerCase() === parte.toLowerCase());
    atual = real === undefined ? undefined : objeto[real];
  }
  if (atual === undefined || atual === null) return '';
  return typeof atual === 'string' ? atual : JSON.stringify(atual);
}

/** Grava `settings.a.b`; texto vazio apaga a chave. */
export function comCampo(acao: AcaoDoEditor, chave: string, valor: string): AcaoDoEditor {
  const settings = JSON.parse(JSON.stringify(acao.settings ?? {})) as Record<string, unknown>;
  const caminho = partes(chave);
  let atual = settings;
  for (const parte of caminho.slice(0, -1)) {
    const proximo = atual[parte];
    if (!proximo || typeof proximo !== 'object') atual[parte] = {};
    atual = atual[parte] as Record<string, unknown>;
  }
  const ultima = caminho[caminho.length - 1]!;
  if (valor === '') delete atual[ultima];
  else atual[ultima] = valor;
  // Objeto aninhado que ficou vazio some junto (`context: {}` não é contexto).
  for (const parte of caminho.slice(0, -1)) {
    const filho = settings[parte];
    if (filho && typeof filho === 'object' && Object.keys(filho).length === 0) delete settings[parte];
  }
  return { ...acao, settings };
}

export function comTitulo(acao: AcaoDoEditor, titulo: string): AcaoDoEditor {
  return { ...acao, $title: titulo };
}

export function comCondicoes(acao: AcaoDoEditor, condicoes: CondicaoBlip[]): AcaoDoEditor {
  return { ...acao, conditions: condicoes };
}

/** O que falta na ação, nas frases do painel. Ação que o motor não executa não é conferida. */
export function errosDaAcao(acao: AcaoDoEditor): string[] {
  const erros: string[] = [];
  const tipo = tipoDeAcao(acao.type);
  for (const campo of tipo?.campos ?? []) {
    if (campo.obrigatorio && !valorDoCampo(acao, campo.chave).trim()) {
      erros.push(`${campo.rotulo}: campo obrigatório.`);
    }
  }
  if (tipo?.tipo === 'SetVariable' || tipo?.tipo === 'DeleteVariable') {
    const nome = valorDoCampo(acao, 'variable').trim();
    if (nome && !/^[a-zA-Z0-9.]+$/.test(nome)) {
      erros.push('O nome da variável de entrada só pode ter letras, números e pontos.');
    }
  }
  for (const c of acao.conditions ?? []) {
    const erro = erroDaCondicao(c);
    if (erro && !erros.includes(erro)) erros.push(erro);
  }
  return erros;
}

export type ListaDeAcoes = '$enteringCustomActions' | '$leavingCustomActions';

export type ResultadoDeAcao = { ok: true; bloco: Bloco } | { ok: false; erro: string };

export function adicionarAcao(bloco: Bloco, lista: ListaDeAcoes, acao: AcaoDoEditor): ResultadoDeAcao {
  const atuais = bloco[lista] ?? [];
  if (atuais.length >= LIMITE_DE_ACOES) return { ok: false, erro: ROTULOS_DAS_ACOES.limite };
  return { ok: true, bloco: { ...bloco, [lista]: [...atuais, acao] } };
}

export function substituirAcao(bloco: Bloco, lista: ListaDeAcoes, indice: number, acao: AcaoDoEditor): Bloco {
  const atuais = bloco[lista] ?? [];
  return { ...bloco, [lista]: atuais.map((a, i) => (i === indice ? acao : a)) };
}

export function removerAcao(bloco: Bloco, lista: ListaDeAcoes, indice: number): Bloco {
  const atuais = bloco[lista] ?? [];
  return { ...bloco, [lista]: atuais.filter((_, i) => i !== indice) };
}

/** Sobe ou desce uma ação — elas rodam na ordem da lista. */
export function moverAcao(bloco: Bloco, lista: ListaDeAcoes, de: number, para: number): Bloco {
  const atuais = [...(bloco[lista] ?? [])];
  if (de < 0 || de >= atuais.length || para < 0 || para >= atuais.length || de === para) return bloco;
  const [acao] = atuais.splice(de, 1);
  atuais.splice(para, 0, acao!);
  return { ...bloco, [lista]: atuais };
}
