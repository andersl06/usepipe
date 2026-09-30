import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ivm from 'isolated-vm';
import { MAX_TEMPLATE_BYTES, type TemplateRequest } from '@pipe/core';
import { MAX_RESULTADO_BYTES, catastrophic, liberarIsolate, ocuparIsolate } from './script-sandbox.js';

/**
 * `ExecuteTemplate` (P9) renders with Handlebars inside a fresh V8 isolate, the same sandbox as flow
 * scripts: Handlebars compiles a template into JavaScript, so the compile and the render stay under
 * the isolate's memory and time limits and share its concurrency slots. Only JSON-safe data crosses
 * the boundary: the template and the data are copied in, the text is copied out.
 */

/** Heap for one render: Handlebars and a 64 KB template fit easily. */
const TEMPLATE_MEMORY_MB = 64;

const requireFromHere = createRequire(import.meta.url);
let handlebarsSource: string | undefined;
let handlebarsCache: ivm.ExternalCopy<ArrayBuffer> | undefined;

/** The browser build (UMD): run as a plain script it defines the `Handlebars` global. */
function handlebars(): string {
  handlebarsSource ??= readFileSync(requireFromHere.resolve('handlebars/dist/handlebars.min.js'), 'utf8');
  return handlebarsSource;
}

/**
 * `Handlebars.create()` gives an environment without globally registered helpers or partials;
 * `noEscape` because the result is message text, not HTML. Prototype properties and methods stay
 * blocked (the Handlebars ≥ 4.6 default), so a template cannot reach `constructor` or `__proto__`.
 */
const RENDER = `
  const hb = Handlebars.create();
  const render = hb.compile($0, { noEscape: true, strict: false });
  const text = render($1, { allowProtoPropertiesByDefault: false, allowProtoMethodsByDefault: false });
  return typeof text === 'string' ? text : String(text);
`;

export async function renderFlowTemplate(request: TemplateRequest): Promise<string> {
  if (Buffer.byteLength(request.template, 'utf8') > MAX_TEMPLATE_BYTES) {
    throw new Error(`O template excede ${MAX_TEMPLATE_BYTES / 1024} KB.`);
  }
  await ocuparIsolate(request.timeoutMs);
  try {
    const text = await renderInIsolate(request);
    if (Buffer.byteLength(text, 'utf8') > MAX_RESULTADO_BYTES) {
      throw new Error(`O resultado do template excede ${MAX_RESULTADO_BYTES / 1024} KB.`);
    }
    return text;
  } finally {
    liberarIsolate();
  }
}

async function renderInIsolate(request: TemplateRequest): Promise<string> {
  const isolate = new ivm.Isolate({ memoryLimit: TEMPLATE_MEMORY_MB, onCatastrophicError: catastrophic });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    if (!isolate.isDisposed) isolate.dispose();
  }, request.timeoutMs);
  let loaded = false;
  try {
    const context = await isolate.createContext();
    const script = await isolate.compileScript(
      handlebars(),
      handlebarsCache ? { cachedData: handlebarsCache } : { produceCachedData: true },
    );
    // V8 code cache: later isolates skip parsing the 90 KB Handlebars build. (The typings omit it.)
    const produced = (script as ivm.Script & ivm.CachedDataResult).cachedData;
    if (!handlebarsCache && produced) handlebarsCache = produced;
    await script.run(context, { timeout: request.timeoutMs });
    loaded = true;
    return (await context.evalClosure(RENDER, [request.template, request.data], {
      arguments: { copy: true },
      result: { copy: true },
      timeout: request.timeoutMs,
    })) as string;
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (timedOut || /timed out/i.test(text)) {
      throw new Error(`O template excedeu o tempo limite de ${request.timeoutMs / 1000} s.`);
    }
    if (/memory limit/i.test(text)) {
      throw new Error(`O template excedeu o limite de memória de ${TEMPLATE_MEMORY_MB} MB.`);
    }
    if (!loaded) throw error instanceof Error ? error : new Error(text);
    // Handlebars parse and render errors ("Parse error on line 1: …", "Missing helper: …").
    throw new Error(`Não foi possível renderizar o template: ${text}`);
  } finally {
    clearTimeout(timer);
    if (!isolate.isDisposed) isolate.dispose();
  }
}
