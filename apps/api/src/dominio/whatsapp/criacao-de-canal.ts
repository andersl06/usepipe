import { sql } from 'drizzle-orm';
import { cifrarConfig, registrarAuditoria } from '@pipe/db';
import { chaveiro, noTenant } from '../../banco.js';
import { ErroPipe } from '../../erros.js';
import { codigoDoPostgres } from '../dominios.js';
import { lerCanalWhatsApp, novoVerifyToken, numeroJaConectado } from './canal.js';
import type { CanalWhatsApp } from './canal.js';
import { versaoDaApi } from './cliente-graph.js';
import type { InfoDoNumero } from './info-do-numero.js';

/**
 * Portado de chatwoot/chatwoot (MIT), app/services/whatsapp/channel_creation_service.rb
 *
 * Mesmos passos: valida, recusa número que já existe **em qualquer cliente**, e
 * cria canal e caixa de entrada na MESMA transação — canal sem caixa é canal que
 * recebe mensagem sem ter onde pô-la.
 *
 * Acréscimos do Pipe:
 * - o token e o `verify_token` gravados **cifrados** (`cifrarConfig`);
 * - a caixa nasce apontando para a primeira fila ativa, que é quem a distribuição
 *   usa (`fila_padrao_id`) — o Chatwoot não tem fila;
 * - auditoria com o autor, na mesma transação;
 * - o índice único de `numero_id` fecha a corrida que o `find_by` deixa aberta:
 *   duas conexões simultâneas do mesmo número, uma delas cai no `23505`.
 */

export interface InfoDaWaba {
  wabaId: string;
  nomeDaEmpresa?: string | undefined;
}

export type OrigemDoCanal = 'embedded_signup' | 'manual_setup_v2';

export interface PedidoDeCriacao {
  tenantId: string;
  usuarioId: string;
  infoDaWaba: InfoDaWaba | null;
  infoDoNumero: InfoDoNumero | null;
  token: string;
  origem?: OrigemDoCanal;
  /** Só a configuração manual permite escolher o nome; o cadastro embutido usa o da empresa. */
  nome?: string | undefined;
}

/** `errors.whatsapp.phone_number_already_exists`, no texto do pt_BR do próprio Chatwoot. */
export function numeroEmUso(numero: string): ErroPipe {
  return ErroPipe.conflito(
    'numero_em_uso',
    `Já existe um canal para este número de telefone: ${numero}. Entre em contato com o suporte se o erro persistir`,
  );
}

export async function criarCanal(pedido: PedidoDeCriacao): Promise<CanalWhatsApp> {
  // `validate_parameters!`
  if (!pedido.tenantId) throw ErroPipe.requisicao('conta_ausente', 'A conta é obrigatória.');
  if (!pedido.infoDaWaba?.wabaId) {
    throw ErroPipe.requisicao('waba_ausente', 'As informações da WABA são obrigatórias.');
  }
  if (!pedido.infoDoNumero) {
    throw ErroPipe.requisicao('numero_ausente', 'As informações do número são obrigatórias.');
  }
  if (!pedido.token) throw ErroPipe.requisicao('token_ausente', 'O token de acesso é obrigatório.');

  const info = pedido.infoDoNumero;
  const waba = pedido.infoDaWaba;
  if (await numeroJaConectado(info.numeroId, info.numero)) throw numeroEmUso(info.numero);

  // `build_inbox_name`: "#{business_name} WhatsApp".
  const nomeDaEmpresa = info.nomeDaEmpresa || waba.nomeDaEmpresa || info.numero;
  const nome = pedido.nome?.trim() || `${nomeDaEmpresa} WhatsApp`;
  const origem: OrigemDoCanal = pedido.origem ?? 'embedded_signup';

  // `build_provider_config`. O `appSecret` é do NOSSO aplicativo; ausente, não é
  // gravado, e o webhook cai no `WHATSAPP_APP_SECRET` do ambiente.
  const appSecret = process.env['WHATSAPP_APP_SECRET'] ?? '';
  const config = cifrarConfig(
    {
      tokenAcesso: pedido.token,
      phoneNumberId: info.numeroId,
      verifyToken: novoVerifyToken(),
      apiVersao: versaoDaApi(),
      numero: info.numero,
      nomeExibicao: nomeDaEmpresa,
      origem,
      ...(appSecret ? { appSecret } : {}),
    },
    chaveiro(),
  );

  let canalId: string;
  try {
    canalId = await noTenant(pedido.tenantId, async (tx) => {
      // Em série, nunca em `Promise.all`: paralelo dentro da transação derruba o
      // `pipe.tenant_id` e a consulta passa a rodar sem tenant — ver o README.
      const { rows } = await tx.execute<{ id: string }>(sql`
        insert into canal (tenant_id, tipo, nome, config, waba_id, numero_id)
        values (${pedido.tenantId}::uuid, 'whatsapp_cloud', ${nome},
                ${JSON.stringify(config)}::jsonb, ${waba.wabaId}, ${info.numeroId})
        returning id
      `);
      const id = rows[0]!.id;

      const { rows: filas } = await tx.execute<{ id: string }>(
        sql`select id from fila where ativa order by ordem, criado_em limit 1`,
      );
      await tx.execute(sql`
        insert into inbox (tenant_id, canal_id, nome, fila_padrao_id)
        values (${pedido.tenantId}::uuid, ${id}::uuid, ${nome}, ${filas[0]?.id ?? null})
      `);

      await registrarAuditoria(tx, pedido.tenantId, {
        ator: { tipo: 'usuario', id: pedido.usuarioId },
        acao: 'criou',
        objetoTipo: 'canal',
        objetoId: id,
        depois: { id, nome, waba_id: waba.wabaId, numero_id: info.numeroId, origem },
      });
      return id;
    });
  } catch (erro) {
    if (codigoDoPostgres(erro) === '23505') throw numeroEmUso(info.numero);
    throw erro;
  }

  return lerCanalWhatsApp(pedido.tenantId, canalId);
}
