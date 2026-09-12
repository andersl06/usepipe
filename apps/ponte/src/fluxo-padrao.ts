/**
 * O fluxo que o cliente encontra quando abre o Builder pela primeira vez.
 *
 * De propósito é o menor fluxo que já é útil: a mensagem chega, o robô avisa que vai
 * chamar gente, e a conversa vai para a fila. Nada de menu, horário ou ramificação —
 * isso é o que a empresa vai montar por cima, com a ajuda do assistente.
 *
 * Duas regras do motor estão embutidas aqui, e as duas custam um erro na tela quando
 * esquecidas:
 *
 * 1. **O bloco inicial precisa esperar uma entrada.** Sem isso o motor recusa
 *    publicar ("O estado raiz precisa esperar uma entrada"), porque um fluxo que não
 *    espera ninguém falar roda sozinho até o fim.
 * 2. **O bloco de atendimento tem id começando em `desk:`**, que é como o motor
 *    reconhece transbordo (`apps/api/src/dominio/fluxo.ts`): dali em diante o robô
 *    cala a boca e quem responde é o atendente. É também a convenção da Blip, então
 *    a tela desenha o bloco com a cara certa.
 *
 * Ele não é gravado no banco: é só o ponto de partida que a ponte devolve enquanto o
 * cliente não salvou nada. No primeiro "salvar", o que vale é o desenho dele.
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
function espera(id: string, dica: string): Record<string, unknown> {
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
    },
    $invalid: false,
  };
}

export const FLUXO_PADRAO: Record<string, unknown> = {
  onboarding: estado('onboarding', 'Início', '120px', '640px', {
    root: true,
    $contentActions: [
      fala('inicio-1', 'Olá! Já estou chamando um atendente para você.'),
      espera('inicio-2', 'mensagem do cliente'),
    ],
    $defaultOutput: { stateId: 'desk:atendimento', $invalid: false },
  }),
  'desk:atendimento': estado('desk:atendimento', 'Atendimento humano', '360px', '640px', {
    // Sem saída: daqui em diante quem conduz é a pessoa, não o robô.
    $defaultOutput: null,
  }),
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
