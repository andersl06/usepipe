import { sql } from 'drizzle-orm';
import { registrarAuditoria } from '@pipe/db';
import type { TransacaoPipe } from '@pipe/db';
import { noTenant } from '../banco.js';
import { ErroPipe } from '../erros.js';
import { exigirPermissao } from '../sessao.js';
import { evento, publicar } from '../tempo-real.js';
import type { AtorDaConversa } from './conversa.js';

/**
 * Etiquetar conversa ABERTA e etiquetar CONTATO — fora do encerramento.
 *
 * Até aqui a única forma de marcar uma tag numa conversa era pelo `POST /encerrar`,
 * que exige a etiqueta e fecha o ticket junto. A origem separa os dois gestos
 * (`ModalType.ADD_TAGS` ≠ `CLOSE_TICKET`, `docs/pesquisa/blip-desk-regras-tecnicas.md`
 * §1.8): a tag da conversa aberta é anotação de trabalho, e a do encerramento é
 * classificação final. As duas moram na mesma `conversa_etiqueta`, e por isso a
 * etiqueta aplicada aqui aparece pré-marcada no modal de Finalizar.
 *
 * A etiqueta de contato (`contato_etiqueta`) existia no schema sem rota nenhuma —
 * nem leitura, nem escrita. O escopo da etiqueta (`conversa` | `contato` | `ambos`)
 * é conferido no servidor: uma etiqueta de conversa não cabe num contato, e vice-versa.
 *
 * Auditoria na MESMA transação (`registrarAuditoria`), como toda escrita de cadastro.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EscopoDeEtiqueta = 'conversa' | 'contato';

export interface EtiquetaDoTenant {
  id: string;
  nome: string;
  cor: string | null;
  escopo: 'conversa' | 'contato' | 'ambos';
  obrigatoriaNoEncerramento: boolean;
}

/** As etiquetas do tenant, todas; `escopo` filtra pelas que cabem em conversa ou contato. */
export async function listarEtiquetasDoTenant(
  tx: TransacaoPipe,
  escopo: EscopoDeEtiqueta | null,
): Promise<EtiquetaDoTenant[]> {
  const { rows } = await tx.execute<{
    id: string;
    nome: string;
    cor: string | null;
    escopo: 'conversa' | 'contato' | 'ambos';
    obrigatoria_no_encerramento: boolean;
  }>(sql`
    select id, nome, cor, escopo, obrigatoria_no_encerramento
      from etiqueta
     where ${escopo === null ? sql`true` : sql`escopo in (${escopo}, 'ambos')`}
     order by nome
  `);
  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    cor: r.cor,
    escopo: r.escopo,
    obrigatoriaNoEncerramento: r.obrigatoria_no_encerramento,
  }));
}

type LinhaEtiqueta = { id: string; nome: string; escopo: string };

/** A etiqueta existe no tenant e cabe no alvo. */
async function carregarEtiqueta(
  tx: TransacaoPipe,
  etiquetaId: string,
  alvo: EscopoDeEtiqueta,
): Promise<LinhaEtiqueta> {
  if (!UUID.test(etiquetaId)) throw ErroPipe.naoEncontrado('Etiqueta');
  const { rows } = await tx.execute<LinhaEtiqueta>(
    sql`select id, nome, escopo from etiqueta where id = ${etiquetaId}::uuid limit 1`,
  );
  const etiqueta = rows[0];
  if (!etiqueta) throw ErroPipe.naoEncontrado('Etiqueta');
  if (etiqueta.escopo !== alvo && etiqueta.escopo !== 'ambos') {
    throw ErroPipe.requisicao(
      'etiqueta_de_outro_escopo',
      alvo === 'conversa'
        ? `A etiqueta "${etiqueta.nome}" é de contato, não de conversa.`
        : `A etiqueta "${etiqueta.nome}" é de conversa, não de contato.`,
    );
  }
  return etiqueta;
}

type LinhaConversa = { id: string; estado: string; atendente_id: string | null };

/**
 * A conversa existe, está aberta e — quando quem pede é gente — é do atendente.
 * Encerrada é recusada: tag em ticket fechado é reclassificação, e isso é tela de
 * gestor (histórico), não do Desk.
 */
async function carregarConversaAberta(
  tx: TransacaoPipe,
  conversaId: string,
  ator: AtorDaConversa,
): Promise<LinhaConversa> {
  if (!UUID.test(conversaId)) throw ErroPipe.naoEncontrado('Conversa');
  const { rows } = await tx.execute<LinhaConversa>(
    sql`select id, estado, atendente_id from conversa where id = ${conversaId}::uuid limit 1`,
  );
  const conversa = rows[0];
  if (!conversa) throw ErroPipe.naoEncontrado('Conversa');
  if (conversa.estado === 'encerrada') {
    throw ErroPipe.conflito(
      'conversa_encerrada',
      'A conversa está encerrada: a etiqueta de encerramento já foi dada.',
    );
  }
  if (ator.exigirAtribuicao && conversa.atendente_id !== ator.atendenteId) {
    throw new ErroPipe(
      403,
      'conversa_de_outro_atendente',
      conversa.atendente_id
        ? 'Esta conversa está com outro atendente.'
        : 'Esta conversa não está atribuída a você.',
    );
  }
  return conversa;
}

export interface EtiquetaAplicada {
  etiquetaId: string;
  nome: string;
  /** `false` quando já estava lá — aplicar duas vezes não é erro, é no-op. */
  aplicada: boolean;
}

export async function etiquetarConversa(
  ator: AtorDaConversa,
  conversaId: string,
  etiquetaId: string,
): Promise<EtiquetaAplicada> {
  const resultado = await noTenant(ator.tenantId, async (tx) => {
    if (ator.exigirAtribuicao) {
      if (!ator.atendenteId) throw ErroPipe.naoAutorizado();
      await exigirPermissao(tx, ator.atendenteId, 'conversa.etiquetar');
    }
    const conversa = await carregarConversaAberta(tx, conversaId, ator);
    const etiqueta = await carregarEtiqueta(tx, etiquetaId, 'conversa');

    const { rowCount } = await tx.execute(sql`
      insert into conversa_etiqueta (tenant_id, conversa_id, etiqueta_id, por_usuario_id)
      values (${ator.tenantId}, ${conversa.id}, ${etiqueta.id}, ${ator.atendenteId})
      on conflict do nothing
    `);
    const aplicada = (rowCount ?? 0) > 0;
    if (aplicada) {
      await registrarAuditoria(tx, ator.tenantId, {
        ator: ator.atendenteId ? { tipo: 'usuario', id: ator.atendenteId } : { tipo: 'chave' },
        acao: 'criou',
        objetoTipo: 'conversa_etiqueta',
        objetoId: conversa.id,
        depois: { etiqueta_id: etiqueta.id, etiqueta: etiqueta.nome },
      });
    }
    return { etiquetaId: etiqueta.id, nome: etiqueta.nome, aplicada };
  });

  // Depois do commit: a faixa de etiquetas da conversa mudou.
  await publicar(ator.tenantId, evento('conversa', conversaId));
  return resultado;
}

export async function desetiquetarConversa(
  ator: AtorDaConversa,
  conversaId: string,
  etiquetaId: string,
): Promise<{ removida: boolean }> {
  const resultado = await noTenant(ator.tenantId, async (tx) => {
    if (ator.exigirAtribuicao) {
      if (!ator.atendenteId) throw ErroPipe.naoAutorizado();
      await exigirPermissao(tx, ator.atendenteId, 'conversa.etiquetar');
    }
    const conversa = await carregarConversaAberta(tx, conversaId, ator);
    if (!UUID.test(etiquetaId)) throw ErroPipe.naoEncontrado('Etiqueta');

    const { rows } = await tx.execute<{ nome: string }>(sql`
      delete from conversa_etiqueta ce
       using etiqueta e
       where e.id = ce.etiqueta_id
         and ce.conversa_id = ${conversa.id}::uuid and ce.etiqueta_id = ${etiquetaId}::uuid
      returning e.nome
    `);
    const removida = rows.length > 0;
    if (removida) {
      await registrarAuditoria(tx, ator.tenantId, {
        ator: ator.atendenteId ? { tipo: 'usuario', id: ator.atendenteId } : { tipo: 'chave' },
        acao: 'excluiu',
        objetoTipo: 'conversa_etiqueta',
        objetoId: conversa.id,
        antes: { etiqueta_id: etiquetaId, etiqueta: rows[0]!.nome },
      });
    }
    return { removida };
  });

  await publicar(ator.tenantId, evento('conversa', conversaId));
  return resultado;
}

/* ------------------------------------------------------------- contato */

export type EtiquetaDoContato = {
  id: string;
  nome: string;
  cor: string | null;
}

export async function listarEtiquetasDoContato(
  tx: TransacaoPipe,
  contatoId: string,
): Promise<EtiquetaDoContato[]> {
  if (!UUID.test(contatoId)) return [];
  const { rows } = await tx.execute<EtiquetaDoContato>(sql`
    select e.id, e.nome, e.cor
      from contato_etiqueta ce
      join etiqueta e on e.id = ce.etiqueta_id
     where ce.contato_id = ${contatoId}::uuid
     order by e.nome
  `);
  return rows;
}

async function carregarContato(tx: TransacaoPipe, contatoId: string): Promise<{ id: string }> {
  if (!UUID.test(contatoId)) throw ErroPipe.naoEncontrado('Contato');
  const { rows } = await tx.execute<{ id: string }>(
    sql`select id from contato where id = ${contatoId}::uuid and excluido_em is null limit 1`,
  );
  const contato = rows[0];
  if (!contato) throw ErroPipe.naoEncontrado('Contato');
  return contato;
}

/** Quem pede: pessoa (com `contato.editar`) ou chave (`contatos:escrever`, sem permissão de pessoa). */
export interface AtorDoContato {
  tenantId: string;
  usuarioId: string | null;
  viaSessao: boolean;
}

export async function etiquetarContato(
  ator: AtorDoContato,
  contatoId: string,
  etiquetaId: string,
): Promise<EtiquetaAplicada> {
  return noTenant(ator.tenantId, async (tx) => {
    if (ator.viaSessao) {
      if (!ator.usuarioId) throw ErroPipe.naoAutorizado();
      // A etiqueta do contato é dado do contato: a mesma permissão de editar a ficha.
      await exigirPermissao(tx, ator.usuarioId, 'contato.editar');
    }
    const contato = await carregarContato(tx, contatoId);
    const etiqueta = await carregarEtiqueta(tx, etiquetaId, 'contato');

    const { rowCount } = await tx.execute(sql`
      insert into contato_etiqueta (tenant_id, contato_id, etiqueta_id)
      values (${ator.tenantId}, ${contato.id}, ${etiqueta.id})
      on conflict do nothing
    `);
    const aplicada = (rowCount ?? 0) > 0;
    if (aplicada) {
      await registrarAuditoria(tx, ator.tenantId, {
        ator: ator.usuarioId ? { tipo: 'usuario', id: ator.usuarioId } : { tipo: 'chave' },
        acao: 'criou',
        objetoTipo: 'contato_etiqueta',
        objetoId: contato.id,
        depois: { etiqueta_id: etiqueta.id, etiqueta: etiqueta.nome },
      });
    }
    return { etiquetaId: etiqueta.id, nome: etiqueta.nome, aplicada };
  });
}

export async function desetiquetarContato(
  ator: AtorDoContato,
  contatoId: string,
  etiquetaId: string,
): Promise<{ removida: boolean }> {
  return noTenant(ator.tenantId, async (tx) => {
    if (ator.viaSessao) {
      if (!ator.usuarioId) throw ErroPipe.naoAutorizado();
      await exigirPermissao(tx, ator.usuarioId, 'contato.editar');
    }
    const contato = await carregarContato(tx, contatoId);
    if (!UUID.test(etiquetaId)) throw ErroPipe.naoEncontrado('Etiqueta');

    const { rows } = await tx.execute<{ nome: string }>(sql`
      delete from contato_etiqueta ce
       using etiqueta e
       where e.id = ce.etiqueta_id
         and ce.contato_id = ${contato.id}::uuid and ce.etiqueta_id = ${etiquetaId}::uuid
      returning e.nome
    `);
    const removida = rows.length > 0;
    if (removida) {
      await registrarAuditoria(tx, ator.tenantId, {
        ator: ator.usuarioId ? { tipo: 'usuario', id: ator.usuarioId } : { tipo: 'chave' },
        acao: 'excluiu',
        objetoTipo: 'contato_etiqueta',
        objetoId: contato.id,
        antes: { etiqueta_id: etiquetaId, etiqueta: rows[0]!.nome },
      });
    }
    return { removida };
  });
}
