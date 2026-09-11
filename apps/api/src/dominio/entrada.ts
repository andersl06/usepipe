import { sql } from 'drizzle-orm';
import { registrarMensagemDoContato, transicaoEntregaPermitida } from '@pipe/core';
import type { EstadoEntrega } from '@pipe/core';
import type { TransacaoPipe } from '@pipe/db';
import { noTenant } from '../banco.js';
import type { CanalResolvido } from '../banco.js';
import { contar } from '../metricas.js';
// Ciclo consciente: `filas.ts` importa `processarPayload` daqui e daqui sai
// `enfileirarEspelhoCrm`. As duas são declarações de função, então o hoisting do ESM
// resolve — nenhuma é chamada durante a avaliação do módulo.
import { enfileirarEntrega, enfileirarEspelhoCrm } from '../filas.js';
import { distribuirConversa } from './distribuicao.js';
import { registrarEvento } from './eventos.js';
import { fluxoPublicadoDoCanal, rodarFluxoNaEntrada } from './fluxo.js';
import { drenarEmSegundoPlano, emitir } from '../webhooks-saida.js';
import { evento, publicar } from '../tempo-real.js';

/**
 * Entrada vinda da Meta: mensagem recebida, status de entrega e erro.
 *
 * Cada evento é processado numa transação com `pipe.tenant_id` fixado, em série.
 * Reentrega de webhook é normal — a Meta repete quando não recebe 200 rápido — então
 * tudo aqui é **idempotente**: mensagem já vista pelo `id_provedor` é ignorada, e
 * status que não avança na máquina de entrega é descartado sem erro.
 */

export interface ValorDoWebhook {
  messaging_product?: string;
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  contacts?: { profile?: { name?: string }; wa_id?: string }[];
  messages?: MensagemDaMeta[];
  statuses?: StatusDaMeta[];
  errors?: ErroDaMeta[];
}

interface MensagemDaMeta {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: MidiaDaMeta;
  audio?: MidiaDaMeta;
  video?: MidiaDaMeta;
  document?: MidiaDaMeta & { filename?: string };
  sticker?: MidiaDaMeta;
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  button?: { text?: string };
  interactive?: {
    button_reply?: { title?: string };
    list_reply?: { title?: string };
  };
  errors?: ErroDaMeta[];
}

interface MidiaDaMeta {
  id?: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
}

interface StatusDaMeta {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  errors?: ErroDaMeta[];
}

interface ErroDaMeta {
  code?: number;
  title?: string;
  message?: string;
  error_data?: { details?: string };
}

export interface ResultadoEntrada {
  mensagensRecebidas: number;
  statusAplicados: number;
  ignorados: number;
}

/** Tipos da Meta → `mensagem.tipo` do Pipe. */
const TIPO_DA_META: Readonly<Record<string, string>> = {
  text: 'texto',
  image: 'imagem',
  audio: 'audio',
  voice: 'audio',
  video: 'video',
  document: 'documento',
  sticker: 'imagem',
  location: 'localizacao',
  button: 'texto',
  interactive: 'texto',
};

const STATUS_DA_META: Readonly<Record<string, EstadoEntrega>> = {
  sent: 'enviada',
  delivered: 'entregue',
  read: 'lida',
  failed: 'falhou',
};

/**
 * Processa um payload inteiro do webhook.
 *
 * A Meta reenvia se a resposta demorar, então quem chama já respondeu 200 — este
 * trabalho roda em fila. Devolve o resumo para o log e para o teste.
 */
export async function processarPayload(
  canal: CanalResolvido,
  payload: unknown,
): Promise<ResultadoEntrada> {
  const resumo: ResultadoEntrada = { mensagensRecebidas: 0, statusAplicados: 0, ignorados: 0 };
  const valores = extrairValores(payload);

  // As conversas tocadas, para avisar as telas DEPOIS do commit. `Set` porque duas
  // mensagens do mesmo cliente no mesmo lote são um aviso só.
  const tocadas = new Set<string>();
  let entrouNaFila = false;
  let respostasDoBot = 0;

  // Em série: cada valor abre a própria transação com tenant fixado.
  for (const valor of valores) {
    for (const mensagem of valor.messages ?? []) {
      const recebida = await receberMensagem(canal, valor, mensagem);
      if (recebida) {
        resumo.mensagensRecebidas += 1;
        tocadas.add(recebida.conversaId);
        entrouNaFila = true;
        respostasDoBot += recebida.respostasDoBot;
      } else resumo.ignorados += 1;
    }
    for (const status of valor.statuses ?? []) {
      const conversaId = await aplicarStatus(canal, status);
      if (conversaId) {
        resumo.statusAplicados += 1;
        tocadas.add(conversaId);
      } else resumo.ignorados += 1;
    }
  }

  if (resumo.mensagensRecebidas > 0 || resumo.statusAplicados > 0) {
    drenarEmSegundoPlano(canal.tenantId);
  }
  // Depois do commit: a resposta do bot já está no outbox, e o empurrão faz o worker
  // entregar agora em vez de na próxima varredura.
  if (respostasDoBot > 0) await enfileirarEntrega({});

  // **Depois do commit.** Publicar dentro da transação avisaria a tela antes de o
  // dado existir: ela buscaria o valor velho e não receberia segundo aviso — que é
  // o próprio defeito que o tempo real existe para consertar.
  for (const conversaId of tocadas) {
    await publicar(canal.tenantId, evento('conversa', conversaId));
  }
  // Mensagem nova mexe no tamanho e na ordem da fila; a lista do Desk repinta por isto.
  if (entrouNaFila) await publicar(canal.tenantId, evento('fila'));

  return resumo;
}

export function extrairValores(payload: unknown): ValorDoWebhook[] {
  const corpo = payload as { entry?: { changes?: { field?: string; value?: ValorDoWebhook }[] }[] };
  const valores: ValorDoWebhook[] = [];
  for (const entrada of corpo?.entry ?? []) {
    for (const mudanca of entrada.changes ?? []) {
      if (mudanca.value) valores.push(mudanca.value);
    }
  }
  return valores;
}

async function receberMensagem(
  canal: CanalResolvido,
  valor: ValorDoWebhook,
  mensagem: MensagemDaMeta,
): Promise<{ conversaId: string; respostasDoBot: number } | null> {
  const idProvedor = mensagem.id;
  const de = mensagem.from;
  if (!idProvedor || !de) return null;

  const em = mensagem.timestamp ? new Date(Number(mensagem.timestamp) * 1000) : new Date();
  const nomeDoPerfil = valor.contacts?.find((c) => c.wa_id === de)?.profile?.name ?? null;

  return noTenant(canal.tenantId, async (tx) => {
    // Idempotência. Sem índice único em `id_provedor` (a tabela é particionada e a
    // unicidade dela é `(id, criada_em)`), a guarda é esta consulta. Duas entregas
    // simultâneas do mesmo evento ainda poderiam passar as duas — a janela é curta e
    // o custo seria uma mensagem repetida na tela, não perda de dado.
    const { rows: jaVista } = await tx.execute<{ existe: number }>(
      sql`select 1 as existe from mensagem where id_provedor = ${idProvedor} limit 1`,
    );
    if (jaVista.length > 0) return null;

    const inbox = await acharInbox(tx, canal.id);
    const contatoId = await acharOuCriarContato(tx, canal, de, nomeDoPerfil);
    // Com fluxo publicado no canal, a conversa nova é do bot: nasce sem fila.
    const fluxo = await fluxoPublicadoDoCanal(tx, canal.id);
    const conversa = await acharOuAbrirConversa(tx, canal, inbox, contatoId, em, fluxo !== null);

    const conteudo = textoDe(mensagem);
    const tipo = TIPO_DA_META[mensagem.type ?? 'text'] ?? 'texto';
    const anexoId = await guardarAnexo(tx, canal.tenantId, mensagem);

    const { rows: criada } = await tx.execute<{ id: string }>(sql`
      insert into mensagem (
        tenant_id, conversa_id, direcao, autor_tipo, tipo, conteudo, anexo_id,
        id_provedor, criada_em, dentro_da_janela
      ) values (
        ${canal.tenantId}, ${conversa.id}, 'entrada', 'contato', ${tipo}, ${conteudo},
        ${anexoId}, ${idProvedor}, ${em}, true
      )
      returning id
    `);
    const mensagemId = criada[0]?.id ?? null;

    // A janela de 24h é recalculada a cada mensagem de entrada do contato — a regra
    // está em `@pipe/core`, não aqui.
    const janela = registrarMensagemDoContato(em, mensagemId ?? undefined);
    await tx.execute(sql`
      update conversa
         set ultima_mensagem_em = ${em}, ultima_mensagem_de = 'contato',
             janela_expira_em = ${janela.expiraEm},
             janela_aberta_por_mensagem_id = ${janela.abertaPorMensagemId ?? null},
             atualizado_em = now()
       where id = ${conversa.id}
    `);

    await registrarEvento(tx, {
      tenantId: canal.tenantId,
      conversaId: conversa.id,
      tipo: 'mensagem_entrada',
      em,
      filaId: conversa.filaId,
    });

    await emitir(tx, canal.tenantId, 'mensagem.criada', {
      mensagem_id: mensagemId,
      conversa_id: conversa.id,
      direcao: 'entrada',
      tipo,
      conteudo,
    });

    // O bot fala primeiro. Se ficou com a mensagem, a conversa é dele — ou acabou de
    // ser transferida, e a distribuição já rodou lá dentro.
    const bot = await rodarFluxoNaEntrada(tx, fluxo, {
      tenantId: canal.tenantId,
      conversa: {
        id: conversa.id,
        nova: conversa.nova,
        filaId: conversa.filaId,
        atendenteId: conversa.atendenteId,
        filaPadraoId: inbox.filaPadraoId,
      },
      contatoId,
      mensagem: { id: mensagemId, idProvedor, tipo, conteudo },
    });

    // Conversa parada na fila é candidata a distribuição a cada mensagem nova: se o
    // atendente entrou online depois da primeira, ela sai da fila agora.
    if (!bot.tratou && conversa.estado === 'na_fila' && !conversa.atendenteId && conversa.filaId) {
      await distribuirConversa(tx, canal.tenantId, conversa.id, conversa.filaId, em);
    }

    return { conversaId: conversa.id, respostasDoBot: bot.respostas };
  });
}

async function aplicarStatus(canal: CanalResolvido, status: StatusDaMeta): Promise<string | null> {
  const idProvedor = status.id;
  const alvo = STATUS_DA_META[status.status ?? ''];
  if (!idProvedor || !alvo) return null;

  const em = status.timestamp ? new Date(Number(status.timestamp) * 1000) : new Date();
  const erro = status.errors?.[0];

  return noTenant(canal.tenantId, async (tx) => {
    const { rows } = await tx.execute<{
      id: string;
      conversa_id: string;
      estado_entrega: EstadoEntrega | null;
    }>(sql`
      select id, conversa_id, estado_entrega from mensagem
       where id_provedor = ${idProvedor} limit 1
    `);
    const mensagem = rows[0];
    if (!mensagem) return null;

    // Status fora de ordem é rotina na Meta: `delivered` pode chegar depois de `read`.
    // Transição não permitida é descartada em silêncio — nunca vira erro nem regressão.
    const atual = mensagem.estado_entrega;
    if (atual === alvo) return null;
    if (atual !== null && !transicaoEntregaPermitida(atual, alvo)) return null;

    // `coalesce` nos carimbos: `read` que chega antes de `delivered` não pode apagar
    // nem reescrever a hora da entrega. Carimbo já gravado é histórico.
    await tx.execute(sql`
      update mensagem
         set estado_entrega = ${alvo},
             entregue_em = ${
               alvo === 'entregue' || alvo === 'lida' ? sql`coalesce(entregue_em, ${em})` : sql`entregue_em`
             },
             lida_em = ${alvo === 'lida' ? sql`coalesce(lida_em, ${em})` : sql`lida_em`},
             erro_codigo = ${alvo === 'falhou' ? String(erro?.code ?? 'desconhecido') : null},
             erro_texto = ${
               alvo === 'falhou'
                 ? (erro?.error_data?.details ?? erro?.title ?? 'A Meta recusou a mensagem.')
                 : null
             }
       where id = ${mensagem.id}
    `);

    // O outbox acompanha, senão a varredura tentaria entregar de novo o que já chegou.
    await tx.execute(sql`
      update outbox_mensagem
         set estado = ${alvo === 'falhou' ? 'falhou' : alvo}, atualizado_em = now()
       where mensagem_id = ${mensagem.id}
    `);

    await emitir(tx, canal.tenantId, 'mensagem.estado_entrega_alterado', {
      mensagem_id: mensagem.id,
      conversa_id: mensagem.conversa_id,
      estado_anterior: atual,
      estado_novo: alvo,
    });

    // O desfecho da entrega é aqui que vira número: é este webhook que a Meta usa
    // para dizer se a mensagem chegou. `entregue` conta uma vez, `lida` não conta de
    // novo — senão a taxa de falha do alerta `EntregaFalhando` seria diluída por
    // cada leitura.
    // ponytail: rótulo `canal` é o id do canal, uma série por número de WhatsApp.
    // Se a base passar de alguns milhares de canais, trocar por `canal.tipo` e
    // deixar o detalhe para o log.
    if (alvo === 'falhou' || alvo === 'entregue') {
      contar('pipe_mensagem_entrega_total', {
        canal: canal.id,
        resultado: alvo === 'falhou' ? 'falha' : 'sucesso',
      });
    }

    return mensagem.conversa_id;
  });
}

// --- peças reutilizadas ---

interface InboxResolvida {
  id: string;
  filaPadraoId: string | null;
}

async function acharInbox(tx: TransacaoPipe, canalId: string): Promise<InboxResolvida> {
  const { rows } = await tx.execute<{ id: string; fila_padrao_id: string | null }>(
    sql`select id, fila_padrao_id from inbox where canal_id = ${canalId} order by criado_em limit 1`,
  );
  const linha = rows[0];
  if (!linha) throw new Error(`canal ${canalId} não tem inbox: a mensagem não tem onde cair.`);
  return { id: linha.id, filaPadraoId: linha.fila_padrao_id };
}

async function acharOuCriarContato(
  tx: TransacaoPipe,
  canal: CanalResolvido,
  identificador: string,
  nome: string | null,
): Promise<string> {
  const { rows } = await tx.execute<{ contato_id: string }>(sql`
    select contato_id from contato_identidade
     where canal_tipo = ${canal.tipo} and identificador = ${identificador}
     limit 1
  `);
  const existente = rows[0]?.contato_id;
  if (existente) return existente;

  // O telefone só é preenchido no WhatsApp: no Instagram o identificador é a conta,
  // e escrever conta de Instagram em `telefone_e164` estragaria a busca por telefone.
  const telefone = canal.tipo === 'whatsapp_cloud' ? `+${identificador}` : null;
  const { rows: criado } = await tx.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome, telefone_e164)
    values (${canal.tenantId}, ${nome}, ${telefone})
    returning id
  `);
  const contatoId = criado[0]?.id;
  if (!contatoId) throw new Error('não criou o contato');

  await tx.execute(sql`
    insert into contato_identidade (tenant_id, contato_id, canal_tipo, identificador)
    values (${canal.tenantId}, ${contatoId}, ${canal.tipo}, ${identificador})
    on conflict (tenant_id, canal_tipo, identificador) do nothing
  `);

  await emitir(tx, canal.tenantId, 'contato.criado', { contato_id: contatoId, nome, telefone });

  // O espelho no CRM é trabalho de fila, e enfileirar não pode derrubar o
  // atendimento: `enfileirarEspelhoCrm` engole a própria falha, e a varredura de
  // 5 minutos recupera o que não entrou. Ver `dominio/espelho-crm.ts`.
  await enfileirarEspelhoCrm({ tenantId: canal.tenantId, contatoId });
  return contatoId;
}

interface ConversaResolvida {
  id: string;
  estado: string;
  atendenteId: string | null;
  filaId: string | null;
  /** Nasceu com esta mensagem — só conversa nova começa fluxo. */
  nova: boolean;
}

async function acharOuAbrirConversa(
  tx: TransacaoPipe,
  canal: CanalResolvido,
  inbox: InboxResolvida,
  contatoId: string,
  em: Date,
  comBot: boolean,
): Promise<ConversaResolvida> {
  const { rows } = await tx.execute<{
    id: string;
    estado: string;
    atendente_id: string | null;
    fila_id: string | null;
  }>(sql`
    select id, estado, atendente_id, fila_id from conversa
     where contato_id = ${contatoId} and inbox_id = ${inbox.id} and estado <> 'encerrada'
     order by criada_em desc
     limit 1
  `);
  const aberta = rows[0];
  if (aberta) {
    return {
      id: aberta.id,
      estado: aberta.estado,
      atendenteId: aberta.atendente_id,
      filaId: aberta.fila_id,
      nova: false,
    };
  }

  // Com bot, a conversa nasce sem fila: só entra na fila quando o bot transferir.
  const filaId = comBot ? null : inbox.filaPadraoId;
  const { rows: criada } = await tx.execute<{ id: string }>(sql`
    insert into conversa (tenant_id, inbox_id, contato_id, fila_id, estado, criada_em)
    values (${canal.tenantId}, ${inbox.id}, ${contatoId}, ${filaId}, 'na_fila', ${em})
    returning id
  `);
  const conversaId = criada[0]?.id;
  if (!conversaId) throw new Error('não criou a conversa');

  // `criada` e `enfileirada` marcam o começo do ATENDIMENTO, e é deles que sai o tempo
  // de fila. Conversa com bot os ganha no transbordo (`dominio/fluxo.ts`), não aqui.
  if (!comBot) {
    await registrarEvento(tx, {
      tenantId: canal.tenantId,
      conversaId,
      tipo: 'criada',
      em,
      filaId,
    });
    await registrarEvento(tx, {
      tenantId: canal.tenantId,
      conversaId,
      tipo: 'enfileirada',
      em,
      filaId,
    });
  }
  await emitir(tx, canal.tenantId, 'conversa.criada', {
    conversa_id: conversaId,
    contato_id: contatoId,
    fila_id: filaId,
  });

  return { id: conversaId, estado: 'na_fila', atendenteId: null, filaId, nova: true };
}

function textoDe(mensagem: MensagemDaMeta): string | null {
  if (mensagem.text?.body) return mensagem.text.body;
  if (mensagem.button?.text) return mensagem.button.text;
  if (mensagem.interactive?.button_reply?.title) return mensagem.interactive.button_reply.title;
  if (mensagem.interactive?.list_reply?.title) return mensagem.interactive.list_reply.title;
  if (mensagem.location) {
    const { latitude, longitude, name } = mensagem.location;
    return name ?? `${latitude}, ${longitude}`;
  }
  return (
    mensagem.image?.caption ??
    mensagem.video?.caption ??
    mensagem.document?.caption ??
    mensagem.audio?.caption ??
    null
  );
}

/**
 * A Meta manda só o `media_id`; o arquivo é baixado depois pelo endpoint de mídia.
 * Aqui fica a linha de `anexo` com a referência, para a mensagem não nascer órfã.
 * `bytes = 0` marca "ainda não baixado" — o download é trabalho de fila, não de
 * webhook, porque a Meta reenvia se a resposta demorar.
 */
async function guardarAnexo(
  tx: TransacaoPipe,
  tenantId: string,
  mensagem: MensagemDaMeta,
): Promise<string | null> {
  const midia =
    mensagem.image ?? mensagem.audio ?? mensagem.video ?? mensagem.document ?? mensagem.sticker;
  if (!midia?.id) return null;

  const { rows } = await tx.execute<{ id: string }>(sql`
    insert into anexo (tenant_id, chave_storage, mime, bytes, nome_original, checksum)
    values (
      ${tenantId}, ${`meta:${midia.id}`}, ${midia.mime_type ?? 'application/octet-stream'}, 0,
      ${mensagem.document?.filename ?? null}, ${midia.sha256 ?? null}
    )
    returning id
  `);
  return rows[0]?.id ?? null;
}
