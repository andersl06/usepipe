import { useEffect, useRef, useState } from 'react';
import { BotaoDeIcone, Campo, Etiqueta } from '@pipe/ui';
import type { RespostaProntaListada } from '../../lib/communication';
import { LIMITES_RESPOSTA, motivoDaResposta } from '../../lib/communication';
import {
  alternarRespostaPronta,
  criarRespostaPronta,
  editarRespostaPronta,
} from '../../lib/communication-gravar';

export const AVISO_EM_BREVE = 'Este recurso será liberado em breve para este fluxo.';

/**
 * Cartão de uma resposta de texto dentro da categoria aberta. Como na Blip, não há botão de salvar:
 * ao sair de um campo, uma resposta válida e alterada é gravada na hora (criada ou editada) e a tela
 * avisa o resultado. Resposta nova só grava quando título, atalho e texto estão preenchidos, porque o
 * atalho é o que o atendente digita no compositor do Desk. O texto é sempre desenhado como texto.
 */
export function CartaoResposta({
  resposta,
  categoria,
  aoSalvar,
  aoCriar,
  aoExcluir,
}: {
  /** Ausente: cartão novo, ainda não gravado. */
  resposta?: RespostaProntaListada;
  categoria: string | null;
  aoSalvar: (erro: string | null) => void;
  aoCriar?: () => void;
  aoExcluir: () => void;
}) {
  const [title, setTitle] = useState(resposta?.title ?? '');
  const [shortcut, setShortcut] = useState(resposta ? `#${resposta.shortcut}` : '');
  const [body, setBody] = useState(resposta?.body ?? '');
  const [editandoTitulo, setEditandoTitulo] = useState(!resposta);
  const [erro, setErro] = useState<string | null>(null);
  const gravando = useRef(false);

  // A leitura recarregada (outra aba, renomeação) volta a ser a verdade do cartão.
  useEffect(() => {
    if (!resposta) return;
    setTitle(resposta.title);
    setShortcut(`#${resposta.shortcut}`);
    setBody(resposta.body);
  }, [resposta?.title, resposta?.shortcut, resposta?.body]);

  async function gravar() {
    if (gravando.current) return;
    const atalho = shortcut.trim().replace(/^#/, '');
    const motivo = motivoDaResposta({ shortcut: atalho, title, body });
    const alterada =
      !resposta || title.trim() !== resposta.title || atalho !== resposta.shortcut || body.trim() !== resposta.body;
    if (!alterada) return;
    if (motivo) {
      // Cartão novo incompleto espera o resto; cartão salvo mostra o motivo.
      setErro(resposta ? motivo : null);
      return;
    }
    gravando.current = true;
    setErro(null);
    const r = resposta
      ? await editarRespostaPronta(resposta.id, { title: title.trim(), shortcut: atalho, body: body.trim() })
      : await criarRespostaPronta({ title: title.trim(), shortcut: atalho, body: body.trim(), category: categoria });
    gravando.current = false;
    if (!r.ok) {
      setErro(r.error);
      aoSalvar(r.error);
      return;
    }
    aoSalvar(null);
    if (!resposta) aoCriar?.();
  }

  async function alternar() {
    if (!resposta) return;
    const r = await alternarRespostaPronta(resposta.id, resposta.ativa);
    if (!r.ok) {
      setErro(r.error);
      aoSalvar(r.error);
    }
  }

  return (
    <div className="resp-cartao resp-cartao--resposta">
      <div className="resp-cartao-topo">
        {editandoTitulo ? (
          <Campo
            aria-label="Título da resposta"
            value={title}
            maxLength={LIMITES_RESPOSTA.titulo}
            placeholder="Título da resposta"
            autoFocus={!resposta}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              if (title.trim()) setEditandoTitulo(false);
              void gravar();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
        ) : (
          <>
            <strong className="resp-cartao-titulo">{title}</strong>
            <BotaoDeIcone nome="lapis" rotulo="Editar" onClick={() => setEditandoTitulo(true)} />
          </>
        )}
        <span className="resp-etiqueta-tipo">Texto</span>
        {resposta ? (
          <button
            type="button"
            className="interruptor"
            role="switch"
            aria-checked={resposta.ativa}
            aria-label={resposta.ativa ? `Desativar a resposta ${resposta.title}` : `Ativar a resposta ${resposta.title}`}
            title={resposta.ativa ? 'Desativar esta resposta' : 'Ativar esta resposta'}
            onClick={() => void alternar()}
          >
            <span className="interruptor-bolinha" />
          </button>
        ) : null}
        <BotaoDeIcone nome="lixeira" rotulo="Excluir" onClick={aoExcluir} />
      </div>
      <Campo
        aria-label="Atalho"
        value={shortcut}
        maxLength={LIMITES_RESPOSTA.atalho + 1}
        placeholder="#atalho (é o que o atendente digita no Desk)"
        onChange={(e) => setShortcut(e.target.value)}
        onBlur={() => void gravar()}
      />
      <textarea
        aria-label="Texto da resposta"
        className="campo"
        rows={3}
        value={body}
        maxLength={LIMITES_RESPOSTA.corpo}
        placeholder="Algum texto"
        onChange={(e) => setBody(e.target.value)}
        onBlur={() => void gravar()}
      />
      {erro ? <Etiqueta tom="erro">{erro}</Etiqueta> : null}
    </div>
  );
}
