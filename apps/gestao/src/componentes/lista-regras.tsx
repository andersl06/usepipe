'use client';

import { useMemo, useState } from 'react';
import { Icone } from '@pipe/ui';

/**
 * Regras como LISTA DE CARTÕES, com a busca no topo.
 *
 * Segue o esqueleto medido em `docs/pesquisa/blip-telas-atendimento.md` §4 e
 * §5.3: linha do título, busca sozinha na linha logo abaixo, e a lista de
 * cartões. Rótulo pequeno acima do valor forte, situação encostada à direita.
 *
 * **O que a Blip tem aqui e nós não, e por quê.** No cartão deles há criar,
 * editar, excluir e um interruptor por linha. O nosso `lib/configuracoes.ts` é
 * somente leitura por decisão registrada: editar configuração exige log de
 * auditoria com autor, valor anterior e horário, e configurar sem rastro é
 * passivo. Botão que não salva é item desabilitado com outro nome, e a régua
 * da casa proíbe. Então o cartão nasce com a FORMA deles e com a situação em
 * etiqueta no lugar do interruptor. Quando a auditoria existir, o interruptor
 * entra no `.cl-acoes` sem mexer em mais nada.
 *
 * A busca, essa sim, funciona: filtra as duas listas já carregadas, no
 * navegador, sem ida ao servidor.
 */

export interface CartaoRegra {
  id: string;
  campos: { rotulo: string; valor: string; classe?: string }[];
  situacao: string;
  ativa: boolean;
  /** Tudo que a busca varre, já em minúsculas. */
  procura: string;
}

export interface SecaoDeRegras {
  titulo: string;
  vazio: string;
  cartoes: CartaoRegra[];
}

function Cartao({ cartao }: { cartao: CartaoRegra }) {
  return (
    <article className="cartao-lista">
      <span />
      <div
        className="cl-campos"
        style={{ '--cl-colunas': cartao.campos.length } as React.CSSProperties}
      >
        {cartao.campos.map((c) => (
          <div key={c.rotulo} className="cl-campo">
            <span className="r">{c.rotulo}</span>
            <span className={c.classe ? `v ${c.classe}` : 'v'} title={c.valor}>
              {c.valor}
            </span>
          </div>
        ))}
      </div>
      <div className="cl-acoes">
        <span className={cartao.ativa ? 'etiqueta' : 'etiqueta alerta'}>{cartao.situacao}</span>
      </div>
    </article>
  );
}

export function ListaRegras({
  secoes,
  placeholder = 'Buscar regra, fila ou escopo',
}: {
  secoes: readonly SecaoDeRegras[];
  /** A lista serve outras telas além de Regras; o texto da busca é o único ponto de variação. */
  placeholder?: string;
}) {
  const [busca, setBusca] = useState('');

  const filtradas = useMemo(() => {
    const alvo = busca.trim().toLowerCase();
    if (!alvo) return secoes;
    return secoes.map((s) => ({ ...s, cartoes: s.cartoes.filter((c) => c.procura.includes(alvo)) }));
  }, [secoes, busca]);

  const nenhuma = filtradas.every((s) => s.cartoes.length === 0);

  return (
    <>
      <div className="busca-topo">
        <Icone nome="busca" tamanho={15} />
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
      </div>

      {nenhuma && busca.trim() ? (
        <div className="vazio">Nada encontrado para “{busca.trim()}”.</div>
      ) : (
        filtradas.map((secao) => (
          <div key={secao.titulo} className="lista-cartoes">
            <div className="grupo-cartoes">
              {secao.titulo} <span className="qt">{secao.cartoes.length}</span>
            </div>
            {secao.cartoes.length === 0 ? (
              <div className="vazio">{secao.vazio}</div>
            ) : (
              secao.cartoes.map((c) => <Cartao key={c.id} cartao={c} />)
            )}
          </div>
        ))
      )}
    </>
  );
}
