import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  PANEL_CONVERSATION,
  PANEL_CONTACT,
  panelState,
  isPanelOpen,
  navigationDecisionForPanel,
  selectionAfterLocationChange,
  type DeskSelection,
} from '../lib/panel-history';

interface DeskSelectionContextValue {
  conversationId: string | null;
  openConversation: (id: string) => void;
  closeConversation: () => void;
  contact: DeskSelection['contact'];
  openContact: (contactId: string, ticketId: string | null) => void;
  closeContact: () => void;
}

const DeskSelectionContext = createContext<DeskSelectionContextValue | null>(null);

/**
 * Mounted at the Shell level (D-27/D-29, `std/nav-contract.md` §Desk) so the
 * rail and every page share one selection. An open conversation/contact never
 * carries an id in the URL or in `location.state` — only a marker
 * (`panel-history.ts`) does — so F5 always comes back to the list, and a
 * normal screen-to-screen navigation (no marker) clears whatever was open.
 */
export function DeskSelectionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [selection, setSelection] = useState<DeskSelection>({
    conversationId: null,
    contact: null,
  });

  useEffect(() => {
    setSelection((sel) => selectionAfterLocationChange(sel, location.state));
    // location.key changes on every navigation (push/replace/back/forward),
    // which is exactly when the marker needs re-checking.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  function openConversation(id: string) {
    const { replace } = navigationDecisionForPanel(location.state, PANEL_CONVERSATION);
    setSelection((sel) => ({ ...sel, conversationId: id }));
    navigate('/', { state: panelState(PANEL_CONVERSATION), replace });
  }

  function closeConversation() {
    if (isPanelOpen(location.state, PANEL_CONVERSATION)) {
      navigate(-1);
    } else {
      setSelection((sel) => ({ ...sel, conversationId: null }));
    }
  }

  function openContact(contactId: string, ticketId: string | null) {
    const { replace } = navigationDecisionForPanel(location.state, PANEL_CONTACT);
    setSelection((sel) => ({ ...sel, contact: { contactId, ticketId } }));
    navigate('/contacts', { state: panelState(PANEL_CONTACT), replace });
  }

  function closeContact() {
    if (isPanelOpen(location.state, PANEL_CONTACT)) {
      navigate(-1);
    } else {
      setSelection((sel) => ({ ...sel, contact: null }));
    }
  }

  return (
    <DeskSelectionContext.Provider
      value={{
        conversationId: selection.conversationId,
        openConversation,
        closeConversation,
        contact: selection.contact,
        openContact,
        closeContact,
      }}
    >
      {children}
    </DeskSelectionContext.Provider>
  );
}

export function useDeskSelection(): DeskSelectionContextValue {
  const ctx = useContext(DeskSelectionContext);
  if (!ctx) throw new Error('useDeskSelection must be used inside DeskSelectionProvider');
  return ctx;
}
