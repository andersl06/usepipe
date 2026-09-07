'use server';

import { revalidatePath } from 'next/cache';
import {
  gravarEtiquetasDeEncerramento,
  gravarIdentidade,
  gravarPesquisa,
} from '../../lib/configuracoes';
import {
  ESCALA_POR_TIPO,
  disparoValido,
  tipoDePesquisaValido,
  type TipoDePesquisa,
} from '../../lib/pesquisa';

/**
 * Server Actions de Preferências ├ Configurações gerais.
 *
 * Uma ação por CARTÃO, e não uma por tela: em `Configurações gerais` da Blip
 * "não há um botão Salvar da tela — cada cartão tem o seu"
 * (`blip-telas-cadastro.md` §1 e §3). A consequência é esta: três ações
 * independentes, e um erro no cartão de pesquisa não derruba o que já foi salvo
 * no cartão de identidade.
 *
 * Cada uma faz só o que é da tela — ler o `FormData`, validar, revalidar a
 * rota. A conversa com o Postgres e o log de auditoria moram em
 * `lib/configuracoes.ts`.
 */

export interface Resultado {
  ok: boolean;
  erro?: string;
}

const OK: Resultado = { ok: true };

function falha(erro: string): Resultado {
  return { ok: false, erro };
}

/**
 * O fuso, na grafia canônica do runtime, ou `null` se o IANA não conhece.
 *
 * A validação é o próprio `Intl`, o mesmo que
 * `packages/core/src/sla/expediente.ts` usa para converter instante em hora
 * local: fuso que passa aqui é fuso que o cálculo de SLA vai aceitar.
 */
function normalizarFuso(fuso: string): string | null {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------- identidade

export async function salvarIdentidade(_anterior: Resultado, dados: FormData): Promise<Resultado> {
  const nome = String(dados.get('nome') ?? '').trim();
  const fusoBruto = String(dados.get('fuso') ?? '').trim();
  const idioma = String(dados.get('idioma') ?? '').trim();

  if (!nome) return falha('Informe o nome da operação.');
  if (!idioma) return falha('Informe o idioma.');

  const fuso = normalizarFuso(fusoBruto);
  if (fuso === null) {
    return falha(`"${fusoBruto}" não é um fuso IANA conhecido. Exemplo: America/Sao_Paulo.`);
  }

  const gravado = await gravarIdentidade({ nome, fuso, idioma });
  if (!gravado.ok) return falha(gravado.erro);

  // O fuso é o "hoje" de todo cartão e de todo relatório: uma tela só não basta.
  revalidatePath('/', 'layout');
  return OK;
}

// --------------------------------------------------------------- pesquisa

/**
 * A pesquisa de satisfação — §6 da spec de métricas.
 *
 * A escala NÃO vem do formulário: é consequência do tipo. É o que impede o
 * "CSAT de 0 a 10" que nenhum relatório sabe classificar. Como
 * `resposta_pesquisa` guarda a escala junto de cada resposta, mudar aqui não
 * reclassifica o passado.
 */
export async function salvarPesquisa(_anterior: Resultado, dados: FormData): Promise<Resultado> {
  const id = String(dados.get('id') ?? '').trim();
  const tipoBruto = String(dados.get('tipo') ?? '').trim();
  const pergunta = String(dados.get('pergunta') ?? '').trim();
  const disparo = String(dados.get('disparo') ?? '').trim();
  const ativa = dados.get('ativa') !== null;

  if (!tipoDePesquisaValido(tipoBruto)) return falha('Escolha CSAT ou NPS.');
  if (!disparoValido(disparo)) return falha('Escolha quando a pesquisa é disparada.');
  if (!pergunta) return falha('Informe a pergunta que o cliente vai ler.');

  const tipo: TipoDePesquisa = tipoBruto;
  const escala = ESCALA_POR_TIPO[tipo];

  const gravado = await gravarPesquisa({
    id,
    tipo,
    escalaMin: escala.min,
    escalaMax: escala.max,
    pergunta,
    disparo,
    ativa,
  });
  if (!gravado.ok) return falha(gravado.erro);

  revalidatePath('/configuracoes/gerais');
  revalidatePath('/relatorios/satisfacao');
  return OK;
}

// ------------------------------------------- etiqueta obrigatória ao encerrar

/**
 * "Tornar obrigatória a inclusão de tags em atendimentos finalizados
 * manualmente" — o texto é deles (`blip-telas-cadastro.md` §3), a coluna é
 * nossa: `etiqueta.obrigatoria_no_encerramento`.
 *
 * O interruptor da seção liga a exigência; o corpo escolhe QUAIS etiquetas
 * entram. Desligar a seção limpa todas — é o que faz o interruptor significar
 * alguma coisa em vez de virar decoração acima de uma lista que continua
 * valendo.
 */
export async function salvarEtiquetasDeEncerramento(
  _anterior: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const exigir = dados.get('exigir') !== null;
  const escolhidas = exigir ? dados.getAll('etiqueta').map((v) => String(v)) : [];

  if (exigir && escolhidas.length === 0) {
    return falha(
      'Exigir etiqueta sem escolher nenhuma travaria todo encerramento. Marque pelo menos uma, ou desligue a exigência.',
    );
  }

  const gravado = await gravarEtiquetasDeEncerramento(escolhidas);
  if (!gravado.ok) return falha(gravado.erro);

  revalidatePath('/configuracoes/gerais');
  revalidatePath('/configuracoes/dados');
  return OK;
}
