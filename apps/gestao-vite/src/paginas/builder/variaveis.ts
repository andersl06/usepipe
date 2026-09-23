import type { AcaoDoEditor, Bloco, Mapa } from './modelo';
import { valorDoCampo } from './acoes-do-bloco';

/**
 * A "Biblioteca de variáveis" do editor (`$ctrl.openVarLib()`, painel à
 * esquerda com as abas "Variáveis do sistema" e "Variáveis do usuário",
 * estrutura completa achada em `portal.js`). Lá, as duas listas vêm de um
 * serviço da conta; aqui não existe esse serviço — então:
 *
 * - "Variáveis do usuário" é o que ESTE fluxo de fato referencia: o nome de
 *   toda `SetVariable`/`DeleteVariable` (bloco ou ação global), toda variável
 *   de `context` numa condição, e a variável de cada "Entrada do usuário" —
 *   dado real do desenho, não um cadastro à parte;
 * - "Variáveis do sistema" é a lista fixa das fontes com provedor no motor do
 *   Pipe (`FONTES_SUPORTADAS` de `@pipe/core/fluxo/contexto.ts`), com os
 *   nomes de propriedade que o motor realmente lê (`provedorDeEntrada`,
 *   `provedorDeContato`, etc.) — não é a lista de sistema da Blip (`bucket`,
 *   `resource`, `tunnel`… não têm provedor aqui e ficariam mentindo).
 */

export interface VariavelDoSistema {
  nome: string;
  descricao: string;
}

/** As propriedades que os provedores do motor (`contexto.ts`) de fato respondem. */
export const VARIAVEIS_DO_SISTEMA: readonly VariavelDoSistema[] = [
  { nome: 'input.content', descricao: 'O conteúdo da última mensagem recebida.' },
  { nome: 'input.type', descricao: 'O tipo (MIME) da última mensagem recebida.' },
  { nome: 'contact.name', descricao: 'O nome do contato.' },
  { nome: 'contact.phoneNumber', descricao: 'O telefone do contato.' },
  { nome: 'contact.email', descricao: 'O e-mail do contato.' },
  { nome: 'contact.extras.<chave>', descricao: 'Um campo extra do contato.' },
  { nome: 'state.id', descricao: 'O id do bloco atual.' },
  { nome: 'ticket.id', descricao: 'O id do atendimento em curso, dentro do bloco Humano.' },
] as const;

function acrescentarDeAcoes(acoes: AcaoDoEditor[] | undefined, nomes: Set<string>): void {
  for (const acao of acoes ?? []) {
    if (acao.type === 'SetVariable' || acao.type === 'DeleteVariable') {
      const nome = valorDoCampo(acao, 'variable').trim();
      if (nome) nomes.add(nome);
    }
    for (const condicao of acao.conditions ?? []) {
      if (condicao.source === 'context' && condicao.variable?.trim()) nomes.add(condicao.variable.trim());
    }
  }
}

function acrescentarDeBloco(bloco: Bloco, nomes: Set<string>): void {
  acrescentarDeAcoes(bloco.$enteringCustomActions, nomes);
  acrescentarDeAcoes(bloco.$leavingCustomActions, nomes);
  for (const item of bloco.$contentActions ?? []) {
    if (item.input?.variable?.trim()) nomes.add(item.input.variable.trim());
    for (const condicao of item.input?.conditions ?? []) {
      if (condicao.source === 'context' && condicao.variable?.trim()) nomes.add(condicao.variable.trim());
    }
  }
  for (const saida of bloco.$conditionOutputs ?? []) {
    for (const condicao of saida.conditions ?? []) {
      if (condicao.source === 'context' && condicao.variable?.trim()) nomes.add(condicao.variable.trim());
    }
  }
}

/** Toda variável de `context` que este fluxo cria ou lê, em ordem alfabética. */
export function variaveisDoUsuario(mapa: Mapa, globais: Record<string, unknown>): string[] {
  const nomes = new Set<string>();
  for (const bloco of Object.values(mapa)) acrescentarDeBloco(bloco, nomes);
  const globaisComAcoes = globais as { $enteringCustomActions?: AcaoDoEditor[]; $leavingCustomActions?: AcaoDoEditor[] };
  acrescentarDeAcoes(globaisComAcoes.$enteringCustomActions, nomes);
  acrescentarDeAcoes(globaisComAcoes.$leavingCustomActions, nomes);
  return [...nomes].sort((a, b) => a.localeCompare(b));
}

/** O filtro de busca de cada aba do painel: sem acento, sem caixa. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export function filtrarVariaveis(nomes: readonly string[], busca: string): string[] {
  const alvo = normalizar(busca.trim());
  if (!alvo) return [...nomes];
  return nomes.filter((nome) => normalizar(nome).includes(alvo));
}

export function filtrarVariaveisDoSistema(
  variaveis: readonly VariavelDoSistema[],
  busca: string,
): VariavelDoSistema[] {
  const alvo = normalizar(busca.trim());
  if (!alvo) return [...variaveis];
  return variaveis.filter((v) => normalizar(v.nome).includes(alvo) || normalizar(v.descricao).includes(alvo));
}
