import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PANEL_CONVERSATION,
  PANEL_CONTACT,
  panelState,
  isPanelOpen,
  selectionAfterLocationChange,
  navigationDecisionForPanel,
  type DeskSelection,
} from '../src/lib/panel-history';

test('panelState returns only the marker key, no id', () => {
  assert.deepEqual(panelState(PANEL_CONVERSATION), { panel: 'conversation' });
  assert.deepEqual(Object.keys(panelState(PANEL_CONVERSATION)), ['panel']);
});

test('isPanelOpen recognizes only the matching marker object', () => {
  assert.equal(isPanelOpen({ panel: 'conversation' }, PANEL_CONVERSATION), true);
  assert.equal(isPanelOpen(null, PANEL_CONVERSATION), false);
  assert.equal(isPanelOpen({ panel: 'contact' }, PANEL_CONVERSATION), false);
  assert.equal(isPanelOpen('x', PANEL_CONVERSATION), false);
});

test('selectionAfterLocationChange keeps conversationId when the marker is present', () => {
  const selection: DeskSelection = { conversationId: 'c1', contact: null };
  const result = selectionAfterLocationChange(selection, panelState(PANEL_CONVERSATION));
  assert.equal(result.conversationId, 'c1');
});

test('selectionAfterLocationChange clears conversationId on back / marker-less entry', () => {
  const selection: DeskSelection = { conversationId: 'c1', contact: null };
  const result = selectionAfterLocationChange(selection, null);
  assert.equal(result.conversationId, null);
});

test('selectionAfterLocationChange keeps or clears contact selection with the contact marker', () => {
  const selection: DeskSelection = {
    conversationId: null,
    contact: { contactId: 'k', ticketId: 't' },
  };
  assert.deepEqual(selectionAfterLocationChange(selection, null).contact, null);
  assert.deepEqual(
    selectionAfterLocationChange(selection, panelState(PANEL_CONTACT)).contact,
    { contactId: 'k', ticketId: 't' },
  );
});

test('open A from the list, open B while A is open, then Back: list shown, conversationId null', () => {
  // Minimal in-memory history stub: one entry per push, replace overwrites
  // the current entry in place (no new length), back moves the index back.
  const history: { state: unknown }[] = [{ state: null }];
  let index = 0;
  let selection: DeskSelection = { conversationId: null, contact: null };

  function currentState(): unknown {
    return history[index]?.state ?? null;
  }

  function openConversation(id: string) {
    const { replace } = navigationDecisionForPanel(currentState(), PANEL_CONVERSATION);
    selection = { ...selection, conversationId: id };
    if (replace) {
      history[index] = { state: panelState(PANEL_CONVERSATION) };
    } else {
      history.splice(index + 1);
      history.push({ state: panelState(PANEL_CONVERSATION) });
      index++;
    }
  }

  function back() {
    if (index > 0) index--;
    selection = selectionAfterLocationChange(selection, currentState());
  }

  openConversation('A'); // push: list -> conversation marker
  assert.equal(history.length, 2);
  assert.equal(selection.conversationId, 'A');

  openConversation('B'); // replace: A's marker becomes B's marker, same entry
  assert.equal(history.length, 2);
  assert.equal(selection.conversationId, 'B');
  assert.deepEqual(Object.keys(currentState() as object), ['panel']);

  back(); // list shown, no conversation selected
  assert.equal(index, 0);
  assert.equal(selection.conversationId, null);
});
