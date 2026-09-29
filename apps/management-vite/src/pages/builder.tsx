import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { BuilderOfFlow, BlockError, FlowResource, VersionOfFlow } from '@pipe/contracts';
import { Botao, Campo, Icone } from '@pipe/ui';
import { ManagementIcon } from '../components/icones-management';
import { IconePortal } from '@pipe/ui/icones-portal';
import { useEu } from '../context/session';
import { ApiError } from '@pipe/ui/api';
import { useRead } from '../lib/query';
import type { Resultado } from '../lib/rest';
import { ContactBars, useContact } from './flow/contact';
import { publishFlow, restoreVersion } from './builder-gravar';
import { Editor } from './builder/editor';
import { podeDesfazer, podeRefazer } from './builder/state';
import { ConfigurationPanel } from './builder/panel-configuration';
import { QueuesPanel } from './builder/panel-queues';
import { hasAttendanceBlock } from './builder/queues-panel';
import { VariablesPanel } from './builder/panel-variables';
import { ZOOM_MAXIMO, ZOOM_MINIMO, zoomAjustado } from './builder/setas';
import { BuilderToasts } from './builder/toast';
import { pushToast, dismissToast, type Toast, type ToastInput } from './builder/toast-queue';
import { useEditorDoBuilder } from './builder/use-editor';
import { invalidBlocks } from './builder/error-marks';
import { SEARCH_DEBOUNCE_MS } from './builder/search';
import './builder.css';

/**
 * Builder layout follows captured production DOM (`referencias-blip/builder/builder-fluxo__pagina.html`; mapping in `builder.css`): notice strip, block-icon pill, dark canvas, status/zoom footer, conversation button. Pure `./builder/` modules `modelo.ts`, `condicoes.ts`, `conteudo.ts`, and `acoes-do-bloco.ts` edit the graph; `estado.ts` and `use-editor.ts` provide undo/redo and API-backed draft autosave; `canvas.tsx`, `no.tsx`, and `painel*.tsx` render graph and sidebar. Existing `/v1/gestao/fluxos/:id/builder` PUT saves a draft, Publish promotes it with per-block engine errors, history lists versions and restores an older one as draft. Unsupported frame controls remain disabled; confirmations use `Modal` from `cadastros/_modal`, never `window.confirm`. Route `/fluxo/:id/builder` stays inside the contact like source `/application/detail/<bot>/templates/builder`; `HIDDEN_IN_ROUTER` in `fluxo/itens.ts` hides Builder for routers, and `api` returns 409 if opened by URL.
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
  /* "Minhas variáveis" lists this flow's resources too; loaded lazily, only once the panel opens. */
  const resourcesRead = useRead<FlowResource[]>(
    variablesOpen ? `/v1/management/flows/${contact.id}/resources` : null,
  );
  const [configAberto, setConfigAberto] = useState(false);
  const [configTab, setConfigTab] = useState<'variaveis' | 'versoes' | 'acoes' | 'funcoes'>('variaveis');
  const [criarFuncaoAoAbrir, setCriarFuncaoAoAbrir] = useState(false);
  const [queuesOpen, setQueuesOpen] = useState(false);
  const [pesquisaAberta, setPesquisaAberta] = useState(false);
  const [pesquisa, setPesquisa] = useState('');
  /* Blip waits 500ms after typing before filtering the canvas; clearing the term (closing, or
   * clicking outside with an empty field) restores it right away instead of waiting. */
  const [pesquisaComAtraso, setPesquisaComAtraso] = useState('');
  useEffect(() => {
    if (!pesquisa) {
      setPesquisaComAtraso('');
      return;
    }
    const temporizador = setTimeout(() => setPesquisaComAtraso(pesquisa), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(temporizador);
  }, [pesquisa]);
  const pesquisaAncoraRef = useRef<HTMLDivElement>(null);
  /* Clicking outside the pill+box closes the search, but only with an empty field (F-4.1). */
  useEffect(() => {
    if (!pesquisaAberta) return;
    const aoClicarFora = (e: PointerEvent): void => {
      if (pesquisa.trim()) return;
      const alvo = e.target as Node | null;
      if (alvo && pesquisaAncoraRef.current?.contains(alvo)) return;
      setPesquisaAberta(false);
    };
    document.addEventListener('pointerdown', aoClicarFora);
    return () => document.removeEventListener('pointerdown', aoClicarFora);
  }, [pesquisaAberta, pesquisa]);
  function fecharPesquisa(): void {
    setPesquisa('');
    setPesquisaAberta(false);
  }
  const [zoom, setZoom] = useState(ZOOM_MAXIMO);
  const [toasts, setToasts] = useState<Toast[]>([]);
  function toast(input: ToastInput): void {
    setToasts((prev) => pushToast(prev, input, Date.now()));
  }
  /** Queue panel notices (02-33) speak sucesso/erro/alerta; the shared toast speaks sucesso/perigo/aviso. */
  function avisoDasFilas(aviso: {
    tom: 'sucesso' | 'erro' | 'alerta';
    titulo?: string;
    texto: string;
    duracaoMs?: number;
  }): void {
    toast({ ...aviso, tom: aviso.tom === 'erro' ? 'perigo' : aviso.tom === 'alerta' ? 'aviso' : 'sucesso' });
  }

  const [publicando, setPublicando] = useState(false);
  /** Publish 409 can add errors to those already known from saving. */
  const [engineErrors, engineSetErrors] = useState<BlockError[]>([]);

  const podePublicar = eu.permissions.includes('automacao.fluxo.publicar');

  /** Publish gate (D-56): the screen's own `$invalid` marks plus whatever the `api`/engine flagged. */
  const invalidos = invalidBlocks(state.mapa, [...editor.apiErrors, ...engineErrors]);
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

  /** The loading icon stays at least this long even when the request answers sooner (F-6.1 H). */
  async function aguardarMinimo(inicio: number, minimoMs = 2000): Promise<void> {
    const passou = Date.now() - inicio;
    if (passou < minimoMs) await new Promise((resolve) => setTimeout(resolve, minimoMs - passou));
  }

  /** Pill button (source `openRulesModal`): no attendance block, just the 3s warning toast — never opens. */
  function abrirFilas(): void {
    if (queuesOpen) {
      setQueuesOpen(false);
      return;
    }
    if (!hasAttendanceBlock(state.mapa)) {
      toast({
        tom: 'aviso',
        titulo: 'Você ainda não configurou o atendimento humano.',
        texto: 'Para ativar o atendimento humano, adicione um bloco de atendimento no Builder.',
        duracaoMs: 3000,
      });
      return;
    }
    setQueuesOpen(true);
  }

  /** The block Ações tab's "Gerenciar/Criar função" opens the function library (D-22) already inside Configuração. */
  function abrirFuncoes(modo: 'gerenciar' | 'criar'): void {
    setConfigTab('funcoes');
    setCriarFuncaoAoAbrir(modo === 'criar');
    setConfigAberto(true);
  }

  /**
   * Never disabled by error (D-56): a click with pending errors only shows the validation toast
   * and never reaches the server; publishing itself never opens a modal, just the pill's loading
   * icon for a minimum of 2s.
   */
  async function publicar(): Promise<void> {
    if (!data || publicando) return;
    if (invalidos.size > 0 || editor.apiErrors.length > 0 || engineErrors.length > 0) {
      toast({
        tom: 'aviso',
        texto:
          'Erro ao publicar o fluxo: Um ou mais blocos estão inválidos. Corrija os blocos marcados de vermelho e tente novamente.',
      });
      return;
    }
    const inicio = Date.now();
    setPublicando(true);
    /*
     * Publish exactly what is on screen. Save first if changes are dirty or this is a new default flow; the Blip copy performs those two steps in order when publishing.
     */
    if (state.sujo || data.origem !== 'rascunho') {
      const gravou = await editor.salvarAgora();
      if (!gravou) {
        await aguardarMinimo(inicio);
        setPublicando(false);
        toast({ tom: 'perigo', texto: 'Erro ao publicar o fluxo' });
        return;
      }
    }
    const r = await publishFlow(contact.id);
    await aguardarMinimo(inicio);
    setPublicando(false);
    if (!r.ok) {
      engineSetErrors(r.errors);
      const loop = r.errors.find((e) => e.mensagem.includes('laço'));
      if (loop) {
        toast({
          tom: 'perigo',
          titulo: `Existe um loop no seu fluxo começando no bloco '${tituloDe(loop.block)}' que não requer entrada de usuário.`,
          texto: 'Inclua uma ou mais entradas do usuário nos blocos ligados a este.',
        });
      } else {
        toast({ tom: 'perigo', texto: 'Erro ao publicar o fluxo' });
      }
      return;
    }
    engineSetErrors([]);
    toast({ tom: 'sucesso', texto: 'Fluxo publicado!' });
  }

  /** Restore an old version as the draft (D-16), then reload the editor once the read brings it back. */
  async function restaurarVersaoAntiga(version: number): Promise<Resultado<VersionOfFlow>> {
    const r = await restoreVersion(contact.id, version);
    if (!r.ok) return r;
    editor.recarregarQuando(r.value.versao.id, r.value.versao.atualizadoEm);
    setConfigAberto(false);
    toast({ tom: 'sucesso', texto: `Versão ${version} restaurada como rascunho.` });
    return { ok: true, value: r.value.versao };
  }

  const nadaParaPublicar = data?.origem === 'publicada' && !state.sujo;
  /** Explain why Publish is disabled in its tooltip. */
  function motivoDoPublicar(): string {
    if (publicando) return 'publicando…';
    if (!podePublicar) return 'você não tem a permissão de publicar fluxo';
    if (nadaParaPublicar) return `nada para publicar: a versão ${data?.versao?.versao ?? ''} já está no ar`;
    return readRefusal ?? 'carregando';
  }

  /** One toast per autosave failure (F-6.1 I); the pill itself keeps "Tentar de novo". */
  useEffect(() => {
    if (recording.state === 'erro') toast({ tom: 'perigo', texto: 'Erro ao salvar o fluxograma' });
  }, [recording]);

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
              pesquisa={pesquisaComAtraso}
              onAbrirFuncoes={abrirFuncoes}
              onAviso={toast}
            />
          )}

          {variablesOpen && editor.carregado ? (
            <VariablesPanel
              mapa={state.mapa}
              global={state.global}
              configuration={state.configuracao}
              resourceNames={(resourcesRead.data ?? []).map((r) => r.name)}
              onFechar={() => setVariablesOpen(false)}
            />
          ) : null}

          {configAberto && editor.carregado ? (
            <ConfigurationPanel
              flowId={contact.id}
              flowName={contact.nome}
              mapa={state.mapa}
              global={state.global}
              configuration={state.configuracao}
              abaInicial={configTab}
              criarFuncaoAoAbrir={criarFuncaoAoAbrir}
              onChangeGlobal={(global) => despachar({ tipo: 'aplicarGlobais', global })}
              onChangeConfiguration={(chave, valor) => despachar({ tipo: 'configuracao', chave, valor })}
              onImport={(mapa, global) => {
                // Use `aplicar`, not `carregar`: imported flow must become dirty for autosave and undo, like any edit.
                // `carregar` only syncs server state and would leave an imported flow visible but unsaved.
                despachar({ tipo: 'aplicar', mapa });
                despachar({ tipo: 'aplicarGlobais', global });
                setConfigAberto(false);
                toast({ tom: 'sucesso', texto: 'Fluxo importado.' });
              }}
              onRestoreVersion={restaurarVersaoAntiga}
              onAviso={toast}
              onFechar={() => setConfigAberto(false)}
            />
          ) : null}

          {queuesOpen ? (
            <QueuesPanel onFechar={() => setQueuesOpen(false)} onAviso={avisoDasFilas} />
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
              desabilitado={!data || !podePublicar || nadaParaPublicar || publicando}
              motivo={motivoDoPublicar()}
              onClick={() => void publicar()}
            >
              {publicando ? (
                <ManagementIcon nome="atualizar" tamanho={24} className="bl-girando" />
              ) : (
                <IconePortal nome="aprender" tamanho={24} />
              )}
            </BotaoDaBarra>
            <BotaoDaBarra
              rotulo="Configuração"
              desabilitado={!editor.carregado}
              motivo={readRefusal ?? 'carregando'}
              ativo={configAberto}
              onClick={() => {
                setConfigTab('variaveis');
                setConfigAberto((v) => !v);
              }}
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
            <div className="bl-pesquisa-ancora" ref={pesquisaAncoraRef}>
              <BotaoDaBarra
                rotulo={pesquisaAberta ? 'Fechar' : 'Pesquisar'}
                classe="bl-pesquisar"
                desabilitado={!editor.carregado}
                motivo={readRefusal ?? 'carregando'}
                ativo={pesquisaAberta}
                onClick={() => (pesquisaAberta ? fecharPesquisa() : setPesquisaAberta(true))}
              >
                <IconePortal nome={pesquisaAberta ? 'fechar' : 'busca'} tamanho={24} />
              </BotaoDaBarra>
              {pesquisaAberta ? (
                <div className="bl-pesquisa-flutuante" data-tema="escuro">
                  <div className="bl-pesquisa-campo">
                    <IconePortal nome="busca" tamanho={20} className="bl-pesquisa-icone" />
                    <Campo
                      autoFocus
                      value={pesquisa}
                      placeholder="Pesquisar"
                      aria-label="Pesquisar blocos"
                      onChange={(e) => setPesquisa(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') fecharPesquisa();
                      }}
                    />
                  </div>
                  {/* Solid info icon with a bottom tooltip on hover or focus, not a click. */}
                  <span
                    className="bl-pesquisa-info"
                    tabIndex={0}
                    aria-label="Como pesquisar"
                    aria-describedby="bl-pesquisa-dica"
                  >
                    <IconePortal nome="informacao-cheia" tamanho={16} />
                    <span className="bl-pesquisa-dica" id="bl-pesquisa-dica" role="tooltip">
                      Para facilitar a pesquisa, use:
                      <br />
                      title: Início
                      <br />
                      tags: valor
                      <br />
                      content: valor
                      <br />
                      actions: valor
                      <br />
                      output: valor
                    </span>
                  </span>
                </div>
              ) : null}
            </div>
            <BotaoDaBarra
              rotulo="Gerenciamento de Filas"
              desabilitado={!editor.carregado}
              motivo={readRefusal ?? 'carregando'}
              ativo={queuesOpen}
              onClick={abrirFilas}
            >
              <Icone nome="userEngaged" tamanho={24} />
            </BotaoDaBarra>
          </div>

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

      <BuilderToasts
        toasts={toasts}
        onFechar={(id) => setToasts((prev) => dismissToast(prev, id))}
        onPausar={() => {}}
        onRetomar={() => {}}
      />
    </div>
  );
}
