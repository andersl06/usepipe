import { Controller, Get, Param } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { noTenant } from '../banco.js';
import { configDoTenant, lerFicha, linkDaPessoa } from '../dominio/twenty.js';
import { ComSessao, sessaoDe } from '../sessao.js';
import type { RequisicaoComSessao } from '../sessao.js';
import { Req } from '@nestjs/common';

/**
 * `/v1/crm` — o que o CRM sabe de um contato.
 *
 * **A única porta do Pipe para o Twenty.** O Desk chama aqui; o Desk não fala com o
 * CRM. Regra do dono: front é front, requisição é da `api`.
 *
 * Leitura e só leitura. Escrita a partir do Desk exigiria log de auditoria — a mesma
 * pendência que já segura a edição de contato lá, e não vou abri-la de lado.
 *
 * O tenant vem da SESSÃO, nunca da requisição. É o que impede alguém de pedir a ficha
 * de um contato de outro cliente trocando o id na URL: o `contatoId` é resolvido
 * dentro do `comTenant` da sessão e, se não for daquele tenant, não retorna linha.
 */

export interface FichaDoCrm {
  /** `null` quando o contato ainda não tem espelho, ou o tenant não tem CRM. */
  ficha: {
    nome: string;
    email: string | null;
    empresa: string | null;
    link: string;
  } | null;
}

@Controller('v1/crm')
export class ControladorCrm {
  @Get('contato/:contatoId')
  @ComSessao()
  async doContato(
    @Req() requisicao: RequisicaoComSessao,
    @Param('contatoId') contatoId: string,
  ): Promise<FichaDoCrm> {
    const sessao = sessaoDe(requisicao);

    const preparo = await noTenant(sessao.tenantId, async (tx) => {
      const config = await configDoTenant(tx, sessao.tenantId);
      if (!config) return null;
      const { rows } = await tx.execute<{ twenty_pessoa_id: string | null }>(sql`
        select twenty_pessoa_id from contato
         where id = ${contatoId}::uuid and excluido_em is null
         limit 1
      `);
      const pessoaId = rows[0]?.twenty_pessoa_id;
      return pessoaId ? { config, pessoaId } : null;
    });

    // Sem CRM, sem espelho ou contato de outro tenant: a MESMA resposta. Não é erro,
    // e distinguir os casos aqui contaria a quem perguntou se o id existe em outro
    // cliente.
    if (!preparo) return { ficha: null };

    try {
      const ficha = await lerFicha(preparo.config, preparo.pessoaId);
      if (!ficha) return { ficha: null };
      return {
        ficha: {
          nome: ficha.nome,
          email: ficha.email,
          empresa: ficha.empresa,
          link: ficha.link,
        },
      };
    } catch (erro) {
      // O CRM fora do ar não pode quebrar o painel do atendente. O link continua
      // valendo, porque ele é montado do nosso lado.
      console.error(`[crm] ficha de ${contatoId} falhou: ${(erro as Error).message}`);
      return {
        ficha: {
          nome: '',
          email: null,
          empresa: null,
          link: linkDaPessoa(preparo.config.url, preparo.pessoaId),
        },
      };
    }
  }
}
