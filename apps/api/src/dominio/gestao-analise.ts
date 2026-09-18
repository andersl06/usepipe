import { sql } from 'drizzle-orm';
import type { TransacaoPipe } from '@pipe/db';
import {
  NOME_DO_CANAL,
  diasDoIntervalo,
  intervaloAnterior,
  type ArestaDaJornada,
  type DadosDeMensagensAtivas,
  type DadosDoDashboard,
  type Intervalo,
  type JanelaDeInstantes,
  type RelatorioPersonalizado,
  type VisaoGeral,
} from '@pipe/core/analise';

/**
 * As leituras da ANÁLISE do contato (`/fluxo/:id/analise/**`), movidas de
 * `apps/gestao/src/lib/analise.ts` e `analise-portal.ts` — a consulta é a
 * mesma; a transação vem de fora, já com o tenant fixado. A parte pura
 * (período, formatação, tipos) mora em `@pipe/core/analise`.
 */

/** Um intervalo em instantes, já no fuso da conta — `janelaDeDatas` do banco.ts. */
export async function janelaDeDatas(
  tx: TransacaoPipe,
  fuso: string,
  de: string,
  ate: string,
): Promise<JanelaDeInstantes> {
  const r = await tx.execute<{ inicio: Date; fim: Date }>(
    sql`select (${de}::date)::timestamp at time zone ${fuso} as inicio,
               ((${ate}::date + 1)::timestamp) at time zone ${fuso} as fim`,
  );
  const linha = r.rows[0];
  if (!linha) throw new Error('período inválido');
  return { inicio: new Date(linha.inicio), fim: new Date(linha.fim) };
}

/**
 * O Dashboard de um contato, lido do banco.
 *
 * Tem equivalente de verdade: `api/src/dominio/fluxo.ts` grava uma
 * `execucao_fluxo` por conversa que o bot atende, as mensagens do bot e o
 * transbordo (`enfileirada` com `dados.origem = 'fluxo'`). Então contatos,
 * mensagens, recorrência e retenção/transbordo saem das conversas que tiveram
 * execução deste fluxo — e, como na origem, as mensagens do atendimento humano
 * dessas conversas entram na conta ("Inclui, também, mensagens trafegadas no
 * Desk", diz o Dicionário de Dados).
 *
 * ponytail: `excecao`, `blocosExcecao` e `blocosTransbordo` vão vazios. O Pipe
 * não tem bloco de exceção, e `execucao_passo` não marca em qual bloco o
 * transbordo aconteceu; quando marcar, é um `group by bloco_id` aqui.
 * ponytail: o roteador não agrega os fluxos que ele chama (na origem agrega
 * "todos os chatbots conectados") — o motor do Pipe ainda não roteia.
 */
export async function carregarDashboard(
  tx: TransacaoPipe,
  fluxoId: string,
  intervalo: Intervalo,
  fuso: string,
): Promise<DadosDoDashboard | null> {
  const anterior = intervaloAnterior(intervalo);
  {
    const { rows: contato } = await tx.execute<{ tipo: string; canal: string | null }>(
      sql`select f.tipo, k.tipo as canal from fluxo f left join canal k on k.id = f.canal_id where f.id = ${fluxoId}`,
    );
    if (!contato[0]) return null;

    const medir = async (i: Intervalo) => {
      /* Um `rollup` por dia: as linhas de cada dia e, com `dia` nulo, o período
         inteiro — onde o `count(distinct)` não é soma dos dias. */
      const { rows } = await tx.execute<{
        dia: string | null;
        enviadas: number;
        recebidas: number;
        total: number;
        com_interacao: number;
        recorrentes: number;
      }>(sql`
        with conv as (
          select distinct e.conversa_id, c.contato_id
            from execucao_fluxo e
            join fluxo_versao v on v.id = e.fluxo_versao_id
            join conversa c on c.id = e.conversa_id
           where v.fluxo_id = ${fluxoId}
        ), msg as (
          select conv.contato_id, m.direcao, (m.criada_em at time zone ${fuso})::date as dia
            from mensagem m
            join conv on conv.conversa_id = m.conversa_id
           where m.direcao in ('entrada', 'saida')
             and m.criada_em >= (${i.inicio}::date)::timestamp at time zone ${fuso}
             and m.criada_em < ((${i.fim}::date + 1)::timestamp) at time zone ${fuso}
        ), dias as (
          select contato_id, count(distinct dia) as n from msg where direcao = 'entrada' group by contato_id
        )
        select dia::text as dia,
               count(*) filter (where direcao = 'saida')::int as enviadas,
               count(*) filter (where direcao = 'entrada')::int as recebidas,
               count(distinct contato_id)::int as total,
               count(distinct contato_id) filter (where direcao = 'entrada')::int as com_interacao,
               (select count(*) from dias where n >= 2)::int as recorrentes
          from msg
         group by rollup (dia)
         order by dia nulls first
      `);
      const [soma, ...porDia] = rows;
      const { rows: fluxo } = await tx.execute<{ total: number; transbordo: number }>(sql`
        select count(distinct e.contato_id)::int as total,
               count(distinct e.contato_id) filter (where exists (
                 select 1 from evento_atendimento ev
                  where ev.conversa_id = e.conversa_id and ev.tipo = 'enfileirada'
                    and ev.dados ->> 'origem' = 'fluxo'
               ))::int as transbordo
          from execucao_fluxo e
          join fluxo_versao v on v.id = e.fluxo_versao_id
         where v.fluxo_id = ${fluxoId}
           and e.iniciada_em >= (${i.inicio}::date)::timestamp at time zone ${fuso}
           and e.iniciada_em < ((${i.fim}::date + 1)::timestamp) at time zone ${fuso}
      `);
      /* O `rollup` devolve a linha do total mesmo sem mensagem nenhuma; o que
         falta são os dias vazios, e o gráfico da origem tem um rótulo por dia. */
      const doDia = new Map(porDia.map((d) => [d.dia, d]));
      return {
        soma,
        porDia: diasDoIntervalo(i).map((d) => ({
          dia: d,
          enviadas: doDia.get(d)?.enviadas ?? 0,
          recebidas: doDia.get(d)?.recebidas ?? 0,
          total: doDia.get(d)?.total ?? 0,
          com_interacao: doDia.get(d)?.com_interacao ?? 0,
        })),
        fluxo: fluxo[0],
      };
    };

    const [agora, antes] = [await medir(intervalo), await medir(anterior)];
    const par = (f: (m: typeof agora) => number | undefined) => ({
      atual: f(agora) ?? 0,
      anterior: f(antes) ?? 0,
    });

    const { rows: topo } = await tx.execute<{
      nome: string | null;
      telefone: string | null;
      id: string;
      recorrencia: number;
    }>(sql`
      select c.id, c.nome, c.telefone_e164 as telefone,
             (count(distinct (m.criada_em at time zone ${fuso})::date) - 1)::int as recorrencia
        from mensagem m
        join conversa cv on cv.id = m.conversa_id
        join contato c on c.id = cv.contato_id
       where m.direcao = 'entrada'
         and exists (select 1 from execucao_fluxo e join fluxo_versao v on v.id = e.fluxo_versao_id
                      where e.conversa_id = cv.id and v.fluxo_id = ${fluxoId})
         and m.criada_em >= (${intervalo.inicio}::date)::timestamp at time zone ${fuso}
         and m.criada_em < ((${intervalo.fim}::date + 1)::timestamp) at time zone ${fuso}
       group by c.id
      having count(distinct (m.criada_em at time zone ${fuso})::date) >= 2
       order by recorrencia desc, c.nome
       limit 10
    `);

    const canal = contato[0].canal;
    return {
      roteador: contato[0].tipo === 'roteador',
      canal: canal ? (NOME_DO_CANAL[canal] ?? canal) : null,
      contatos: {
        comInteracao: par((m) => m.soma?.com_interacao),
        total: par((m) => m.soma?.total),
        porDia: agora.porDia.map((d) => ({
          dia: d.dia,
          comInteracao: d.com_interacao,
          total: d.total,
        })),
      },
      mensagens: {
        enviadas: par((m) => m.soma?.enviadas),
        recebidas: par((m) => m.soma?.recebidas),
        porDia: agora.porDia.map((d) => ({
          dia: d.dia,
          enviadas: d.enviadas,
          recebidas: d.recebidas,
        })),
      },
      recorrencia: {
        contatos: par((m) => m.soma?.recorrentes),
        maisRecorrentes: topo.map((t) => ({
          nome: t.nome ?? t.id,
          recorrencia: t.recorrencia,
          telefone: t.telefone,
        })),
      },
      fluxo: {
        transbordo: par((m) => m.fluxo?.transbordo),
        total: par((m) => m.fluxo?.total),
        excecao: null,
      },
      blocosExcecao: [],
      blocosTransbordo: [],
    };
  }
}

/**
 * A barra lateral "Número de Contatos" (`uw`): quem interagiu, ou quem não
 * respondeu, no período — `/metrics/contacts/engaged` e
 * `/metrics/sidebar/ContactsRejection` na origem. O nome, e sem nome o
 * telefone (lá é `name ?? identity`).
 *
 * ponytail: a origem pede de 20 em 20 conforme rola; aqui vêm os 1000 mais
 * recentes de uma vez — o mesmo teto que a dica do "Exportar lista" anuncia.
 */
export async function carregarListaDeContatos(
  tx: TransacaoPipe,
  fluxoId: string,
  intervalo: Intervalo,
  fuso: string,
  tipo: 'interacao' | 'rejeicao',
): Promise<string[]> {
  {
    const { rows } = await tx.execute<{ nome: string }>(sql`
      select coalesce(c.nome, c.telefone_e164, c.id::text) as nome
        from mensagem m
        join conversa cv on cv.id = m.conversa_id
        join contato c on c.id = cv.contato_id
       where m.direcao in ('entrada', 'saida')
         and exists (select 1 from execucao_fluxo e join fluxo_versao v on v.id = e.fluxo_versao_id
                      where e.conversa_id = cv.id and v.fluxo_id = ${fluxoId})
         and m.criada_em >= (${intervalo.inicio}::date)::timestamp at time zone ${fuso}
         and m.criada_em < ((${intervalo.fim}::date + 1)::timestamp) at time zone ${fuso}
       group by c.id
      having (count(*) filter (where m.direcao = 'entrada') > 0) = ${tipo === 'interacao'}
       order by max(m.criada_em) desc
       limit 1000
    `);
    return rows.map((r) => r.nome);
  }
}

/**
 * Mensagens ativas do contato — sem equivalente no Pipe hoje.
 *
 * Na origem é a mensagem que o BOT manda depois de 24 horas da última do
 * cliente. O bot do Pipe só fala em resposta (`gravarRespostaDoBot` grava
 * `dentro_da_janela = true`, sempre), e template disparado por campanha não é
 * atribuído a fluxo nenhum. Devolve a resposta vazia da origem — que é o que a
 * tela desenha com zeros.
 *
 * ponytail: quando disparo de template ganhar `fluxo_id` (ou o bot puder mandar
 * template), é `mensagem` com `tipo = 'template'` agrupada por dia, com
 * `entregue_em`, `lida_em`, `estado_entrega = 'falhou'`/`erro_codigo`, e a
 * resposta amarrada por `disparo_id`.
 */
export async function carregarMensagensAtivas(
  _tx: TransacaoPipe,
  _fluxoId: string,
  _intervalo: Intervalo,
  _template: string | null,
): Promise<DadosDeMensagensAtivas> {
  return { status: [], respostasPorHora: Array<number>(24).fill(0), falhas: [], templates: [] };
}

/* ═══════════════════════════════════ Visão geral, relatórios, jornada ═══ */

type Linha = Record<string, unknown>;

/**
 * O "chatbot" da origem é o contato; as mensagens DELE, aqui, são as das
 * conversas por onde alguma versão deste fluxo passou (`execucao_fluxo`).
 * Entra o atendimento humano junto, como lá: `metrics.overviewHelp.info1` diz
 * que o relatório "contabiliza todos os contatos e mensagens trafegadas,
 * incluindo interações durante o atendimento humano". Nota interna não é
 * mensagem trafegada e fica fora.
 */
export async function carregarVisaoGeral(
  tx: TransacaoPipe,
  fluxoId: string,
  periodo: JanelaDeInstantes,
  fuso: string,
): Promise<VisaoGeral> {
  const base = sql`
    with conversas as (
      select distinct ef.conversa_id as id
        from execucao_fluxo ef
        join fluxo_versao fv on fv.id = ef.fluxo_versao_id
       where fv.fluxo_id = ${fluxoId} and ef.conversa_id is not null
    ),
    msgs as (
      select m.direcao, m.dentro_da_janela, c.contato_id, i.canal_id,
             to_char((m.criada_em at time zone ${fuso})::date, 'YYYY-MM-DD') as dia
        from mensagem m
        join conversas cv on cv.id = m.conversa_id
        join conversa c on c.id = m.conversa_id
        join inbox i on i.id = c.inbox_id
       where m.criada_em >= ${periodo.inicio} and m.criada_em < ${periodo.fim}
         and m.direcao <> 'interna'
    )`;

  {
    const linhas = async <T extends Linha>(consulta: ReturnType<typeof sql>) =>
      (await tx.execute<T>(consulta)).rows;
    const n = (v: unknown) => Number(v ?? 0);

    const [c] = await linhas(sql`${base}
      select count(distinct contato_id) as ativos,
             count(distinct contato_id) filter (where direcao = 'entrada') as engajados,
             count(*) as total,
             count(*) filter (where direcao = 'entrada') as recebidas,
             count(*) filter (where direcao = 'saida') as enviadas,
             count(*) filter (where direcao = 'saida' and dentro_da_janela = false) as ativas
        from msgs`);

    const dias = await linhas(sql`${base}
      select dia,
             count(distinct contato_id) as ativos,
             count(distinct contato_id) filter (where direcao = 'entrada') as engajados,
             count(*) filter (where direcao = 'entrada') as recebidas,
             count(*) filter (where direcao = 'saida') as enviadas
        from msgs group by dia order by dia`);

    const canais = await linhas(sql`${base}
      select ca.nome as canal, count(*) as total
        from msgs join canal ca on ca.id = msgs.canal_id
       where direcao = 'saida' and dentro_da_janela = false
       group by ca.nome order by total desc`);

    return {
      contagens: {
        ativos: n(c?.ativos),
        engajados: n(c?.engajados),
        total: n(c?.total),
        recebidas: n(c?.recebidas),
        enviadas: n(c?.enviadas),
        ativas: n(c?.ativas),
      },
      porDia: dias.map((d) => ({
        dia: String(d.dia),
        ativos: n(d.ativos),
        engajados: n(d.engajados),
        recebidas: n(d.recebidas),
        enviadas: n(d.enviadas),
      })),
      ativasPorCanal: canais.map((d) => ({ canal: String(d.canal), total: n(d.total) })),
    };
  }
}

/* ------------------------------------------------ Relatórios Personalizados */

/**
 * ponytail: sempre vazia. O Pipe não tem relatório personalizado — nem tabela,
 * nem editor de gráfico. Teto: a tela fica no estado "Nenhum relatório
 * encontrado :(". Caminho: uma tabela `relatorio` (nome, dono, privado,
 * modificado_em) com os gráficos dela, e esta função lendo os públicos mais os
 * privados da pessoa — o mesmo filtro do `getReports()` da origem.
 */
export async function carregarRelatorios(_tx: TransacaoPipe): Promise<RelatorioPersonalizado[]> {
  return [];
}

/* ------------------------------------------------------ Jornada dos Contatos */

/**
 * As arestas da jornada, tiradas do caminho de cada execução em
 * `execucao_passo`: o passo `n` liga o bloco `n` ao bloco `n+1`, e o último
 * bloco de cada execução liga à "Saída". O nó leva a etapa entre colchetes —
 * é o que `getNodeNameWithoutInstance()` desfaz na origem, e o que impede o
 * mesmo bloco em etapas diferentes de virar ciclo no diagrama.
 *
 * ponytail: sem o nó "Outros" (`#others`), que na origem junta os blocos de
 * pouco volume. Teto: fluxo com muitos ramos desenha todos. Caminho: cortar
 * por etapa os N maiores e somar o resto numa aresta `tipo: 'outros'`.
 */
export async function carregarJornada(
  tx: TransacaoPipe,
  fluxoId: string,
  periodo: JanelaDeInstantes,
): Promise<ArestaDaJornada[]> {
  {
    const { rows } = await tx.execute<Linha>(sql`
      with passos as (
        select ep.execucao_id, b.nome,
               row_number() over (partition by ep.execucao_id order by ep.em, ep.id) as n
          from execucao_passo ep
          join execucao_fluxo ef on ef.id = ep.execucao_id
          join fluxo_versao fv on fv.id = ef.fluxo_versao_id
          join bloco b on b.id = ep.bloco_id
         where fv.fluxo_id = ${fluxoId}
           and ef.iniciada_em >= ${periodo.inicio} and ef.iniciada_em < ${periodo.fim}
      )
      select a.nome || ' [' || a.n || ']' as de,
             coalesce(b.nome || ' [' || b.n || ']', 'Saída [' || (a.n + 1) || ']') as para,
             a.n as passo,
             (b.execucao_id is null) as saida,
             count(*) as quantidade
        from passos a
        left join passos b on b.execucao_id = a.execucao_id and b.n = a.n + 1
       group by 1, 2, 3, 4
       order by 3`);
    return rows.map((r) => ({
      de: String(r.de),
      para: String(r.para),
      passo: Number(r.passo),
      quantidade: Number(r.quantidade),
      tipo: r.saida ? 'saida' : 'regular',
    }));
  }
}
