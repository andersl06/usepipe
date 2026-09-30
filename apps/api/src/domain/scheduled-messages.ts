import { sql } from 'drizzle-orm';
import type { TransactionPipe } from '@pipe/db';
import { databaseOwner, noTenant, resolveChannel } from '../database.js';
import { registerDelayedJob } from '../delayed-jobs.js';
import { sendMessage } from './envio.js';
import { textForOChannel } from './flow.js';
import { triggerMessageActive } from './message-active.js';
import { SCHEDULED_MESSAGE_JOB, contactOfIdentity, isBroadcastAddress, listName } from './scheduling-commands.js';

/**
 * Fires a message a bot scheduled with `set /schedules` (P7), through the same outbound path as
 * any other send: `sendMessage` on the contact's open conversation (window rule, outbox, events,
 * webhooks), or, for a WhatsApp template with no open conversation, the active-message path that
 * opens one (`triggerMessageActive`). This is Pipe's replacement for Blip's hosted active
 * notification. A `to` of `{lista}@broadcast.msging.net` sends to every contact of the list.
 *
 * At most once: the row is claimed (`agendada` → `executada`) before anything is sent, so a job and
 * the sweep racing on it never send twice. The outcome per recipient lands in `resultado`.
 */

type ClaimedSchedule = {
  id: string;
  to: string;
  type: string;
  content: unknown;
};

export interface RecipientOutcome {
  contactId: string | null;
  identity: string;
  sent: boolean;
  messageId?: string;
  error?: string;
}

/** Blip's WhatsApp template message (`application/json` with `type: 'template'`). */
interface TemplateOfMessage {
  name: string;
  parameters: string[];
}

export function templateOfMessage(type: string, content: unknown): TemplateOfMessage | null {
  let value = content;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!type.toLowerCase().startsWith('application/json') || !value || typeof value !== 'object') return null;
  const body = value as { type?: unknown; template?: { name?: unknown; components?: unknown } };
  if (body.type !== 'template' || typeof body.template?.name !== 'string' || !body.template.name.trim()) return null;
  const parameters: string[] = [];
  const components = Array.isArray(body.template.components) ? body.template.components : [];
  for (const component of components as { type?: unknown; parameters?: unknown }[]) {
    if (typeof component?.type !== 'string' || component.type.toLowerCase() !== 'body' || !Array.isArray(component.parameters)) continue;
    for (const parameter of component.parameters as { text?: unknown }[]) parameters.push(typeof parameter?.text === 'string' ? parameter.text : '');
  }
  return { name: body.template.name.trim(), parameters };
}

async function recipientsOf(tx: TransactionPipe, tenantId: string, to: string): Promise<{ identity: string; contactId: string | null }[]> {
  if (!isBroadcastAddress(to)) return [{ identity: to, contactId: await contactOfIdentity(tx, tenantId, to) }];
  const { rows } = await tx.execute<{ contactId: string }>(sql`
    select c.contato_id as "contactId"
      from lista_distribuicao_contato c
      join lista_distribuicao l on l.id = c.lista_id and l.tenant_id = ${tenantId}::uuid
     where c.tenant_id = ${tenantId}::uuid and l.nome = ${listName(to)}
     order by c.criado_em, c.id
  `);
  return rows.map((row) => ({ identity: row.contactId, contactId: row.contactId }));
}

async function deliverToContact(tenantId: string, contactId: string, schedule: ClaimedSchedule): Promise<Omit<RecipientOutcome, 'identity'>> {
  const template = templateOfMessage(schedule.type, schedule.content);
  const target = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<{ conversationId: string; channelId: string; open: boolean }>(sql`
      select c.id as "conversationId", ib.canal_id as "channelId", c.estado <> 'encerrada' as open
        from conversa c join inbox ib on ib.id = c.inbox_id
       where c.contato_id = ${contactId}::uuid
       order by (c.estado <> 'encerrada') desc, c.criada_em desc
       limit 1
    `);
    const conversation = rows[0];
    if (!conversation || !template) return { conversation, templateId: null };
    const { rows: templates } = await tx.execute<{ id: string }>(sql`
      select id from template_mensagem where canal_id = ${conversation.channelId}::uuid and nome = ${template.name} limit 1
    `);
    return { conversation, templateId: templates[0]?.id ?? null };
  });
  const conversation = target.conversation;
  if (!conversation) return { contactId, sent: false, error: 'O contato não tem conversa em nenhum canal.' };
  if (template && !target.templateId) {
    return { contactId, sent: false, error: `O template '${template.name}' não existe no canal do contato.` };
  }
  try {
    if (conversation.open) {
      const text = template ? null : textForOChannel({ tipo: schedule.type, conteudo: schedule.content, bruto: typeof schedule.content === 'string' });
      if (!template && !text) return { contactId, sent: false, error: 'A mensagem agendada não tem texto para o canal.' };
      const queued = await sendMessage({
        tenantId,
        conversationId: conversation.conversationId,
        type: template ? 'template' : 'texto',
        texto: text,
        templateId: target.templateId,
        parametros: template?.parameters ?? [],
      });
      return { contactId, sent: true, messageId: queued.id };
    }
    if (!template) return { contactId, sent: false, error: 'Sem conversa aberta: fora dela só sai template aprovado.' };
    const channel = await resolveChannel(conversation.channelId);
    if (!channel) return { contactId, sent: false, error: 'O canal do contato não existe mais.' };
    const [result] = await triggerMessageActive(channel, {
      tenantId,
      channelId: conversation.channelId,
      templateId: target.templateId!,
      destinos: [{ contatoId: contactId, parametros: template.parameters }],
    });
    return result?.enviada
      ? { contactId, sent: true, ...(result.mensagemId ? { messageId: result.mensagemId } : {}) }
      : { contactId, sent: false, error: result?.detalhe ?? result?.motivo ?? 'falha no envio' };
  } catch (error) {
    return { contactId, sent: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Sends one due schedule; a schedule not due, cancelled or already sent is left alone. */
export async function fireScheduledMessage(tenantId: string, scheduleId: string): Promise<RecipientOutcome[] | null> {
  const claimed = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<ClaimedSchedule>(sql`
      update agendamento_mensagem s
         set estado = 'executada', executado_em = now(), atualizado_em = now()
       where s.id = (
         select id from agendamento_mensagem
          where id = ${scheduleId}::uuid and tenant_id = ${tenantId}::uuid and estado = 'agendada' and quando <= now()
          for update skip locked
       )
      returning s.id, s.destino as "to", s.tipo as type, s.conteudo as content
    `);
    const schedule = rows[0];
    return schedule ? { schedule, recipients: await recipientsOf(tx, tenantId, schedule.to) } : null;
  });
  if (!claimed) return null;
  const outcomes: RecipientOutcome[] = [];
  // Serially, as the active message does: each send opens its own tenant transaction.
  for (const { identity, contactId } of claimed.recipients) {
    outcomes.push(
      contactId
        ? { identity, ...(await deliverToContact(tenantId, contactId, claimed.schedule)) }
        : { identity, contactId: null, sent: false, error: `O contato '${identity}' não existe neste Pipe.` },
    );
  }
  const failed = outcomes.length === 0 || outcomes.every((outcome) => !outcome.sent);
  await noTenant(tenantId, (tx) =>
    tx.execute(sql`
      update agendamento_mensagem
         set estado = ${failed ? 'falhou' : 'executada'}, resultado = ${JSON.stringify({ recipients: outcomes })}::jsonb,
             atualizado_em = now()
       where id = ${scheduleId}::uuid
    `),
  );
  return outcomes;
}

/** Overdue schedules of every tenant: a lost job, or one that fired before its row was committed. */
export async function dueScheduledMessages(batch = 100): Promise<{ tenantId: string; scheduleId: string }[]> {
  const { rows } = await databaseOwner().execute<{ tenant_id: string; id: string }>(sql`
    select tenant_id, id from agendamento_mensagem
     where estado = 'agendada' and quando <= now()
     order by quando limit ${batch}
  `);
  return rows.map((row) => ({ tenantId: row.tenant_id, scheduleId: row.id }));
}

/** Wires the scheduled-message kind into the delayed-job runner (`servidor.ts`). */
export function registerScheduledMessages(): void {
  registerDelayedJob(SCHEDULED_MESSAGE_JOB, {
    run: async (data) => {
      await fireScheduledMessage(String(data['tenantId']), String(data['scheduleId']));
    },
    sweep: async () => {
      const due = await dueScheduledMessages();
      for (const { tenantId, scheduleId } of due) await fireScheduledMessage(tenantId, scheduleId);
      return due.length;
    },
  });
}
