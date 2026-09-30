import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type {
  FlowAiAssistant,
  FlowAiContent,
  FlowAiEntity,
  FlowAiIntent,
  FlowAiModel,
  FlowAiModelInput,
  FlowAiModelSettings,
} from '@pipe/contracts';
import type { TransactionPipe } from '@pipe/db';
import { PipeError } from '../../errors.js';
import { requirePermissionInFlow } from './team-of-flow.js';

/**
 * The flow's AI model (P16, `modelo_ia_do_fluxo`, migration 0080): NLP intents and entities, the
 * content assistant's contents and the AI Answers assistants. Blip keeps these per bot in its AI
 * extension and AI Answers service; a Blip bot is a Pipe flow, so Pipe keeps one document per flow
 * (like `recurso_do_fluxo` and the flow secrets). Read and written whole, with `builder.ler` /
 * `builder.escrever` on the flow. Raw SQL, as in `flow-secrets.ts`, keeping the shared Drizzle
 * schema untouched.
 *
 * `settings.apiKeySecret` is only the NAME of a flow secret; no key is ever stored here.
 */

export const AI_MODEL_LIMITS = {
  intents: 200,
  entities: 100,
  valuesPerEntity: 200,
  contents: 200,
  combinationsPerContent: 20,
  assistants: 20,
  knowledgePerAssistant: 500,
  examplesPerIntent: 100,
  answersPerIntent: 20,
  synonymsPerValue: 50,
  shortText: 190,
  longText: 4_000,
  /** Serialized document; the table check allows 2 MB. */
  bytes: 1_048_576,
} as const;

/** An intent or entity name is compared by conditions and read as `input.entity.<name>`: no spaces or dots. */
const NAME = /^[\p{L}\p{N}_-]{1,190}$/u;
const SECRET_NAME = /^[\p{L}\p{N}_.]{1,190}$/u;

const bad = (codigo: string, mensagem: string): PipeError => PipeError.request(codigo, mensagem);

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function list(value: unknown, max: number, what: string): unknown[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw bad('modelo_invalido', `O campo ${what} deve ser uma lista.`);
  if (value.length > max) throw bad('modelo_grande_demais', `O campo ${what} aceita no máximo ${max} itens.`);
  return value;
}

function optionalText(value: unknown, max: number, what: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw bad('modelo_invalido', `O campo ${what} deve ser um texto.`);
  const text = value.trim();
  if (text.length > max) throw bad('modelo_grande_demais', `O campo ${what} aceita no máximo ${max} caracteres.`);
  return text || undefined;
}

function requiredText(value: unknown, max: number, what: string): string {
  const text = optionalText(value, max, what);
  if (!text) throw bad('modelo_invalido', `Preencha o campo ${what}.`);
  return text;
}

function texts(value: unknown, max: number, maxLength: number, what: string): string[] {
  return [...new Set(list(value, max, what).map((item) => requiredText(item, maxLength, what)))];
}

function name(value: unknown, what: string): string {
  const text = requiredText(value, AI_MODEL_LIMITS.shortText, what);
  if (!NAME.test(text)) {
    throw bad('nome_invalido', `O nome ${what} "${text}" deve conter apenas letras, números, "_" ou "-" (sem espaços ou pontos).`);
  }
  return text;
}

function id(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return text && text.length <= AI_MODEL_LIMITS.shortText ? text : randomUUID();
}

function unique<T>(items: T[], key: (item: T) => string, what: string): T[] {
  const seen = new Set<string>();
  for (const item of items) {
    const k = key(item).toLowerCase();
    if (seen.has(k)) throw bad('nome_duplicado', `Há mais de ${what} com o nome "${key(item)}".`);
    seen.add(k);
  }
  return items;
}

function settingsOf(value: unknown): FlowAiModelSettings {
  const s = obj(value);
  const provider = s['provider'] === undefined || s['provider'] === null || s['provider'] === '' ? null : s['provider'];
  if (provider !== null && provider !== 'anthropic' && provider !== 'openai') {
    throw bad('provedor_invalido', 'O provedor deve ser Anthropic ou OpenAI.');
  }
  const apiKeySecret = optionalText(s['apiKeySecret'], AI_MODEL_LIMITS.shortText, 'variável sensível da chave') ?? null;
  if (apiKeySecret && !SECRET_NAME.test(apiKeySecret)) {
    throw bad('nome_invalido', 'O nome da variável sensível deve conter apenas letras, números, "_" ou ".".');
  }
  return {
    provider,
    model: optionalText(s['model'], AI_MODEL_LIMITS.shortText, 'modelo') ?? null,
    apiKeySecret,
  };
}

/** Validate and normalise a whole model; throws a 400 `PipeError` in Portuguese. */
export function normalizeAiModel(input: unknown): FlowAiModelInput {
  const body = obj(input);
  const L = AI_MODEL_LIMITS;
  const intents: FlowAiIntent[] = unique(
    list(body['intents'], L.intents, 'intenções').map((raw) => {
      const i = obj(raw);
      const description = optionalText(i['description'], L.longText, 'descrição da intenção');
      return {
        id: id(i['id']),
        name: name(i['name'], 'da intenção'),
        ...(description ? { description } : {}),
        examples: texts(i['examples'], L.examplesPerIntent, L.longText, 'exemplos da intenção'),
        answers: texts(i['answers'], L.answersPerIntent, L.longText, 'respostas da intenção'),
      };
    }),
    (i) => i.name,
    'uma intenção',
  );
  const entities: FlowAiEntity[] = unique(
    list(body['entities'], L.entities, 'entidades').map((raw) => {
      const e = obj(raw);
      const values = unique(
        list(e['values'], L.valuesPerEntity, 'valores da entidade').map((rawValue) => {
          const v = obj(rawValue);
          return {
            name: requiredText(v['name'], L.shortText, 'valor da entidade'),
            synonyms: texts(v['synonyms'], L.synonymsPerValue, L.shortText, 'sinônimos'),
          };
        }),
        (v) => v.name,
        'um valor',
      );
      return { id: id(e['id']), name: name(e['name'], 'da entidade'), values };
    }),
    (e) => e.name,
    'uma entidade',
  );
  const intentNames = new Set(intents.map((i) => i.name.toLowerCase()));
  const contents: FlowAiContent[] = unique(
    list(body['contents'], L.contents, 'conteúdos').map((raw) => {
      const c = obj(raw);
      const combinations = list(c['combinations'], L.combinationsPerContent, 'combinações').map((rawCombination) => {
        const k = obj(rawCombination);
        const intent = optionalText(k['intent'], L.shortText, 'intenção da combinação') ?? null;
        if (intent && !intentNames.has(intent.toLowerCase())) {
          throw bad('intencao_inexistente', `A combinação usa a intenção "${intent}", que não existe no modelo.`);
        }
        const entityValues = texts(k['entities'], L.valuesPerEntity, L.shortText, 'entidades da combinação');
        const min = k['minEntityMatch'];
        if (!intent && entityValues.length === 0) {
          throw bad('combinacao_vazia', 'Cada combinação precisa de uma intenção ou de pelo menos uma entidade.');
        }
        if (min !== undefined && min !== null && (!Number.isInteger(min) || (min as number) < 0 || (min as number) > entityValues.length)) {
          throw bad('modelo_invalido', 'O mínimo de entidades da combinação deve estar entre 0 e o número de entidades.');
        }
        return {
          intent,
          entities: entityValues,
          ...(min !== undefined && min !== null ? { minEntityMatch: min as number } : {}),
        };
      });
      if (combinations.length === 0) throw bad('modelo_invalido', 'Cada conteúdo precisa de pelo menos uma combinação.');
      return {
        id: id(c['id']),
        name: requiredText(c['name'], L.shortText, 'nome do conteúdo'),
        combinations,
        result: requiredText(c['result'], L.longText, 'resposta do conteúdo'),
      };
    }),
    (c) => c.name,
    'um conteúdo',
  );
  const assistants: FlowAiAssistant[] = unique(
    list(body['assistants'], L.assistants, 'assistentes').map((raw) => {
      const a = obj(raw);
      const companyName = optionalText(a['companyName'], L.shortText, 'nome da empresa');
      const profile = optionalText(a['profile'], L.longText, 'perfil do assistente');
      const guidelines = optionalText(a['guidelines'], L.longText, 'diretrizes do assistente');
      return {
        id: id(a['id']),
        name: requiredText(a['name'], L.shortText, 'nome do assistente'),
        ...(companyName ? { companyName } : {}),
        ...(profile ? { profile } : {}),
        ...(guidelines ? { guidelines } : {}),
        invalidAnswer: requiredText(a['invalidAnswer'], L.longText, 'resposta para perguntas fora da base'),
        knowledge: list(a['knowledge'], L.knowledgePerAssistant, 'base do assistente').map((rawEntry) => {
          const k = obj(rawEntry);
          return {
            question: requiredText(k['question'], L.longText, 'pergunta da base'),
            answer: requiredText(k['answer'], L.longText, 'resposta da base'),
          };
        }),
      };
    }),
    (a) => a.id,
    'um assistente',
  );
  const model: FlowAiModelInput = { settings: settingsOf(body['settings']), intents, entities, contents, assistants };
  if (Buffer.byteLength(JSON.stringify(model)) > L.bytes) {
    throw bad('modelo_grande_demais', 'O modelo de IA do fluxo excede 1 MB.');
  }
  return model;
}

const EMPTY: FlowAiModelInput = {
  settings: { provider: null, model: null, apiKeySecret: null },
  intents: [],
  entities: [],
  contents: [],
  assistants: [],
};

type Row = {
  settings: unknown; intents: unknown; entities: unknown; contents: unknown; assistants: unknown;
  updatedAt: Date | string | null; createdAt: Date | string;
};

/** Rows were validated on write; a hand-edited row that no longer validates reads as empty lists. */
function fromRow(row: Row | undefined): FlowAiModelInput & { updatedAt: string | null } {
  if (!row) return { ...EMPTY, updatedAt: null };
  let model: FlowAiModelInput;
  try {
    model = normalizeAiModel(row);
  } catch {
    model = EMPTY;
  }
  const at = row.updatedAt ?? row.createdAt;
  return { ...model, updatedAt: at ? new Date(at).toISOString() : null };
}

const SELECT = sql`configuracao as settings, intencoes as intents, entidades as entities, conteudos as contents,
  assistentes as assistants, criado_em as "createdAt", atualizado_em as "updatedAt"`;

/** The engine's read (production and the Builder test run): null when the flow has no model. */
export async function loadFlowAiModel(tx: TransactionPipe, flowId: string): Promise<FlowAiModelInput | null> {
  const { rows } = await tx.execute<Row>(sql`select ${SELECT} from modelo_ia_do_fluxo where fluxo_id = ${flowId}::uuid limit 1`);
  if (!rows[0]) return null;
  const model: FlowAiModelInput & { updatedAt?: string | null } = fromRow(rows[0]);
  delete model.updatedAt;
  return model;
}

async function flowLive(tx: TransactionPipe, tenantId: string, flowId: string): Promise<void> {
  const { rows } = await tx.execute<{ id: string }>(sql`
    select id from fluxo where id = ${flowId}::uuid and tenant_id = ${tenantId} and estado <> 'arquivado'
  `);
  if (!rows[0]) throw PipeError.naoEncontrado('fluxo');
}

export async function getFlowAiModel(
  tx: TransactionPipe,
  userId: string,
  tenantId: string,
  flowId: string,
): Promise<FlowAiModel> {
  await flowLive(tx, tenantId, flowId);
  await requirePermissionInFlow(tx, userId, flowId, 'builder.ler');
  const { rows } = await tx.execute<Row>(sql`select ${SELECT} from modelo_ia_do_fluxo where fluxo_id = ${flowId}::uuid limit 1`);
  return { flowId, ...fromRow(rows[0]) };
}

export async function saveFlowAiModel(
  tx: TransactionPipe,
  userId: string,
  tenantId: string,
  flowId: string,
  input: unknown,
): Promise<FlowAiModel> {
  await flowLive(tx, tenantId, flowId);
  await requirePermissionInFlow(tx, userId, flowId, 'builder.escrever');
  const model = normalizeAiModel(input);
  const { rows } = await tx.execute<Row>(sql`
    insert into modelo_ia_do_fluxo (tenant_id, fluxo_id, configuracao, intencoes, entidades, conteudos, assistentes)
    values (current_setting('pipe.tenant_id')::uuid, ${flowId}::uuid,
            ${JSON.stringify(model.settings)}::jsonb, ${JSON.stringify(model.intents)}::jsonb,
            ${JSON.stringify(model.entities)}::jsonb, ${JSON.stringify(model.contents)}::jsonb,
            ${JSON.stringify(model.assistants)}::jsonb)
    on conflict (tenant_id, fluxo_id) do update set
      configuracao = excluded.configuracao, intencoes = excluded.intencoes, entidades = excluded.entidades,
      conteudos = excluded.conteudos, assistentes = excluded.assistentes, atualizado_em = now()
    returning ${SELECT}
  `);
  return { flowId, ...fromRow(rows[0]) };
}
