import { useEffect, useRef, useState } from 'react';
import type { BlockError } from '@pipe/contracts';
import { Etiqueta } from '@pipe/ui';
import { ModalConfirmation } from '../cadastros/_modal';
import { Canvas } from './canvas';
import type { EditorState, GestoDoEditor } from './estado';
import { MenuNewBlock } from './menu-novo-bloco';
import type { Position } from './modelo';
import {
  MESSAGES,
  addBlock,
  colarBlock,
  desligar,
  duplicarBlock,
  excluirBlock,
  ligar,
  moverBlock,
  newBlock,
  attendanceNewBlock,
  podeExcluir,
  substituirBlock,
} from './modelo';
import { BlockPanel } from './painel';
import { positionInCentro } from './setas';
import { errorsLocal, juntarErrors } from './validacao';
import './editor.css';
import './painel-bloco.css';

/**
 * O editor em si, dentro do canvas escuro da moldura: os blocos e as setas
 * (`Canvas`), a barra lateral do bloco aberto (`PainelDoBloco`), o papel "NOVO
 * BLOCO" ao lado da pílula, e os dois avisos — o toast de recusa ("Limite de
 * 25 condições de saída atingidos"…) e a confirmação de excluir, que aqui é
 * `ModalConfirmacao` e não o `window.confirm` (o editor da Blip exclui sem
 * perguntar e conta com o desfazer; o Pipe tem o desfazer E pergunta).
 *
 * O desenho vive no redutor de `estado.ts`, que chega por `estado`/`despachar`;
 * cada gesto vira um mapa novo pelas funções de `modelo.ts` e um `aplicar`.
 * Os erros por bloco são a soma dos da tela (`errosLocais`) com os que a
 * `api` devolveu (`errosDaApi`) e os do 409 de publicar (`errosDoMotor`).
 */

export function Editor({
  state,
  despachar,
  apiErrors,
  motorErrors,
  zoom,
  onZoom,
  novoBlockAberto,
  onFecharNovoBlock,
  panelExternoAberto,
  pesquisa,
}: {
  state: EditorState;
  despachar: (gesto: GestoDoEditor) => void;
  apiErrors: BlockError[];
  motorErrors: BlockError[];
  zoom: number;
  onZoom: (value: number) => void;
  novoBlockAberto: boolean;
  onFecharNovoBlock: () => void;
  panelExternoAberto: boolean;
  pesquisa: string;
}) {
  const { mapa } = state;
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [offset, setOffset] = useState<Position>({ top: 0, left: 0 });
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const area = useRef<HTMLDivElement>(null);

  /* Os painéis de Configuração e Filas ocupam o mesmo lado que o painel do
     bloco; abrir um deles fecha o editor de bloco para não sobrepor conteúdo. */
  useEffect(() => {
    if (panelExternoAberto) setEditando(null);
  }, [panelExternoAberto]);

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

  const errors = juntarErrors(errorsLocal(mapa), apiErrors, motorErrors);
  const errorsByBlock: Record<string, string[]> = {};
  for (const e of errors) {
    if (!e.block) continue;
    (errorsByBlock[e.block] ??= []).push(e.mensagem);
  }

  const aplicar = (novo: typeof mapa): void => despachar({ tipo: 'aplicar', mapa: novo });

  function positionForNew(): Position {
    const caixa = area.current?.getBoundingClientRect();
    return positionInCentro(
      { largura: caixa?.width ?? 800, altura: caixa?.height ?? 600 },
      offset,
      zoom / 100,
    );
  }

  function createDefault(): void {
    const block = newBlock(mapa, positionForNew());
    aplicar(addBlock(mapa, block));
    onFecharNovoBlock();
    setSelecionado(block.id);
    setEditando(block.id);
  }

  function createHumano(): void {
    const block = attendanceNewBlock(mapa, positionForNew());
    aplicar(addBlock(mapa, block));
    onFecharNovoBlock();
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

  const blockAberto = editando ? mapa[editando] : undefined;

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
        onMover={(id, position) => despachar({ tipo: 'mover', mapa: moverBlock(mapa, id, position) })}
        onSoltar={() => despachar({ tipo: 'soltar' })}
        onLigar={ligarBlocos}
        onDesligar={(de, para) => aplicar(desligar(mapa, de, para))}
        onDuplicar={(id) => aplicar(duplicarBlock(mapa, id))}
        onCopiarId={copiarId}
        onColar={(block, position) => aplicar(colarBlock(mapa, block, position))}
        onExcluir={pedirExclusao}
        onAviso={setAviso}
        pesquisa={pesquisa}
      />

      {novoBlockAberto ? (
        <MenuNewBlock onPadrao={createDefault} onHumano={createHumano} onFechar={onFecharNovoBlock} />
      ) : null}

      {blockAberto ? (
        <BlockPanel
          key={blockAberto.id}
          block={blockAberto}
          mapa={mapa}
          errors={errorsByBlock[blockAberto.id] ?? []}
          onMudar={(block) => aplicar(substituirBlock(mapa, block))}
          onFechar={() => setEditando(null)}
          onAviso={setAviso}
        />
      ) : null}

      {aviso ? (
        <div className="bl-toast" role="status">
          <Etiqueta tom="alert">{aviso}</Etiqueta>
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
          if (excluindo) aplicar(excluirBlock(mapa, excluindo));
          setExcluindo(null);
        }}
        onCancelar={() => setExcluindo(null)}
      />
    </div>
  );
}
