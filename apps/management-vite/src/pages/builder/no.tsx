import type { PointerEvent as PointerEventDeReact, MouseEvent as MouseEventDeReact } from 'react';
import { Etiqueta } from '@pipe/ui';
import type { Block } from './model';
import { ehAttendance, positionOf } from './model';
import { blockTags } from './tags-of-block';

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
  block: Block;
  errors: string[];
  selecionado: boolean;
  editando: boolean;
  /** Alvo possível da ligação que está sendo arrastada. */
  alvo: boolean;
  corresponde: boolean;
  onPointerDown: (e: PointerEventDeReact<HTMLDivElement>) => void;
  onPointerDownNaSaida: (e: PointerEventDeReact<HTMLSpanElement>) => void;
  onContextMenu: (e: MouseEventDeReact<HTMLDivElement>) => void;
}

/** As etiquetas automáticas do editor: o tipo de cada ação, e "UserInput" se espera resposta. */
export type { BlockTag } from './tags-of-block';

export function No({
  block,
  errors,
  selecionado,
  editando,
  alvo,
  corresponde,
  onPointerDown,
  onPointerDownNaSaida,
  onContextMenu,
}: PropsDoNo) {
  const position = positionOf(block);
  const classes = ['bl-no'];
  if (block.root) classes.push('bl-no--inicio');
  if (ehAttendance(block.id)) classes.push('bl-no--atendimento');
  if (errors.length > 0) classes.push('bl-no--erro');
  if (selecionado) classes.push('bl-no--selecionado');
  if (editando) classes.push('bl-no--editando');
  if (alvo) classes.push('bl-no--alvo');
  if (!corresponde) classes.push('bl-no--fora-da-busca');
  const etiquetas = blockTags(block);
  return (
    <div
      className={classes.join(' ')}
      style={{ top: position.top, left: position.left }}
      data-bloco={block.id}
      data-test={`builder-block-${block.id}`}
      title={errors.join('\n') || undefined}
      onPointerDown={onPointerDown}
      onContextMenu={onContextMenu}
    >
      <div className="bl-no-corpo">
        <span className="bl-no-titulo">{block.$title || block.id}</span>
        {errors.length > 0 ? (
          <Etiqueta tom="erro" redonda className="bl-no-erros">
            {errors.length}
          </Etiqueta>
        ) : null}
      </div>
      {etiquetas.length > 0 ? (
        <div className="bl-no-etiquetas">
          {etiquetas.map((etiqueta) => (
            <span
              key={etiqueta.rotulo}
              className="bl-no-etiqueta"
              style={{ backgroundColor: etiqueta.cor }}
              title={etiqueta.rotulo}
              aria-label={etiqueta.rotulo}
            >
              <span className="bl-no-etiqueta-rotulo">{etiqueta.rotulo}</span>
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
