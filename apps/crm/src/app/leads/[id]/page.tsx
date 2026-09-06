import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Avatar, Etiqueta } from '@pipe/ui';
import { LinhaDoTempo } from '../../../componentes/linha-do-tempo';
import { fusoDoTenant } from '../../../lib/banco';
import { carregarFicha, ROTULO_STATUS, type Ficha } from '../../../lib/leads';
import { data, dataHora, desde, documento, numero, pontos } from '../../../lib/formato';

export const dynamic = 'force-dynamic';

/**
 * A ficha do lead, na estrutura que o Twenty usa e nós não usávamos.
 *
 * O que a leitura deles mudou aqui, em ordem de importância:
 *
 * 1. **Cabeçalho de destaque.** Antes o nome era um `h2` com quatro etiquetas
 *    soltas ao lado. Agora é uma faixa de identidade (avatar, nome, estado) mais
 *    uma tira dos campos que decidem o que fazer com este lead: proprietário,
 *    score, fase, dias parado e origem. É o "highlight panel" do Salesforce e a
 *    "identifier bar" do Twenty, que chegaram ao mesmo desenho sem se falarem.
 * 2. **Abas internas.** Score, Formulários e Linha do tempo eram três blocos
 *    empilhados numa coluna de rolagem infinita. Viraram abas, e a aba vive na
 *    URL: a ficha aberta na linha do tempo é um endereço que se cola no chat.
 * 3. **Coluna lateral fixa** com os campos em seções que abrem e fecham, em vez
 *    de três caixas de altura igual disputando atenção com o painel do score.
 *
 * O que NÃO copiamos, de propósito: eles fixam a primeira aba ("Home") como
 * coluna lateral e deixam o resto em abas. Nós fixamos os DADOS na lateral e
 * pomos o SCORE como primeira aba, porque a explicação do score é o que este
 * produto tem e o deles não — ela não pode ser a aba que ninguém abre.
 *
 * As abas são links, não estado de cliente. A ficha inteira continua sendo
 * servidor: sem JavaScript, ela funciona igual.
 */

const ABAS = [
  { chave: 'score', rotulo: 'Score' },
  { chave: 'formularios', rotulo: 'Formulários' },
  { chave: 'tempo', rotulo: 'Linha do tempo' },
] as const;

type AbaFicha = (typeof ABAS)[number]['chave'];

function abaValida(valor: string | undefined): AbaFicha {
  return (ABAS.find((a) => a.chave === valor)?.chave ?? 'score') as AbaFicha;
}

function Campo({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

/**
 * Uma seção da coluna lateral, que abre e fecha.
 *
 * `<details>` nativo: o navegador já sabe abrir, fechar, responder ao teclado e
 * contar para o leitor de tela. Escrever isso em React seria trocar zero linha
 * por trinta e perder o comportamento de busca na página.
 */
function Secao({
  titulo,
  aberta = true,
  children,
}: {
  titulo: string;
  aberta?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="secao" open={aberta}>
      <summary>
        <b>{titulo}</b>
      </summary>
      {children}
    </details>
  );
}

/** A tira de campos principais do cabeçalho. Cinco, no máximo: é a régua do
 *  destaque do Salesforce, e mais do que isso deixa de ser destaque. */
function Destaque({ ficha, fuso }: { ficha: Ficha; fuso: string }) {
  const parado = ficha.diasNaFase !== null && ficha.diasNaFase >= 7;
  const desqualificado = ficha.status === 'desqualificado';

  return (
    <div className="destaque">
      <div className="identidade">
        <Link href="/leads" className="trilha">
          Leads
        </Link>
        <span className="barra" aria-hidden="true">
          /
        </span>
        <Avatar nome={ficha.nome} />
        <h2>{ficha.nome}</h2>

        {/*
          O estado em etiquetas, e só duas podem ter cor: a desqualificação, que
          é o único estado terminal, e a parada de mais de sete dias, que é o que
          alguém resolve hoje. Fase e faixa são categoria, e categoria é neutra.
        */}
        {desqualificado ? (
          <Etiqueta tom="erro">{ROTULO_STATUS['desqualificado']}</Etiqueta>
        ) : (
          <Etiqueta>{ROTULO_STATUS[ficha.status] ?? ficha.status}</Etiqueta>
        )}
        {ficha.diasNaFase !== null && parado && !desqualificado ? (
          <Etiqueta tom="alerta">parado há {numero(ficha.diasNaFase)} dias</Etiqueta>
        ) : null}

        <span className="criado">
          criado {desde(ficha.criadoEm, fuso)}
        </span>
      </div>

      <dl className="principais">
        <div>
          <dt>Score</dt>
          <dd className="n">
            {ficha.score ? numero(ficha.score.valor) : '—'}
            {ficha.score?.faixa ? <em>{ficha.score.faixa}</em> : null}
          </dd>
        </div>
        <div>
          <dt>Fase</dt>
          <dd>
            {ficha.fase ?? '—'}
            {ficha.diasNaFase === null ? null : (
              <em>há {numero(ficha.diasNaFase)} dias</em>
            )}
          </dd>
        </div>
        <div>
          <dt>Proprietário</dt>
          <dd>{ficha.proprietario ?? 'sem proprietário'}</dd>
        </div>
        <div>
          <dt>Origem</dt>
          <dd>
            {ficha.origem ?? '—'}
            {ficha.campanha ? <em>{ficha.campanha}</em> : null}
          </dd>
        </div>
        <div>
          <dt>Conta</dt>
          <dd>
            {ficha.contaId ? (
              <Link href={`/contas/${ficha.contaId}`}>{ficha.contaNome}</Link>
            ) : (
              (ficha.contaNome ?? '—')
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export default async function PaginaFicha({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const { id } = await params;
  const { aba: abaCrua } = await searchParams;
  const aba = abaValida(abaCrua);

  const ficha = await carregarFicha(id);
  if (!ficha) notFound();

  const fuso = await fusoDoTenant();
  const agora = new Date();
  const atributos = Object.entries(ficha.customizados);
  const utm = Object.entries(ficha.utm);

  const contagem: Record<AbaFicha, number | null> = {
    score: ficha.score?.itens.length ?? null,
    formularios: ficha.formularios.length,
    tempo: ficha.linhaDoTempo.length,
  };

  return (
    <>
      <Destaque ficha={ficha} fuso={fuso} />

      <div className="ficha">
        {/*
          A lateral fixa: os dados que descrevem o lead. Ficam sempre visíveis
          porque é o que a pessoa consulta enquanto lê qualquer uma das abas.
        */}
        <aside className="coluna">
          <div className="tblwrap">
            <Secao titulo="Dados">
              <div className="campos">
                <Campo k="E-mail" v={ficha.email ?? '—'} />
                <Campo k="Telefone" v={ficha.telefone ?? '—'} />
                <Campo k="Documento" v={documento(ficha.documento)} />
                <Campo k="Criado em" v={data(ficha.criadoEm, fuso)} />
                <Campo k="Fase desde" v={data(ficha.faseDesde, fuso)} />
              </div>
            </Secao>
          </div>

          <div className="tblwrap">
            <Secao titulo="Atributos" aberta={atributos.length + utm.length > 0}>
              {atributos.length === 0 && utm.length === 0 ? (
                <div className="vazio">Nenhum atributo personalizado.</div>
              ) : (
                <div className="campos">
                  {atributos.map(([k, v]) => (
                    <Campo key={k} k={k} v={String(v)} />
                  ))}
                  {utm.map(([k, v]) => (
                    <Campo key={`utm-${k}`} k={`utm ${k}`} v={String(v)} />
                  ))}
                </div>
              )}
            </Secao>
          </div>

          <div className="tblwrap">
            <Secao titulo="Etiquetas" aberta={ficha.etiquetas.length > 0}>
              {ficha.etiquetas.length === 0 ? (
                <div className="vazio">Sem etiquetas.</div>
              ) : (
                <div className="etiquetas">
                  {ficha.etiquetas.map((e) => (
                    <Etiqueta key={e.nome}>{e.nome}</Etiqueta>
                  ))}
                </div>
              )}
            </Secao>
          </div>
        </aside>

        <div className="coluna">
          <div className="tblwrap">
            <div className="tabs" role="tablist">
              {ABAS.map((a) => (
                <Link
                  key={a.chave}
                  href={`/leads/${ficha.id}?aba=${a.chave}`}
                  role="tab"
                  aria-current={a.chave === aba ? 'true' : undefined}
                  scroll={false}
                >
                  {a.rotulo}
                  {contagem[a.chave] === null ? null : (
                    <span className="qt">{numero(contagem[a.chave] ?? 0)}</span>
                  )}
                </Link>
              ))}
            </div>

            {aba === 'score' ? <PainelScore ficha={ficha} fuso={fuso} /> : null}
            {aba === 'formularios' ? <Formularios ficha={ficha} fuso={fuso} /> : null}
            {aba === 'tempo' ? (
              <LinhaDoTempo itens={ficha.linhaDoTempo} fuso={fuso} agora={agora} />
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * O painel que explica o número. Regra por regra, quanto entrou e quanto saiu,
 * com a versão da regra e a hora do cálculo, lido de `score_lead.explicacao` e
 * não recalculado na tela.
 *
 * É a única tela do CRM em que a cor não indica ação e continua valendo: aqui o
 * verde e o vermelho SÃO a informação, e é a tela que justifica o produto. Por
 * isso é a primeira aba, e não a última.
 */
function PainelScore({ ficha, fuso }: { ficha: Ficha; fuso: string }) {
  if (!ficha.score) {
    return (
      <div className="vazio">
        <b>Este lead ainda não foi pontuado.</b>
        <span>
          Sem cálculo não há explicação, e número sem explicação é o que este produto existe para
          não repetir.
        </span>
      </div>
    );
  }

  return (
    <>
      <header>
        <b>
          Como {ficha.nome} tirou {numero(ficha.score.valor)}
        </b>
        <span className="lbl">
          Regra de score v{ficha.score.versaoRegra} · {dataHora(ficha.score.calculadoEm, fuso)}
        </span>
      </header>

      {ficha.score.itens.length === 0 ? (
        <div className="vazio">
          Nenhuma regra casou com este lead: o score {numero(ficha.score.valor)} é o valor de
          partida.
        </div>
      ) : (
        <ul className="rules">
          {ficha.score.itens.map((item, i) => (
            <li key={`${item.regra}-${i}`}>
              <span>{item.nome}</span>
              <span className="v">v{item.versao}</span>
              <em className={item.pontos >= 0 ? 'p' : 'n'}>{pontos(item.pontos)}</em>
            </li>
          ))}
        </ul>
      )}

      <div className="tot">
        <span className="n">{numero(ficha.score.valor)}</span>
        <div>
          <Etiqueta>Faixa {ficha.score.faixa ?? 'não definida'}</Etiqueta>
          <div className="lbl" style={{ marginTop: '3px' }}>
            {ficha.score.corte !== null ? `corte em ${ficha.score.corte}` : 'sem corte'}
            {ficha.score.fila ? ` · fila ${ficha.score.fila}` : ' · sem fila'}
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Respostas de formulário, por formulário e por versão. Nunca como colunas
 * soltas: é a decisão que evita os 304 campos customizados do Lead de hoje.
 */
function Formularios({ ficha, fuso }: { ficha: Ficha; fuso: string }) {
  if (ficha.formularios.length === 0) {
    return <div className="vazio">Este lead não respondeu nenhum formulário.</div>;
  }

  return (
    <>
      {ficha.formularios.map((f) => (
        <div className="form-versao" key={`${f.formulario}-${f.versao}`}>
          <div className="cab">
            <b>{f.formulario}</b>
            <Etiqueta>versão {f.versao}</Etiqueta>
            <span className="lbl" style={{ marginLeft: 'auto' }}>
              {data(f.respondidoEm, fuso)}
            </span>
          </div>
          <div className="campos">
            {f.respostas.map((r) => (
              <Campo key={r.pergunta} k={r.pergunta} v={r.valor} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
