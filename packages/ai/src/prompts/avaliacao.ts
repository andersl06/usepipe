/**
 * Prompt de avaliação: o modelo responde o formulário critério a critério e cita a
 * linha da transcrição que sustenta cada resposta.
 *
 * A evidência não é enfeite de auditoria: é o que permite ao atendente contestar
 * com base em fato (§6 do modelo de dados) e é o que torna a nota da IA revisável.
 * Por isso ela é exigida sempre que o critério não sai conforme, e por isso ela é
 * um **rótulo da transcrição**, que dá para conferir, e não um trecho copiado, que
 * o modelo pode inventar.
 *
 * A nota **não** é pedida ao modelo. Ele responde valor e justificativa; o peso, o
 * grupo e o critério fatal são conta nossa, em `avaliacao/nota.ts`.
 */

import type { Formulario, GrupoCriterio } from '../avaliacao/tipos.js';
import { TETO_ESCALA, TETO_NOTA } from '../avaliacao/tipos.js';
import type { Prompt } from './tipos.js';

export interface EntradaAvaliacao {
  transcricao: string;
  truncada: boolean;
  mensagensOmitidas: number;
  formulario: Formulario;
  contexto?: string | null;
}

function valoresAceitos(tipo: string): string {
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
      const descricao = c.descricao?.trim() ? `\n    O que verificar: ${c.descricao.trim()}` : '';
      const fatal = c.fatal
        ? '\n    CRITÉRIO FATAL: não conforme aqui zera a avaliação inteira.'
        : '';
      return `  - id: ${c.id}\n    critério: ${c.nome}\n    valores: ${valoresAceitos(c.tipo)}${descricao}${fatal}`;
    })
    .join('\n');
  return `Grupo "${grupo.nome}":\n${criterios}`;
}

export const PROMPT_AVALIACAO: Prompt<EntradaAvaliacao> = {
  nome: 'avaliacao',
  versao: 'v1',
  montar(entrada) {
    const aviso = entrada.truncada
      ? `\n\nAviso: ${entrada.mensagensOmitidas} mensagens do meio foram omitidas por tamanho. Início e fim estão inteiros. Se um critério só puder ser julgado pelo trecho omitido, responda "nao_se_aplica" e diga isso na justificativa.`
      : '';
    const contexto = entrada.contexto?.trim() ? `Contexto: ${entrada.contexto.trim()}\n\n` : '';

    return {
      sistema: `Você é monitor de qualidade de uma central de atendimento brasileira. Avalia o **atendente**, nunca o cliente.

Responda TODOS os critérios do formulário "${entrada.formulario.nome}", um por um, usando o \`id\` exato de cada um. Não some, não pule, não invente critério.

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
${entrada.formulario.grupos.map(listarGrupo).join('\n\n')}`,
      usuario: `${contexto}Transcrição:\n${entrada.transcricao}${aviso}`,
    };
  },
};
