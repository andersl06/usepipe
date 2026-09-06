import { Icone, type NomeDeIcone } from '@pipe/ui';
import { IconeCrm, type NomeDeIconeCrm } from './icones-crm';
import type { ItemLinhaDoTempo } from '../lib/leads';
import { desde, dataHora } from '../lib/formato';

/**
 * A linha do tempo do lead.
 *
 * Três coisas vieram da leitura do Twenty, e cada uma resolve um problema que a
 * versão anterior tinha:
 *
 * 1. **Agrupamento por mês.** Quarenta eventos numa lista corrida não têm
 *    referência de tempo nenhuma. O separador de mês dá a régua, e o ano só
 *    aparece quando muda, porque repetir "2026" doze vezes não informa nada.
 * 2. **Trilho vertical ligando os ícones.** É o que faz a coluna ser lida como
 *    uma sequência em vez de uma pilha de linhas soltas. A linha para no último
 *    evento do mês, senão ela aponta para um vazio.
 * 3. **Hora relativa à direita, absoluta no `title`.** "há 3 dias" é o que a
 *    pessoa quer saber; a data exata é o que ela confere uma vez a cada vinte.
 *
 * O que não copiamos: o diff campo a campo dos eventos de alteração. Ele
 * pressupõe um registro de auditoria por campo que não existe no nosso
 * `atividade`, e inventar um agora seria construir a tela antes do dado.
 *
 * A medida do trilho é 26px, que é a mesma deles, por uma razão que não é
 * imitação: é o menor valor em que um ícone de 16px cabe centrado com folga
 * visível dos dois lados na nossa régua de 4px.
 */

const TRILHO = 26;

/** Tipo de evento para desenho. O que não casa fica no relógio, que é honesto:
 *  aconteceu, tem hora, e não sabemos dizer mais do que isso. */
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
  itens: ItemLinhaDoTempo[];
}

/**
 * Dobra por mês, preservando a ordem (mais recente primeiro).
 *
 * O agrupamento usa uma chave estável (ano e mês), e o título é decidido
 * depois. Agrupar pelo próprio título dá o defeito de o ano sair do rótulo no
 * segundo evento e abrir um grupo "Setembro" logo abaixo de outro "Setembro de
 * 2026", com os mesmos eventos partidos ao meio.
 *
 * O ano só aparece quando muda em relação ao grupo anterior: repetir "2026"
 * doze vezes não informa nada.
 */
function porMes(itens: ItemLinhaDoTempo[], fuso: string): Mes[] {
  const grupos: { ano: number; mes: string; itens: ItemLinhaDoTempo[] }[] = [];

  for (const item of itens) {
    const partes = new Intl.DateTimeFormat('pt-BR', {
      timeZone: fuso,
      month: 'long',
      year: 'numeric',
    }).formatToParts(item.em);
    const mes = partes.find((p) => p.type === 'month')?.value ?? '';
    const ano = Number(partes.find((p) => p.type === 'year')?.value ?? '0');

    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.ano === ano && ultimo.mes === mes) ultimo.itens.push(item);
    else grupos.push({ ano, mes, itens: [item] });
  }

  let anoAnterior: number | null = null;
  return grupos.map((g) => {
    const mostrarAno = g.ano !== anoAnterior;
    anoAnterior = g.ano;
    const titulo = mostrarAno ? `${g.mes} de ${g.ano}` : g.mes;
    return { titulo: titulo.replace(/^./, (c) => c.toUpperCase()), itens: g.itens };
  });
}

export function LinhaDoTempo({
  itens,
  fuso,
  agora,
}: {
  itens: ItemLinhaDoTempo[];
  fuso: string;
  agora: Date;
}) {
  if (itens.length === 0) {
    return <div className="vazio">Nada aconteceu com este lead ainda.</div>;
  }

  return (
    <div className="tempo" style={{ ['--trilho' as string]: `${TRILHO}px` }}>
      {porMes(itens, fuso).map((mes) => (
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
                  {/* O trilho para no último do mês: linha que continua abaixo
                      do último evento aponta para um lugar que não existe. */}
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
