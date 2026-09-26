import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Etiqueta, Tabela, type Column } from '@pipe/ui';
import {
  AbasDaFicha,
  Campo,
  Destaque,
  Section,
  SectionAttributes,
} from '../../../components/ficha';
import { fusoDoTenant } from '../../../lib/database';
import {
  loadAccount,
  type AccountContact,
  type AccountRecord,
  type AccountOpportunity,
} from '../../../lib/accounts';
import { data, desde, money, document, numero } from '../../../lib/format';

export const dynamic = 'force-dynamic';

/**
 * The account record, in the same structure as the lead record.
 *
 * It used to be the CRM's poorest screen: a plain page header, a strip of four
 * numbers, and two stacked tables. Now it has what the lead's record has, for the
 * same reasons — a highlight header, a sidebar with the data in sections, and tabs
 * for the heavy content. The pieces come from `componentes/ficha.tsx`, so the three
 * records can't drift apart.
 *
 * The content split follows what `lib/contas.ts` already said the account answers:
 * **who do I know inside it** and **how much money is at stake**. The sidebar
 * answers the first in a short, always-visible list; the tabs answer both in full
 * tables.
 */

const ABAS = [
  { key: 'oportunidades', rotulo: 'Oportunidades' },
  { key: 'contatos', rotulo: 'Contatos' },
] as const;

type TabAccount = (typeof ABAS)[number]['key'];

function abaValida(value: string | undefined): TabAccount {
  return (ABAS.find((a) => a.key === value)?.key ?? 'oportunidades') as TabAccount;
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
 * A closed opportunity doesn't leave the list: it's the account's history, and it's
 * what answers "have they ever bought before". The only color on the screen is an
 * overdue close date on an opportunity that's still open — everything else is a
 * category.
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
        if (o.closingExpected && o.closingExpected < hoje) {
          return <Etiqueta tom="alerta">venceu em {data(o.closingExpected, fuso)}</Etiqueta>;
        }
        return o.closingExpected ? (
          <Etiqueta>fecha em {data(o.closingExpected, fuso)}</Etiqueta>
        ) : (
          '—'
        );
      },
    },
  ];
}

function AccountHighlight({ ficha, fuso }: { ficha: AccountRecord; fuso: string }) {
  const abertas = ficha.opportunities.filter((o) => o.fechadaEm === null).length;

  return (
    <Destaque
      trilha={{ href: '/accounts', rotulo: 'Contas' }}
      nome={ficha.nome}
      nota={ficha.criadoEm ? `aberta ${desde(ficha.criadoEm, fuso)}` : undefined}
      // Domain is a category, and categories are neutral. The account has no state
      // that's terminal or has a deadline, so none of its badges get color.
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
        { rotulo: 'Em negociação', numerico: true, value: money(ficha.valueOpen) },
        { rotulo: 'Já fechado', numerico: true, value: money(ficha.valueWon) },
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
      <AccountHighlight ficha={ficha} fuso={fuso} />

      <div className="ficha">
        <aside className="column">
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
 * The short list of who to talk to. It's in the sidebar, not just in a tab, because
 * it's what the person checks WHILE reading the opportunities: the name of whoever
 * signs on the other side shouldn't require switching tabs.
 */}
          <div className="tblwrap">
            <Section titulo="Quem falar" aberta={ficha.contacts.length > 0}>
              {ficha.contacts.length === 0 ? (
                <div className="empty">Nenhum contato ligado a esta conta.</div>
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
            <SectionAttributes atributos={ficha.atributos} />
          </div>
        </aside>

        <div className="column">
          <div className="tblwrap">
            <AbasDaFicha
              base={`/accounts/${ficha.id}`}
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
                  rowKey={(o) => o.id}
                  empty="Nenhuma oportunidade nesta conta."
                />
                <div className="message">
                  A oportunidade fechada continua na lista: é ela que responde se esta conta já
                  comprou.
                </div>
              </>
            ) : null}

            {aba === 'contatos' ? (
              <Tabela
                colunas={COLUMNS_CONTACT}
                linhas={ficha.contacts}
                rowKey={(c) => c.id}
                empty="Nenhum contato ligado a esta conta."
              />
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
