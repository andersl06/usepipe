import { useEffect, useRef, useState } from 'react';
import type { ErroDoBloco } from '@pipe/contracts';
import { Etiqueta } from '@pipe/ui';
import { ModalConfirmacao } from '../cadastros/_modal';
import { Canvas } from './canvas';
import type { EstadoDoEditor, GestoDoEditor } from './estado';
import { MenuNovoBloco } from './menu-novo-bloco';
import type { Posicao } from './modelo';
import {
  MENSAGENS,
  adicionarBloco,
  desligar,
  duplicarBloco,
  excluirBloco,
  ligar,
  moverBloco,
  novoBloco,
  novoBlocoDeAtendimento,
  podeExcluir,
  substituirBloco,
} from './modelo';
import { PainelDoBloco } from './painel';
import { posicaoNoCentro } from './setas';
import { errosLocais, juntarErros } from './validacao';
import './editor.css';

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
  estado,
  despachar,
  errosDaApi,
  errosDoMotor,
  zoom,
  onZoom,
  novoBlocoAberto,
  onFecharNovoBloco,
}: {
  estado: EstadoDoEditor;
  despachar: (gesto: GestoDoEditor) => void;
  errosDaApi: ErroDoBloco[];
  errosDoMotor: ErroDoBloco[];
  zoom: number;
  onZoom: (valor: number) => void;
  novoBlocoAberto: boolean;
  onFecharNovoBloco: () => void;
}) {
  const { mapa } = estado;
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [deslocamento, setDeslocamento] = useState<Posicao>({ top: 0, left: 0 });
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const area = useRef<HTMLDivElement>(null);

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

  const erros = juntarErros(errosLocais(mapa), errosDaApi, errosDoMotor);
  const errosPorBloco: Record<string, string[]> = {};
  for (const e of erros) {
    if (!e.bloco) continue;
    (errosPorBloco[e.bloco] ??= []).push(e.mensagem);
  }

  const aplicar = (novo: typeof mapa): void => despachar({ tipo: 'aplicar', mapa: novo });

  function posicaoParaNovo(): Posicao {
    const caixa = area.current?.getBoundingClientRect();
    return posicaoNoCentro(
      { largura: caixa?.width ?? 800, altura: caixa?.height ?? 600 },
      deslocamento,
      zoom / 100,
    );
  }

  function criarPadrao(): void {
    const bloco = novoBloco(mapa, posicaoParaNovo());
    aplicar(adicionarBloco(mapa, bloco));
    onFecharNovoBloco();
    setSelecionado(bloco.id);
    setEditando(bloco.id);
  }

  function criarHumano(): void {
    const bloco = novoBlocoDeAtendimento(mapa, posicaoParaNovo());
    aplicar(adicionarBloco(mapa, bloco));
    onFecharNovoBloco();
    setSelecionado(bloco.id);
    setEditando(bloco.id);
  }

  function ligarBlocos(de: string, para: string): void {
    const r = ligar(mapa, de, para);
    if (r.ok) aplicar(r.mapa);
    else setAviso(r.erro);
  }

  function pedirExclusao(id: string): void {
    if (!podeExcluir(mapa, id)) {
      setAviso(MENSAGENS.naoExclui);
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

  const blocoAberto = editando ? mapa[editando] : undefined;

  return (
    <div ref={area} className="bl-editor">
      <Canvas
        mapa={mapa}
        errosPorBloco={errosPorBloco}
        selecionado={selecionado}
        editando={editando}
        zoom={zoom}
        deslocamento={deslocamento}
        onDeslocar={setDeslocamento}
        onZoom={onZoom}
        onSelecionar={setSelecionado}
        onAbrir={setEditando}
        onMover={(id, posicao) => despachar({ tipo: 'mover', mapa: moverBloco(mapa, id, posicao) })}
        onSoltar={() => despachar({ tipo: 'soltar' })}
        onLigar={ligarBlocos}
        onDesligar={(de, para) => aplicar(desligar(mapa, de, para))}
        onDuplicar={(id) => aplicar(duplicarBloco(mapa, id))}
        onCopiarId={copiarId}
        onExcluir={pedirExclusao}
      />

      {novoBlocoAberto ? (
        <MenuNovoBloco onPadrao={criarPadrao} onHumano={criarHumano} onFechar={onFecharNovoBloco} />
      ) : null}

      {blocoAberto ? (
        <PainelDoBloco
          bloco={blocoAberto}
          mapa={mapa}
          erros={errosPorBloco[blocoAberto.id] ?? []}
          onMudar={(bloco) => aplicar(substituirBloco(mapa, bloco))}
          onFechar={() => setEditando(null)}
          onAviso={setAviso}
        />
      ) : null}

      {aviso ? (
        <div className="bl-toast" role="status">
          <Etiqueta tom="alerta">{aviso}</Etiqueta>
        </div>
      ) : null}

      <ModalConfirmacao
        aberto={excluindo !== null}
        titulo="Excluir bloco"
        mensagem={
          excluindo ? (
            <>
              Excluir o bloco <b>{mapa[excluindo]?.$title ?? excluindo}</b>? As condições de saída de
              outros blocos que apontam para ele deixam de apontar. Dá para desfazer com Ctrl+Z.
            </>
          ) : null
        }
        onConfirmar={() => {
          if (excluindo) aplicar(excluirBloco(mapa, excluindo));
          setExcluindo(null);
        }}
        onCancelar={() => setExcluindo(null)}
      />
    </div>
  );
}
