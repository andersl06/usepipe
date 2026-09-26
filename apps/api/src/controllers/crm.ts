import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { noTenant } from '../database.js';
import { readDictionary } from '../domain/dictionary-crm.js';
import type { ObjectOfDictionary } from '../domain/dictionary-crm.js';
import { configDoTenant, lerFicha, linkDaPessoa } from '../domain/twenty.js';
import { enqueueDictionaryCrm } from '../queues.js';
import { WithSession, sessionOf } from '../session.js';
import type { RequestWithSession } from '../session.js';
import { Req } from '@nestjs/common';

/**
 * `/v1/crm` exposes what Twenty knows about a contact. It is Pipe's sole gateway to Twenty: the Desk calls the `api`, not the CRM directly. It is read-only because writes from the Desk would require an audit log, the same unresolved requirement blocking contact editing there. The tenant comes from the session, never the request. `contatoId` is resolved inside the session's `comTenant`; another tenant's contact yields no row even if someone changes the URL ID.
 */

export interface FichaDoCrm {
  /** `null` when the contact has no mirror yet or the tenant has no CRM. */
  record: {
    name: string;
    email: string | null;
    empresa: string | null;
    link: string;
  } | null;
}

@Controller('v1/crm')
export class CrmController {
  /**
   * The session tenant's CRM data dictionary contains objects and fields in Twenty metadata format. The flow builder and AI consume it. Read it from our database under RLS without calling the CRM.
   */
  @Get('dictionary')
  @WithSession()
  async dictionary(
    @Req() request: RequestWithSession,
  ): Promise<{ objetos: ObjectOfDictionary[] }> {
    const session = sessionOf(request);
    return { objetos: await noTenant(session.tenantId, readDictionary) };
  }

  /** Request synchronization after an admin creates a field in the CRM. */
  @Post('dictionary/sync')
  @WithSession()
  @HttpCode(202)
  async syncDictionary(
    @Req() requisicao: RequestWithSession,
  ): Promise<{ enfileirado: boolean }> {
    const sessao = sessionOf(requisicao);
    return { enfileirado: await enqueueDictionaryCrm({ tenantId: sessao.tenantId }) };
  }

  @Get('contact/:contactId')
  @WithSession()
  async ofContact(
    @Req() requisicao: RequestWithSession,
    @Param('contatoId') contactId: string,
  ): Promise<FichaDoCrm> {
    const sessao = sessionOf(requisicao);

    const preparo = await noTenant(sessao.tenantId, async (tx) => {
      const config = await configDoTenant(tx, sessao.tenantId);
      if (!config) return null;
      const { rows } = await tx.execute<{ twenty_pessoa_id: string | null }>(sql`
        select twenty_pessoa_id from contato
         where id = ${contactId}::uuid and excluido_em is null
         limit 1
      `);
      const pessoaId = rows[0]?.twenty_pessoa_id;
      return pessoaId ? { config, pessoaId } : null;
    });

    // No CRM, no mirror and a contact belonging to another tenant all return the same response. Distinguishing them would reveal whether another customer's contact ID exists.
    // e distinguir os casos aqui contaria a quem perguntou se o id existe em outro
    // cliente.
    if (!preparo) return { record: null };

    try {
      const ficha = await lerFicha(preparo.config, preparo.pessoaId);
      if (!ficha) return { record: null };
      return {
        record: {
          name: ficha.name,
          email: ficha.email,
          empresa: ficha.empresa,
          link: ficha.link,
        },
      };
    } catch (error) {
      // A CRM outage must not break the attendant panel. The link remains
      // valid because we construct it on our side.
      console.error(`[crm] ficha de ${contactId} falhou: ${(error as Error).message}`);
      return {
        record: {
          name: '',
          email: null,
          empresa: null,
          link: linkDaPessoa(preparo.config.url, preparo.pessoaId),
        },
      };
    }
  }
}
