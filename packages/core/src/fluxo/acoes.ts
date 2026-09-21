/**
 * Portado de takenet/blip-sdk-csharp (Apache-2.0),
 * src/Take.Blip.Builder/Actions/{ActionBase,ActionProvider}.cs,
 * Actions/SetVariable/*, Actions/DeleteVariable/*, Actions/SendMessage/SendMessageAction.cs,
 * Actions/SendRawMessage/*, Actions/TrackEvent/TrackEventSettings.cs,
 * Actions/CreateTicket/CreateTicketAction.cs e Actions/Redirect/RedirectAction.cs
 * — modificado: C# → TypeScript; quem envia, abre atendimento e registra evento é o
 * `ServicosDoMotor` que a `api` injeta (no original, `ISender` e as extensões da Blip);
 * o `Task.Delay` do "digitando" não é esperado (o motor roda dentro da transação da
 * entrada); `ForwardToDesk` e `LeavingFromDesk` NÃO estão no SDK — são ações do
 * servidor da Blip usadas pelo bloco de atendimento do editor, e o comportamento foi
 * copiado da forma desse bloco no export (variável `desk_forwardToDeskState_status`).
 */

import type { Contexto, PedidoDeHttp } from './contexto.js';
import { CHAVE_DO_TICKET, apagarVariavel, definirVariavel } from './contexto.js';

export type Configuracoes = Record<string, unknown> | null;

/** `IAction`. */
export interface AcaoDoMotor {
  tipo: string;
  executar(contexto: Contexto, configuracoes: Configuracoes): Promise<void>;
}

export type ProvedorDeAcoes = ReadonlyMap<string, AcaoDoMotor>;

/** O Newtonsoft casa propriedade sem diferenciar maiúscula (`Variable`/`variable`). */
function campo(configuracoes: Configuracoes, nome: string): unknown {
  if (!configuracoes) return undefined;
  const chave = Object.keys(configuracoes).find((k) => k.toLowerCase() === nome.toLowerCase());
  return chave === undefined ? undefined : configuracoes[chave];
}

const comoTexto = (v: unknown): string | null =>
  v === undefined || v === null ? null : typeof v === 'string' ? v : JSON.stringify(v);

/** `ActionBase.ExecuteAsync`: configuração nula é erro antes de qualquer coisa. */
function exigirConfiguracoes(tipo: string, configuracoes: Configuracoes): Record<string, unknown> {
  if (!configuracoes) throw new Error(`As configurações são obrigatórias na ação '${tipo}'.`);
  return configuracoes;
}

const MIME = /^[\w.+-]+\/[\w.+-]+$/;

/** `SetVariableAction`. */
const setVariable: AcaoDoMotor = {
  tipo: 'SetVariable',
  async executar(contexto, configuracoes) {
    const c = exigirConfiguracoes(this.tipo, configuracoes);
    const variavel = comoTexto(campo(c, 'variable'));
    if (variavel === null)
      throw new Error("O valor 'variable' é obrigatório na ação 'SetVariable'.");
    definirVariavel(contexto, variavel, comoTexto(campo(c, 'value')));
  },
};

/** `DeleteVariableAction`. */
const deleteVariable: AcaoDoMotor = {
  tipo: 'DeleteVariable',
  async executar(contexto, configuracoes) {
    const c = exigirConfiguracoes(this.tipo, configuracoes);
    const variavel = comoTexto(campo(c, 'variable'));
    if (variavel === null)
      throw new Error("O valor 'variable' é obrigatório na ação 'DeleteVariable'.");
    apagarVariavel(contexto, variavel);
  },
};

/** `SendMessageAction`. */
const sendMessage: AcaoDoMotor = {
  tipo: 'SendMessage',
  async executar(contexto, configuracoes) {
    const c = exigirConfiguracoes(this.tipo, configuracoes);
    const tipo = comoTexto(campo(c, 'type'));
    if (!tipo || !MIME.test(tipo)) throw new Error(`Tipo de mídia inválido: '${tipo}'.`);
    // ponytail: o original espera o `interval` do "digitando" (Task.Delay). Aqui não:
    // o motor roda dentro da transação da entrada, e segurar conexão por isso é caro.
    await contexto.servicos.enviar({
      tipo,
      conteudo: campo(c, 'content'),
      metadados: (campo(c, 'metadata') as Record<string, string> | undefined) ?? null,
    });
  },
};

/** `SendRawMessageAction`. */
const sendRawMessage: AcaoDoMotor = {
  tipo: 'SendRawMessage',
  async executar(contexto, configuracoes) {
    const c = exigirConfiguracoes(this.tipo, configuracoes);
    const bruto = comoTexto(campo(c, 'rawContent'));
    const tipo = comoTexto(campo(c, 'type'));
    if (bruto === null)
      throw new Error("O valor 'rawContent' é obrigatório na ação 'SendRawMessage'.");
    if (tipo === null) throw new Error("O valor 'type' é obrigatório na ação 'SendRawMessage'.");
    if (!MIME.test(tipo))
      throw new Error("O valor 'type' da ação 'SendRawMessage' precisa ser um MIME válido.");
    await contexto.servicos.enviar({
      tipo,
      conteudo: bruto,
      metadados: (campo(c, 'metadata') as Record<string, string> | undefined) ?? null,
      bruto: true,
    });
  },
};

/** `TrackEventAction`: `category` e `action` são obrigatórios. */
const trackEvent: AcaoDoMotor = {
  tipo: 'TrackEvent',
  async executar(contexto, configuracoes) {
    const c = exigirConfiguracoes(this.tipo, configuracoes);
    if (!comoTexto(campo(c, 'category'))?.trim()) {
      throw new Error("O valor 'category' é obrigatório na ação 'TrackEvent'.");
    }
    if (!comoTexto(campo(c, 'action'))?.trim()) {
      throw new Error("O valor 'action' é obrigatório na ação 'TrackEvent'.");
    }
    await contexto.servicos.registrarEvento(c);
  },
};

/** `CreateTicketAction`: abre o atendimento e guarda o ticket em `{{ticket.*}}`. */
const createTicket: AcaoDoMotor = {
  tipo: 'CreateTicket',
  async executar(contexto, configuracoes) {
    const c = exigirConfiguracoes(this.tipo, configuracoes);
    const atendimento = await contexto.servicos.encaminharParaAtendimento({
      origem: this.tipo,
      settings: c,
    });
    contexto.entradaContexto.set(CHAVE_DO_TICKET, atendimento);
    const variavel = comoTexto(campo(c, 'variable'));
    if (variavel?.trim()) definirVariavel(contexto, variavel, atendimento.id);
  },
};

/** A variável que o bloco de atendimento do editor da Blip testa na entrada e na saída. */
export const VARIAVEL_DO_ENCAMINHAMENTO = 'desk_forwardToDeskState_status';

/**
 * `ForwardToDesk` (servidor da Blip). No bloco de atendimento do editor, a entrada só é
 * esperada se esta variável for `Success`, e a saída padrão é `Error` — por isso a
 * falha vira valor da variável, e não exceção.
 */
const forwardToDesk: AcaoDoMotor = {
  tipo: 'ForwardToDesk',
  async executar(contexto, configuracoes) {
    try {
      const atendimento = await contexto.servicos.encaminharParaAtendimento({
        origem: this.tipo,
        settings: configuracoes,
      });
      contexto.entradaContexto.set(CHAVE_DO_TICKET, atendimento);
      definirVariavel(contexto, VARIAVEL_DO_ENCAMINHAMENTO, 'Success');
    } catch {
      definirVariavel(contexto, VARIAVEL_DO_ENCAMINHAMENTO, 'Error');
    }
  },
};

/** `LeavingFromDesk` (servidor da Blip): no Pipe o atendimento já foi encerrado pelo Desk. */
const leavingFromDesk: AcaoDoMotor = {
  tipo: 'LeavingFromDesk',
  async executar() {},
};

/**
 * `RedirectAction` (Actions/Redirect/RedirectAction.cs): as configurações são o documento
 * `Redirect` do LIME (`application/vnd.lime.redirect+json`) — `address` é o NOME do serviço
 * no roteador (`blip-api-schemas.md` §5.4) e `context` vai junto. Quem muda o contato de
 * serviço é o `ServicosDoMotor`; sem roteador, falha, como na Blip.
 */
const redirect: AcaoDoMotor = {
  tipo: 'Redirect',
  async executar(contexto, configuracoes) {
    const c = exigirConfiguracoes(this.tipo, configuracoes);
    const endereco = comoTexto(campo(c, 'address'))?.trim();
    if (!endereco) throw new Error("O valor 'address' é obrigatório na ação 'Redirect'.");
    if (!contexto.servicos.redirecionar) {
      throw new Error('O redirecionamento só funciona num fluxo que é serviço de um roteador.');
    }
    await contexto.servicos.redirecionar({ endereco, contexto: campo(c, 'context') ?? null });
  },
};

/**
 * `ProcessHttpAction` da Blip: status HTTP, inclusive 4xx/5xx, vira variável e não
 * falha a ação; erro de rede é representado pela resposta sintética do serviço.
 * A chamada fica no serviço injetado para o motor continuar puro.
 */
const processHttp: AcaoDoMotor = {
  tipo: 'ProcessHttp',
  async executar(contexto, configuracoes) {
    const c = exigirConfiguracoes(this.tipo, configuracoes);
    if (!contexto.servicos.chamarHttp) throw new Error('A ação ProcessHttp não está disponível neste fluxo.');
    const metodo = (comoTexto(campo(c, 'method')) ?? 'GET').toUpperCase();
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(metodo)) {
      throw new Error(`Método HTTP inválido: '${metodo}'.`);
    }
    const uri = comoTexto(campo(c, 'uri'))?.trim();
    if (!uri) throw new Error("O valor 'uri' é obrigatório na ação 'ProcessHttp'.");
    const bruto = campo(c, 'headers');
    const cabecalhos: Record<string, string> = {};
    if (bruto && typeof bruto === 'object' && !Array.isArray(bruto)) {
      for (const [chave, valor] of Object.entries(bruto)) {
        const texto = comoTexto(valor);
        if (texto !== null) cabecalhos[chave] = texto;
      }
    }
    const corpoValor = campo(c, 'body');
    const corpo = corpoValor === undefined || corpoValor === null
      ? undefined
      : typeof corpoValor === 'string' ? corpoValor : JSON.stringify(corpoValor);
    const timeoutCru = campo(c, 'requestTimeout');
    const timeoutMs = typeof timeoutCru === 'number' && timeoutCru > 0 ? timeoutCru * 1000 : 60_000;
    const pedido: PedidoDeHttp = {
      metodo: metodo as PedidoDeHttp['metodo'], url: uri, cabecalhos, timeoutMs,
      ...(corpo === undefined ? {} : { corpo }),
    };
    const cursor = contexto.entradaContexto.get('process-http-cursor');
    if (contexto.servicos.suspenderHttp && cursor) {
      await contexto.servicos.suspenderHttp(pedido, cursor as never);
    }
    const resposta = await contexto.servicos.chamarHttp(pedido);
    const status = comoTexto(campo(c, 'responseStatusVariable'))?.trim();
    const corpoVariavel = comoTexto(campo(c, 'responseBodyVariable'))?.trim();
    if (status) definirVariavel(contexto, status, String(resposta.status));
    if (corpoVariavel) definirVariavel(contexto, corpoVariavel, resposta.corpo);
  },
};

export const ACOES_DO_MOTOR: readonly AcaoDoMotor[] = [
  setVariable,
  deleteVariable,
  sendMessage,
  sendRawMessage,
  trackEvent,
  createTicket,
  forwardToDesk,
  leavingFromDesk,
  redirect,
  processHttp,
];

/** O `ActionProvider` padrão: as ações que o Pipe executa. */
export const PROVEDOR_PADRAO: ProvedorDeAcoes = new Map(ACOES_DO_MOTOR.map((a) => [a.tipo, a]));

/** `ActionProvider.Get`: tipo sem implementação é erro, não ação ignorada. */
export function obterAcao(provedor: ProvedorDeAcoes, tipo: string): AcaoDoMotor {
  const acao = provedor.get(tipo);
  if (!acao) throw new Error(`A ação do tipo '${tipo}' não existe no Pipe.`);
  return acao;
}
