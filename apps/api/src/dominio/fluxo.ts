import { sql } from 'drizzle-orm';
import {
  ErroDoMotor,
  chaveDoEstado,
  classificarCusto,
  criarEntrada,
  ehExportDoEditor,
  ehVariavelDeContexto,
  estadoGuardado,
  lerFluxoDaBlip,
  processarEntrada,
  relatorioDaImportacao,
  SuspensaoDeProcessHttp,
  validarFluxo,
} from '@pipe/core';
import type {
  Contexto,
  Estado,
  FluxoBlip,
  MensagemDeEntrada,
  MensagemDeSaida,
  PedidoDeHttp,
  CursorDeProcessHttp,
  RespostaDeHttp,
  RastroDaEntrada,
  RelatorioDaImportacao,
  Saida,
  ServicosDoMotor,
} from '@pipe/core';
import type { TransacaoPipe } from '@pipe/db';
import { bancoDono, noTenant } from '../banco.js';
import { emitir } from '../webhooks-saida.js';
import { distribuirConversa } from './distribuicao.js';
import { registrarEvento } from './eventos.js';
import { avaliarPrioridade, carregarRegrasDePrioridadeAtivas } from './gestao/prioridade-motor.js';
import { redirecionarNoRoteador, servicoDoRoteador } from './roteador.js';
import { chamarComMtls } from './mtls.js';
import { confirmarUrlSegura } from './gestao/integracoes.js';

/**
 * O fluxo automático (o bot) ligado à entrada do WhatsApp.
 *
 * O motor é o porte do `FlowManager` da Blip e mora em `@pipe/core`; aqui fica só o que
 * é do Pipe: carregar o fluxo publicado do canal, guardar o contexto em
 * `execucao_fluxo`, gravar cada estado visitado em `execucao_passo`, mandar as
 * respostas pelo outbox e entregar a conversa à fila.
 *
 * **Onde roda.** Dentro da transação que grava a mensagem de entrada, no consumidor da
 * fila `pipe-entrada` — nunca no webhook, que responde 200 e enfileira. Mesma transação
 * de propósito: mensagem e resposta do bot entram juntas ou não entram, e a reentrega da
 * Meta cai na guarda de `id_provedor` (mais o índice `execucao_passo_entrada_uk`).
 * `ProcessHttp` usa o mesmo limite de segurança de saída (HTTPS/SSRF e mTLS), mas
 * grava um cursor e sai desta transação antes de falar com a API do cliente.
 *
 * **Humano ganha.** A Blip cala o bot estacionando o usuário num estado `desk:`. No Pipe a
 * dona da conversa é a própria conversa: com atendente, ou já na fila, o bot não fala. O
 * bot só responde em conversa sem fila e sem atendente — a que nasce com fluxo publicado.
 *
 * **Volta ao fluxo.** Encerrado o atendimento, a mensagem seguinte abre conversa nova, e
 * o contexto do bot vem junto (na Blip o contexto é do usuário, não do ticket). Se o
 * usuário parou num bloco `desk:`, o motor recebe primeiro o `Ticket` encerrado — é o
 * que a Blip manda ao bot quando o atendimento fecha — e as saídas do bloco de
 * atendimento decidem para onde ele vai: é o "bloco configurável" do editor da Blip.
 *
 * **Roteador.** Canal ligado a roteador publicado: quem roda é o SERVIÇO em que o contato
 * está (`roteador.ts`). Trocar de serviço no meio da conversa encerra a execução do
 * anterior e abre outra; a volta do humano cai no serviço em que ele estava, porque a
 * posição é do contato, não da conversa.
 */

export interface FluxoPublicado {
  fluxoId: string;
  versaoId: string;
  /** Presente quando o canal é de um roteador: o fluxo acima é o serviço da vez. */
  roteador?: {
    id: string;
    /** O serviço usa o contexto do roteador (`usa_contexto_do_roteador`). */
    compartilhaContexto: boolean;
    /** O contexto do par (roteador, contato). */
    contexto: Record<string, string>;
    /** Change-User-State pendente do último `Redirect`. */
    reiniciar: boolean;
    blocoInicial: string | null;
  };
}

/**
 * O bot do canal. Roteador publicado ganha do fluxo ligado direto (um bot por número), e
 * resolve o serviço do contato — por isso o contato entra aqui.
 */
export async function fluxoPublicadoDoCanal(
  tx: TransacaoPipe,
  canalId: string,
  contatoId: string,
): Promise<FluxoPublicado | null> {
  const { rows: roteadores } = await tx.execute<{ id: string; tenant_id: string }>(sql`
    select id, tenant_id from fluxo
     where canal_id = ${canalId} and tipo = 'roteador' and estado = 'publicado'
     order by criado_em desc
     limit 1
  `);
  const roteador = roteadores[0];
  if (roteador) {
    return servicoDoRoteador(tx, { id: roteador.id, tenantId: roteador.tenant_id }, contatoId);
  }
  const { rows } = await tx.execute<{ fluxo_id: string; versao_id: string }>(sql`
    select f.id as fluxo_id, v.id as versao_id
      from fluxo f
      join fluxo_versao v on v.fluxo_id = f.id
     where f.canal_id = ${canalId} and f.estado = 'publicado' and v.estado = 'publicada'
     order by v.versao desc
     limit 1
  `);
  const linha = rows[0];
  return linha ? { fluxoId: linha.fluxo_id, versaoId: linha.versao_id } : null;
}

type LinhaBloco = { id: string; codigo: string; conteudo: Record<string, unknown> };
type LinhaTransicao = {
  de_bloco_id: string;
  para_codigo: string | null;
  para_variavel: string | null;
  condicao: { conditions?: unknown } | null;
  ordem: number;
};

/**
 * Remonta o `Flow` da Blip a partir de `bloco` e `transicao`.
 *
 * ponytail: três consultas por mensagem de entrada. Versão publicada não muda, então
 * um cache por `versaoId` é seguro quando isto aparecer no perfil.
 */
export async function carregarFluxo(
  tx: TransacaoPipe,
  publicado: FluxoPublicado,
): Promise<{ fluxo: FluxoBlip; blocoPorCodigo: Map<string, string> }> {
  const { rows: versoes } = await tx.execute<{ global: Record<string, unknown> }>(
    sql`select global from fluxo_versao where id = ${publicado.versaoId}`,
  );
  const { rows: blocos } = await tx.execute<LinhaBloco>(
    sql`select id, codigo, conteudo from bloco where versao_id = ${publicado.versaoId}`,
  );
  const { rows: transicoes } = await tx.execute<LinhaTransicao>(sql`
    select t.de_bloco_id, b.codigo as para_codigo, t.para_variavel, t.condicao, t.ordem
      from transicao t
      left join bloco b on b.id = t.para_bloco_id
     where t.versao_id = ${publicado.versaoId}
     order by t.ordem
  `);

  const saidas = new Map<string, Saida[]>();
  for (const t of transicoes) {
    const condicoes = t.condicao?.conditions;
    const lista = saidas.get(t.de_bloco_id) ?? [];
    lista.push({
      order: t.ordem,
      stateId: t.para_codigo ?? t.para_variavel ?? '',
      ...(Array.isArray(condicoes) ? { conditions: condicoes } : {}),
    });
    saidas.set(t.de_bloco_id, lista);
  }

  const states = blocos.map((b) => {
    const estado: Record<string, unknown> = { ...b.conteudo };
    // `original` é o estado do editor guardado na importação; o motor não o lê.
    delete estado['original'];
    return { ...estado, id: b.codigo, outputs: saidas.get(b.id) ?? [] } as Estado;
  });
  const global = versoes[0]?.global ?? {};
  return {
    fluxo: { ...global, id: publicado.fluxoId, states } as FluxoBlip,
    blocoPorCodigo: new Map(blocos.map((b) => [b.codigo, b.id])),
  };
}

export interface EntradaNoFluxo {
  tenantId: string;
  conversa: {
    id: string;
    /** Nasceu com esta mensagem. Só conversa nova começa fluxo. */
    nova: boolean;
    filaId: string | null;
    atendenteId: string | null;
    filaPadraoId: string | null;
  };
  contatoId: string;
  mensagem: { id: string | null; idProvedor: string; tipo: string; conteudo: string | null };
}

export interface ResultadoDoFluxo {
  /** O bot ficou com a mensagem. `false` = segue o caminho normal, da fila. */
  tratou: boolean;
  /** Quantas respostas foram para o outbox — para empurrar a entrega depois do commit. */
  respostas: number;
  processHttpId?: string;
}

const NAO_TRATOU: ResultadoDoFluxo = { tratou: false, respostas: 0 };

type LinhaExecucao = {
  id: string;
  fluxo_versao_id: string;
  fluxo_id: string;
  contexto: Record<string, string>;
};

/** `Ticket.Status` da Blip a partir de quem encerrou a conversa no Pipe. */
const STATUS_DO_TICKET: Readonly<Record<string, string>> = {
  atendente: 'ClosedAttendant',
  cliente: 'ClosedClient',
  inatividade: 'ClosedClientInactivity',
  transferencia: 'Transferred',
};

export async function rodarFluxoNaEntrada(
  tx: TransacaoPipe,
  publicado: FluxoPublicado | null,
  e: EntradaNoFluxo,
  retomada?: { execucaoId: string; cursor: CursorDeProcessHttp; resposta: RespostaDeHttp },
): Promise<ResultadoDoFluxo> {
  const { conversa } = e;
  // Humano ganha: com atendente, o bot não fala.
  if (conversa.atendenteId && !retomada) return NAO_TRATOU;

  // `for update`: duas mensagens do mesmo cliente ao mesmo tempo andam uma de cada vez.
  const { rows: execucoes } = await tx.execute<LinhaExecucao>(sql`
    select e.id, e.fluxo_versao_id, v.fluxo_id, e.contexto from execucao_fluxo e
      join fluxo_versao v on v.id = e.fluxo_versao_id
     where e.conversa_id = ${conversa.id}
     order by e.iniciada_em desc
     limit 1
     for update of e
  `);
  let execucao = execucoes[0] ?? null;

  if (execucao && !retomada) {
    const { rows: pendentes } = await tx.execute<{ id: string }>(sql`
      select id from process_http_execucao
       where execucao_id = ${execucao.id} and estado in ('pendente', 'chamando')
       limit 1
    `);
    // Decisão Pipe: enquanto o HTTP está pendente, a mensagem fica gravada e espera
    // a retomada; assim uma conversa nunca tem duas execuções do motor em paralelo.
    if (pendentes[0]) return { tratou: true, respostas: 0 };
  }

  // Já na fila, esperando gente: também é do humano.
  if (conversa.filaId && !retomada) return NAO_TRATOU;
  if (!execucao && (!conversa.nova || !publicado) && !retomada) return NAO_TRATOU;

  if (!publicado) {
    // A conversa estava com o bot e o fluxo saiu do ar: vai para a fila em vez de ficar muda.
    await transbordarSemFalhar(tx, e, execucao?.contexto ?? {}, 'o fluxo do canal saiu do ar');
    return { tratou: true, respostas: 0 };
  }

  const roteador = publicado.roteador ?? null;
  if (execucao && execucao.fluxo_id !== publicado.fluxoId) {
    // O roteador mandou o contato para outro serviço: a execução do anterior termina aqui.
    await tx.execute(sql`
      update execucao_fluxo set estado = 'concluida', encerrada_em = now() where id = ${execucao.id}
    `);
    execucao = null;
  }

  // Só a conversa nova recebe o `Ticket` do atendimento que acabou.
  const nova = execucao === null && conversa.nova;
  if (!execucao) {
    // O contexto é do CONTATO, como na Blip: a conversa nova herda o que o bot já sabia.
    const { rows: anteriores } = await tx.execute<{ contexto: Record<string, string> }>(sql`
      select e.contexto from execucao_fluxo e
        join fluxo_versao v on v.id = e.fluxo_versao_id
       where e.contato_id = ${e.contatoId} and v.fluxo_id = ${publicado.fluxoId}
       order by e.iniciada_em desc
       limit 1
    `);
    const { rows: criada } = await tx.execute<LinhaExecucao>(sql`
      insert into execucao_fluxo (tenant_id, fluxo_versao_id, conversa_id, contato_id, estado, contexto)
      values (
        ${e.tenantId}, ${publicado.versaoId}, ${conversa.id}, ${e.contatoId}, 'executando',
        ${JSON.stringify(anteriores[0]?.contexto ?? {})}::jsonb
      )
      returning id, fluxo_versao_id, ${publicado.fluxoId}::uuid as fluxo_id, contexto
    `);
    execucao = criada[0]!;
  } else if (execucao.fluxo_versao_id !== publicado.versaoId) {
    // Versão nova publicada no meio da conversa: segue com o mesmo contexto. Estado que
    // não existe mais cai na raiz — é o que o `FlowManager` faz.
    await tx.execute(
      sql`update execucao_fluxo set fluxo_versao_id = ${publicado.versaoId} where id = ${execucao.id}`,
    );
  }
  const execucaoId = execucao.id;

  const { fluxo, blocoPorCodigo } = await carregarFluxo(tx, publicado);
  // Com o contexto do roteador ligado, as variáveis são do par (roteador, contato).
  const variaveis: Record<string, string> = {
    ...(roteador?.compartilhaContexto ? roteador.contexto : execucao.contexto),
  };
  if (roteador?.reiniciar) {
    // Change-User-State depois do Master-State: o destino começa no bloco pedido, ou na raiz.
    if (roteador.blocoInicial) variaveis[chaveDoEstado(fluxo.id)] = roteador.blocoInicial;
    else delete variaveis[chaveDoEstado(fluxo.id)];
    await tx.execute(sql`
      update posicao_no_roteador set reiniciar = false, bloco_inicial = null
       where roteador_id = ${roteador.id} and contato_id = ${e.contatoId}
    `);
  }
  /** O contexto do roteador acompanha o da execução, sempre que ela grava. */
  const guardarContextoDoRoteador = async (): Promise<void> => {
    if (!roteador?.compartilhaContexto) return;
    await tx.execute(sql`
      update posicao_no_roteador set contexto = ${JSON.stringify(variaveis)}::jsonb
       where roteador_id = ${roteador.id} and contato_id = ${e.contatoId}
    `);
  };
  const contato = await carregarContato(tx, e.contatoId);
  const relogio = relogioCrescente();
  const eventos: Record<string, unknown>[] = [];
  let respostas = 0;
  let transferida = false;
  let processHttpId: string | undefined;

  const servicos: ServicosDoMotor = {
    enviar: async (m) => {
      const texto = textoParaOCanal(m);
      if (texto === null) return;
      const pergunta = perguntaDoSelect(m);
      await gravarRespostaDoBot(tx, e.tenantId, conversa.id, texto, relogio(), pergunta ? { pergunta } : null);
      respostas += 1;
    },
    encaminharParaAtendimento: async ({ settings }) => {
      const filaId =
        typeof settings?.['filaId'] === 'string' ? settings['filaId'] : conversa.filaPadraoId;
      await transbordar(tx, e, filaId, variaveis, null, relogio());
      transferida = true;
      return { id: conversa.id, status: 'Waiting' };
    },
    registrarEvento: async (evento) => {
      eventos.push(evento);
    },
    chamarHttp: async (pedido: PedidoDeHttp) => {
      confirmarUrlSegura(pedido.url);
      try {
        const resposta = await chamarComMtls(e.tenantId, pedido.url, {
          metodo: pedido.metodo,
          headers: pedido.cabecalhos,
          body: pedido.corpo,
          // ponytail: a chamada ainda roda DENTRO da transação da entrada, que segura a
          // ponytail: fora da transação, o limite é o requestTimeout da origem (60 s).
          timeoutMs: pedido.timeoutMs,
        });
        const corpo = await resposta.texto();
        const limite = Number(process.env['PIPE_PROCESS_HTTP_MAX_RESPOSTA_BYTES'] ?? 1_048_576);
        return { status: resposta.status, corpo: corpo.slice(0, limite) };
      } catch (erro) {
        // Regra da origem: rede/timeout não derruba ProcessHttp; o fluxo recebe status sintético.
        const mensagem = erro instanceof Error ? erro.message : String(erro);
        const timeout = /timeout|aborted|timed out/i.test(mensagem);
        return {
          status: timeout ? 504 : 503,
          corpo: JSON.stringify({ error: timeout ? 'timeout' : 'network_error', message: mensagem }),
        };
      }
    },
    suspenderHttp: async (pedido, cursor) => {
      confirmarUrlSegura(pedido.url);
      const chave = `${execucaoId}:${e.mensagem.idProvedor}:${cursor.estadoId ?? 'global'}:${cursor.lista}:${cursor.indice}`;
      const { rows } = await tx.execute<{ id: string }>(sql`
        insert into process_http_execucao (
          tenant_id, execucao_id, chave, bloco_id, bloco_codigo, lista, indice,
          entrada, contexto, pedido, estado
        ) values (
          ${e.tenantId}, ${execucaoId}, ${chave},
          ${cursor.estadoId ? (blocoPorCodigo.get(cursor.estadoId) ?? null) : null},
          ${cursor.estadoId ?? ''}, ${cursor.lista}, ${cursor.indice},
          ${JSON.stringify({
            id: e.mensagem.id,
            id_provedor: e.mensagem.idProvedor,
            tipo: e.mensagem.tipo,
            conteudo: e.mensagem.conteudo,
          })}::jsonb,
          ${JSON.stringify(variaveis)}::jsonb, ${JSON.stringify(pedido)}::jsonb, 'pendente'
        )
        on conflict (execucao_id, chave) do nothing
        returning id
      `);
      processHttpId = rows[0]?.id;
      // O cursor fica committed antes de liberar a chamada externa.
      throw new SuspensaoDeProcessHttp(pedido, cursor);
    },
    // ponytail: o `context` do Redirect não é entregue ao destino como primeira entrada;
    // o destino começa na próxima mensagem do cliente. Entregar exige rodar o motor do
    // destino aqui dentro, com o fluxo dele carregado.
    ...(roteador
      ? {
          redirecionar: async ({ endereco }: { endereco: string }) => {
            await redirecionarNoRoteador(tx, {
              tenantId: e.tenantId,
              roteadorId: roteador.id,
              contatoId: e.contatoId,
              servico: endereco,
            });
          },
        }
      : {}),
  };

  /** Uma entrada no motor. Falha do fluxo não derruba a mensagem: vai para a fila. */
  const rodar = async (
    mensagem: MensagemDeEntrada,
    entrada: Record<string, unknown>,
  ): Promise<boolean> => {
    const contexto: Contexto = {
      usuario: e.contatoId,
      fluxo,
      entrada: criarEntrada(mensagem),
      variaveis,
      entradaContexto: new Map(),
      contato,
      servicos,
    };
    try {
      const rastro = await processarEntrada(
        contexto,
        retomada ? { retomarProcessHttp: retomada.cursor } : {},
      );
      await gravarPassos(
        tx,
        e.tenantId,
        execucaoId,
        rastro,
        blocoPorCodigo,
        entrada,
        eventos.splice(0),
        relogio,
      );
      return true;
    } catch (erro) {
      if (erro instanceof SuspensaoDeProcessHttp) {
        await gravarPassos(
          tx,
          e.tenantId,
          execucaoId,
          erro.rastro ?? { estados: [], acoesGlobais: [], estadoFinalId: erro.cursor.estadoId },
          blocoPorCodigo,
          entrada,
          eventos.splice(0),
          relogio,
        );
        await tx.execute(sql`
          update execucao_fluxo
             set estado = 'aguardando', contexto = ${JSON.stringify(variaveis)}::jsonb,
                 bloco_atual_id = ${erro.cursor.estadoId ? (blocoPorCodigo.get(erro.cursor.estadoId) ?? null) : null}
           where id = ${execucaoId}
        `);
        await guardarContextoDoRoteador();
        return true;
      }
      if (!(erro instanceof ErroDoMotor)) throw erro;
      await gravarPassos(
        tx,
        e.tenantId,
        execucaoId,
        erro.rastro,
        blocoPorCodigo,
        entrada,
        eventos.splice(0),
        relogio,
      );
      await tx.execute(sql`
        update execucao_fluxo
           set estado = 'falhou', contexto = ${JSON.stringify(variaveis)}::jsonb, encerrada_em = now()
         where id = ${execucaoId}
      `);
      await guardarContextoDoRoteador();
      // Na Blip o usuário ficaria parado sem resposta. Aqui ele vai para a fila.
      if (!transferida)
        await transbordarSemFalhar(tx, e, variaveis, `o fluxo falhou: ${erro.message}`);
      return false;
    }
  };

  // Numa retomada a entrada é a MESMA da suspensão original — `execucao_passo` já
  // gravou aquele `id_provedor` (fluxo.ts:440-450). Repeti-lo aqui violaria
  // `execucao_passo_entrada_uk` (a proteção contra webhook duplicado da Meta,
  // migration 0014), então uma retomada nunca inclui `id_provedor` de novo.
  let idProvedorUsado = Boolean(retomada);
  const estadoAntes = estadoGuardado(variaveis, fluxo.id);
  if (nova && estadoAntes?.startsWith('desk:') && fluxo.states.some((s) => s.id === estadoAntes)) {
    const ticket = await ultimoAtendimento(tx, e.contatoId, conversa.id);
    idProvedorUsado = true;
    const certo = await rodar(
      {
        id: `ticket:${ticket.id}`,
        tipo: 'application/vnd.iris.ticket+json',
        conteudo: ticket,
        de: e.contatoId,
      },
      { ticket, id_provedor: e.mensagem.idProvedor, mensagem_id: e.mensagem.id },
    );
    if (!certo) return { tratou: true, respostas };
    // Parou num bloco que já falou com o cliente: a mensagem dele serviu para acordar o bot.
    // Voltou para a raiz (ou saiu do fluxo): a mensagem é a primeira entrada, como na Blip.
    const depois = estadoGuardado(variaveis, fluxo.id);
    if (depois !== null && depois !== fluxo.states.find((s) => s.root)?.id) {
      await salvarExecucao(tx, execucaoId, variaveis, fluxo.id, blocoPorCodigo, transferida);
      await guardarContextoDoRoteador();
      return { tratou: true, respostas };
    }
  }

  const certo = await rodar(
    {
      id: e.mensagem.idProvedor,
      tipo: MIME_DO_TIPO[e.mensagem.tipo] ?? 'text/plain',
      conteudo: e.mensagem.conteudo ?? '',
      de: e.contatoId,
    },
    {
      mensagem_id: e.mensagem.id,
      ...(idProvedorUsado ? {} : { id_provedor: e.mensagem.idProvedor }),
    },
  );
  if (certo) {
    await salvarExecucao(tx, execucaoId, variaveis, fluxo.id, blocoPorCodigo, transferida);
    await guardarContextoDoRoteador();
  }
  return { tratou: true, respostas, ...(processHttpId ? { processHttpId } : {}) };
}

/** Executa o HTTP fora da transação e, numa segunda transação, retoma o cursor. */
export async function executarProcessHttp(processoId: string): Promise<string[]> {
  type Linha = {
    id: string; tenant_id: string; execucao_id: string; estado: string;
    pedido: PedidoDeHttp; entrada: Record<string, unknown>; bloco_codigo: string;
    lista: CursorDeProcessHttp['lista']; indice: number;
  };
  const dono = await bancoDono().execute<Linha>(sql`
    select id, tenant_id, execucao_id, estado, pedido, entrada, bloco_codigo, lista, indice
      from process_http_execucao where id = ${processoId} limit 1
  `);
  const encontrado = dono.rows[0];
  if (!encontrado || encontrado.estado !== 'pendente') return [];

  const tomou = await noTenant(encontrado.tenant_id, async (tx) => {
    const { rows } = await tx.execute<{ id: string }>(sql`
      update process_http_execucao set estado = 'chamando', atualizado_em = now()
       where id = ${processoId} and estado = 'pendente' returning id
    `);
    return rows.length > 0;
  });
  if (!tomou) return [];

  confirmarUrlSegura(encontrado.pedido.url);
  let resposta: RespostaDeHttp;
  try {
    const r = await chamarComMtls(encontrado.tenant_id, encontrado.pedido.url, {
      metodo: encontrado.pedido.metodo,
      headers: encontrado.pedido.cabecalhos,
      body: encontrado.pedido.corpo,
      timeoutMs: encontrado.pedido.timeoutMs,
    });
    const limite = Number(process.env['PIPE_PROCESS_HTTP_MAX_RESPOSTA_BYTES'] ?? 1_048_576);
    resposta = { status: r.status, corpo: (await r.texto()).slice(0, limite) };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    const timeout = /timeout|aborted|timed out/i.test(mensagem);
    resposta = {
      status: timeout ? 504 : 503,
      corpo: JSON.stringify({ error: timeout ? 'timeout' : 'network_error', message: mensagem }),
    };
  }

  const novosProcessos: string[] = [];
  await noTenant(encontrado.tenant_id, async (tx) => {
    const { rows } = await tx.execute<{
      execucao_id: string; bloco_codigo: string; lista: CursorDeProcessHttp['lista'];
      indice: number; entrada: Record<string, unknown>; contexto: Record<string, string>;
      conversa_id: string; contato_id: string; canal_id: string; fila_id: string | null;
      atendente_id: string | null; fila_padrao_id: string | null;
    }>(sql`
      select p.execucao_id, p.bloco_codigo, p.lista, p.indice, p.entrada, p.contexto,
             e.conversa_id, e.contato_id, f.canal_id, c.fila_id, c.atendente_id,
             i.fila_padrao_id
        from process_http_execucao p
        join execucao_fluxo e on e.id = p.execucao_id
        join conversa c on c.id = e.conversa_id
        join fluxo_versao v on v.id = e.fluxo_versao_id
        join fluxo f on f.id = v.fluxo_id
        join inbox i on i.id = c.inbox_id
       where p.id = ${processoId} and p.estado = 'chamando'
       for update of p
    `);
    const p = rows[0];
    if (!p) return;
    await tx.execute(sql`
      update process_http_execucao set resposta = ${JSON.stringify(resposta)}::jsonb,
             estado = 'respondida', atualizado_em = now() where id = ${processoId}
    `);
    const publicado = await fluxoPublicadoDoCanal(tx, p.canal_id, p.contato_id);
    if (!publicado) return;
    const retomada = await rodarFluxoNaEntrada(tx, publicado, {
      tenantId: encontrado.tenant_id,
      conversa: {
        id: p.conversa_id, nova: false, filaId: p.fila_id,
        atendenteId: p.atendente_id, filaPadraoId: p.fila_padrao_id,
      },
      contatoId: p.contato_id,
      mensagem: {
        id: typeof p.entrada['id'] === 'string' ? p.entrada['id'] : null,
        idProvedor: String(p.entrada['id_provedor'] ?? ''),
        tipo: String(p.entrada['tipo'] ?? 'texto'),
        conteudo: typeof p.entrada['conteudo'] === 'string' ? p.entrada['conteudo'] : null,
      },
    }, {
      execucaoId: p.execucao_id,
      cursor: { lista: p.lista, estadoId: p.bloco_codigo || null, indice: p.indice, resposta },
      resposta,
    });
    if (retomada.processHttpId) novosProcessos.push(retomada.processHttpId);

    const { rows: mensagensPendentes } = await tx.execute<{
      id: string; id_provedor: string; tipo: string; conteudo: string | null;
    }>(sql`
      select m.id, m.id_provedor, m.tipo, m.conteudo
        from mensagem m
       where m.conversa_id = ${p.conversa_id} and m.direcao = 'entrada'
         and not exists (
           select 1 from execucao_passo ep
            where ep.execucao_id = ${p.execucao_id}
              and ep.entrada ->> 'id_provedor' = m.id_provedor
         )
       order by m.criada_em, m.id
    `);
    for (const mensagem of mensagensPendentes) {
      const atual = await rodarFluxoNaEntrada(tx, publicado, {
        tenantId: encontrado.tenant_id,
        conversa: {
          id: p.conversa_id, nova: false, filaId: null,
          atendenteId: null, filaPadraoId: p.fila_padrao_id,
        },
        contatoId: p.contato_id,
        mensagem: {
          id: mensagem.id,
          idProvedor: mensagem.id_provedor,
          tipo: mensagem.tipo,
          conteudo: mensagem.conteudo,
        },
      });
      if (atual.processHttpId) novosProcessos.push(atual.processHttpId);
    }
    await tx.execute(sql`
      update process_http_execucao set estado = 'retomada', atualizado_em = now()
       where id = ${processoId}
    `);
  });
  return novosProcessos;
}

/** `mensagem.tipo` do Pipe → o MIME que a Blip põe em `{{input.type}}`. */
const MIME_DO_TIPO: Readonly<Record<string, string>> = {
  texto: 'text/plain',
  template: 'text/plain',
  imagem: 'application/vnd.lime.media-link+json',
  audio: 'application/vnd.lime.media-link+json',
  video: 'application/vnd.lime.media-link+json',
  documento: 'application/vnd.lime.media-link+json',
  localizacao: 'application/vnd.lime.location+json',
};

async function salvarExecucao(
  tx: TransacaoPipe,
  execucaoId: string,
  variaveis: Record<string, string>,
  fluxoId: string,
  blocoPorCodigo: Map<string, string>,
  transferida: boolean,
): Promise<void> {
  const estado = estadoGuardado(variaveis, fluxoId);
  // Sem estado, o próximo contato recomeça na raiz; transferida, a conversa é do humano.
  const concluida = transferida || estado === null;
  await tx.execute(sql`
    update execucao_fluxo
       set contexto = ${JSON.stringify(variaveis)}::jsonb,
           bloco_atual_id = ${estado ? (blocoPorCodigo.get(estado) ?? null) : null},
           estado = ${concluida ? 'concluida' : 'aguardando'},
           encerrada_em = ${concluida ? sql`now()` : null}
     where id = ${execucaoId}
  `);
}

/** Cada estado visitado vira um passo; o primeiro leva a entrada (e o `id_provedor`). */
async function gravarPassos(
  tx: TransacaoPipe,
  tenantId: string,
  execucaoId: string,
  rastro: RastroDaEntrada,
  blocoPorCodigo: Map<string, string>,
  entrada: Record<string, unknown>,
  eventos: Record<string, unknown>[],
  relogio: () => Date,
): Promise<void> {
  const estados = rastro.estados.length > 0 ? rastro.estados : [{ estadoId: '', acoes: [] }];
  for (const [i, passo] of estados.entries()) {
    const ultimo = i === estados.length - 1;
    const saida = {
      acoes: passo.acoes,
      proximo: 'proximoEstadoId' in passo ? (passo.proximoEstadoId ?? null) : null,
      ...(i === 0 && rastro.acoesGlobais.length > 0 ? { acoesGlobais: rastro.acoesGlobais } : {}),
      ...(ultimo && eventos.length > 0 ? { eventos } : {}),
    };
    const erro =
      ('erro' in passo ? passo.erro : undefined) ?? (ultimo ? rastro.erro : undefined) ?? null;
    await tx.execute(sql`
      insert into execucao_passo (tenant_id, execucao_id, bloco_id, entrada, saida, erro, em)
      values (
        ${tenantId}, ${execucaoId}, ${blocoPorCodigo.get(passo.estadoId) ?? null},
        ${i === 0 ? JSON.stringify(entrada) : null}::jsonb, ${JSON.stringify(saida)}::jsonb,
        ${erro}, ${relogio()}
      )
    `);
  }
}

/**
 * A conversa sai do bot e entra na fila.
 *
 * É aqui que ela vira atendimento: `criada` e `enfileirada` são gravadas AGORA, e não
 * quando o bot começou. O tempo de fila e o de primeira resposta medem a partir de
 * `criada` (`@pipe/core`, `marcosDaConversa`), e contar o tempo do bot ali seria pôr na
 * conta da equipe a conversa com o robô — na Blip, o ticket também só nasce no transbordo.
 */
async function transbordar(
  tx: TransacaoPipe,
  e: EntradaNoFluxo,
  filaId: string | null,
  variaveis: Record<string, string>,
  motivo: string | null,
  em: Date,
): Promise<void> {
  if (!filaId)
    throw new Error('A inbox do canal não tem fila padrão: o bot não tem para onde transferir.');
  const { rows } = await tx.execute<{ id: string }>(sql`
    update conversa set fila_id = ${filaId}, estado = 'na_fila', atualizado_em = now()
     where id = ${e.conversa.id} and atendente_id is null and fila_id is null
    returning id
  `);
  if (!rows[0]) return;

  // A conversa acabou de entrar na fila (o `update` acima só afeta linha uma vez,
  // por causa do `fila_id is null` na condição) — é o único momento em que a
  // prioridade é avaliada para ela. Ver decisão Pipe em `gestao/prioridade-motor.ts`.
  const regrasDePrioridade = await carregarRegrasDePrioridadeAtivas(tx);
  if (regrasDePrioridade.length > 0) {
    const nivel = avaliarPrioridade(regrasDePrioridade, {
      filaId,
      mensagem: e.mensagem.conteudo,
    });
    if (nivel) {
      await tx.execute(sql`
        update conversa set prioridade = ${nivel}, atualizado_em = now() where id = ${e.conversa.id}
      `);
    }
  }

  const dados = { origem: 'fluxo', ...(motivo ? { motivo } : {}) };
  await registrarEvento(tx, {
    tenantId: e.tenantId,
    conversaId: e.conversa.id,
    tipo: 'criada',
    em,
    filaId,
    dados,
  });
  await registrarEvento(tx, {
    tenantId: e.tenantId,
    conversaId: e.conversa.id,
    tipo: 'enfileirada',
    em,
    filaId,
    dados,
  });
  // O atendente recebe o cliente já sabendo o que o robô coletou: é a nota que o Desk mostra.
  await tx.execute(sql`
    insert into nota_interna (tenant_id, conversa_id, corpo, em)
    values (${e.tenantId}, ${e.conversa.id}, ${resumoDoContexto(variaveis, motivo)}, ${em})
  `);
  await emitir(tx, e.tenantId, 'conversa.estado_alterado', {
    conversa_id: e.conversa.id,
    estado: 'na_fila',
    fila_id: filaId,
  });
  await distribuirConversa(tx, e.tenantId, e.conversa.id, filaId, em);
}

/** A saída de emergência não pode derrubar a mensagem que chegou. */
async function transbordarSemFalhar(
  tx: TransacaoPipe,
  e: EntradaNoFluxo,
  variaveis: Record<string, string>,
  motivo: string,
): Promise<void> {
  try {
    await transbordar(tx, e, e.conversa.filaPadraoId, variaveis, motivo, new Date());
  } catch (erro) {
    console.error(`[fluxo] conversa ${e.conversa.id} ficou sem fila: ${(erro as Error).message}`);
  }
}

/** As variáveis que o bot coletou, sem as chaves de controle do motor. */
export function resumoDoContexto(variaveis: Record<string, string>, motivo: string | null): string {
  const linhas = Object.entries(variaveis)
    .filter(([k]) => !/^(previous-)?stateId@/.test(k) && !k.startsWith('desk_'))
    .map(([k, v]) => `- ${k}: ${v}`);
  return [
    motivo ? `Transferida pelo bot (${motivo}).` : 'Transferida pelo bot.',
    linhas.length > 0 ? 'O que ele coletou:' : 'O bot não coletou nenhuma informação.',
    ...linhas,
  ].join('\n');
}

/**
 * Resposta do bot: `mensagem` pendente + linha no outbox, como toda saída do Pipe. Quem
 * entrega é o worker. Dentro da janela sempre: o bot só fala em resposta ao cliente.
 */
async function gravarRespostaDoBot(
  tx: TransacaoPipe,
  tenantId: string,
  conversaId: string,
  texto: string,
  em: Date,
  /** `{ pergunta }` quando é menu: o worker decide se sai em botões, lista ou texto. */
  dados: Record<string, unknown> | null = null,
): Promise<void> {
  const categoria = classificarCusto({
    conteudo: 'texto_livre',
    dentroDaJanela: true,
    categoriaTemplate: null,
  });
  const { rows } = await tx.execute<{ id: string }>(sql`
    insert into mensagem (
      tenant_id, conversa_id, direcao, autor_tipo, tipo, conteudo, estado_entrega, criada_em,
      dentro_da_janela, categoria_cobranca, dados
    ) values (
      ${tenantId}, ${conversaId}, 'saida', 'bot', 'texto', ${texto}, 'pendente', ${em}, true, ${categoria},
      ${dados ? JSON.stringify(dados) : null}::jsonb
    )
    returning id
  `);
  const mensagemId = rows[0]?.id;
  if (!mensagemId) throw new Error('não gravou a resposta do bot');
  await tx.execute(sql`
    insert into outbox_mensagem (tenant_id, mensagem_id, estado) values (${tenantId}, ${mensagemId}, 'pendente')
  `);
  await tx.execute(sql`
    update conversa set ultima_mensagem_em = ${em}, ultima_mensagem_de = 'bot', atualizado_em = now()
     where id = ${conversaId}
  `);
  // `usuarioId` nulo é o que separa, na métrica, a saída do bot da do atendente.
  await registrarEvento(tx, { tenantId, conversaId, tipo: 'mensagem_saida', em });
  await emitir(tx, tenantId, 'mensagem.criada', {
    mensagem_id: mensagemId,
    conversa_id: conversaId,
    direcao: 'saida',
    tipo: 'texto',
    conteudo: texto,
  });
}

/**
 * O conteúdo LIME que o fluxo manda → o texto que o WhatsApp do Pipe envia hoje.
 * Menu (`select`) vira texto com as opções numeradas; o "digitando" não sai. Tipo sem
 * tradução é erro: a ação do motor falha, e não sai mensagem pela metade.
 */
/**
 * O menu (`select`) como pergunta estruturada, para o worker poder mandar em
 * botões ou lista (`interativo.ts` de `@pipe/workers/whatsapp`). O texto numerado
 * de `textoParaOCanal` continua sendo o conteúdo gravado e o plano B.
 */
export function perguntaDoSelect(m: MensagemDeSaida): { texto: string; opcoes: string[] } | null {
  if (m.tipo.toLowerCase() !== 'application/vnd.lime.select+json') return null;
  let conteudo = m.conteudo;
  if (typeof conteudo === 'string') {
    try {
      conteudo = JSON.parse(conteudo);
    } catch {
      return null;
    }
  }
  const menu = conteudo as { text?: string; options?: { text?: string }[] } | null;
  const opcoes = (menu?.options ?? []).map((o) => o.text ?? '');
  if (opcoes.length === 0) return null;
  return { texto: menu?.text ?? '', opcoes };
}

export function textoParaOCanal(m: MensagemDeSaida): string | null {
  const tipo = m.tipo.toLowerCase();
  if (tipo === 'application/vnd.lime.chatstate+json') return null;
  let conteudo = m.conteudo;
  if (m.bruto && typeof conteudo === 'string' && tipo !== 'text/plain') {
    try {
      conteudo = JSON.parse(conteudo);
    } catch {
      // segue como texto; o tipo decide abaixo
    }
  }
  if (tipo === 'text/plain')
    return typeof conteudo === 'string' ? conteudo : JSON.stringify(conteudo);
  if (tipo === 'application/vnd.lime.select+json') {
    const menu = conteudo as { text?: string; options?: { text?: string; order?: number }[] };
    const opcoes = (menu.options ?? []).map((o, i) => `${o.order ?? i + 1}. ${o.text ?? ''}`);
    return [menu.text ?? '', ...opcoes].filter((l) => l !== '').join('\n');
  }
  throw new Error(`O canal do Pipe ainda não envia conteúdo do tipo '${m.tipo}'.`);
}

async function carregarContato(
  tx: TransacaoPipe,
  contatoId: string,
): Promise<Record<string, unknown> | null> {
  const { rows } = await tx.execute<{
    nome: string | null;
    telefone_e164: string | null;
    email: string | null;
    atributos: Record<string, unknown> | null;
  }>(
    sql`select nome, telefone_e164, email, atributos from contato where id = ${contatoId} limit 1`,
  );
  const c = rows[0];
  // O vocabulário é o do `Contact` da Blip, que é o que o fluxo importado usa.
  return c
    ? {
        identity: contatoId,
        name: c.nome,
        phoneNumber: c.telefone_e164,
        email: c.email,
        extras: c.atributos ?? {},
      }
    : null;
}

/** O último atendimento encerrado do contato, como o `Ticket` que a Blip manda ao bot. */
async function ultimoAtendimento(
  tx: TransacaoPipe,
  contatoId: string,
  conversaAtualId: string,
): Promise<{ id: string; status: string; closed: true }> {
  const { rows } = await tx.execute<{ id: string; por: string | null }>(sql`
    select c.id,
           (select ev.dados->>'encerrada_por' from evento_atendimento ev
             where ev.conversa_id = c.id and ev.tipo = 'encerrada'
             order by ev.em desc limit 1) as por
      from conversa c
     where c.contato_id = ${contatoId} and c.estado = 'encerrada' and c.id <> ${conversaAtualId}
     order by c.encerrada_em desc nulls last
     limit 1
  `);
  const linha = rows[0];
  return {
    id: linha?.id ?? conversaAtualId,
    status: STATUS_DO_TICKET[linha?.por ?? ''] ?? 'ClosedAttendant',
    closed: true,
  };
}

/** Horário que só anda para a frente: a ordem das respostas é a ordem de `criada_em`. */
function relogioCrescente(): () => Date {
  let ultimo = 0;
  return () => {
    ultimo = Math.max(Date.now(), ultimo + 1);
    return new Date(ultimo);
  };
}

// --- importação ---

export interface ImportacaoDeFluxo {
  fluxoId: string;
  versaoId: string;
  versao: number;
  publicado: boolean;
  relatorio: RelatorioDaImportacao;
  /** O fluxo foi gravado, mas o motor recusaria rodar: por isso não publica. */
  erroDeValidacao: string | null;
}

/**
 * O tipo do bloco no Pipe. A Blip não tem tipo de bloco; este rótulo é só para a tela
 * e o relatório — o motor não o lê.
 */
export function classificarEstado(e: Estado): string {
  const tipos = [...(e.inputActions ?? []), ...(e.outputActions ?? [])].map((a) => a.type);
  if (
    e.id.startsWith('desk:') ||
    tipos.some((t) => t === 'ForwardToDesk' || t === 'CreateTicket')
  ) {
    return 'transferencia';
  }
  if (e.root) return 'inicio';
  if (e.input && !e.input.bypass) return 'pergunta';
  if (tipos.some((t) => t === 'SendMessage' || t === 'SendRawMessage')) return 'mensagem';
  if (tipos.includes('ProcessHttp')) return 'chamada_externa';
  if (tipos.some((t) => t.startsWith('ExecuteScript'))) return 'script';
  return 'condicao';
}

/**
 * Grava um fluxo da Blip (export do editor ou publicado) como versão nova.
 *
 * Nada se perde: o estado original do editor vai em `bloco.conteudo.original`, e o que
 * o motor não executa volta no relatório, por tipo. Publicar arquiva a versão publicada
 * anterior e o outro fluxo publicado do mesmo canal — um bot por número.
 */
export async function importarFluxoDaBlip(
  tx: TransacaoPipe,
  pedido: {
    tenantId: string;
    nome: string;
    canalId: string | null;
    json: unknown;
    publicar: boolean;
  },
): Promise<ImportacaoDeFluxo> {
  const { rows: existentes } = await tx.execute<{ id: string }>(sql`
    select id from fluxo where nome = ${pedido.nome} and canal_id is not distinct from ${pedido.canalId} limit 1
  `);
  let fluxoId = existentes[0]?.id;
  if (!fluxoId) {
    const { rows } = await tx.execute<{ id: string }>(sql`
      insert into fluxo (tenant_id, nome, canal_id) values (${pedido.tenantId}, ${pedido.nome}, ${pedido.canalId})
      returning id
    `);
    fluxoId = rows[0]!.id;
  }

  const fluxo = lerFluxoDaBlip(pedido.json, fluxoId);
  const originais = ehExportDoEditor(pedido.json) ? pedido.json.flow : null;
  let erroDeValidacao: string | null = null;
  try {
    validarFluxo(fluxo);
  } catch (erro) {
    erroDeValidacao = (erro as Error).message;
  }
  if (pedido.publicar && erroDeValidacao) {
    throw new Error(`O fluxo não pode ser publicado: ${erroDeValidacao}`);
  }

  const { rows: numero } = await tx.execute<{ versao: number }>(
    sql`select coalesce(max(versao), 0) + 1 as versao from fluxo_versao where fluxo_id = ${fluxoId}`,
  );
  const versao = Number(numero[0]?.versao ?? 1);
  if (pedido.publicar) {
    await tx.execute(
      sql`update fluxo_versao set estado = 'arquivada' where fluxo_id = ${fluxoId} and estado = 'publicada'`,
    );
    await tx.execute(sql`
      update fluxo set estado = 'arquivado', atualizado_em = now()
       where canal_id = ${pedido.canalId} and id <> ${fluxoId} and estado = 'publicado'
    `);
    await tx.execute(
      sql`update fluxo set estado = 'publicado', atualizado_em = now() where id = ${fluxoId}`,
    );
  }

  // O que é do `Flow` e não de um estado: ações globais, `configuration`, versão.
  const global: Record<string, unknown> = { ...fluxo };
  delete global['states'];
  delete global['id'];
  const { rows: criada } = await tx.execute<{ id: string }>(sql`
    insert into fluxo_versao (tenant_id, fluxo_id, versao, estado, publicada_em, global)
    values (
      ${pedido.tenantId}, ${fluxoId}, ${versao}, ${pedido.publicar ? 'publicada' : 'rascunho'},
      ${pedido.publicar ? new Date() : null}, ${JSON.stringify(global)}::jsonb
    )
    returning id
  `);
  const versaoId = criada[0]!.id;

  const blocoPorCodigo = new Map<string, string>();
  for (const estado of fluxo.states) {
    const codigo = estado.id;
    // Id e saídas têm coluna e tabela próprias (`codigo`, `transicao`); o resto é o estado.
    const conteudo: Record<string, unknown> = { ...estado };
    delete conteudo['id'];
    delete conteudo['outputs'];
    const original = originais?.[codigo];
    const nome =
      typeof estado['name'] === 'string' && estado['name'].trim() ? estado['name'] : codigo;
    const { rows } = await tx.execute<{ id: string }>(sql`
      insert into bloco (tenant_id, versao_id, codigo, nome, tipo, conteudo, posicao)
      values (
        ${pedido.tenantId}, ${versaoId}, ${codigo}, ${nome}, ${classificarEstado(estado)},
        ${JSON.stringify(original ? { ...conteudo, original } : conteudo)}::jsonb,
        ${JSON.stringify(estado['$position'] ?? {})}::jsonb
      )
      returning id
    `);
    blocoPorCodigo.set(codigo, rows[0]!.id);
  }

  for (const estado of fluxo.states) {
    for (const [i, saida] of (estado.outputs ?? []).entries()) {
      const variavel = ehVariavelDeContexto(saida.stateId) ? saida.stateId : null;
      const para = variavel ? null : (blocoPorCodigo.get(saida.stateId) ?? null);
      // Destino inexistente só passa se o fluxo não for publicado — e já está no erro de validação.
      if (!variavel && !para) continue;
      await tx.execute(sql`
        insert into transicao (tenant_id, versao_id, de_bloco_id, para_bloco_id, para_variavel, condicao, ordem)
        values (
          ${pedido.tenantId}, ${versaoId}, ${blocoPorCodigo.get(estado.id)!}, ${para}, ${variavel},
          ${JSON.stringify(saida.conditions ? { conditions: saida.conditions } : {})}::jsonb, ${saida.order ?? i}
        )
      `);
    }
  }

  return {
    fluxoId,
    versaoId,
    versao,
    publicado: pedido.publicar,
    relatorio: relatorioDaImportacao(fluxo),
    erroDeValidacao,
  };
}
