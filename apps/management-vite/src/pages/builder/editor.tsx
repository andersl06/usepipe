import { useEffect, useRef, useState } from 'react';
import type { BlockError } from '@pipe/contracts';
import { Etiqueta } from '@pipe/ui';
import { ModalConfirmation } from '../registrations/_modal';
import { Canvas } from './canvas';
import type { EditorState, GestoDoEditor } from './state';
import { MenuNewBlock } from './menu-new-block';
import type { Position } from './model';
import {
  MESSAGES,
  addBlock,
  pasteBlock,
  desligar,
  duplicateBlock,
  deleteBlock,
  ligar,
  moveBlock,
  newBlock,
  attendanceNewBlock,
  podeExcluir,
  replaceBlock,
} from './model';
import { BlockPanel } from './panel';
import { positionInCenter } from './setas';
import { errorsLocal, joinErrors } from './validation';
import './editor.css';
import './panel-block.css';

/**
 * The editor itself, inside the frame's dark canvas: the blocks and arrows (`Canvas`), the sidebar of the open block (`PainelDoBloco`), the "NOVO BLOCO" sheet next to the pill, and the two warnings — the rejection toast ("Limite de 25 condições de saída atingidos"…) and the delete confirmation, which here is `ModalConfirmacao` and not `window.confirm` (the Blip editor deletes without asking and relies on undo; Pipe has undo AND asks).
 *
 * The drawing lives in the `estado.ts` reducer, reached through `estado`/`despachar`; each gesture becomes a new map via the `modelo.ts` functions and an `aplicar`. Per-block errors are the sum of the screen's (`errosLocais`) with the ones the `api` returned (`errosDaApi`) and the ones from the 409 on publish (`errosDoMotor`).
 */

export function Editor({
  state,
  despachar,
  apiErrors,
  engineErrors,
  zoom,
  onZoom,
  newBlockOpen,
  onCloseNewBlock,
  panelExternalOpen,
  pesquisa,
}: {
  state: EditorState;
  despachar: (gesto: GestoDoEditor) => void;
  apiErrors: BlockError[];
  engineErrors: BlockError[];
  zoom: number;
  onZoom: (value: number) => void;
  newBlockOpen: boolean;
  onCloseNewBlock: () => void;
  panelExternalOpen: boolean;
  pesquisa: string;
}) {
  const { mapa } = state;
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [offset, setOffset] = useState<Position>({ top: 0, left: 0 });
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const area = useRef<HTMLDivElement>(null);

  /*
   * The Configuração and Filas panels occupy the same side as the block panel; opening one of them closes the block editor so it doesn't overlap content.
   */
  useEffect(() => {
    if (panelExternalOpen) setEditando(null);
  }, [panelExternalOpen]);

  /* O aviso some sozinho, como o toast do editor. */
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  /* Bloco que sumiu (desfazer, excluir) fecha o painel. */
  useEffect(() => {
    if (editando && !mapa[editando]) setEditando(null);
    if (selecionado && !mapa[selecionado]) setSelecionado(null);
  }, [mapa, editando, selecionado]);

  /* Ctrl+Z / Ctrl+Shift+Z, fora de campo de texto. */
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable)) return;
      e.preventDefault();
      despachar({ tipo: e.shiftKey ? 'refazer' : 'desfazer' });
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [despachar]);

  const errors = joinErrors(errorsLocal(mapa), apiErrors, engineErrors);
  const errorsByBlock: Record<string, string[]> = {};
  for (const e of errors) {
    if (!e.block) continue;
    (errorsByBlock[e.block] ??= []).push(e.mensagem);
  }

  const aplicar = (novo: typeof mapa): void => despachar({ tipo: 'aplicar', mapa: novo });

  function positionForNew(): Position {
    const caixa = area.current?.getBoundingClientRect();
    return positionInCenter(
      { largura: caixa?.width ?? 800, altura: caixa?.height ?? 600 },
      offset,
      zoom / 100,
    );
  }

  function createDefault(): void {
    const block = newBlock(mapa, positionForNew());
    aplicar(addBlock(mapa, block));
    onCloseNewBlock();
    setSelecionado(block.id);
    setEditando(block.id);
  }

  function createHuman(): void {
    const block = attendanceNewBlock(mapa, positionForNew());
    aplicar(addBlock(mapa, block));
    onCloseNewBlock();
    setSelecionado(block.id);
    setEditando(block.id);
  }

  function ligarBlocos(de: string, para: string): void {
    const r = ligar(mapa, de, para);
    if (r.ok) aplicar(r.mapa);
    else setAviso(r.error);
  }

  function pedirExclusao(id: string): void {
    if (!podeExcluir(mapa, id)) {
      setAviso(MESSAGES.naoExclui);
      return;
    }
    setExcluindo(id);
  }

  function copiarId(id: string): void {
    void navigator.clipboard?.writeText(id).then(
      () => setAviso('Id copiado.'),
      () => setAviso(id),
    );
  }

  const blockOpen = editando ? mapa[editando] : undefined;

  return (
    <div ref={area} className="bl-editor">
      <Canvas
        mapa={mapa}
        errorsByBlock={errorsByBlock}
        selecionado={selecionado}
        editando={editando}
        zoom={zoom}
        offset={offset}
        onDeslocar={setOffset}
        onZoom={onZoom}
        onSelecionar={setSelecionado}
        onAbrir={setEditando}
        onMover={(id, position) => despachar({ tipo: 'mover', mapa: moveBlock(mapa, id, position) })}
        onSoltar={() => despachar({ tipo: 'soltar' })}
        onLigar={ligarBlocos}
        onDesligar={(de, para) => aplicar(desligar(mapa, de, para))}
        onDuplicar={(id) => aplicar(duplicateBlock(mapa, id))}
        onCopiarId={copiarId}
        onColar={(block, position) => aplicar(pasteBlock(mapa, block, position))}
        onExcluir={pedirExclusao}
        onAviso={setAviso}
        pesquisa={pesquisa}
      />

      {newBlockOpen ? (
        <MenuNewBlock onPadrao={createDefault} onHumano={createHuman} onFechar={onCloseNewBlock} />
      ) : null}

      {blockOpen ? (
        <BlockPanel
          key={blockOpen.id}
          block={blockOpen}
          mapa={mapa}
          errors={errorsByBlock[blockOpen.id] ?? []}
          onMudar={(block) => aplicar(replaceBlock(mapa, block))}
          onFechar={() => setEditando(null)}
          onAviso={setAviso}
        />
      ) : null}

      {aviso ? (
        <div className="bl-toast" role="status">
          <Etiqueta tom="alerta">{aviso}</Etiqueta>
        </div>
      ) : null}

      <ModalConfirmation
        aberto={excluindo !== null}
        titulo="Excluir bloco"
        message={
          excluindo ? (
            <>
              Excluir o bloco <b>{mapa[excluindo]?.$title ?? excluindo}</b>? As condições de saída de
              outros blocos que apontam para ele deixam de apontar. Dá para desfazer com Ctrl+Z.
            </>
          ) : null
        }
        onConfirmar={() => {
          if (excluindo) aplicar(deleteBlock(mapa, excluindo));
          setExcluindo(null);
        }}
        onCancelar={() => setExcluindo(null)}
      />
    </div>
  );
}
