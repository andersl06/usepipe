import { sql } from 'drizzle-orm';
import { registrarAuditoria } from '@pipe/db';
import { noTenant } from '../../banco.js';
import type { CanalResolvido } from '../../banco.js';
import { emitir } from '../../webhooks-saida.js';

/**
 * O que a Meta avisa sobre os modelos da WABA pelo webhook, sem ninguém sincronizar:
 *
 * - `message_template_status_update`: aprovado, rejeitado, pausado, desativado;
 * - `template_category_update`: a Meta recategorizou o modelo (utilidade →
 *   marketing costuma mudar o preço). É o evento por trás do "Alertas de
 *   recategorização de modelos" da origem (`FICHA-canal-whatsapp.md` §4).
 *
 * Esses campos não aceitam override por número: chegam pelo webhook DO APP, que o
 * cliente aponta para a URL do canal na configuração manual. A atualização é por
 * (canal, nome, idioma), que é a chave de `template_mensagem`.
 *
 * ponytail: o alerta sai como webhook de saída `modelo.recategorizado` (com os
 * e-mails configurados no canal) e na auditoria. O Pipe ainda não manda e-mail;
 * quando tiver, é este o ponto que dispara.
 */

const STATUS: Readonly<Record<string, string>> = {
  APPROVED: 'aprovado',
  PENDING: 'pendente',
  IN_APPEAL: 'pendente',
  REJECTED: 'rejeitado',
  PAUSED: 'pausado',
  DISABLED: 'pausado',
  FLAGGED: 'pausado',
};

const CATEGORIA: Readonly<Record<string, string>> = {
  UTILITY: 'utilidade',
  MARKETING: 'marketing',
  AUTHENTICATION: 'autenticacao',
};

interface ValorDeModelo {
  event?: string;
  message_template_name?: string;
  message_template_language?: string;
  reason?: string | null;
  previous_category?: string;
  new_category?: string;
}

type Mudanca = { field?: string; value?: ValorDeModelo };

export function mudancasDeModelo(payload: unknown): Mudanca[] {
  const corpo = payload as { entry?: { changes?: Mudanca[] }[] } | null;
  return (corpo?.entry ?? [])
    .flatMap((e) => e.changes ?? [])
    .filter((c) => c.field === 'message_template_status_update' || c.field === 'template_category_update');
}

/** Devolve quantos modelos mudaram. Modelo que o Pipe não conhece é ignorado — sincronizar traz. */
export async function aplicarEventosDeModelo(canal: CanalResolvido, payload: unknown): Promise<number> {
  let aplicados = 0;
  for (const { field, value } of mudancasDeModelo(payload)) {
    const nome = value?.message_template_name;
    const idioma = value?.message_template_language;
    if (!nome || !idioma) continue;

    if (field === 'message_template_status_update') {
      const status = STATUS[value?.event ?? ''];
      if (!status) continue;
      aplicados += await noTenant(canal.tenantId, async (tx) => {
        const { rows } = await tx.execute<{ id: string }>(sql`
          update template_mensagem set status_meta = ${status}, atualizado_em = now()
           where canal_id = ${canal.id}::uuid and nome = ${nome} and idioma = ${idioma}
          returning id
        `);
        for (const { id } of rows) {
          await registrarAuditoria(tx, canal.tenantId, {
            ator: { tipo: 'sistema' },
            acao: 'alterou',
            objetoTipo: 'template_mensagem',
            objetoId: id,
            depois: { status_meta: status, motivo: value?.reason ?? null },
          });
        }
        return rows.length;
      });
      continue;
    }

    const nova = CATEGORIA[value?.new_category ?? ''];
    if (!nova) continue;
    const preferencias = (canal.config['preferencias'] ?? {}) as {
      alertaRecategorizacao?: { ativo?: boolean; emails?: string[] };
    };
    const alerta = preferencias.alertaRecategorizacao;
    aplicados += await noTenant(canal.tenantId, async (tx) => {
      const { rows } = await tx.execute<{ id: string }>(sql`
        update template_mensagem set categoria = ${nova}, atualizado_em = now()
         where canal_id = ${canal.id}::uuid and nome = ${nome} and idioma = ${idioma}
        returning id
      `);
      for (const { id } of rows) {
        const anterior = CATEGORIA[value?.previous_category ?? ''] ?? null;
        await registrarAuditoria(tx, canal.tenantId, {
          ator: { tipo: 'sistema' },
          acao: 'alterou',
          objetoTipo: 'template_mensagem',
          objetoId: id,
          antes: { categoria: anterior },
          depois: { categoria: nova },
        });
        if (alerta?.ativo ?? true) {
          await emitir(tx, canal.tenantId, 'modelo.recategorizado', {
            template_id: id,
            nome,
            idioma,
            categoria_anterior: anterior,
            categoria_nova: nova,
            // Vazio = todos os administradores do fluxo, como diz a tela da origem.
            emails: alerta?.emails ?? [],
          });
        }
      }
      return rows.length;
    });
  }
  return aplicados;
}
