import { sql } from 'drizzle-orm';
import { registrarAuditoria } from '@pipe/db';
import type { TransacaoPipe } from '@pipe/db';
import { noTenant } from '../../banco.js';
import type { CanalResolvido } from '../../banco.js';
import { emitir } from '../../webhooks-saida.js';
import { enviarEmailSemDerrubar } from '../email.js';
import { preferenciasDe } from './preferencias.js';

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
 * O alerta sai por dois caminhos: o webhook de saída `modelo.recategorizado`
 * (na transação, com os e-mails configurados no corpo) e o E-MAIL para esses
 * mesmos endereços (`dominio/email.ts`), depois do commit. Falhar o e-mail não
 * desfaz nada: o modelo já está recategorizado e o webhook já foi enfileirado.
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

/**
 * "Vazio = todos os administradores", como diz a tela da origem
 * (`preferencias.ts`). Decisão Pipe sobre quem é "administrador" aqui: quem tem
 * `canal.gerenciar` no tenant — a permissão de quem conecta e configura o canal,
 * e portanto de quem decide o que fazer com um modelo que mudou de preço.
 */
async function emailsDeQuemGerenciaCanal(tx: TransacaoPipe): Promise<string[]> {
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

export interface AlertaDeRecategorizacao {
  templateId: string;
  nome: string;
  idioma: string;
  categoriaAnterior: string | null;
  categoriaNova: string;
  emails: string[];
}

/** O e-mail do alerta. Texto puro, com o que muda e onde olhar. */
export function emailDeRecategorizacao(alerta: AlertaDeRecategorizacao, canalNome: string): {
  para: string[];
  assunto: string;
  texto: string;
} {
  const rotulo = (categoria: string) => ROTULO_CATEGORIA[categoria] ?? categoria;
  const de = alerta.categoriaAnterior ? rotulo(alerta.categoriaAnterior) : 'sem categoria';
  const para = rotulo(alerta.categoriaNova);
  return {
    para: alerta.emails,
    assunto: `Modelo "${alerta.nome}" recategorizado pela Meta: ${de} → ${para}`,
    texto:
      `A Meta mudou a categoria do modelo "${alerta.nome}" (${alerta.idioma}) do canal ${canalNome}: ` +
      `de ${de} para ${para}.\n\n` +
      'A categoria define o preço de cada envio desse modelo. Revise em Conteúdos → Modelos ' +
      'e, se o novo preço não fizer sentido, conteste na Meta ou crie outro modelo.\n\n' +
      'Este aviso segue a configuração "Alerta de recategorização de modelos" do canal.',
  };
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
    const alerta = preferenciasDe(canal).alertaRecategorizacao;
    const { mudados, alertas, canalNome } = await noTenant(canal.tenantId, async (tx) => {
      const { rows } = await tx.execute<{ id: string }>(sql`
        update template_mensagem set categoria = ${nova}, atualizado_em = now()
         where canal_id = ${canal.id}::uuid and nome = ${nome} and idioma = ${idioma}
        returning id
      `);
      const alertas: AlertaDeRecategorizacao[] = [];
      // Vazio = todos os administradores, como diz a tela da origem. Resolvido
      // uma vez por evento, e só se houver o que avisar.
      const emails =
        rows.length > 0 && alerta.ativo
          ? alerta.emails.length > 0
            ? alerta.emails
            : await emailsDeQuemGerenciaCanal(tx)
          : [];
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
        if (alerta.ativo) {
          await emitir(tx, canal.tenantId, 'modelo.recategorizado', {
            template_id: id,
            nome,
            idioma,
            categoria_anterior: anterior,
            categoria_nova: nova,
            // O que está configurado no canal; vazio = todos os administradores.
            emails: alerta.emails,
          });
          alertas.push({
            templateId: id,
            nome,
            idioma,
            categoriaAnterior: anterior,
            categoriaNova: nova,
            emails,
          });
        }
      }
      const { rows: canais } = await tx.execute<{ nome: string }>(
        sql`select nome from canal where id = ${canal.id}::uuid limit 1`,
      );
      return { mudados: rows.length, alertas, canalNome: canais[0]?.nome ?? 'WhatsApp' };
    });
    aplicados += mudados;
    // Depois do commit, e sem derrubar: o modelo já mudou e o webhook já saiu.
    for (const a of alertas) {
      await enviarEmailSemDerrubar(
        emailDeRecategorizacao(a, canalNome),
        `modelo-recategorizado ${a.templateId}`,
      );
    }
  }
  return aplicados;
}
