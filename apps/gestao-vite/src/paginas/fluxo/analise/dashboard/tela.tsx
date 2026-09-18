import type { ReactNode } from 'react';
import { IconePortal, type NomeDeIconePortal } from '../../../../componentes/icones-portal';
import {
  PERIODOS_DE_CALENDARIO,
  PERIODOS_FIXOS,
  ROTULO_DO_PERIODO,
  comparacao,
  diaCurto,
  escalaDoEixo,
  formatar,
  rotuloDoIntervalo,
  variacao,
  type DadosDoDashboard,
  type Intervalo,
  type Periodo,
} from '@pipe/core/analise';
import { PeriodoPersonalizado } from './periodo-personalizado';

/**
 * O miolo do Dashboard — o `iN` do `portal-fragment-analytics`
 * (`analytics-main.js`, linha ~59539), que o portal monta com
 * `<analytics-mfe page="dashboard">`.
 *
 * Só recebe props: é o que deixa desenhar o estado preenchido sem banco. A
 * ordem das seções é a do `iN`, com as flags do roteador de teste (LaunchDarkly):
 * Contatos · Recorrência (`is-displaying-recurrence-section`) · Mensagens ·
 * Canais (`is-displaying-dashboard-analytics-channel-section`) · Fluxo
 * conversacional (`is-displaying-conversational-flow-section`) · Lista de blocos
 * (`is-displaying-block-listing-section`). O botão "Download" do topo está
 * DESLIGADO lá (`is-displaying-analytics-dashboard-download-button` = false), e
 * por isso não existe aqui.
 *
 * Os gráficos da origem são chart.js; aqui são SVG + CSS, o mínimo que refaz o
 * desenho (`GraficoDeLinhas`, `BarrasDeParticipacao`), sem dependência nova.
 */

export interface PropsDoDashboard {
  id: string;
  periodo: Periodo;
  intervalo: Intervalo;
  hoje: string;
  dados: DadosDoDashboard;
  /** A barra lateral aberta (`isDisplayingContactsSidebar`), com a lista já lida. */
  lista: { tipo: 'interacao' | 'rejeicao'; nomes: string[] } | null;
}

/** O que a URL carrega entre um clique e outro: o período. */
function consulta(p: PropsDoDashboard, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({ periodo: p.periodo });
  if (p.periodo === 'custom') {
    q.set('de', p.intervalo.inicio);
    q.set('ate', p.intervalo.fim);
  }
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  return `?${q.toString()}`;
}

export function TelaDoDashboard(p: PropsDoDashboard) {
  const { dica, foraDoAlcance } = comparacao(p.intervalo, p.hoje);
  const cmp: Comparacao = { dica, fora: foraDoAlcance };
  return (
    /* `eN` + `.dashboard-container`: largura cheia e 55px em cima. */
    <div className="da-raiz">
      <FiltroDoPeriodo {...p} />

      {/* `tN`: min 1024, max 1377, 85% da largura, 30px em cima e embaixo. */}
      <div className="da-miolo">
        {/* `nN`: título à esquerda, `aN` (botões, gap 12) à direita. */}
        <div className="da-cabecalho">
          <div>
            <h1 className="da-t32 da-negrito da-margem">Dashboard</h1>
            <p className="da-t16">{rotuloDoIntervalo(p.intervalo)}</p>
          </div>
          <div className="da-botoes">
            {/* `Le icon="refresh" variant="secondary"`: refaz o pedido com o mesmo filtro. */}
            <a className="da-botao da-botao--secundario" href={consulta(p)}>
              <IconePortal nome="atualizar" tamanho={24} />
              Atualizar
            </a>
          </div>
        </div>

        <SecaoContatos {...p} cmp={cmp} />
        <SecaoRecorrencia {...p} cmp={cmp} />
        <SecaoMensagens {...p} cmp={cmp} />
        <SecaoCanais {...p} cmp={cmp} />
        <SecaoFluxo {...p} cmp={cmp} />
        <SecaoBlocos {...p} />
      </div>

      {p.lista ? <BarraDeContatos {...p} lista={p.lista} /> : null}
    </div>
  );
}

interface Comparacao {
  dica: string;
  fora: boolean;
}

/* =============================================================== o filtro */

/**
 * `xT` (o `ST` do `iN`): a faixa clara de largura cheia, com sombra embaixo e
 * cantos de baixo arredondados (`bT`). O chip ativo é `color="default"`, os
 * outros `outline`; tamanho `tall` (40px). A segunda fileira é da flag
 * `is-displaying-dashboard-fixed-period-chips`.
 */
function FiltroDoPeriodo(p: PropsDoDashboard) {
  const chip = (nome: keyof typeof ROTULO_DO_PERIODO) => (
    <a
      key={nome}
      href={`?periodo=${nome}`}
      className={p.periodo === nome ? 'da-chip da-chip--ativo' : 'da-chip'}
      aria-current={p.periodo === nome ? 'true' : undefined}
    >
      <span className="da-chip-texto">{ROTULO_DO_PERIODO[nome]}</span>
    </a>
  );
  return (
    <div className="da-filtro">
      <div className="da-filtro-miolo">
        {/* `mT`: rótulo fs-20 bold e a dica `info` sólida. */}
        <div className="da-filtro-rotulo">
          <span className="da-t20 da-negrito">Selecione o período</span>
          <Dica
            posicao="bottom-center"
            texto="A análise será referente ao período selecionado e a comparação será feita com base no mesmo período anterior (ex: semana atual e semana anterior)."
          >
            <IconePortal nome="informacao-cheia" tamanho={24} />
          </Dica>
        </div>
        {/* `fT` com as duas `gT`. */}
        <div className="da-filtro-chips">
          <div className="da-filtro-fileira">{PERIODOS_FIXOS.map(chip)}</div>
          <div className="da-filtro-fileira">{PERIODOS_DE_CALENDARIO.map(chip)}</div>
        </div>
        <PeriodoPersonalizado
          hoje={p.hoje}
          de={p.periodo === 'custom' ? p.intervalo.inicio : ''}
          ate={p.periodo === 'custom' ? p.intervalo.fim : ''}
        />
      </div>
    </div>
  );
}

/* ============================================================ as peças */

type Posicao = 'bottom-center' | 'left-center' | 'left-bottom' | 'top-right';

/** `bds-tooltip`: balão escuro de raio 8 e recheio 8, texto fs-12, seta de 6px. */
function Dica({
  texto,
  posicao,
  children,
}: {
  texto: string;
  posicao: Posicao;
  children: ReactNode;
}) {
  return (
    <span className="da-dica">
      {children}
      <span className={`da-dica-balao da-dica-balao--${posicao}`} role="tooltip">
        <span className="da-t12">{texto}</span>
      </span>
    </span>
  );
}

/**
 * `XS`, o indicador de comparação: seta + variação inteira com sinal. Sem
 * número ("-") não tem seta. `semDica` é o `hideTooltip` da tabela de canais.
 */
function Indicador({
  valor,
  variante,
  cmp,
  semDica = false,
}: {
  valor: number | undefined;
  variante: 'claro' | 'escuro' | 'transparente';
  cmp: Comparacao;
  semDica?: boolean;
}) {
  const texto = cmp.fora ? '-' : formatar(valor, { percentual: true, casas: 0, sinal: true });
  const corpo = (
    <span className={`da-var da-var--${variante}`}>
      {texto !== '-' ? (
        <IconePortal nome={parseFloat(texto) > 0 ? 'cima' : 'baixo'} tamanho={16} />
      ) : null}
      <span className={semDica ? 'da-t12' : 'da-t12 da-semi'}>{texto}</span>
    </span>
  );
  return semDica ? (
    corpo
  ) : (
    <Dica texto={cmp.dica} posicao="bottom-center">
      {corpo}
    </Dica>
  );
}

/** `kE`: título fs-24 bold (com a margem de 22px do typo) e a dica `info` sólida. */
function TituloDaSecao({
  children,
  dica,
  semMargem = false,
}: {
  children: ReactNode;
  dica?: string;
  semMargem?: boolean;
}) {
  return (
    <div className="da-titulo">
      <h2 className={semMargem ? 'da-t24 da-negrito' : 'da-t24 da-negrito da-margem'}>
        {children}
      </h2>
      {dica ? (
        <Dica texto={dica} posicao="bottom-center">
          <IconePortal nome="informacao-cheia" tamanho={24} className="da-titulo-info" />
        </Dica>
      ) : null}
    </div>
  );
}

/**
 * `wS`: o botão só de ícone que baixa o CSV da seção, com a dica à esquerda.
 * ponytail: o Pipe não gera esses CSVs; o botão tem a cara e o estado da origem
 * (travado quando não há dado), sem ação — quando houver, é um route handler
 * nesta pasta com a mesma consulta de `lib/analise.ts`.
 */
function BotaoCsv({ travado, dica }: { travado: boolean; dica: string }) {
  return (
    <div className="da-csv">
      <Dica texto={dica} posicao="left-center">
        <button
          type="button"
          className="da-botao da-botao--secundario da-botao--so-icone"
          disabled={travado}
          aria-label={dica}
        >
          <IconePortal nome="baixar" tamanho={24} />
        </button>
      </Dica>
    </div>
  );
}

/** `mE`: o vazio da seção — ícone de 80, título fs-16 bold, texto fs-14 semi-bold. */
function SemDados({
  icone,
  titulo,
  texto,
}: {
  icone: NomeDeIconePortal;
  titulo: string;
  texto: string;
}) {
  return (
    <div className="da-vazio">
      <IconePortal nome={icone} tamanho={80} className="da-vazio-icone" />
      <p className="da-t16 da-negrito da-vazio-titulo">{titulo}</p>
      <p className="da-t14 da-semi da-vazio-texto">{texto}</p>
    </div>
  );
}

const SEM_CONVERSAS = {
  titulo: 'Inicie conversas para acompanhar a performance do seu chatbot!',
  texto:
    'Assim que o chatbot começar a trocar algumas mensagens com seus contatos, todos os dados que você precisa para evoluir seu contato inteligente aparecerão aqui no Dashboard.',
};
const SEM_INFORMACAO = 'Não há informações para baixar.';

/* =========================================================== gráficos */

/** Os tiques do eixo de valor: a mesma régua do chart.js que Mensagens ativas usa. */
const escala = (maximo: number) => escalaDoEixo(maximo).tiques;

/**
 * `n_`: o gráfico de linhas das seções Contatos e Mensagens — legenda embaixo
 * com bolinha de 7px, sem grade, eixo a partir de zero, linha de 3px sem ponto
 * (`pointRadius: 0`), título bold 14 alinhado à esquerda quando há.
 *
 * ponytail: o chart.js gira o rótulo do eixo x antes de pular; aqui ele só
 * pula (no máximo 8 rótulos), sem girar.
 */
function GraficoDeLinhas({
  titulo,
  rotulos,
  series,
}: {
  titulo?: string;
  rotulos: string[];
  series: { rotulo: string; cor: string; valores: number[] }[];
}) {
  const tiques = escala(Math.max(0, ...series.flatMap((s) => s.valores)));
  const topo = tiques[tiques.length - 1] ?? 1;
  const x = (i: number) => (rotulos.length > 1 ? (i / (rotulos.length - 1)) * 100 : 50);
  const pulo = Math.ceil(rotulos.length / 8);
  return (
    <div className="da-linhas">
      {titulo ? <p className="da-linhas-titulo">{titulo}</p> : null}
      <div className="da-linhas-area">
        <div className="da-eixo-y">
          {tiques.map((t) => (
            <span key={t} style={{ bottom: `${(t / topo) * 100}%` }}>
              {t.toLocaleString('pt-BR')}
            </span>
          ))}
        </div>
        <div className="da-plot">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {series.map((s) => (
              <polyline
                key={s.rotulo}
                className={s.cor}
                points={s.valores.map((v, i) => `${x(i)},${100 - (v / topo) * 100}`).join(' ')}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          <div className="da-eixo-x">
            {rotulos.map((r, i) =>
              i % pulo === 0 ? (
                <span key={r} style={{ left: `${x(i)}%` }}>
                  {r}
                </span>
              ) : null,
            )}
          </div>
        </div>
      </div>
      <Legenda itens={series} />
    </div>
  );
}

function Legenda({ itens }: { itens: { rotulo: string; cor: string }[] }) {
  return (
    <ul className="da-legenda">
      {itens.map((s) => (
        <li key={s.rotulo}>
          <i className={s.cor} />
          {s.rotulo}
        </li>
      ))}
    </ul>
  );
}

/**
 * `QT`: duas barras deitadas numa categoria só, raio 8, o valor em "%"
 * (`Math.round(100 * v)`) em 24px à direita da ponta, e a folga direita que
 * cresce de 50 a 80px com o maior valor (`PT`).
 */
function BarrasDeParticipacao({
  barras,
}: {
  barras: { rotulo: string; cor: string; fracao: number }[];
}) {
  const tiques = escala(Math.max(0, ...barras.map((b) => b.fracao)));
  const topo = tiques[tiques.length - 1] ?? 1;
  const maior = Math.max(...barras.map((b) => b.fracao));
  const folga = maior < 0.5 ? 50 : maior > 1 ? 80 : ((maior - 0.5) / 0.5) * 30 + 50;
  return (
    <div className="da-barras">
      <div className="da-barras-area" style={{ paddingRight: `${folga}px` }}>
        {barras.map((b) => (
          <div key={b.rotulo} className="da-barras-linha">
            <span
              className={`da-barra ${b.cor}`}
              style={{ width: `${(b.fracao / topo) * 100}%` }}
            />
            <span className="da-barra-valor">{` ${Math.round(100 * b.fracao)}%`}</span>
          </div>
        ))}
      </div>
      <Legenda itens={barras} />
    </div>
  );
}

/* =========================================================== Contatos */

/**
 * `I_`. Com `is-using-contacts-section-identity-quantity-route` ligada, os
 * totais vêm das rotas de quantidade (`engaged-identity-quantity` e
 * `active-identity-quantity`), e as taxas saem deles: interação = com
 * interação ÷ total; rejeição = 1 − interação.
 */
function SecaoContatos(p: PropsDoDashboard & { cmp: Comparacao }) {
  const { contatos } = p.dados;
  const total = contatos.total.atual;
  const com = Math.min(Math.max(contatos.comInteracao.atual, 0), total);
  const comAntes = Math.min(Math.max(contatos.comInteracao.anterior, 0), contatos.total.anterior);
  const semResposta = total - com;
  const semRespostaAntes = contatos.total.anterior - comAntes;
  const interacao = total ? com / total : undefined;
  const rejeicao = interacao !== undefined ? 1 - interacao : undefined;

  return (
    <section className="da-papel da-contatos">
      <div className="da-secao-cabeca">
        <div className="da-secao-titulos">
          <TituloDaSecao dica="Contatos são todas as pessoas que receberam e/ou enviaram mensagens para o seu chatbot.">
            Contatos
          </TituloDaSecao>
          <p className="da-t16">
            Acompanhe as métricas relativas aos contatos que conversaram com o seu chatbot.
          </p>
        </div>
        {/* `isDisabled: A` — e o `A` do `iN` nunca sai de `false`. */}
        <BotaoCsv travado={false} dica="Baixar dados de Contatos em csv." />
      </div>

      <div className="da-contatos-corpo">
        {/* `O_` 30% (`#paperCard`): o cartão escuro do total e dois claros. */}
        <div className="da-coluna" style={{ width: '30%' }}>
          <div className="da-papel da-cartao-escuro">
            <span className="da-t14 da-negrito">Total de contatos únicos</span>
            <span className="da-linha">
              <span className="da-t24 da-extra">{formatar(total, { padrao: '0' })}</span>
              <Indicador
                valor={variacao(total, contatos.total.anterior)}
                variante="claro"
                cmp={p.cmp}
              />
            </span>
          </div>
          <CartaoClaro
            titulo="Contatos que não responderam"
            dica="É a quantidade de contatos únicos que não responderam a nenhuma mensagem enviada pelo chatbot e não iniciaram nenhuma conversa no período selecionado."
            valor={semResposta}
            variacao={variacao(semResposta, semRespostaAntes)}
            cmp={p.cmp}
          />
          <CartaoClaro
            titulo="Contatos com interação"
            dica="É a quantidade de contatos únicos que realizaram alguma interação com seu chatbot no período selecionado, seja iniciando uma conversa ou respondendo a uma mensagem enviada."
            valor={com}
            variacao={variacao(com, comAntes)}
            cmp={p.cmp}
          />
        </div>

        <div className="da-coluna" style={{ width: '45%' }}>
          <GraficoDeLinhas
            rotulos={contatos.porDia.map((d) => diaCurto(d.dia))}
            series={[
              {
                rotulo: 'Contatos com interação',
                cor: 'da-cor-oceano',
                valores: contatos.porDia.map((d) => d.comInteracao),
              },
              {
                rotulo: 'Contatos que não responderam',
                cor: 'da-cor-cinza',
                valores: contatos.porDia.map((d) => d.total - d.comInteracao),
              },
            ]}
          />
        </div>

        <div className="da-coluna" style={{ width: '25%' }}>
          <CartaoListrado
            p={p}
            titulo="Taxa de rejeição"
            dica="É a porcentagem de contatos que não responderam às mensagens do seu chatbot no período selecionado."
            valor={formatar(rejeicao, { percentual: true, padrao: '0%' })}
            cor="da-borda-apagada"
            contatos={semResposta}
            lista="rejeicao"
          />
          <CartaoListrado
            p={p}
            titulo="Taxa de interação"
            dica="É a porcentagem de contatos que responderam a alguma mensagem do seu chatbot ou que iniciaram uma conversa com ele no período selecionado."
            valor={formatar(interacao, { percentual: true, padrao: '0%' })}
            cor="da-borda-oceano"
            contatos={com}
            lista="interacao"
          />
        </div>
      </div>
    </section>
  );
}

/** `c_`: número fs-24 extra-bold com o indicador escuro e a dica; rótulo fs-12 embaixo. */
function CartaoClaro(props: {
  titulo: string;
  dica: string;
  valor: number;
  variacao: number | undefined;
  cmp: Comparacao;
}) {
  return (
    <div className="da-papel da-cartao-claro">
      <div className="da-cartao-claro-topo">
        <div />
        <span className="da-linha">
          <span className="da-t24 da-extra">{formatar(props.valor, { padrao: '0' })}</span>
          <Indicador valor={props.variacao} variante="escuro" cmp={props.cmp} />
        </span>
        <Dica texto={props.dica} posicao="bottom-center">
          <IconePortal nome="informacao-cheia" tamanho={16} />
        </Dica>
      </div>
      <span className="da-t12 da-semi">{props.titulo}</span>
    </div>
  );
}

/**
 * `__`: o cartão com fio colorido embaixo do número. Com
 * `is-displaying-list-contacts-button`, o `external-file` abre a barra lateral
 * — travado (`not-allowed`) quando não há contato.
 */
function CartaoListrado(props: {
  p?: PropsDoDashboard;
  titulo: string;
  dica: string;
  valor: string;
  cor: string;
  contatos?: number;
  lista?: 'interacao' | 'rejeicao';
  variacao?: { valor: number | undefined; cmp: Comparacao };
  sombra?: boolean;
}) {
  const vazio = !props.contatos;
  return (
    <div className={props.sombra ? 'da-listrado da-listrado--sombra' : 'da-listrado'}>
      <div className={`da-listrado-conteudo ${props.cor}`}>
        <div className="da-listrado-titulo">
          <span className="da-t12 da-negrito">{props.titulo}</span>
          {props.lista && props.p ? (
            <Dica
              posicao="bottom-center"
              texto={vazio ? 'Não há contatos para serem visualizados' : 'Visualizar contatos'}
            >
              {vazio ? (
                <span className="da-abrir da-abrir--travado" aria-disabled="true">
                  <IconePortal nome="abrir-arquivo" tamanho={20} />
                </span>
              ) : (
                <a
                  className="da-abrir"
                  href={consulta(props.p, { contatos: props.lista })}
                  aria-label="Visualizar contatos"
                >
                  <IconePortal nome="abrir-arquivo" tamanho={20} />
                </a>
              )}
            </Dica>
          ) : null}
        </div>
        <span className="da-linha">
          <span className="da-t24 da-extra da-mr8">{props.valor}</span>
          {props.variacao ? (
            <Indicador valor={props.variacao.valor} variante="claro" cmp={props.variacao.cmp} />
          ) : null}
        </span>
      </div>
      <span className="da-listrado-dica">
        <Dica texto={props.dica} posicao="left-bottom">
          <IconePortal nome="informacao-cheia" tamanho={16} />
        </Dica>
      </span>
    </div>
  );
}

/* ========================================================= Recorrência */

/** `BR`: dois `DR` à esquerda e a tabela `DT` dos mais recorrentes à direita. */
function SecaoRecorrencia(p: PropsDoDashboard & { cmp: Comparacao }) {
  const { recorrencia, contatos } = p.dados;
  const taxa = contatos.total.atual ? recorrencia.contatos.atual / contatos.total.atual : undefined;
  const tudoZero = recorrencia.contatos.atual === 0 && recorrencia.maisRecorrentes.length === 0;
  return (
    <div className="da-recorrencia">
      <div className="da-meia">
        <CartaoAzul
          titulo="Taxa de recorrência"
          texto="Taxa de contatos únicos que interagiram com seu chatbot 2 ou mais vezes em intervalos de 24h"
          valor={formatar(taxa, { percentual: true, padrao: '0%' })}
        />
        <CartaoAzul
          titulo="Contatos únicos recorrentes"
          texto="Total de contatos únicos que interagiram com seu chatbot 2 ou mais vezes em intervalos de 24h"
          valor={formatar(recorrencia.contatos.atual)}
          indicador={
            <Indicador
              valor={variacao(recorrencia.contatos.atual, recorrencia.contatos.anterior)}
              variante="claro"
              cmp={p.cmp}
            />
          }
        />
      </div>
      <div className="da-meia">
        <Ranking
          titulo="Contatos com mais recorrência"
          dica="Recorrência é a quantidade de dias dentro do período selecionado que cada contato conversou com o chatbot."
          descricao="Saiba quem são os contatos que mais vezes interagiram com seu chatbot no período selecionado"
          csv={{
            travado: tudoZero,
            dica: tudoZero
              ? SEM_INFORMACAO
              : 'Baixar os contatos mais recorrentes do período selecionado. Limite de até 1000 contatos.',
          }}
          vazio={{ icone: 'relogio', ...SEM_CONVERSAS }}
          colunas={[
            { cabeca: 'Nome', negrito: true },
            { cabeca: 'Recorrência', largura: '120px', centro: true, negrito: true },
            { cabeca: 'Telefone', centro: true },
          ]}
          linhas={recorrencia.maisRecorrentes.map((r) => [
            r.nome,
            String(r.recorrencia),
            r.telefone ?? '-',
          ])}
          abrir
        />
      </div>
    </div>
  );
}

/** `DR`: papel surface-3, título sem margem, descrição fs-16 e o número fs-24. */
function CartaoAzul(props: {
  titulo: string;
  texto: string;
  valor: string;
  indicador?: ReactNode;
}) {
  return (
    <div className="da-papel da-cartao-azul">
      <TituloDaSecao semMargem>{props.titulo}</TituloDaSecao>
      <div className="da-cartao-azul-corpo">
        <p className="da-t16">{props.texto}</p>
        <div className="da-cartao-azul-valor">
          <span className="da-linha">
            <span className="da-t24 da-extra da-mr5">{props.valor}</span>
            {props.indicador}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * `DT`: o papel com título, descrição, botão de CSV e a tabela numerada ("1º"
 * num círculo de 32px). A tabela rola dentro de `altura` (150px por padrão,
 * 288px nas listas de blocos). `abrir` é a coluna do `external-file` do
 * `onItemClick` — na origem abre o contato no módulo Contatos, que o Pipe não
 * tem: o ícone fica, sem destino.
 */
function Ranking(props: {
  titulo: string;
  dica: string;
  descricao: ReactNode;
  csv?: { travado: boolean; dica: string };
  vazio: { icone: NomeDeIconePortal; titulo: string; texto: string };
  colunas: { cabeca: string; largura?: string; centro?: boolean; negrito?: boolean }[];
  linhas: ReactNode[][];
  altura?: string;
  abrir?: boolean;
}) {
  return (
    <div className="da-papel da-ranking">
      <div className="da-ranking-cabeca">
        <div className="da-ranking-titulos">
          <TituloDaSecao dica={props.dica}>{props.titulo}</TituloDaSecao>
          <p className="da-t16">{props.descricao}</p>
        </div>
        {props.csv ? <BotaoCsv {...props.csv} /> : null}
      </div>
      {props.linhas.length ? (
        <table className="da-ranking-tabela">
          <thead>
            <tr>
              <th style={{ width: '62px' }} />
              {props.colunas.map((c) => (
                <th
                  key={c.cabeca}
                  style={{ width: c.largura, textAlign: c.centro ? 'center' : 'left' }}
                >
                  <span className="da-t14 da-negrito">{c.cabeca}</span>
                </th>
              ))}
              <th style={{ width: props.abrir ? '62px' : '24px' }} />
            </tr>
          </thead>
          <tbody style={{ maxHeight: props.altura ?? '150px' }}>
            {props.linhas.map((linha, i) => (
              <tr key={i}>
                <td style={{ width: '62px' }}>
                  <span className="da-posicao">
                    <span className="da-t14 da-negrito">{i + 1}º</span>
                  </span>
                </td>
                {linha.map((celula, j) => (
                  <td
                    key={j}
                    style={{
                      width: props.colunas[j]?.largura,
                      textAlign: props.colunas[j]?.centro ? 'center' : 'left',
                      fontWeight: props.colunas[j]?.negrito ? 700 : undefined,
                    }}
                  >
                    {celula}
                  </td>
                ))}
                {props.abrir ? (
                  <td style={{ width: '62px', textAlign: 'center' }}>
                    <IconePortal nome="abrir-arquivo" tamanho={24} className="da-abrir" />
                  </td>
                ) : (
                  <th style={{ width: '24px' }} />
                )}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="da-ranking-vazio">
          <SemDados {...props.vazio} />
        </div>
      )}
    </div>
  );
}

/* =========================================================== Mensagens */

/** `xR`: barras de participação 20% · cartões 25% · linhas 30% · médias 25%. */
function SecaoMensagens(p: PropsDoDashboard & { cmp: Comparacao }) {
  const { mensagens, contatos } = p.dados;
  const enviadas = mensagens.enviadas.atual;
  const recebidas = mensagens.recebidas.atual;
  const total = enviadas + recebidas;
  const totalAntes = mensagens.enviadas.anterior + mensagens.recebidas.anterior;
  /* `AS()`: fração da parte no total, zero quando não há total. */
  const parte = (v: number) => (v === 0 ? 0 : v / total);
  const media = (v: number, c: number) => (c ? v / c : 0);
  const mediaRec = media(recebidas, contatos.comInteracao.atual);
  const mediaEnv = media(enviadas, contatos.comInteracao.atual);
  const tudoZero = total === 0;

  return (
    <section className="da-papel da-mensagens">
      <div className="da-secao-cabeca">
        <div className="da-secao-titulos">
          <div style={{ width: '80%' }}>
            <TituloDaSecao dica="Mensagens são todos os conteúdos trocados entre o chatbot e seus contatos.">
              Mensagens
            </TituloDaSecao>
          </div>
          <p className="da-t16 da-apagado">
            Métricas sobre as mensagens recebidas e enviadas pelo seu chatbot
          </p>
        </div>
        <BotaoCsv
          travado={tudoZero}
          dica={tudoZero ? SEM_INFORMACAO : 'Baixar dados de Mensagens em csv.'}
        />
      </div>

      <div className="da-mensagens-corpo">
        <div className="da-mensagens-coluna" style={{ width: '20%' }}>
          <BarrasDeParticipacao
            barras={[
              { rotulo: 'Enviadas', cor: 'da-cor-oceano', fracao: parte(enviadas) },
              { rotulo: 'Recebidas', cor: 'da-cor-azul', fracao: parte(recebidas) },
            ]}
          />
        </div>
        <div className="da-mensagens-coluna" style={{ width: '25%' }}>
          <CartaoListrado
            titulo="Total de mensagens trafegadas"
            dica="Soma das mensagens enviadas e recebidas pelo chatbot."
            valor={formatar(total)}
            cor="da-borda-marca"
            sombra
            variacao={{ valor: variacao(total, totalAntes), cmp: p.cmp }}
          />
          <MetricaDeMensagem
            tipo="enviada"
            titulo="Mensagens enviadas"
            valor={enviadas}
            variacao={variacao(enviadas, mensagens.enviadas.anterior)}
            cmp={p.cmp}
          />
          <MetricaDeMensagem
            tipo="recebida"
            titulo="Mensagens recebidas"
            valor={recebidas}
            variacao={variacao(recebidas, mensagens.recebidas.anterior)}
            cmp={p.cmp}
          />
        </div>
        <div className="da-mensagens-coluna" style={{ width: '30%' }}>
          <GraficoDeLinhas
            titulo="Volume de mensagens no período"
            rotulos={mensagens.porDia.map((d) => diaCurto(d.dia))}
            series={[
              {
                rotulo: 'Mensagens enviadas',
                cor: 'da-cor-oceano',
                valores: mensagens.porDia.map((d) => d.enviadas),
              },
              {
                rotulo: 'Mensagens recebidas',
                cor: 'da-cor-azul',
                valores: mensagens.porDia.map((d) => d.recebidas),
              },
            ]}
          />
        </div>
        <div className="da-mensagens-coluna" style={{ width: '25%' }}>
          <CartaoListrado
            titulo="Média de mensagens recebidas"
            dica="Média de mensagens que seu chatbot recebeu de cada contato que interagiu com ele."
            valor={formatar(mediaRec)}
            cor="da-borda-marca"
            variacao={{
              valor: variacao(
                mediaRec,
                media(mensagens.recebidas.anterior, contatos.comInteracao.anterior),
              ),
              cmp: p.cmp,
            }}
          />
          <CartaoListrado
            titulo="Média de mensagens enviadas"
            dica="Média de mensagens que seu chatbot enviou para cada contato que interagiu com ele."
            valor={formatar(mediaEnv)}
            cor="da-borda-oceano"
            variacao={{
              valor: variacao(
                mediaEnv,
                media(mensagens.enviadas.anterior, contatos.comInteracao.anterior),
              ),
              cmp: p.cmp,
            }}
          />
        </div>
      </div>
    </section>
  );
}

/** `iR`: o círculo de 32px com `message-sent`/`message-received`, rótulo fs-12 e número fs-20. */
function MetricaDeMensagem(props: {
  tipo: 'enviada' | 'recebida';
  titulo: string;
  valor: number;
  variacao: number | undefined;
  cmp: Comparacao;
}) {
  return (
    <div className="da-metrica">
      <span
        className={
          props.tipo === 'enviada'
            ? 'da-metrica-icone da-cor-fundo-oceano'
            : 'da-metrica-icone da-cor-fundo-marca'
        }
      >
        <IconePortal
          nome={props.tipo === 'enviada' ? 'mensagem-enviada' : 'mensagem-recebida'}
          tamanho={20}
        />
      </span>
      <div className="da-metrica-textos">
        <span className="da-t12 da-negrito da-mr5">{props.titulo}</span>
        <span className="da-metrica-valor">
          <span className="da-t20 da-extra da-mr8">{formatar(props.valor)}</span>
          <Indicador valor={props.variacao} variante="escuro" cmp={props.cmp} />
        </span>
      </div>
    </div>
  );
}

/* ============================================================== Canais */

/**
 * `OE`. A linha do canal e a de "Totais" são o `zE` e o `PE` do `iN`; o Pipe
 * liga UM canal por contato, então as duas trazem os mesmos números. Sem
 * contato no período a origem recebe a lista vazia e desenha o vazio.
 * "Mensagens ativas enviadas" é "-": o bot do Pipe não manda mensagem ativa
 * (ver `carregarMensagensAtivas`).
 */
function SecaoCanais(p: PropsDoDashboard & { cmp: Comparacao }) {
  const { contatos, recorrencia, canal } = p.dados;
  const total = contatos.total.atual;
  const com = contatos.comInteracao.atual;
  const comAntes = contatos.comInteracao.anterior;
  const taxa = (a: number, b: number) => (b ? a / b : undefined);
  const celulas = [
    { chave: 'Contatos com interação', valor: formatar(com), var: variacao(com, comAntes) },
    {
      chave: 'Taxa de interação',
      valor: formatar(taxa(com, total), { percentual: true, padrao: '0%' }),
      var: variacao(taxa(com, total), taxa(comAntes, contatos.total.anterior)),
    },
    {
      chave: 'Contatos que não responderam',
      valor: formatar(total - com),
      var: variacao(total - com, contatos.total.anterior - comAntes),
    },
    {
      chave: 'Taxa de rejeição',
      valor: formatar(total ? 1 - com / total : undefined, { percentual: true, padrao: '0%' }),
      var: variacao(
        total ? 1 - com / total : undefined,
        contatos.total.anterior ? 1 - comAntes / contatos.total.anterior : undefined,
      ),
    },
    { chave: 'Mensagens ativas enviadas', valor: '-', var: undefined },
    {
      chave: 'Taxa de recorrência',
      valor: formatar(taxa(recorrencia.contatos.atual, total), { percentual: true, padrao: '0%' }),
      var: variacao(recorrencia.contatos.atual, recorrencia.contatos.anterior),
    },
  ];
  const linhas = total > 0 ? [canal ?? '-', 'Totais'] : [];

  return (
    <section className="da-papel da-canais">
      <div className="da-secao-cabeca">
        <div className="da-canais-titulos">
          <TituloDaSecao dica="Canais de conversa nos quais o seu chatbot está conectado.">
            Canais
          </TituloDaSecao>
          <p className="da-t16 da-mr5">
            Um zoom na sua performance em cada canal de conversa no periodo selecionado
          </p>
        </div>
      </div>
      <div className="da-canais-corpo">
        {linhas.length ? (
          <table className="da-canais-tabela">
            <thead>
              <tr>
                <th />
                {celulas.map((c) => (
                  <th key={c.chave}>{c.chave}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((nome) => (
                <tr key={nome}>
                  <td>{nome}</td>
                  {celulas.map((c) => (
                    <td key={c.chave}>
                      {c.valor}
                      <Indicador valor={c.var} variante="transparente" cmp={p.cmp} semDica />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <SemDados icone="relogio" {...SEM_CONVERSAS} />
        )}
      </div>
    </section>
  );
}

/* ================================================ Fluxo conversacional */

/**
 * `Yw`. O `isDisabled` que decide o vazio é o `Z` do `iN`: verdadeiro quando
 * TODO número da resposta é zero (`PR`) — aí a origem diz que os dados "estão
 * sendo processados". Botão de CSV desligado pela flag
 * `is-displaying-dashboard-csv-download-conversional-flow-button`.
 */
function SecaoFluxo(p: PropsDoDashboard & { cmp: Comparacao }) {
  const { fluxo } = p.dados;
  const total = fluxo.total.atual;
  const retidos = total - fluxo.transbordo.atual;
  const retidosAntes = fluxo.total.anterior - fluxo.transbordo.anterior;
  const tudoZero = total === 0 && fluxo.transbordo.atual === 0;
  return (
    <section className="da-papel da-fluxo">
      <div className="da-secao-cabeca">
        <div className="da-canais-titulos">
          <TituloDaSecao dica="Fluxo conversacional é a jornada pela qual seus contatos passam durante as conversas com seu chatbot.">
            Fluxo Conversacional
          </TituloDaSecao>
          <p className="da-t16 da-mr5">
            Indicadores sobre a performance do seu fluxo de conversas.
          </p>
        </div>
      </div>
      {tudoZero ? (
        <SemDados
          icone="relogio"
          titulo="Os dados do seu fluxo conversacional estão sendo processados..."
          texto="Por favor, aguarde até 24 horas. Fluxos conversacionais maiores podem ter um tempo de processamento maior."
        />
      ) : (
        <div className="da-fluxo-corpo">
          <CartaoDeColunas
            titulo="Contatos em transbordo"
            cor="da-borda-rosa"
            dica="Contatos em transbordo são aqueles que foram transferidos para atendimento humano, ou seja, que saíram do fluxo do chatbot."
            cmp={p.cmp}
            valores={[
              {
                texto: 'Taxa de transbordo',
                valor: formatar(total ? fluxo.transbordo.atual / total : undefined, {
                  percentual: true,
                }),
              },
              {
                texto: 'Total de contatos em transbordo',
                valor: formatar(fluxo.transbordo.atual),
                variacao: variacao(fluxo.transbordo.atual, fluxo.transbordo.anterior),
              },
            ]}
          />
          <CartaoDeColunas
            titulo="Contatos em retenção"
            cor="da-borda-amarela"
            dica="Contatos em retenção são aqueles que permaneceram no fluxo do chatbot e não precisaram ser transferidos para atendimento humano."
            cmp={p.cmp}
            valores={[
              {
                texto: 'Taxa de retenção de contatos no fluxo',
                valor: formatar(total ? retidos / total : undefined, { percentual: true }),
              },
              {
                texto: 'Total de retenção de contatos no fluxo',
                valor: formatar(retidos),
                variacao: variacao(retidos, retidosAntes),
              },
            ]}
          />
          <CartaoDeColunas
            titulo="Contatos em exceção"
            cor="da-borda-azul"
            dica="São os contatos que enviaram mensagens que não foram compreendidas pelo chatbot e, portanto, caíram em exceção."
            cmp={p.cmp}
            valores={[
              { texto: 'Taxa de contatos em exceção', valor: '-' },
              /* Sem `variacao`: o `Vw` só desenha o indicador quando ela existe. */
              { texto: 'Total de contatos em exceção', valor: '-' },
            ]}
          />
        </div>
      )}
    </section>
  );
}

/** `Vw`: 139px de altura, fio de 2px na cor da métrica, valores lado a lado. */
function CartaoDeColunas(props: {
  titulo: string;
  cor: string;
  dica: string;
  cmp: Comparacao;
  valores: { texto: string; valor: string; variacao?: number }[];
}) {
  return (
    <div className="da-colunas">
      <div className={`da-colunas-fio ${props.cor}`}>
        <div className="da-colunas-cabeca">
          <span className="da-t12 da-negrito da-mr8">{props.titulo}</span>
          <Dica texto={props.dica} posicao="bottom-center">
            <IconePortal nome="informacao-cheia" tamanho={16} />
          </Dica>
        </div>
        <div className="da-colunas-valores">
          {props.valores.map((v) => (
            <div key={v.texto} className="da-colunas-valor">
              <span className="da-linha">
                <span className="da-t24 da-extra da-mr8">{v.valor}</span>
                {'variacao' in v ? (
                  <Indicador valor={v.variacao} variante="claro" cmp={props.cmp} />
                ) : null}
              </span>
              <p className="da-t10">{v.texto}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================================================================ Blocos */

/**
 * `WT`: as duas listas lado a lado (`bds-grid gap="2"`), 288px de rolagem. O
 * "Clique aqui" abre o Dicionário de Dados em outra aba, no item "Lista de
 * blocos" — a URL da origem é `/analytics/dataDictionary?path=dashboard:listOfBlocks`.
 * No roteador o nome do bloco é texto; no fluxo, link para o Builder.
 */
function SecaoBlocos(p: PropsDoDashboard) {
  const dicionario = `/fluxo/${p.id}/analise/dicionario-de-dados?path=dashboard:listOfBlocks`;
  const descricao = (fluxo: string, roteador: string, fim: string) => (
    <>
      {p.dados.roteador ? roteador : fluxo}{' '}
      <a className="da-link" href={dicionario} target="_blank" rel="noreferrer">
        Clique aqui
      </a>{' '}
      {fim}
    </>
  );
  const vazio = {
    icone: 'nao-gostei' as const,
    titulo: 'Não há dados disponíveis para este período.',
    texto: 'Eles aparecerão aqui assim que o chatbot registrar dados dos últimos 7 dias.',
  };
  const colunas = [
    { cabeca: 'Nome do bloco', negrito: true },
    { cabeca: 'Total de eventos', largura: '120px', centro: true },
  ];
  const nome = (n: string) =>
    p.dados.roteador ? (
      n
    ) : (
      <a className="da-link" href="/builder" target="_blank" rel="noreferrer">
        {n}
      </a>
    );
  return (
    <div className="da-blocos">
      <Ranking
        titulo="Blocos com mais exceção"
        dica="Exceções ocorrem quando o fluxo conversacional esperado é interrompido. Em cada bloco do seu chatbot, é possível configurar as condições da saída para o bloco de exceções."
        descricao={descricao(
          'Esses são os blocos que mais tiveram contatos direcionados ao bloco de exceções. Clique em cada um deles para vê-los no Builder.',
          'Esses são os blocos que mais tiveram contatos direcionados ao bloco de exceções dos chatbots conectados a este router.',
          'para entender como analisar as mensagens que ocasionaram essas exceções.',
        )}
        vazio={vazio}
        colunas={colunas}
        linhas={p.dados.blocosExcecao.map((b) => [nome(b.nome), formatar(b.total)])}
        altura="288px"
      />
      <Ranking
        titulo="Blocos com mais transbordo"
        dica="Transbordo é a ação de redirecionar contatos do atendimento automatizado para o atendimento humano. Nesta lista, você confere o número de vezes (eventos) que os contatos foram transbordados."
        descricao={descricao(
          'Esses são os blocos que mais tiveram contatos direcionados para atendimento humano. Clique em cada um deles para vê-los no Builder.',
          'Esses são os blocos dos subbots que mais tiveram contatos direcionados para atendimento humano.',
          'para ler mais dicas e insights sobre transbordo.',
        )}
        vazio={vazio}
        colunas={colunas}
        linhas={p.dados.blocosTransbordo.map((b) => [nome(b.nome), formatar(b.total)])}
        altura="288px"
      />
    </div>
  );
}

/* ============================================================ a barra lateral */

/**
 * `uw`: o véu de tela cheia com a coluna de 416px encostada à direita —
 * cabeçalho escuro "Número de Contatos" com o fechar, a faixa surface-3 com o
 * título do cartão, "v1 (v2 contatos)" e "Exportar lista", e a lista rolável.
 * Fechar é voltar à URL sem `contatos`.
 *
 * ponytail: lá o `top` do véu é medido por JavaScript abaixo da barra do
 * portal; aqui ele cobre a tela desde o topo.
 */
function BarraDeContatos(p: PropsDoDashboard & { lista: NonNullable<PropsDoDashboard['lista']> }) {
  const { contatos } = p.dados;
  const total = contatos.total.atual;
  const com = contatos.comInteracao.atual;
  const interacao = p.lista.tipo === 'interacao';
  const taxa = total ? (interacao ? com / total : 1 - com / total) : undefined;
  const fechar = consulta(p);
  return (
    <div className="da-veu">
      <a className="da-veu-fundo" href={fechar} aria-label="Fechar" />
      <div className="da-lateral-cabeca">
        <p className="da-t16">Número de Contatos</p>
        <a className="da-botao da-botao--curto da-botao--branco" href={fechar} aria-label="Fechar">
          <IconePortal nome="fechar" tamanho={24} />
        </a>
      </div>
      <div className="da-papel da-lateral">
        <div className="da-papel da-lateral-sub">
          <div className="da-lateral-sub-coluna">
            <div className="da-lateral-sub-titulo">
              <IconePortal nome="canais" tamanho={24} />
              <span className="da-t16 da-negrito">
                {interacao ? 'Taxa de interação' : 'Taxa de rejeição'}
              </span>
            </div>
            <span className="da-t14 da-lateral-sub-dado">
              {`${formatar(taxa, { percentual: true, padrao: '0%' })} (${interacao ? com : total - com} contatos)`}
            </span>
          </div>
          <div className="da-lateral-sub-coluna">
            <Dica texto="Limitado aos 1000 contatos mais recentes" posicao="left-center">
              <button type="button" className="da-botao da-botao--curto da-botao--terciario">
                <IconePortal nome="baixar" tamanho={24} />
                Exportar lista
              </button>
            </Dica>
          </div>
        </div>
        <div className="da-lateral-lista">
          {p.lista.nomes.map((n, i) => (
            <div key={`${n}-${i}`} className="da-papel da-lateral-item">
              <span className="da-t14">{n}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
