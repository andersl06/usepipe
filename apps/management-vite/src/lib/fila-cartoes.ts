import { OPERADORES_DE_REGRA, PREFIX_ATTRIBUTE, type OperadorDeRegra } from './rule-queue';

/**
 * Regras puras dos cartões da edição de fila: condições em rascunho (o que a pessoa vê), conversão para o que a API grava e leitura em lote de e-mails. Sem JSX e sem `./api`, para rodar em `node --test`.
 */

/** Campo "Extras Contato": a chave é livre e vira o sufixo de `contato.atributos.`. */
export const CAMPO_EXTRA = '__extra__';

export const CAMPOS_DO_FORMULARIO = [
  { valor: 'mensagem', rotulo: 'Mensagem' },
  { valor: 'contato.nome', rotulo: 'Nome Contato' },
  { valor: 'contato.email', rotulo: 'Email Contato' },
  { valor: CAMPO_EXTRA, rotulo: 'Extras Contato' },
] as const;

export const OPERADORES_DO_FORMULARIO: readonly { valor: OperadorDeRegra; rotulo: string }[] = [
  { valor: 'contem', rotulo: 'Contém' },
  { valor: 'nao_contem', rotulo: 'Não contém' },
  { valor: 'igual', rotulo: 'É igual' },
  { valor: 'diferente', rotulo: 'Não é igual' },
];

export interface CondicaoRascunho {
  campo: string;
  /** Só quando `campo` é `CAMPO_EXTRA`. */
  chave: string;
  operador: OperadorDeRegra;
  valor: string;
}

export function condicaoEmBranco(): CondicaoRascunho {
  return { campo: 'mensagem', chave: '', operador: 'contem', valor: '' };
}

/** Lê uma condição gravada (`campo` completo) de volta para o formulário. */
export function rascunhoDeCondicao(
  campo: string,
  operador: string,
  valor: string,
): CondicaoRascunho {
  const operadorOk = (OPERADORES_DE_REGRA as readonly string[]).includes(operador)
    ? (operador as OperadorDeRegra)
    : 'contem';
  if (campo.startsWith(PREFIX_ATTRIBUTE)) {
    return {
      campo: CAMPO_EXTRA,
      chave: campo.slice(PREFIX_ATTRIBUTE.length),
      operador: operadorOk,
      valor,
    };
  }
  return { campo, chave: '', operador: operadorOk, valor };
}

export interface CondicaoGravada {
  campo: string;
  operador: OperadorDeRegra;
  valor: string;
}

const CHAVE_EXTRA = /^[A-Za-z0-9_]+$/;

/** Aviso da chave do campo extra: as regras só aceitam letras, números e sublinhado, mas o Builder grava qualquer chave em `extras` (`MergeContact`). */
export function chaveDoExtraAviso(chave: string): string | null {
  const c = chave.trim();
  if (!c || CHAVE_EXTRA.test(c)) return null;
  return 'A chave do campo extra aceita só letras, números e sublinhado (sem espaços, hífen ou acentos). Chaves gravadas pelo Builder com outros caracteres não podem ser usadas em regras.';
}

/** `null` quando o rascunho está incompleto (sem valor ou sem chave do extra): o botão Salvar fica desabilitado. */
export function condicoesGravaveis(
  rascunhos: readonly CondicaoRascunho[],
): CondicaoGravada[] | null {
  const saida: CondicaoGravada[] = [];
  for (const c of rascunhos) {
    const valor = c.valor.trim();
    const chave = c.chave.trim();
    if (!valor) return null;
    if (c.campo === CAMPO_EXTRA) {
      if (!CHAVE_EXTRA.test(chave)) return null;
      saida.push({ campo: `${PREFIX_ATTRIBUTE}${chave}`, operador: c.operador, valor });
    } else {
      saida.push({ campo: c.campo, operador: c.operador, valor });
    }
  }
  return saida;
}

/** "Regra N", onde N é o próximo número livre depois dos nomes já usados. */
export function proximoNomeDeRegra(nomes: readonly string[], prefixo = 'Regra'): string {
  const usados = new Set(nomes.map((n) => n.trim().toLowerCase()));
  let n = nomes.length + 1;
  while (usados.has(`${prefixo} ${n}`.toLowerCase())) n += 1;
  return `${prefixo} ${n}`;
}

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** Divide texto por vírgula, ponto e vírgula ou quebra de linha; minúsculas, sem repetição. */
export function lerEmails(texto: string): string[] {
  const vistos = new Set<string>();
  for (const parte of texto.split(/[,;\n\r]+/)) {
    const email = parte.trim().toLowerCase();
    if (email) vistos.add(email);
  }
  return [...vistos];
}

export interface ResultadoDosEmails {
  /** E-mails com conta no tenant, já com o id do usuário. */
  achados: { email: string; userId: string }[];
  /** E-mails recusados, cada um com o seu motivo. */
  recusados: { email: string; motivo: string }[];
}

/**
 * Separa os e-mails entre os que têm conta no tenant e os que não têm. Não cria ninguém: quem não existe é recusado com mensagem própria. `jaNaFila` evita vincular de novo quem já está na fila.
 */
export function resolverEmails(
  emails: readonly string[],
  usuarios: readonly { id: string; email: string; active: boolean }[],
  jaNaFila: ReadonlySet<string>,
): ResultadoDosEmails {
  const porEmail = new Map(usuarios.map((u) => [u.email.trim().toLowerCase(), u]));
  const resultado: ResultadoDosEmails = { achados: [], recusados: [] };
  for (const email of emails) {
    if (!EMAIL.test(email)) {
      resultado.recusados.push({ email, motivo: 'E-mail inválido.' });
      continue;
    }
    const usuario = porEmail.get(email);
    if (!usuario) {
      resultado.recusados.push({ email, motivo: 'Este e-mail não tem conta neste ambiente.' });
    } else if (jaNaFila.has(usuario.id)) {
      resultado.recusados.push({ email, motivo: 'Este atendente já está nesta fila.' });
    } else if (!usuario.active) {
      resultado.recusados.push({ email, motivo: 'A conta deste e-mail está desativada.' });
    } else {
      resultado.achados.push({ email, userId: usuario.id });
    }
  }
  return resultado;
}

/** Expressão da condição de uma regra de priorização (`{}` = vale para toda a fila). */
export function condicaoDePriorizacao(
  aplicar: boolean,
  combinador: 'e' | 'ou',
  condicoes: readonly CondicaoGravada[],
): Record<string, unknown> {
  if (!aplicar) return {};
  return {
    combinador,
    condicoes: condicoes.map((c) => ({ campo: c.campo, operador: c.operador, valor: c.valor })),
  };
}

/** Lê a condição gravada de uma regra de priorização de volta para rascunhos; `null` = sem condição. */
export function lerCondicaoDePriorizacao(
  condicao: Record<string, unknown>,
): { combinador: 'e' | 'ou'; condicoes: CondicaoRascunho[] } | null {
  const lista = condicao['condicoes'];
  if (!Array.isArray(lista) || lista.length === 0) return null;
  return {
    combinador: condicao['combinador'] === 'ou' ? 'ou' : 'e',
    condicoes: lista.map((c: Record<string, unknown>) =>
      rascunhoDeCondicao(
        String(c['campo'] ?? ''),
        String(c['operador'] ?? ''),
        String(c['valor'] ?? ''),
      ),
    ),
  };
}
