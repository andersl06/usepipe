import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { diferenca, registrarAuditoria } from '@pipe/db';
import { noTenant } from '../banco.js';
import { KeyOrSession, Scopes, atorDe, contextOf } from '../autenticacao.js';
import type { RequestAuthenticated } from '../autenticacao.js';
import { WithSession, exigirPermission, sessionOf } from '../sessao.js';
import type { RequestWithSession } from '../sessao.js';
import { definirStatus, ehStateAgent } from '../dominio/status-atendente.js';
import { telefoneValido } from '../dominio/mensagem-ativa.js';
import { PipeError } from '../erros.js';
import {
  conditionOfCursor,
  lerCursor,
  lerLimite,
  readSorting,
  assemblePage,
  orderSql,
} from '../paginacao.js';
import type { Page } from '../paginacao.js';
import { igualEmLista, juntar } from './conversas.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Bem básico de propósito: recusa o óbvio errado, não tenta validar RFC 5322 inteiro. */
const EMAIL_RAZOAVEL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Contatos, filas e atendentes.
 *
 * Três recursos pequenos num arquivo só: são leituras diretas, com o mesmo padrão de
 * filtro, ordenação e cursor. Separá-los em três arquivos daria três importações e
 * nenhuma clareza a mais.
 */

type LineContact = {
  id: string;
  name: string | null;
  phoneE164: string | null;
  email: string | null;
  document: string | null;
  blocked: boolean;
  createdAt: Date | string;
  atributos: Record<string, unknown> | null;
};

interface BodyContact {
  name?: string;
  phoneE164?: string;
  email?: string;
  document?: string;
  atributos?: Record<string, unknown>;
}

/** `PATCH /v1/contatos/:id`. Ausente não mexe; `null` apaga (menos `atributos`, que mescla). */
interface BodyEditContact {
  name?: string | null;
  email?: string | null;
  phoneE164?: string | null;
  document?: string | null;
  atributos?: Record<string, unknown>;
}

@Controller('v1/contacts')
export class ContactsController {
  @Get()
  @Scopes('contatos:ler')
  async listar(
    @Req() requisicao: RequestAuthenticated,
    @Query() consulta: Record<string, string | undefined>,
  ): Promise<Page<Record<string, unknown>>> {
    const { tenantId } = contextOf(requisicao);
    const limite = lerLimite(consulta['limit']);
    const cursor = lerCursor(consulta['cursor']);
    const ordem = readSorting(consulta['order_by'], ['criado_em'], {
      campo: 'criado_em',
      direction: 'desc',
    });

    const filtros: SQL[] = [sql`excluido_em is null`];
    if (consulta['telefone']) filtros.push(sql`telefone_e164 = ${consulta['telefone']}`);
    if (consulta['email']) filtros.push(sql`email = ${consulta['email']}`);
    if (consulta['documento']) filtros.push(sql`documento = ${consulta['documento']}`);
    if (consulta['busca']) filtros.push(sql`nome ilike ${`%${consulta['busca']}%`}`);

    const linhas = await noTenant(tenantId, async (tx) => {
      const { rows } = await tx.execute<LineContact>(sql`
        select id, nome, telefone_e164, email, documento, bloqueado, criado_em, atributos
          from contato
         where ${juntar(filtros)}
           and ${conditionOfCursor('criado_em', 'timestamptz', ordem.direction, cursor)}
         order by ${orderSql('criado_em', ordem.direction)}
         limit ${limite + 1}
      `);
      return rows;
    });

    const pagina = assemblePage(linhas, limite, (l) => ({
      value: iso(l.criado_em) ?? '',
      id: l.id,
    }));
    return { data: pagina.data.map(asContact), page_info: pagina.page_info };
  }

  @Get(':id')
  @Scopes('contatos:ler')
  async obter(
    @Req() request: RequestAuthenticated,
    @Param('id') id: string,
  ): Promise<Record<string, unknown>> {
    const { tenantId } = contextOf(request);
    const linha = await noTenant(tenantId, async (tx) => {
      const { rows } = await tx.execute<LineContact>(sql`
        select id, nome, telefone_e164, email, documento, bloqueado, criado_em, atributos
          from contato where id = ${id}::uuid and excluido_em is null limit 1
      `);
      return rows[0] ?? null;
    });
    if (!linha) throw PipeError.naoEncontrado('Contato');
    return asContact(linha);
  }

  @Post()
  @HttpCode(201)
  @Scopes('contatos:escrever')
  async create(
    @Req() requisicao: RequestAuthenticated,
    @Body() corpo: BodyContact,
  ): Promise<Record<string, unknown>> {
    const { tenantId } = contextOf(requisicao);
    if (!corpo.telefone_e164 && !corpo.email) {
      throw PipeError.request(
        'contact_without_identifier',
        'Informe telefone_e164 ou email: contato sem identificador não recebe mensagem.',
      );
    }
    const linha = await noTenant(tenantId, async (tx) => {
      const { rows } = await tx.execute<LineContact>(sql`
        insert into contato (tenant_id, nome, telefone_e164, email, documento, atributos)
        values (
          ${tenantId}, ${corpo.nome ?? null}, ${corpo.telefone_e164 ?? null},
          ${corpo.email ?? null}, ${corpo.documento ?? null},
          ${JSON.stringify(corpo.atributos ?? {})}::jsonb
        )
        returning id, nome, telefone_e164, email, documento, bloqueado, criado_em, atributos
      `);
      const criado = rows[0];
      if (!criado) throw new Error('não criou o contato');

      // A identidade do canal é o que amarra o contato à conversa que chega da Meta.
      if (corpo.telefone_e164) {
        await tx.execute(sql`
          insert into contato_identidade (tenant_id, contato_id, canal_tipo, identificador)
          values (${tenantId}, ${criado.id}, 'whatsapp_cloud',
                  ${corpo.telefone_e164.replace(/^\+/, '')})
          on conflict (tenant_id, canal_tipo, identificador) do nothing
        `);
      }
      return criado;
    });
    return asContact(linha);
  }

  /**
   * O "Editar" de `fluxo/contatos/detalhe/editar.tsx` — sessão, não chave: quem edita
   * é gente da equipe, e a permissão (`contato.editar`) só existe para ator com
   * `usuarioId`. `nome`/`email`/`telefone_e164`/`documento` ausentes não mexem, `null`
   * apaga; `atributos` é MESCLA (`||`) — só as chaves enviadas (`city`, `gender`) mudam,
   * as outras extras do contato continuam como estavam.
   */
  @Patch(':id')
  @WithSession()
  async editar(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: BodyEditContact,
  ): Promise<Record<string, unknown>> {
    const session = sessionOf(requisicao);
    if (!UUID.test(id)) throw PipeError.naoEncontrado('Contato');

    const nome = corpo?.nome;
    const email = corpo?.email;
    const telefone = corpo?.telefone_e164;
    const document = corpo?.documento;
    const atributos = corpo?.atributos;

    if (typeof email === 'string' && email && !EMAIL_RAZOAVEL.test(email)) {
      throw PipeError.request('contact_email_invalid', 'Informe um e-mail válido.');
    }
    if (typeof telefone === 'string' && telefone && !telefoneValido(telefone)) {
      throw PipeError.request(
        'contact_phone_invalid',
        'Informe um telefone no formato E.164 (ex.: +5511987654321).',
      );
    }

    return noTenant(session.tenantId, async (tx) => {
      await exigirPermission(tx, session.userId, 'contato.editar');

      const { rows: current } = await tx.execute<LineContact>(sql`
        select id, nome, telefone_e164, email, documento, bloqueado, criado_em, atributos
          from contato
         where id = ${id}::uuid and tenant_id = ${session.tenantId}::uuid and excluido_em is null
         limit 1
      `);
      const atual = current[0];
      if (!atual) throw PipeError.naoEncontrado('Contato');

      if (typeof telefone === 'string' && telefone && telefone !== atual.telefone_e164) {
        const { rows: conflitos } = await tx.execute<{ id: string }>(sql`
          select id from contato
           where tenant_id = ${session.tenantId}::uuid and telefone_e164 = ${telefone}
             and excluido_em is null and id <> ${id}::uuid
           limit 1
        `);
        if (conflitos[0]) {
          throw PipeError.conflito(
            'contact_phone_in_use',
            'Já existe um contato com este telefone.',
          );
        }
      }

      const { rows: gravados } = await tx.execute<LineContact>(sql`
        update contato set
          nome = ${nome === undefined ? sql`nome` : nome},
          email = ${email === undefined ? sql`email` : email},
          telefone_e164 = ${telefone === undefined ? sql`telefone_e164` : telefone},
          documento = ${document === undefined ? sql`documento` : document},
          atributos = ${
            atributos === undefined ? sql`atributos` : sql`atributos || ${JSON.stringify(atributos)}::jsonb`
          },
          atualizado_em = now()
        where id = ${id}::uuid and tenant_id = ${session.tenantId}::uuid
        returning id, nome, telefone_e164, email, documento, bloqueado, criado_em, atributos
      `);
      const gravado = gravados[0];
      if (!gravado) throw PipeError.naoEncontrado('Contato');

      const mudanca = diferenca(
        {
          nome: atual.nome,
          email: atual.email,
          telefone_e164: atual.telefone_e164,
          documento: atual.document,
        },
        {
          nome: gravado.nome,
          email: gravado.email,
          telefone_e164: gravado.telefone_e164,
          documento: gravado.document,
        },
      );
      if (Object.keys(mudanca.depois).length > 0 || atributos !== undefined) {
        await registrarAuditoria(tx, session.tenantId, {
          ator: { tipo: 'usuario', id: session.userId },
          acao: 'alterou',
          objetoTipo: 'contato',
          objetoId: id,
          antes: atributos !== undefined ? { ...mudanca.antes, atributos: atual.atributos } : mudanca.antes,
          depois: atributos !== undefined ? { ...mudanca.depois, atributos: gravado.atributos } : mudanca.depois,
        });
      }
      return asContact(gravado);
    });
  }
}

@Controller('v1/queues')
export class QueuesController {
  @Get()
  @Scopes('filas:ler')
  async listar(
    @Req() requisicao: RequestAuthenticated,
    @Query() query: Record<string, string | undefined>,
  ): Promise<Page<Record<string, unknown>>> {
    const { tenantId } = contextOf(requisicao);
    const limite = lerLimite(query['limit']);
    const cursor = lerCursor(query['cursor']);
    const order = readSorting(query['order_by'], ['nome', 'ordem'], {
      campo: 'nome',
      direction: 'asc',
    });

    const filters: SQL[] = [];
    if (query['ativa']) filters.push(sql`ativa = ${query['ativa'] === 'true'}`);

    const linhas = await noTenant(tenantId, async (tx) => {
      const { rows } = await tx.execute<{
        id: string;
        name: string;
        color: string | null;
        order: number;
        active: boolean;
        capacityDefault: number;
        aguardando: string;
        inAttendance: string;
      }>(sql`
        select f.id, f.nome, f.cor, f.ordem, f.ativa, f.capacidade_padrao,
               (select count(*) from conversa c
                 where c.fila_id = f.id and c.estado = 'na_fila')::text as aguardando,
               (select count(*) from conversa c
                 where c.fila_id = f.id
                   and c.estado in ('atribuida', 'em_atendimento', 'em_espera'))::text
                 as em_atendimento
          from fila f
         where ${juntar(filters)}
           and ${conditionOfCursor('f.nome', 'text', order.direction, cursor, 'f.id')}
         order by ${orderSql(`f.${order.campo}`, order.direction, 'f.id')}
         limit ${limite + 1}
      `);
      return rows;
    });

    const page = assemblePage(linhas, limite, (l) => ({ value: l.nome, id: l.id }));
    return {
      data: page.data.map((l) => ({
        id: l.id,
        nome: l.nome,
        cor: l.cor,
        ordem: l.order,
        ativa: l.active,
        capacidade_padrao: l.capacityDefault,
        aguardando: Number(l.aguardando),
        inAttendance: Number(l.inAttendance),
      })),
      page_info: page.page_info,
    };
  }
}

@Controller('v1/agents')
export class AgentsController {
  /**
   * Muda o status de presença. Sem `usuario_id` é o próprio; com ele é supervisão
   * (a Gestão desconectando quem ficou inativo), e aí exige permissão.
   */
  @Post('status')
  @KeyOrSession('atendentes:ler')
  async status(
    @Req() requisicao: RequestAuthenticated & RequestWithSession,
    @Body() corpo: { state?: string; motivo_pausa_id?: string; userId?: string },
  ): Promise<Record<string, unknown>> {
    const ator = atorDe(requisicao);
    const state = corpo.state ?? '';
    if (!ehStateAgent(state)) {
      throw PipeError.request(
        'state_unknown',
        `"${state}" não é um status válido.`,
      );
    }
    const alvo = corpo.userId ?? ator.userId;
    if (!alvo) {
      throw PipeError.request('user_required', 'Informe `usuario_id`.');
    }
    const r = await definirStatus({
      tenantId: ator.tenantId,
      byUserId: ator.userId,
      targetUserId: alvo,
      state,
      motivoPausaId: corpo.motivo_pausa_id ?? null,
    });
    return { usuario_id: alvo, estado: r.estado };
  }

  @Get()
  @Scopes('atendentes:ler')
  async listar(
    @Req() requisicao: RequestAuthenticated,
    @Query() consulta: Record<string, string | undefined>,
  ): Promise<Page<Record<string, unknown>>> {
    const { tenantId } = contextOf(requisicao);
    const limite = lerLimite(consulta['limit']);
    const cursor = lerCursor(consulta['cursor']);
    const ordem = readSorting(consulta['order_by'], ['nome'], { campo: 'nome', direction: 'asc' });

    const filtros: SQL[] = [sql`u.ativo`];
    if (consulta['estado']) {
      filtros.push(
        igualEmLista("coalesce(s.estado, 'offline')", consulta['estado'], [
          'online',
          'pausa',
          'invisivel',
          'offline',
        ]),
      );
    }
    if (consulta['fila_id']) {
      filtros.push(sql`exists (
        select 1 from fila_atendente fa
         where fa.usuario_id = u.id and fa.fila_id = ${consulta['fila_id']}::uuid
      )`);
    }

    const linhas = await noTenant(tenantId, async (tx) => {
      const { rows } = await tx.execute<{
        id: string;
        name: string;
        email: string;
        state: string;
        since: Date | string | null;
        ativas: string;
      }>(sql`
        select u.id, u.nome, u.email, coalesce(s.estado, 'offline') as estado, s.desde,
               (select count(*) from conversa c
                 where c.atendente_id = u.id and c.estado <> 'encerrada')::text as ativas
          from usuario u
          left join status_atendente s on s.usuario_id = u.id
         where ${juntar(filtros)}
           and ${conditionOfCursor('u.nome', 'text', ordem.direction, cursor, 'u.id')}
         order by ${orderSql('u.nome', ordem.direction, 'u.id')}
         limit ${limite + 1}
      `);
      return rows;
    });

    const pagina = assemblePage(linhas, limite, (l) => ({ value: l.nome, id: l.id }));
    return {
      data: pagina.data.map((l) => ({
        id: l.id,
        nome: l.nome,
        email: l.email,
        estado: l.estado,
        desde: iso(l.desde),
        conversationsActive: Number(l.ativas),
      })),
      page_info: pagina.page_info,
    };
  }
}

function asContact(linha: LineContact): Record<string, unknown> {
  return {
    id: linha.id,
    nome: linha.nome,
    telefone_e164: linha.telefone_e164,
    email: linha.email,
    documento: linha.document,
    bloqueado: linha.bloqueado,
    criado_em: iso(linha.criado_em),
    atributos: linha.atributos ?? {},
  };
}

function iso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return (value instanceof Date ? value : new Date(value)).toISOString();
}
