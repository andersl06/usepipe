import { and, asc, desc, eq, gte, isNotNull, isNull } from 'drizzle-orm';
import { canal, contato, conversa, inbox, mensagem, templateMensagem } from '@pipe/db/schema';
import { consultar, tenantId } from './banco';

export interface EnvioGrowth {
  id: string;
  disparoId: string | null;
  contatoNome: string | null;
  templateNome: string | null;
  canalNome: string;
  estado: string | null;
  erroCodigo: string | null;
  criadaEm: string;
  custoCentavos: number | null;
}

export interface ModeloGrowth {
  id: string;
  nome: string;
  idioma: string;
  categoria: string;
  statusMeta: string;
  corpo: string;
  variaveis: string[];
  canalId: string;
  canalNome: string;
}

export interface ContatoGrowth {
  id: string;
  nome: string | null;
  telefone: string;
}

export interface DadosDeGrowth {
  canais: { id: string; nome: string }[];
  modelos: ModeloGrowth[];
  contatos: ContatoGrowth[];
  envios: EnvioGrowth[];
}

/**
 * A origem lista campanhas; o Pipe ainda não persiste campanha nem audiência.
 * A leitura usa mensagens de template reais das últimas 72h, janela do painel da
 * API e do rastro da tela de origem. ponytail: cada linha é uma mensagem, não uma
 * campanha; quando houver entidade campanha, agrupar por disparo_id sem inferir
 * campanhas a partir de horário ou modelo.
 */
export async function carregarGrowth(): Promise<DadosDeGrowth> {
  const tid = await tenantId();
  return consultar(async (tx) => {
    const desde = new Date(Date.now() - 72 * 60 * 60 * 1000);
    /* `consultar` fixa o tenant em uma única transação/conexão. As consultas
       precisam ser sequenciais; em paralelo o driver disputa a mesma conexão. */
    const canais = await tx
      .select({ id: canal.id, nome: canal.nome })
      .from(canal)
      .where(and(eq(canal.tenantId, tid), eq(canal.tipo, 'whatsapp_cloud'), eq(canal.ativo, true)))
      .orderBy(asc(canal.nome));
    const modelos = await tx
      .select({
        id: templateMensagem.id,
        nome: templateMensagem.nome,
        idioma: templateMensagem.idioma,
        categoria: templateMensagem.categoria,
        statusMeta: templateMensagem.statusMeta,
        corpo: templateMensagem.corpo,
        variaveis: templateMensagem.variaveis,
        canalId: canal.id,
        canalNome: canal.nome,
      })
      .from(templateMensagem)
      .innerJoin(canal, eq(canal.id, templateMensagem.canalId))
      .where(and(eq(templateMensagem.tenantId, tid), eq(canal.tipo, 'whatsapp_cloud')))
      .orderBy(asc(templateMensagem.nome));
    const contatos = await tx
      .select({ id: contato.id, nome: contato.nome, telefone: contato.telefoneE164 })
      .from(contato)
      .where(
        and(
          eq(contato.tenantId, tid),
          eq(contato.bloqueado, false),
          isNull(contato.excluidoEm),
          isNotNull(contato.telefoneE164),
        ),
      )
      .orderBy(asc(contato.nome))
      .limit(1000);
    const envios = await tx
      .select({
        id: mensagem.id,
        disparoId: mensagem.disparoId,
        contatoNome: contato.nome,
        templateNome: templateMensagem.nome,
        canalNome: canal.nome,
        estado: mensagem.estadoEntrega,
        erroCodigo: mensagem.erroCodigo,
        criadaEm: mensagem.criadaEm,
        custoCentavos: mensagem.custoCentavos,
      })
      .from(mensagem)
      .innerJoin(conversa, eq(conversa.id, mensagem.conversaId))
      .innerJoin(contato, eq(contato.id, conversa.contatoId))
      .innerJoin(inbox, eq(inbox.id, conversa.inboxId))
      .innerJoin(canal, eq(canal.id, inbox.canalId))
      .leftJoin(templateMensagem, eq(templateMensagem.id, mensagem.templateId))
      .where(
        and(
          eq(mensagem.tenantId, tid),
          eq(mensagem.direcao, 'saida'),
          isNotNull(mensagem.templateId),
          gte(mensagem.criadaEm, desde),
        ),
      )
      .orderBy(desc(mensagem.criadaEm))
      .limit(500);

    return {
      canais,
      contatos: contatos.flatMap((pessoa) =>
        pessoa.telefone ? [{ ...pessoa, telefone: pessoa.telefone }] : [],
      ),
      modelos: modelos.map((modelo) => ({
        ...modelo,
        variaveis: Array.isArray(modelo.variaveis)
          ? modelo.variaveis.filter((valor): valor is string => typeof valor === 'string')
          : [],
      })),
      envios: envios.map((envio) => ({
        ...envio,
        criadaEm: envio.criadaEm.toISOString(),
      })),
    };
  });
}
