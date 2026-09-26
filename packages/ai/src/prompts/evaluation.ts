/**
 * The evaluation prompt answers each form criterion and cites the supporting transcript line. Evidence lets agents contest a score with facts (§6 of the data model) and makes AI scoring reviewable. Require evidence for every noncompliant criterion as a verifiable transcript label, rather than copied text the model might invent. Do not ask the model for a score: it returns value and rationale; `avaliacao/nota.ts` applies weights, groups, and fatal criteria.
 */

import type { Formulario, GrupoCriterio } from '../evaluation/tipos.js';
import { TETO_ESCALA, TETO_NOTA } from '../evaluation/tipos.js';
import type { Prompt } from './tipos.js';

export interface InboundEvaluation {
  transcription: string;
  truncada: boolean;
  messagesOmitted: number;
  formulario: Formulario;
  context?: string | null;
}

function valuesAccepted(tipo: string): string {
  switch (tipo) {
    case 'escala':
      return `um inteiro de 0 a ${TETO_ESCALA}, ou "nao_se_aplica"`;
    case 'nota':
      return `um inteiro de 0 a ${TETO_NOTA}, ou "nao_se_aplica"`;
    default:
      return '"conforme", "nao_conforme" ou "nao_se_aplica"';
  }
}

function listarGrupo(grupo: GrupoCriterio): string {
  const criterios = grupo.criterios
    .map((c) => {
      const description = c.description?.trim() ? `\n    O que verificar: ${c.description.trim()}` : '';
      const fatal = c.fatal
        ? '\n    CRITÉRIO FATAL: não conforme aqui zera a avaliação inteira.'
        : '';
      return `  - id: ${c.id}\n    critério: ${c.nome}\n    valores: ${valuesAccepted(c.tipo)}${description}${fatal}`;
    })
    .join('\n');
  return `Grupo "${grupo.nome}":\n${criterios}`;
}

export const PROMPT_EVALUATION: Prompt<InboundEvaluation> = {
  nome: 'avaliacao',
  versao: 'v1',
  montar(inbound) {
    const aviso = inbound.truncada
      ? `\n\nAviso: ${inbound.messagesOmitted} mensagens do meio foram omitidas por tamanho. Início e fim estão inteiros. Se um critério só puder ser julgado pelo trecho omitido, responda "nao_se_aplica" e diga isso na justificativa.`
      : '';
    const context = inbound.context?.trim() ? `Contexto: ${inbound.context.trim()}\n\n` : '';

    return {
      sistema: `Você é monitor de qualidade de uma central de atendimento brasileira. Avalia o **atendente**, nunca o cliente.

Responda TODOS os critérios do formulário "${inbound.formulario.nome}", um por um, usando o \`id\` exato de cada um. Não some, não pule, não invente critério.

Para cada critério devolva:
- \`criterioId\`: o id exato listado abaixo.
- \`valor\`: um dos valores aceitos daquele critério.
- \`justificativa\`: uma frase dizendo o que na conversa levou a esse valor.
- \`evidencia\`: o rótulo da linha da transcrição que sustenta a resposta, no formato \`m12\`.

Sobre a evidência:
- É **obrigatória** sempre que o critério não sair totalmente conforme (valor "nao_conforme", ou nota abaixo do máximo). Sem ela a resposta é inválida.
- Tem que ser um rótulo que existe na transcrição abaixo. Não invente rótulo, não cite trecho omitido, não cite duas linhas.
- Quando o critério é sobre algo que o atendente **deixou de fazer**, cite a linha onde ele deveria ter feito.
- Em "conforme" e "nao_se_aplica" a evidência é opcional: use null quando não houver linha específica.

Regras de julgamento:
- Julgue só o que está na transcrição. Linha marcada "NÃO TRANSCRITO" é conteúdo desconhecido: não presuma nem a favor nem contra o atendente.
- "nao_se_aplica" é para critério que a conversa não teve como exercitar. Não é sinônimo de "não fez": isso é "nao_conforme".
- Não calcule nota, não some pontos, não opine sobre o desempenho geral. Só responda os critérios.
- Ao final, \`confianca\`: um número de 0 a 1 dizendo o quanto a transcrição bastava para avaliar. Conversa curta, com áudio não transcrito ou truncada no meio pede confiança baixa.

Formulário:
${inbound.formulario.groups.map(listarGrupo).join('\n\n')}`,
      user: `${context}Transcrição:\n${inbound.transcription}${aviso}`,
    };
  },
};
