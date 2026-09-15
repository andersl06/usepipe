/**
 * As regras do formulário de conta — as mesmas na tela e no servidor.
 *
 * Existem num arquivo só porque precisam valer duas vezes: o navegador barra
 * (atributos `required`, `minlength`, `pattern`) e a ação de servidor barra de
 * novo, para quem mandar o POST por fora. Regra escrita duas vezes é regra que
 * diverge no primeiro ajuste.
 *
 * Os números saem do `lib/AccountIndex.js` da plataforma de origem, onde cada
 * campo é um `BlipInput` com `minLength`/`maxLength`/`required` declarados.
 */

/** Tamanhos da origem, com uma exceção anotada. */
export const TAMANHO = {
  /* 6 é o mínimo da origem. O máximo lá é 250, mas a nossa `api` corta em 120
     ao gravar (`texto(corpo['nome'], 120)`): aceitar 250 aqui gravaria um nome
     truncado sem avisar ninguém. Vale o menor dos dois até a `api` mudar. */
  nomeMin: 6,
  nomeMax: 120,
  siteMin: 3,
  siteMax: 50,
  telefoneMax: 40,
  cidadeMax: 120,
  paisMax: 60,
} as const;

/**
 * O regex de site da origem, copiado caractere a caractere.
 *
 * Uma mudança: as classes ganharam `A-Z`. O original só aceita minúsculas e
 * não tem a marca `i`, então `Empresa.com.br` é recusado lá — defeito, não
 * regra, e copiar defeito não é copiar disposição.
 */
export const PADRAO_DE_SITE =
  '(http://www\\.|https://www\\.|http://|https://)?[a-zA-Z0-9]+([\\-\\.]{1}[a-zA-Z0-9]+)*\\.[a-zA-Z]{2,8}(:[0-9]{1,5})?(/.*)?';

/** Os três idiomas da origem, com o nome que ela dá a cada um. */
export const ROTULO_DE_IDIOMA: Record<string, string> = {
  'pt-BR': 'Português (BR)',
  'en-US': 'Inglês',
  'es-ES': 'Espanhol',
};

/**
 * Os fusos, escritos como a origem escreve: deslocamento entre parênteses e a
 * cidade no fim. Quem escolhe fuso procura pela cidade, não pelo nome IANA.
 */
export const ROTULO_DE_FUSO: Record<string, string> = {
  'America/Sao_Paulo': '(UTC-03:00) Brasília, São Paulo',
  'America/Bahia': '(UTC-03:00) Salvador',
  'America/Fortaleza': '(UTC-03:00) Fortaleza',
  'America/Recife': '(UTC-03:00) Recife',
  'America/Belem': '(UTC-03:00) Belém',
  'America/Manaus': '(UTC-04:00) Manaus',
  'America/Campo_Grande': '(UTC-04:00) Campo Grande',
  'America/Cuiaba': '(UTC-04:00) Cuiabá',
  'America/Porto_Velho': '(UTC-04:00) Porto Velho',
  'America/Boa_Vista': '(UTC-04:00) Boa Vista',
  'America/Rio_Branco': '(UTC-05:00) Rio Branco',
  'America/Noronha': '(UTC-02:00) Fernando de Noronha',
};

/** Os recados de erro, um por campo, no tom dos da origem. */
export const RECADOS = {
  nome: `Ops! O nome da empresa precisa ter entre ${TAMANHO.nomeMin} e ${TAMANHO.nomeMax} caracteres.`,
  telefone: 'Esse não parece ser um telefone válido. Por favor, tente de novo :)',
  site: 'Esse não parece ser um site válido. Por favor, tente de novo :)',
  funcionarios: 'Escolha uma das faixas da lista.',
  idioma: 'Escolha um dos idiomas da lista.',
  fuso: 'Escolha um dos fusos da lista.',
} as const;

/** O que a ação de servidor devolve quando recusa: o campo e o porquê. */
export interface Recusa {
  campo: keyof typeof RECADOS;
  motivo: string;
}

/**
 * Confere o que dá para conferir com o que temos.
 *
 * Devolve a PRIMEIRA recusa, como na origem: o `checkFormValidity` dela também
 * para no primeiro campo inválido, e uma tela que acusa sete erros de uma vez
 * não é mais honesta, só mais barulhenta.
 */
export function conferir(dados: {
  nome: string;
  telefone: string;
  site: string;
  funcionarios: string;
  idioma: string;
  fuso: string;
  faixas: readonly string[];
  idiomas: readonly string[];
  fusos: readonly string[];
}): Recusa | null {
  const nome = dados.nome.trim();
  if (nome.length < TAMANHO.nomeMin || nome.length > TAMANHO.nomeMax) {
    return { campo: 'nome', motivo: RECADOS.nome };
  }

  /* A origem usa `libphonenumber.isPossible` com a cultura da conta. Sem essa
     biblioteca aqui, a régua é a do padrão E.164: de 8 a 15 dígitos, sinal de
     mais e separadores à vontade. Barra o campo vazio e o número truncado, que
     é o que a validação dela pega na prática; não sabe dizer que 21 9 9999 9999
     não existe no Rio. */
  const digitos = dados.telefone.replace(/\D/g, '');
  if (digitos.length < 8 || digitos.length > 15) {
    return { campo: 'telefone', motivo: RECADOS.telefone };
  }

  const site = dados.site.trim();
  if (site.length < TAMANHO.siteMin || site.length > TAMANHO.siteMax) {
    return { campo: 'site', motivo: RECADOS.site };
  }
  if (!new RegExp(`^(?:${PADRAO_DE_SITE})$`).test(site)) {
    return { campo: 'site', motivo: RECADOS.site };
  }

  /* Listas fechadas: quem mandar texto fora delas é POST por fora da tela. A
     `api` confere de novo, e as três listas vêm de lá — cópia local delas
     envelheceria do lado errado. */
  const foraDaLista = (valor: string, lista: readonly string[]) => valor && !lista.includes(valor);
  if (foraDaLista(dados.funcionarios, dados.faixas)) {
    return { campo: 'funcionarios', motivo: RECADOS.funcionarios };
  }
  if (foraDaLista(dados.idioma, dados.idiomas)) {
    return { campo: 'idioma', motivo: RECADOS.idioma };
  }
  if (foraDaLista(dados.fuso, dados.fusos)) {
    return { campo: 'fuso', motivo: RECADOS.fuso };
  }

  return null;
}
