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
 * **O interruptor por linha, e por que ele demorou.** No cartão deles há criar,
 * editar, excluir e um interruptor. O nosso nasceu só com a situação em
 * etiqueta, porque mexer em configuração sem log de auditoria com autor, valor
 * anterior e horário é passivo — e a auditoria não existia. Ela existe agora
 * (`lib/auditoria.ts`), então o interruptor entrou no `.cl-acoes`, como o
 * comentário anterior previa, sem mexer em mais nada: quem tem `acao` mostra o
 * controle, quem não tem continua com a etiqueta sozinha.
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
  /**
   * Cor do próprio registro, já como `var(--p-…)` — nunca hex. Ocupa a primeira
   * coluna do cartão, que nasceu vazia justamente para isto. Só a fila usa: cor
   * ali é dado do cliente, não estado, e por isso não vira etiqueta colorida.
   */
  cor?: string | null;
  /**
   * Tira do pé do cartão, para a lista que pertence ao registro — os atendentes
   * de uma fila, as filas de um horário. Fica no `.cl-rodape` porque o
   * `.cl-campos` é grade de valor único e uma lista dentro dele vira truncagem.
   */
  rodape?: readonly string[];
  /**
   * Controle do registro, à direita, ao lado da situação — o interruptor do
   * cartão-linha deles. Vem pronto de fora porque é ele que carrega a Server
   * Action, e esta lista é componente de cliente: montar o formulário aqui
   * arrastaria a ação para o pacote do navegador.
   */
  acao?: React.ReactNode;
}

export interface SecaoDeRegras {
  titulo: string;
  vazio: string;
  cartoes: CartaoRegra[];
}

function Cartao({ cartao }: { cartao: CartaoRegra }) {
  return (
    <article className="cartao-lista">
      {cartao.cor ? <span className="sw" style={{ background: cartao.cor }} /> : <span />}
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
        {cartao.acao}
      </div>

      {cartao.rodape && cartao.rodape.length > 0 ? (
        <div className="cl-rodape">
          {cartao.rodape.map((item) => (
            <span key={item} className="etiqueta">
              {item}
            </span>
          ))}
        </div>
      ) : null}
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
    return secoes.map((s) => ({
      ...s,
      cartoes: s.cartoes.filter((c) => c.procura.includes(alvo)),
    }));
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
        /* Vazio de BUSCA, que é causa diferente de vazio de cadastro — e por
           isso frase diferente, com a saída junto. Sem o botão, a única forma
           de voltar à lista é apagar o texto na mão, e quem não percebeu que
           filtrou conclui que a base está vazia. */
        <div className="vazio">
          <b>Nada encontrado para “{busca.trim()}”.</b>
          <p>Os cadastros continuam lá — é a busca que não achou este texto.</p>
          <button type="button" className="btn" onClick={() => setBusca('')}>
            Limpar busca
          </button>
        </div>
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
