import { useState, type ReactNode } from 'react';
import type { BuilderOfFlow, BlockError } from '@pipe/contracts';
import { Botao, Campo, Etiqueta, Icone } from '@pipe/ui';
import { ManagementIcon } from '../components/icones-management';
import { IconePortal } from '../components/icones-portal';
import { useEu } from '../context/session';
import { ApiError } from '../lib/api';
import { useRead } from '../lib/query';
import { Modal } from './registrations/_modal';
import { ContactBars, useContact } from './flow/contact';
import { publishFlow } from './builder-gravar';
import { Editor } from './builder/editor';
import { podeDesfazer, podeRefazer } from './builder/state';
import { ConfigurationPanel } from './builder/panel-configuration';
import { QueuesPanel } from './builder/panel-queues';
import { VariablesPanel } from './builder/panel-variables';
import { ZOOM_MAXIMO, ZOOM_MINIMO, zoomAjustado } from './builder/setas';
import { useEditorDoBuilder } from './builder/use-editor';
import { errorsLocal, joinErrors } from './builder/validation';
import './builder.css';

/**
 * Builder layout follows captured production DOM (`referencias-blip/builder/builder-fluxo__pagina.html`; mapping in `builder.css`): notice strip, block-icon pill, dark canvas, status/zoom footer, conversation button. Pure `./builder/` modules `modelo.ts`, `condicoes.ts`, `conteudo.ts`, and `acoes-do-bloco.ts` edit the graph; `estado.ts` and `use-editor.ts` provide undo/redo and API-backed draft autosave; `canvas.tsx`, `no.tsx`, and `painel*.tsx` render graph and sidebar. Existing `/v1/gestao/fluxos/:id/builder` PUT saves a draft, Publish promotes it with per-block engine errors, history lists versions and restores an older one as draft. Unsupported frame controls remain disabled; confirmations use `Modal` from `cadastros/_modal`, never `window.confirm`. Route `/fluxo/:id/builder` stays inside the contact like source `/application/detail/<bot>/templates/builder`; `ESCONDIDOS_NO_ROTEADOR` in `fluxo/itens.ts` hides Builder for routers, and `api` returns 409 if opened by URL.
 */

/**
 * Sidebar-pill button matches `bds-button-icon variant="secondary" size="short"` with right tooltip. Disable controls without an implementation by default and explain that state beside the control name.
 */
function BotaoDaBarra({
  rotulo,
  classe,
  onClick,
  desabilitado = true,
  motivo,
  ativo,
  children,
}: {
  rotulo: string;
  classe?: string;
  onClick?: () => void;
  desabilitado?: boolean;
  /** When disabled, give a specific tooltip reason; otherwise say it is not built yet. */
  motivo?: string;
  ativo?: boolean;
  children: ReactNode;
}) {
  const classes = ['bl-icone-botao'];
  if (classe) classes.push(classe);
  if (!desabilitado) classes.push('bl-icone-botao--vivo');
  if (ativo) classes.push('bl-icone-botao--ativo');
  return (
    <button
      type="button"
      className={classes.join(' ')}
      disabled={desabilitado}
      onClick={onClick}
      title={desabilitado ? `${rotulo} — ${motivo ?? 'ainda não construído'}` : rotulo}
      aria-label={rotulo}
      aria-pressed={ativo}
    >
      {children}
    </button>
  );
}

const ROTULO_DA_ORIGEM = {
  rascunho: 'Rascunho',
  publicada: 'Publicada',
  padrao: 'Fluxo padrão',
} as const;

export function PageBuilder() {
  const { contact } = useContact();
  const eu = useEu();
  const caminho = `/v1/management/flows/${contact.id}/builder`;
  const read = useRead<BuilderOfFlow>(caminho);
  const data = read.data ?? null;

  const editor = useEditorDoBuilder(contact.id, data);
  const { state, despachar, recording } = editor;

  const [avisoAberto, setAvisoAberto] = useState(true);
  const [newBlockOpen, setNewBlockOpen] = useState(false);
  const [variablesOpen, setVariablesOpen] = useState(false);
  const [configAberto, setConfigAberto] = useState(false);
  const [queuesOpen, setQueuesOpen] = useState(false);
  const [pesquisaAberta, setPesquisaAberta] = useState(false);
  const [pesquisa, setPesquisa] = useState('');
  const [zoom, setZoom] = useState(ZOOM_MAXIMO);
  const [recado, setRecado] = useState<{ tom: 'sucesso' | 'erro'; texto: string } | null>(null);

  const [publicarAberto, setPublicarAberto] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [publicationError, publicationSetError] = useState<string | null>(null);
  /** Publish 409 can add errors to those already known from saving. */
  const [engineErrors, engineSetErrors] = useState<BlockError[]>([]);

  const podePublicar = eu.permissions.includes('automacao.fluxo.publicar');

  const errors = joinErrors(errorsLocal(state.mapa), editor.apiErrors, engineErrors);
  const tituloDe = (id: string | null): string =>
    id === null ? 'Fluxo' : (state.mapa[id]?.$title ?? id);

  /*
   * Show the `api` refusal message for read failures: 409 for router and 403 for missing permission. This is not Not found; the parent route handles 404.
   */
  const readRefusal =
    read.error instanceof ApiError
      ? ((read.error.corpo as { error?: { message?: string } } | null)?.error?.message ??
        read.error.message)
      : read.error?.message;

  function abrirPublicar(): void {
    publicationSetError(null);
    setPublicarAberto(true);
  }

  async function publicar(): Promise<void> {
    if (!data || publicando) return;
    setPublicando(true);
    publicationSetError(null);
    /*
     * Publish exactly what is on screen. Save first if changes are dirty or this is a new default flow; the Blip copy performs those two steps in order when publishing.
     */
    if (state.sujo || data.origem !== 'rascunho') {
      const gravou = await editor.salvarAgora();
      if (!gravou) {
        setPublicando(false);
        publicationSetError('Não foi possível salvar o rascunho antes de publicar.');
        return;
      }
    }
    const r = await publishFlow(contact.id);
    setPublicando(false);
    if (!r.ok) {
      publicationSetError(r.error);
      engineSetErrors(r.errors);
      return;
    }
    engineSetErrors([]);
    setPublicarAberto(false);
    setRecado({
      tom: 'sucesso',
      texto: r.value.arquivada
        ? `Versão ${r.value.versao.versao} publicada; a ${r.value.arquivada.versao} saiu do ar.`
        : `Versão ${r.value.versao.versao} publicada.`,
    });
  }

  const nadaParaPublicar = data?.origem === 'publicada' && !state.sujo;
  /** Explain why Publish is disabled in its tooltip. */
  function motivoDoPublicar(): string {
    if (!podePublicar) return 'você não tem a permissão de publicar fluxo';
    if (nadaParaPublicar) return `nada para publicar: a versão ${data?.versao?.versao ?? ''} já está no ar`;
    return readRefusal ?? 'carregando';
  }

  /** Footer Saved status includes its underlying persistence state. */
  function recordingStatus(): { icone: 'circuloOk' | 'atualizar' | 'alerta'; texto: string } {
    switch (recording.state) {
      case 'salvando':
        return { icone: 'atualizar', texto: 'Salvando…' };
      case 'pendente':
        return { icone: 'atualizar', texto: 'Alterações não salvas' };
      case 'erro':
        return { icone: 'alerta', texto: recording.error };
      case 'salvo':
        return { icone: 'circuloOk', texto: 'Salvo' };
    }
  }

  function telaCheia(): void {
    const tela = document.querySelector('.bl-tela');
    if (!tela) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void tela.requestFullscreen?.();
  }

  const status = recordingStatus();
  const blocos = Object.keys(state.mapa).length;

  return (
    <div className="pt-app">
      <ContactBars ativo="Builder" />
      <div className="bl-tela">
        {avisoAberto ? (
          <div className="bl-aviso bl-aviso--sistema">
            <IconePortal nome="informacao" tamanho={24} />
            <div className="bl-aviso-texto">
              <div>
                Com as mudanças de identificadores anunciadas pela Meta, fluxos com dependência de
                número de telefone serão afetados. Clique no link para gerar um relatório de análise
                que identifica dependências de número de telefone neste fluxo.{' '}
                <a
                  href="https://help.blip.ai/hc/pt-br/articles/38934034280855-Atualiza%C3%A7%C3%A3o-do-canal-WhatsApp-Usernames-BSUID-e-novos-IDs"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Saiba mais
                </a>{' '}
                sobre as mudanças de IDs no WhatsApp
              </div>
            </div>
            <button
              type="button"
              className="bl-aviso-fechar"
              aria-label="Fechar aviso"
              onClick={() => setAvisoAberto(false)}
            >
              <IconePortal nome="fechar" tamanho={24} />
            </button>
          </div>
        ) : null}

        {errors.length > 0 ? (
          <div className="bl-aviso bl-notice--error" role="alert">
            <div className="bl-aviso-texto">
              <span>
                <Icone nome="alerta" tamanho={16} /> O motor recusaria este fluxo — {errors.length}{' '}
                {errors.length === 1 ? 'erro' : 'erros'} a corrigir antes de publicar:
              </span>
              <ul className="bl-errors">
                {errors.slice(0, 6).map((e) => (
                  <li key={`${e.block ?? ''}:${e.mensagem}`}>
                    <b>{tituloDe(e.block)}</b>: {e.mensagem}
                  </li>
                ))}
                {errors.length > 6 ? <li>… e mais {errors.length - 6}.</li> : null}
              </ul>
            </div>
          </div>
        ) : null}

        <div className="bl-corpo">
          {readRefusal ? (
            <div className="bl-empty">
              <Icone nome="alerta" tamanho={40} />
              <p>{readRefusal}</p>
            </div>
          ) : !editor.carregado ? (
            <div className="bl-empty">
              <p>Carregando o desenho…</p>
            </div>
          ) : (
            <Editor
              state={state}
              despachar={despachar}
              apiErrors={editor.apiErrors}
              engineErrors={engineErrors}
              zoom={zoom}
              onZoom={setZoom}
              newBlockOpen={newBlockOpen}
              onCloseNewBlock={() => setNewBlockOpen(false)}
              panelExternalOpen={configAberto || queuesOpen}
              pesquisa={pesquisa}
            />
          )}

          {variablesOpen && editor.carregado ? (
            <VariablesPanel
              mapa={state.mapa}
              global={state.global}
              onFechar={() => setVariablesOpen(false)}
              onAviso={(texto) => setRecado({ tom: 'sucesso', texto })}
            />
          ) : null}

          {configAberto && editor.carregado ? (
            <ConfigurationPanel
              flowName={contact.nome}
              mapa={state.mapa}
              global={state.global}
              onChangeGlobal={(global) => despachar({ tipo: 'aplicarGlobais', global })}
              onImport={(mapa, global) => {
                // Use `aplicar`, not `carregar`: imported flow must become dirty for autosave and undo, like any edit.
                // `carregar` only syncs server state and would leave an imported flow visible but unsaved.
                despachar({ tipo: 'aplicar', mapa });
                despachar({ tipo: 'aplicarGlobais', global });
                setConfigAberto(false);
                setRecado({ tom: 'sucesso', texto: 'Fluxo importado.' });
              }}
              onFechar={() => setConfigAberto(false)}
            />
          ) : null}

          {queuesOpen ? (
            <QueuesPanel
              contactType={contact.tipo}
              contactId={contact.id}
              onFechar={() => setQueuesOpen(false)}
            />
          ) : null}

          {/*
 * Source icon pill `.builder-icon-button-list` follows captured DOM order: Add block, Builder Assistant, Publish flow, Configuration, Variable library, Search, Queue management, each `bds-button-icon variant="secondary" size="short"` with literal tooltips. Builder Assistant calls `$ctrl.createCopilotModal()`; with no AI provider in Pipe's engine, disable it like other unsupported controls.
 */}
          <div className="bl-barra">
            <BotaoDaBarra
              rotulo="Adicionar bloco"
              desabilitado={!editor.carregado}
              motivo={readRefusal ?? 'carregando'}
              ativo={newBlockOpen}
              onClick={() => setNewBlockOpen((v) => !v)}
            >
              <Icone nome="mais" tamanho={24} />
            </BotaoDaBarra>
            <BotaoDaBarra rotulo="Builder Assistant">
              <IconePortal nome="robo" tamanho={24} />
            </BotaoDaBarra>
            <BotaoDaBarra
              rotulo="Publicar fluxo"
              desabilitado={!data || !podePublicar || nadaParaPublicar}
              motivo={motivoDoPublicar()}
              onClick={abrirPublicar}
            >
              <IconePortal nome="aprender" tamanho={24} />
            </BotaoDaBarra>
            <BotaoDaBarra
              rotulo="Configuração"
              desabilitado={!editor.carregado}
              motivo={readRefusal ?? 'carregando'}
              ativo={configAberto}
              onClick={() => setConfigAberto((v) => !v)}
            >
              <IconePortal nome="painel" tamanho={24} />
            </BotaoDaBarra>
            <BotaoDaBarra
              rotulo="Biblioteca de variáveis"
              desabilitado={!editor.carregado}
              motivo={readRefusal ?? 'carregando'}
              ativo={variablesOpen}
              onClick={() => setVariablesOpen((v) => !v)}
            >
              <ManagementIcon nome="biblioteca" tamanho={24} />
            </BotaoDaBarra>
            <BotaoDaBarra
              rotulo="Pesquisar"
              classe="bl-pesquisar"
              desabilitado={!editor.carregado}
              motivo={readRefusal ?? 'carregando'}
              ativo={pesquisaAberta}
              onClick={() => setPesquisaAberta((aberta) => !aberta)}
            >
              <IconePortal nome="busca" tamanho={24} />
            </BotaoDaBarra>
            <BotaoDaBarra
              rotulo="Gerenciamento de Filas"
              desabilitado={!editor.carregado}
              motivo={readRefusal ?? 'carregando'}
              ativo={queuesOpen}
              onClick={() => setQueuesOpen((v) => !v)}
            >
              <IconePortal nome="suporte" tamanho={24} />
            </BotaoDaBarra>
          </div>
          {pesquisaAberta ? (
            <div className="bl-pesquisa-flutuante">
              <Campo
                autoFocus
                value={pesquisa}
                placeholder="Pesquisar"
                aria-label="Pesquisar blocos"
                onChange={(e) => setPesquisa(e.target.value)}
              />
              <button type="button" className="iconbtn" aria-label="Fechar pesquisa" onClick={() => { setPesquisa(''); setPesquisaAberta(false); }}>
                <IconePortal nome="fechar" tamanho={20} />
              </button>
            </div>
          ) : null}

          {/*
 * Reference `.builder-footer` has a light status pill (Saved with `checkball`), three separate Undo/Redo/Fullscreen icons spaced by 10px, `100%`, and 100px slider from 20% to 100%.
 */}
          <div className="bl-rodape">
            <div className={`bl-status${recording.state === 'erro' ? ' bl-status--erro' : ''}`}>
              {data ? (
                <>
                  <ManagementIcon
                    nome={status.icone === 'alerta' ? 'informacao' : status.icone}
                    tamanho={24}
                    className={recording.state === 'salvando' ? 'bl-girando' : undefined}
                  />
                  <span title={`${ROTULO_DA_ORIGEM[data.origem]}${data.versao ? ` v${data.versao.versao}` : ''}${data.publicada && data.origem !== 'publicada' ? ` · no ar: v${data.publicada.versao}` : ''} · ${blocos} ${blocos === 1 ? 'bloco' : 'blocos'}`}>
                    {status.texto}
                  </span>
                  {recording.state === 'erro' ? (
                    <Botao type="button" onClick={() => void editor.salvarAgora()}>
                      Tentar de novo
                    </Botao>
                  ) : null}
                </>
              ) : (
                <span>{readRefusal ? 'Indisponível' : 'Carregando…'}</span>
              )}
            </div>
            {recado ? (
              <Etiqueta tom={recado.tom} className="bl-recado">
                {recado.texto}
              </Etiqueta>
            ) : null}

            <div className="bl-controles">
              <button
                type="button"
                className="bl-icone-botao bl-icone-botao--vivo"
                disabled={!podeDesfazer(state)}
                title="Desfazer (Ctrl+z)"
                aria-label="Desfazer (Ctrl+z)"
                onClick={() => despachar({ tipo: 'desfazer' })}
              >
                <ManagementIcon nome="desfazer" tamanho={24} />
              </button>
              <button
                type="button"
                className="bl-icone-botao bl-icone-botao--vivo"
                disabled={!podeRefazer(state)}
                title="Refazer (Ctrl+Shift+z)"
                aria-label="Refazer (Ctrl+Shift+z)"
                onClick={() => despachar({ tipo: 'refazer' })}
              >
                <ManagementIcon nome="refazer" tamanho={24} />
              </button>
              <button
                type="button"
                className="bl-icone-botao bl-icone-botao--vivo"
                title="Tela Cheia (Alt+Enter)"
                aria-label="Tela Cheia (Alt+Enter)"
                onClick={telaCheia}
              >
                <ManagementIcon nome="telaCheia" tamanho={24} />
              </button>
            </div>

            <div className="bl-zoom">
              <span className="bl-zoom-value">{zoom}%</span>
              <div className="bl-zoom-rail">
                <div className="bl-zoom-preenchido" style={{ width: `${((zoom - ZOOM_MINIMO) / (ZOOM_MAXIMO - ZOOM_MINIMO)) * 100}%` }} />
                <input
                  type="range"
                  className="bl-zoom-controle"
                  aria-label="Zoom"
                  min={ZOOM_MINIMO}
                  max={ZOOM_MAXIMO}
                  step={1}
                  value={zoom}
                  onChange={(e) => setZoom(zoomAjustado(Number(e.target.value)))}
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            className="bl-conversation"
            disabled
            title="Conversa — em breve"
            aria-label="Conversa"
          >
            <Icone nome="balao" tamanho={22} />
          </button>
        </div>
      </div>

      {/*
 * Publish confirmation uses reference `bds-modal` and lists engine errors when refused; never use `window.confirm`.
 */}
      <Modal aberto={publicarAberto} titulo="Publicar fluxo" onFechar={() => setPublicarAberto(false)}>
        {data ? (
          <>
            <p className="sub">
              {data.origem === 'padrao'
                ? 'O desenho será salvo como rascunho e publicado como versão 1. '
                : state.sujo
                  ? 'O que está na tela é gravado no rascunho e vira a versão publicada. '
                  : `O rascunho v${data.versao?.versao ?? ''} vira a versão publicada. `}
              {data.publicada
                ? `A versão ${data.publicada.versao}, que está no ar, é arquivada — as conversas que já estavam com o robô continuam nela até a próxima mensagem.`
                : 'A partir daí, o canal ligado a este fluxo passa a responder com ele.'}
            </p>
            {errors.length > 0 ? (
              <>
                <Etiqueta tom="erro">
                  O motor recusaria este fluxo. Corrija antes de publicar:
                </Etiqueta>
                <ul className="bl-errors bl-errors--modal">
                  {errors.map((e) => (
                    <li key={`${e.block ?? ''}:${e.mensagem}`}>
                      <b>{tituloDe(e.block)}</b>: {e.mensagem}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {Object.keys(data.naoSuportado).length > 0 ? (
              <p className="sub">
                Ações que o motor do Pipe ainda não executa (a conversa cai na fila quando chegar
                nelas): {Object.keys(data.naoSuportado).join(', ')}.
              </p>
            ) : null}
            {publicationError ? <Etiqueta tom="erro">{publicationError}</Etiqueta> : null}
            <div className="cl-actions">
              <Botao type="button" onClick={() => setPublicarAberto(false)} disabled={publicando}>
                Cancelar
              </Botao>
              <Botao
                type="button"
                variante="primario"
                onClick={() => void publicar()}
                disabled={publicando || errors.length > 0}
              >
                {publicando ? 'Publicando…' : 'Publicar'}
              </Botao>
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  );
}
