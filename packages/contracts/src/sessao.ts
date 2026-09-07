/**
 * O contrato de sessão, partilhado entre a `api` e os quatro fronts.
 *
 * Existe para que "quem está logado" tenha UMA definição. Sem isto, cada tela
 * inventa a sua e a divergência só aparece quando um campo muda de nome.
 */

/** O que `GET /v1/eu` devolve. É a fonte de verdade de quem está logado. */
export interface Eu {
  usuario: {
    id: string;
    nome: string;
    email: string;
    avatarUrl: string | null;
  };
  tenant: {
    id: string;
    nome: string;
    slug: string;
    plano: Plano;
  };
  /** Códigos de permissão, do catálogo. A tela esconde o que não está aqui. */
  permissoes: string[];
  /** Por onde a pessoa entrou. A tela de conta mostra, e a auditoria usa. */
  origem: OrigemDeSessao;
}

export const PLANOS = ['essencial', 'operacao', 'escala'] as const;
export type Plano = (typeof PLANOS)[number];

export const ORIGENS_DE_SESSAO = ['senha', 'google', 'sso'] as const;
export type OrigemDeSessao = (typeof ORIGENS_DE_SESSAO)[number];

/**
 * Por que a entrada foi recusada.
 *
 * Código, não frase: a tela decide o texto, e o texto muda sem quebrar contrato.
 * Cada um destes tem uma saída diferente para a pessoa, e é por isso que não
 * viram um "não autorizado" genérico.
 */
export const RECUSAS_DE_ENTRADA = [
  /** E-mail pessoal não identifica empresa. Saída: entrar pelo convite. */
  'dominio_publico',
  /** Nenhuma conta do Pipe usa este domínio. Saída: falar com quem contratou. */
  'dominio_desconhecido',
  /** O domínio é conhecido, mas a pessoa não foi convidada. Saída: pedir convite. */
  'sem_convite',
  /** Estava dentro e o acesso foi desativado. Saída: falar com o administrador. */
  'usuario_inativo',
  /** O Google não confirmou o e-mail. Saída: verificar a conta no Google. */
  'email_nao_verificado',
  /** Falha na conversa com o Google. Saída: tentar de novo. */
  'falha_no_provedor',
] as const;
export type RecusaDeEntrada = (typeof RECUSAS_DE_ENTRADA)[number];

export interface ErroDaApi {
  codigo: string;
  mensagem: string;
}
