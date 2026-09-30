import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Etiqueta } from '@pipe/ui';
import {
  AbasDaFicha,
  Campo,
  Destaque,
  Section,
  SectionAttributes,
} from '../../../components/ficha';
import { fusoDoTenant } from '../../../lib/database';
import { loadContact, type ContactRecord } from '../../../lib/contacts';
import { ROTULO_STATUS } from '../../../lib/leads';
import { data, dataHora, desde, document, numero } from '../../../lib/format';

export const dynamic = 'force-dynamic';

/**
 * The contact record, in the same structure as the lead record.
 *
 * The difference between the two is what the data model says: **the contact is the
 * person, the lead is their intent to buy.** The person stays the same when the
 * intent disappears, which is why the lead tab can be empty without the record
 * itself being empty. The highlight says who the person is; the tabs say what
 * happened to them — conversation on one side, buying intent on the other.
 */

const LABEL_STATE: Record<string, string> = {
  com_bot: 'Com o bot',
  na_fila: 'Na fila',
  atribuida: 'Atribuída',
  em_atendimento: 'Em atendimento',
  em_espera: 'Em espera',
  encerrada: 'Encerrada',
};

const ABAS = [
  { key: 'conversas', rotulo: 'Conversas' },
  { key: 'lead', rotulo: 'Lead' },
] as const;

type TabContact = (typeof ABAS)[number]['key'];

function abaValida(value: string | undefined): TabContact {
  return (ABAS.find((a) => a.key === value)?.key ?? 'conversas') as TabContact;
}

function ContactHighlight({ ficha, fuso }: { ficha: ContactRecord; fuso: string }) {
  const desqualificado = ficha.leadStatus === 'desqualificado';

  return (
    <Destaque
      trilha={{ href: '/contacts', rotulo: 'Contatos' }}
      nome={ficha.nome}
      nota={ficha.criadoEm ? `conhecido ${desde(ficha.criadoEm, fuso)}` : undefined}
      etiquetas={
        // The only possible color here is the lead's disqualification, which is the
        // terminal state. The person has no state: they simply exist.
        ficha.leadId === null ? null : desqualificado ? (
          <Etiqueta tom="erro">{ROTULO_STATUS['desqualificado']}</Etiqueta>
        ) : (
          <Etiqueta>{ROTULO_STATUS[ficha.leadStatus ?? ''] ?? ficha.leadStatus}</Etiqueta>
        )
      }
      main={[
        {
          rotulo: 'Conta',
          value: ficha.accountId ? (
            <Link href={`/accounts/${ficha.accountId}`}>{ficha.accountName}</Link>
          ) : (
            'sem conta'
          ),
        },
        {
          rotulo: 'Score',
          numerico: true,
          value: ficha.score === null ? '—' : numero(ficha.score),
          nota: ficha.faixa,
        },
        { rotulo: 'Fase', value: ficha.leadFase ?? (ficha.leadId ? '—' : 'ainda não é lead') },
        { rotulo: 'Origem', value: ficha.origem ?? '—' },
        { rotulo: 'Conversas', numerico: true, value: numero(ficha.conversations.length) },
      ]}
    />
  );
}

export default async function PageContact({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const { id } = await params;
  const { aba: abaCrua } = await searchParams;
  const aba = abaValida(abaCrua);

  const ficha = await loadContact(id);
  if (!ficha) notFound();

  const fuso = await fusoDoTenant();
  const desqualificado = ficha.leadStatus === 'desqualificado';

  return (
    <>
      <ContactHighlight ficha={ficha} fuso={fuso} />

      <div className="ficha">
        <aside className="column">
          <div className="tblwrap">
            <Section titulo="Dados">
              <div className="campos">
                <Campo k="E-mail" v={ficha.email ?? '—'} />
                <Campo k="Telefone" v={ficha.telefone ?? '—'} />
                <Campo k="Documento" v={document(ficha.document)} />
                <Campo
                  k="Conta"
                  v={
                    ficha.accountId ? (
                      <Link href={`/accounts/${ficha.accountId}`}>{ficha.accountName}</Link>
                    ) : (
                      '—'
                    )
                  }
                />
                <Campo k="Criado em" v={data(ficha.criadoEm, fuso)} />
              </div>
            </Section>
          </div>

          <div className="tblwrap">
            <SectionAttributes atributos={ficha.atributos} />
          </div>
        </aside>

        <div className="column">
          <div className="tblwrap">
            <AbasDaFicha
              base={`/contacts/${ficha.id}`}
              aba={aba}
              abas={[
                { ...ABAS[0], count: ficha.conversations.length },
                { ...ABAS[1], count: ficha.leadId ? 1 : 0 },
              ]}
              formatar={numero}
            />

            {/*
 * The conversations. This is the product's promise on the contact side: whoever opens
 * the person sees what's already been handled without needing the Desk.
 */}
            {aba === 'conversas' ? (
              ficha.conversations.length === 0 ? (
                <div className="empty">Esta pessoa nunca conversou com o atendimento.</div>
              ) : (
                <ul className="time">
                  {ficha.conversations.map((c) => (
                    <li key={c.id}>
                      <span className="quando">{dataHora(c.criadaEm, fuso)}</span>
                      <span>
                        <span className="t">
                          {c.categoria ?? LABEL_STATE[c.state] ?? c.state}
                        </span>
                        {c.queue ? <span className="quem"> · {c.queue}</span> : null}
                        {c.agent ? <span className="quem"> · {c.agent}</span> : null}
                        {c.encerradaEm ? null : (
                          <span className="quem"> · {LABEL_STATE[c.state] ?? c.state}</span>
                        )}
                      </span>
                      {c.resumo ? <div className="resumo">{c.resumo}</div> : null}
                    </li>
                  ))}
                </ul>
              )
            ) : null}

            {aba === 'lead' ? (
              !ficha.leadId ? (
                <div className="empty">
                  <b>Esta pessoa ainda não virou lead.</b>
                  <span>
                    Contato e lead são coisas diferentes: a pessoa existe desde a primeira
                    conversa, o lead só quando há intenção de compra.
                  </span>
                </div>
              ) : (
                <>
                  <div className="campos">
                    <Campo
                      k="Situação"
                      v={
                        desqualificado ? (
                          <Etiqueta tom="erro">{ROTULO_STATUS['desqualificado']}</Etiqueta>
                        ) : (
                          <Etiqueta>
                            {ROTULO_STATUS[ficha.leadStatus ?? ''] ?? ficha.leadStatus}
                          </Etiqueta>
                        )
                      }
                    />
                    <Campo
                      k="Fase"
                      v={ficha.leadFase ? <Etiqueta>{ficha.leadFase}</Etiqueta> : '—'}
                    />
                    <Campo
                      k="Score"
                      v={
                        ficha.score === null
                          ? 'sem cálculo'
                          : `${numero(ficha.score)}${ficha.faixa ? ` · ${ficha.faixa}` : ''}`
                      }
                    />
                    <Campo
                      k="Origem"
                      v={ficha.origem ? <Etiqueta>{ficha.origem}</Etiqueta> : '—'}
                    />
                    <Campo k="Proprietário" v={ficha.proprietario ?? 'sem proprietário'} />
                  </div>
                  <div className="message">
                    <Link href={`/leads/${ficha.leadId}`}>Abrir a ficha do lead</Link> para ver a
                    explicação do score e as respostas de formulário.
                  </div>
                </>
              )
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
