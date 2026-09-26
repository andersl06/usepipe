import { sql } from 'drizzle-orm';
import { registrarAuditoria } from '@pipe/db';
import type { TransactionPipe } from '@pipe/db';
import { noTenant } from '../../database.js';
import type { ChannelResolved } from '../../database.js';
import { emitir } from '../../webhooks-saida.js';
import { enviarEmailSemDerrubar } from '../email.js';
import { preferencesOf } from './preferences.js';

/**
 * Meta's WABA template webhooks update local models without polling: `message_template_status_update` reports approval, rejection, pause, or disablement; `template_category_update` reports recategorization, such as utility to marketing, which can change price and triggers Blip's recategorization alert (`FICHA-canal-whatsapp.md` §4). These fields have no per-number override, so they arrive at the customer's app webhook configured to the channel URL. Update by (channel, name, language), the `template_mensagem` key. Send alert through outbound webhook `modelo.recategorizado` in the transaction, including configured emails, and email those addresses through `dominio/email.ts` after commit. Email failure cannot undo the model update or queued webhook.
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

const ROTULO_CATEGORIA: Readonly<Record<string, string>> = {
  utilidade: 'Utilidade',
  marketing: 'Marketing',
  autenticacao: 'Autenticação',
};

interface ValueOfTemplate {
  event?: string;
  message_template_name?: string;
  message_template_language?: string;
  reason?: string | null;
  previous_category?: string;
  new_category?: string;
}

type Mudanca = { field?: string; value?: ValueOfTemplate };

export function mudancasOfTemplate(payload: unknown): Mudanca[] {
  const corpo = payload as { entry?: { changes?: Mudanca[] }[] } | null;
  return (corpo?.entry ?? [])
    .flatMap((e) => e.changes ?? [])
    .filter((c) => c.field === 'message_template_status_update' || c.field === 'template_category_update');
}

/**
 * An empty address list means all administrators, as the original screen says (`preferencias.ts`). Pipe defines administrators here as tenant users with `canal.gerenciar`, who manage the channel and can respond to a model price change.
 */
async function emailsOfWhoGerenciaChannel(tx: TransactionPipe): Promise<string[]> {
  const { rows } = await tx.execute<{ email: string }>(sql`
    select distinct u.email
      from usuario u
      join usuario_papel up on up.usuario_id = u.id
      join papel_permissao pp on pp.papel_id = up.papel_id
     where u.ativo and pp.permissao_codigo = 'canal.gerenciar'
     order by u.email
  `);
  return rows.map((r) => r.email);
}

export interface AlertOfRecategorization {
  templateId: string;
  name: string;
  idioma: string;
  categoriaAnterior: string | null;
  categoriaNova: string;
  emails: string[];
}

/** Plain-text alert email describing the change and where to inspect it. */
export function emailOfRecategorization(alerta: AlertOfRecategorization, canalNome: string): {
  para: string[];
  assunto: string;
  texto: string;
} {
  const rotulo = (categoria: string) => ROTULO_CATEGORIA[categoria] ?? categoria;
  const de = alerta.categoriaAnterior ? rotulo(alerta.categoriaAnterior) : 'sem categoria';
  const para = rotulo(alerta.categoriaNova);
  return {
    para: alerta.emails,
    assunto: `Modelo "${alerta.name}" recategorizado pela Meta: ${de} → ${para}`,
    texto:
      `A Meta mudou a categoria do modelo "${alerta.name}" (${alerta.idioma}) do canal ${canalNome}: ` +
      `de ${de} para ${para}.\n\n` +
      'A categoria define o preço de cada envio desse modelo. Revise em Conteúdos → Modelos ' +
      'e, se o novo preço não fizer sentido, conteste na Meta ou crie outro modelo.\n\n' +
      'Este aviso segue a configuração "Alerta de recategorização de modelos" do canal.',
  };
}

/** Return the number of changed models; ignore unknown local models until synchronization imports them. */
export async function applyEventsOfTemplate(channel: ChannelResolved, payload: unknown): Promise<number> {
  let aplicados = 0;
  for (const { field, value } of mudancasOfTemplate(payload)) {
    const nome = value?.message_template_name;
    const idioma = value?.message_template_language;
    if (!nome || !idioma) continue;

    if (field === 'message_template_status_update') {
      const status = STATUS[value?.event ?? ''];
      if (!status) continue;
      aplicados += await noTenant(channel.tenantId, async (tx) => {
        const { rows } = await tx.execute<{ id: string }>(sql`
          update template_mensagem set status_meta = ${status}, atualizado_em = now()
           where canal_id = ${channel.id}::uuid and nome = ${nome} and idioma = ${idioma}
          returning id
        `);
        for (const { id } of rows) {
          await registrarAuditoria(tx, channel.tenantId, {
            ator: { type: 'sistema' },
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
    const alerta = preferencesOf(channel).alertRecategorization;
    const { mudados, alertas, channelName } = await noTenant(channel.tenantId, async (tx) => {
      const { rows } = await tx.execute<{ id: string }>(sql`
        update template_mensagem set categoria = ${nova}, atualizado_em = now()
         where canal_id = ${channel.id}::uuid and nome = ${nome} and idioma = ${idioma}
        returning id
      `);
      const alertas: AlertOfRecategorization[] = [];
      // Vazio = todos os administradores, como diz a tela da origem. Resolvido
      // Send once per event and only when there is something to report.
      const emails =
        rows.length > 0 && alerta.active
          ? alerta.emails.length > 0
            ? alerta.emails
            : await emailsOfWhoGerenciaChannel(tx)
          : [];
      for (const { id } of rows) {
        const anterior = CATEGORIA[value?.previous_category ?? ''] ?? null;
        await registrarAuditoria(tx, channel.tenantId, {
          ator: { type: 'sistema' },
          acao: 'alterou',
          objetoTipo: 'template_mensagem',
          objetoId: id,
          antes: { categoria: anterior },
          depois: { categoria: nova },
        });
        if (alerta.active) {
          await emitir(tx, channel.tenantId, 'modelo.recategorizado', {
            template_id: id,
            nome,
            idioma,
            categoria_anterior: anterior,
            categoria_nova: nova,
            // Use addresses configured on the channel; an empty list means all administrators.
            emails: alerta.emails,
          });
          alertas.push({
            templateId: id,
            name: nome,
            idioma,
            categoriaAnterior: anterior,
            categoriaNova: nova,
            emails,
          });
        }
      }
      const { rows: channels } = await tx.execute<{ name: string }>(
        sql`select nome from canal where id = ${channel.id}::uuid limit 1`,
      );
      return { mudados: rows.length, alertas, channelName: channels[0]?.name ?? 'WhatsApp' };
    });
    aplicados += mudados;
    // Send after commit without failing the already completed model update and webhook.
    for (const a of alertas) {
      await enviarEmailSemDerrubar(
        emailOfRecategorization(a, channelName),
        `modelo-recategorizado ${a.templateId}`,
      );
    }
  }
  return aplicados;
}
