import type { PointerEvent as PointerEventDeReact, MouseEvent as MouseEventDeReact } from 'react';
import { IconePortal } from '@pipe/ui/icones-portal';
import type { Block } from './model';
import { ID_DO_FIM, PREFIX_OF_SUBFLOW, ehAttendance, isSurveyBlock, positionOf } from './model';
import { blockTags } from './tags-of-block';

/**
 * The card for a block on the canvas — their `builder-node.diagram-node`: 175px wide, radius 8, `0 8px 16px` shadow, centered text, the title in 14/400 that becomes 700 when the block is selected or being edited, the 4px ring around it on hover, and the output dot (`.diagram-node-endpoint`, 1em, middle of the bottom edge) that only appears on hover and is where the link is dragged from. The tags underneath (`builder-node-tags`) are the ones the editor adds automatically: each block action's type and "UserInput" when it expects a reply.
 *
 * The colors are ours: surface background, brand color on the Início block (their `#3f7de8`) and on the ring, moss on the attendance one. An invalid block (F-6) paints red like Blip's own — no counter, no native tooltip, just the color and the ring.
 */

export interface PropsDoNo {
  block: Block;
  invalido: boolean;
  selecionado: boolean;
  editando: boolean;
  /** Possible target of the link currently being dragged. */
  alvo: boolean;
  corresponde: boolean;
  onPointerDown: (e: PointerEventDeReact<HTMLDivElement>) => void;
  onPointerDownNaSaida: (e: PointerEventDeReact<HTMLSpanElement>) => void;
  onContextMenu: (e: MouseEventDeReact<HTMLDivElement>) => void;
  /** Double click on a subflow's calling block opens the subflow (P13). */
  onDoubleClick?: () => void;
}

/** The editor's automatic labels: each action's type, and "UserInput" if a reply is expected. */
export type { BlockTag } from './tags-of-block';

export function No({
  block,
  invalido,
  selecionado,
  editando,
  alvo,
  corresponde,
  onPointerDown,
  onPointerDownNaSaida,
  onContextMenu,
  onDoubleClick,
}: PropsDoNo) {
  const subflow = block.id.startsWith(PREFIX_OF_SUBFLOW);
  const fim = block.id === ID_DO_FIM && block['end'] === true;
  const position = positionOf(block);
  const classes = ['bl-no'];
  if (block.root) classes.push('bl-no--inicio');
  if (ehAttendance(block.id)) classes.push('bl-node--attendance');
  if (isSurveyBlock(block)) classes.push('bl-node--survey');
  if (subflow) classes.push('bl-node--subflow');
  if (fim) classes.push('bl-node--end');
  if (invalido) classes.push('bl-node--error');
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
      onPointerDown={onPointerDown}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      title={subflow ? 'Clique duas vezes para abrir o subfluxo' : undefined}
    >
      <div className="bl-no-corpo">
        <span className="bl-no-titulo">
          {isSurveyBlock(block) ? (
            <IconePortal nome="gostei" tamanho={16} className="bl-no-icone" />
          ) : null}
          {subflow ? <IconePortal nome="roteador" tamanho={16} className="bl-no-icone" /> : null}
          {block.$title || block.id}
        </span>
        {subflow ? <span className="bl-no-tipo">Subfluxo</span> : null}
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
