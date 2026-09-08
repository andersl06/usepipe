import IORedis from 'ioredis';
import { conexaoRedis } from '@pipe/workers';
import type { Assunto, EventoDoServidor } from '@pipe/contracts';

/**
 * Tempo real: publicar o que mudou e entregar a quem tem direito de saber.
 *
 * A regra do contrato (`packages/contracts/src/eventos.ts`) vale inteira aqui: **o
 * evento diz O QUE mudou, nunca O QUE É.** Vai `{assunto, id, em}` e nada mais; quem
 * recebe busca o dado pela API, sob RLS. Empurrar o registro pelo canal seria uma
 * segunda porta para o dado, com um segundo lugar para errar o isolamento — e a
 * primeira porta é a que tem 90 políticas e os testes.
 *
 * ## O isolamento, que é a regra que não se dobra
 *
 * Três camadas, e nenhuma delas é "filtrar na memória por semelhança":
 *
 * 1. **Um canal do Redis por tenant** (`pipe:eventos:<tenant_id>`). Um processo só
 *    assina o canal de um tenant enquanto houver alguém DAQUELE tenant conectado
 *    nele. Sem conexão, os bytes daquele cliente não chegam nem a entrar no processo.
 * 2. **O tenant da conexão sai da sessão**, nunca do que o cliente pediu. É a mesma
 *    promessa do resto da API.
 * 3. **Evento com dono só vai para o dono.** `usuarioId` preenchido entrega apenas às
 *    conexões daquela pessoa — é o que o chat do gestor com o atendente exige.
 */

/** O envelope que trafega no Redis: o evento do contrato mais o destinatário. */
export interface EventoPublicado extends EventoDoServidor {
  /** Quando preenchido, só as conexões DESTA pessoa recebem. */
  usuarioId?: string;
}

export interface Conexao {
  tenantId: string;
  usuarioId: string;
  assuntos: ReadonlySet<Assunto>;
  entregar: (evento: EventoDoServidor) => void;
}

function canalDoTenant(tenantId: string): string {
  return `pipe:eventos:${tenantId}`;
}

let publicador: IORedis | null = null;
let assinante: IORedis | null = null;

/**
 * Duas conexões, e não uma, porque o Redis exige: uma conexão em modo `subscribe`
 * não aceita mais nenhum comando. Publicar pela mesma travaria a assinatura.
 */
function conexaoPublicador(): IORedis {
  publicador ??= new IORedis(conexaoRedis().url, { maxRetriesPerRequest: null });
  return publicador;
}

/** As conexões vivas DESTE processo, agrupadas por tenant. */
const porTenant = new Map<string, Set<Conexao>>();

function conexaoAssinante(): IORedis {
  if (assinante) return assinante;
  assinante = new IORedis(conexaoRedis().url, { maxRetriesPerRequest: null });
  assinante.on('message', (canal, corpo) => {
    const tenantId = canal.slice('pipe:eventos:'.length);
    let evento: EventoPublicado;
    try {
      evento = JSON.parse(corpo) as EventoPublicado;
    } catch {
      // Mensagem ilegível no canal não pode derrubar o processo inteiro.
      return;
    }
    entregarNoProcesso(tenantId, evento);
  });
  return assinante;
}

function entregarNoProcesso(tenantId: string, evento: EventoPublicado): void {
  const conexoes = porTenant.get(tenantId);
  if (!conexoes) return;

  const { usuarioId, ...doContrato } = evento;
  for (const conexao of conexoes) {
    // O canal já é do tenant, mas a conferência é repetida de propósito: se um dia
    // alguém errar a chave do canal, o erro para aqui em vez de virar vazamento.
    if (conexao.tenantId !== tenantId) continue;
    if (usuarioId && conexao.usuarioId !== usuarioId) continue;
    if (!conexao.assuntos.has(doContrato.assunto)) continue;
    try {
      conexao.entregar(doContrato);
    } catch {
      // Um cliente com o socket já morrendo não pode impedir a entrega aos outros.
    }
  }
}

/**
 * Publica um evento para todo o tenant (ou para uma pessoa dele).
 *
 * **Chame DEPOIS do commit, nunca dentro da transação.** Publicar antes cria a corrida
 * em que o navegador é avisado, busca o dado, ainda lê o valor velho — e não recebe
 * segundo aviso. O sintoma seria exatamente o defeito que o tempo real existe para
 * consertar: o atendente não vê a mensagem chegar.
 *
 * Falhar aqui **não pode derrubar a operação**: a conversa já foi salva, e o preço de
 * não publicar é a tela demorar a atualizar, não perder dado.
 */
export async function publicar(tenantId: string, evento: EventoPublicado): Promise<void> {
  try {
    await conexaoPublicador().publish(canalDoTenant(tenantId), JSON.stringify(evento));
  } catch (erro) {
    console.error(`[tempo-real] não publicou para ${tenantId}: ${(erro as Error).message}`);
  }
}

/** Atalho de quem só quer dizer "a conversa X mudou". */
export function evento(assunto: Assunto, id?: string, usuarioId?: string): EventoPublicado {
  return {
    assunto,
    ...(id ? { id } : {}),
    ...(usuarioId ? { usuarioId } : {}),
    em: new Date().toISOString(),
  };
}

/**
 * Registra uma conexão e devolve como encerrá-la.
 *
 * O processo assina o canal do tenant na PRIMEIRA conexão dele e desassina na última
 * que sair — é o que garante que um processo sem ninguém de um cliente não receba
 * nada daquele cliente.
 */
export async function registrar(conexao: Conexao): Promise<() => Promise<void>> {
  let conexoes = porTenant.get(conexao.tenantId);
  if (!conexoes) {
    conexoes = new Set();
    porTenant.set(conexao.tenantId, conexoes);
    await conexaoAssinante().subscribe(canalDoTenant(conexao.tenantId));
  }
  conexoes.add(conexao);

  let encerrada = false;
  return async () => {
    if (encerrada) return;
    encerrada = true;
    const vivas = porTenant.get(conexao.tenantId);
    if (!vivas) return;
    vivas.delete(conexao);
    if (vivas.size === 0) {
      porTenant.delete(conexao.tenantId);
      await conexaoAssinante().unsubscribe(canalDoTenant(conexao.tenantId));
    }
  };
}

/** Quantas conexões vivas há neste processo. Alimenta `/metrics` e o teste. */
export function conexoesVivas(tenantId?: string): number {
  if (tenantId) return porTenant.get(tenantId)?.size ?? 0;
  let total = 0;
  for (const conexoes of porTenant.values()) total += conexoes.size;
  return total;
}

export async function fecharTempoReal(): Promise<void> {
  porTenant.clear();
  await assinante?.quit();
  await publicador?.quit();
  assinante = null;
  publicador = null;
}
