import { sql } from 'drizzle-orm';
import type { JobEspelhoCrm } from '@pipe/workers';
import { bancoDono, noTenant } from '../banco.js';
import { configDoTenant, espelharContato } from './twenty.js';
import type { ContatoParaEspelhar } from './twenty.js';

/**
 * Espelhar contato do Pipe como `person` no CRM daquele cliente.
 *
 * Ver `docs/specs/2026-09-07-integracao-twenty.md` §4 e §5. A verdade do contato
 * continua no Pipe; o CRM é espelho. Escrita é só de ida.
 *
 * As três conferências de isolamento da §5 estão aqui:
 * 1. `configDoTenant` roda dentro do `comTenant` — sem RLS não há URL nem chave;
 * 2. o contato é RELIDO dentro do `comTenant` do tenant do job — `contatoId` de outro
 *    cliente não retorna linha;
 * 3. `espelharContato` confere o `pipeContatoId` que volta antes de gravar id nenhum.
 */

/** O contato não existe, ou o tenant não tem CRM. Não é erro: é ausência. */
export const SEM_ESPELHO = 'sem_espelho' as const;

export type ResultadoEspelho =
  | { estado: 'espelhado'; pessoaId: string }
  | { estado: typeof SEM_ESPELHO };

export async function sincronizarContato(
  tenantId: string,
  contatoId: string,
  buscar: typeof fetch = fetch,
): Promise<ResultadoEspelho> {
  // Leitura e configuração numa transação só, com o tenant fixado. Em SÉRIE: um
  // `Promise.all` aqui derruba o `set_config('pipe.tenant_id')` e o passo seguinte
  // escreve no CRM de um cliente — é o pior lugar do sistema para essa armadilha.
  const preparo = await noTenant(tenantId, async (tx) => {
    const config = await configDoTenant(tx, tenantId);
    if (!config) return null;

    const { rows } = await tx.execute<{
      id: string;
      nome: string | null;
      email: string | null;
      telefone_e164: string | null;
      twenty_pessoa_id: string | null;
      empresa_twenty_id: string | null;
    }>(sql`
      select c.id, c.nome, c.email, c.telefone_e164, c.twenty_pessoa_id,
             a.twenty_empresa_id as empresa_twenty_id
        from contato c
        left join conta a on a.id = c.conta_id
       where c.id = ${contatoId}::uuid and c.excluido_em is null
       limit 1
    `);
    const linha = rows[0];
    if (!linha) return null;

    const contato: ContatoParaEspelhar = {
      id: linha.id,
      nome: linha.nome,
      email: linha.email,
      telefoneE164: linha.telefone_e164,
      twentyPessoaId: linha.twenty_pessoa_id,
      empresaTwentyId: linha.empresa_twenty_id,
    };
    return { config, contato };
  });

  if (!preparo) return { estado: SEM_ESPELHO };

  // A chamada de rede acontece FORA da transação, de propósito: uma conexão de banco
  // presa esperando o CRM de um cliente lento é uma conexão que falta para todos os
  // outros. O `PIPE_TWENTY_TIMEOUT_MS` protege o worker; isto protege o pool.
  const pessoaId = await espelharContato(preparo.config, preparo.contato, buscar);

  if (pessoaId !== preparo.contato.twentyPessoaId) {
    await noTenant(tenantId, async (tx) => {
      await tx.execute(sql`
        update contato set twenty_pessoa_id = ${pessoaId}, atualizado_em = now()
         where id = ${contatoId}::uuid
      `);
    });
  }

  return { estado: 'espelhado', pessoaId };
}

/**
 * A varredura de segurança: quem ficou sem espelho volta para a fila.
 *
 * Mesmo desenho da varredura do outbox — **a fila é o empurrão, a varredura é a
 * garantia**. Sem ela, um job perdido deixaria o contato para sempre sem espelho, e
 * sem espelho não há link para a ficha, que é o que o atendente usa.
 *
 * Roda com o papel dono porque varre todos os tenants, e a política de RLS não tem
 * como devolver linha antes de haver tenant em vigor — mesma lacuna registrada em
 * `0001_rls` e no `banco.ts`. **Só este `select` roda assim**; o trabalho de verdade
 * volta para o `comTenant` em `sincronizarContato`.
 *
 * Só olha tenant que TEM CRM configurado. Cliente sem CRM nunca entra na fila.
 */
export async function contatosSemEspelho(lote = 200): Promise<JobEspelhoCrm[]> {
  const { rows } = await bancoDono().execute<{ tenant_id: string; contato_id: string }>(sql`
    select c.tenant_id, c.id as contato_id
      from contato c
      join tenant t on t.id = c.tenant_id
     where c.twenty_pessoa_id is null
       and c.excluido_em is null
       and t.ativo
       and t.twenty_url is not null
       and t.twenty_chave is not null
     order by c.criado_em
     limit ${lote}
  `);
  return rows.map((l) => ({ tenantId: l.tenant_id, contatoId: l.contato_id }));
}
