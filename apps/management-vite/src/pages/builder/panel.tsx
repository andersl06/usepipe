import { useState } from 'react';
import { IconePortal } from '@pipe/ui/icones-portal';
import type { Block, Mapa } from './model';
import { ehAttendance } from './model';
import { LIMITE_DO_TITULO } from './validation';
import { ROTULOS_DO_CONTEUDO } from './conteudo';
import { LABELS_OF_ACTIONS } from './actions-of-block';
import { ROTULOS_DAS_SAIDAS } from './conditions';
import { ContentPanel } from './panel-content';
import { ActionsPanel } from './panel-actions';
import { OutputsPanel } from './panel-outputs';
import { TAG_PALETTE, TAG_SUGGESTIONS, isLegacyBlue, resolveTagColor } from './tags-of-block';
import { filterVariables } from './variables';
import type { SubflowDrawing, Subflows } from './subflows';
import { isSubflowBlock } from './subflows';
import { SubflowSection } from './subflow-ui';
import { isAiAgentBlock } from './ai-agent-block';
import { AiAgentInstructionsPanel, AiAgentOutputsPanel } from './panel-ai-agent';

/** What the block panel needs to know about subflows (P13). */
export interface SubflowPanelContext {
  /** The panel is editing a block inside a subflow canvas (Blip's restrictions apply). */
  inSubflow: boolean;
  subfluxos: Subflows;
  onAbrir: (shortName: string) => void;
  onCriarVazio: (shortName: string) => void;
  onCarregar: (shortName: string, subflow: SubflowDrawing) => void;
}

/**
 * The block's sidebar — their `sidebar-content-component.builder-sidebar`: docked to the right at 1rem, with a 1rem radius and `calc(100% - 2rem)` height, 28.75rem wide. At the top, the block's title in a text field (`#builder-sidebar-title`, `maxlength="50"`, placeholder "Nome do bloco", read-only on the Início block) and the "x"; a divider; and the `bds-tab-group` with the three tabs: "Conteúdo" (on the attendance block, "Atendimento"), "Condições de saída", and "Ações".
 *
 * Everything edited here becomes `onMudar(bloco)` — the whole, new block — and it's the reducer's `aplicar`, one undo step per gesture.
 */

type Aba = 'conteudo' | 'acoes' | 'saidas';

type BlockTag = { label: string; color: string; indice: number };

const DEFAULT_TAG_COLOR = resolveTagColor(TAG_PALETTE[0]!.value);

function blockTags(tags: unknown[] | undefined): BlockTag[] {
  return (tags ?? []).flatMap((tag, indice) => {
    if (!tag || typeof tag !== 'object') return [];
    const value = tag as { label?: unknown; color?: unknown; background?: unknown };
    if (typeof value.label !== 'string' || !value.label.trim()) return [];
    const cor =
      typeof value.color === 'string'
        ? value.color
        : typeof value.background === 'string'
          ? value.background
          : DEFAULT_TAG_COLOR;
    return [
      {
        indice,
        label: value.label,
        color: isLegacyBlue(cor) ? DEFAULT_TAG_COLOR : cor,
      },
    ];
  });
}

export function BlockPanel({
  block,
  mapa,
  onMudar,
  onFechar,
  onAviso,
  onAbrirFuncoes,
  subflow,
  onAbrirVariaveis,
}: {
  block: Block;
  mapa: Mapa;
  onMudar: (block: Block) => void;
  onFechar: () => void;
  onAviso: (texto: string) => void;
  onAbrirFuncoes?: (modo: 'gerenciar' | 'criar') => void;
  subflow?: SubflowPanelContext;
  /** Opens Configuração › Variáveis (the AI agent's key lives in "Variáveis sensíveis", P14). */
  onAbrirVariaveis?: () => void;
}) {
  const agente = isAiAgentBlock(block);
  const [aba, setAba] = useState<Aba>('conteudo');
  const [editandoTitulo, setEditandoTitulo] = useState(false);
  const [novaTag, setNovaTag] = useState('');
  const [tagAberta, setTagAberta] = useState<number | null>(null);
  const abas = ([
    {
      key: 'conteudo',
      // A calling block has no content of its own: this tab shows the subflow it calls (P13).
      rotulo: ehAttendance(block.id)
        ? ROTULOS_DO_CONTEUDO.abaAtendimento
        : isSubflowBlock(block)
          ? 'Subfluxo'
          : agente
            ? 'Instruções'
            : ROTULOS_DO_CONTEUDO.aba,
    },
    { key: 'saidas', rotulo: ROTULOS_DAS_SAIDAS.titulo },
    { key: 'acoes', rotulo: LABELS_OF_ACTIONS.aba },
  ] as { key: Aba; rotulo: string }[]).filter((a) => !ehAttendance(block.id) || a.key !== 'acoes');
  const tags = blockTags(block.$tags);
  function adicionarTag(): void {
    const label = novaTag.trim();
    if (!label || tags.some((tag) => tag.label.toLowerCase() === label.toLowerCase())) return;
    onMudar({
      ...block,
      $tags: [...(block.$tags ?? []), { id: crypto.randomUUID(), label, background: DEFAULT_TAG_COLOR }],
    });
    setNovaTag('');
  }
  return (
    <aside className="bl-panel bl-panel--block" aria-label={`Bloco ${block.$title ?? block.id}`}>
      <div className="bl-panel-header">
        <input
          id="builder-sidebar-title"
          className="bl-panel-title"
          type="text"
          maxLength={LIMITE_DO_TITULO}
          placeholder="Nome do bloco"
          value={block.$title ?? ''}
          readOnly={
            !!block.root || block.id === 'fallback' || block.id === 'end' || !editandoTitulo
          }
          data-test="state-title"
          onFocus={() => setEditandoTitulo(true)}
          onBlur={() => setEditandoTitulo(false)}
          onChange={(e) => onMudar({ ...block, $title: e.target.value })}
        />
        <button
          type="button"
          className="iconbtn"
          aria-label="Fechar"
          title="Fechar"
          onClick={onFechar}
        >
          <IconePortal nome="fechar" tamanho={20} />
        </button>
      </div>
      <div className="bl-panel-tags" data-test="state-tags">
          {tags.map((tag) => (
            <span key={tag.indice} className="bl-tag-editor">
              <span className="bl-panel-tag" style={{ backgroundColor: tag.color }}>
                <button
                  type="button"
                  onClick={() => setTagAberta(tagAberta === tag.indice ? null : tag.indice)}
                  aria-label={`Cor da tag ${tag.label}`}
                >
                  {tag.label}
                </button>
                <button
                  type="button"
                  aria-label={`Remover tag ${tag.label}`}
                  onClick={() =>
                    onMudar({ ...block, $tags: block.$tags?.filter((_, i) => i !== tag.indice) })
                  }
                >
                  <IconePortal nome="fechar" tamanho={12} />
                </button>
              </span>
              {tagAberta === tag.indice ? (
                <div className="bl-tag-cores">
                  {TAG_PALETTE.map(({ label, value: cor }) => (
                    <button
                      type="button"
                      key={cor}
                      aria-label={`Cor ${label}`}
                      style={{ background: cor }}
                      onClick={() => {
                        const salvo = resolveTagColor(cor);
                        onMudar({
                          ...block,
                          $tags: block.$tags?.map((item, i) =>
                            i === tag.indice
                              ? { ...(item as object), color: salvo, background: salvo }
                              : item,
                          ),
                        });
                        setTagAberta(null);
                      }}
                    />
                  ))}
                </div>
              ) : null}
            </span>
          ))}
          <input
            className="bl-panel-add-tag"
            value={novaTag}
            placeholder="Adicionar tag..."
            list="bl-tag-suggestions"
            onChange={(e) => setNovaTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                adicionarTag();
              }
            }}
            onBlur={adicionarTag}
          />
          <datalist id="bl-tag-suggestions">
            {filterVariables(TAG_SUGGESTIONS, novaTag).map((sugestao) => (
              <option key={sugestao} value={sugestao} />
            ))}
          </datalist>
      </div>
      <hr className="bl-panel-wire" />
      <div className="bl-abas" role="tablist">
        {abas.map((a) => (
          <button
            key={a.key}
            type="button"
            role="tab"
            aria-selected={aba === a.key}
            className={aba === a.key ? 'bl-aba bl-aba--ativa' : 'bl-aba'}
            onClick={() => setAba(a.key)}
          >
            {a.rotulo}
          </button>
        ))}
      </div>
      <div className={`bl-panel-body bl-panel-body--${aba === 'saidas' ? 'outputs' : aba}`}>
        {aba === 'conteudo' && isSubflowBlock(block) && subflow ? (
          <SubflowSection
            block={block}
            subfluxos={subflow.subfluxos}
            onAbrir={subflow.onAbrir}
            onCriarVazio={subflow.onCriarVazio}
            onCarregar={subflow.onCarregar}
            onAviso={onAviso}
          />
        ) : null}
        {aba === 'conteudo' && agente ? (
          <AiAgentInstructionsPanel block={block} onMudar={onMudar} onAbrirVariaveis={onAbrirVariaveis} />
        ) : null}
        {aba === 'conteudo' && !agente && !(isSubflowBlock(block) && subflow) ? (
          <ContentPanel block={block} onMudar={onMudar} onAviso={onAviso} />
        ) : null}
        {aba === 'acoes' ? (
          <ActionsPanel
            block={block}
            onMudar={onMudar}
            onAviso={onAviso}
            onAbrirFuncoes={onAbrirFuncoes}
            inSubflow={subflow?.inSubflow ?? false}
          />
        ) : null}
        {aba === 'saidas' && agente ? (
          <AiAgentOutputsPanel block={block} mapa={mapa} onMudar={onMudar} onAviso={onAviso} />
        ) : null}
        {aba === 'saidas' && !agente ? (
          <OutputsPanel block={block} mapa={mapa} onMudar={onMudar} onAviso={onAviso} />
        ) : null}
      </div>
    </aside>
  );
}
