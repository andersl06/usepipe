import { knowledgeConsultSettings } from '@pipe/core';
import type { AcaoDoEditor, Block } from './model';
import { gerarId } from './model';
import { agentSettingsOf, newTool, withAgentSettings } from './ai-agent-block';

export interface SelectedKnowledgeDocument { id: string; baseId: string; active: boolean }
export interface KnowledgeSelection {
  catalogs: string[];
  documents: SelectedKnowledgeDocument[];
  tags: string[];
  topK: number;
  minimumScore: number;
  apiKeySecret: string;
}
export type KnowledgeScopeMode = 'bases' | 'documents';

export function newKnowledgeTool(block: Block, id = gerarId()): AcaoDoEditor {
  let n = 1;
  while ((block.$localCustomActions ?? []).some((a) => a.$title === `conhecimento_${n}`)) n++;
  return {
    ...newTool(block, 'KnowledgeBaseConsult', id),
    $title: `conhecimento_${n}`,
    $description: 'Consulte os documentos da base de conhecimento para responder perguntas do contato.',
    settings: { top_k: 5, catalogs: [], documents: [], tags: [] },
  };
}

export function knowledgeSelection(action: AcaoDoEditor): KnowledgeSelection {
  const settings = action.settings ?? {};
  // Let imported invalid numeric fields stay editable rather than crashing the sidebar.
  const parsed = knowledgeConsultSettings({ ...settings, minimumScore: 0 });
  const documents = Array.isArray(settings['documents']) ? settings['documents'] : [];
  return {
    catalogs: parsed.bases,
    documents: documents.map((value: unknown) => {
      const d = value && typeof value === 'object' ? value as Record<string, unknown> : {};
      return { id: typeof value === 'string' ? value : String(d['id'] ?? ''), baseId: String(d['catalog_id'] ?? ''), active: d['status'] !== 'inactive' };
    }).filter((d) => d.id),
    tags: parsed.tags,
    topK: Number(settings['top_k'] ?? settings['topK'] ?? 5),
    minimumScore: Number(settings['minimumScore'] ?? 0),
    apiKeySecret: typeof settings['apiKeySecret'] === 'string' ? settings['apiKeySecret'] : '',
  };
}

export function withKnowledgeSelection(action: AcaoDoEditor, selection: KnowledgeSelection): AcaoDoEditor {
  if (!Number.isInteger(selection.topK) || selection.topK < 1 || selection.topK > 20)
    throw new Error('Quantidade de trechos: use um inteiro entre 1 e 20.');
  if (!Number.isFinite(selection.minimumScore) || selection.minimumScore < 0 || selection.minimumScore > 1)
    throw new Error('Confiança mínima: use um número entre 0 e 1.');
  const settings = { ...action.settings,
    // Runtime combines filters with AND. In document mode catalogs only name document parents;
    // legacy imported string IDs without parent metadata use the document filter alone.
    catalogs: selection.documents.length
      ? selection.documents.every((d) => d.baseId) ? [...new Set(selection.documents.map((d) => d.baseId))] : []
      : [...selection.catalogs],
    documents: selection.documents.map((d) => ({ id: d.id, catalog_id: d.baseId, status: d.active ? 'active' : 'inactive' })),
    tags: [...selection.tags], top_k: selection.topK, minimumScore: selection.minimumScore,
  } as Record<string, unknown>;
  if (selection.apiKeySecret.trim()) settings['apiKeySecret'] = selection.apiKeySecret.trim();
  else delete settings['apiKeySecret'];
  return { ...action, settings };
}

/** Changing scope mode clears the previous mode's selection, preserving tags and query settings. */
export function withKnowledgeScopeMode(action: AcaoDoEditor, mode: KnowledgeScopeMode): AcaoDoEditor {
  const current = knowledgeSelection(action);
  return withKnowledgeSelection(action, { ...current,
    catalogs: mode === 'bases' && current.documents.length === 0 ? current.catalogs : [],
    documents: mode === 'documents' ? current.documents : [],
  });
}

export function toggleKnowledgeBase(action: AcaoDoEditor, baseId: string, selected: boolean): AcaoDoEditor {
  const current = knowledgeSelection(action);
  const catalogs = current.documents.length ? [] : current.catalogs;
  return withKnowledgeSelection(action, { ...current,
    catalogs: selected ? [...new Set([...catalogs, baseId])] : catalogs.filter((id) => id !== baseId),
    documents: [],
  });
}

export function toggleKnowledgeDocument(action: AcaoDoEditor, document: SelectedKnowledgeDocument, selected: boolean): AcaoDoEditor {
  const current = knowledgeSelection(action);
  return withKnowledgeSelection(action, { ...current,
    catalogs: [],
    documents: selected ? [...current.documents.filter((d) => d.id !== document.id), document] : current.documents.filter((d) => d.id !== document.id),
  });
}

export interface McpServerDraft { code: string; url: string; secretHeaders: Record<string, string> }
export interface McpServerView extends McpServerDraft { transport: string }

export function mcpServers(block: Block): McpServerView[] {
  const tools = agentSettingsOf(block)['tools'];
  if (!tools || typeof tools !== 'object' || Array.isArray(tools)) return [];
  return Object.entries(tools).flatMap(([code, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || code === 'grounding-mcp') return [];
    const server = value as Record<string, unknown>;
    if (typeof server['mcp'] !== 'string') return [];
    return [{ code, url: server['mcp'], transport: String(server['transport'] ?? 'streamable-http'),
      secretHeaders: server['secretHeaders'] && typeof server['secretHeaders'] === 'object' && !Array.isArray(server['secretHeaders'])
        ? server['secretHeaders'] as Record<string, string> : {} }];
  });
}

export function saveMcpServer(block: Block, draft: McpServerDraft, previousCode?: string): { ok: true; block: Block } | { ok: false; error: string } {
  const code = draft.code.trim();
  if (!/^[a-z0-9_-]{3,64}$/.test(code) || code === 'grounding-mcp')
    return { ok: false, error: 'Nome do servidor: use 3 a 64 letras minúsculas, números, "_" ou "-".' };
  const settings = structuredClone(agentSettingsOf(block));
  const tools = settings['tools'] && typeof settings['tools'] === 'object' && !Array.isArray(settings['tools'])
    ? settings['tools'] as Record<string, unknown> : {};
  if (code !== previousCode && Object.hasOwn(tools, code)) return { ok: false, error: 'Já existe um servidor com este nome.' };
  let url: URL;
  try { url = new URL(draft.url.trim()); } catch { return { ok: false, error: 'Informe a URL HTTPS do servidor MCP.' }; }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password ||
    host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
    host.startsWith('['))
    return { ok: false, error: 'Use uma URL HTTPS pública, sem credenciais na URL.' };
  const secretHeaders: Record<string, string> = {};
  const usedHeaders = new Set<string>();
  for (const [header, secret] of Object.entries(draft.secretHeaders)) {
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(header.trim()) || !/^[\p{L}\p{N}_.]{1,190}$/u.test(secret.trim()))
      return { ok: false, error: 'Informe um cabeçalho HTTP e o nome da variável sensível para cada linha.' };
    if (usedHeaders.has(header.trim().toLowerCase())) return { ok: false, error: 'Não repita o mesmo cabeçalho HTTP.' };
    usedHeaders.add(header.trim().toLowerCase());
    secretHeaders[header.trim()] = secret.trim();
  }
  const previous = previousCode && tools[previousCode] && typeof tools[previousCode] === 'object'
    ? tools[previousCode] as Record<string, unknown> : {};
  if (previousCode && previousCode !== code) delete tools[previousCode];
  settings['tools'] = { ...tools, [code]: { ...previous, code, mcp: url.toString(), transport: 'streamable-http', secretHeaders } };
  return { ok: true, block: withAgentSettings(block, settings) };
}

export function removeMcpServer(block: Block, code: string): Block {
  const settings = structuredClone(agentSettingsOf(block));
  if (settings['tools'] && typeof settings['tools'] === 'object') delete (settings['tools'] as Record<string, unknown>)[code];
  return withAgentSettings(block, settings);
}
