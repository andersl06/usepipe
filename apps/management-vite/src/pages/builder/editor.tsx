import { useEffect, useRef, useState } from 'react';
import type { BlockError } from '@pipe/contracts';
import { Icone } from '@pipe/ui';
import { useContact } from '../flow/contact';
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
  newSurveyBlock,
  podeExcluir,
  replaceBlock,
} from './model';
import { BlockPanel } from './panel';
import { TestPanel } from './test-panel';
import { positionInCenter } from './setas';
import type { ToastInput } from './toast-queue';
import { invalidBlocks } from './error-marks';
import './editor.css';
import './panel-block.css';

/**
 * The editor itself, inside the frame's dark canvas: the blocks and arrows (`Canvas`), the sidebar of the open block (`BlockPanel`), the "NOVO BLOCO" sheet next to the pill, and the delete confirmation, which here is `ModalConfirmation` and not `window.confirm` (the Blip editor deletes without asking and relies on undo; Pipe has undo AND asks). Passing warnings ("Limite de 25 condições de saída atingidos"…, colar, copiar bloco) go through `onAviso`, the Builder's single toast (F-6, D-56).
 *
 * The drawing lives in the `estado.ts` reducer, reached through `state`/`despachar`; each gesture becomes a new map via the `modelo.ts` functions and an `aplicar`. A block paints red (F-6) when `blockMarks` says `node: true` — the screen's own rules plus whatever the `api` (`apiErrors`) or the 409 on publish (`engineErrors`) flagged for it; there is no text on the canvas, only color.
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
  onAbrirFuncoes,
  onAviso,
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
  onAbrirFuncoes?: (modo: 'gerenciar' | 'criar') => void;
  onAviso: (input: ToastInput) => void;
}) {
  const { contact } = useContact();
  const { mapa } = state;
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [offset, setOffset] = useState<Position>({ top: 0, left: 0 });
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const area = useRef<HTMLDivElement>(null);

  /*
   * The Configuração and Filas panels occupy the same side as the block panel; opening one of them closes the block editor so it doesn't overlap content. The Test panel (D-14) shares that side too.
   */
  useEffect(() => {
    if (panelExternalOpen) {
      setEditando(null);
      setTestOpen(false);
    }
  }, [panelExternalOpen]);

  useEffect(() => {
    if (testOpen) setEditando(null);
  }, [testOpen]);

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

  const invalidos = invalidBlocks(mapa, [...apiErrors, ...engineErrors]);

  const aplicar = (novo: typeof mapa): void => despachar({ tipo: 'aplicar', mapa: novo });

  /**
   * `Canvas` and `BlockPanel` (and everything under them) still call a plain
   * `(texto: string) => void`; this maps that text to the right toast tone before forwarding to
   * the Builder's single toast (F-6, D-56). Copy/paste feedback reads as success; the "no block to
   * paste" case becomes the Blip's two-line danger message; anything else is a plain warning.
   */
  function avisar(texto: string): void {
    if (texto === 'Copie um bloco do Builder antes de colar.') {
      onAviso({
        tom: 'perigo',
        titulo: 'O conteúdo copiado não é um bloco válido.',
        texto: 'Tente de novo.',
      });
      return;
    }
    if (/copiad[oa]|colado/.test(texto)) {
      onAviso({ tom: 'sucesso', texto });
      return;
    }
    onAviso({ tom: 'aviso', texto });
  }

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

  function createSurvey(): void {
    const block = newSurveyBlock(mapa, positionForNew());
    aplicar(addBlock(mapa, block));
    onCloseNewBlock();
    setSelecionado(block.id);
    setEditando(block.id);
  }

  function ligarBlocos(de: string, para: string): void {
    const r = ligar(mapa, de, para);
    if (r.ok) aplicar(r.mapa);
    else avisar(r.error);
  }

  function pedirExclusao(id: string): void {
    if (!podeExcluir(mapa, id)) {
      avisar(MESSAGES.naoExclui);
      return;
    }
    setExcluindo(id);
  }

  function copiarId(id: string): void {
    void navigator.clipboard?.writeText(id).then(
      () => avisar('Id copiado.'),
      () => avisar(id),
    );
  }

  const blockOpen = editando ? mapa[editando] : undefined;

  return (
    <div ref={area} className="bl-editor" data-tema="escuro">
      <Canvas
        mapa={mapa}
        invalidBlocks={invalidos}
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
        onAviso={avisar}
        pesquisa={pesquisa}
      />

      {newBlockOpen ? (
        <MenuNewBlock
          onPadrao={createDefault}
          onHumano={createHuman}
          onPesquisa={createSurvey}
          onFechar={onCloseNewBlock}
        />
      ) : null}

      {blockOpen ? (
        <BlockPanel
          key={blockOpen.id}
          block={blockOpen}
          mapa={mapa}
          onMudar={(block) => aplicar(replaceBlock(mapa, block))}
          onFechar={() => setEditando(null)}
          onAviso={avisar}
          onAbrirFuncoes={onAbrirFuncoes}
        />
      ) : null}

      <button
        type="button"
        className={testOpen ? 'bl-test-toggle bl-test-toggle--ativo' : 'bl-test-toggle'}
        title="Testar fluxo em construção"
        aria-label="Testar fluxo em construção"
        aria-pressed={testOpen}
        onClick={() => setTestOpen((v) => !v)}
      >
        <Icone nome="testEnvironment" tamanho={22} />
      </button>

      {testOpen ? (
        <TestPanel
          flowId={contact.id}
          mapa={mapa}
          onFechar={() => setTestOpen(false)}
          onDestacarBloco={(id) => setSelecionado(id)}
        />
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
