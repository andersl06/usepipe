import { useState } from 'react';
import { IconePortal } from '../../components/icones-portal';
import type { Block, Mapa } from './model';
import { ehAttendance } from './model';
import { LIMITE_DO_TITULO } from './validation';
import { ROTULOS_DO_CONTEUDO } from './conteudo';
import { ROTULOS_OF_ACTIONS } from './actions-of-block';
import { ROTULOS_DAS_SAIDAS } from './conditions';
import { ContentPanel } from './panel-content';
import { ActionsPanel } from './panel-actions';
import { OutputsPanel } from './panel-outputs';

/**
 * The block's sidebar — their `sidebar-content-component.builder-sidebar`: docked to the right at 1rem, with a 1rem radius and `calc(100% - 2rem)` height, 28.75rem wide. At the top, the block's title in a text field (`#builder-sidebar-title`, `maxlength="50"`, placeholder "Nome do bloco", read-only on the Início block) and the "x"; a divider; and the `bds-tab-group` with the three tabs: "Conteúdo" (on the attendance block, "Atendimento"), "Condições de saída", and "Ações".
 *
 * Everything edited here becomes `onMudar(bloco)` — the whole, new block — and it's the reducer's `aplicar`, one undo step per gesture.
 */

type Aba = 'conteudo' | 'acoes' | 'saidas';

type BlockTag = { label: string; color: string; indice: number };

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
          : '#4a5d23';
    return [
      {
        indice,
        label: value.label,
        color: ['#3f7de8', '#0096fa', '#1e6bf1', '#498bff'].includes(cor.toLowerCase())
          ? '#4a5d23'
          : cor,
      },
    ];
  });
}

export function BlockPanel({
  block,
  mapa,
  errors,
  onMudar,
  onFechar,
  onAviso,
}: {
  block: Block;
  mapa: Mapa;
  /** The block's errors (from the screen and the engine), for the top banner. */
  errors: string[];
  onMudar: (block: Block) => void;
  onFechar: () => void;
  onAviso: (texto: string) => void;
}) {
  const [aba, setAba] = useState<Aba>('conteudo');
  const [editandoTitulo, setEditandoTitulo] = useState(false);
  const [novaTag, setNovaTag] = useState('');
  const [tagAberta, setTagAberta] = useState<number | null>(null);
  const abas = ([
    {
      key: 'conteudo',
      rotulo: ehAttendance(block.id)
        ? ROTULOS_DO_CONTEUDO.abaAtendimento
        : ROTULOS_DO_CONTEUDO.aba,
    },
    { key: 'saidas', rotulo: ROTULOS_DAS_SAIDAS.titulo },
    { key: 'acoes', rotulo: ROTULOS_OF_ACTIONS.aba },
  ] as { key: Aba; rotulo: string }[]).filter((a) => !ehAttendance(block.id) || a.key !== 'acoes');
  const tags = blockTags(block.$tags);
  function adicionarTag(): void {
    const label = novaTag.trim();
    if (!label || tags.some((tag) => tag.label.toLowerCase() === label.toLowerCase())) return;
    onMudar({
      ...block,
      $tags: [...(block.$tags ?? []), { id: crypto.randomUUID(), label, background: '#4a5d23' }],
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
                  {['#4a5d23', '#ff961e', '#61d36f', '#ee82ee', '#000000', '#ff4c4c'].map((cor) => (
                    <button
                      type="button"
                      key={cor}
                      aria-label={`Cor ${cor}`}
                      style={{ background: cor }}
                      onClick={() => {
                        onMudar({
                          ...block,
                          $tags: block.$tags?.map((item, i) =>
                            i === tag.indice
                              ? { ...(item as object), color: cor, background: cor }
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
            onChange={(e) => setNovaTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                adicionarTag();
              }
            }}
            onBlur={adicionarTag}
          />
      </div>
      <hr className="bl-panel-wire" />
      {errors.length > 0 ? (
        <ul className="bl-errors bl-panel-errors">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
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
      <div className={`bl-painel-corpo bl-painel-corpo--${aba}`}>
        {aba === 'conteudo' ? (
          <ContentPanel block={block} onMudar={onMudar} onAviso={onAviso} />
        ) : null}
        {aba === 'acoes' ? (
          <ActionsPanel block={block} onMudar={onMudar} onAviso={onAviso} />
        ) : null}
        {aba === 'saidas' ? (
          <OutputsPanel block={block} mapa={mapa} onMudar={onMudar} onAviso={onAviso} />
        ) : null}
      </div>
    </aside>
  );
}
