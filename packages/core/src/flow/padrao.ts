/**
 * Default flow shown on first Builder open. It is the smallest useful flow: receive a message, tell the customer a human is coming, and queue the conversation; the company can add menus, hours, and branches later. It lives in `core` because both the Builder copy via the bridge and the Management Builder screen (`GET /v1/gestao/fluxos/:id/builder`) serve it. Both draw Blip EDITOR format (`{ <id>: estado }` with `$contentActions`); `converterDoEditor` converts it for the engine. Three engine rules matter: the root only waits for input, or publication fails ("O estado raiz precisa esperar uma entrada"); the root consumes the FIRST customer message, so bot speech belongs in the NEXT block. `ForwardToDesk`, not an ID prefix, calls `encaminharParaAtendimento` to queue the conversation (`apps/api/src/dominio/fluxo.ts`); the `desk:` prefix routes the closed `Ticket` back to that block and matches Blip rendering. The attendance block expects `desk_forwardToDeskState_status = Success` and defaults back to root after closure. This starting point is never stored; the first save persists the user's drawing.
 */

function state(
  id: string,
  titulo: string,
  topo: string,
  esquerda: string,
  extras: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    $title: titulo,
    $position: { top: topo, left: esquerda },
    $contentActions: [],
    $conditionOutputs: [],
    $enteringCustomActions: [],
    $leavingCustomActions: [],
    $inputSuggestions: [],
    $tags: [],
    $invalidContentActions: false,
    $invalidOutputs: false,
    $invalidCustomActions: false,
    $invalid: false,
    ...extras,
  };
}

/** Bot utterance in the format drawn in the editor's left bubble. */
function fala(id: string, texto: string): Record<string, unknown> {
  return {
    action: {
      $id: id,
      $typeOfContent: 'text/plain',
      type: 'SendMessage',
      settings: { id, type: 'text/plain', content: texto },
      $cardContent: {
        document: { id, type: 'text/plain', content: texto },
        editable: true,
        deletable: true,
        position: 'left',
        editing: false,
      },
    },
    $invalid: false,
  };
}

/** Wait for a customer message, making the block publishable. */
function espera(id: string, dica: string, extras: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    input: {
      bypass: false,
      $cardContent: {
        document: { id, type: 'text/plain', content: dica },
        editable: true,
        deletable: true,
        position: 'right',
        editing: false,
      },
      $invalid: false,
      ...extras,
    },
    $invalid: false,
  };
}

export const ID_DA_RAIZ_PADRAO = 'onboarding';
export const ID_OF_ATTENDANCE_DEFAULT = 'desk:atendimento';

export const FLOW_DEFAULT: Record<string, unknown> = {
  [ID_DA_RAIZ_PADRAO]: state(ID_DA_RAIZ_PADRAO, 'Início', '120px', '640px', {
    root: true,
    $contentActions: [espera('inicio-1', 'mensagem do cliente')],
    $defaultOutput: { stateId: ID_OF_ATTENDANCE_DEFAULT, $invalid: false },
  }),
  [ID_OF_ATTENDANCE_DEFAULT]: state(
    ID_OF_ATTENDANCE_DEFAULT,
    'Atendimento humano',
    '360px',
    '640px',
    {
      deskStateVersion: '3.0.0',
      // `ForwardToDesk` runs BEFORE block content (`converterDoEditor`): the
      // conversation enters the queue before the notice is sent inside it.
      $enteringCustomActions: [
        { $id: 'atendimento-1', type: 'ForwardToDesk', settings: {}, conditions: [] },
      ],
      $contentActions: [
        fala('atendimento-2', 'Olá! Já estou chamando um atendente para você.'),
        espera('atendimento-3', 'fim do atendimento', {
          conditions: [
            {
              source: 'context',
              variable: 'desk_forwardToDeskState_status',
              comparison: 'equals',
              values: ['Success'],
            },
          ],
        }),
      ],
      $afterStateChangedActions: [
        { $id: 'atendimento-4', type: 'LeavingFromDesk', settings: {}, conditions: [] },
      ],
      // After ticket closure, the next message restarts from the beginning.
      $defaultOutput: { stateId: ID_DA_RAIZ_PADRAO, $invalid: false },
    },
  ),
};

export const ACTIONS_GLOBAL_DEFAULT: Record<string, unknown> = {
  id: 'global-actions',
  $contentActions: [],
  $conditionOutputs: [],
  $enteringCustomActions: [],
  $leavingCustomActions: [],
  $inputSuggestions: [],
  $tags: [],
  $defaultOutput: null,
  $invalidContentActions: false,
  $invalidOutputs: false,
  $invalidCustomActions: false,
  $invalid: false,
};
