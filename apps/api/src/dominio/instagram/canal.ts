import { sql } from 'drizzle-orm';
import { cifrarConfig, decifrarConfig, registrarAuditoria } from '@pipe/db';
import { bancoDono, chaveiro, esquecerCanal, noTenant } from '../../banco.js';
import { ErroPipe } from '../../erros.js';
import { codigoDoPostgres } from '../dominios.js';
import { novoVerifyToken, texto } from '../whatsapp/canal.js';
import { clienteGraphInstagram, versaoDaApiInstagram } from './cliente-graph.js';

/**
 * O canal do Instagram (Direct) pelo caminho MANUAL. Reconstruído de
 * chatwoot/chatwoot (MIT), `Channel::Instagram` e
 * app/controllers/api/v1/accounts/instagram/authorizations_controller.rb — lá o
 * token vem do OAuth do app da instalação; aqui não temos app aprovado na Meta, então
 * o cliente cria o app DELE ("Instagram API with Instagram Login"), gera o token de
 * longa duração no painel e cola na Pipe junto com o App Secret. Mesmo desenho da
 * configuração manual do WhatsApp (`../whatsapp/configuracao-manual.ts`).
 *
 * O id da conta profissional (`user_id` do `/me`) mora em `canal.numero_id`: o índice
 * único GLOBAL daquela coluna (migration 0008) é o que barra a mesma conta em dois
 * clientes, inclusive na corrida — sem migration nova.
 */

export interface CanalInstagram {
  id: string;
  tenantId: string;
  nome: string;
  ativo: boolean;
  igUserId: string;
  /** Decifrado. Só em memória. */
  config: Record<string, unknown>;
}

export interface CanalInstagramVisivel {
  id: string;
  nome: string;
  ativo: boolean;
  igUserId: string | null;
  username: string | null;
  estado: 'conectado' | 'desligado' | 'indisponivel';
  motivo: string | null;
  tokenExpiraEm: string | null;
  webhookUrl: string;
  criadoEm: Date;
}

export interface ConexaoInstagram {
  canal: CanalInstagramVisivel;
  /** A assinatura do webhook falhou; o canal fica, e a tela diz o que houve. */
  erroDeWebhook: string | null;
  /** O que o cliente cola no webhook DO APP dele (Painel → Instagram → Webhooks). */
  webhook: { url: string; verifyToken: string };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORMATO_DO_SEGREDO = /^[0-9a-f]{32}$/i;
/** O token de longa duração do Instagram vale 60 dias. */
export const VALIDADE_DO_TOKEN_MS = 60 * 24 * 3600 * 1000;

export function urlDoWebhookInstagram(canalId: string): string {
  const base = (process.env['PIPE_URL_API'] ?? 'http://localhost:3100').replace(/\/$/, '');
  return `${base}/webhooks/instagram/${canalId}`;
}

function recusa(mensagem: string): ErroPipe {
  return new ErroPipe(422, 'configuracao_invalida', mensagem);
}

const contaEmUso = () => recusa('Esta conta do Instagram já está conectada a outra caixa de entrada.');

type LinhaCanal = {
  [coluna: string]: unknown;
  id: string;
  tenant_id: string;
  nome: string;
  ativo: boolean;
  numero_id: string | null;
  criado_em: string | Date;
  config: Record<string, unknown> | null;
};

export async function lerCanalInstagram(tenantId: string, canalId: string): Promise<CanalInstagram> {
  if (!UUID.test(canalId)) throw ErroPipe.naoEncontrado('Canal');
  const linha = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<LinhaCanal>(sql`
      select id, tenant_id, nome, ativo, numero_id, criado_em, config
        from canal where id = ${canalId}::uuid and tipo = 'instagram' limit 1
    `);
    return rows[0] ?? null;
  });
  if (!linha) throw ErroPipe.naoEncontrado('Canal');
  return {
    id: linha.id,
    tenantId: linha.tenant_id,
    nome: linha.nome,
    ativo: linha.ativo,
    igUserId: linha.numero_id ?? '',
    config: decifrarConfig(linha.config ?? {}, chaveiro()),
  };
}

/** Grava o `config` inteiro de novo, cifrado. `cifrarConfig` é idempotente. */
export async function atualizarConfigInstagram(
  canal: CanalInstagram,
  alteracoes: Record<string, unknown>,
): Promise<CanalInstagram> {
  const config = { ...canal.config, ...alteracoes };
  await noTenant(canal.tenantId, async (tx) => {
    await tx.execute(sql`
      update canal set config = ${JSON.stringify(cifrarConfig(config, chaveiro()))}::jsonb,
                       atualizado_em = now()
       where id = ${canal.id}::uuid
    `);
  });
  esquecerCanal(canal.id);
  return { ...canal, config };
}

function visivel(linha: LinhaCanal): CanalInstagramVisivel {
  // `username` e a validade não são segredo: ficam legíveis no `config` cifrado.
  const config = linha.config ?? {};
  const pendente = config['reautorizacaoPendente'] === true;
  return {
    id: linha.id,
    nome: linha.nome,
    ativo: linha.ativo,
    igUserId: linha.numero_id,
    username: texto(config['username']),
    estado: !linha.ativo ? 'desligado' : pendente ? 'indisponivel' : 'conectado',
    motivo: linha.ativo && pendente ? 'reautorizacao_pendente' : null,
    tokenExpiraEm: texto(config['tokenExpiraEm']),
    webhookUrl: urlDoWebhookInstagram(linha.id),
    criadoEm: linha.criado_em instanceof Date ? linha.criado_em : new Date(linha.criado_em),
  };
}

/**
 * ponytail: a lista não pergunta nada à Meta (o WhatsApp lê a saúde a cada vez).
 * `conectado` quer dizer "ligado e sem reautorização pendente"; a renovação diária do
 * token é quem descobre token revogado. Perguntar ao `/me` aqui, quando a tela pedir.
 */
export async function listarCanaisInstagram(tenantId: string): Promise<CanalInstagramVisivel[]> {
  return noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<LinhaCanal>(sql`
      select id, tenant_id, nome, ativo, numero_id, criado_em, config
        from canal where tipo = 'instagram' order by criado_em
    `);
    return rows.map(visivel);
  });
}

async function lerVisivel(tenantId: string, canalId: string): Promise<CanalInstagramVisivel> {
  const linha = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<LinhaCanal>(sql`
      select id, tenant_id, nome, ativo, numero_id, criado_em, config
        from canal where id = ${canalId}::uuid and tipo = 'instagram' limit 1
    `);
    return rows[0] ?? null;
  });
  if (!linha) throw ErroPipe.naoEncontrado('Canal');
  return visivel(linha);
}

/**
 * Valida o token lendo `/me`, confere o App Secret pelo `appsecret_proof`, recusa
 * conta já conectada em QUALQUER cliente, cria canal e caixa na mesma transação,
 * assina o webhook e devolve `{ url, verifyToken }` para o cliente apontar o app dele.
 *
 * A mesma conta, desligada, no MESMO cliente é religada com o token novo — é o
 * "reconectar" do Instagram (o WhatsApp tem a reautorização por `canal_id`).
 */
export async function conectarInstagramManual(pedido: {
  tenantId: string;
  usuarioId: string;
  token?: string | undefined;
  appSecret?: string | undefined;
  nome?: string | undefined;
}): Promise<ConexaoInstagram> {
  if (!pedido.token) throw recusa('O token de acesso é obrigatório.');
  if (!pedido.appSecret) throw recusa('O App Secret é obrigatório.');
  if (!FORMATO_DO_SEGREDO.test(pedido.appSecret)) {
    throw recusa('O App Secret tem 32 caracteres, só números e letras de a a f.');
  }
  const { token, appSecret } = pedido as { token: string; appSecret: string };
  const cliente = clienteGraphInstagram(token);

  let conta;
  try {
    conta = await cliente.buscarConta();
  } catch (erro) {
    if (erro instanceof ErroPipe && erro.codigo === 'meta_recusou') {
      throw recusa('O token não foi aceito pelo Instagram. Gere de novo o token de longa duração no painel do app.');
    }
    throw erro;
  }
  const igUserId = conta.user_id ? String(conta.user_id) : '';
  if (!igUserId) throw recusa('O token não é de uma conta profissional do Instagram.');

  if (!(await cliente.conferirSegredoDoApp(appSecret))) {
    throw recusa('Este App Secret não é do aplicativo que gerou o token.');
  }

  // Unicidade GLOBAL, com o papel dono: a RLS esconderia justamente o canal do outro
  // cliente. Devolve só o necessário para decidir.
  const { rows: existentes } = await bancoDono().execute<{ id: string; tenant_id: string; ativo: boolean }>(sql`
    select id, tenant_id, ativo from canal where numero_id = ${igUserId} limit 1
  `);
  const existente = existentes[0];
  if (existente && (existente.tenant_id !== pedido.tenantId || existente.ativo)) throw contaEmUso();

  const agora = new Date();
  const username = conta.username ?? null;
  const nome = pedido.nome?.trim() || `${username ? `@${username}` : (conta.name ?? igUserId)} Instagram`;
  const configNova = {
    tokenAcesso: token,
    appSecret,
    verifyToken: novoVerifyToken(),
    apiVersao: versaoDaApiInstagram(),
    igUserId,
    ...(conta.id ? { igId: String(conta.id) } : {}),
    ...(username ? { username } : {}),
    nomeExibicao: conta.name ?? username ?? igUserId,
    origem: 'manual',
    // Não sabemos a idade real do token colado: conta a partir de agora.
    // Conferir com token real se vale ler `GET /debug_token` ou equivalente.
    tokenRenovadoEm: agora.toISOString(),
    tokenExpiraEm: new Date(agora.getTime() + VALIDADE_DO_TOKEN_MS).toISOString(),
    reautorizacaoPendente: false,
  };
  const config = cifrarConfig(configNova, chaveiro());

  let canalId: string;
  try {
    canalId = await noTenant(pedido.tenantId, async (tx) => {
      let id: string;
      if (existente) {
        await tx.execute(sql`
          update canal set ativo = true, config = ${JSON.stringify(config)}::jsonb, atualizado_em = now()
           where id = ${existente.id}::uuid
        `);
        id = existente.id;
      } else {
        const { rows } = await tx.execute<{ id: string }>(sql`
          insert into canal (tenant_id, tipo, nome, config, numero_id)
          values (${pedido.tenantId}::uuid, 'instagram', ${nome}, ${JSON.stringify(config)}::jsonb, ${igUserId})
          returning id
        `);
        id = rows[0]!.id;
        // Em série, nunca em `Promise.all` — ver `../whatsapp/criacao-de-canal.ts`.
        const { rows: filas } = await tx.execute<{ id: string }>(
          sql`select id from fila where ativa order by ordem, criado_em limit 1`,
        );
        await tx.execute(sql`
          insert into inbox (tenant_id, canal_id, nome, fila_padrao_id)
          values (${pedido.tenantId}::uuid, ${id}::uuid, ${nome}, ${filas[0]?.id ?? null})
        `);
      }
      await registrarAuditoria(tx, pedido.tenantId, {
        ator: { tipo: 'usuario', id: pedido.usuarioId },
        acao: existente ? 'ativou' : 'criou',
        objetoTipo: 'canal',
        objetoId: id,
        depois: { id, nome, tipo: 'instagram', ig_user_id: igUserId, origem: 'manual' },
      });
      return id;
    });
  } catch (erro) {
    if (codigoDoPostgres(erro) === '23505') throw contaEmUso();
    throw erro;
  }
  esquecerCanal(canalId);

  const webhook = { url: urlDoWebhookInstagram(canalId), verifyToken: configNova.verifyToken };
  let erroDeWebhook: string | null = null;
  try {
    await cliente.assinarWebhook(igUserId);
  } catch (erro) {
    erroDeWebhook = (erro as Error).message;
    console.error(`[instagram] a assinatura do webhook do canal ${canalId} falhou: ${erroDeWebhook}`);
  }
  return { canal: await lerVisivel(pedido.tenantId, canalId), erroDeWebhook, webhook };
}

/**
 * Desliga sem apagar conversa nem mensagem, como o WhatsApp. Tirar a assinatura do
 * webhook é tentativa: token já revogado não pode prender o canal ligado.
 */
export async function desconectarInstagram(
  tenantId: string,
  usuarioId: string,
  canalId: string,
): Promise<CanalInstagramVisivel> {
  const canal = await lerCanalInstagram(tenantId, canalId);
  const token = texto(canal.config['tokenAcesso']);
  if (token && canal.igUserId) {
    try {
      await clienteGraphInstagram(token).desassinarWebhook(canal.igUserId);
    } catch (erro) {
      console.error(`[instagram] o webhook do canal ${canal.id} não foi desassinado: ${(erro as Error).message}`);
    }
  }

  const linha = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<LinhaCanal>(sql`
      update canal set ativo = false, atualizado_em = now()
       where id = ${canalId}::uuid and tipo = 'instagram'
      returning id, tenant_id, nome, ativo, numero_id, criado_em, config
    `);
    const gravado = rows[0];
    if (!gravado) throw ErroPipe.naoEncontrado('Canal');
    await registrarAuditoria(tx, tenantId, {
      ator: { tipo: 'usuario', id: usuarioId },
      acao: 'desativou',
      objetoTipo: 'canal',
      objetoId: canalId,
      depois: { id: canalId, ativo: false },
    });
    return gravado;
  });
  esquecerCanal(canalId);
  return visivel(linha);
}
