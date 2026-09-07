import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Etiqueta, Tabela, type Coluna } from '@pipe/ui';
import {
  AbasDaFicha,
  Campo,
  Destaque,
  Secao,
  SecaoAtributos,
} from '../../../componentes/ficha';
import { fusoDoTenant } from '../../../lib/banco';
import {
  carregarConta,
  type ContatoDaConta,
  type FichaConta,
  type OportunidadeDaConta,
} from '../../../lib/contas';
import { data, desde, dinheiro, documento, numero } from '../../../lib/formato';

export const dynamic = 'force-dynamic';

/**
 * A ficha da conta, na mesma estrutura da ficha do lead.
 *
 * Ela era a tela mais pobre do CRM: um cabeçalho de página comum, uma tira de
 * quatro números e duas tabelas empilhadas. Agora tem o que a do lead tem, pelas
 * mesmas razões — cabeçalho de destaque, lateral com os dados em seções, e abas
 * para o conteúdo pesado. As peças vêm de `componentes/ficha.tsx`, então as três
 * fichas não têm como divergir.
 *
 * A divisão de conteúdo segue o que `lib/contas.ts` já dizia que a conta
 * responde: **quem eu conheço lá dentro** e **quanto dinheiro está em jogo**. A
 * lateral responde a primeira em lista curta, sempre visível; as abas respondem
 * as duas em tabela cheia.
 */

const ABAS = [
  { chave: 'oportunidades', rotulo: 'Oportunidades' },
  { chave: 'contatos', rotulo: 'Contatos' },
] as const;

type AbaConta = (typeof ABAS)[number]['chave'];

function abaValida(valor: string | undefined): AbaConta {
  return (ABAS.find((a) => a.chave === valor)?.chave ?? 'oportunidades') as AbaConta;
}

const COLUNAS_CONTATO: readonly Coluna<ContatoDaConta>[] = [
  {
    chave: 'nome',
    rotulo: 'Contato',
    celula: (c) => <Link href={`/contatos/${c.id}`}>{c.nome}</Link>,
  },
  { chave: 'email', rotulo: 'E-mail', celula: (c) => c.email ?? '—' },
  { chave: 'telefone', rotulo: 'Telefone', numerica: true, celula: (c) => c.telefone ?? '—' },
  {
    chave: 'score',
    rotulo: 'Score',
    numerica: true,
    celula: (c) => (c.score === null ? '—' : numero(c.score)),
  },
  { chave: 'faixa', rotulo: 'Faixa', celula: (c) => (c.faixa ? <Etiqueta>{c.faixa}</Etiqueta> : '—') },
  {
    chave: 'lead',
    rotulo: 'Lead',
    celula: (c) => (c.leadId ? <Link href={`/leads/${c.leadId}`}>abrir</Link> : '—'),
  },
];

/**
 * A oportunidade fechada não sai da lista: ela é o histórico da conta, e é o
 * que responde "já compraram alguma vez". A única cor da tela é o fechamento
 * vencido de uma oportunidade que continua aberta — o resto é categoria.
 */
function colunasOportunidade(hoje: Date, fuso: string): readonly Coluna<OportunidadeDaConta>[] {
  return [
    {
      chave: 'nome',
      rotulo: 'Oportunidade',
      celula: (o) => <Link href={`/oportunidades/${o.id}`}>{o.nome}</Link>,
    },
    { chave: 'fase', rotulo: 'Fase', celula: (o) => <Etiqueta>{o.fase}</Etiqueta> },
    { chave: 'valor', rotulo: 'Valor', numerica: true, celula: (o) => dinheiro(o.valor) },
    {
      chave: 'probabilidade',
      rotulo: 'Probabilidade',
      numerica: true,
      celula: (o) => (o.probabilidade === null ? '—' : `${o.probabilidade}%`),
    },
    { chave: 'dono', rotulo: 'Proprietário', celula: (o) => o.proprietario ?? '—' },
    {
      chave: 'situacao',
      rotulo: 'Situação',
      celula: (o) => {
        if (o.fechadaEm) {
          return <Etiqueta>{o.ganha ? 'Ganha' : 'Perdida'} em {data(o.fechadaEm, fuso)}</Etiqueta>;
        }
        if (o.fechamentoPrevisto && o.fechamentoPrevisto < hoje) {
          return <Etiqueta tom="alerta">venceu em {data(o.fechamentoPrevisto, fuso)}</Etiqueta>;
        }
        return o.fechamentoPrevisto ? (
          <Etiqueta>fecha em {data(o.fechamentoPrevisto, fuso)}</Etiqueta>
        ) : (
          '—'
        );
      },
    },
  ];
}

function DestaqueDaConta({ ficha, fuso }: { ficha: FichaConta; fuso: string }) {
  const abertas = ficha.oportunidades.filter((o) => o.fechadaEm === null).length;

  return (
    <Destaque
      trilha={{ href: '/contas', rotulo: 'Contas' }}
      nome={ficha.nome}
      nota={ficha.criadoEm ? `aberta ${desde(ficha.criadoEm, fuso)}` : undefined}
      // Domínio é categoria, e categoria é neutra. A conta não tem estado
      // terminal nem prazo, então nenhuma etiqueta dela recebe cor.
      etiquetas={ficha.dominio ? <Etiqueta>{ficha.dominio}</Etiqueta> : null}
      principais={[
        { rotulo: 'Proprietário', valor: ficha.proprietario ?? 'sem proprietário' },
        { rotulo: 'Contatos', numerico: true, valor: numero(ficha.contatos.length) },
        {
          rotulo: 'Oportunidades',
          numerico: true,
          valor: numero(abertas),
          nota: abertas === ficha.oportunidades.length ? null : `de ${ficha.oportunidades.length}`,
        },
        { rotulo: 'Em negociação', numerico: true, valor: dinheiro(ficha.valorAberto) },
        { rotulo: 'Já fechado', numerico: true, valor: dinheiro(ficha.valorGanho) },
      ]}
    />
  );
}

export default async function PaginaConta({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const { id } = await params;
  const { aba: abaCrua } = await searchParams;
  const aba = abaValida(abaCrua);

  const ficha = await carregarConta(id);
  if (!ficha) notFound();

  const fuso = await fusoDoTenant();
  const hoje = new Date();

  return (
    <>
      <DestaqueDaConta ficha={ficha} fuso={fuso} />

      <div className="ficha">
        <aside className="coluna">
          <div className="tblwrap">
            <Secao titulo="Dados">
              <div className="campos">
                <Campo k="Documento" v={documento(ficha.documento)} />
                <Campo k="Domínio" v={ficha.dominio ?? '—'} />
                <Campo k="Proprietário" v={ficha.proprietario ?? 'sem proprietário'} />
                <Campo k="Aberta em" v={data(ficha.criadoEm, fuso)} />
              </div>
            </Secao>
          </div>

          {/*
            A lista curta de quem falar. Fica na lateral, e não só na aba, porque
            é o que a pessoa consulta ENQUANTO lê as oportunidades: o nome de
            quem assina do outro lado não pode exigir uma troca de aba.
          */}
          <div className="tblwrap">
            <Secao titulo="Quem falar" aberta={ficha.contatos.length > 0}>
              {ficha.contatos.length === 0 ? (
                <div className="vazio">Nenhum contato ligado a esta conta.</div>
              ) : (
                <div className="campos">
                  {ficha.contatos.map((c) => (
                    <Campo
                      key={c.id}
                      k={c.faixa ?? 'contato'}
                      v={<Link href={`/contatos/${c.id}`}>{c.nome}</Link>}
                    />
                  ))}
                </div>
              )}
            </Secao>
          </div>

          <div className="tblwrap">
            <SecaoAtributos atributos={ficha.atributos} />
          </div>
        </aside>

        <div className="coluna">
          <div className="tblwrap">
            <AbasDaFicha
              base={`/contas/${ficha.id}`}
              aba={aba}
              abas={[
                { ...ABAS[0], contagem: ficha.oportunidades.length },
                { ...ABAS[1], contagem: ficha.contatos.length },
              ]}
              formatar={numero}
            />

            {aba === 'oportunidades' ? (
              <>
                <Tabela
                  colunas={colunasOportunidade(hoje, fuso)}
                  linhas={ficha.oportunidades}
                  chaveDaLinha={(o) => o.id}
                  vazio="Nenhuma oportunidade nesta conta."
                />
                <div className="mensagem">
                  A oportunidade fechada continua na lista: é ela que responde se esta conta já
                  comprou.
                </div>
              </>
            ) : null}

            {aba === 'contatos' ? (
              <Tabela
                colunas={COLUNAS_CONTATO}
                linhas={ficha.contatos}
                chaveDaLinha={(c) => c.id}
                vazio="Nenhum contato ligado a esta conta."
              />
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
