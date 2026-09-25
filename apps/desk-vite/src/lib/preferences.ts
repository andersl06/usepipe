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
export interface Preferences {
  navegadorNotifications: boolean;
  ticketInQueueAlerta: boolean;
  alertaDeTicketAtribuido: boolean;
  messageAlerta: boolean;
  alertaWithAbaActive: boolean;
  continuarOnline: boolean;
  aberturaOrder: boolean;
  corretorOrtografico: boolean;
}

export const PADRAO: Preferences = {
  navegadorNotifications: true,
  ticketInQueueAlerta: true,
  alertaDeTicketAtribuido: true,
  messageAlerta: true,
  alertaWithAbaActive: true,
  continuarOnline: false,
  aberturaOrder: false,
  corretorOrtografico: true,
};

export const CHAVES_DE_PREFERENCIA = Object.keys(PADRAO) as (keyof Preferences)[];

export function readPreferences(
  ler: (key: string) => string | null = (chave) => {
    try {
      return localStorage.getItem(chave);
    } catch {
      return null;
    }
  },
): Preferences {
  const saida = { ...PADRAO };
  for (const key of CHAVES_DE_PREFERENCIA) {
    const v = ler(`desk.pref.${key}`);
    if (v === '1') saida[key] = true;
    else if (v === '0') saida[key] = false;
  }
  return saida;
}
