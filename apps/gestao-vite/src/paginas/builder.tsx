import { useState, type ReactNode } from 'react';
import type { BuilderDoFluxo, ErroDoBloco, VersaoDoFluxo } from '@pipe/contracts';
import { Botao, Etiqueta, Icone } from '@pipe/ui';
import { IconeGestao } from '../componentes/icones-gestao';
import { IconePortal } from '../componentes/icones-portal';
import { useEu } from '../contexto/sessao';
import { ErroDaApi } from '../lib/api';
import { useLeitura } from '../lib/consulta';
import { Modal } from './cadastros/_modal';
import { BarrasDoContato, useContato } from './fluxo/contato';
import { publicarFluxo, restaurarVersao } from './builder-gravar';
import { Editor } from './builder/editor';
import { podeDesfazer, podeRefazer } from './builder/estado';
import { PainelDeConfiguracao } from './builder/painel-configuracao';
import { PainelDeFilas } from './builder/painel-filas';
import { PainelDeVariaveis } from './builder/painel-variaveis';
import { ZOOM_MAXIMO, ZOOM_MINIMO, zoomAjustado } from './builder/setas';
import { useEditorDoBuilder } from './builder/use-editor';
import { errosLocais, juntarErros } from './builder/validacao';
import './builder.css';

/**
 * Builder — o construtor de fluxo, na disposição real do Builder de produção
 * (faixa de aviso, pílula de blocos, canvas escuro, rodapé com status/zoom,
 * botão de conversa), medida no DOM capturado em
 * `docs/capturas/blip/builder/builder-fluxo__pagina.html` — ver o de-para em
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

const TOM_DO_ESTADO = { rascunho: 'info', publicada: 'sucesso', arquivada: 'neutro' } as const;

function quando(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function PaginaBuilder() {
  const { contato } = useContato();
  const eu = useEu();
  const caminho = `/v1/gestao/fluxos/${contato.id}/builder`;
  const leitura = useLeitura<BuilderDoFluxo>(caminho);
  const dados = leitura.data ?? null;

  const editor = useEditorDoBuilder(contato.id, dados);
  const { estado, despachar, gravacao } = editor;

  const [avisoAberto, setAvisoAberto] = useState(true);
  const [novoBlocoAberto, setNovoBlocoAberto] = useState(false);
  const [variaveisAberto, setVariaveisAberto] = useState(false);
  const [configAberto, setConfigAberto] = useState(false);
  const [filasAberto, setFilasAberto] = useState(false);
  const [zoom, setZoom] = useState(ZOOM_MAXIMO);
  const [recado, setRecado] = useState<{ tom: 'sucesso' | 'erro'; texto: string } | null>(null);

  const [publicarAberto, setPublicarAberto] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [erroDePublicacao, setErroDePublicacao] = useState<string | null>(null);
  /** Os erros que o 409 de publicar trouxe — além dos que a gravação já conhece. */
  const [errosDoMotor, setErrosDoMotor] = useState<ErroDoBloco[]>([]);

  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [restaurando, setRestaurando] = useState<number | null>(null);
  const [confirmandoRestauro, setConfirmandoRestauro] = useState<VersaoDoFluxo | null>(null);
  const [erroDoHistorico, setErroDoHistorico] = useState<string | null>(null);
  const versoes = useLeitura<VersaoDoFluxo[]>(historicoAberto ? `${caminho}/versoes` : null);

  const podePublicar = eu.permissoes.includes('automacao.fluxo.publicar');

  const erros = juntarErros(errosLocais(estado.mapa), editor.errosDaApi, errosDoMotor);
  const tituloDe = (id: string | null): string =>
    id === null ? 'Fluxo' : (estado.mapa[id]?.$title ?? id);

  /* A frase da `api` quando ela recusou a leitura: 409 do roteador, 403 sem
     permissão. Não é "não encontrado" — a rota-pai já cuidou do 404. */
  const recusaDaLeitura =
    leitura.error instanceof ErroDaApi
      ? ((leitura.error.corpo as { erro?: { mensagem?: string } } | null)?.erro?.mensagem ??
        leitura.error.message)
      : leitura.error?.message;

  function abrirPublicar(): void {
    setErroDePublicacao(null);
    setPublicarAberto(true);
  }

  async function publicar(): Promise<void> {
    if (!dados || publicando) return;
    setPublicando(true);
    setErroDePublicacao(null);
    /* O que se publica é o que está na tela: se ainda não foi gravado (mudança
       recente, ou o fluxo padrão de contato novo), grava primeiro — os dois
       passos que a cópia da Blip dá em sequência ao clicar em publicar. */
    if (estado.sujo || dados.origem !== 'rascunho') {
      const gravou = await editor.salvarAgora();
      if (!gravou) {
        setPublicando(false);
        setErroDePublicacao('Não foi possível salvar o rascunho antes de publicar.');
        return;
      }
    }
    const r = await publicarFluxo(contato.id);
    setPublicando(false);
    if (!r.ok) {
      setErroDePublicacao(r.erro);
      setErrosDoMotor(r.erros);
      return;
    }
    setErrosDoMotor([]);
    setPublicarAberto(false);
    setRecado({
      tom: 'sucesso',
      texto: r.valor.arquivada
        ? `Versão ${r.valor.versao.versao} publicada; a ${r.valor.arquivada.versao} saiu do ar.`
        : `Versão ${r.valor.versao.versao} publicada.`,
    });
  }

  async function restaurar(versao: VersaoDoFluxo): Promise<void> {
    if (restaurando !== null) return;
    setRestaurando(versao.versao);
    setErroDoHistorico(null);
    const r = await restaurarVersao(contato.id, versao.versao);
    setRestaurando(null);
    if (!r.ok) {
      setErroDoHistorico(r.erro);
      return;
    }
    editor.recarregarQuando(r.valor.versao.id, r.valor.versao.atualizadoEm);
    setConfirmandoRestauro(null);
    setHistoricoAberto(false);
    setErrosDoMotor([]);
    setRecado({
      tom: 'sucesso',
      texto: `Versão ${versao.versao} restaurada como rascunho v${r.valor.versao.versao}.`,
    });
  }

  const nadaParaPublicar = dados?.origem === 'publicada' && !estado.sujo;
  /** O tooltip do botão de publicar enquanto ele está desligado. */
  function motivoDoPublicar(): string {
    if (!podePublicar) return 'você não tem a permissão de publicar fluxo';
    if (nadaParaPublicar) return `nada para publicar: a versão ${dados?.versao?.versao ?? ''} já está no ar`;
    return recusaDaLeitura ?? 'carregando';
  }

  /** O "Salvo" do rodapé, com o que está por trás. */
  function statusDaGravacao(): { icone: 'circuloOk' | 'atualizar' | 'alerta'; texto: string } {
    switch (gravacao.estado) {
      case 'salvando':
        return { icone: 'atualizar', texto: 'Salvando…' };
      case 'pendente':
        return { icone: 'atualizar', texto: 'Alterações não salvas' };
      case 'erro':
        return { icone: 'alerta', texto: gravacao.erro };
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

  const status = statusDaGravacao();
  const blocos = Object.keys(estado.mapa).length;

  return (
    <div className="pt-app">
      <BarrasDoContato ativo="Builder" />
      <div className="bl-tela">
        {avisoAberto ? (
          <div className="bl-aviso">
            <div className="bl-aviso-texto">
              <span>
                O que você desenha aqui é gravado como rascunho sozinho; só "Publicar fluxo" põe a versão
                no ar.{' '}
                <details>
                  <summary>Saiba mais</summary>
                  <p className="bl-aviso-nota">
                    Cada fluxo tem um rascunho e uma versão publicada. Cada mudança grava por cima do
                    rascunho; publicar promove o rascunho a uma versão nova e arquiva a anterior —
                    as conversas que já estavam com o robô continuam apontando para a versão que
                    as atendeu. O motor só roda a versão publicada, e só de fluxo ligado a um
                    canal (<b>Canais</b>). O motor do Pipe envia texto, menu e quick reply, e
                    executa definir/excluir variável, registrar evento, redirecionar a serviço e o
                    bloco de atendimento humano — o resto do editor da Blip fica de fora.
                  </p>
                </details>
              </span>
            </div>
            <button
              type="button"
              className="bl-aviso-fechar"
              aria-label="Fechar aviso"
              onClick={() => setAvisoAberto(false)}
            >
              <IconePortal nome="fechar" tamanho={16} />
            </button>
          </div>
        ) : null}

        {erros.length > 0 ? (
          <div className="bl-aviso bl-aviso--erro" role="alert">
            <div className="bl-aviso-texto">
              <span>
                <Icone nome="alerta" tamanho={16} /> O motor recusaria este fluxo — {erros.length}{' '}
                {erros.length === 1 ? 'erro' : 'erros'} a corrigir antes de publicar:
              </span>
              <ul className="bl-erros">
                {erros.slice(0, 6).map((e) => (
                  <li key={`${e.bloco ?? ''}:${e.mensagem}`}>
                    <b>{tituloDe(e.bloco)}</b>: {e.mensagem}
                  </li>
                ))}
                {erros.length > 6 ? <li>… e mais {erros.length - 6}.</li> : null}
              </ul>
            </div>
          </div>
        ) : null}

        <div className="bl-corpo">
          {recusaDaLeitura ? (
            <div className="bl-vazio">
              <Icone nome="alerta" tamanho={40} />
              <p>{recusaDaLeitura}</p>
            </div>
          ) : !editor.carregado ? (
            <div className="bl-vazio">
              <p>Carregando o desenho…</p>
            </div>
          ) : (
            <Editor
              estado={estado}
              despachar={despachar}
              errosDaApi={editor.errosDaApi}
              errosDoMotor={errosDoMotor}
              zoom={zoom}
              onZoom={setZoom}
              novoBlocoAberto={novoBlocoAberto}
              onFecharNovoBloco={() => setNovoBlocoAberto(false)}
              painelExternoAberto={configAberto || filasAberto}
            />
          )}

          {variaveisAberto && editor.carregado ? (
            <PainelDeVariaveis
              mapa={estado.mapa}
              globais={estado.globais}
              onFechar={() => setVariaveisAberto(false)}
              onAviso={(texto) => setRecado({ tom: 'sucesso', texto })}
            />
          ) : null}

          {configAberto && editor.carregado ? (
            <PainelDeConfiguracao
              nomeDoFluxo={contato.nome}
              mapa={estado.mapa}
              globais={estado.globais}
              onMudarGlobais={(globais) => despachar({ tipo: 'aplicarGlobais', globais })}
              onImportar={(mapa, globais) => {
                // `aplicar`, não `carregar`: precisa marcar sujo pra gravar
                // sozinho (como qualquer outra mudança) e entrar no
                // desfazer — `carregar` é só pra sincronizar com o servidor,
                // e deixaria o fluxo importado só na tela, nunca salvo.
                despachar({ tipo: 'aplicar', mapa });
                despachar({ tipo: 'aplicarGlobais', globais });
                setConfigAberto(false);
                setRecado({ tom: 'sucesso', texto: 'Fluxo importado.' });
              }}
              onFechar={() => setConfigAberto(false)}
            />
          ) : null}

          {filasAberto ? (
            <PainelDeFilas
              tipoDoContato={contato.tipo}
              contatoId={contato.id}
              onFechar={() => setFilasAberto(false)}
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
              motivo={recusaDaLeitura ?? 'carregando'}
              ativo={novoBlocoAberto}
              onClick={() => setNovoBlocoAberto((v) => !v)}
            >
              <Icone nome="mais" tamanho={24} />
            </BotaoDaBarra>
            <BotaoDaBarra rotulo="Builder Assistant">
              <IconePortal nome="robo" tamanho={24} />
            </BotaoDaBarra>
            <BotaoDaBarra
              rotulo="Publicar fluxo"
              desabilitado={!dados || !podePublicar || nadaParaPublicar}
              motivo={motivoDoPublicar()}
              onClick={abrirPublicar}
            >
              <IconePortal nome="aprender" tamanho={24} />
            </BotaoDaBarra>
            <BotaoDaBarra
              rotulo="Configuração"
              desabilitado={!editor.carregado}
              motivo={recusaDaLeitura ?? 'carregando'}
              ativo={configAberto}
              onClick={() => setConfigAberto((v) => !v)}
            >
              <IconePortal nome="painel" tamanho={24} />
            </BotaoDaBarra>
            <BotaoDaBarra
              rotulo="Biblioteca de variáveis"
              desabilitado={!editor.carregado}
              motivo={recusaDaLeitura ?? 'carregando'}
              ativo={variaveisAberto}
              onClick={() => setVariaveisAberto((v) => !v)}
            >
              <IconeGestao nome="biblioteca" tamanho={24} />
            </BotaoDaBarra>
            <BotaoDaBarra rotulo="Pesquisar" classe="bl-pesquisar">
              <IconePortal nome="busca" tamanho={24} />
            </BotaoDaBarra>
            <BotaoDaBarra
              rotulo="Gerenciamento de Filas"
              desabilitado={!editor.carregado}
              motivo={recusaDaLeitura ?? 'carregando'}
              ativo={filasAberto}
              onClick={() => setFilasAberto((v) => !v)}
            >
              <IconePortal nome="suporte" tamanho={24} />
            </BotaoDaBarra>
          </div>

          {/* O rodapé deles (`.builder-footer`): a pílula clara de status ("Salvo"
              com o `checkball`); os três botões de ícone soltos (Desfazer, Refazer,
              Tela Cheia) entre margens de 10px; o "100%" e o controle deslizante
              de 100px (20% a 100%). */}
          <div className="bl-rodape">
            <div className={`bl-status${gravacao.estado === 'erro' ? ' bl-status--erro' : ''}`}>
              {dados ? (
                <>
                  <IconeGestao
                    nome={status.icone === 'alerta' ? 'informacao' : status.icone}
                    tamanho={24}
                    className={gravacao.estado === 'salvando' ? 'bl-girando' : undefined}
                  />
                  <span title={`${ROTULO_DA_ORIGEM[dados.origem]}${dados.versao ? ` v${dados.versao.versao}` : ''}${dados.publicada && dados.origem !== 'publicada' ? ` · no ar: v${dados.publicada.versao}` : ''} · ${blocos} ${blocos === 1 ? 'bloco' : 'blocos'}`}>
                    {status.texto}
                  </span>
                  {gravacao.estado === 'erro' ? (
                    <Botao type="button" onClick={() => void editor.salvarAgora()}>
                      Tentar de novo
                    </Botao>
                  ) : null}
                  <Botao
                    type="button"
                    icone="historico"
                    onClick={() => {
                      setErroDoHistorico(null);
                      setConfirmandoRestauro(null);
                      setHistoricoAberto(true);
                    }}
                  >
                    Histórico
                  </Botao>
                </>
              ) : (
                <span>{recusaDaLeitura ? 'Indisponível' : 'Carregando…'}</span>
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
                disabled={!podeDesfazer(estado)}
                title="Desfazer (Ctrl+z)"
                aria-label="Desfazer (Ctrl+z)"
                onClick={() => despachar({ tipo: 'desfazer' })}
              >
                <IconeGestao nome="desfazer" tamanho={24} />
              </button>
              <button
                type="button"
                className="bl-icone-botao bl-icone-botao--vivo"
                disabled={!podeRefazer(estado)}
                title="Refazer (Ctrl+Shift+z)"
                aria-label="Refazer (Ctrl+Shift+z)"
                onClick={() => despachar({ tipo: 'refazer' })}
              >
                <IconeGestao nome="refazer" tamanho={24} />
              </button>
              <button
                type="button"
                className="bl-icone-botao bl-icone-botao--vivo"
                title="Tela Cheia (Alt+Enter)"
                aria-label="Tela Cheia (Alt+Enter)"
                onClick={telaCheia}
              >
                <IconeGestao nome="telaCheia" tamanho={24} />
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
        {dados ? (
          <>
            <p className="sub">
              {dados.origem === 'padrao'
                ? 'O desenho será salvo como rascunho e publicado como versão 1. '
                : estado.sujo
                  ? 'O que está na tela é gravado no rascunho e vira a versão publicada. '
                  : `O rascunho v${dados.versao?.versao ?? ''} vira a versão publicada. `}
              {dados.publicada
                ? `A versão ${dados.publicada.versao}, que está no ar, é arquivada — as conversas que já estavam com o robô continuam nela até a próxima mensagem.`
                : 'A partir daí, o canal ligado a este fluxo passa a responder com ele.'}
            </p>
            {erros.length > 0 ? (
              <>
                <Etiqueta tom="erro">
                  O motor recusaria este fluxo. Corrija antes de publicar:
                </Etiqueta>
                <ul className="bl-erros bl-erros--modal">
                  {erros.map((e) => (
                    <li key={`${e.bloco ?? ''}:${e.mensagem}`}>
                      <b>{tituloDe(e.bloco)}</b>: {e.mensagem}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {Object.keys(dados.naoSuportado).length > 0 ? (
              <p className="sub">
                Ações que o motor do Pipe ainda não executa (a conversa cai na fila quando chegar
                nelas): {Object.keys(dados.naoSuportado).join(', ')}.
              </p>
            ) : null}
            {erroDePublicacao ? <Etiqueta tom="erro">{erroDePublicacao}</Etiqueta> : null}
            <div className="cl-acoes">
              <Botao type="button" onClick={() => setPublicarAberto(false)} disabled={publicando}>
                Cancelar
              </Botao>
              <Botao
                type="button"
                variante="primario"
                onClick={() => void publicar()}
                disabled={publicando || erros.length > 0}
              >
                {publicando ? 'Publicando…' : 'Publicar'}
              </Botao>
            </div>
          </>
        ) : null}
      </Modal>

      {/* Histórico: as versões do fluxo, com "Restaurar" para trazer uma antiga
          de volta como rascunho — a publicada continua no ar até publicar de novo. */}
      <Modal
        aberto={historicoAberto}
        titulo="Histórico de versões"
        onFechar={() => setHistoricoAberto(false)}
      >
        {versoes.error ? (
          <Etiqueta tom="erro">{versoes.error.message}</Etiqueta>
        ) : !versoes.data ? (
          <p className="sub">Carregando…</p>
        ) : versoes.data.length === 0 ? (
          <p className="sub">Nenhuma versão gravada ainda — mexa no desenho para o rascunho existir.</p>
        ) : (
          <ul className="bl-versoes">
            {versoes.data.map((v) => (
              <li key={v.id}>
                <div className="bl-versao-titulo">
                  <b>v{v.versao}</b>
                  <Etiqueta tom={TOM_DO_ESTADO[v.estado]}>{v.estado}</Etiqueta>
                  <span className="sub">
                    {v.blocos} {v.blocos === 1 ? 'bloco' : 'blocos'}
                  </span>
                </div>
                <div className="sub">
                  {v.estado === 'rascunho'
                    ? `atualizado em ${quando(v.atualizadoEm)}`
                    : `publicada em ${quando(v.publicadaEm)}${v.publicadaPor ? ` por ${v.publicadaPor}` : ''}`}
                </div>
                {v.estado !== 'rascunho' ? (
                  <Botao
                    type="button"
                    onClick={() => setConfirmandoRestauro(v)}
                    disabled={restaurando !== null}
                  >
                    Restaurar
                  </Botao>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {confirmandoRestauro ? (
          <div className="bl-restauro">
            <p className="sub">
              Restaurar a versão {confirmandoRestauro.versao} como rascunho?{' '}
              {dados?.origem === 'rascunho' || estado.sujo
                ? `O rascunho atual${dados?.versao ? ` (v${dados.versao.versao})` : ''} e o que está na tela serão substituídos.`
                : 'Ela não volta ao ar sozinha: revise e publique.'}
            </p>
            {erroDoHistorico ? <Etiqueta tom="erro">{erroDoHistorico}</Etiqueta> : null}
            <div className="cl-acoes">
              <Botao
                type="button"
                onClick={() => setConfirmandoRestauro(null)}
                disabled={restaurando !== null}
              >
                Cancelar
              </Botao>
              <Botao
                type="button"
                variante="primario"
                onClick={() => void restaurar(confirmandoRestauro)}
                disabled={restaurando !== null}
              >
                {restaurando !== null ? 'Restaurando…' : 'Restaurar'}
              </Botao>
            </div>
          </div>
        ) : erroDoHistorico ? (
          <Etiqueta tom="erro">{erroDoHistorico}</Etiqueta>
        ) : null}
      </Modal>
    </div>
  );
}
