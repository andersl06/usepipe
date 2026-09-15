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
    /**
     * `false` enquanto a conta não passou por "minha conta".
     *
     * Vive no `Eu` porque TODA tela logada precisa saber: conta que ainda não
     * disse de que empresa é vai para o onboarding, não para o produto. Fosse
     * uma chamada à parte, seria uma ida à rede por tela — e a consulta do
     * `Eu` já lê a linha do tenant.
     */
    onboardingConcluido: boolean;
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
  /** O provedor não confirmou o e-mail. Saída: verificar a conta no provedor. */
  'email_nao_verificado',
  /** A empresa exige SSO. Saída: entrar pelo provedor de identidade dela. */
  'sso_obrigatorio',
  /** Falha na conversa com o Google. Saída: tentar de novo. */
  'falha_no_provedor',
] as const;
export type RecusaDeEntrada = (typeof RECUSAS_DE_ENTRADA)[number];

export interface ErroDaApi {
  codigo: string;
  mensagem: string;
}

/**
 * O que `POST /v1/auth/descobrir` responde: por onde ESTE e-mail entra.
 *
 * `sso` manda ao provedor de identidade da empresa; `google` mostra o caminho do
 * Google. Não existe `senha` — o Pipe nunca guardou senha de ninguém, e um valor
 * que promete um campo que não existe faz a tela desenhar o que não sabe fazer.
 *
 * A resposta é a MESMA para e-mail conhecido e desconhecido, exceto quando o
 * domínio é verificado e tem SSO ativo. Sem isso, a rota vira catálogo de "quais
 * empresas usam Pipe".
 */
export interface RespostaDaDescoberta {
  metodo: 'sso' | 'google';
  /** Caminho na API, quando `sso`. Falta só a base pública. */
  irPara?: string;
}

/**
 * O que `GET /v1/convites/:token` mostra a quem ainda está do lado de fora.
 *
 * O mínimo para a pessoa decidir se aquele convite é dela: qual empresa, para
 * qual e-mail, com qual papel e até quando. Nada de dado do tenant além do nome
 * — quem chega aqui não está logado.
 */
export interface ConviteVisivel {
  email: string;
  papel: string;
  tenant: { nome: string; slug: string };
  /** ISO-8601, como sai da API. Quem formata é a tela. */
  expiraEm: string;
}
