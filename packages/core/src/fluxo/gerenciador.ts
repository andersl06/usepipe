/**
 * Portado de takenet/blip-sdk-csharp (Apache-2.0),
 * src/Take.Blip.Builder/FlowManager.cs (ProcessInputAsync, ProcessActionsAsync,
 * ProcessOutputsAsync, ValidateInputAsync, ValidateDocument), Hosting/ConventionsConfiguration.cs
 * (os limites), Constants.cs (formatos de data) e as exceções FlowConstructionException,
 * ActionProcessingException, OutputProcessingException e BuilderException
 * — modificado: C# → TypeScript; sem semáforo (a `api` trava a linha da execução no
 * banco), sem trace remoto (o rastro volta para virar `execucao_passo`), sem
 * subfluxo e sem `inputExpiration` (lançam), sem `ExecuteBlipFunction` (vira
 * `ExecuteScriptV2`, que não existe no Pipe) e sem os logs de monitoramento.
 *
 * A ordem de execução é a do original, e é o que importa preservar:
 * ações globais de entrada → [valida a entrada → grava `input.variable`] → ações de
 * saída do estado → condições de saída (a primeira que casar vence) → ações de "depois
 * de trocar de estado" → grava o estado → ações de entrada do próximo estado → repete
 * enquanto o próximo estado não esperar entrada → ações globais de saída.
 */

import { avaliarCondicoes, paraDecimal } from './condicao.js';
import type {
  Contexto,
  CursorDeProcessHttp,
  ListaDeAcoesSuspensa,
  PedidoDeHttp,
  RespostaDeHttp,
} from './contexto.js';
import {
  CHAVE_DO_ESTADO_ATUAL,
  apagarEstadoId,
  definirEstadoAnteriorId,
  definirEstadoId,
  definirVariavel,
  obterEstadoId,
  substituirVariaveis,
} from './contexto.js';
import type { Acao, Estado, FluxoBlip, ValidacaoDeEntrada } from './modelos.js';
import { ehVariavelDeContexto, validarFluxo } from './modelos.js';
import type { ProvedorDeAcoes } from './acoes.js';
import { PROVEDOR_PADRAO, obterAcao } from './acoes.js';

/** `ConventionsConfiguration`: os números são os do original. */
export interface ConfiguracaoDoMotor {
  /** `MaxTransitionsByInput`: a trava contra laço. */
  maxTransicoesPorEntrada: number;
  /** `InputProcessingTimeout`. */
  tempoLimiteDaEntradaMs: number;
  /** `DefaultActionExecutionTimeout`, quando a ação não diz o seu. */
  tempoLimitePadraoDaAcaoMs: number;
}

export const CONFIGURACAO_PADRAO: ConfiguracaoDoMotor = {
  maxTransicoesPorEntrada: 10,
  tempoLimiteDaEntradaMs: 60_000,
  tempoLimitePadraoDaAcaoMs: 30_000,
};

/** `ActionTrace`, o que sobrou dele. */
export interface RastroDeAcao {
  tipo: string;
  erro?: string;
  esquecida?: boolean;
}

/** `StateTrace`. */
export interface RastroDeEstado {
  estadoId: string;
  acoes: RastroDeAcao[];
  proximoEstadoId?: string | null;
  erro?: string;
}

/** `InputTrace`. */
export interface RastroDaEntrada {
  estados: RastroDeEstado[];
  acoesGlobais: RastroDeAcao[];
  /** Estado em que o usuário ficou; nulo = o próximo contato recomeça na raiz. */
  estadoFinalId: string | null;
  erro?: string;
}

/** `FlowConstructionException`. */
export class ErroDeConstrucaoDeFluxo extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroDeConstrucaoDeFluxo';
  }
}

/** `ActionProcessingException`. */
export class ErroDeProcessamentoDeAcao extends Error {
  constructor(
    mensagem: string,
    readonly tipoDaAcao: string,
    override readonly cause: unknown,
  ) {
    super(mensagem);
    this.name = 'ErroDeProcessamentoDeAcao';
  }
}

/** `OutputProcessingException`. */
export class ErroDeProcessamentoDeSaida extends Error {
  constructor(
    mensagem: string,
    readonly estadoDaSaida: string,
    override readonly cause: unknown,
  ) {
    super(mensagem);
    this.name = 'ErroDeProcessamentoDeSaida';
  }
}

/** `BuilderException`: o erro que sai do motor, com o rastro até onde deu. */
export class ErroDoMotor extends Error {
  constructor(
    mensagem: string,
    readonly estadoId: string | null,
    readonly rastro: RastroDaEntrada,
    override readonly cause: unknown,
  ) {
    super(mensagem);
    this.name = 'ErroDoMotor';
  }
}

export class SuspensaoDeProcessHttp extends Error {
  override readonly name = 'SuspensaoDeProcessHttp';
  rastro?: RastroDaEntrada;

  constructor(
    readonly pedido: PedidoDeHttp,
    readonly cursor: Omit<CursorDeProcessHttp, 'resposta'>,
  ) {
    super('ProcessHttp suspenso para execução fora da transação.');
  }
}

class TempoEsgotado extends Error {}

function comTempoLimite<T>(promessa: Promise<T>, ms: number): Promise<T> {
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rejeitar) => {
    relogio = setTimeout(() => rejeitar(new TempoEsgotado()), ms);
  });
  return Promise.race([promessa, limite]).finally(() => clearTimeout(relogio));
}

const mensagemDe = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export interface OpcoesDoMotor {
  configuracao?: Partial<ConfiguracaoDoMotor>;
  acoes?: ProvedorDeAcoes;
  retomarProcessHttp?: CursorDeProcessHttp;
}

/**
 * `FlowManager.ProcessInputAsync`: processa UMA entrada do usuário no fluxo.
 *
 * O estado e as variáveis vivem em `contexto.variaveis`, que a `api` carrega e grava.
 * Devolve o rastro; em erro, lança `ErroDoMotor` com o rastro até onde chegou.
 */
export async function processarEntrada(
  contexto: Contexto,
  opcoes: OpcoesDoMotor = {},
): Promise<RastroDaEntrada> {
  const configuracao = { ...CONFIGURACAO_PADRAO, ...opcoes.configuracao };
  const provedor = opcoes.acoes ?? PROVEDOR_PADRAO;
  const fluxo = contexto.fluxo;
  const rastro: RastroDaEntrada = { estados: [], acoesGlobais: [], estadoFinalId: null };
  const prazo = Date.now() + configuracao.tempoLimiteDaEntradaMs;
  let estado: Estado | null = null;
  let cursorPendente = opcoes.retomarProcessHttp
    ? { ...opcoes.retomarProcessHttp, consumido: false }
    : null;

  try {
    validarFluxo(fluxo);

    // Restaura o estado guardado; sem estado (ou estado que sumiu do fluxo), a raiz.
    const estadoId = obterEstadoId(contexto);
    estado = fluxo.states.find((s) => s.id === estadoId) ?? fluxo.states.find((s) => s.root)!;

    let transicoes = 0;
    if (fluxo.inputActions) {
      await processarAcoes(
        contexto,
        fluxo.inputActions,
        estado,
        provedor,
        configuracao,
        rastro.acoesGlobais,
        'entrada',
        null,
        cursorPendente,
      );
    }

    let esperaEntrada = true;
    let atual: RastroDeEstado = { estadoId: estado.id, acoes: [] };
    rastro.estados.push(atual);

    do {
      try {
        if (Date.now() > prazo) {
          throw new TempoEsgotado(
            `O processamento da entrada excedeu ${configuracao.tempoLimiteDaEntradaMs} ms.`,
          );
        }
        const corrente: Estado = estado!;

        if (esperaEntrada) {
          if (!(await validarEntradaDoEstado(contexto, corrente))) break;
          if (corrente.input?.variable) {
            definirVariavel(
              contexto,
              corrente.input.variable,
              contexto.entrada.conteudoSerializado,
            );
          }
        }

        // Prepara a saída do estado atual executando as ações de saída.
        await processarAcoes(
          contexto,
          corrente.outputActions,
          corrente,
          provedor,
          configuracao,
          atual.acoes,
          'conteudo',
          corrente.id,
          cursorPendente,
        );

        let anteriorId = corrente.id;
        if (ehVariavelDeContexto(anteriorId))
          anteriorId = await substituirVariaveis(anteriorId, contexto);

        if (corrente.end) {
          // `RedirectToParentFlowAsync`: sem fluxo pai, o original lança.
          throw new ErroDeConstrucaoDeFluxo(
            `O estado '${corrente.id}' é de fim de subfluxo, e subfluxo não existe no Pipe.`,
          );
        }

        estado = await processarSaidas(contexto, fluxo, corrente);
        definirEstadoAnteriorId(contexto, anteriorId);

        // Só roda o "depois de trocar" quando o estado de fato mudou.
        if (corrente.id !== estado?.id) {
          await processarAcoes(
            contexto,
            corrente.afterStateChangedActions,
            corrente,
            provedor,
            configuracao,
            atual.acoes,
            'saida',
            corrente.id,
            cursorPendente,
          );
          if (fluxo.afterStateChangedActions) {
            await processarAcoes(
              contexto,
              fluxo.afterStateChangedActions,
              estado,
              provedor,
              configuracao,
              rastro.acoesGlobais,
              'saida',
              null,
              cursorPendente,
            );
          }
        }

        if (estado?.id.startsWith('subflow:')) {
          throw new ErroDeConstrucaoDeFluxo(
            `O estado '${estado.id}' é subfluxo, e subfluxo não existe no Pipe.`,
          );
        }

        atual.proximoEstadoId = estado?.id ?? null;
        if (estado) {
          atual = { estadoId: estado.id, acoes: [] };
          rastro.estados.push(atual);
          definirEstadoId(contexto, estado.id);
        } else {
          apagarEstadoId(contexto);
        }

        // Ações de entrada do próximo estado.
        await processarAcoes(
          contexto,
          estado?.inputActions,
          estado,
          provedor,
          configuracao,
          atual.acoes,
          'entrada',
          estado?.id ?? null,
          cursorPendente,
        );

        // Trava contra laço no fluxo.
        if (transicoes++ >= configuracao.maxTransicoesPorEntrada) {
          throw new ErroDeConstrucaoDeFluxo(
            `O limite de ${configuracao.maxTransicoesPorEntrada} transições de estado por entrada foi atingido.`,
          );
        }
      } catch (erro) {
        atual.erro = mensagemDe(erro);
        throw erro;
      } finally {
        // Continua enquanto o próximo estado não esperar entrada.
        const condicaoDaEntrada =
          !estado?.input?.conditions ||
          (await avaliarCondicoes(estado.input.conditions, contexto.entrada, contexto));
        esperaEntrada =
          estado === null || (!!estado.input && !estado.input.bypass && condicaoDaEntrada);
      }
    } while (!esperaEntrada);

    if (fluxo.outputActions) {
      await processarAcoes(
        contexto,
        fluxo.outputActions,
        estado,
        provedor,
        configuracao,
        rastro.acoesGlobais,
        'conteudo',
        null,
        cursorPendente,
      );
    }

    rastro.estadoFinalId = estado?.id ?? null;
    return rastro;
  } catch (erro) {
    if (erro instanceof SuspensaoDeProcessHttp) {
      erro.rastro = rastro;
      throw erro;
    }
    rastro.erro = mensagemDe(erro);
    rastro.estadoFinalId = obterEstadoId(contexto);
    throw new ErroDoMotor(
      `Erro ao processar a entrada '${contexto.entrada.mensagem.id}' do usuário '${contexto.usuario}' no estado '${estado?.id ?? ''}': ${mensagemDe(erro)}`,
      estado?.id ?? null,
      rastro,
      erro,
    );
  }
}

/** `ProcessActionsAsync`. */
async function processarAcoes(
  contexto: Contexto,
  acoes: readonly Acao[] | null | undefined,
  estado: Estado | null,
  provedor: ProvedorDeAcoes,
  configuracao: ConfiguracaoDoMotor,
  rastro: RastroDeAcao[],
  lista: ListaDeAcoesSuspensa,
  estadoId: string | null,
  cursor: (CursorDeProcessHttp & { resposta?: RespostaDeHttp; consumido?: boolean }) | null,
): Promise<void> {
  if (!acoes) return;
  // `OrderBy` é estável, e `sort` também: sem `order`, vale a ordem do arquivo.
  const ordenadas = [...acoes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const alvo = cursor && cursor.lista === lista && cursor.estadoId === estadoId ? cursor : null;
  if (cursor && !cursor.consumido && !alvo) return;
  for (const [indice, acaoDoFluxo] of ordenadas.entries()) {
    if (
      acaoDoFluxo.conditions &&
      !(await avaliarCondicoes(acaoDoFluxo.conditions, contexto.entrada, contexto))
    ) {
      continue;
    }

    const tipo = acaoDoFluxo.type === 'ExecuteBlipFunction' ? 'ExecuteScriptV2' : acaoDoFluxo.type;
    const acao = obterAcao(provedor, tipo);
    const passo: RastroDeAcao = { tipo: acaoDoFluxo.type };
    rastro.push(passo);

    const tempoLimite =
      typeof acaoDoFluxo.timeout === 'number'
        ? acaoDoFluxo.timeout * 1000
        : configuracao.tempoLimitePadraoDaAcaoMs;

    try {
      let configuracoes: Record<string, unknown> | null = null;
      if (acaoDoFluxo.settings !== undefined && acaoDoFluxo.settings !== null) {
        let texto = JSON.stringify(acaoDoFluxo.settings);
        // `ExecuteTemplate` recebe o modelo cru; as demais, com as variáveis trocadas.
        if (acao.tipo !== 'ExecuteTemplate') texto = await substituirVariaveis(texto, contexto);
        configuracoes = JSON.parse(texto) as Record<string, unknown>;
      }
      contexto.entradaContexto.set(CHAVE_DO_ESTADO_ATUAL, estado?.id ?? null);
      if (acaoDoFluxo.type === 'ProcessHttp' && contexto.servicos.suspenderHttp) {
        contexto.entradaContexto.set('process-http-cursor', {
          lista,
          estadoId,
          indice,
        });
      }
      if (alvo && indice < alvo.indice) continue;
      if (alvo && !cursor?.consumido && indice === alvo.indice) {
        if (!alvo.resposta) throw new Error('A retomada de ProcessHttp não tem resposta.');
        const status = typeof configuracoes?.['responseStatusVariable'] === 'string'
          ? configuracoes['responseStatusVariable'].trim() : '';
        const corpo = typeof configuracoes?.['responseBodyVariable'] === 'string'
          ? configuracoes['responseBodyVariable'].trim() : '';
        if (status) definirVariavel(contexto, status, String(alvo.resposta.status));
        if (corpo) definirVariavel(contexto, corpo, alvo.resposta.corpo);
        if (cursor) cursor.consumido = true;
        continue;
      }
      await comTempoLimite(acao.executar(contexto, configuracoes), tempoLimite);
    } catch (erro) {
      if (erro instanceof SuspensaoDeProcessHttp) throw erro;
      passo.erro = mensagemDe(erro);
      const mensagem =
        erro instanceof TempoEsgotado
          ? `O processamento da ação '${acaoDoFluxo.type}' excedeu o tempo limite de ${tempoLimite} ms.`
          : `O processamento da ação '${acaoDoFluxo.type}' falhou: ${mensagemDe(erro)}`;
      if (acaoDoFluxo.continueOnError) {
        passo.esquecida = true;
        continue;
      }
      throw new ErroDeProcessamentoDeAcao(mensagem, acaoDoFluxo.type, erro);
    }
  }
}

/** `ProcessOutputsAsync`: a primeira saída que casar vence; nenhuma = estado nulo. */
async function processarSaidas(
  contexto: Contexto,
  fluxo: FluxoBlip,
  estado: Estado,
): Promise<Estado | null> {
  const saidas = estado.outputs;
  if (!saidas) return null;
  for (const saida of [...saidas].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    try {
      if (
        !saida.conditions ||
        (await avaliarCondicoes(saida.conditions, contexto.entrada, contexto))
      ) {
        let alvo = saida.stateId;
        if (ehVariavelDeContexto(alvo)) alvo = await substituirVariaveis(alvo, contexto);
        const proximo = fluxo.states.find((s) => s.id === alvo);
        if (!proximo) {
          apagarEstadoId(contexto);
          throw new Error(
            `A variável de contexto da saída '${saida.stateId}' está indefinida ou não existe no fluxo.`,
          );
        }
        return proximo;
      }
    } catch (erro) {
      throw new ErroDeProcessamentoDeSaida(
        `Falha ao processar a condição da saída para o estado '${saida.stateId}': ${mensagemDe(erro)}`,
        saida.stateId,
        erro,
      );
    }
  }
  return null;
}

/**
 * `ValidateInputAsync`: entrada fora da regra manda a mensagem de erro e para — o
 * usuário continua no mesmo estado.
 */
async function validarEntradaDoEstado(contexto: Contexto, estado: Estado): Promise<boolean> {
  const validacao = estado.input?.validation;
  const conteudo = contexto.entrada.conteudoSerializado;
  if (!validacao || !conteudo || validarDocumento(contexto, validacao)) return true;
  if (validacao.error) {
    // Na Blip, erro com `{{variável}}` sai com `#message.spinText` e o servidor troca a
    // variável; aqui não há servidor no meio, então a troca é feita antes.
    const texto = ehVariavelDeContexto(validacao.error)
      ? await substituirVariaveis(validacao.error, contexto)
      : validacao.error;
    await contexto.servicos.enviar({ tipo: 'text/plain', conteudo: texto });
  }
  return false;
}

/** `Constants.DateValidationFormats`. */
const FORMATOS_DE_DATA = [
  'dd/MM/yyyy',
  'MM/dd/yyyy',
  'dd-MM-yyyy',
  'MM-dd-yyyy',
  'dd-MM',
  'dd/MM',
  'MM-dd',
  'MM-dd-yy',
  'dd-MM-yy',
  'yyyy-MM-ddTHH:mm:ssK',
  'yyyy-dd-MMTHH:mm:ssK',
];

const TOKENS_DE_DATA: Record<string, string> = {
  yyyy: '(?<ano>\\d{4})',
  yy: '(?<ano>\\d{2})',
  MM: '(?<mes>\\d{2})',
  dd: '(?<dia>\\d{2})',
  HH: '(?<hora>\\d{2})',
  mm: '(?<minuto>\\d{2})',
  ss: '(?<segundo>\\d{2})',
  K: '(?<fuso>Z|[+-]\\d{2}:\\d{2})?',
};

/** `DateTime.TryParseExact` com espaço permitido, para os formatos acima. */
function casaData(texto: string, formato: string): boolean {
  const padrao = formato.replace(
    /yyyy|yy|MM|dd|HH|mm|ss|K|[^A-Za-z]/g,
    (t) => TOKENS_DE_DATA[t] ?? t.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&'),
  );
  const m = new RegExp(`^\\s*${padrao}\\s*$`).exec(texto);
  if (!m?.groups) return false;
  const { ano, mes, dia, hora, minuto, segundo } = m.groups;
  const a = ano === undefined ? 2000 : Number(ano.length === 2 ? `20${ano}` : ano);
  const me = Number(mes);
  const d = Number(dia);
  if (me < 1 || me > 12 || d < 1 || d > new Date(Date.UTC(a, me, 0)).getUTCDate()) return false;
  return (
    (hora === undefined || Number(hora) < 24) &&
    (minuto === undefined || Number(minuto) < 60) &&
    (segundo === undefined || Number(segundo) < 60)
  );
}

/** `ValidateDocument`. */
function validarDocumento(contexto: Contexto, validacao: ValidacaoDeEntrada): boolean {
  const conteudo = contexto.entrada.conteudoSerializado;
  switch (validacao.rule?.toLowerCase()) {
    case 'text':
      return contexto.entrada.mensagem.tipo === 'text/plain';
    case 'number':
      return paraDecimal(conteudo) !== null;
    case 'date':
      return FORMATOS_DE_DATA.some((f) => casaData(conteudo, f));
    case 'regex':
      return new RegExp(validacao.regex ?? '').test(conteudo);
    case 'type':
      return contexto.entrada.mensagem.tipo === validacao.type;
    default:
      throw new Error(`Regra de validação desconhecida: '${validacao.rule}'.`);
  }
}
