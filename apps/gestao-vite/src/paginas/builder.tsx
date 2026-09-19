import { useState, type ReactNode } from 'react';
import type { BuilderDoFluxo, ErroDoBloco, VersaoDoFluxo } from '@pipe/contracts';
import { Botao, Etiqueta, Icone } from '@pipe/ui';
import { IconeGestao } from '../componentes/icones-gestao';
import { useEu } from '../contexto/sessao';
import { ErroDaApi } from '../lib/api';
import { useLeitura } from '../lib/consulta';
import { Modal } from './cadastros/_modal';
import { BarrasDoContato, useContato } from './fluxo/contato';
import { publicarFluxo, restaurarVersao, salvarRascunho } from './builder-gravar';
import './builder.css';

/**
 * Builder — a MOLDURA do construtor de fluxo, agora com o ciclo de vida ligado.
 *
 * Não existe editor de fluxo aqui: o que esta tela reproduz é a disposição
 * real do Builder de produção (faixa de aviso, barra de blocos, canvas
 * escuro, rodapé com status/zoom, botão de conversa), medida no DOM
 * capturado em `docs/capturas/blip/builder/builder-fluxo__pagina.html` — ver
 * o de-para completo em `builder.css`. O que existe por trás é o que a `api`
 * já sabe fazer por fluxo (`/v1/gestao/fluxos/:id/builder`):
 *
 * - o canvas desenha os BLOCOS do desenho carregado (rascunho, senão a
 *   versão publicada, senão o fluxo padrão), na posição em que o editor da
 *   Blip os deixou, só para leitura — arrastar, ligar e editar continua fora;
 * - "Salvar rascunho" grava o desenho carregado como rascunho do fluxo (é o
 *   que transforma o fluxo padrão de um contato novo em algo publicável);
 * - "Publicar fluxo" promove o rascunho a versão publicada — com os erros que
 *   o motor apontaria listados bloco a bloco, e sem publicar enquanto houver
 *   algum;
 * - o histórico lista as versões e restaura uma antiga como rascunho.
 *
 * Todo controle de chrome que não tem nada por trás continua `disabled`, de
 * propósito, porque fingir que funciona é pior do que admitir que a tela
 * ainda é só a casca. Confirmações passam pelo `Modal` de `cadastros/_modal`,
 * nunca por `window.confirm`.
 *
 * Rota: `/fluxo/:id/builder` — DENTRO do contato, como na origem
 * (`/application/detail/<bot>/templates/builder`). Builder é escondido do
 * menu para roteador (`ESCONDIDOS_NO_ROTEADOR` em `fluxo/itens.ts`), e a `api`
 * responde 409 se alguém chegar pela URL — a tela mostra a frase dela.
 *
 * A moldura é `BarrasDoContato` (barra do portal + barra do contato, com
 * "Builder" aceso) e NADA mais — sem o `fx-coluna` de `CascaDoModulo`: o
 * Builder é TELA CHEIA, como o construtor de fluxo real.
 */

/** Um estado do editor da Blip, no que a tela lê dele. */
interface BlocoDoEditor {
  id: string;
  root?: boolean;
  $title?: string;
  $position?: { top?: string; left?: string };
  $contentActions?: { action?: { settings?: { type?: string; content?: unknown } }; input?: unknown }[];
}

/** O primeiro texto que o bloco manda, para a legenda do cartão. */
function falaDoBloco(bloco: BlocoDoEditor): string | null {
  for (const item of bloco.$contentActions ?? []) {
    const s = item.action?.settings;
    if (s?.type === 'text/plain' && typeof s.content === 'string') return s.content;
  }
  return null;
}

const px = (valor: string | undefined, padrao: number): number => {
  const n = Number.parseFloat(valor ?? '');
  return Number.isFinite(n) ? n : padrao;
};

/**
 * Um botão da pílula lateral: `bds-button-icon variant="secondary"
 * size="short"` com o tooltip à direita. Desabilitado por padrão — o
 * editor não existe, e o título diz isso junto com o nome do controle.
 */
function BotaoDaBarra({
  rotulo,
  classe,
  onClick,
  desabilitado = true,
  motivo,
  children,
}: {
  rotulo: string;
  classe?: string;
  onClick?: () => void;
  desabilitado?: boolean;
  /** O que dizer no tooltip quando está desligado — sem ele, "ainda não construído". */
  motivo?: string;
  children: ReactNode;
}) {
  const classes = ['bl-icone-botao'];
  if (classe) classes.push(classe);
  if (!desabilitado) classes.push('bl-icone-botao--vivo');
  return (
    <button
      type="button"
      className={classes.join(' ')}
      disabled={desabilitado}
      onClick={onClick}
      title={desabilitado ? `${rotulo} — ${motivo ?? 'ainda não construído'}` : rotulo}
      aria-label={rotulo}
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

  const [avisoAberto, setAvisoAberto] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [recado, setRecado] = useState<{ tom: 'sucesso' | 'erro'; texto: string } | null>(null);

  const [publicarAberto, setPublicarAberto] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [erroDePublicacao, setErroDePublicacao] = useState<string | null>(null);
  /** Os erros que o 409 de publicar trouxe — além dos que a leitura já conhece. */
  const [errosDoMotor, setErrosDoMotor] = useState<ErroDoBloco[]>([]);

  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [restaurando, setRestaurando] = useState<number | null>(null);
  const [confirmandoRestauro, setConfirmandoRestauro] = useState<VersaoDoFluxo | null>(null);
  const [erroDoHistorico, setErroDoHistorico] = useState<string | null>(null);
  const versoes = useLeitura<VersaoDoFluxo[]>(historicoAberto ? `${caminho}/versoes` : null);

  const dados = leitura.data ?? null;
  const podePublicar = eu.permissoes.includes('automacao.fluxo.publicar');

  const erros: ErroDoBloco[] = [...(dados?.erros ?? [])];
  for (const e of errosDoMotor) {
    if (!erros.some((x) => x.bloco === e.bloco && x.mensagem === e.mensagem)) erros.push(e);
  }
  const blocos = Object.values(dados?.desenho.fluxo ?? {}) as BlocoDoEditor[];
  const tituloDe = (id: string | null): string =>
    id === null ? 'Fluxo' : (blocos.find((b) => b.id === id)?.$title ?? id);

  /* A frase da `api` quando ela recusou a leitura: 409 do roteador, 403 sem
     permissão. Não é "não encontrado" — a rota-pai já cuidou do 404. */
  const recusaDaLeitura =
    leitura.error instanceof ErroDaApi
      ? ((leitura.error.corpo as { erro?: { mensagem?: string } } | null)?.erro?.mensagem ??
        leitura.error.message)
      : leitura.error?.message;

  async function salvar(): Promise<void> {
    if (!dados || salvando) return;
    setSalvando(true);
    setRecado(null);
    const r = await salvarRascunho(contato.id, dados.desenho);
    setSalvando(false);
    setRecado(
      r.ok
        ? {
            tom: 'sucesso',
            texto:
              r.valor.erros.length > 0
                ? `Rascunho v${r.valor.versao.versao} salvo, com ${r.valor.erros.length} erro(s) a corrigir antes de publicar.`
                : `Rascunho v${r.valor.versao.versao} salvo.`,
          }
        : { tom: 'erro', texto: r.erro },
    );
  }

  function abrirPublicar(): void {
    setErroDePublicacao(null);
    setPublicarAberto(true);
  }

  async function publicar(): Promise<void> {
    if (!dados || publicando) return;
    setPublicando(true);
    setErroDePublicacao(null);
    /* Sem rascunho (fluxo padrão de contato novo), o que se publica é o desenho
       carregado: ele vira rascunho e o rascunho vira versão — os dois passos que
       a cópia da Blip dá em sequência ao clicar em publicar. */
    if (dados.origem !== 'rascunho') {
      const s = await salvarRascunho(contato.id, dados.desenho);
      if (!s.ok) {
        setPublicando(false);
        setErroDePublicacao(s.erro);
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
    setConfirmandoRestauro(null);
    setHistoricoAberto(false);
    setErrosDoMotor([]);
    setRecado({
      tom: 'sucesso',
      texto: `Versão ${versao.versao} restaurada como rascunho v${r.valor.versao.versao}.`,
    });
  }

  const nadaParaPublicar = dados?.origem === 'publicada';
  /** O tooltip do botão de publicar enquanto ele está desligado. */
  function motivoDoPublicar(): string {
    if (!podePublicar) return 'você não tem a permissão de publicar fluxo';
    if (nadaParaPublicar) return `nada para publicar: a versão ${dados?.versao?.versao ?? ''} já está no ar`;
    return recusaDaLeitura ?? 'carregando';
  }

  return (
    <div className="pt-app">
      <BarrasDoContato ativo="Builder" />
      <div className="bl-tela">
        {avisoAberto ? (
          <div className="bl-aviso">
            <div className="bl-aviso-texto">
              <span>
                O Builder ainda não tem editor de fluxo — a tela mostra os blocos do desenho, salva o
                rascunho e publica; desenhar continua na cópia da Blip.{' '}
                <details>
                  <summary>Saiba mais</summary>
                  <p className="bl-aviso-nota">
                    Cada fluxo tem um rascunho e uma versão publicada. Salvar grava por cima do
                    rascunho; publicar promove o rascunho a uma versão nova e arquiva a anterior —
                    as conversas que já estavam com o robô continuam apontando para a versão que
                    as atendeu. O motor só roda a versão publicada, e só de fluxo ligado a um
                    canal (<b>Canais</b>).
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
              <Icone nome="x" tamanho={16} />
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
                {erros.map((e) => (
                  <li key={`${e.bloco ?? ''}:${e.mensagem}`}>
                    <b>{tituloDe(e.bloco)}</b>: {e.mensagem}
                  </li>
                ))}
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
          ) : !dados ? (
            <div className="bl-vazio">
              <p>Carregando o desenho…</p>
            </div>
          ) : blocos.length === 0 ? (
            <div className="bl-vazio">
              <Icone nome="grade" tamanho={40} />
              <p>Nenhum bloco neste desenho.</p>
            </div>
          ) : (
            <div className="bl-blocos" aria-label="Blocos do fluxo">
              {blocos.map((bloco) => {
                const errosDoBloco = erros.filter((e) => e.bloco === bloco.id);
                const fala = falaDoBloco(bloco);
                const espera = (bloco.$contentActions ?? []).some((c) => c.input);
                const classes = ['bl-bloco'];
                if (bloco.root) classes.push('bl-bloco--inicio');
                if (bloco.id.startsWith('desk:')) classes.push('bl-bloco--atendimento');
                if (errosDoBloco.length > 0) classes.push('bl-bloco--erro');
                return (
                  <article
                    key={bloco.id}
                    className={classes.join(' ')}
                    style={{ top: px(bloco.$position?.top, 40), left: px(bloco.$position?.left, 40) }}
                    title={errosDoBloco.map((e) => e.mensagem).join('\n') || undefined}
                  >
                    <header>
                      <span>{bloco.$title ?? bloco.id}</span>
                      {errosDoBloco.length > 0 ? (
                        <Etiqueta tom="erro" redonda>
                          {errosDoBloco.length}
                        </Etiqueta>
                      ) : null}
                    </header>
                    {fala ? <p className="bl-bloco-fala">{fala}</p> : null}
                    {espera ? <p className="bl-bloco-espera">aguarda a mensagem do cliente</p> : null}
                  </article>
                );
              })}
            </div>
          )}

          {/* A pílula de ícones deles (`.builder-icon-button-list`), na ordem
              do DOM: Adicionar bloco, Publicar fluxo, Configuração, Biblioteca
              de variáveis, Pesquisar, Gerenciamento de Filas — todos
              `bds-button-icon variant="secondary" size="short"`, com os
              tooltips literais. "Builder Assistant" está `ng-hide` lá e não
              entra aqui. Só "Publicar fluxo" tem algo por trás. */}
          <div className="bl-barra">
            <BotaoDaBarra rotulo="Adicionar bloco">
              <Icone nome="mais" tamanho={24} />
            </BotaoDaBarra>
            <BotaoDaBarra
              rotulo="Publicar fluxo"
              desabilitado={!dados || !podePublicar || nadaParaPublicar}
              motivo={motivoDoPublicar()}
              onClick={abrirPublicar}
            >
              <IconeGestao nome="publicar" tamanho={24} />
            </BotaoDaBarra>
            <BotaoDaBarra rotulo="Configuração">
              <Icone nome="engrenagem" tamanho={24} />
            </BotaoDaBarra>
            <BotaoDaBarra rotulo="Biblioteca de variáveis">
              <IconeGestao nome="biblioteca" tamanho={24} />
            </BotaoDaBarra>
            <BotaoDaBarra rotulo="Pesquisar" classe="bl-pesquisar">
              <Icone nome="busca" tamanho={24} />
            </BotaoDaBarra>
            <BotaoDaBarra rotulo="Gerenciamento de Filas">
              <IconeGestao nome="atendente" tamanho={24} />
            </BotaoDaBarra>
          </div>

          {/* O rodapé deles (`.builder-footer`): a pílula clara de status (lá
              "Salvo" com o `checkball`; aqui o que está carregado e o salvar);
              os três botões de ícone soltos (Desfazer, Refazer, Tela Cheia)
              entre margens de 10px; o "100%" e o controle deslizante de 100px. */}
          <div className="bl-rodape">
            <div className="bl-status">
              {dados ? (
                <>
                  <IconeGestao nome="circuloOk" tamanho={24} />
                  <span>
                    {ROTULO_DA_ORIGEM[dados.origem]}
                    {dados.versao ? ` v${dados.versao.versao}` : ''}
                    {dados.publicada && dados.origem !== 'publicada'
                      ? ` · no ar: v${dados.publicada.versao}`
                      : ''}
                  </span>
                  {dados.origem !== 'rascunho' ? (
                    <Botao type="button" onClick={() => void salvar()} disabled={salvando}>
                      {salvando ? 'Salvando…' : 'Salvar rascunho'}
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
                className="bl-icone-botao"
                disabled
                title="Desfazer (Ctrl+z)"
                aria-label="Desfazer (Ctrl+z)"
              >
                <IconeGestao nome="desfazer" tamanho={24} />
              </button>
              <button
                type="button"
                className="bl-icone-botao"
                disabled
                title="Refazer (Ctrl+Shift+z)"
                aria-label="Refazer (Ctrl+Shift+z)"
              >
                <IconeGestao nome="refazer" tamanho={24} />
              </button>
              <button
                type="button"
                className="bl-icone-botao"
                disabled
                title="Tela Cheia (Alt+Enter)"
                aria-label="Tela Cheia (Alt+Enter)"
              >
                <IconeGestao nome="telaCheia" tamanho={24} />
              </button>
            </div>

            <div className="bl-zoom">
              <span className="bl-zoom-valor">100%</span>
              <div className="bl-zoom-trilho">
                <div className="bl-zoom-preenchido" />
                <span className="bl-zoom-ponteiro" />
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
                ? 'O fluxo padrão será salvo como rascunho e publicado como versão 1. '
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
          <p className="sub">Nenhuma versão gravada ainda — salve o rascunho primeiro.</p>
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
              {dados?.origem === 'rascunho'
                ? `O rascunho v${dados.versao?.versao ?? ''} atual será substituído.`
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
