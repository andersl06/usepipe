import { Icone, type NomeDeIcone } from '@pipe/ui';
import { IconeCrm, type NomeDeIconeCrm } from './icones-crm';
import type { TimeItemLinha } from '../lib/leads';
import { desde, dataHora } from '../lib/format';

/**
 * The lead's timeline.
 *
 * Three things came from reading Twenty, and each solves a problem the previous
 * version had:
 *
 * 1. **Grouping by month.** Forty events in one running list have no sense of
 *    time at all. The month divider gives that reference, and the year only
 *    shows up when it changes, because repeating "2026" twelve times says
 *    nothing.
 * 2. **A vertical rail connecting the icons.** It's what makes the column read
 *    as a sequence instead of a stack of loose lines. The rail stops at the
 *    month's last event, otherwise it points at emptiness.
 * 3. **Relative time on the right, absolute in the `title`.** "3 days ago" is
 *    what the person wants to know; the exact date is what they check once in
 *    twenty times.
 *
 * What we didn't copy: the field-by-field diff for change events. It assumes a
 * per-field audit record that doesn't exist in our `atividade`, and inventing
 * one now would mean building the screen before the data.
 *
 * The rail's measurement is 26px, the same as theirs, for a reason that isn't
 * imitation: it's the smallest value where a 16px icon fits centered with
 * visible slack on both sides on our 4px scale.
 */

const RAIL = 26;

/**
 * Event type for rendering. Whatever doesn't match falls back to the clock,
 * which is honest: it happened, it has a time, and we can't say more than that.
 */
const ICONE: Record<string, NomeDeIcone | NomeDeIconeCrm> = {
  Nota: 'nota',
  Ligação: 'telefone',
  'E-mail': 'envelope',
  Reunião: 'calendario',
  Conversa: 'balao',
  Atendimento: 'balao',
  Tarefa: 'cheque',
  'Mudança de fase': 'funil',
};

const DO_PACOTE = new Set(['calendario', 'cheque', 'funil', 'relogio']);

function IconeDoEvento({ tipo }: { tipo: string }) {
  const nome = ICONE[tipo] ?? 'relogio';
  return DO_PACOTE.has(nome) ? (
    <Icone nome={nome as NomeDeIcone} tamanho={15} />
  ) : (
    <IconeCrm nome={nome as NomeDeIconeCrm} tamanho={15} />
  );
}

interface Mes {
  titulo: string;
  itens: TimeItemLinha[];
}

/**
 * Folds by month, preserving order (most recent first).
 *
 * The grouping uses a stable key (year and month), and the title is decided
 * afterward. Grouping by the title itself has the flaw that the year drops out
 * of the label on the second event and opens a "September" group right below
 * another "September 2026", with the same events split in half.
 *
 * The year only shows up when it changes relative to the previous group:
 * repeating "2026" twelve times says nothing.
 */
function byMes(itens: TimeItemLinha[], fuso: string): Mes[] {
  const groups: { ano: number; mes: string; itens: TimeItemLinha[] }[] = [];

  for (const item of itens) {
    const partes = new Intl.DateTimeFormat('pt-BR', {
      timeZone: fuso,
      month: 'long',
      year: 'numeric',
    }).formatToParts(item.em);
    const mes = partes.find((p) => p.type === 'month')?.value ?? '';
    const ano = Number(partes.find((p) => p.type === 'year')?.value ?? '0');

    const ultimo = groups[groups.length - 1];
    if (ultimo && ultimo.ano === ano && ultimo.mes === mes) ultimo.itens.push(item);
    else groups.push({ ano, mes, itens: [item] });
  }

  let anoAnterior: number | null = null;
  return groups.map((g) => {
    const mostrarAno = g.ano !== anoAnterior;
    anoAnterior = g.ano;
    const titulo = mostrarAno ? `${g.mes} de ${g.ano}` : g.mes;
    return { titulo: titulo.replace(/^./, (c) => c.toUpperCase()), itens: g.itens };
  });
}

export function TimeLinha({
  itens,
  fuso,
  agora,
}: {
  itens: TimeItemLinha[];
  fuso: string;
  agora: Date;
}) {
  if (itens.length === 0) {
    return <div className="empty">Nada aconteceu com este lead ainda.</div>;
  }

  return (
    <div className="time" style={{ ['--trilho' as string]: `${RAIL}px` }}>
      {byMes(itens, fuso).map((mes) => (
        <section key={mes.titulo}>
          <h4>
            <span>{mes.titulo}</span>
          </h4>
          <ol>
            {mes.itens.map((item, i) => (
              <li key={item.id}>
                <div className="marca">
                  <span className="slot">
                    <IconeDoEvento tipo={item.tipo} />
                  </span>
                  {/*
 * The rail stops at the last one of the month: a line that continues below the
 * last event points at a place that doesn't exist.
 */}
                  {i < mes.itens.length - 1 ? <span className="fio" /> : null}
                </div>
                <div className="corpo">
                  <div className="cab">
                    <span className="t">{item.titulo}</span>
                    {item.autor ? <span className="quem">por {item.autor}</span> : null}
                    <time
                      className="quando"
                      dateTime={item.em.toISOString()}
                      title={dataHora(item.em, fuso)}
                    >
                      {desde(item.em, fuso, agora)}
                    </time>
                  </div>
                  {item.corpo ? <p className="resumo">{item.corpo}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
