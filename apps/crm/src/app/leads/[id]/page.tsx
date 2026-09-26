import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Etiqueta } from '@pipe/ui';
import { CelulaInline } from '../../../components/celula-inline';
import {
  AbasDaFicha,
  Campo,
  Destaque,
  Section,
  SectionAtributos,
} from '../../../components/ficha';
import { TimeLinha } from '../../../components/linha-of-time';
import { fusoDoTenant } from '../../../lib/database';
import {
  carregarFicha,
  listarProprietarios,
  ROTULO_STATUS,
  type Ficha,
} from '../../../lib/leads';
import { data, dataHora, desde, document, numero, pontos } from '../../../lib/format';

export const dynamic = 'force-dynamic';

/**
 * The lead record, in the structure Twenty uses and we didn't.
 *
 * What reading their approach changed here, in order of importance:
 *
 * 1. **Highlight header.** The name used to be an `h2` with four loose badges next
 *    to it. Now it's an identity strip (avatar, name, state) plus a row of fields
 *    that decide what to do with this lead: owner, score, stage, days stalled, and
 *    source. It's Salesforce's "highlight panel" and Twenty's "identifier bar",
 *    which arrived at the same design without talking to each other.
 * 2. **Internal tabs.** Score, Forms, and Timeline used to be three blocks stacked
 *    in an infinitely scrolling column. They became tabs, and the tab lives in the
 *    URL: a record opened on the timeline is an address you can paste into chat.
 * 3. **Fixed sidebar column** with fields in sections that expand and collapse,
 *    instead of three equal-height boxes competing for attention with the score
 *    panel.
 *
 * What we deliberately did NOT copy: they pin the first tab ("Home") as the sidebar
 * and leave the rest as tabs. We pin the DATA in the sidebar and put the SCORE as
 * the first tab, because explaining the score is what this product has and theirs
 * doesn't — it can't be the tab nobody opens.
 *
 * The tabs are links, not client state. The whole record is still server-rendered:
 * without JavaScript, it works the same.
 */

const ABAS = [
  { key: 'score', rotulo: 'Score' },
  { key: 'formularios', rotulo: 'Formulários' },
  { key: 'tempo', rotulo: 'Linha do tempo' },
] as const;

type AbaFicha = (typeof ABAS)[number]['key'];

function abaValida(value: string | undefined): AbaFicha {
  return (ABAS.find((a) => a.key === value)?.key ?? 'score') as AbaFicha;
}

/** The lead's highlight, built on top of the piece shared by all three records. */
function DestaqueDoLead({ ficha, fuso }: { ficha: Ficha; fuso: string }) {
  const parado = ficha.diasNaFase !== null && ficha.diasNaFase >= 7;
  const desqualificado = ficha.status === 'desqualificado';

  return (
    <Destaque
      trilha={{ href: '/leads', rotulo: 'Leads' }}
      nome={ficha.nome}
      nota={`criado ${desde(ficha.criadoEm, fuso)}`}
      etiquetas={
        <>
          {/*
 * State shown as badges, and only two can have color: disqualification, the only
 * terminal state, and being stalled for more than seven days, which is what someone
 * needs to act on today. Stage and band are categories, and categories are
 * neutral.
 */}
          {desqualificado ? (
            <Etiqueta tom="erro">{ROTULO_STATUS['desqualificado']}</Etiqueta>
          ) : (
            <Etiqueta>{ROTULO_STATUS[ficha.status] ?? ficha.status}</Etiqueta>
          )}
          {ficha.diasNaFase !== null && parado && !desqualificado ? (
            <Etiqueta tom="alerta">parado há {numero(ficha.diasNaFase)} dias</Etiqueta>
          ) : null}
        </>
      }
      main={[
        {
          rotulo: 'Score',
          numerico: true,
          value: ficha.score ? numero(ficha.score.value) : '—',
          nota: ficha.score?.faixa,
        },
        {
          rotulo: 'Fase',
          value: ficha.fase ?? '—',
          nota: ficha.diasNaFase === null ? null : `há ${numero(ficha.diasNaFase)} dias`,
        },
        { rotulo: 'Proprietário', value: ficha.proprietario ?? 'sem proprietário' },
        { rotulo: 'Origem', value: ficha.origem ?? '—', nota: ficha.campanha },
        {
          rotulo: 'Conta',
          value: ficha.accountId ? (
            <Link href={`/accounts/${ficha.accountId}`}>{ficha.accountName}</Link>
          ) : (
            (ficha.accountName ?? '—')
          ),
        },
      ]}
    />
  );
}

export default async function PageFicha({
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
  // Who can receive the lead. It's fetched here and not inside the cell because the list is
  // the same for all five sidebar fields, and one query serves all five.
  const proprietarios = await listarProprietarios();
  const agora = new Date();
  // UTM and custom fields share the same section, and the prefix is what keeps
  // them distinguishable without two boxes saying the same thing.
  const atributos = {
    ...ficha.customizados,
    ...Object.fromEntries(Object.entries(ficha.utm).map(([k, v]) => [`utm ${k}`, v])),
  };

  const count: Record<AbaFicha, number | null> = {
    score: ficha.score?.itens.length ?? null,
    formularios: ficha.formularios.length,
    tempo: ficha.timeLinha.length,
  };

  return (
    <>
      <DestaqueDoLead ficha={ficha} fuso={fuso} />

      <div className="ficha">
        {/*
 * The fixed sidebar: the data describing the lead. It stays visible at all times
 * because it's what the person checks while reading any of the tabs.
 */}
        <aside className="column">
          <div className="tblwrap">
            {/*
 * The sidebar is where you EDIT, like in Twenty: simple fields swap their value in
 * place, with no form and without leaving the page. The header strip stays a
 * summary — it's the same split Salesforce and Twenty both make, and repeating the
 * field in both places is their pattern too: one repeats it for a quick read, the
 * other for editing.
 *
 * Document, "created at", and "in stage since" are left out: the first needs
 * CPF/CNPJ validation that doesn't exist yet, and the other two are system
 * timestamps — a date the person types in is a date that stops meaning when the
 * thing actually happened.
 */}
            <Section titulo="Dados">
              <div className="campos">
                <Campo
                  k="E-mail"
                  v={<CelulaInline leadId={ficha.id} campo="email" value={ficha.email} />}
                />
                <Campo
                  k="Telefone"
                  v={<CelulaInline leadId={ficha.id} campo="telefone" value={ficha.telefone} />}
                />
                <Campo
                  k="Proprietário"
                  v={
                    <CelulaInline
                      leadId={ficha.id}
                      campo="proprietario"
                      value={ficha.proprietarioId}
                      options={proprietarios}
                    />
                  }
                />
                <Campo
                  k="Origem"
                  v={<CelulaInline leadId={ficha.id} campo="origem" value={ficha.origem} />}
                />
                <Campo
                  k="Campanha"
                  v={<CelulaInline leadId={ficha.id} campo="campanha" value={ficha.campanha} />}
                />
                <Campo k="Documento" v={document(ficha.document)} />
                <Campo k="Criado em" v={data(ficha.criadoEm, fuso)} />
                <Campo k="Fase desde" v={data(ficha.faseDesde, fuso)} />
              </div>
            </Section>
          </div>

          <div className="tblwrap">
            <SectionAtributos atributos={atributos} />
          </div>

          <div className="tblwrap">
            <Section titulo="Etiquetas" aberta={ficha.etiquetas.length > 0}>
              {ficha.etiquetas.length === 0 ? (
                <div className="empty">Sem etiquetas.</div>
              ) : (
                <div className="etiquetas">
                  {ficha.etiquetas.map((e) => (
                    <Etiqueta key={e.nome}>{e.nome}</Etiqueta>
                  ))}
                </div>
              )}
            </Section>
          </div>
        </aside>

        <div className="column">
          <div className="tblwrap">
            <AbasDaFicha
              base={`/leads/${ficha.id}`}
              aba={aba}
              abas={ABAS.map((a) => ({ ...a, count: count[a.key] }))}
              formatar={numero}
            />

            {aba === 'score' ? <PanelScore ficha={ficha} fuso={fuso} /> : null}
            {aba === 'formularios' ? <Formularios ficha={ficha} fuso={fuso} /> : null}
            {aba === 'tempo' ? (
              <TimeLinha itens={ficha.timeLinha} fuso={fuso} agora={agora} />
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * The panel that explains the number. Rule by rule, how much was added and how much
 * was subtracted, with the rule's version and the time it was calculated, read from
 * `score_lead.explicacao` and not recalculated on screen.
 *
 * It's the only screen in the CRM where color doesn't indicate an action and is
 * still meaningful: here green and red ARE the information, and it's the screen
 * that justifies the product. That's why it's the first tab, not the last.
 */
function PanelScore({ ficha, fuso }: { ficha: Ficha; fuso: string }) {
  if (!ficha.score) {
    return (
      <div className="empty">
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
          Como {ficha.nome} tirou {numero(ficha.score.value)}
        </b>
        <span className="lbl">
          Regra de score v{ficha.score.versaoRegra} · {dataHora(ficha.score.calculadoEm, fuso)}
        </span>
      </header>

      {ficha.score.itens.length === 0 ? (
        <div className="empty">
          Nenhuma regra casou com este lead: o score {numero(ficha.score.value)} é o valor de
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
        <span className="n">{numero(ficha.score.value)}</span>
        <div>
          <Etiqueta>Faixa {ficha.score.faixa ?? 'não definida'}</Etiqueta>
          <div className="lbl" style={{ marginTop: '3px' }}>
            {ficha.score.corte !== null ? `corte em ${ficha.score.corte}` : 'sem corte'}
            {ficha.score.queue ? ` · fila ${ficha.score.queue}` : ' · sem fila'}
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Form responses, by form and by version. Never as loose columns: that's the
 * decision that avoids today's 304 custom fields on the Lead.
 */
function Formularios({ ficha, fuso }: { ficha: Ficha; fuso: string }) {
  if (ficha.formularios.length === 0) {
    return <div className="empty">Este lead não respondeu nenhum formulário.</div>;
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
              <Campo key={r.pergunta} k={r.pergunta} v={r.value} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
