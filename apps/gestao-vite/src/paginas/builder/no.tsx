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
  corresponde: boolean;
  onPointerDown: (e: PointerEventDeReact<HTMLDivElement>) => void;
  onPointerDownNaSaida: (e: PointerEventDeReact<HTMLSpanElement>) => void;
  onContextMenu: (e: MouseEventDeReact<HTMLDivElement>) => void;
}

/** As etiquetas automáticas do editor: o tipo de cada ação, e "UserInput" se espera resposta. */
export interface EtiquetaDoBloco {
  rotulo: string;
  cor: string;
}

const CORES_DAS_ACOES: Record<string, string> = {
  ExecuteScript: '#ff961e',
  ExecuteScriptV2: '#ff961e',
  TrackEvent: '#61d36f',
  SendMessage: '#ee82ee',
  UserInput: '#000000',
};

function corDaEtiqueta(rotulo: string, corDaOrigem?: unknown): string {
  const cor = typeof corDaOrigem === 'string' ? corDaOrigem : CORES_DAS_ACOES[rotulo];
  if (!cor || ['#3f7de8', '#0096fa', '#1e6bf1', '#498bff'].includes(cor.toLowerCase())) return '#4a5d23';
  return cor;
}

export function etiquetasDoBloco(bloco: Bloco): EtiquetaDoBloco[] {
  const tipos = new Map<string, string>();
  for (const acao of [...(bloco.$enteringCustomActions ?? []), ...(bloco.$leavingCustomActions ?? [])]) {
    if (acao.type) tipos.set(acao.type, corDaEtiqueta(acao.type));
  }
  const entrada = entradaDe(bloco);
  if (entrada && !entrada.bypass) tipos.set('UserInput', corDaEtiqueta('UserInput'));
  for (const tag of bloco.$tags ?? []) {
    const lida = tag as { label?: unknown; color?: unknown; background?: unknown };
    if (typeof lida.label === 'string' && lida.label) {
      tipos.set(lida.label, corDaEtiqueta(lida.label, lida.color ?? lida.background));
    }
  }
  return [...tipos].map(([rotulo, cor]) => ({ rotulo, cor }));
}

export function No({
  bloco,
  erros,
  selecionado,
  editando,
  alvo,
  corresponde,
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
  if (!corresponde) classes.push('bl-no--fora-da-busca');
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
