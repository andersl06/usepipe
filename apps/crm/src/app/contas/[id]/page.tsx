import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Etiqueta, Tabela, type Column } from '@pipe/ui';
import {
  AbasDaFicha,
  Campo,
  Destaque,
  Section,
  SectionAtributos,
} from '../../../componentes/ficha';
import { fusoDoTenant } from '../../../lib/banco';
import {
  loadAccount,
  type AccountContact,
  type FichaAccount,
  type AccountOpportunity,
} from '../../../lib/contas';
import { data, desde, money, document, numero } from '../../../lib/formato';

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

type AbaAccount = (typeof ABAS)[number]['chave'];

function abaValida(value: string | undefined): AbaAccount {
  return (ABAS.find((a) => a.chave === value)?.chave ?? 'oportunidades') as AbaAccount;
}

const COLUMNS_CONTACT: readonly Column<AccountContact>[] = [
  {
    key: 'nome',
    rotulo: 'Contato',
    celula: (c) => <Link href={`/contacts/${c.id}`}>{c.nome}</Link>,
  },
  { key: 'email', rotulo: 'E-mail', celula: (c) => c.email ?? '—' },
  { key: 'telefone', rotulo: 'Telefone', numerica: true, celula: (c) => c.telefone ?? '—' },
  {
    key: 'score',
    rotulo: 'Score',
    numerica: true,
    celula: (c) => (c.score === null ? '—' : numero(c.score)),
  },
  { key: 'faixa', rotulo: 'Faixa', celula: (c) => (c.faixa ? <Etiqueta>{c.faixa}</Etiqueta> : '—') },
  {
    key: 'lead',
    rotulo: 'Lead',
    celula: (c) => (c.leadId ? <Link href={`/leads/${c.leadId}`}>abrir</Link> : '—'),
  },
];

/**
 * A oportunidade fechada não sai da lista: ela é o histórico da conta, e é o
 * que responde "já compraram alguma vez". A única cor da tela é o fechamento
 * vencido de uma oportunidade que continua aberta — o resto é categoria.
 */
function columnsOpportunity(hoje: Date, fuso: string): readonly Column<AccountOpportunity>[] {
  return [
    {
      key: 'nome',
      rotulo: 'Oportunidade',
      celula: (o) => <Link href={`/opportunities/${o.id}`}>{o.nome}</Link>,
    },
    { key: 'fase', rotulo: 'Fase', celula: (o) => <Etiqueta>{o.fase}</Etiqueta> },
    { key: 'valor', rotulo: 'Valor', numerica: true, celula: (o) => money(o.value) },
    {
      key: 'probabilidade',
      rotulo: 'Probabilidade',
      numerica: true,
      celula: (o) => (o.probability === null ? '—' : `${o.probability}%`),
    },
    { key: 'dono', rotulo: 'Proprietário', celula: (o) => o.proprietario ?? '—' },
    {
      key: 'situacao',
      rotulo: 'Situação',
      celula: (o) => {
        if (o.fechadaEm) {
          return <Etiqueta>{o.ganha ? 'Ganha' : 'Perdida'} em {data(o.fechadaEm, fuso)}</Etiqueta>;
        }
        if (o.closingPrevisto && o.closingPrevisto < hoje) {
          return <Etiqueta tom="alert">venceu em {data(o.closingPrevisto, fuso)}</Etiqueta>;
        }
        return o.closingPrevisto ? (
          <Etiqueta>fecha em {data(o.closingPrevisto, fuso)}</Etiqueta>
        ) : (
          '—'
        );
      },
    },
  ];
}

function AccountDestaque({ ficha, fuso }: { ficha: FichaAccount; fuso: string }) {
  const abertas = ficha.opportunities.filter((o) => o.fechadaEm === null).length;

  return (
    <Destaque
      trilha={{ href: '/contas', rotulo: 'Contas' }}
      nome={ficha.nome}
      nota={ficha.criadoEm ? `aberta ${desde(ficha.criadoEm, fuso)}` : undefined}
      // Domínio é categoria, e categoria é neutra. A conta não tem estado
      // terminal nem prazo, então nenhuma etiqueta dela recebe cor.
      etiquetas={ficha.domain ? <Etiqueta>{ficha.domain}</Etiqueta> : null}
      main={[
        { rotulo: 'Proprietário', value: ficha.proprietario ?? 'sem proprietário' },
        { rotulo: 'Contatos', numerico: true, value: numero(ficha.contacts.length) },
        {
          rotulo: 'Oportunidades',
          numerico: true,
          value: numero(abertas),
          nota: abertas === ficha.opportunities.length ? null : `de ${ficha.opportunities.length}`,
        },
        { rotulo: 'Em negociação', numerico: true, value: money(ficha.valueAberto) },
        { rotulo: 'Já fechado', numerico: true, value: money(ficha.valueGanho) },
      ]}
    />
  );
}

export default async function PageAccount({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const { id } = await params;
  const { aba: abaCrua } = await searchParams;
  const aba = abaValida(abaCrua);

  const ficha = await loadAccount(id);
  if (!ficha) notFound();

  const fuso = await fusoDoTenant();
  const hoje = new Date();

  return (
    <>
      <AccountDestaque ficha={ficha} fuso={fuso} />

      <div className="ficha">
        <aside className="coluna">
          <div className="tblwrap">
            <Section titulo="Dados">
              <div className="campos">
                <Campo k="Documento" v={document(ficha.document)} />
                <Campo k="Domínio" v={ficha.domain ?? '—'} />
                <Campo k="Proprietário" v={ficha.proprietario ?? 'sem proprietário'} />
                <Campo k="Aberta em" v={data(ficha.criadoEm, fuso)} />
              </div>
            </Section>
          </div>

          {/*
            A lista curta de quem falar. Fica na lateral, e não só na aba, porque
            é o que a pessoa consulta ENQUANTO lê as oportunidades: o nome de
            quem assina do outro lado não pode exigir uma troca de aba.
          */}
          <div className="tblwrap">
            <Section titulo="Quem falar" aberta={ficha.contacts.length > 0}>
              {ficha.contacts.length === 0 ? (
                <div className="vazio">Nenhum contato ligado a esta conta.</div>
              ) : (
                <div className="campos">
                  {ficha.contacts.map((c) => (
                    <Campo
                      key={c.id}
                      k={c.faixa ?? 'contato'}
                      v={<Link href={`/contacts/${c.id}`}>{c.nome}</Link>}
                    />
                  ))}
                </div>
              )}
            </Section>
          </div>

          <div className="tblwrap">
            <SectionAtributos atributos={ficha.atributos} />
          </div>
        </aside>

        <div className="coluna">
          <div className="tblwrap">
            <AbasDaFicha
              base={`/contas/${ficha.id}`}
              aba={aba}
              abas={[
                { ...ABAS[0], count: ficha.opportunities.length },
                { ...ABAS[1], count: ficha.contacts.length },
              ]}
              formatar={numero}
            />

            {aba === 'oportunidades' ? (
              <>
                <Tabela
                  colunas={columnsOpportunity(hoje, fuso)}
                  linhas={ficha.opportunities}
                  linhaKey={(o) => o.id}
                  empty="Nenhuma oportunidade nesta conta."
                />
                <div className="mensagem">
                  A oportunidade fechada continua na lista: é ela que responde se esta conta já
                  comprou.
                </div>
              </>
            ) : null}

            {aba === 'contacts' ? (
              <Tabela
                colunas={COLUMNS_CONTACT}
                linhas={ficha.contacts}
                linhaKey={(c) => c.id}
                empty="Nenhum contato ligado a esta conta."
              />
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
