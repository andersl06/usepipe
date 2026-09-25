import { useState } from 'react';
import { IconePortal } from '../../componentes/icones-portal';
import type { Block, Mapa } from './modelo';
import { ehAttendance } from './modelo';
import { LIMITE_DO_TITULO } from './validacao';
import { ROTULOS_DO_CONTEUDO } from './conteudo';
import { ROTULOS_OF_ACTIONS } from './acoes-do-bloco';
import { ROTULOS_DAS_SAIDAS } from './condicoes';
import { ContentPanel } from './painel-conteudo';
import { ActionsPanel } from './painel-acoes';
import { OutputsPanel } from './painel-saidas';

/**
 * A barra lateral do bloco — o `sidebar-content-component.builder-sidebar`
 * deles: colada à direita a 1rem, com raio de 1rem e altura `calc(100% -
 * 2rem)`, 28.75rem de largura. No topo, o título do bloco num campo de texto
 * (`#builder-sidebar-title`, `maxlength="50"`, placeholder "Nome do bloco",
 * só leitura no bloco de Início) e o "x"; um fio; e o `bds-tab-group` com as
 * três abas: "Conteúdo" (no bloco de atendimento, "Atendimento"),
 * "Condições de saída" e "Ações".
 *
 * Tudo o que se edita aqui vira `onMudar(bloco)` — o bloco inteiro, novo —
 * e é o `aplicar` do redutor, um passo de desfazer por gesto.
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
  /** Os erros do bloco (da tela e do motor), para a faixa do topo. */
  errors: string[];
  onMudar: (block: Block) => void;
  onFechar: () => void;
  onAviso: (texto: string) => void;
}) {
  const [aba, setAba] = useState<Aba>('conteudo');
  const [editandoTitulo, setEditandoTitulo] = useState(false);
  const [novaTag, setNovaTag] = useState('');
  const [tagAberta, setTagAberta] = useState<number | null>(null);
  const abas: { key: Aba; rotulo: string }[] = [
    {
      chave: 'conteudo',
      rotulo: ehAttendance(block.id)
        ? ROTULOS_DO_CONTEUDO.abaAtendimento
        : ROTULOS_DO_CONTEUDO.aba,
    },
    { chave: 'saidas', rotulo: ROTULOS_DAS_SAIDAS.titulo },
    { chave: 'acoes', rotulo: ROTULOS_OF_ACTIONS.aba },
  ].filter((a) => !ehAttendance(block.id) || a.chave !== 'acoes') as {
    key: Aba;
    rotulo: string;
  }[];
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
    <aside className="bl-painel bl-painel--bloco" aria-label={`Bloco ${block.$title ?? block.id}`}>
      <div className="bl-painel-cabecalho">
        <input
          id="builder-sidebar-title"
          className="bl-painel-titulo"
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
      <div className="bl-painel-tags" data-test="state-tags">
          {tags.map((tag) => (
            <span key={tag.indice} className="bl-tag-editor">
              <span className="bl-painel-tag" style={{ backgroundColor: tag.color }}>
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
            className="bl-painel-adicionar-tag"
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
      <hr className="bl-painel-fio" />
      {errors.length > 0 ? (
        <ul className="bl-erros bl-painel-erros">
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
