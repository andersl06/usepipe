/**
 * A conta em vigor e as contas da pessoa — o que o onboarding e o seletor leem.
 *
 * Tudo passa pela `api`, e nada daqui toca o banco: `onboarding_concluido_em` e
 * a troca de conta emitem sessão, e emissão de sessão é regra de identidade, que
 * mora lá. A tela só mostra e manda salvar.
 */

export interface ContaEmVigor {
  id: string;
  nome: string;
  slug: string;
  plano: string;
  site: string | null;
  funcionarios: string | null;
  cidade: string | null;
  estado: string | null;
  pais: string | null;
  telefone: string | null;
  optinWhatsapp: boolean;
  /** A aba "Preferências" da tela de origem: idioma e fuso da conta. */
  idioma: string;
  fuso: string;
  onboardingConcluidoEm: string | null;
  faixasDeFuncionarios: readonly string[];
  idiomas: readonly string[];
  fusos: readonly string[];
}

export interface ContaNaLista {
  tenantId: string;
  nome: string;
  slug: string;
  plano: string;
  emVigor: boolean;
  onboardingConcluido: boolean;
  /**
   * Conta PESSOAL — a que nasceu no autosserviço e nunca virou contrato.
   *
   * O critério, que é da `api`, é ter ZERO domínio verificado: quem contrata
   * publica o TXT no DNS da empresa; quem entrou sozinho com o próprio e-mail
   * não publicou nada. É o mesmo corte que a origem faz entre o contrato (com
   * `tenant.id`) e o espaço pessoal (sem), e o seletor desenha os dois
   * diferente.
   */
  pessoal: boolean;
}
