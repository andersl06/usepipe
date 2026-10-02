import type { TransactionPipe, Ator } from '@pipe/db';
import type { Campos, Resultado } from './campos.js';
import { PipeError } from '../../../errors.js';
import {
  writeLabelsOfClosure,
  writeCatalogLabels,
  writeIdentity,
  gravarPesquisa,
} from '../settings.js';
import {
  SCALE_BY_TYPE,
  disparoValido,
  tipoDePesquisaValido,
  type TipoDePesquisa,
} from '../pesquisa.js';

/**
 * `Configurações gerais` preference Server Actions operate one CARD at a time. In source Blip General Settings, "não há um botão Salvar da tela — cada cartão tem o seu" (`blip-telas-cadastro.md` §1 and §3). Thus three actions are independent: an error in the survey card does not undo a saved identity card. These actions only read fields and validate; Postgres writes and audit logging live in `lib/configuracoes.ts`.
 */

const OK: Resultado = { ok: true };

function falha(erro: string): Resultado {
  return { ok: false, error: erro };
}

/**
 * Return the runtime's canonical IANA time-zone spelling, or `null` if unknown. Use `Intl` for validation, just as `packages/core/src/sla/expediente.ts` does when converting instants to local time; a zone accepted here will work in SLA calculations.
 */
function normalizarFuso(fuso: string): string | null {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------- identidade

export async function saveIdentity(
  tx: TransactionPipe,
  tid: string,
  ator: Ator,
  dados: Campos,
): Promise<Resultado> {
  const nome = String(dados.get('nome') ?? '').trim();
  const fusoBruto = String(dados.get('fuso') ?? '').trim();
  const idioma = String(dados.get('idioma') ?? '').trim();

  if (!nome) return falha('Informe o nome da operação.');
  if (!idioma) return falha('Informe o idioma.');

  const fuso = normalizarFuso(fusoBruto);
  if (fuso === null) {
    return falha(`"${fusoBruto}" não é um fuso IANA conhecido. Exemplo: America/Sao_Paulo.`);
  }

  try {
    const gravado = await writeIdentity(tx, tid, ator, { name: nome, fuso, idioma });
    if (!gravado.ok) return falha(gravado.error);
  } catch (erro) {
    if (erro instanceof PipeError) return falha(erro.message);
    throw erro;
  }

  // The time zone defines "today" for every card and report; changing only one screen is insufficient.
  return OK;
}

// --------------------------------------------------------------- pesquisa

/**
 * Satisfaction survey, section 6 of the metrics spec. The scale is derived from the survey type, not submitted in the form; this prevents a "CSAT de 0 a 10" that no report can classify. `resposta_pesquisa` stores the scale with each response, so changing this setting does not reclassify history.
 */
export async function salvarPesquisa(
  tx: TransactionPipe,
  tid: string,
  ator: Ator,
  dados: Campos,
): Promise<Resultado> {
  const id = String(dados.get('id') ?? '').trim();
  const tipoBruto = String(dados.get('tipo') ?? '').trim();
  const pergunta = String(dados.get('pergunta') ?? '').trim();
  const disparo = String(dados.get('disparo') ?? '').trim();
  const active = dados.get('ativa') !== null;

  if (!tipoDePesquisaValido(tipoBruto)) return falha('Escolha CSAT ou NPS.');
  if (!disparoValido(disparo)) return falha('Escolha quando a pesquisa é disparada.');
  if (!pergunta) return falha('Informe a pergunta que o cliente vai ler.');

  const tipo: TipoDePesquisa = tipoBruto;
  const escala = SCALE_BY_TYPE[tipo];

  try {
    const gravado = await gravarPesquisa(tx, tid, ator, {
      id,
      type: tipo,
      escalaMin: escala.min,
      escalaMax: escala.max,
      pergunta,
      trigger: disparo,
      ativa: active,
    });
    if (!gravado.ok) return falha(gravado.error);
  } catch (error) {
    if (error instanceof PipeError) return falha(error.message);
    throw error;
  }
  return OK;
}


/**
 * The source setting ("Tornar obrigatória a inclusão de tags em atendimentos finalizados manualmente"; `blip-telas-cadastro.md` §3) maps to our `etiqueta.obrigatoria_no_encerramento`. The section switch enables the requirement; the body chooses WHICH tags qualify. Disabling the section clears them all, so the switch has effect instead of sitting above a still-active list.
 */
export async function saveLabelsOfClosure(
  tx: TransactionPipe,
  tid: string,
  ator: Ator,
  data: Campos,
): Promise<Resultado> {
  const exigir = data.get('exigir') !== null;
  const escolhidas = exigir ? data.getAll('etiqueta').map((v) => String(v)) : [];

  if (exigir && escolhidas.length === 0) {
    return falha(
      'Exigir etiqueta sem escolher nenhuma travaria todo encerramento. Marque pelo menos uma, ou desligue a exigência.',
    );
  }

  try {
    const gravado = await writeLabelsOfClosure(tx, tid, ator, escolhidas);
    if (!gravado.ok) return falha(gravado.error);
  } catch (erro) {
    if (erro instanceof PipeError) return falha(erro.message);
    throw erro;
  }
  return OK;
}

/** Catálogo global de tags (chips): lista completa, validada no servidor. */
export async function saveCatalogLabels(
  tx: TransactionPipe,
  tid: string,
  ator: Ator,
  data: Campos,
): Promise<Resultado> {
  const nomes = data.getAll('tag').map((v) => String(v));
  try {
    const gravado = await writeCatalogLabels(tx, tid, ator, nomes);
    if (!gravado.ok) return falha(gravado.error);
  } catch (erro) {
    if (erro instanceof PipeError) return falha(erro.message);
    throw erro;
  }
  return OK;
}
