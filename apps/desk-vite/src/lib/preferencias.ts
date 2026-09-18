/**
 * As preferências do atendente — as chaves de `/agents/preferences` da
 * referência (`~/desk-clone/docs/desk-store.md`: `enableBrowserNotification`,
 * `enableTicketOnQueueAlert`, `enableReceivedMessageAlert`,
 * `enableAlertWithDeskActive`, `enableSpellChecker`, `sortChatsBy`,
 * `keepAgentOnline`), com os padrões que o mock da cópia responde.
 *
 * Vivem no navegador (`localStorage`, `desk.pref.<chave>`): são da máquina,
 * não da pessoa. Quem lê é `lerPreferencias`, sempre com o padrão por baixo.
 */
export interface Preferencias {
  notificacoesDoNavegador: boolean;
  alertaDeTicketNaFila: boolean;
  alertaDeTicketAtribuido: boolean;
  alertaDeMensagem: boolean;
  alertaComAbaAtiva: boolean;
  continuarOnline: boolean;
  ordemDeAbertura: boolean;
  corretorOrtografico: boolean;
}

export const PADRAO: Preferencias = {
  notificacoesDoNavegador: true,
  alertaDeTicketNaFila: true,
  alertaDeTicketAtribuido: true,
  alertaDeMensagem: true,
  alertaComAbaAtiva: true,
  continuarOnline: false,
  ordemDeAbertura: false,
  corretorOrtografico: true,
};

export const CHAVES_DE_PREFERENCIA = Object.keys(PADRAO) as (keyof Preferencias)[];

export function lerPreferencias(
  ler: (chave: string) => string | null = (chave) => {
    try {
      return localStorage.getItem(chave);
    } catch {
      return null;
    }
  },
): Preferencias {
  const saida = { ...PADRAO };
  for (const chave of CHAVES_DE_PREFERENCIA) {
    const v = ler(`desk.pref.${chave}`);
    if (v === '1') saida[chave] = true;
    else if (v === '0') saida[chave] = false;
  }
  return saida;
}
