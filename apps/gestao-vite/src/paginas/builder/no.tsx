import type { PointerEvent as PointerEventDeReact, MouseEvent as MouseEventDeReact } from 'react';
import { Etiqueta } from '@pipe/ui';
import type { Bloco } from './modelo';
import { ehAtendimento, entradaDe, posicaoDe } from './modelo';

/**
 * O cartão de um bloco no canvas — o `builder-node.diagram-node` deles:
 * 175px de largura, raio 8, sombra `0 8px 16px`, texto centrado, o título em
 * 14/400 que vira 700 quando o bloco está selecionado ou em edição, o anel de
 * 4px em volta ao passar o mouse, e o ponto de saída (`.diagram-node-endpoint`,
 * 1em, meio da borda de baixo) que só aparece no hover e é de onde se arrasta
 * a ligação. As etiquetas embaixo (`builder-node-tags`) são as que o editor
 * põe sozinho: o tipo de cada ação do bloco e "UserInput" quando ele espera
 * resposta.
 *
 * A tinta é a nossa: fundo de superfície, marca no bloco de Início (o
 * `#3f7de8` deles) e no anel, musgo no de atendimento, erro no inválido.
 */

export interface PropsDoNo {
  bloco: Bloco;
  erros: string[];
  selecionado: boolean;
  editando: boolean;
  /** Alvo possível da ligação que está sendo arrastada. */
  alvo: boolean;
  onPointerDown: (e: PointerEventDeReact<HTMLDivElement>) => void;
  onPointerDownNaSaida: (e: PointerEventDeReact<HTMLSpanElement>) => void;
  onContextMenu: (e: MouseEventDeReact<HTMLDivElement>) => void;
}

/** As etiquetas automáticas do editor: o tipo de cada ação, e "UserInput" se espera resposta. */
export function etiquetasDoBloco(bloco: Bloco): string[] {
  const tipos = new Set<string>();
  for (const acao of [...(bloco.$enteringCustomActions ?? []), ...(bloco.$leavingCustomActions ?? [])]) {
    if (acao.type) tipos.add(acao.type);
  }
  const entrada = entradaDe(bloco);
  if (entrada && !entrada.bypass) tipos.add('UserInput');
  for (const tag of bloco.$tags ?? []) {
    const rotulo = (tag as { label?: unknown })?.label;
    if (typeof rotulo === 'string' && rotulo) tipos.add(rotulo);
  }
  return [...tipos];
}

export function No({
  bloco,
  erros,
  selecionado,
  editando,
  alvo,
  onPointerDown,
  onPointerDownNaSaida,
  onContextMenu,
}: PropsDoNo) {
  const posicao = posicaoDe(bloco);
  const classes = ['bl-no'];
  if (bloco.root) classes.push('bl-no--inicio');
  if (ehAtendimento(bloco.id)) classes.push('bl-no--atendimento');
  if (erros.length > 0) classes.push('bl-no--erro');
  if (selecionado) classes.push('bl-no--selecionado');
  if (editando) classes.push('bl-no--editando');
  if (alvo) classes.push('bl-no--alvo');
  const etiquetas = etiquetasDoBloco(bloco);
  return (
    <div
      className={classes.join(' ')}
      style={{ top: posicao.top, left: posicao.left }}
      data-bloco={bloco.id}
      data-test={`builder-block-${bloco.id}`}
      title={erros.join('\n') || undefined}
      onPointerDown={onPointerDown}
      onContextMenu={onContextMenu}
    >
      <div className="bl-no-corpo">
        <span className="bl-no-titulo">{bloco.$title || bloco.id}</span>
        {erros.length > 0 ? (
          <Etiqueta tom="erro" redonda className="bl-no-erros">
            {erros.length}
          </Etiqueta>
        ) : null}
      </div>
      {etiquetas.length > 0 ? (
        <div className="bl-no-etiquetas">
          {etiquetas.map((e) => (
            <span key={e} className="bl-no-etiqueta">
              {e}
            </span>
          ))}
        </div>
      ) : null}
      <span
        className="bl-no-saida"
        role="button"
        aria-label="Ligar a outro bloco"
        title="Arraste até o bloco de destino"
        onPointerDown={onPointerDownNaSaida}
      />
    </div>
  );
}
