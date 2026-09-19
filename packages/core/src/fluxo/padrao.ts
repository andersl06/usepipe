/**
 * O fluxo que o cliente encontra quando abre o Builder pela primeira vez.
 *
 * De propósito é o menor fluxo que já é útil: a mensagem chega, o robô avisa que vai
 * chamar gente, e a conversa vai para a fila. Nada de menu, horário ou ramificação —
 * isso é o que a empresa vai montar por cima, com a ajuda do assistente.
 *
 * Está no `core`, e não na ponte, porque dois caminhos o servem: a cópia do Builder
 * (pela ponte) e a tela do Builder da Gestão (`GET /v1/gestao/fluxos/:id/builder`).
 * O formato é o do EDITOR da Blip (`{ <id>: estado }` com `$contentActions`…), que é
 * o que as duas telas desenham; `converterDoEditor` o leva ao formato do motor.
 *
 * Três regras do motor estão embutidas aqui, e cada uma custou um fluxo que não
 * funcionava quando esquecida:
 *
 * 1. **A raiz espera uma entrada, e só isso.** Sem entrada o motor recusa publicar
 *    ("O estado raiz precisa esperar uma entrada"). E a entrada da raiz consome a
 *    PRIMEIRA mensagem do cliente (`processarEntrada`: o estado guardado é nulo, cai
 *    na raiz, e a raiz valida a entrada antes de sair) — por isso a fala do robô fica
 *    no bloco SEGUINTE, não na raiz, senão nunca sai.
 * 2. **O transbordo é a ação `ForwardToDesk`**, não o prefixo do id: é ela que chama
 *    `encaminharParaAtendimento` e põe a conversa na fila (`apps/api/src/dominio/
 *    fluxo.ts`). O prefixo `desk:` é o que faz o motor entregar o `Ticket` encerrado
 *    de volta a este bloco quando o atendimento acaba — e é a convenção da Blip, então
 *    a tela desenha o bloco com a cara certa.
 * 3. **O bloco de atendimento espera `desk_forwardToDeskState_status = Success`** e
 *    volta à raiz por padrão: encerrado o atendimento, a próxima mensagem recomeça.
 *
 * Ele não é gravado no banco: é só o ponto de partida enquanto o cliente não salvou
 * nada. No primeiro "salvar", o que vale é o desenho dele.
 */

function estado(
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

/** Uma fala do robô, no formato que o editor desenha na bolha da esquerda. */
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

/** A espera pela mensagem do cliente. É o que torna o bloco publicável. */
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
export const ID_DO_ATENDIMENTO_PADRAO = 'desk:atendimento';

export const FLUXO_PADRAO: Record<string, unknown> = {
  [ID_DA_RAIZ_PADRAO]: estado(ID_DA_RAIZ_PADRAO, 'Início', '120px', '640px', {
    root: true,
    $contentActions: [espera('inicio-1', 'mensagem do cliente')],
    $defaultOutput: { stateId: ID_DO_ATENDIMENTO_PADRAO, $invalid: false },
  }),
  [ID_DO_ATENDIMENTO_PADRAO]: estado(
    ID_DO_ATENDIMENTO_PADRAO,
    'Atendimento humano',
    '360px',
    '640px',
    {
      deskStateVersion: '3.0.0',
      // `ForwardToDesk` roda ANTES do conteúdo do bloco (`converterDoEditor`): a
      // conversa vai para a fila, e o aviso sai já dentro dela.
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
      // Encerrado o atendimento, a próxima mensagem recomeça do início.
      $defaultOutput: { stateId: ID_DA_RAIZ_PADRAO, $invalid: false },
    },
  ),
};

export const ACOES_GLOBAIS_PADRAO: Record<string, unknown> = {
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
