import type { PointerEvent as PointerEventDeReact, MouseEvent as MouseEventDeReact } from 'react';
import { Etiqueta } from '@pipe/ui';
import type { Block } from './model';
import { ehAttendance, positionOf } from './model';
import { blockTags } from './tags-of-block';

/**
 * The card for a block on the canvas — their `builder-node.diagram-node`: 175px wide, radius 8, `0 8px 16px` shadow, centered text, the title in 14/400 that becomes 700 when the block is selected or being edited, the 4px ring around it on hover, and the output dot (`.diagram-node-endpoint`, 1em, middle of the bottom edge) that only appears on hover and is where the link is dragged from. The tags underneath (`builder-node-tags`) are the ones the editor adds automatically: each block action's type and "UserInput" when it expects a reply.
 *
 * The colors are ours: surface background, brand color on the Início block (their `#3f7de8`) and on the ring, moss on the attendance one, error on the invalid one.
 */

export interface PropsDoNo {
  block: Block;
  errors: string[];
  selecionado: boolean;
  editando: boolean;
  /** Possible target of the link currently being dragged. */
  alvo: boolean;
  corresponde: boolean;
  onPointerDown: (e: PointerEventDeReact<HTMLDivElement>) => void;
  onPointerDownNaSaida: (e: PointerEventDeReact<HTMLSpanElement>) => void;
  onContextMenu: (e: MouseEventDeReact<HTMLDivElement>) => void;
}

/** The editor's automatic labels: each action's type, and "UserInput" if a reply is expected. */
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
  if (ehAttendance(block.id)) classes.push('bl-node--attendance');
  if (errors.length > 0) classes.push('bl-node--error');
  if (selecionado) classes.push('bl-no--selecionado');
  if (editando) classes.push('bl-no--editando');
  if (alvo) classes.push('bl-no--alvo');
  if (!corresponde) classes.push('bl-node--outside-search');
  const etiquetas = blockTags(block);
  return (
    <div
      className={classes.join(' ')}
      style={{ top: position.top, left: position.left }}
      data-block={block.id}
      data-test={`builder-block-${block.id}`}
      title={errors.join('\n') || undefined}
      onPointerDown={onPointerDown}
      onContextMenu={onContextMenu}
    >
      <div className="bl-no-corpo">
        <span className="bl-no-titulo">{block.$title || block.id}</span>
        {errors.length > 0 ? (
          <Etiqueta tom="erro" redonda className="bl-node-errors">
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
