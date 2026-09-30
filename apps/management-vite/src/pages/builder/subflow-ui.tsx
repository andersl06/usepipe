import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Botao, Campo, Etiqueta } from '@pipe/ui';
import { IconePortal } from '@pipe/ui/icones-portal';
import { Modal } from '@pipe/ui/modal';
import type { Block, Mapa } from './model';
import { LIMITE_DO_TITULO } from './validation';
import type { SubflowDrawing, Subflows } from './subflows';
import {
  SUBFLOW_MESSAGES,
  SUBFLOW_TITLE_DEFAULT,
  subflowOfBlock,
  subflowShortNameOf,
  subflowTitle,
} from './subflows';
import { exportSubflowText, validateSubflowImport } from './import-exportar';

/**
 * The subflow pieces of the Builder screen (P13). Blip behaviour, Pipe components and paint (D-33):
 * - `SubflowMenuSection`: the "Subfluxo" entry of the NOVO BLOCO sheet, with the flow's subflows
 *   and "+ Criar novo subfluxo";
 * - `CreateSubflowModal`: asks for the name ("Novo subfluxo" by default);
 * - `SubflowBar`: over a subflow canvas, the way back to the main flow plus load/download;
 * - `SubflowSection`: the "Subfluxo" tab of a calling block's panel.
 */

/** Reads one `.json` chosen in a hidden file field. */
function readFile(e: ChangeEvent<HTMLInputElement>, onText: (texto: string) => void, onError: () => void): void {
  const arq = e.target.files?.[0];
  e.target.value = '';
  if (!arq) return;
  const leitor = new FileReader();
  leitor.onload = () => onText(String(leitor.result ?? ''));
  leitor.onerror = onError;
  leitor.readAsText(arq);
}

function download(nome: string, conteudo: string): void {
  const blob = new Blob([conteudo], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

export function SubflowMenuSection({
  mapa,
  subfluxos,
  onAbrir,
  onCriar,
}: {
  mapa: Mapa;
  subfluxos: Subflows;
  onAbrir: (shortName: string) => void;
  onCriar: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const nomes = Object.keys(subfluxos).sort((a, b) =>
    subflowTitle(mapa, a).localeCompare(subflowTitle(mapa, b), 'pt-BR'),
  );
  return (
    <>
      <button
        type="button"
        className="bl-new-block-item"
        data-test="builder-add-subflow"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
      >
        <IconePortal nome="roteador" tamanho={20} />
        <span>Subfluxo</span>
      </button>
      {aberto ? (
        <div className="bl-subflow-menu">
          {nomes.length === 0 ? <p className="bl-subflow-menu-vazio">Nenhum subfluxo neste fluxo.</p> : null}
          {nomes.map((shortName) => (
            <button
              key={shortName}
              type="button"
              className="bl-subflow-menu-item"
              title={`Abrir o subfluxo ${subflowTitle(mapa, shortName)}`}
              onClick={() => onAbrir(shortName)}
            >
              <span>{subflowTitle(mapa, shortName)}</span>
              <IconePortal nome="direita" tamanho={16} />
            </button>
          ))}
          <button type="button" className="bl-subflow-criar" data-test="builder-create-subflow" onClick={onCriar}>
            {SUBFLOW_MESSAGES.criarBotao}
          </button>
        </div>
      ) : null}
    </>
  );
}

export function CreateSubflowModal({
  aberto,
  onCriar,
  onCancelar,
}: {
  aberto: boolean;
  onCriar: (nome: string) => void;
  onCancelar: () => void;
}) {
  const [nome, setNome] = useState(SUBFLOW_TITLE_DEFAULT);
  const [erro, setErro] = useState<string | null>(null);
  function criar(): void {
    if (!nome.trim()) {
      setErro(SUBFLOW_MESSAGES.nomeObrigatorio);
      return;
    }
    onCriar(nome.trim());
    setNome(SUBFLOW_TITLE_DEFAULT);
    setErro(null);
  }
  return (
    <Modal aberto={aberto} titulo={SUBFLOW_MESSAGES.criarTitulo} onFechar={onCancelar}>
      <label className="bl-subflow-campo">
        <span>Nome do subfluxo</span>
        <Campo
          autoFocus
          value={nome}
          maxLength={LIMITE_DO_TITULO}
          aria-label="Nome do subfluxo"
          onChange={(e) => {
            setNome(e.target.value);
            setErro(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') criar();
          }}
        />
      </label>
      <p className="sub">
        O subfluxo começa no bloco Início e volta para este fluxo pelo bloco Fim. As condições de saída do bloco
        que o chama decidem o próximo passo.
      </p>
      {erro ? <Etiqueta tom="erro">{erro}</Etiqueta> : null}
      <div className="cl-actions">
        <Botao type="button" onClick={onCancelar}>
          Cancelar
        </Botao>
        <Botao type="button" variante="primario" onClick={criar}>
          Criar subfluxo
        </Botao>
      </div>
    </Modal>
  );
}

export function SubflowBar({
  titulo,
  shortName,
  subflow,
  onVoltar,
  onCarregar,
  onAviso,
}: {
  titulo: string;
  shortName: string;
  subflow: SubflowDrawing;
  onVoltar: () => void;
  onCarregar: (subflow: SubflowDrawing) => void;
  onAviso: (texto: string, erro?: boolean) => void;
}) {
  const arquivo = useRef<HTMLInputElement>(null);
  return (
    <div className="bl-subflow-bar" data-tema="escuro" role="navigation" aria-label="Subfluxo aberto">
      <button type="button" className="bl-subflow-voltar" onClick={onVoltar} title="Voltar para o fluxo principal">
        <IconePortal nome="voltar" tamanho={20} />
        <span>Fluxo principal</span>
      </button>
      <span className="bl-subflow-sep" aria-hidden="true">
        /
      </span>
      <span className="bl-subflow-nome" title={`Nome curto: ${shortName}`}>
        {titulo}
      </span>
      <span className="bl-subflow-chip">Subfluxo</span>
      <button
        type="button"
        className="iconbtn"
        title="Carregar subfluxo"
        aria-label="Carregar subfluxo"
        onClick={() => arquivo.current?.click()}
      >
        <IconePortal nome="enviar-arquivo" tamanho={20} />
      </button>
      <input
        ref={arquivo}
        type="file"
        accept=".json"
        className="bl-oculto"
        onChange={(e) =>
          readFile(
            e,
            (texto) => {
              const r = validateSubflowImport(texto);
              if (r.ok) onCarregar(r.subflow);
              else onAviso(r.error, true);
            },
            () => onAviso(SUBFLOW_MESSAGES.importacaoInvalida, true),
          )
        }
      />
      <button
        type="button"
        className="iconbtn"
        title="Baixar subfluxo"
        aria-label="Baixar subfluxo"
        onClick={() => download(`${shortName}.json`, exportSubflowText(subflow))}
      >
        <IconePortal nome="baixar" tamanho={20} />
      </button>
    </div>
  );
}

/**
 * The "Subfluxo" tab of a calling block: which subflow it calls, and the way into it. A block whose
 * subflow has no drawing (an imported flow whose subflow file did not come) offers to load that
 * file or to start an empty subflow under the same name.
 */
export function SubflowSection({
  block,
  subfluxos,
  onAbrir,
  onCriarVazio,
  onCarregar,
  onAviso,
}: {
  block: Block;
  subfluxos: Subflows;
  onAbrir: (shortName: string) => void;
  onCriarVazio: (shortName: string) => void;
  onCarregar: (shortName: string, subflow: SubflowDrawing) => void;
  onAviso: (texto: string) => void;
}) {
  const arquivo = useRef<HTMLInputElement>(null);
  const shortName = subflowShortNameOf(block);
  const key = subflowOfBlock(block, subfluxos);
  const blocos = key ? Object.keys(subfluxos[key]!.mapa).length : 0;
  return (
    <div className="bl-aba-corpo">
      <section className="bl-section bl-subflow-secao">
        <span className="bl-section-subtitle">Subfluxo chamado</span>
        <p>
          <b>{block.$title || shortName}</b>
          {shortName ? <span className="sub"> — nome curto {shortName}</span> : null}
        </p>
        <p className="sub">
          Ao chegar neste bloco, o contato entra no subfluxo. Quando ele alcança o bloco Fim do subfluxo, volta
          para cá e as condições de saída deste bloco decidem o próximo bloco.
        </p>
        {key ? (
          <>
            <p className="sub">
              {blocos} {blocos === 1 ? 'bloco' : 'blocos'} no subfluxo.
            </p>
            <Botao type="button" variante="primario" onClick={() => onAbrir(key)}>
              Abrir subfluxo
            </Botao>
          </>
        ) : shortName ? (
          <>
            <Etiqueta tom="erro">{SUBFLOW_MESSAGES.semDesenho}</Etiqueta>
            <div className="bl-subflow-botoes">
              <Botao type="button" onClick={() => arquivo.current?.click()}>
                Carregar subfluxo
              </Botao>
              <Botao type="button" variante="primario" onClick={() => onCriarVazio(shortName)}>
                Criar subfluxo vazio
              </Botao>
            </div>
            <input
              ref={arquivo}
              type="file"
              accept=".json"
              className="bl-oculto"
              onChange={(e) =>
                readFile(
                  e,
                  (texto) => {
                    const r = validateSubflowImport(texto);
                    if (r.ok) onCarregar(shortName, r.subflow);
                    else onAviso(r.error);
                  },
                  () => onAviso(SUBFLOW_MESSAGES.importacaoInvalida),
                )
              }
            />
          </>
        ) : (
          <Etiqueta tom="erro">{`O bloco de subfluxo '${block.id}' não indica qual subfluxo chamar.`}</Etiqueta>
        )}
      </section>
    </div>
  );
}
