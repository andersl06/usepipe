import { useState } from 'react';
import type { KeyboardEvent as KeyboardEventDeReact } from 'react';
import type { CondicaoBlip } from '@pipe/core';
import { ehUnaria } from '@pipe/core';
import { Campo, Etiqueta, Seletor } from '@pipe/ui';
import { IconeGestao } from '../../componentes/icones-gestao';
import {
  COMPARACOES_DA_TELA,
  FONTES_DA_TELA,
  OPERADORES_DA_TELA,
  ROTULOS_DAS_SAIDAS,
  ROTULO_DA_FONTE,
  adicionarValor,
  comComparacao,
  comFonte,
  comparacaoDe,
  erroDaCondicao,
  fonteDe,
  fonteSemSuporte,
  novaCondicao,
  removerValor,
} from './condicoes';

/**
 * A lista de condições de uma saída (ou de uma ação): o `condition-wrapper`
 * do editor — "Se" [fonte] [nome da variável] [comparação] [valores], uma
 * linha por condição, todas precisam casar (o motor avalia em sequência e
 * para na primeira falsa). Os valores são as "tags" do editor: Enter ou
 * vírgula acrescenta um; entre eles vale o operador OU/E.
 */

export function EditorDeCondicoes({
  condicoes,
  onMudar,
  rotuloAdicionar,
}: {
  condicoes: CondicaoBlip[];
  onMudar: (condicoes: CondicaoBlip[]) => void;
  rotuloAdicionar: string;
}) {
  const trocar = (indice: number, c: CondicaoBlip): void =>
    onMudar(condicoes.map((x, i) => (i === indice ? c : x)));
  const remover = (indice: number): void => onMudar(condicoes.filter((_, i) => i !== indice));
  return (
    <div className="bl-condicoes">
      {condicoes.map((c, i) => (
        <LinhaDeCondicao
          key={i}
          condicao={c}
          primeira={i === 0}
          onMudar={(nova) => trocar(i, nova)}
          onRemover={() => remover(i)}
        />
      ))}
      <button type="button" className="bl-mais" onClick={() => onMudar([...condicoes, novaCondicao()])}>
        {rotuloAdicionar}
      </button>
    </div>
  );
}

function LinhaDeCondicao({
  condicao,
  primeira,
  onMudar,
  onRemover,
}: {
  condicao: CondicaoBlip;
  primeira: boolean;
  onMudar: (c: CondicaoBlip) => void;
  onRemover: () => void;
}) {
  const [digitando, setDigitando] = useState('');
  const fonte = fonteDe(condicao);
  const comparacao = comparacaoDe(condicao);
  const unaria = ehUnaria(comparacao);
  const valores = condicao.values ?? [];
  const erro = erroDaCondicao(condicao);
  const semSuporte = fonteSemSuporte(condicao);

  function confirmarValor(): void {
    if (!digitando.trim()) return;
    onMudar(adicionarValor(condicao, digitando));
    setDigitando('');
  }

  function aoTeclar(e: KeyboardEventDeReact<HTMLInputElement>): void {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      confirmarValor();
    } else if (e.key === 'Backspace' && !digitando && valores.length > 0) {
      onMudar(removerValor(condicao, valores.length - 1));
    }
  }

  return (
    <div className={`bl-condicao${erro ? ' bl-condicao--erro' : ''}`}>
      <div className="bl-condicao-linha">
        <span className="bl-condicao-se">{primeira ? ROTULOS_DAS_SAIDAS.se : 'e'}</span>
        {semSuporte ? (
          <Etiqueta tom="alerta" titulo="O Pipe não tem provedor de IA: esta condição nunca casa.">
            {ROTULO_DA_FONTE[fonte] ?? fonte}
          </Etiqueta>
        ) : (
          <Seletor
            aria-label="Fonte"
            value={fonte}
            onChange={(e) => onMudar(comFonte(condicao, e.target.value))}
          >
            {FONTES_DA_TELA.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.rotulo}
              </option>
            ))}
          </Seletor>
        )}
        {fonte === 'context' ? (
          <Campo
            aria-label={ROTULOS_DAS_SAIDAS.nomeDaVariavel}
            placeholder={ROTULOS_DAS_SAIDAS.nomeDaVariavel}
            value={condicao.variable ?? ''}
            onChange={(e) => onMudar({ ...condicao, variable: e.target.value })}
          />
        ) : null}
        <Seletor
          aria-label="Comparação"
          value={comparacao}
          onChange={(e) => onMudar(comComparacao(condicao, e.target.value as typeof comparacao))}
        >
          {COMPARACOES_DA_TELA.map((c) => (
            <option key={c.valor} value={c.valor}>
              {c.rotulo}
            </option>
          ))}
        </Seletor>
        <button type="button" className="iconbtn bl-remover" title="Excluir condição" aria-label="Excluir condição" onClick={onRemover}>
          <IconeGestao nome="lixeira" tamanho={18} />
        </button>
      </div>
      {!unaria ? (
        <div className="bl-condicao-valores">
          {valores.length > 1 ? (
            <Seletor
              aria-label="Operador"
              className="bl-condicao-operador"
              value={(condicao.operator ?? 'or').toLowerCase()}
              onChange={(e) => onMudar({ ...condicao, operator: e.target.value })}
            >
              {OPERADORES_DA_TELA.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.rotulo}
                </option>
              ))}
            </Seletor>
          ) : null}
          <div className="bl-valores" onClick={(e) => (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus()}>
            {valores.map((v, i) => (
              <span key={`${v}-${i}`} className="bl-valor">
                {v}
                <button type="button" aria-label={`Remover ${v}`} onClick={() => onMudar(removerValor(condicao, i))}>
                  ×
                </button>
              </span>
            ))}
            <input
              className="bl-valores-campo"
              aria-label={ROTULOS_DAS_SAIDAS.valores}
              placeholder={valores.length === 0 ? ROTULOS_DAS_SAIDAS.valores : ''}
              value={digitando}
              onChange={(e) => setDigitando(e.target.value)}
              onKeyDown={aoTeclar}
              onBlur={confirmarValor}
            />
          </div>
        </div>
      ) : null}
      {erro ? <p className="bl-erro-do-campo">{erro}</p> : null}
    </div>
  );
}
