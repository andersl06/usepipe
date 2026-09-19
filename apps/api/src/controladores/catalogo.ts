import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { diferenca, registrarAuditoria } from '@pipe/db';
import { noTenant } from '../banco.js';
import { ChaveOuSessao, Escopos, atorDe, contextoDe } from '../autenticacao.js';
import type { RequisicaoAutenticada } from '../autenticacao.js';
import { ComSessao, exigirPermissao, sessaoDe } from '../sessao.js';
import type { RequisicaoComSessao } from '../sessao.js';
import { definirStatus, ehEstadoAtendente } from '../dominio/status-atendente.js';
import { telefoneValido } from '../dominio/mensagem-ativa.js';
import { ErroPipe } from '../erros.js';
import {
  condicaoDeCursor,
  lerCursor,
  lerLimite,
  lerOrdenacao,
  montarPagina,
  ordemSql,
} from '../paginacao.js';
import type { Pagina } from '../paginacao.js';
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

type LinhaContato = {
  id: string;
  nome: string | null;
  telefone_e164: string | null;
  email: string | null;
  documento: string | null;
  bloqueado: boolean;
  criado_em: Date | string;
  atributos: Record<string, unknown> | null;
};

interface CorpoContato {
  nome?: string;
  telefone_e164?: string;
  email?: string;
  documento?: string;
  atributos?: Record<string, unknown>;
}

/** `PATCH /v1/contatos/:id`. Ausente não mexe; `null` apaga (menos `atributos`, que mescla). */
interface CorpoEdicaoContato {
  nome?: string | null;
  email?: string | null;
  telefone_e164?: string | null;
  documento?: string | null;
  atributos?: Record<string, unknown>;
}

@Controller('v1/contatos')
export class ControladorContatos {
  @Get()
  @Escopos('contatos:ler')
  async listar(
    @Req() requisicao: RequisicaoAutenticada,
    @Query() consulta: Record<string, string | undefined>,
  ): Promise<Pagina<Record<string, unknown>>> {
    const { tenantId } = contextoDe(requisicao);
    const limite = lerLimite(consulta['limit']);
    const cursor = lerCursor(consulta['cursor']);
    const ordem = lerOrdenacao(consulta['order_by'], ['criado_em'], {
      campo: 'criado_em',
      direcao: 'desc',
    });

    const filtros: SQL[] = [sql`excluido_em is null`];
    if (consulta['telefone']) filtros.push(sql`telefone_e164 = ${consulta['telefone']}`);
    if (consulta['email']) filtros.push(sql`email = ${consulta['email']}`);
    if (consulta['documento']) filtros.push(sql`documento = ${consulta['documento']}`);
    if (consulta['busca']) filtros.push(sql`nome ilike ${`%${consulta['busca']}%`}`);

    const linhas = await noTenant(tenantId, async (tx) => {
      const { rows } = await tx.execute<LinhaContato>(sql`
        select id, nome, telefone_e164, email, documento, bloqueado, criado_em, atributos
          from contato
         where ${juntar(filtros)}
           and ${condicaoDeCursor('criado_em', 'timestamptz', ordem.direcao, cursor)}
         order by ${ordemSql('criado_em', ordem.direcao)}
         limit ${limite + 1}
      `);
      return rows;
    });

    const pagina = montarPagina(linhas, limite, (l) => ({
      valor: iso(l.criado_em) ?? '',
      id: l.id,
    }));
    return { data: pagina.data.map(comoContato), page_info: pagina.page_info };
  }

  @Get(':id')
  @Escopos('contatos:ler')
  async obter(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
  ): Promise<Record<string, unknown>> {
    const { tenantId } = contextoDe(requisicao);
    const linha = await noTenant(tenantId, async (tx) => {
      const { rows } = await tx.execute<LinhaContato>(sql`
        select id, nome, telefone_e164, email, documento, bloqueado, criado_em, atributos
          from contato where id = ${id}::uuid and excluido_em is null limit 1
      `);
      return rows[0] ?? null;
    });
    if (!linha) throw ErroPipe.naoEncontrado('Contato');
    return comoContato(linha);
  }

  @Post()
  @HttpCode(201)
  @Escopos('contatos:escrever')
  async criar(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() corpo: CorpoContato,
  ): Promise<Record<string, unknown>> {
    const { tenantId } = contextoDe(requisicao);
    if (!corpo.telefone_e164 && !corpo.email) {
      throw ErroPipe.requisicao(
        'contato_sem_identificador',
        'Informe telefone_e164 ou email: contato sem identificador não recebe mensagem.',
      );
    }
    const linha = await noTenant(tenantId, async (tx) => {
      const { rows } = await tx.execute<LinhaContato>(sql`
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
    return comoContato(linha);
  }

  /**
   * O "Editar" de `fluxo/contatos/detalhe/editar.tsx` — sessão, não chave: quem edita
   * é gente da equipe, e a permissão (`contato.editar`) só existe para ator com
   * `usuarioId`. `nome`/`email`/`telefone_e164`/`documento` ausentes não mexem, `null`
   * apaga; `atributos` é MESCLA (`||`) — só as chaves enviadas (`city`, `gender`) mudam,
   * as outras extras do contato continuam como estavam.
   */
  @Patch(':id')
  @ComSessao()
  async editar(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Body() corpo: CorpoEdicaoContato,
  ): Promise<Record<string, unknown>> {
    const sessao = sessaoDe(requisicao);
    if (!UUID.test(id)) throw ErroPipe.naoEncontrado('Contato');

    const nome = corpo?.nome;
    const email = corpo?.email;
    const telefone = corpo?.telefone_e164;
    const documento = corpo?.documento;
    const atributos = corpo?.atributos;

    if (typeof email === 'string' && email && !EMAIL_RAZOAVEL.test(email)) {
      throw ErroPipe.requisicao('contato_email_invalido', 'Informe um e-mail válido.');
    }
    if (typeof telefone === 'string' && telefone && !telefoneValido(telefone)) {
      throw ErroPipe.requisicao(
        'contato_telefone_invalido',
        'Informe um telefone no formato E.164 (ex.: +5511987654321).',
      );
    }

    return noTenant(sessao.tenantId, async (tx) => {
      await exigirPermissao(tx, sessao.usuarioId, 'contato.editar');

      const { rows: atuais } = await tx.execute<LinhaContato>(sql`
        select id, nome, telefone_e164, email, documento, bloqueado, criado_em, atributos
          from contato
         where id = ${id}::uuid and tenant_id = ${sessao.tenantId}::uuid and excluido_em is null
         limit 1
      `);
      const atual = atuais[0];
      if (!atual) throw ErroPipe.naoEncontrado('Contato');

      if (typeof telefone === 'string' && telefone && telefone !== atual.telefone_e164) {
        const { rows: conflitos } = await tx.execute<{ id: string }>(sql`
          select id from contato
           where tenant_id = ${sessao.tenantId}::uuid and telefone_e164 = ${telefone}
             and excluido_em is null and id <> ${id}::uuid
           limit 1
        `);
        if (conflitos[0]) {
          throw ErroPipe.conflito(
            'contato_telefone_em_uso',
            'Já existe um contato com este telefone.',
          );
        }
      }

      const { rows: gravados } = await tx.execute<LinhaContato>(sql`
        update contato set
          nome = ${nome === undefined ? sql`nome` : nome},
          email = ${email === undefined ? sql`email` : email},
          telefone_e164 = ${telefone === undefined ? sql`telefone_e164` : telefone},
          documento = ${documento === undefined ? sql`documento` : documento},
          atributos = ${
            atributos === undefined ? sql`atributos` : sql`atributos || ${JSON.stringify(atributos)}::jsonb`
          },
          atualizado_em = now()
        where id = ${id}::uuid and tenant_id = ${sessao.tenantId}::uuid
        returning id, nome, telefone_e164, email, documento, bloqueado, criado_em, atributos
      `);
      const gravado = gravados[0];
      if (!gravado) throw ErroPipe.naoEncontrado('Contato');

      const mudanca = diferenca(
        {
          nome: atual.nome,
          email: atual.email,
          telefone_e164: atual.telefone_e164,
          documento: atual.documento,
        },
        {
          nome: gravado.nome,
          email: gravado.email,
          telefone_e164: gravado.telefone_e164,
          documento: gravado.documento,
        },
      );
      if (Object.keys(mudanca.depois).length > 0 || atributos !== undefined) {
        await registrarAuditoria(tx, sessao.tenantId, {
          ator: { tipo: 'usuario', id: sessao.usuarioId },
          acao: 'alterou',
          objetoTipo: 'contato',
          objetoId: id,
          antes: atributos !== undefined ? { ...mudanca.antes, atributos: atual.atributos } : mudanca.antes,
          depois: atributos !== undefined ? { ...mudanca.depois, atributos: gravado.atributos } : mudanca.depois,
        });
      }
      return comoContato(gravado);
    });
  }
}

@Controller('v1/filas')
export class ControladorFilas {
  @Get()
  @Escopos('filas:ler')
  async listar(
    @Req() requisicao: RequisicaoAutenticada,
    @Query() consulta: Record<string, string | undefined>,
  ): Promise<Pagina<Record<string, unknown>>> {
    const { tenantId } = contextoDe(requisicao);
    const limite = lerLimite(consulta['limit']);
    const cursor = lerCursor(consulta['cursor']);
    const ordem = lerOrdenacao(consulta['order_by'], ['nome', 'ordem'], {
      campo: 'nome',
      direcao: 'asc',
    });

    const filtros: SQL[] = [];
    if (consulta['ativa']) filtros.push(sql`ativa = ${consulta['ativa'] === 'true'}`);

    const linhas = await noTenant(tenantId, async (tx) => {
      const { rows } = await tx.execute<{
        id: string;
        nome: string;
        cor: string | null;
        ordem: number;
        ativa: boolean;
        capacidade_padrao: number;
        aguardando: string;
        em_atendimento: string;
      }>(sql`
        select f.id, f.nome, f.cor, f.ordem, f.ativa, f.capacidade_padrao,
               (select count(*) from conversa c
                 where c.fila_id = f.id and c.estado = 'na_fila')::text as aguardando,
               (select count(*) from conversa c
                 where c.fila_id = f.id
                   and c.estado in ('atribuida', 'em_atendimento', 'em_espera'))::text
                 as em_atendimento
          from fila f
         where ${juntar(filtros)}
           and ${condicaoDeCursor('f.nome', 'text', ordem.direcao, cursor, 'f.id')}
         order by ${ordemSql(`f.${ordem.campo}`, ordem.direcao, 'f.id')}
         limit ${limite + 1}
      `);
      return rows;
    });

    const pagina = montarPagina(linhas, limite, (l) => ({ valor: l.nome, id: l.id }));
    return {
      data: pagina.data.map((l) => ({
        id: l.id,
        nome: l.nome,
        cor: l.cor,
        ordem: l.ordem,
        ativa: l.ativa,
        capacidade_padrao: l.capacidade_padrao,
        aguardando: Number(l.aguardando),
        em_atendimento: Number(l.em_atendimento),
      })),
      page_info: pagina.page_info,
    };
  }
}

@Controller('v1/atendentes')
export class ControladorAtendentes {
  /**
   * Muda o status de presença. Sem `usuario_id` é o próprio; com ele é supervisão
   * (a Gestão desconectando quem ficou inativo), e aí exige permissão.
   */
  @Post('status')
  @ChaveOuSessao('atendentes:ler')
  async status(
    @Req() requisicao: RequisicaoAutenticada & RequisicaoComSessao,
    @Body() corpo: { estado?: string; motivo_pausa_id?: string; usuario_id?: string },
  ): Promise<Record<string, unknown>> {
    const ator = atorDe(requisicao);
    const estado = corpo.estado ?? '';
    if (!ehEstadoAtendente(estado)) {
      throw ErroPipe.requisicao(
        'estado_desconhecido',
        `"${estado}" não é um status válido.`,
      );
    }
    const alvo = corpo.usuario_id ?? ator.usuarioId;
    if (!alvo) {
      throw ErroPipe.requisicao('usuario_obrigatorio', 'Informe `usuario_id`.');
    }
    const r = await definirStatus({
      tenantId: ator.tenantId,
      porUsuarioId: ator.usuarioId,
      alvoUsuarioId: alvo,
      estado,
      motivoPausaId: corpo.motivo_pausa_id ?? null,
    });
    return { usuario_id: alvo, estado: r.estado };
  }

  @Get()
  @Escopos('atendentes:ler')
  async listar(
    @Req() requisicao: RequisicaoAutenticada,
    @Query() consulta: Record<string, string | undefined>,
  ): Promise<Pagina<Record<string, unknown>>> {
    const { tenantId } = contextoDe(requisicao);
    const limite = lerLimite(consulta['limit']);
    const cursor = lerCursor(consulta['cursor']);
    const ordem = lerOrdenacao(consulta['order_by'], ['nome'], { campo: 'nome', direcao: 'asc' });

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
        nome: string;
        email: string;
        estado: string;
        desde: Date | string | null;
        ativas: string;
      }>(sql`
        select u.id, u.nome, u.email, coalesce(s.estado, 'offline') as estado, s.desde,
               (select count(*) from conversa c
                 where c.atendente_id = u.id and c.estado <> 'encerrada')::text as ativas
          from usuario u
          left join status_atendente s on s.usuario_id = u.id
         where ${juntar(filtros)}
           and ${condicaoDeCursor('u.nome', 'text', ordem.direcao, cursor, 'u.id')}
         order by ${ordemSql('u.nome', ordem.direcao, 'u.id')}
         limit ${limite + 1}
      `);
      return rows;
    });

    const pagina = montarPagina(linhas, limite, (l) => ({ valor: l.nome, id: l.id }));
    return {
      data: pagina.data.map((l) => ({
        id: l.id,
        nome: l.nome,
        email: l.email,
        estado: l.estado,
        desde: iso(l.desde),
        conversas_ativas: Number(l.ativas),
      })),
      page_info: pagina.page_info,
    };
  }
}

function comoContato(linha: LinhaContato): Record<string, unknown> {
  return {
    id: linha.id,
    nome: linha.nome,
    telefone_e164: linha.telefone_e164,
    email: linha.email,
    documento: linha.documento,
    bloqueado: linha.bloqueado,
    criado_em: iso(linha.criado_em),
    atributos: linha.atributos ?? {},
  };
}

function iso(valor: Date | string | null | undefined): string | null {
  if (valor === null || valor === undefined) return null;
  return (valor instanceof Date ? valor : new Date(valor)).toISOString();
}
