import { useState } from 'react';
import { IconePortal } from '../../componentes/icones-portal';
import type { Bloco, Mapa } from './modelo';
import { ehAtendimento } from './modelo';
import { LIMITE_DO_TITULO } from './validacao';
import { ROTULOS_DO_CONTEUDO } from './conteudo';
import { ROTULOS_DAS_ACOES } from './acoes-do-bloco';
import { ROTULOS_DAS_SAIDAS } from './condicoes';
import { PainelDeConteudo } from './painel-conteudo';
import { PainelDeAcoes } from './painel-acoes';
import { PainelDeSaidas } from './painel-saidas';

/**
 * A barra lateral do bloco — o `sidebar-content-component.builder-sidebar`
 * deles: colada à direita a 1rem, com raio de 1rem e altura `calc(100% -
 * 2rem)`, 28.75rem de largura. No topo, o título do bloco num campo de texto
 * (`#builder-sidebar-title`, `maxlength="50"`, placeholder "Nome do bloco",
 * só leitura no bloco de Início) e o "x"; um fio; e o `bds-tab-group` com as
 * três abas: "Conteúdo" (no bloco de atendimento, "Atendimento"), "Ações" e
 * "Condições de saída".
 *
 * Tudo o que se edita aqui vira `onMudar(bloco)` — o bloco inteiro, novo —
 * e é o `aplicar` do redutor, um passo de desfazer por gesto.
 */

type Aba = 'conteudo' | 'acoes' | 'saidas';

type TagDoBloco = { label: string; color: string };

function tagsDoBloco(tags: unknown[] | undefined): TagDoBloco[] {
  return (tags ?? []).flatMap((tag) => {
    const valor = tag as { label?: unknown; color?: unknown; background?: unknown };
    if (typeof valor.label !== 'string' || !valor.label.trim()) return [];
    const cor = typeof valor.color === 'string' ? valor.color : typeof valor.background === 'string' ? valor.background : '#4a5d23';
    return [{ label: valor.label, color: ['#3f7de8', '#0096fa', '#1e6bf1', '#498bff'].includes(cor.toLowerCase()) ? '#4a5d23' : cor }];
  });
}

export function PainelDoBloco({
  bloco,
  mapa,
  erros,
  onMudar,
  onFechar,
  onAviso,
}: {
  bloco: Bloco;
  mapa: Mapa;
  /** Os erros do bloco (da tela e do motor), para a faixa do topo. */
  erros: string[];
  onMudar: (bloco: Bloco) => void;
  onFechar: () => void;
  onAviso: (texto: string) => void;
}) {
  const [aba, setAba] = useState<Aba>('conteudo');
  const [editandoTitulo, setEditandoTitulo] = useState(false);
  const [novaTag, setNovaTag] = useState('');
  const abas: { chave: Aba; rotulo: string }[] = [
    { chave: 'conteudo', rotulo: ehAtendimento(bloco.id) ? ROTULOS_DO_CONTEUDO.abaAtendimento : ROTULOS_DO_CONTEUDO.aba },
    { chave: 'saidas', rotulo: ROTULOS_DAS_SAIDAS.titulo },
    { chave: 'acoes', rotulo: ROTULOS_DAS_ACOES.aba },
  ];
  const tags = tagsDoBloco(bloco.$tags);
  function adicionarTag(): void {
    const label = novaTag.trim();
    if (!label) return;
    onMudar({ ...bloco, $tags: [...tags, { label, color: '#4a5d23' }] });
    setNovaTag('');
  }
  return (
    <aside className="bl-painel" aria-label={`Bloco ${bloco.$title ?? bloco.id}`}>
      <div className="bl-painel-cabecalho">
        <input
          id="builder-sidebar-title"
          className="bl-painel-titulo"
          type="text"
          maxLength={LIMITE_DO_TITULO}
          placeholder="Nome do bloco"
          value={bloco.$title ?? ''}
          readOnly={!!bloco.root || !editandoTitulo}
          data-test="state-title"
          onFocus={() => setEditandoTitulo(true)}
          onBlur={() => setEditandoTitulo(false)}
          onChange={(e) => onMudar({ ...bloco, $title: e.target.value })}
        />
        <button type="button" className="iconbtn" aria-label="Fechar" title="Fechar" onClick={onFechar}>
          <IconePortal nome="fechar" tamanho={20} />
        </button>
      </div>
      <div className="bl-painel-tags" data-test="state-tags">
        {tags.map((tag) => (
          <button key={tag.label} type="button" className="bl-painel-tag" style={{ backgroundColor: tag.color }} title="Remover tag" onClick={() => onMudar({ ...bloco, $tags: tags.filter((atual) => atual.label !== tag.label) })}>
            {tag.label} <span aria-hidden="true">×</span>
          </button>
        ))}
        <input className="bl-painel-adicionar-tag" value={novaTag} placeholder="Adicionar tag..." onChange={(e) => setNovaTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarTag(); } }} onBlur={adicionarTag} />
      </div>
      <hr className="bl-painel-fio" />
      {erros.length > 0 ? (
        <ul className="bl-erros bl-painel-erros">
          {erros.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
      <div className="bl-abas" role="tablist">
        {abas.map((a) => (
          <button
            key={a.chave}
            type="button"
            role="tab"
            aria-selected={aba === a.chave}
            className={aba === a.chave ? 'bl-aba bl-aba--ativa' : 'bl-aba'}
            onClick={() => setAba(a.chave)}
          >
            {a.rotulo}
          </button>
        ))}
      </div>
      <div className="bl-painel-corpo">
        {aba === 'conteudo' ? <PainelDeConteudo bloco={bloco} onMudar={onMudar} onAviso={onAviso} /> : null}
        {aba === 'acoes' ? <PainelDeAcoes bloco={bloco} onMudar={onMudar} onAviso={onAviso} /> : null}
        {aba === 'saidas' ? <PainelDeSaidas bloco={bloco} mapa={mapa} onMudar={onMudar} onAviso={onAviso} /> : null}
      </div>
    </aside>
  );
}
