import { useState, type ReactNode } from 'react';
import type { BuilderOfFlow, BlockError } from '@pipe/contracts';
import { Botao, Campo, Etiqueta, Icone } from '@pipe/ui';
import { IconeManagement } from '../componentes/icones-gestao';
import { IconePortal } from '../componentes/icones-portal';
import { useEu } from '../contexto/sessao';
import { ApiError } from '../lib/api';
import { useRead } from '../lib/consulta';
import { Modal } from './cadastros/_modal';
import { ContactBarras, useContact } from './fluxo/contato';
import { publishFlow } from './builder-gravar';
import { Editor } from './builder/editor';
import { podeDesfazer, podeRefazer } from './builder/estado';
import { ConfigurationPanel } from './builder/painel-configuracao';
import { QueuesPanel } from './builder/painel-filas';
import { VariablesPanel } from './builder/painel-variaveis';
import { ZOOM_MAXIMO, ZOOM_MINIMO, zoomAjustado } from './builder/setas';
import { useEditorDoBuilder } from './builder/use-editor';
import { errorsLocal, juntarErrors } from './builder/validacao';
import './builder.css';

/**
 * Builder — o construtor de fluxo, na disposição real do Builder de produção
 * (faixa de aviso, pílula de blocos, canvas escuro, rodapé com status/zoom,
 * botão de conversa), medida no DOM capturado em
 * `referencias-blip/builder/builder-fluxo__pagina.html` — ver o de-para em
 * `builder.css`. O editor mora em `./builder/`:
 *
 * - `modelo.ts`, `condicoes.ts`, `conteudo.ts`, `acoes-do-bloco.ts`: as
 *   funções puras sobre o mapa de blocos (criar, mover, ligar, editar);
 * - `estado.ts`: o redutor com desfazer/refazer; `use-editor.ts`: o estado
 *   ligado à `api`, com a gravação automática do rascunho;
 * - `canvas.tsx` + `no.tsx`: os blocos e as setas; `painel*.tsx`: a barra
 *   lateral do bloco (Conteúdo, Ações, Condições de saída).
 *
 * Por trás, o que a `api` já sabe fazer por fluxo (`/v1/gestao/fluxos/:id/
 * builder`): o `PUT` grava o desenho como rascunho (aqui, sozinho, um pouco
 * depois de cada mudança — o "Salvo" do rodapé), "Publicar fluxo" promove o
 * rascunho a versão publicada com os erros do motor listados bloco a bloco, e
 * o histórico lista as versões e restaura uma antiga como rascunho.
 *
 * Os controles da moldura sem nada por trás (Configuração, Biblioteca de
 * variáveis, Pesquisar, Gerenciamento de Filas, Conversa) continuam
 * `disabled`. Confirmações passam pelo `Modal` de `cadastros/_modal`, nunca
 * por `window.confirm`.
 *
 * Rota: `/fluxo/:id/builder` — DENTRO do contato, como na origem
 * (`/application/detail/<bot>/templates/builder`). Builder é escondido do
 * menu para roteador (`ESCONDIDOS_NO_ROTEADOR` em `fluxo/itens.ts`), e a `api`
 * responde 409 se alguém chegar pela URL — a tela mostra a frase dela.
 */

/**
 * Um botão da pílula lateral: `bds-button-icon variant="secondary"
 * size="short"` com o tooltip à direita. Desabilitado por padrão — o que não
 * tem nada por trás diz isso junto com o nome do controle.
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
  /** O que dizer no tooltip quando está desligado — sem ele, "ainda não construído". */
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
  const caminho = `/v1/gestao/fluxos/${contact.id}/builder`;
  const read = useRead<BuilderOfFlow>(caminho);
  const data = read.data ?? null;

  const editor = useEditorDoBuilder(contact.id, data);
  const { state, despachar, recording } = editor;

  const [avisoAberto, setAvisoAberto] = useState(true);
  const [novoBlockAberto, setNovoBlockAberto] = useState(false);
  const [variablesAberto, setVariablesAberto] = useState(false);
  const [configAberto, setConfigAberto] = useState(false);
  const [queuesAberto, setQueuesAberto] = useState(false);
  const [pesquisaAberta, setPesquisaAberta] = useState(false);
  const [pesquisa, setPesquisa] = useState('');
  const [zoom, setZoom] = useState(ZOOM_MAXIMO);
  const [recado, setRecado] = useState<{ tom: 'sucesso' | 'erro'; texto: string } | null>(null);

  const [publicarAberto, setPublicarAberto] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [publicationError, publicationSetError] = useState<string | null>(null);
  /** Os erros que o 409 de publicar trouxe — além dos que a gravação já conhece. */
  const [motorErrors, motorSetErrors] = useState<BlockError[]>([]);

  const podePublicar = eu.permissions.includes('automacao.fluxo.publicar');

  const errors = juntarErrors(errorsLocal(state.mapa), editor.apiErrors, motorErrors);
  const tituloDe = (id: string | null): string =>
    id === null ? 'Fluxo' : (state.mapa[id]?.$title ?? id);

  /* A frase da `api` quando ela recusou a leitura: 409 do roteador, 403 sem
     permissão. Não é "não encontrado" — a rota-pai já cuidou do 404. */
  const readRecusa =
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
    /* O que se publica é o que está na tela: se ainda não foi gravado (mudança
       recente, ou o fluxo padrão de contato novo), grava primeiro — os dois
       passos que a cópia da Blip dá em sequência ao clicar em publicar. */
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
      motorSetErrors(r.errors);
      return;
    }
    motorSetErrors([]);
    setPublicarAberto(false);
    setRecado({
      tom: 'sucesso',
      texto: r.value.arquivada
        ? `Versão ${r.value.versao.versao} publicada; a ${r.value.arquivada.versao} saiu do ar.`
        : `Versão ${r.value.versao.versao} publicada.`,
    });
  }

  const nadaParaPublicar = data?.origem === 'publicada' && !state.sujo;
  /** O tooltip do botão de publicar enquanto ele está desligado. */
  function motivoDoPublicar(): string {
    if (!podePublicar) return 'você não tem a permissão de publicar fluxo';
    if (nadaParaPublicar) return `nada para publicar: a versão ${data?.versao?.versao ?? ''} já está no ar`;
    return readRecusa ?? 'carregando';
  }

  /** O "Salvo" do rodapé, com o que está por trás. */
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
      <ContactBarras ativo="Builder" />
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
          <div className="bl-aviso bl-aviso--erro" role="alert">
            <div className="bl-aviso-texto">
              <span>
                <Icone nome="alerta" tamanho={16} /> O motor recusaria este fluxo — {errors.length}{' '}
                {errors.length === 1 ? 'erro' : 'erros'} a corrigir antes de publicar:
              </span>
              <ul className="bl-erros">
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
          {readRecusa ? (
            <div className="bl-vazio">
              <Icone nome="alerta" tamanho={40} />
              <p>{readRecusa}</p>
            </div>
          ) : !editor.carregado ? (
            <div className="bl-vazio">
              <p>Carregando o desenho…</p>
            </div>
          ) : (
            <Editor
              state={state}
              despachar={despachar}
              apiErrors={editor.apiErrors}
              motorErrors={motorErrors}
              zoom={zoom}
              onZoom={setZoom}
              novoBlockAberto={novoBlockAberto}
              onFecharNovoBlock={() => setNovoBlockAberto(false)}
              panelExternoAberto={configAberto || queuesAberto}
              pesquisa={pesquisa}
            />
          )}

          {variablesAberto && editor.carregado ? (
            <VariablesPanel
              mapa={state.mapa}
              global={state.global}
              onFechar={() => setVariablesAberto(false)}
              onAviso={(texto) => setRecado({ tom: 'sucesso', texto })}
            />
          ) : null}

          {configAberto && editor.carregado ? (
            <ConfigurationPanel
              flowName={contact.nome}
              mapa={state.mapa}
              global={state.global}
              onMudarGlobal={(global) => despachar({ tipo: 'aplicarGlobais', global })}
              onImport={(mapa, global) => {
                // `aplicar`, não `carregar`: precisa marcar sujo pra gravar
                // sozinho (como qualquer outra mudança) e entrar no
                // desfazer — `carregar` é só pra sincronizar com o servidor,
                // e deixaria o fluxo importado só na tela, nunca salvo.
                despachar({ tipo: 'aplicar', mapa });
                despachar({ tipo: 'aplicarGlobais', global });
                setConfigAberto(false);
                setRecado({ tom: 'sucesso', texto: 'Fluxo importado.' });
              }}
              onFechar={() => setConfigAberto(false)}
            />
          ) : null}

          {queuesAberto ? (
            <QueuesPanel
              contactTipo={contact.tipo}
              contactId={contact.id}
              onFechar={() => setQueuesAberto(false)}
            />
          ) : null}

          {/* A pílula de ícones deles (`.builder-icon-button-list`), na ordem
              do DOM capturado: Adicionar bloco, Builder Assistant, Publicar
              fluxo, Configuração, Biblioteca de variáveis, Pesquisar,
              Gerenciamento de Filas — todos `bds-button-icon variant="secondary"
              size="short"`, com os tooltips literais. Builder Assistant cria
              tarefas com IA (`$ctrl.createCopilotModal()`); sem provedor de IA
              no motor do Pipe, fica desligado como os outros sem motor por trás. */}
          <div className="bl-barra">
            <BotaoDaBarra
              rotulo="Adicionar bloco"
              desabilitado={!editor.carregado}
              motivo={readRecusa ?? 'carregando'}
              ativo={novoBlockAberto}
              onClick={() => setNovoBlockAberto((v) => !v)}
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
              motivo={readRecusa ?? 'carregando'}
              ativo={configAberto}
              onClick={() => setConfigAberto((v) => !v)}
            >
              <IconePortal nome="painel" tamanho={24} />
            </BotaoDaBarra>
            <BotaoDaBarra
              rotulo="Biblioteca de variáveis"
              desabilitado={!editor.carregado}
              motivo={readRecusa ?? 'carregando'}
              ativo={variablesAberto}
              onClick={() => setVariablesAberto((v) => !v)}
            >
              <IconeManagement nome="biblioteca" tamanho={24} />
            </BotaoDaBarra>
            <BotaoDaBarra
              rotulo="Pesquisar"
              classe="bl-pesquisar"
              desabilitado={!editor.carregado}
              motivo={readRecusa ?? 'carregando'}
              ativo={pesquisaAberta}
              onClick={() => setPesquisaAberta((aberta) => !aberta)}
            >
              <IconePortal nome="busca" tamanho={24} />
            </BotaoDaBarra>
            <BotaoDaBarra
              rotulo="Gerenciamento de Filas"
              desabilitado={!editor.carregado}
              motivo={readRecusa ?? 'carregando'}
              ativo={queuesAberto}
              onClick={() => setQueuesAberto((v) => !v)}
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

          {/* O rodapé deles (`.builder-footer`): a pílula clara de status ("Salvo"
              com o `checkball`); os três botões de ícone soltos (Desfazer, Refazer,
              Tela Cheia) entre margens de 10px; o "100%" e o controle deslizante
              de 100px (20% a 100%). */}
          <div className="bl-rodape">
            <div className={`bl-status${recording.state === 'erro' ? ' bl-status--erro' : ''}`}>
              {data ? (
                <>
                  <IconeManagement
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
                <span>{readRecusa ? 'Indisponível' : 'Carregando…'}</span>
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
                <IconeManagement nome="desfazer" tamanho={24} />
              </button>
              <button
                type="button"
                className="bl-icone-botao bl-icone-botao--vivo"
                disabled={!podeRefazer(state)}
                title="Refazer (Ctrl+Shift+z)"
                aria-label="Refazer (Ctrl+Shift+z)"
                onClick={() => despachar({ tipo: 'refazer' })}
              >
                <IconeManagement nome="refazer" tamanho={24} />
              </button>
              <button
                type="button"
                className="bl-icone-botao bl-icone-botao--vivo"
                title="Tela Cheia (Alt+Enter)"
                aria-label="Tela Cheia (Alt+Enter)"
                onClick={telaCheia}
              >
                <IconeManagement nome="telaCheia" tamanho={24} />
              </button>
            </div>

            <div className="bl-zoom">
              <span className="bl-zoom-valor">{zoom}%</span>
              <div className="bl-zoom-trilho">
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
            className="bl-conversa"
            disabled
            title="Conversa — em breve"
            aria-label="Conversa"
          >
            <Icone nome="balao" tamanho={22} />
          </button>
        </div>
      </div>

      {/* Publicar: o `bds-modal` de confirmação, com a lista do motor quando
          ele recusa — nunca `window.confirm`. */}
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
                <ul className="bl-erros bl-erros--modal">
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
            <div className="cl-acoes">
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
