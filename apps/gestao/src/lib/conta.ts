import { cookies } from 'next/headers';
import { COOKIE_SESSAO, chamarApi } from './sessao';

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

export async function cookieDaSessao(): Promise<string> {
  const cookie = (await cookies()).get(COOKIE_SESSAO);
  return cookie ? `${COOKIE_SESSAO}=${cookie.value}` : '';
}

/** A conta desta sessão, ou `null` quando a sessão não vale mais. */
export async function contaEmVigor(): Promise<ContaEmVigor | null> {
  const resposta = await chamarApi(await cookieDaSessao(), '/v1/conta');
  if (!resposta.ok) return null;
  return (await resposta.json()) as ContaEmVigor;
}

/**
 * As contas deste e-mail, para o seletor do canto superior esquerdo.
 *
 * Lista vazia quando a chamada falha, e não erro: o seletor é navegação, e a
 * tela inteira não pode cair porque a lista não veio.
 */
export async function minhasContas(): Promise<ContaNaLista[]> {
  const resposta = await chamarApi(await cookieDaSessao(), '/v1/contas/minhas');
  if (!resposta.ok) return [];
  return (await resposta.json()) as ContaNaLista[];
}
