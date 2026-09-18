import type { JSX, ReactNode } from 'react';
import Link from '../../../../componentes/link';
import { IconePortal } from '../../../../componentes/icones-portal';

/**
 * As páginas do Dicionário de dados, uma função por página da origem, com o
 * texto pt EXATO dos dicionários embutidos no `analytics-main.js` (o `pt:` de
 * cada `translate`). A única troca de texto é "Blip" → "Pipe", onde a marca
 * aparece para quem lê.
 *
 * As peças comuns levam o nome do styled-component de onde saíram (`UN`, `VN`,
 * `CN`…), porque é por esse nome que se acha a medida no bundle. O `font-size`
 * que cada uma herda importa: texto solto dentro de um `VN` herda o fs-14 do
 * `bds-typo`; solto fora dele, o 16 da página. Ver `dicionario.css`.
 */

/* ------------------------------------------------------------ peças comuns */

/** `lN`: "Atualizado em", fs-10 fantasma, encostado à direita. */
function Atualizado({ data }: { data: string }) {
  return <p className="dd-data">{data}</p>;
}

/** `bds-typo class="title" variant="fs-24" bold`. */
function Titulo({ children }: { children: ReactNode }) {
  return <h2 className="dd-t24">{children}</h2>;
}

/** `ZN`: título de relatório anexo, na primária (`#1E6BF1` na origem). */
function TituloMarca({ children, fs20 }: { children: ReactNode; fs20?: boolean }) {
  return <h3 className={`${fs20 ? 'dd-t20' : 'dd-t24'} dd-marca`}>{children}</h3>;
}

/** `UN`: 20 embaixo. */
function Bloco({ children }: { children: ReactNode }) {
  return <div className="dd-bloco">{children}</div>;
}

/** `VN`: `bds-typo` em bloco, 5 embaixo. Sem `variant`, a origem cai no fs-16. */
function Texto({ children, fs16 }: { children: ReactNode; fs16?: boolean }) {
  return <div className={`dd-texto${fs16 ? ' dd-p16' : ''}`}>{children}</div>;
}

/** `CN`: linha flexível, 5 embaixo. */
function Linha({ children }: { children: ReactNode }) {
  return <div className="dd-linha">{children}</div>;
}

/**
 * `ON`: o trecho em destaque, sem quebra. Com `variant="fs-14" bold` é o negrito;
 * chamado sem nada (`SU`, `VU`) é fs-16 regular — `solto`.
 */
function Destaque({ children, solto }: { children: ReactNode; solto?: boolean }) {
  return <span className={`dd-destaque${solto ? ' dd-destaque--solto' : ''}`}>{children}</span>;
}

/** `sN`: `bds-chip-tag color="outline" icon="warning"`. */
function Importante({ titulo = 'Importante' }: { titulo?: string }) {
  return (
    <span className="dd-etiqueta">
      <IconePortal nome="alerta" tamanho={16} />
      <span>{titulo}</span>
    </span>
  );
}

/** O link de suporte da origem vai para `support.blip.ai`: fica o texto, sem destino. */
function LinkSemDestino({ children }: { children: ReactNode }) {
  return <span className="dd-link">{children}</span>;
}

/** `WN`/`IN`: listas com 15 de recuo (o `*` global zera o do navegador). */
function ListaNumerada({ itens }: { itens: readonly ReactNode[] }) {
  return (
    <ol className="dd-lista">
      {itens.map((i, k) => (
        <li key={k}>{i}</li>
      ))}
    </ol>
  );
}

function ListaSimples({ itens }: { itens: readonly ReactNode[] }) {
  return (
    <ul className="dd-lista dd-lista--simples">
      {itens.map((i, k) => (
        <li key={k}>{i}</li>
      ))}
    </ul>
  );
}

/** `ol` cru (`zN`, `VU`): sem recuo nenhum, o marcador pendura na margem. */
function ListaCrua({ itens }: { itens: readonly ReactNode[] }) {
  return (
    <ol>
      {itens.map((i, k) => (
        <li key={k}>
          {/* `AN` */}
          <div className="dd-item">{i}</div>
        </li>
      ))}
    </ol>
  );
}

/** `IN` com cada item dentro de `AN`. */
function ListaDeItens({ itens }: { itens: readonly ReactNode[] }) {
  return (
    <ListaNumerada
      itens={itens.map((i, k) => (
        <div key={k} className="dd-item">
          {i}
        </div>
      ))}
    />
  );
}

/** `jN` + `IN`: passo a passo com ícone ou print ao lado. */
function Passos({ itens }: { itens: readonly ReactNode[] }) {
  return (
    <ListaNumerada
      itens={itens.map((i, k) => (
        <div key={k} className="dd-passo">
          {i}
        </div>
      ))}
    />
  );
}

/** `dU`: o círculo escuro com o ícone do Builder. */
function Circulo({ nome }: { nome: 'painel' | 'aprender' }) {
  return (
    <span className="dd-circulo">
      <IconePortal nome={nome} tamanho={20} />
    </span>
  );
}

/** `BN`: o fio de 0,05px a 50%. */
function Divisor() {
  return <hr className="dd-divisor" />;
}

/** `FN`/`xU`: o indicador de comparação de exemplo, "-5%" com seta para baixo. */
function IndicadorDeExemplo({ solto }: { solto?: boolean }) {
  return (
    <span className={`dd-indicador${solto ? ' dd-indicador--solto' : ''}`}>
      <IconePortal nome="baixo" tamanho={16} />
      <span>-5%</span>
    </span>
  );
}

/**
 * Os prints do Builder que o `gU` embute como PNG (164×19 e 88×19). Não vão os
 * PNGs: o desenho é refeito no mesmo tamanho, com a nossa tinta.
 */
function PrintTracking() {
  return (
    <span className="dd-print dd-print--tracking" aria-hidden="true">
      <IconePortal nome="direita" tamanho={8} />
      <span>Tracking automático</span>
      <span className="dd-print-chave" />
    </span>
  );
}

function PrintChatbot() {
  return (
    <span className="dd-print dd-print--chatbot" aria-hidden="true">
      Chatbot principal
    </span>
  );
}

/** Marca, dentro de uma célula-objeto, o `important` que vira etiqueta. */
const IMPORTANTE = Symbol('importante');
type Celula = string | readonly (string | typeof IMPORTANTE)[];

/**
 * `iU`: cabeçalho fantasma, 10 de recheio, primeira coluna com 20%, linhas
 * ímpares em surface-2 e a primeira célula em negrito. Célula-objeto vira um
 * parágrafo por chave (`aU`), e a chave `important` vira a etiqueta.
 */
function Tabela({
  cabecalho,
  linhas,
}: {
  cabecalho: readonly string[];
  linhas: readonly (readonly Celula[])[];
}) {
  return (
    <table className="dd-tabela">
      <thead>
        <tr>
          {cabecalho.map((c) => (
            <th key={c}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {linhas.map((linha, i) => (
          <tr key={i}>
            {linha.map((celula, j) =>
              typeof celula === 'string' ? (
                <td key={j}>
                  <span className={j === 0 ? 'dd-celula dd-forte' : 'dd-celula'}>{celula}</span>
                </td>
              ) : (
                <td key={j}>
                  {celula.map((p, k) => (
                    <span key={k} className="dd-celula-paragrafo">
                      {p === IMPORTANTE ? <Importante /> : p}
                    </span>
                  ))}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const COLUNAS = ['Nome da coluna', 'Descrição'] as const;
const METRICA_DEFINICAO_FORMULA = ['Métrica', 'Definição', 'Fórmula'] as const;

/** `WU`/`AU`/`PU`/`JU`/`uV`/`lV`/`iV`/`hV`: título azul, uma linha e a tabela. */
function RelatorioAnexo({
  titulo,
  texto,
  linhas,
}: {
  titulo: string;
  texto: string;
  linhas: readonly (readonly Celula[])[];
}) {
  return (
    <Bloco>
      <TituloMarca>{titulo}</TituloMarca>
      <Texto>
        <Linha>{texto}</Linha>
      </Texto>
      <Tabela cabecalho={COLUNAS} linhas={linhas} />
    </Bloco>
  );
}

/* ------------------------------------------------------------- Sobre dados */

/** `zN` (dicionário `cN`). */
export function SobreDados() {
  return (
    <>
      <Atualizado data="Atualizado em 21/09/2022" />
      <Bloco>
        <Titulo>Aviso sobre a disponibilidade de dados:</Titulo>
        <Texto>
          O Dicionário de Dados tem o objetivo de prover todas as informações necessárias sobre as
          soluções da aba de Análise, permitindo que você faça melhor uso das funcionalidades
          disponíveis e entenda com mais facilidade as métricas, indicadores, taxas e dados do seu
          contato inteligente.
        </Texto>
        <Importante />
        <Texto>
          <ListaCrua
            itens={[
              <>
                {
                  'Aviso sobre a disponibilidade de dados: todos os dados a partir de 01/10/2022 ficarão disponíveis durante 90 dias (3 meses) para consulta nas soluções do módulo de Análise de cada chatbot  no portal Pipe. Para obter dados com períodos superiores a 90 dias, fale com nossa equipe de '
                }
                <LinkSemDestino>{' suporte '}</LinkSemDestino>
                {' , que poderá enviá-los sob demanda.'}
              </>,
              'As soluções de Análise de dados tem o propósito de oferecer inteligência e insights sobre a performance e desempenho dos seus chatbots e utiliza regras e filtros exclusivos para os dados mostrados. Estes dados não devem ser utilizados para cobranças, e sim como indicadores de desempenho e performance do seu contato inteligente que ajudem a construir melhores conversas, experiências e fluxos conversacionais. ',
              'A página com os dados de cobrança pode ser acessada em “Painel de Contrato” e “Dados de Consumo”. Nela, a volumetria exibida da sua organização e contrato será contabilizado levando em consideração as métricas acordadas em contrato aplicada em todos os seus chatbots.',
              'Os dados exibidos no módulo de Análise dos chatbots estão associados à timezone e fuso horário configurado no seu computador.',
              'Os dados exibidos no módulo  de Análise do chatbot no portal Pipe são processados, analisados e contabilizados diariamente, portanto poderão sofrer alterações de um dia para o outro pois podem estar sendo processados.',
            ]}
          />
        </Texto>
      </Bloco>
    </>
  );
}

/* --------------------------------------------------------------- Dashboard */

/** `vU` (dicionário `bU`): a página da própria seção. */
function Dashboard() {
  return (
    <>
      <Atualizado data="Atualizado em 21/09/2022" />
      <Bloco>
        <Titulo>Dashboard</Titulo>
        <Texto>
          A tela de Dashboard apresenta informações, dados e indicadores automatizados sobre a
          performance e desempenho do seu contato inteligente. Ela é o melhor instrumento para se
          obter uma visão geral das principais métricas do seu chatbot, como contatos, mensagens
          trafegadas, fluxo conversacional e canais.
        </Texto>
        <Texto>
          {
            'Os dados da tela são “near real time”, o que significa que os dados são processados em segundo plano. Pode haver atraso de minutos entre a troca de mensagens ou eventos do seu chatbot até que os mesmos sejam contabilizados na tela. Para atualizar os dados para o momento mais presente, basta clicar no botão '
          }
          {/* `bds-icon name="refresh" color="blue" size="medium"` */}
          <IconePortal nome="atualizar" tamanho={24} className="dd-icone-atualizar" />
          {'  Atualizar  '}
          no canto superior direito da tela
        </Texto>
      </Bloco>
    </>
  );
}

/** `SU` (dicionário `yU`). */
function FiltroDeData() {
  return (
    <>
      <Atualizado data="Atualizado em 21/09/2022" />
      <Bloco>
        <Titulo>Filtro de data</Titulo>
        <Texto>
          O filtro de data é a funcionalidade que permite que períodos fechados ou personalizados
          sejam escolhidos para as análises do seu contato inteligente.
        </Texto>
        <Tabela
          cabecalho={['Período', 'Definição']}
          linhas={[
            [
              'Hoje',
              'Indica o período de 00h até a hora atual do dia corrente, encerrando-se às 23h59. ',
            ],
            ['Ontem', 'Período de análise fechado de 00h até 23:59 do dia anterior'],
            [
              'Últimos 7 dias',
              'Período de análise que inclui os últimos 7 dias corridos terminando ontem (D-7 a D-1). Não inclui o dia de hoje.',
            ],
            [
              'Últimos 15 dias',
              'Período de análise que inclui os últimos 15 dias corridos  terminando ontem (D-15 a D-1). Não inclui o dia de hoje.',
            ],
            [
              'Últimos 30 dias',
              'Período de análise que inclui os últimos 30 dias corridos terminando ontem (D-30 a D-1). Não inclui o dia de hoje.',
            ],
            [
              'Período personalizado',
              'É possível escolher um período personalizado para sua análise. No campo de escolha de datas, clique primeiro no pequeno calendário do campo “De” e selecione o dia para o começo da análise. Utilize as setas para cima ou para baixo para buscar e escolher períodos que não estão aparentes. Logo após, clique no pequeno calendário do campo “Até” para escolher a data final.',
            ],
            [
              'Atualizar',
              'Ao clicar neste botão, os dados mostrados antes na tela serão atualizados para seu momento mais recente, mantendo os filtros já selecionados.',
            ],
          ]}
        />
        <Importante />
        <Texto>
          <ListaDeItens
            itens={[
              <>
                O período disponível de dados para análise é de no máximo{' '}
                <Destaque solto>{'  90 dias '}</Destaque>
                (3 meses) a contar do dia atual para trás;
              </>,
              <>
                {'Para períodos personalizados de análises superiores a '}
                <Destaque solto>{'  45 dias, '}</Destaque>
                {'os indicadores de comparação  '}
                <IndicadorDeExemplo solto />
                {' não farão a comparação com o período anterior;'}
              </>,
              'O campo de “Período Personalizado” não permite inserção de dados por meio do teclado, apenas selecionando as datas com o mouse.',
            ]}
          />
        </Texto>
      </Bloco>
    </>
  );
}

/** `JN` (dicionário `PN`). */
function IndicadorDeComparacao() {
  return (
    <>
      <Atualizado data="Atualizado em 21/09/2022" />
      <Bloco>
        <Titulo>Indicador de Comparação</Titulo>
        <Linha>
          <IndicadorDeExemplo />
          <span className="dd-rotulo">
            <span className="dd-p14 dd-forte">Indicador de Comparação</span>
          </span>
          <span className="dd-descricao">
            ao longo de toda a tela de dashboard, haverão os indicadores de comparação. Eles
            indicarão se o dado, métrica e informação analisada cresceram ou diminuíram em relação
            ao exato período anterior. Para períodos acima de 46 dias selecionados no filtro de data
            personalizado, não haverá indicador de comparação, pois há apenas 90 dias de dados
            disponíveis para serem consultados.
          </span>
        </Linha>
        <Linha>
          {/* `DN`: a mesma caixa do indicador, vazia, para alinhar o exemplo. */}
          <span className="dd-indicador dd-indicador--vazio" />
          <span className="dd-rotulo">
            <span className="dd-p14 dd-forte">Exemplo:</span>
          </span>
          <span className="dd-descricao">
            ao escolher o período fixo de “Últimos 15 dias” (exemplo: 30 a 16 de junho), toda a
            página terá indicadores de comparação que compararão os dados com a exata quantidade de
            dias de um período anterior (de 15 a 1 de junho).
          </span>
        </Linha>
      </Bloco>
    </>
  );
}

/** `lU` (dicionário `sU`). */
function Contatos() {
  return (
    <>
      <Atualizado data="Atualizado em 21/09/2022" />
      <Bloco>
        <Titulo>Contatos</Titulo>
        <Texto>
          <Linha>
            <Destaque>{'Contatos '}</Destaque>
            <span>
              são as pessoas que interagiram e conversaram com o seu chatbot no período selecionado.
            </span>
          </Linha>
          <Linha>
            <Destaque>{'Contatos únicos '}</Destaque>
            são contatos contabilizados uma única vez, independente da quantidade de vezes de
            interação com o chatbot, no período selecionado.
          </Linha>
        </Texto>
        <Tabela
          cabecalho={METRICA_DEFINICAO_FORMULA}
          linhas={[
            [
              'Total de contatos único',
              'Quantidade total de contatos únicos que interagiram com o seu chatbot no período selecionado.',
              'Contatos que não responderam + Contatos com interação',
            ],
            [
              'Contatos que não responderam',
              'Contatos únicos que não responderam a nenhuma mensagem enviada pelo chatbot e não iniciaram nenhuma conversa no período selecionado. ',
              'Total de contatos únicos que não responderam ao chatbot',
            ],
            [
              'Contatos com interação',
              'Contatos únicos que responderam ou iniciaram uma conversa com o chatbot no período selecionado. ',
              'Total de contatos únicos que interagiram com o chatbot',
            ],
            [
              'Taxa de rejeição',
              'Cálculo da porcentagem do total de contatos únicos que não responderam ao chatbot dividido pelo número total de contatos únicos no período selecionado.',
              'Total de Contatos que não responderam/Total de contatos únicos*100%',
            ],
            [
              'Taxa de interação',
              'Cálculo da porcentagem do total de contatos únicos que responderam e interagiram com o chatbot sobre o número total de contatos únicos no período selecionado.',
              'Total de Contatos com Interação/Total de contatos únicos*100%',
            ],
            [
              'Gráfico de contatos',
              'Gráfico de linha com o total de contatos únicos que não responderam e contatos únicos que interagiram com o chatbot, a cada dia, dentro do período selecionado. Dica: Ao clicar no nome das métricas embaixo do gráfico elas podem sumir e reaparecer conforme sua necessidade de visualização de dados.',
              '',
            ],
          ]}
        />
        <Importante />
        <Texto>
          <ListaDeItens
            itens={[
              'O número de contatos únicos que não responderam é a soma de contatos únicos que não enviaram nenhuma mensagem para o seu chatbot dentro do período selecionado. Por exemplo: caso um contato receba uma mensagem em um dia, mas responda no outro, ele será considerado um contato que não respondeu apenas no dia em que recebeu a mensagem. Ou seja, ele não será contabilizado na soma de contatos que não responderam. O mesmo se aplica ao número de contatos únicos com interação.',
            ]}
          />
        </Texto>
      </Bloco>
    </>
  );
}

/** `DU` (dicionário `CU`). */
function Recorrencia() {
  const exemplo = (rotulo: string, texto: string, itens: readonly string[]) => (
    <Texto>
      <Linha>
        {/* `MU`: rótulo entre 83 e 100 de largura. */}
        <span className="dd-exemplo-rotulo">{rotulo}</span>
        <span className="dd-descricao">
          <Texto>
            {texto}
            <ListaSimples itens={itens} />
          </Texto>
        </span>
      </Linha>
    </Texto>
  );
  return (
    <>
      <Atualizado data="Atualizado em 21/09/2022" />
      <Bloco>
        <Titulo>Recorrência</Titulo>
        <Texto>
          <Linha>
            <Destaque>{'Recorrência '}</Destaque>é a quantidade de vezes que um contato interagiu
            com seu chatbot no intervalo de 24 horas fechadas (00h - 23h59) no período selecionado.
            Cada intervalo de 24 horas é considerado 1 (uma) interação, independente da quantidade
            de mensagens trocadas, ou seja, se no intervalo de 24 horas existir mais de uma
            interação em horários diferentes será contato apenas 1 (uma) interação.
          </Linha>
        </Texto>
        <Importante />
        <Texto>
          Para calcular a recorrência, não consideramos sua primeira conversa com o chatbot como
          recorrência, pois trata-se de uma interação única. Considera-se recorrência apenas a
          partir da segunda interação, neste caso sendo a recorrência igual a 1 (um), pois o contato
          é recorrente uma vez.
        </Texto>
        <Texto>
          <Linha>
            <Destaque>Fórmula:</Destaque>
            {' (Quantidades de vezes de interação em intervalos de 24 horas) - 1'}
          </Linha>
        </Texto>
        {exemplo(
          'Exemplo 1:',
          'Você selecionou o período de “Últimos 7 dias” para analisar seu chatbot, abrangendo o período de 13/06 a 19/06. Neste período, um contato interagiu com seu chatbot no dia 13/06, novamente no dia 15/06 e outra vez no dia 19/06. Nossa tela de dashboard fará a seguinte análise na seção “Contatos mais recorrentes”:',
          [
            '13/06 - interação única',
            '15/06 - interação recorrente',
            '19/06 - interação recorrente',
            'Total de recorrência para este contato no período selecionado = 2',
          ],
        )}
        {exemplo(
          'Exemplo 2: ',
          ' Você selecionou o período de “Últimos 7 dias” para analisar seu chatbot, abrangendo o período de 10/09 a 24/09. Neste período, um contato interagiu com seu chatbot no dia 13/09 às 23:50, novamente no dia 14/09 à 00:05, outra vez no dia 14/09 às 18:53 e 15/09 às 13:25. Nossa tela de dashboard fará a seguinte análise na seção “Contatos mais recorrentes”:',
          [
            '13/09 - 23:50 - interação única',
            '14/09 - 00:05 e 18:53 - uma interação recorrente (intervalo fechado de 24h - 00h às 23:59)',
            '15/09 - 13:25 - interação recorrente',
            'Total de recorrência para este contato no período selecionado = 2',
          ],
        )}
        <Tabela
          cabecalho={METRICA_DEFINICAO_FORMULA}
          linhas={[
            [
              'Taxa de recorrência',
              'É a porcentagem de contatos únicos que voltam a conversar e interagir com seu chatbot no período selecionado em comparação ao total de contatos únicos do mesmo período.',
              'Contatos únicos recorrentes/Total de contatos únicos',
            ],
            [
              'Contatos únicos recorrentes',
              'Total de contatos únicos no período selecionado que interagiram com seu chatbot 2 ou mais vezes em intervalos de 24 horas.',
              'Quantidade total de contatos únicos recorrentes no período selecionado',
            ],
            [
              'Contatos mais recorrentes',
              'Lista de 10 contatos que mais interagiram com seu chatbot no período selecionado. A tabela é organizada em ordem de recorrência e por nome do contato, caso tenham a mesma recorrência. Será mostrado o ID do contato se não houver o nome registrado. Será ainda mostrado o número de telefone dos contatos e o canal pelo qual ele interagiu com o chatbot. Caso o contato não possua número de telefone, essa informação não será mostrada',
              'Quantidades de vezes de interação em intervalos de 24 horas - 1 ',
            ],
          ]}
        />
      </Bloco>
    </>
  );
}

/** `VU` (dicionário `UU`). */
function Mensagens() {
  return (
    <>
      <Atualizado data="Atualizado em 21/09/2022" />
      <Bloco>
        <Titulo>Mensagens</Titulo>
        <Texto>
          Nesta seção é possível ter acesso aos dados de mensagens trocadas entre seus contatos e
          chatbots.
        </Texto>
        <Tabela
          cabecalho={METRICA_DEFINICAO_FORMULA}
          linhas={[
            [
              'Mensagens ativas enviadas',
              [
                'São consideradas mensagens ativas as mensagens que foram enviadas pelo chatbot após 24 horas do recebimento da última mensagem enviada pelo contato.',
                IMPORTANTE,
                'Mensagens ativas enviadas estão sujeitas a políticas de utilização e tarifações específicas de cada canal conversacional, porém a tela de dashboard aplica regras e filtros de dados que dão visibilidade apenas para a contabilização das mensagens ativas. Estes números podem variar em relação ao valor cobrado, pois outras regras e filtros específicos para cobrança são aplicados e considerados.',
                'Estas mensagens ativas são contabilizadas a partir de múltiplos canais e podem ser enviadas pelo chatbot, disparos por Growth e WhatsApp broadcast, Pipe Desk, API, SDK, etc. e podem ou não ser contabilizados como mensagens ativas, de acordo com a regra de 24 horas acima.',
              ],
              'Quantidade total de mensagens ativas enviadas',
            ],
            [
              'Total de mensagens trafegadas',
              'Total de mensagens enviadas e recebidas pelo chatbot no fluxo conversacional. Inclui, também, mensagens trafegadas no Pipe Desk, entre os contatos e atendentes.',
              'Mensagens enviadas + mensagens recebidas',
            ],
            [
              'Mensagens enviadas',
              'Mensagens enviadas pelo chatbot a um contato, configuradas no fluxo conversacional.',
              'Total de mensagens enviadas pelo chatbot',
            ],
            [
              'Mensagens recebidas',
              'Mensagens recebidas pelo chatbot pelos seus contatos.',
              'Total de mensagens recebidas pelo chatbot',
            ],
            [
              'Média de mensagens recebidas',
              'Média de mensagens enviadas pelo chatbot no período selecionado \nInclui mensagens enviadas pelo chatbot, disparos por Growth e WhatsApp broadcast, Pipe Desk, API, SDK, etc. ',
              'Total de mensagens enviadas pelo chatbot/Total de mensagens trafegadas no chatbot',
            ],
          ]}
        />
        <Importante />
        <Texto>
          <ListaCrua
            itens={[
              <>
                {
                  'As mensagens da tela de dashboard não devem ser contabilizadas para cobranças e dados de consumo. As métricas de mensagens em Dashboard possuem regras e filtros aplicados que mostram apenas dados de '
                }
                <Destaque solto>{' performance e desempenho de chatbots.'}</Destaque>
                {
                  ' As informações de cobranças estão disponíveis apenas no “Painel do Contrato” e a elas são aplicadas regras e filtros específicos de cobranças de acordo com seu contrato.'
                }
              </>,
              'Não mostramos em detalhe a quantidade de mensagens e notificações disparadas, abertas, lidas e respondidas de forma ativa oriundas de templates das ferramentas do Portal Pipe, como Growth e WhatsApp Broadcast. ',
            ]}
          />
        </Texto>
      </Bloco>
    </>
  );
}

/** `gU` (dicionário `hU`). */
function FluxoConversacional() {
  return (
    <>
      <Atualizado data="Atualizado em 21/09/2022" />
      <Bloco>
        <Titulo>Fluxo Conversacional</Titulo>
        <Importante />
        <Texto>
          Esta seção tem o objetivo de trazer os dados e métricas mais importantes e relevantes
          sobre o desempenho do Fluxo Conversacional do seu chatbot. Para que possamos gerar esses
          dados, precisamos rastrear o seu fluxo e consolidar os indicadores. É necessário que você
          ative a função de tracking automático no Builder.
        </Texto>
        <Texto>
          <Destaque>Para ativar os tracking automáticos - chatbot:</Destaque>
          <Passos
            itens={[
              <>
                Acesse o<Link href="/builder">“Builder”</Link>do seu chatbot;
              </>,
              <>
                Clique em “Configurações”
                <Circulo nome="painel" />
              </>,
              <>
                Ative os “Tracking Automático”;
                <PrintTracking />
              </>,
              'Caso o chatbot pertença a algum roteador, ative o contexto de roteador clicando em “Utilizar Contexto do Roteador” na mesma aba de Configurações. ',
              <>
                {'Publique o fluxo novamente '}
                <Circulo nome="aprender" />
              </>,
              'Para que a aplicação comece a coletar e processar os dados, é necessário esperar algumas horas até que os indicadores de Fluxo Conversacional sejam lidos e mostrados no seu Dashboard',
            ]}
          />
        </Texto>
        <Importante />
        <Texto>
          <Linha>
            Os dados podem demorar algumas horas para serem gerados e mostrados no seu Dashboard
          </Linha>
          <Destaque>{'Para ativar os tracking automáticos - roteador: '}</Destaque>
          <Passos
            itens={[
              'Clique no roteador no Portal Pipe;',
              <>
                {'Clique no módulo de “Serviços” e acesse o “Builder” do chatbot principal '}
                <PrintChatbot />
              </>,
              <>
                Ative os “Tracking Automático”
                <PrintTracking />
                {'e o “Contexto do Roteador” '}
                <PrintTracking />
              </>,
              <>
                Publique o fluxo novamente
                <Circulo nome="aprender" />
              </>,
              'Acesse o “Builder” de todos os chatbots vinculados ao roteador e realize o passo a passo de número 3 e 4 em todos eles;',
              'Para que a aplicação comece a coletar e processar os dados, é necessário esperar algumas horas até que os indicadores de Fluxo Conversacional sejam lidos e mostrados no seu Dashboard.',
            ]}
          />
        </Texto>
        <Linha>
          {/* `mU`: o `warning` x-small em vermelho. */}
          <span className="dd-atencao">
            <IconePortal nome="alerta" tamanho={16} />
          </span>
          <Destaque>{'Atenção: '}</Destaque>o filtro de data fixo ou personalizado não se aplica a
          esta seção. Os dados da seção da canais dizem respeito aos últimos 7 dias (D-7 a D-1), não
          incluindo o dia de hoje (D-0).
        </Linha>
        <Tabela
          cabecalho={METRICA_DEFINICAO_FORMULA}
          linhas={[
            [
              'Média de blocos antes do transbordo',
              'Média de blocos que os contatos acessaram dentro do período selecionado antes de caírem em transbordo.',
              'Quantidade de blocos por contato antes do transbordo/Total de blocos do período',
            ],
            [
              'Contatos em transbordo',
              'Total de contatos únicos que foram transbordados para atendimento humano.',
              'Quantidade total de contatos únicos que foram transbordados para atendimento humano',
            ],
            [
              'Taxa de transbordo',
              'Indica a porcentagem de contatos únicos que foram transbordados para atendimento humano em relação ao total de contatos únicos que interagiram com o chatbot no período selecionado.',
              'Total de contatos únicos em transbordo/Total de contatos únicos*100%',
            ],
            [
              'Total de contatos em retenção',
              'Total de contatos únicos que ficaram retidos no fluxo conversacional e interagiram apenas com os blocos de conversas automatizadas, e que não foram transbordados para atendimento humano.',
              'Quantidade total de contatos únicos que ficaram retidos no fluxo conversacional (sem atendimento humano)',
            ],
            [
              'Taxa de contatos em retenção',
              'Indica a porcentagem de contatos únicos que não foram transbordados para atendimento humano em relação ao total de contatos únicos que interagiram com o chatbot no período selecionado',
              'Total de contatos únicos em retenção no fluxo conversacional/Total de contatos únicos*100%',
            ],
            [
              'Total de contatos em exceção',
              'Total de contatos únicos que passaram pelo bloco de exceção',
              'Quantidade total de contatos únicos que enviaram mensagens não compreendidas pelo chatbot  e passaram pelo bloco de exceção',
            ],
            [
              'Taxa de contatos em exceção',
              'Indica a porcentagem de contatos que passaram pelo bloco de exceção em relação ao total de contatos únicos no período selecionado. \n Com esta taxa, é possível ver a quantidade de contatos que interagem com seu chatbot que enviam mensagens não compreendidas, podendo otimizar as conversas para que o chatbot tenha conversas cada vez melhores.',
              'Total de contatos únicos em exceção/Total de contatos únicos*100%',
            ],
          ]}
        />
      </Bloco>
    </>
  );
}

/**
 * `NU` → `wU` (dicionário `RU`): a página que a origem já escreve como lista de
 * seções tipadas (`text`, `attentionText`, `chip`, `orderedList`, `table`,
 * `unorderedList`), empilhadas num `bds-grid direction="column" gap="2"`.
 */
function ListaDeBlocos() {
  return (
    <>
      <Atualizado data="Atualizado em 06/03/2023" />
      <Titulo>Lista de blocos</Titulo>
      <div className="dd-secoes">
        <div>
          <p className="dd-p14">
            As listas de blocos com mais exceção e com mais transbordo fornecem dados valiosos para
            entender a performance do seu contato inteligente. Ambas as métricas ajudam a entender
            como está a saúde do seu chatbot.
          </p>
          <p className="dd-p14">
            Com essas informações disponíveis na Lista de Blocos, é possível saber onde a exceção e
            o transbordo estão ocorrendo no seu fluxo conversacional e em chatbots pertencentes a
            roteadores específicos.
          </p>
        </div>
        <div>
          <p className="dd-p14">
            Assim, você consegue fazer alterações, evoluções e melhorias na fraseologia, termos,
            componentes dentro do fluxo conversacional como um todo e construir experiências
            conversacionais cada vez melhores para seus contatos.
          </p>
        </div>
        <div>
          <p className="dd-p14 dd-forte">Entendendo a lista de blocos</p>
          <p className="dd-p14">
            Na seção de Fluxo Conversacional do Dashboard, há 2 listas diferentes e separadas, que
            mostram, em ordem decrescente, quais são os 10 blocos criados no Builder do chatbot que
            possuem mais eventos de transbordo e de exceção.
          </p>
        </div>
        <p className="dd-atencao-texto">
          <IconePortal nome="alerta" tamanho={16} className="dd-cor-erro" />{' '}
          <span className="dd-p14">
            <b>Atenção:</b> o filtro de data fixo ou personalizado não se aplica a esta seção. Os
            dados da seção da canais dizem respeito aos últimos 7 dias (D-7 a D-1), não incluindo o
            dia de hoje (D-0).
          </span>
        </p>
        <Tabela
          cabecalho={['Conceito', 'Definição']}
          linhas={[
            [
              'Nome do bloco',
              'Os blocos criados no Builder aparecerão na lista de blocos de transbordo e/ou exceção exatamente como nomeados no Builder, caso estejam entre os 10 que mais tiveram incidência dessas duas ações.',
            ],
            [
              'Total de Eventos',
              'Quantidade de vezes que os contatos únicos que interagiram com o seu chatbot foram redirecionados para o atendimento humano (transbordo) ou para o bloco de exceções.',
            ],
          ]}
        />
        <div>
          <Importante />
        </div>
        <div>
          <p className="dd-p14 dd-forte">Blocos com nomes idênticos:</p>
          <ul className="dd-lista-crua">
            <li>
              <span className="dd-p14 dd-bloco-li">
                <b>Chatbot:</b> se estiverem dentro do fluxo conversacional de um mesmo chatbot,
                eles serão listados em posições diferentes na lista de blocos com mais transbordo e
                mais exceções. Assim, eles aparecerão como blocos distintos, e seus eventos serão
                contabilizados individualmente. Para identificar a que parte do fluxo o bloco
                pertence, basta clicar em seu nome e ele aparecerá selecionado em outra aba na tela
                do Builder com seu menu aberto.
              </span>
            </li>
            <li>
              <span className="dd-p14 dd-bloco-li">
                <b>Roteador:</b> os chatbots conectados ao mesmo roteador que possuem blocos com
                nomes idênticos serão listados em posições diferentes na lista de blocos com mais
                transbordo e mais exceções. Assim, eles aparecerão como blocos distintos, e seus
                eventos serão contabilizados individualmente. <b>Dica:</b>
                {
                  ' para saber, no contexto do roteador, a que chatbot o bloco pertence, sugerimos incluir o caracter "_" seguido do nome do chatbot  nomear o bloco. Exemplo: "Nome do Bloco_Nome do chatbot"'
                }
              </span>
            </li>
          </ul>
        </div>
        <div>
          <p className="dd-p14 dd-forte">Contatos:</p>
          <p className="dd-p14">
            Não é possível neste momento saber quem são os contatos por cada bloco que foram
            direcionados para o atendimento humano (transbordo) ou para o bloco de exceção.
          </p>
        </div>
        <div>
          <p className="dd-p16 dd-forte">Exceção</p>
          <p className="dd-p14">
            Ao criar um chatbot, existem apenas 2 blocos fixos que aparecem no Builder: bloco de
            início e bloco de exceções.
          </p>
          <p className="dd-p14">
            Exceção é um termo amplo que não possui uma definição fixa. Para que uma exceção ocorra,
            é necessário que os blocos sejam conectados ao bloco de exceções por meio da definição
            das condições de saída. O bloco de exceções não está inicialmente conectado a nenhum
            outro bloco e foi idealizado para que pudesse ser uma alternativa/solução de
            redirecionamento dos contatos quando o fluxo conversacional esperado é interrompido.
          </p>
          <p className="dd-p14">
            {
              'Quando a "condição de saída" de um bloco é configurada para o bloco de exceções, a tela de Dashboard consegue ler a quantidade de contatos e eventos gerados e quais foram os blocos que ocasionaram maior número de exceções.'
            }
          </p>
          <p className="dd-p14">
            Dessa maneira, é possível saber, dentro das regras configuradas de cada chatbot, quais
            estão resultando em mais saídas para exceções, e, assim, tomar ações que vão de encontro
            ao caso de uso e objetivo de cada chatbot.
          </p>
        </div>
        <div>
          <p className="dd-p14 dd-forte">Exemplo de uso do bloco de exceções:</p>
          <p className="dd-p14">
            Para o chatbot A, o bloco de exceções é utilizado para direcionar contatos cujo chatbot
            não compreendeu o conteúdo enviado, seja uma palavra, uma mídia ou uma frase, e a regra
            configurada é reiniciar a interação a partir do menu inicial.
          </p>
        </div>
        <div>
          <p className="dd-p14 dd-forte">💡 Insight para seu chatbot!</p>
          <p className="dd-p14">
            Você já sabe qual porcentagem de contatos do seu fluxo conversacional caiu no bloco de
            exceções pela Taxa de Exceção, sabe quais são os 10 blocos que mais ocasionam exceção, e{' '}
            <b>
              também pode saber quais os termos enviados pelos seus contatos que ocasionaram a
              exceção.
            </b>
          </p>
        </div>
        <div>
          <p className="dd-p14">
            Para isto, basta seguir os seguintes passos em <b>duas etapas.</b>
          </p>
        </div>
        <div>
          <p className="dd-p14 dd-forte">1a etapa - Builder:</p>
          <ol className="dd-lista-crua">
            {[
              'Crie um bloco no Builder;',
              'Clique no bloco e selecionar a opção "Ações"',
              'Selecione "+Adicionar Ações de Entrada" e clique em "Registro de Eventos"',
              'No campo "Categoria" escreva "Exceção" (sugestão) ou o nome que preferir',
              'No campo "Ação" inclua a variável {{input.content}}',
              'Republique o fluxo;',
              'Clique em Análise, no menu superior do chatbot. ',
            ].map((t) => (
              <li key={t}>
                <span className="dd-p14 dd-bloco-li">{t}</span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <p className="dd-p14 dd-forte">2a etapa - Análise e Criação de Relatório:</p>
          <ol className="dd-lista-crua">
            {[
              'Selecione "Relatórios Personalizados";',
              'Clique em “Criar Relatório” e “Adicionar Gráfico”;',
              'Selecione a opção “Lista”;',
              'Adicione “Título do Gráfico” (sugestão: “Termos de Exceção”), selecione “Eventos Personalizados” em dimensão, e selecione o nome da categoria salva na primeira etapa (“Exceção”);',
              'Clique em “Adicionar”.',
            ].map((t) => (
              <li key={t}>
                <span className="dd-p14 dd-bloco-li">{t}</span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <p className="dd-p14">
            <b>Pronto!</b> Em algumas horas os dados já começarão a aparecer no seu relatório.
          </p>
        </div>
        <div>
          <p className="dd-p14">
            Os termos de exceção que mais se repetem são excelentes candidatos para evoluir os
            termos e fraseologias dos blocos em que mais ocorrem exceção, e inclusive, podem se
            tornar oportunidades de negócios não identificadas. Além disso, observe se existem
            oportunidades para melhorar as palavras e frases entendidas pelo seu chatbot para
            validar a condição de redirecionamento.
          </p>
        </div>
        <div>
          <p className="dd-p14">
            Repita esses passos em todos os blocos que você quiser registrar os termos enviados
            pelos seus contatos que ocasionaram exceção.
          </p>
        </div>
        <div>
          <p className="dd-p16 dd-forte">Transbordo</p>
          <p className="dd-p14">
            Transbordo é a transferência dos seus contatos para o atendimento humano, ou seja, para
            um atendente. Dependendo do objetivo do contato inteligente e de negócio da sua empresa,
            o transbordo é desejado ou não.
          </p>
          <p className="dd-p14">
            A lista de blocos em que o transbordo ocorre com mais frequência auxilia você a
            identificar quais os pontos do fluxo conversacional de cada chatbot em que os
            transbordos estão ocorrendo.
          </p>
          <p className="dd-p14">
            Com essa informação disponibilizada, é possível identificar quais os blocos no Builder e
            quais os pontos do fluxo conversacional que mais direcionam os contatos para o
            atendimento humano.
          </p>
          <p className="dd-p14">
            Dessa maneira, ações e decisões sobre o fluxo podem ser tomadas, como, por exemplo,
            investigar quais são os motivos que levaram os contatos ao transbordo a partir dos
            blocos com mais incidência dessa ação, e assim criar testes e executar melhorias de
            forma contínua e frequente em cada um dos blocos para alterar o indicador de transbordo.
          </p>
        </div>
      </div>
    </>
  );
}

/** `_U` (dicionário `EU`). Da segunda resposta em diante o `VN` vai sem `variant`: fs-16. */
function PerguntasFrequentes() {
  const demais: readonly [string, string][] = [
    [
      'Qual o comportamento da tela de Dashboard com o roteador?',
      'A tela de dashboard do roteador mostrará dados agregados de todos os chatbots que estão conectados e ativos ao roteador selecionado, e para isso é essencial que o contexto de roteador esteja ativado. Não é possível a partir do roteador selecionar um chatbot específico para análise, mas é possível ver os dados de um chatbot específico abrindo a aba de Dashboard do mesmo',
    ],
    [
      'Quem pode ter acesso ao Dashboard dos chatbots?',
      'Todas as pessoas usuárias dentro da sua organização que tenham permissão de acesso ao chabot específico e que tenham os campos de “Visualizar” e “Ver e editar” ativos dentro da área “Equipe” de cada um dos chatbots.',
    ],
    [
      'Por que o número de contatos de fluxo conversacional é diferente da seção de contatos?',
      'A seção de fluxo conversacional é processada a partir de um banco de dados de contabilização de contatos únicos que passaram e se moveram pelos blocos da experiência conversacional do fluxo construído. Diferente de Contatos Únicos que contabiliza todos os contatos, mesmo que os que não se moveram e avançaram pelo fluxo conversacional. ',
    ],
    [
      'Qual a diferença entre os números mostrados de Mensagens Ativas da tela de Growth e de Analytics?',
      'Os números de mensagens ativas, na página de Growth, no menu “Mensagens Ativas” ou "Agendador" separa as mensagens ativas enviadas em campanhas por status, como enviadas, recebidas, lidas, e outros, e abrangem as mensagens enviadas apenas pelos canais WhatsApp e Messenger. Enquanto que o número de “Mensagens Ativas Enviadas” na página de Dashboard, no módulo de Análise, não os separa em status, e representam o total contabilizados de mensagens enviadas em múltiplos canais pelo chatbot, disparos por Growth e WhatsApp broadcast, Pipe Desk, API, SDK, etc, sempre que o intervalo entre o envio da mensagem e a última mensagem enviada pelo usuário for maior que 24h.',
    ],
    [
      'Os dados exibidos na tela de Dashboard podem sofrer alterações?',
      'Os dados exibidos no módulo de Análise dos chatbots são processados, analisados e contabilizados diariamente, portanto poderão sofrer alterações de um dia para o outro pois podem estar sendo processados.',
    ],
  ];
  return (
    <>
      <Atualizado data="Atualizado em 21/09/2022" />
      <Bloco>
        <Titulo>Perguntas frequentes</Titulo>
        <Bloco>
          <Destaque>Qual o intervalo de dados disponíveis para minhas análises?</Destaque>
          <Texto>
            {
              'Os dados estão disponíveis para consulta no portal Pipe nas soluções de Análise pelo intervalo de 90 dias (3 meses) corridos a partir do dia de hoje para trás. Para obter dados de períodos superiores a 90 dias, fale com nossa equipe de '
            }
            <LinkSemDestino>{' suporte. '}</LinkSemDestino>
          </Texto>
        </Bloco>
        {demais.map(([pergunta, resposta]) => (
          <Bloco key={pergunta}>
            <Destaque>{pergunta}</Destaque>
            <Texto fs16>{resposta}</Texto>
          </Bloco>
        ))}
      </Bloco>
    </>
  );
}

/* ------------------------------------------------ Gerenciador de Relatórios */

/** `KU` (dicionário `$U`). */
function GerenciadorDeRelatorios() {
  const somente = (tipo: string) => [tipo, '-', '✔️', '-'] as const;
  const todos = (tipo: string) => [tipo, '✔️', '✔️', '✔️'] as const;
  return (
    <>
      <Atualizado data="Atualizado em 16/04/2024" />
      <Bloco>
        <Titulo>Gerenciador de Relatórios</Titulo>
        <Texto>
          <Linha>
            Em Gerenciador de Relatórios, você consegue gerar diferentes tipos de relatórios sobre
            seu contato inteligente para analisar dados sobre conversas entre pessoas usuárias e seu
            chatbot, atendimento e mensagens ativas, entre outros detalhes de sua operação.
          </Linha>
          <br />
          <Importante />
          <Linha>
            Dependendo do chatbot selecionado, ele pode ou não ter dados no relatório desejado.
            Sempre que tiver alguma dúvida, consulte esta tabela:
          </Linha>
        </Texto>
        <Tabela
          cabecalho={[
            'Tipo de Relatório',
            'Router',
            'Chatbot com Atendimento',
            'Chatbot sem atendimento',
          ]}
          linhas={[
            todos('Mensagens ativas'),
            todos('Rastreamento de eventos'),
            todos('Métricas de chatbots e usuários'),
            somente('Status dos atendentes'),
            somente('Métricas de atendimento'),
            somente('Histórico de atendimento'),
          ]}
        />
        <Texto>
          <Linha>
            Caso selecione Router, o relatório apresentará dados somados de todos os subbot. Se um
            subbot for selecionado, o relatório só trará dados do subbot selecionado.
          </Linha>
          <br />
          <Linha>
            <span className="dd-t20">Período de busca dos relatórios</span>
          </Linha>
          <Linha>
            Os relatórios podem ser gerados para períodos de 1 dia a no máximo 90 dias. Você pode
            definir o intervalo de sua preferência para datas dos últimos 5 anos.
          </Linha>
          <Linha>
            No momento, há 6 tipos de relatórios disponíveis que podem ser filtrados por intervalos
            de até 90 dias para os últimos 5 anos, em chatbot Router ou subbot.
          </Linha>
          <br />
          <Linha>
            <span className="dd-forte">
              Todos os relatórios apresentam dados D-1 e correspondem ao fuso horário do Brasil.
            </span>
          </Linha>
          <br />
          <Linha>
            <span className="dd-forte">Exemplo:</span>
          </Linha>
          <Linha>
            O relatório de Rastreamento de Eventos foi selecionado e é possível filtrá-lo para o
            período de 03/07/2021 a 20/08/2021 (55 dias).
          </Linha>
          <br />
          <Linha>
            <span className="dd-t20">Disponibilidade dos relatórios</span>
          </Linha>
          <Linha>
            {
              'Todo relatório que for gerado ficará disponível para download por 7 dias corridos em "Meus relatórios".'
            }
          </Linha>
          <Linha>
            Após esse período, não é possível fazer o download do relatório. É possível, porém,
            gerar um novo relatório com os mesmos filtros.
          </Linha>
        </Texto>
      </Bloco>
    </>
  );
}

/* As nove métricas que se repetem nas abas do Notifications Summary (`IU`). */
const METRICAS_DE_NOTIFICACAO: readonly (readonly Celula[])[] = [
  ['Enviadas', 'Quantidade de mensagens enviadas/disparadas pelos bots.'],
  ['Falhas', 'Quantidade de mensagens que tiveram alguma indicação de falha no envio.'],
  [
    'Envios com sucesso',
    'Quantidade de mensagens para as quais não foram registradas falhas de envio.',
  ],
  ['Recebidas', 'Quantidade de mensagens recebidas pelas pessoas usuárias.'],
  ['Consumidas', 'Quantidade de mensagens consumidas/lidas pelas pessoas usuárias.'],
  ['Ativas (> 24 horas)', 'Quantidade de mensagens ativas enviadas pelos bots.'],
  ['Resposta (< 24 horas)', 'Quantidade de mensagens do tipo resposta enviadas pelo bots.'],
  [
    'Registrada Interação Usuário',
    'Quantidade de mensagens para as quais foram registradas respostas/interações das pessoas usuárias após seu envio.',
  ],
  [
    'Taxa Interação Usuário',
    'Taxa de mensagens enviadas com sucesso para as quais foram registradas respostas/interações das pessoas usuárias após seu envio.',
  ],
];

/** `ZU` (dicionário `OU`) + `WU` + `AU`. */
function MensagensAtivas() {
  return (
    <>
      <Atualizado data="Atualizado em 16/04/2024" />
      <Bloco>
        <Titulo>Mensagens ativas</Titulo>
        <Texto>
          <Linha>
            Esse relatório traz dados das mensagens ativas enviadas às pessoas usuárias, com
            detalhes sobre mês, dia, chatbot e template das mensagens.
          </Linha>
          <br />
          <Linha>
            Este relatório contém um arquivo CSV com os dados detalhados de cada mensagem ativa
            enviada e com quais mensagens os clientes interagiram, exceto falhas.
          </Linha>
          <br />
          {/* `bds-chip-tag icon="megaphone"` sem `color`: o `default` (color-system). */}
          <span className="dd-etiqueta dd-etiqueta--padrao">
            <IconePortal nome="megafone" tamanho={16} />
            <span>Atenção</span>
          </span>
          <Linha>
            O relatório de Mensagens ativas é diferente do relatório de disparador nativo, pois um
            mesmo template pode ser utilizado em vários disparos num mesmo período.
          </Linha>
        </Texto>
        <Tabela
          cabecalho={['Conceito', 'Definição']}
          linhas={[
            [
              'Notificações do WhatsApp',
              'Mensagens disparadas pelo chatbot utilizando o modelo de broadcast/template do WhatsApp. Podem ser enviadas por meio da API do WhatsApp ou pelo Growth (Pipe) para listas de números ou para um número individual.',
            ],
            [
              'Notificações ativas',
              'Mensagens de template disparadas para clientes que nunca conversaram com o chatbot antes, ou não conversam com ele há mais de 24 horas. Podem gerar uma cobrança do tipo business_initiated na precificação nova do Facebook/Meta.',
            ],
            [
              'Notificações resposta',
              'Mensagens de template disparadas para clientes que já estavam conversando com o chatbot há menos de 24 horas. Podem gerar uma cobrança do tipo user_initiated na precificação nova do Facebook/Meta, caso sejam enviadas há mais de 24 horas da última sessão contabilizada para o mesmo número.',
            ],
          ]}
        />
        <Texto>
          <Linha>
            O relatório possui 2 arquivos. O primeiro arquivo (XLSX) contém 4 abas com os dados
            resumidos dos bots/clientes no período:
          </Linha>
        </Texto>
      </Bloco>

      {/* `WU` */}
      <Bloco>
        <TituloMarca>Notifications Summary</TituloMarca>
        <Texto>
          <Linha>
            <span className="dd-p12">
              {'<Nome_do_cliente>_Notifications_Summary_<data_inicial>_<data_final>.xlsx'}
            </span>
          </Linha>
          <Divisor />
          <Linha>
            <span className="dd-t20">Aba: Notificações - Cliente - Mês</span>
          </Linha>
        </Texto>
        <Tabela
          cabecalho={COLUNAS}
          linhas={[
            ['Mês', 'Data de agregação em formato (YYYY-mm).'],
            [
              'Primeira Data Envio',
              'Primeira data dentro da agregação de mês que foi enviada uma notificação.',
            ],
            [
              'Última data envio',
              'Última data dentro da agregação de mês em que foi enviada uma notificação.',
            ],
            ['Bots Distintos', 'Quantidade de bots distintos na análise.'],
            [
              'Templates Distintos',
              'Quantidade de templates (modelos de mensagem do WhatsApp) distintos.',
            ],
            ...METRICAS_DE_NOTIFICACAO,
          ]}
        />
        <Texto>
          <Divisor />
          <Linha>
            <span className="dd-t20">Aba: Notificações - Bots - Mês</span>
          </Linha>
        </Texto>
        <Tabela
          cabecalho={COLUNAS}
          linhas={[
            ['BotId', 'Bot em que a mensagem ativa foi enviada.'],
            ['Mês', 'Data de agregação em formato (YYYY-mm).'],
            [
              'Primeira Data Envio',
              'Primeira data dentro da agregação de mês em que foi enviada uma notificação.',
            ],
            [
              'Última data envio',
              'Última data dentro da agregação de mês em que foi enviada uma notificação.',
            ],
            [
              'Templates Distintos',
              'Quantidade de templates (modelos de mensagem do WhatsApp) distintos.',
            ],
            ...METRICAS_DE_NOTIFICACAO,
          ]}
        />
        <Texto>
          <Linha>
            <span className="dd-t20">{'Aba: Notificações - Bots - Dia & Tem'}</span>
          </Linha>
          <Divisor />
          <Linha>
            Apresenta dados sumarizados de mensagens ativas para cada chatbot, dia e template. As
            métricas se mantêm as mesmas, com exceção à métrica de templates distintos.
          </Linha>
        </Texto>
        <Tabela
          cabecalho={COLUNAS}
          linhas={[
            ['BotId', 'Bot em que a mensagem ativa foi enviada.'],
            ['Data', 'Data do envio da Mensagem ativa.'],
            ['Template', 'Id do template.'],
            ...METRICAS_DE_NOTIFICACAO,
          ]}
        />
        <Texto>
          <Linha>
            <span className="dd-t20">Aba: Notificações - Bots - Falhas</span>
          </Linha>
          <Divisor />
          <Linha>
            Volumetria de erros ocorridos durante o envio de mensagens ativas pelo WhatsApp. Os
            dados estão agrupados pelo Bot, Mês, código da falha e a descrição dela.
          </Linha>
        </Texto>
        <Tabela
          cabecalho={COLUNAS}
          linhas={[
            ['BotId', 'Bot em que a mensagem ativa foi enviada.'],
            ['Mês', 'Data de agregação em formato (YYYY-mm).'],
            ['Código de Falha', 'Código de quando a mensagem ativa falha.'],
            ['Descrição da Falha', 'Descrição da falha da mensagem ativa.'],
            [
              'Volume',
              'Quantidade de notificações que falharam pelo motivo especificado na coluna "Descrição da Falha".',
            ],
          ]}
        />
      </Bloco>

      {/* `AU` */}
      <RelatorioAnexo
        titulo="Notifications Users"
        texto="<Nome_do_cliente>_Notifications_Users_<data_inicial>_<data_final>"
        linhas={[
          ['BotID', 'Identificador do bot router que disparou a mensagem.'],
          [
            'ID',
            'Identificador da mensagem trafegada no Pipe (geralmente associada à lista de disparo).',
          ],
          ['UniqueID', 'Identificador único da mensagem trafegada no Pipe.'],
          ['UserID', 'Identificador da pessoa usuária para qual a mensagem foi disparada.'],
          ['Mês', 'Mês do disparo.'],
          ['Data', 'Data do disparo, considerando o horário de Brasília (UTC-3).'],
          ['DataHora_Envio', 'Data/Hora do disparo, considerando o horário de Brasília (UTC-3).'],
          ['TemplateName', 'Nome do modelo/template utilizado.'],
          ['TemplateNamespace', 'Namespace da Waba onde o template está registrado.'],
          ['Broad', 'Conteúdo do json do disparo realizado.'],
          [
            'RespostaUsuario',
            'Conteúdo da próxima mensagem enviada pela pessoa usuária, caso ela tenha respondido dentro da janela de atualização da tabela (24 a 48 horas).',
          ],
          [
            'DataHora_RespostaUsuario',
            'Data/Hora de envio da primeira mensagem enviada pela pessoa usuária, caso ela tenha respondido dentro da janela de atualização da tabela (24 a 48 horas).',
          ],
          ['Type', 'Tipo de notificação (Active/Response).'],
          [
            'Received',
            'Data/Hora em que o WhatsApp indicou que a mensagem foi recebida pela pessoa usuária, caso esta indicação tenha sido recebida pelo Pipe.',
          ],
          [
            'Consumed',
            'Data/Hora em que o WhatsApp indicou que a mensagem foi lida pela pessoa usuária, caso esta indicação tenha sido recebida pelo Pipe.',
          ],
          [
            'Failed',
            'Caso tenha sido registrada alguma falha no envio desta mensagem, seja pelo WhatsApp ou pelo Pipe, este campo traz a causa do erro e o seu código.',
          ],
          ['ReceptionTime', 'Tempo em segundos do envio da mensagem ativa até o recebimento.'],
          ['ConsumptionTime', 'Tempo em segundos do envio da mensagem ativa até a sua leitura.'],
          [
            'AnswerTime',
            'Tempo em segundos do envio da mensagem ativa até a resposta da pessoa usuária .',
          ],
        ]}
      />
    </>
  );
}

/** `XU` (dicionário `qU`). */
function RastreamentoDeEventos() {
  return (
    <>
      <Atualizado data="Atualizado em 16/04/2024" />
      <Bloco>
        <Titulo>Rastreamento de eventos</Titulo>
        <Texto>
          <Linha>
            Este relatório disponibiliza todos os trackings de um contato inteligente. Os dados são
            registrados pelo tracking no momento em que o cliente passa por um bloco específico do
            Builder.
          </Linha>
          <br />
          <Linha>
            <TituloMarca fs20>Notifications Users</TituloMarca>
          </Linha>
          <Linha>
            <span className="dd-p12">{'<Nome_do_cliente>_eventtracks_<período>.csv.gz'}</span>
          </Linha>
        </Texto>
        <Tabela
          cabecalho={COLUNAS}
          linhas={[
            ['DataHora', 'Data/Hora em que o evento foi registrado (UTC-3).'],
            ['Data', 'Data em que o evento foi registrado (UTC-3).'],
            ['BotID', 'Identificador do bot onde o tracking foi implementado.'],
            ['UserID', 'Identificador da pessoa usuária que passou pelo tracking.'],
            ['Category', 'Nome do tracking criado no fluxo do Bot.'],
            [
              'Action',
              'Dados registrados na passagem da pessoa usuária pelo ponto monitorado do fluxo.',
            ],
            [
              'Extras',
              [
                'Dados extras sobre a pessoa usuária e seu status ao longo da jornada no bot, que podem ser implementados de forma global ou relacionados somente ao tracking em questão.',
                IMPORTANTE,
                'Tem o formato de uma string JSON, com seus itens dispostos em duplas de chave/valor.',
              ],
            ],
          ]}
        />
      </Bloco>
    </>
  );
}

/** `GU` (dicionário `BU`) + `QU` + `JU` + `PU`. */
function MetricasDeChatbot() {
  const ABAS_USERS: readonly (readonly Celula[])[] = [
    ['Ano_Mes', 'Ano-Mês em que os dados foram coletados.'],
    ['Bot Router', 'Indicador do bot roteador analisado.'],
  ];
  const DAILY_ROUTER: readonly (readonly Celula[])[] = [
    [
      'Participação nos DAUs dos SubBots',
      'Percentual da volumetria de DAUs do subbot analisado em relação ao somatório de DAUs registrados em todos os subbots.',
    ],
    [
      'Participação nos DEUs dos SubBots',
      'Percentual da volumetria de DEUs do subbot analisado em relação ao somatório de DEUs registrados em todos os subbots.',
    ],
    [
      'DAUs somente do router',
      'Volume de pessoas usuárias ativas num dia que não tiveram registros nos subbots, divididos pela quantidade de subbots encontrados.',
    ],
    [
      'DEUs somente do router',
      'Volume de pessoas usuárias engajadas num dia que não tiveram registros nos subbots, divididos pela quantidade de subbots encontrados.',
    ],
    [
      'DAUs Corrigidos',
      'Volume de DAUs do router que passaram nos subbots, corrigidos pela participação percentual do subbot no total.',
    ],
    [
      'DEUs Corrigidos',
      'Volume de DEUs do router que passaram nos subbots, corrigidos pela participação percentual do subBot no total.',
    ],
    [
      'DAUs Corrigidos Total',
      'Volume de DAUs corrigidos somados ao volume de DAUS não encontrados nos subbots, divididos para cada subbot.',
    ],
    [
      'DEUs Corrigidos Total',
      'Volume de DEUs corrigidos somados ao volume de DEUs não encontrados nos subbots, divididos para cada subbot.',
    ],
    [
      'DAUs Total do Router',
      'Volume de DAUs total registrados nos routers, independentemente dos subbots.',
    ],
    [
      'DEUs Total do Router',
      'Volume de DEUs total registrados nos routers, independentemente dos subbots.',
    ],
  ];
  const CONVERSAS_WABA: readonly (readonly Celula[])[] = [
    ['WabaId', 'Identificador único da WABA (Whatsapp Business Account).'],
    ['WabaName', 'Nome da WABA.'],
    ['PhoneNumber', 'Número de telefone associado a WABA/Bot.'],
  ];
  const DIRECAO_TIPO: readonly (readonly Celula[])[] = [
    ['Conversation_Direction', 'Indica se a sessão foi user_initiated ou business_initiated.'],
    [
      'Conversation_Type',
      'Indica se a sessão será cobrada regularmente (REGULAR) ou se foi uma sessão gratuita (FREE_TIER ou FREE_ENTRY_POINT).',
    ],
  ];
  const CONVERSAS_SUBBOTS: readonly (readonly Celula[])[] = [
    ['Bot Router', 'Indicador do bot router analisado.'],
    ['SubBot', 'Indicador do subbot analisado.'],
    ...DIRECAO_TIPO,
    ['Users', 'Volume de pessoas usuárias únicas identificadas no período.'],
    ['Conversations', 'Volume estimado de conversas/sessões geradas no período.'],
    ['Estimated_Cost_USD', 'Custo estimado em dólares (USD) das sessões geradas no período.'],
    [
      'Participação nos conversas dos SubBots',
      'Percentual da volumetria de Conversas do subbot analisado em relação ao somatório de Conversas registradas em todos os subbots.',
    ],
    [
      'Participação nos custos dos SubBots',
      'Percentual do Custo Estimado no subbot analisado em relação ao somatório do Custo Estimado em todos os subbots.',
    ],
    [
      'Conversas somente do router',
      'Volume de conversas de pessoas usuárias que não tiveram registros nos subbots, divididos pela quantidade de subbots encontrados.',
    ],
    [
      'Custo somente do router',
      'Custo estimado das conversas de pessoas usuárias que não tiveram registros nos subbots, divididos pela quantidade de subbots encontrados.',
    ],
    [
      'Volume de Conversas Corrigido',
      'Volume de conversas do router que foram registradas com pessoas usuárias que passaram pelos subbots, corrigidos pela participação percentual do subbot no total.',
    ],
    [
      'Custo Estimado Corrigido',
      'Custo estimado de conversas do router que foram registradas com pessoas usuárias que passaram pelos subbots, corrigidos pela participação percentual do Subbot no total.',
    ],
    [
      'Total Conversas Corrigidas',
      'Volume de conversas corrigido, somado ao volume de conversas não registradas por pessoas usuárias que passaram em subbots, divididos para cada subbot.',
    ],
    [
      'Total Custo Corrigido USD',
      'Custo estimado das conversas corrigido, somado ao custo de conversas não registradas por pessoas usuárias que passaram em subbots, divididos para cada subbot.',
    ],
  ];

  /** Cada aba do `QU`: fio, título fs-20 e a tabela. */
  const aba = (titulo: string, linhas: readonly (readonly Celula[])[]) => (
    <>
      <Texto>
        <Divisor />
        <Linha>
          <span className="dd-t20">{titulo}</span>
        </Linha>
      </Texto>
      <Tabela cabecalho={COLUNAS} linhas={linhas} />
    </>
  );

  return (
    <>
      <Atualizado data="Atualizado em 16/04/2024" />
      <Bloco>
        <Titulo>Métricas de chatbot e usuários</Titulo>
        <Texto>
          <Linha>
            <span>
              Esse relatório <strong>possui 3 arquivos </strong>e traz dados sobre{' '}
              <strong>pessoas usuárias ativas (MAUs e DAUs) e engajadas (MEUs e DEUs) </strong>e
              detalhes das conversas e sessões do WhastApp. As pessoas usuárias contabilizadas são
              aquelas que entraram em contato com o chatbot no período selecionado.
            </span>
          </Linha>
          <br />
        </Texto>
        <Tabela
          cabecalho={['Conceito', 'Definição']}
          linhas={[
            [
              'Usuários Ativos (MAUs/DAUs)',
              'Pessoas usuárias que receberam mensagens pela plataforma do Pipe',
            ],
            [
              'Usuários Engajados (MEUs/DEUs)',
              'Pessoas usuárias que enviaram mensagens para os bots',
            ],
            [
              'Conversas/Sessões do WhatsApp',
              [
                'Sempre que uma mensagem enviada por algum bot é recebida por um usuário do WhatsApp, uma sessão é iniciada no WhatsApp, com a duração de 24 horas. Somente caso alguma outra interação registrada após essa janela de tempo que uma nova sessão poderá ser iniciada/cobrada',
                IMPORTANTE,
                'As 1000 primeiras sessões de uma WABA (WhatsApp Business Account) não são cobradas, independentemente da sua origem.',
              ],
            ],
            [
              'Conversas iniciadas pelo negócio (business_initiated)',
              'Sempre que uma sessão é iniciada a partir do  envio de algum template/broadcast do WhatsApp por meio de um bot com o qual a pessoa usuária nunca conversou antes, ou que está há mais de 24 horas sem enviar mensagens para ela.',
            ],
            [
              'Conversas iniciadas pelo usuário (user_initiated)',
              'Sempre que uma sessão é iniciada pela resposta do bot a uma  interação da pessoa usuária, ou caso uma nova sessão seja iniciada pela pessoa usuária ou pelo bot em menos de 24 horas da última mensagem enviada por ela na conversa anterior.',
            ],
            [
              'Conversas iniciadas de um link de entrada livre (free_entry_point)',
              'Estas sessões são geradas a partir de um link do tipo click to whatsapp, sendo um tipo especial de sessão gratuita que pode ser gerada mais de uma vez por dia, cada vez que uma pessoa usuária acessa o bot por meio destes links',
            ],
          ]}
        />
        <Texto>
          <Linha>
            <span className="dd-p16 dd-forte">O relatório possui 3 arquivos:</span>
          </Linha>
          <Linha>
            <ListaSimples
              itens={[
                'Conversation details: detalhes de waba, bot, usuário, data e hora;',
                'Conversation summary: resumo com ano e mês do bot router, MAUs, MEUs, MSGs;',
                'User details: informações de data, bot id, user, id e mensagem.',
              ]}
            />
          </Linha>
        </Texto>
      </Bloco>

      {/* `QU`: o `UN` dele fecha depois da segunda tabela; o resto vem solto. */}
      <Bloco>
        <TituloMarca>Conversation Summary</TituloMarca>
        <Texto>
          <Linha>Subbots_Users_Conversations_Summary_</Linha>
        </Texto>
        {aba('Aba: Users - Router', [
          ...ABAS_USERS,
          ['MAUs', 'Volume de pessoas usuárias ativas registradas num mês (MAUs).'],
          ['MEUs', 'Volume de pessoas usuárias engajadas registradas num mês (MEUs).'],
          ['MSGs', 'Total de mensagens trafegadas no bot.'],
          [
            'MAUs sem registros nos sub-bots',
            'Volume de pessoas usuárias ativas que não tiveram registros nos subbots, apenas no bot roteador.',
          ],
          [
            'MEUs sem registros nos sub-bots',
            'Volume de pessoas usuárias engajadas que não tiveram registros nos subbots, apenas no bot roteador.',
          ],
        ])}
        {aba('Aba: Users - SubBots', [
          ...ABAS_USERS,
          ['SubBot', 'Indicador do subbot do bot roteador analisado.'],
          ['MAUs', 'Volume de pessoas usuárias ativas registradas num mês (MAUs).'],
          ['MEUs', 'Volume de pessoas usuárias engajadas registradas num mês (MEUs).'],
          ['MSGs', 'Total de mensagens trafegadas no bot.'],
          [
            'Participação nos MAUs dos SubBots',
            'Percentual da volumetria de MEUs do subbot analisado em relação ao somatório de MEUs registrados em todos os subbots.',
          ],
          [
            'MAUs somente do router',
            'Volume de pessoas usuárias ativas que não tiveram registros nos subbots, divididos pela quantidade de subbots encontrados.',
          ],
          [
            'MEUs somente do router',
            'Volume de pessoas usuárias engajadas que não tiveram registros nos subbots, divididos pela quantidade de subbots encontrados.',
          ],
          [
            'MAUs Corrigidos',
            'Volume de MAUs do router que passaram nos subbots, corrigidos pela participação percentual do subBot no total.',
          ],
          [
            'MEUs Corrigidos',
            'Volume de MEUs do router que passaram nos subbots, corrigidos pela participação percentual do subbot no total.',
          ],
          [
            'MAUs Corrigidos Total',
            'Volume de MAUS corrigidos somados ao volume de MAUS não encontrados nos subBots, divididos para cada subbot.',
          ],
        ])}
      </Bloco>
      {aba('Aba: Users - SubBots - Daily', [
        ['Data', 'Data em que os dados foram coletados.'],
        ['Bot Router', 'Indicador do bot roteador analisado.'],
        ['SubBot', 'Indicador do subbot do bot roteador analisado.'],
        ['DAUs', 'Volume de pessoas usuárias ativas num dia registradas no subbot.'],
        ['DEUs', 'Volume de pessoas usuárias engajadas num dia registradas no subbot.'],
        ['MSGs', 'Total de mensagens trafegadas no subbot.'],
        ...DAILY_ROUTER,
      ])}
      {aba('Aba: Users - SubBots - Daily ACC', [
        ['Mês', 'Mês em que os dados foram coletados.'],
        ['Bot Router', 'Indicador do bot roteador analisado.'],
        ['SubBot', 'Indicador do subbot do bot roteador analisado.'],
        ['DAUs Acumulados', 'Volume de pessoas usuárias ativas num dia acumulados no subbot.'],
        ['DEUs Acumulados', 'Volume de pessoas usuárias engajadas num dia acumulados no subbot.'],
        ['MSGs Acumulados', 'Total de mensagens trafegadas no subbot.'],
        ...DAILY_ROUTER,
      ])}
      {aba('Aba: Conversations - Router', [
        ['Ano_Mes', 'Ano e mês em que as sessões foram iniciadas.'],
        ...CONVERSAS_WABA,
        ['BotId', 'Indicador do bot router analisado.'],
        ...DIRECAO_TIPO,
        ['Usuários Únicos', 'Volume de pessoas usuárias únicas identificadas no período.'],
        [
          'Volumetria de Conversas Estimada',
          'Volume estimado de conversas/sessões geradas no período.',
        ],
        ['Custo Estimado (USD)', 'Custo estimado em dólares (USD) das sessões geradas no período.'],
      ])}
      {aba('Aba: Conversations - Subbots', [
        ['Ano_Mes', 'Ano e mês em que as sessões foram iniciadas.'],
        ...CONVERSAS_WABA,
        ...CONVERSAS_SUBBOTS,
      ])}
      {aba('Aba: Conversations - SubBots - Daily', [
        ['Data', 'Data em que as sessões foram iniciadas.'],
        ...CONVERSAS_WABA,
        ...CONVERSAS_SUBBOTS,
        [
          'Volume de conversas do Router',
          'Volume de Conversas registradas nos routers, independentemente dos subbots.',
        ],
        [
          'Custo Total Estimado do Router',
          'Custo estimado total das conversas registradas nos routers, independentemente dos subbots.',
        ],
      ])}

      {/* `JU` */}
      <RelatorioAnexo
        titulo="User Details"
        texto="SubBots_Users_Details_"
        linhas={[
          ['Data', 'Dia em que os dados foram coletados.'],
          ['Bot Router', 'Indicador do bot roteador analisado.'],
          ['Ano_Mes', 'Mês em que as sessões foram iniciadas.'],
          ['UserId', 'Identificador único do usuário no bot router.'],
          ['Domain', 'Canal por onde as mensagens foram trafegadas nos bots.'],
          [
            'MensagensUserRouter',
            'Quantidade de mensagens enviadas pela pessoa usuária, registradas no bot router.',
          ],
          [
            'MensagensBotRouter',
            'Quantidade de mensagens enviadas pelo bot, registradas no bot router.',
          ],
          ['ChildUserId', 'Identificador único da pessoa usuária no subbot do bot roteador.'],
          ['ChildBotId', 'Indicador do subbot analisado.'],
          [
            'MensagensUserTunnel',
            'Quantidade de mensagens enviadas pela pessoa usuária registradas no subbot analisado.',
          ],
          [
            'MensagensBotTunnel',
            'Quantidade de mensagens enviadas pelo bot registradas no subbot analisado.',
          ],
        ]}
      />

      {/* `PU` */}
      <RelatorioAnexo
        titulo="Conversations Details"
        texto="SubBots_Conversations_Details_"
        linhas={[
          ...CONVERSAS_WABA,
          ['BotId', 'Indicador do bot roteador analisado.'],
          ['ChildUserId', 'Indicador do usuário da conversa dentro do seu respectivo subbot.'],
          ['ChildBotId', 'Indicador do subbot analisado.'],
          [
            'UserId',
            'Indicador do número de WhatsApp da pessoa usuária com o qual foi gerada uma conversa.',
          ],
          ['ConversationId', 'Indicador único da conversa gerada no WhatsApp.'],
          ['StartDate', 'Dia em que a sessão foi iniciada (no fuso GMT-0).'],
          [
            'StartDateTime',
            'Início da janela de tempo em que a sessão foi iniciada (no fuso GMT-0).',
          ],
          ['EndDateTime', 'Fim da janela de tempo em que a sessão foi iniciada (no fuso GMT-0).'],
          ...DIRECAO_TIPO,
          ['Country', 'País do número de WhatsApp com o qual a conversa foi estabelecida.'],
          ['CountryCode', 'Código de DDI do número com o qual foi iniciada a sessão.'],
          ['Cost', 'Custo estimado da sessão conforme a tabela do WhatsApp de precificação.'],
          [
            'WabaSessionNumber',
            'Número que indica a ordem da sessão dentro das sessões dos números registrados de cada WABA.',
          ],
        ]}
      />
    </>
  );
}

/* As colunas de tempo que se repetem nas abas "Status - Minutes" e "Status - Dia". */
const TEMPOS_DE_STATUS: readonly (readonly Celula[])[] = [
  ['Online', 'Tempo no status online em minutos (aproximação).'],
  ['Invisible', 'Tempo no status invisible em minutos (aproximação).'],
  ['Pause', 'Tempo no status pause em minutos (aproximação).'],
  ['Offline', 'Tempo no status offline em minutos (aproximação).'],
  [
    'OpenTicketOnline',
    'Tempo no status online em que o atendente estava com pelo menos um ticket aberto, calculado em minutos (aproximação).',
  ],
  [
    'OpenTicketInvisible',
    'Tempo no status invisible em que o atendente estava com pelo menos um ticket aberto, calculado em minutos (aproximação).',
  ],
  [
    'WithoutTicketOnline',
    'Tempo no status online em que o atendente não estava com nenhum ticket associado, calculado em minutos (aproximação).',
  ],
  [
    'WithoutTicketInvisible',
    'Tempo no status invisible em que o atendente não estava com nenhum ticket associado, calculado em minutos (aproximação).',
  ],
];

/** `pV` (dicionário `rV`) + `uV` + `lV` + `iV` + `hV`. */
function StatusDosAtendentes() {
  const ATENDENTE = ['AgentIdentity', 'Identificador/E-mail do atendente.'] as const;
  return (
    <>
      <Atualizado data="Atualizado em 16/04/2024" />
      <Bloco>
        <Titulo>Status dos atendentes</Titulo>
        <Texto>
          <Linha>
            Esse relatório indica as movimentações de status de cada atendente ao longo do dia. É
            considerado o tempo que cada atendente passou online, invisível, em pausa ou offline
            após a primeira mudança de status naquele dia. O relatório registra até a penúltima
            mudança.
          </Linha>
        </Texto>
        <Tabela
          cabecalho={['Status', 'Definição']}
          linhas={[
            ['Online', 'Atendente online na plataforma e apto para atender novos tickets.'],
            [
              'Invisible',
              'Atendente online, porém invisível para a plataforma. Neste status, o atendente ainda deve responder os tickets que lhe foram designados, mas não recebe tickets novos.',
            ],
            [
              'Pause',
              'Atendente em pausa. A princípio, o atendente não recebe e nem pode continuar atendendo algum ticket.',
            ],
            [
              'Offline',
              'Status que representa quando o atendente não está mais logado na plataforma.',
            ],
          ]}
        />
        <Texto>
          <Linha>
            O arquivo .xlsx possui apenas 4 abas, com apresentações do tempo que cada atendente
            cumpriu nos 4 status e com algumas informações extras sobre a sua performance.
          </Linha>
        </Texto>
      </Bloco>
      <RelatorioAnexo
        titulo="Status - Minutes"
        texto="Cálculo do tempo que cada atendente cumpriu nos 4 status, calculados em relação ao Atendente e ao período da janela de tempo em minutos designada."
        linhas={[
          ATENDENTE,
          ['BotID', 'Identificador do bot de atendimento.'],
          ['Teams', 'Times/Filas às quais o atendente se encontra cadastrado.'],
          ['Device', 'Dispositivo pelo qual a pessoa usuária entrou.'],
          ['DateTimeRef', 'Data/Hora de referência do início da janela de tempo apurada.'],
          ...TEMPOS_DE_STATUS,
        ]}
      />
      <RelatorioAnexo
        titulo="Status - Dia"
        texto="Cálculo do tempo que cada atendente cumpriu nos 4 status agregados por Atendente/Bot/Dia."
        linhas={[
          ATENDENTE,
          ['BotID', 'Identificador do bot de atendimento.'],
          ['Teams', 'Times/Filas às quais o atendente se encontra cadastrado.'],
          ['Date', 'Data da análise.'],
          ...TEMPOS_DE_STATUS,
          ['Devices', 'Dispositivo pelo qual a pessoa usuária entrou.'],
        ]}
      />
      <RelatorioAnexo
        titulo="Histórico - Alterações de Status"
        texto="Registro das alterações de status realizadas pelos atendentes no dia. Esta é a fonte dos cálculos realizados nas abas anteriores."
        linhas={[
          ATENDENTE,
          ['Device', 'Dispositivo pelo qual a pessoa usuária entrou.'],
          ['DateTime', 'Data/Hora da mudança de status registrada.'],
          ['OldStatus', 'Status prévio à mudança indicada.'],
          ['NewStatus', 'Status após à mudança registrada.'],
        ]}
      />
      <RelatorioAnexo
        titulo="Volume de Tickets"
        texto="Registro do volume de tickets fechados que foram atendidos pelos agentes no período, agrupados em relação à data de encerramento dos tickets e seus status finais."
        linhas={[
          ATENDENTE,
          ['CloseDate', 'Data de encerramento dos tickets.'],
          [
            'ClosedAttendant',
            'Volume de tickets com o status ClosedAttendant, indicando que estes foram encerrados pelo atendente.',
          ],
          [
            'ClosedClient',
            'Volume de tickets com o status ClosedClient, indicando que estes foram encerrados pelo cliente.',
          ],
          [
            'ClosedClientInactivity',
            'Volume de tickets com o status ClosedClientInactivity, indicando que estes foram encerrados pelo cliente devido à inatividade.',
          ],
          [
            'Transferred',
            'Volume de tickets com o status Transferred, indicando que estes foram transferidos de fila/atendente.',
          ],
        ]}
      />
    </>
  );
}

/** `oV`/`tV`: título, texto, "Importante" e a tabela. */
function RelatorioDeAtendimento({
  titulo,
  texto,
  cabecalho,
  linhas,
}: {
  titulo: string;
  texto: string;
  cabecalho: readonly string[];
  linhas: readonly (readonly Celula[])[];
}) {
  return (
    <>
      <Atualizado data="Atualizado em 16/04/2024" />
      <Bloco>
        <Titulo>{titulo}</Titulo>
        <Texto>
          <Linha>{texto}</Linha>
          <br />
          <Importante />
          <Linha>
            Este relatório só é válido para chatbot com canal de atendimento ativo no Desk.
          </Linha>
        </Texto>
        <Tabela cabecalho={cabecalho} linhas={linhas} />
      </Bloco>
    </>
  );
}

const ORIGINAL_DO_ROTEADOR: readonly (readonly Celula[])[] = [
  [
    'Original_CustomerIdentity',
    'Caso o bot de atendimento seja um subbot de um bot roteador, este campo traz o identificador original do usuário no bot.',
  ],
  [
    'Original_BotID',
    'Caso o bot de atendimento seja um subbot de um bot roteador, este campo traz o identificador do bot original.',
  ],
];

/** `oV` (dicionário `nV`). */
function MetricasDeAtendimento() {
  return (
    <RelatorioDeAtendimento
      titulo="Métricas de atendimento"
      texto="Esse relatório traz dados principais dos tickets de atendimento registrados no período do relatório. Ele contempla também as mensagens de template do WhatsApp que foram disparadas nos bots e aparecem nas volumetrias de mensagens trafegadas."
      cabecalho={COLUNAS}
      linhas={[
        ['BotID', 'Identificador do bot de atendimento.'],
        ['TicketID', 'Identificador único dos tickets.'],
        ['SequentialId', 'Número sequencial do ticket.'],
        [
          'CustomerIdentity',
          'Identificador do cliente no canal de atendimento. Caso seja um subbot, o identificador se torna um GUID com o canal de tunnel.',
        ],
        ['AgentIdentity', 'Identificador do atendente para o qual o ticket foi encaminhado.'],
        ['Status', 'Status do ticket.'],
        ['StorageDate', 'Data/Hora de criação do ticket na plataforma (UTC-3).'],
        ['OpenDate', 'Data/Hora em que o ticket foi encaminhado para algum atendente (UTC-3).'],
        [
          'FirstResponseDate',
          'Data/Hora em que o atendente envia sua primeira mensagem para o cliente (UTC-3).',
        ],
        ['CloseDate', 'Data/Hora em que o ticket foi encerrado na plataforma (UTC-3).'],
        ['ExpirationDate', 'Data/Hora em que o ticket se expir na plataforma (UTC-3).'],
        ['Team', 'Time/Fila de atendimento.'],
        ['Closed', 'Indica se o ticket já foi encerrado ou não.'],
        [
          'Tags',
          'Marcações realizadas pelos atendentes para identificar questões relacionadas ao atendimento.',
        ],
        [
          'ParentSequentialID',
          'Caso ticket tenha sido transferido de algum atendimento anterior, armazena o Sequential Id do ticket original.',
        ],
        ['QueueTime', 'Tempo de fila.'],
        ['FirstResponseTime', 'Tempo até a primeira mensagem do atendente.'],
        [
          'AverageAgentResponseTime',
          'Tempo médio que o atendente levou para responder o cliente ao longo do atendimento.',
        ],
        ['OperationalTime', 'Tempo total de atendimento.'],
        ['TicketTotalTime', 'Tempo total do ticket desde a sua criação até o seu encerramento.'],
        ['CustomerName', 'Nome do cliente armazenado no contato da plataforma.'],
        ['CustomerEmail', 'Email do cliente armazenado no contato da plataforma.'],
        ['CustomerGender', 'Gênero do cliente armazenado no contato da plataforma.'],
        ['CustomerCity', 'Cidade do cliente armazenada no contato da plataforma.'],
        ['CustomerPhone', 'Telefone do cliente armazenado no contato da plataforma.'],
        ['CustomerExtras', 'Informações extras do contato do cliente armazenadas na plataforma.'],
        ['AgentName', 'Nome do atendente conforme seu cadastro na plataforma.'],
        ['AgentEmail', 'Email do atendente conforme o cadastro deste na plataforma.'],
        ...ORIGINAL_DO_ROTEADOR,
      ]}
    />
  );
}

/** `tV` (dicionário `eV`). */
function HistoricoDeAtendimento() {
  return (
    <RelatorioDeAtendimento
      titulo="Histórico de atendimento"
      texto="Esse tipo de relatório traz o histórico de mensagens trocadas entre atendentes e clientes no Desk, incluindo a transcrição delas. Ele pode incluir os IDs de usuários e bots originais da conversa (em caso de o atendimento ocorrer em algum subbot)."
      cabecalho={['Métrica', 'Fórmula']}
      linhas={[
        ['TicketID', 'Identificador único dos tickets.'],
        ['SequentialID', 'Número sequencial do ticket.'],
        ['OrdemMensagens', 'Número da ordem das mensagens em cada ticket.'],
        ['BotID', 'Identificador do bot de atendimento.'],
        ['From', 'Identificador de quem enviou a mensagem atual.'],
        ['Mensagem', 'Conteúdo da mensagem.'],
        ['Data', 'Data em que a mensagem foi registrada (UTC-3).'],
        ['Hora', 'Hora em que a mensagem foi registrada (UTC-3).'],
        ['Status', 'Status do ticket.'],
        ['CriadoEm', 'Data/Hora de criação do ticket na plataforma (UTC-3).'],
        ['EncerradoPor', 'Identificador único de quem encerrou o ticket.'],
        ['EncerradoEm', 'Data/Hora em que o ticket foi encerrado na plataforma (UTC-3).'],
        ['Team', 'Time/Fila de atendimento.'],
        [
          'Tags',
          'Marcações realizadas pelos atendentes para identificar questões relacionadas ao atendimento.',
        ],
        [
          'Original_CustomerIdentity',
          'Caso o bot de atendimento seja um subbot de um bot roteador, este campo traz o identificador original da pessoa usuária no bot.',
        ],
        [
          'Original_BotID',
          'Caso o bot de atendimento seja um subbot de um bot roteador, este campo traz o identificador do bot original.',
        ],
      ]}
    />
  );
}

/**
 * A página de cada chave de `path`. Subseção e seção dividem o espaço de nomes
 * porque na origem também dividem (`selectedSubSection` é um só).
 */
export const PAGINAS: Readonly<Record<string, () => JSX.Element>> = {
  aboutData: SobreDados,
  dashboard: Dashboard,
  dateFilter: FiltroDeData,
  comparisonIndicator: IndicadorDeComparacao,
  contacts: Contatos,
  recurrence: Recorrencia,
  messages: Mensagens,
  conversationalFlow: FluxoConversacional,
  listOfBlocks: ListaDeBlocos,
  frequentlyAskedQuestions: PerguntasFrequentes,
  reportManager: GerenciadorDeRelatorios,
  activeMessages: MensagensAtivas,
  eventTracking: RastreamentoDeEventos,
  chatbotUserMetrics: MetricasDeChatbot,
  statusAttendants: StatusDosAtendentes,
  serviceMetrics: MetricasDeAtendimento,
  serviceHistory: HistoricoDeAtendimento,
};
