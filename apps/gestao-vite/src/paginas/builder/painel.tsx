import { useState } from 'react';
import { Icone } from '@pipe/ui';
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
  const abas: { chave: Aba; rotulo: string }[] = [
    { chave: 'conteudo', rotulo: ehAtendimento(bloco.id) ? ROTULOS_DO_CONTEUDO.abaAtendimento : ROTULOS_DO_CONTEUDO.aba },
    { chave: 'acoes', rotulo: ROTULOS_DAS_ACOES.aba },
    { chave: 'saidas', rotulo: ROTULOS_DAS_SAIDAS.titulo },
  ];
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
          readOnly={!!bloco.root}
          data-test="state-title"
          onChange={(e) => onMudar({ ...bloco, $title: e.target.value })}
        />
        <button type="button" className="iconbtn" aria-label="Fechar" title="Fechar" onClick={onFechar}>
          <Icone nome="x" tamanho={20} />
        </button>
      </div>
      <p className="bl-painel-id sub" title="Id do bloco">
        {bloco.id}
      </p>
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
