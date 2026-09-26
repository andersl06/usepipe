/**
 * Agent preferences mirror reference `/agents/preferences` keys and mock defaults (`~/desk-clone/docs/desk-store.md`: `enableBrowserNotification`, `enableTicketOnQueueAlert`, `enableReceivedMessageAlert`, `enableAlertWithDeskActive`, `enableSpellChecker`, `sortChatsBy`, `keepAgentOnline`). They live in browser `localStorage` under `desk.pref.<chave>`, so they belong to this machine rather than the person. `readPreferences` applies defaults when reading.
 */
export interface Preferences {
  browserNotifications: boolean;
  ticketInQueueAlert: boolean;
  alertaDeTicketAtribuido: boolean;
  messageAlert: boolean;
  alertWithTabActive: boolean;
  continuarOnline: boolean;
  openingOrder: boolean;
  corretorOrtografico: boolean;
}

export const PADRAO: Preferences = {
  browserNotifications: true,
  ticketInQueueAlert: true,
  alertaDeTicketAtribuido: true,
  messageAlert: true,
  alertWithTabActive: true,
  continuarOnline: false,
  openingOrder: false,
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
