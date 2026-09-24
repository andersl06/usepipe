import { sql } from 'drizzle-orm';
import type { TransacaoPipe } from '@pipe/db';
import { noTenant } from '../banco.js';
import type { CanalResolvido } from '../banco.js';
import { ErroPipe } from '../erros.js';
import { registrarEvento } from './eventos.js';
import { enviarMensagem } from './envio.js';
import { emitir } from '../webhooks-saida.js';

/**
 * Mensagem ativa: disparar template para uma LISTA de contatos.
 *
 * É a aba mais pesada do Desk, e o levantamento está em
 * `referencias-blip/pesquisa/blip-desk-mensagens-ativas.md`. Os números daqui são os da Blip.
 *
 * **O envio em si não é reimplementado.** Cada contato passa por `enviarMensagem`, que
 * já sabe janela de 24h, outbox, posicionamento de variável de template, evento e
 * webhook. O que existe aqui é só o que a lista acrescenta: resolver o contato, as
 * recusas, e o teto do lote.
 *
 * **Nunca é tudo-ou-nada.** Um número inválido no meio de quinze não pode derrubar os
 * catorze bons — cada contato tem o próprio resultado, como na tela deles.
 */

/** `SELECTED_CONTACT_LIST_LIMIT` = 15 (config `ActiveMessageLimitBatchDispatch`). */
export const MAX_CONTATOS_POR_DISPARO = Number(
  process.env['PIPE_MENSAGEM_ATIVA_MAX_CONTATOS'] ?? 15,
);

/**
 * `ActiveMessageLimitCount`, quantas ativas o MESMO contato pode receber por dia.
 * Zero desliga o limite — é o padrão deles.
 */
export const LIMITE_DIARIO_POR_CONTATO = Number(
  process.env['PIPE_MENSAGEM_ATIVA_LIMITE_DIARIO'] ?? 0,
);

export type MotivoDeRecusa =
  | 'numero_invalido'
  | 'ja_em_atendimento'
  | 'limite_diario'
  | 'contato_duplicado';

export interface DestinoDoDisparo {
  /** Um dos dois: contato já cadastrado, ou telefone para achar/cadastrar. */
  contatoId?: string | null;
  telefone?: string | null;
  nome?: string | null;
  /** Variáveis do corpo só deste contato. Sem elas, valem as do lote. */
  parametros?: string[] | null;
}

export interface ResultadoDoDestino {
  telefone: string | null;
  contatoId: string | null;
  enviada: boolean;
  mensagemId?: string;
  conversaId?: string;
  motivo?: MotivoDeRecusa;
  detalhe?: string;
}

export interface PedidoDeDisparo {
  tenantId: string;
  canalId: string;
  templateId: string;
  destinos: DestinoDoDisparo[];
  parametros?: string[];
  /** Quem disparou. A conversa criada nasce com essa pessoa, como no Desk deles. */
  atendenteId?: string | null;
}

/**
 * E.164: `+` e de 8 a 15 dígitos. Para o Brasil, exige DDI 55 + DDD + 8 ou 9 dígitos.
 *
 * A Blip mostra "Número de telefone pode ser inválido" e, com
 * `active-message-block-invalid-phonenumber`, bloqueia. Aqui bloqueia sempre: mandar
 * template para número inválido gasta a conversa cobrada da Meta e não entrega nada.
 */
export function telefoneValido(bruto: string): boolean {
  // Só a PONTUAÇÃO de formatação sai: espaço, parênteses, traço e ponto. Letra e
  // qualquer outro caractere reprovam o número em vez de serem apagados — jogar fora
  // o que não se entende transformaria um telefone digitado errado em outro telefone
  // válido, e o template sairia (cobrado pela Meta) para a pessoa errada.
  const limpo = bruto.replace(/[\s()\-.]/g, '');
  if (!/^\+\d{8,15}$/.test(limpo)) return false;
  if (limpo.startsWith('+55')) return /^\+55\d{2}\d{8,9}$/.test(limpo);
  return true;
}

function normalizar(bruto: string): string {
  const limpo = bruto.replace(/[\s()\-.]/g, '');
  return limpo.startsWith('+') ? limpo : `+${limpo}`;
}

export async function dispararMensagemAtiva(
  canal: CanalResolvido,
  pedido: PedidoDeDisparo,
): Promise<ResultadoDoDestino[]> {
  if (pedido.destinos.length === 0) {
    throw ErroPipe.requisicao('sem_destino', 'Escolha ao menos um contato.');
  }
  if (pedido.destinos.length > MAX_CONTATOS_POR_DISPARO) {
    throw ErroPipe.requisicao(
      'limite_de_contatos',
      `O limite é de ${MAX_CONTATOS_POR_DISPARO} contatos por disparo.`,
      { limite: MAX_CONTATOS_POR_DISPARO, enviados: pedido.destinos.length },
    );
  }

  const resultados: ResultadoDoDestino[] = [];
  const jaVistos = new Set<string>();

  // Em SÉRIE, e não `Promise.all`: cada destino abre a própria transação, e paralelo
  // na mesma conexão derruba o `set_config('pipe.tenant_id')`. Aqui isso escreveria
  // mensagem no tenant errado — o pior lugar possível.
  for (const destino of pedido.destinos) {
    resultados.push(await umDestino(canal, pedido, destino, jaVistos));
  }
  return resultados;
}

async function umDestino(
  canal: CanalResolvido,
  pedido: PedidoDeDisparo,
  destino: DestinoDoDisparo,
  jaVistos: Set<string>,
): Promise<ResultadoDoDestino> {
  const telefone = destino.telefone ? normalizar(destino.telefone) : null;

  if (telefone && !telefoneValido(telefone)) {
    return { telefone, contatoId: null, enviada: false, motivo: 'numero_invalido' };
  }

  const chave = destino.contatoId ?? telefone ?? '';
  if (jaVistos.has(chave)) {
    return { telefone, contatoId: destino.contatoId ?? null, enviada: false, motivo: 'contato_duplicado' };
  }
  jaVistos.add(chave);

  // Preparo e recusas numa transação; o envio vai em outra, pela mesma razão de
  // sempre: não segurar conexão enquanto se fala com serviço externo.
  const preparo = await noTenant(pedido.tenantId, async (tx) => {
    const contatoId = destino.contatoId ?? (await acharOuCriarPorTelefone(tx, canal, telefone!, destino.nome ?? null));

    const { rows: emAtendimento } = await tx.execute<{ id: string }>(sql`
      select id from conversa
       where contato_id = ${contatoId}::uuid and estado <> 'encerrada' limit 1
    `);
    if (emAtendimento[0]) {
      // Código 1602 deles. Conversa aberta é caminho de envio normal, não de ativa —
      // e `enviarMensagem` já manda template fora da janela quando preciso.
      return { contatoId, recusa: 'ja_em_atendimento' as const };
    }

    if (LIMITE_DIARIO_POR_CONTATO > 0) {
      const { rows: hoje } = await tx.execute<{ n: number }>(sql`
        select count(*)::int as n from mensagem
         where conversa_id in (select id from conversa where contato_id = ${contatoId}::uuid)
           and direcao = 'saida' and template_id is not null
           and criada_em >= date_trunc('day', now())
      `);
      if ((hoje[0]?.n ?? 0) >= LIMITE_DIARIO_POR_CONTATO) {
        return { contatoId, recusa: 'limite_diario' as const };
      }
    }

    const conversaId = await abrirConversaDeDisparo(tx, canal, pedido, contatoId);
    return { contatoId, conversaId, recusa: null };
  });

  if (preparo.recusa) {
    return { telefone, contatoId: preparo.contatoId, enviada: false, motivo: preparo.recusa };
  }

  try {
    const enfileirada = await enviarMensagem({
      tenantId: pedido.tenantId,
      conversaId: preparo.conversaId!,
      atendenteId: pedido.atendenteId ?? null,
      tipo: 'template',
      templateId: pedido.templateId,
      parametros: destino.parametros ?? pedido.parametros ?? [],
    });
    return {
      telefone,
      contatoId: preparo.contatoId,
      enviada: true,
      mensagemId: enfileirada.id,
      conversaId: preparo.conversaId!,
    };
  } catch (erro) {
    // Template reprovado ou sumido derruba o LOTE inteiro, e deve mesmo: é erro do
    // disparo, não daquele contato. Qualquer outra falha fica no contato.
    if (erro instanceof ErroPipe && erro.status === 404) throw erro;
    if (erro instanceof ErroPipe && erro.codigo === 'template_nao_aprovado') throw erro;
    return {
      telefone,
      contatoId: preparo.contatoId,
      enviada: false,
      motivo: 'numero_invalido',
      detalhe: erro instanceof Error ? erro.message : 'falha no envio',
    };
  }
}

async function acharOuCriarPorTelefone(
  tx: TransacaoPipe,
  canal: CanalResolvido,
  telefone: string,
  nome: string | null,
): Promise<string> {
  // O identificador do WhatsApp é o telefone SEM o `+` — a mesma forma que
  // `acharOuCriarContato` usa no caminho de entrada. Divergir aqui criaria um contato
  // paralelo para a mesma pessoa na primeira mensagem que ela respondesse.
  const identificador = telefone.replace(/^\+/, '');
  const { rows } = await tx.execute<{ contato_id: string }>(sql`
    select contato_id from contato_identidade
     where canal_tipo = ${canal.tipo} and identificador = ${identificador} limit 1
  `);
  const existente = rows[0]?.contato_id;
  if (existente) return existente;

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
  await emitir(tx, canal.tenantId, 'contato.criado', {
    contato_id: contatoId,
    nome,
    telefone,
    origem: 'mensagem_ativa',
  });
  return contatoId;
}

/**
 * A conversa que a mensagem ativa abre.
 *
 * Nasce **atribuída a quem disparou** quando o disparo veio de gente: foi essa pessoa
 * que iniciou o contato e é ela que vai receber a resposta, como no Desk deles. Via
 * chave de API não há dono, e a conversa cai na fila para a distribuição resolver.
 *
 * `janela_expira_em` fica NULO de propósito: quem abre a janela de 24h é a resposta do
 * cliente, não o nosso disparo. Marcar a janela aqui faria o Desk oferecer texto livre
 * antes de o cliente ter respondido — e a Meta recusaria.
 */
async function abrirConversaDeDisparo(
  tx: TransacaoPipe,
  canal: CanalResolvido,
  pedido: PedidoDeDisparo,
  contatoId: string,
): Promise<string> {
  const { rows: inboxes } = await tx.execute<{ id: string; fila_padrao_id: string | null }>(
    sql`select id, fila_padrao_id from inbox where canal_id = ${pedido.canalId} order by criado_em limit 1`,
  );
  const inbox = inboxes[0];
  if (!inbox) throw ErroPipe.conflito('canal_sem_inbox', 'O canal não tem inbox configurada.');

  const agora = new Date();
  const atendente = pedido.atendenteId ?? null;
  const estado = atendente ? 'atribuida' : 'na_fila';

  const { rows } = await tx.execute<{ id: string }>(sql`
    insert into conversa (tenant_id, inbox_id, contato_id, fila_id, atendente_id, estado,
                          criada_em, atribuida_em)
    values (${canal.tenantId}, ${inbox.id}, ${contatoId}, ${inbox.fila_padrao_id},
            ${atendente}, ${estado}, ${agora}, ${atendente ? agora : null})
    returning id
  `);
  const conversaId = rows[0]?.id;
  if (!conversaId) throw new Error('não criou a conversa do disparo');

  await registrarEvento(tx, {
    tenantId: canal.tenantId,
    conversaId,
    tipo: 'criada',
    em: agora,
    usuarioId: atendente,
    filaId: inbox.fila_padrao_id,
    dados: { origem: 'mensagem_ativa' },
  });
  await registrarEvento(tx, {
    tenantId: canal.tenantId,
    conversaId,
    tipo: atendente ? 'atribuida' : 'enfileirada',
    em: agora,
    usuarioId: atendente,
    filaId: inbox.fila_padrao_id,
  });
  await emitir(tx, canal.tenantId, 'conversa.criada', {
    conversa_id: conversaId,
    contato_id: contatoId,
    fila_id: inbox.fila_padrao_id,
    origem: 'mensagem_ativa',
  });
  return conversaId;
}

export interface LinhaDoPainel {
  mensagemId: string;
  conversaId: string;
  contatoId: string;
  contatoNome: string | null;
  telefone: string | null;
  templateNome: string | null;
  estadoEntrega: string | null;
  erroCodigo: string | null;
  criadaEm: string;
}

/**
 * O painel de status das mensagens ativas: **últimas 72 horas**, como o deles.
 *
 * Sai de `mensagem`, e não de tabela própria: o disparo já é um conjunto de mensagens
 * com `template_id`, e uma segunda tabela dizendo a mesma coisa seria uma segunda
 * verdade para divergir.
 */
export async function painelDeAtivas(
  tenantId: string,
  horas = 72,
): Promise<LinhaDoPainel[]> {
  return noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<{
      id: string;
      conversa_id: string;
      contato_id: string;
      contato_nome: string | null;
      telefone_e164: string | null;
      template_nome: string | null;
      estado_entrega: string | null;
      erro_codigo: string | null;
      criada_em: Date | string;
    }>(sql`
      select m.id, m.conversa_id, ct.id as contato_id, ct.nome as contato_nome,
             ct.telefone_e164, t.nome as template_nome, m.estado_entrega, m.erro_codigo,
             m.criada_em
        from mensagem m
        join conversa c on c.id = m.conversa_id
        join contato ct on ct.id = c.contato_id
        left join template_mensagem t on t.id = m.template_id
       where m.direcao = 'saida' and m.template_id is not null
         and m.criada_em >= now() - ${`${horas} hours`}::interval
       order by m.criada_em desc
       limit 500
    `);
    return rows.map((l) => ({
      mensagemId: l.id,
      conversaId: l.conversa_id,
      contatoId: l.contato_id,
      contatoNome: l.contato_nome,
      telefone: l.telefone_e164,
      templateNome: l.template_nome,
      estadoEntrega: l.estado_entrega,
      erroCodigo: l.erro_codigo,
      criadaEm: l.criada_em instanceof Date ? l.criada_em.toISOString() : String(l.criada_em),
    }));
  });
}
