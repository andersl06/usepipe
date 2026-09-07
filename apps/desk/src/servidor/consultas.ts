import { sql } from 'drizzle-orm';
import type { TransacaoPipe } from '@pipe/db';

/**
 * Consultas de leitura do Desk.
 *
 * SQL escrito à mão de propósito: são junções de quatro a cinco tabelas com um
 * `lateral` para pegar a última mensagem de cada conversa, e o construtor do Drizzle
 * ficaria mais longo e menos legível do que o próprio SQL. Escrita continua passando
 * pelo schema tipado (ver `acoes.ts`).
 *
 * Toda consulta roda dentro de `noTenant`, ou seja, com `pipe.tenant_id` fixado e a
 * RLS valendo — nenhuma delas filtra tenant na mão, porque o banco já filtra.
 */

/**
 * O driver devolve `timestamptz` como `Date` quando o `pg` é carregado uma vez só, e como
 * texto quando o empacotador do Next carrega uma segunda cópia do parser. Normalizar num
 * lugar só é mais barato do que descobrir isso de novo dentro de um componente.
 */
export function data(valor: Date | string): Date {
  return valor instanceof Date ? valor : new Date(valor);
}

export function dataOuNulo(valor: Date | string | null): Date | null {
  return valor === null ? null : data(valor);
}

export type EstadoConversa = 'na_fila' | 'atribuida' | 'em_atendimento' | 'em_espera' | 'encerrada';
export type Prioridade = 'baixa' | 'media' | 'alta';
export type TipoCanalBanco = 'whatsapp_cloud' | 'instagram' | 'email' | 'widget';

export interface ConversaDaLista {
  id: string;
  estado: EstadoConversa;
  prioridade: Prioridade;
  criadaEm: Date;
  /** Nulo é conversa que o atendente ainda não respondeu — é a ficha "Sem resposta". */
  primeiraRespostaEm: Date | null;
  ultimaMensagemEm: Date | null;
  ultimaMensagemDe: string | null;
  janelaExpiraEm: Date | null;
  contatoNome: string | null;
  contatoTelefone: string | null;
  filaNome: string | null;
  canalTipo: TipoCanalBanco;
  ultimaMensagem: string | null;
  ultimaMensagemTipo: string | null;
}

export async function listarConversas(
  tx: TransacaoPipe,
  atendenteId: string,
): Promise<ConversaDaLista[]> {
  const { rows } = await tx.execute<{
    id: string;
    estado: EstadoConversa;
    prioridade: Prioridade;
    criada_em: Date | string;
    primeira_resposta_em: Date | string | null;
    ultima_mensagem_em: Date | string | null;
    ultima_mensagem_de: string | null;
    janela_expira_em: Date | string | null;
    contato_nome: string | null;
    contato_telefone: string | null;
    fila_nome: string | null;
    canal_tipo: TipoCanalBanco;
    ultima_mensagem: string | null;
    ultima_mensagem_tipo: string | null;
  }>(sql`
    select c.id, c.estado, c.prioridade, c.criada_em, c.primeira_resposta_em,
           c.ultima_mensagem_em, c.ultima_mensagem_de,
           c.janela_expira_em, ct.nome as contato_nome, ct.telefone_e164 as contato_telefone,
           f.nome as fila_nome,
           ca.tipo as canal_tipo, m.conteudo as ultima_mensagem, m.tipo as ultima_mensagem_tipo
      from conversa c
      join contato ct on ct.id = c.contato_id
      join inbox ib on ib.id = c.inbox_id
      join canal ca on ca.id = ib.canal_id
      left join fila f on f.id = c.fila_id
      left join lateral (
        select conteudo, tipo from mensagem
         where conversa_id = c.id
         order by criada_em desc
         limit 1
      ) m on true
     where c.atendente_id = ${atendenteId}
       and c.estado <> 'encerrada'
     order by c.ultima_mensagem_em desc nulls last
  `);
  return rows.map((r) => ({
    id: r.id,
    estado: r.estado,
    prioridade: r.prioridade,
    criadaEm: data(r.criada_em),
    primeiraRespostaEm: dataOuNulo(r.primeira_resposta_em),
    ultimaMensagemEm: dataOuNulo(r.ultima_mensagem_em),
    ultimaMensagemDe: r.ultima_mensagem_de,
    janelaExpiraEm: dataOuNulo(r.janela_expira_em),
    contatoNome: r.contato_nome,
    contatoTelefone: r.contato_telefone,
    filaNome: r.fila_nome,
    canalTipo: r.canal_tipo,
    ultimaMensagem: r.ultima_mensagem,
    ultimaMensagemTipo: r.ultima_mensagem_tipo,
  }));
}

export interface ConversaAberta {
  id: string;
  estado: EstadoConversa;
  prioridade: Prioridade;
  criadaEm: Date;
  primeiraRespostaEm: Date | null;
  emEsperaDesde: Date | null;
  janelaExpiraEm: Date | null;
  filaNome: string | null;
  canalId: string;
  canalTipo: TipoCanalBanco;
  contatoId: string;
  contatoNome: string | null;
  contatoTelefone: string | null;
  contatoEmail: string | null;
  contatoDocumento: string | null;
  contatoAtributos: Record<string, unknown>;
  resumo: string | null;
  resumoEm: Date | null;
  resumoModelo: string | null;
}

export async function carregarConversa(
  tx: TransacaoPipe,
  conversaId: string,
  atendenteId: string,
): Promise<ConversaAberta | null> {
  const { rows } = await tx.execute<{
    id: string;
    estado: EstadoConversa;
    prioridade: Prioridade;
    criada_em: Date | string;
    primeira_resposta_em: Date | string | null;
    em_espera_desde: Date | string | null;
    janela_expira_em: Date | string | null;
    fila_nome: string | null;
    canal_id: string;
    canal_tipo: TipoCanalBanco;
    contato_id: string;
    contato_nome: string | null;
    telefone_e164: string | null;
    email: string | null;
    documento: string | null;
    atributos: Record<string, unknown> | null;
    resumo: string | null;
    resumo_em: Date | string | null;
    resumo_modelo: string | null;
  }>(sql`
    select c.id, c.estado, c.prioridade, c.criada_em, c.primeira_resposta_em, c.em_espera_desde,
           c.janela_expira_em, f.nome as fila_nome, ca.id as canal_id, ca.tipo as canal_tipo,
           ct.id as contato_id, ct.nome as contato_nome, ct.telefone_e164, ct.email,
           ct.documento, ct.atributos,
           cl.resumo, cl.criada_em as resumo_em, cl.modelo as resumo_modelo
      from conversa c
      join contato ct on ct.id = c.contato_id
      join inbox ib on ib.id = c.inbox_id
      join canal ca on ca.id = ib.canal_id
      left join fila f on f.id = c.fila_id
      left join classificacao_conversa cl on cl.conversa_id = c.id
     where c.id = ${conversaId}
       and c.atendente_id = ${atendenteId}
     limit 1
  `);
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    estado: r.estado,
    prioridade: r.prioridade,
    criadaEm: data(r.criada_em),
    primeiraRespostaEm: dataOuNulo(r.primeira_resposta_em),
    emEsperaDesde: dataOuNulo(r.em_espera_desde),
    janelaExpiraEm: dataOuNulo(r.janela_expira_em),
    filaNome: r.fila_nome,
    canalId: r.canal_id,
    canalTipo: r.canal_tipo,
    contatoId: r.contato_id,
    contatoNome: r.contato_nome,
    contatoTelefone: r.telefone_e164,
    contatoEmail: r.email,
    contatoDocumento: r.documento,
    contatoAtributos: r.atributos ?? {},
    resumo: r.resumo,
    resumoEm: dataOuNulo(r.resumo_em),
    resumoModelo: r.resumo_modelo,
  };
}

export type ItemDaConversa =
  | {
      genero: 'mensagem';
      id: string;
      criadaEm: Date;
      direcao: 'entrada' | 'saida';
      tipo: string;
      conteudo: string | null;
      estadoEntrega: string | null;
      erroCodigo: string | null;
      erroTexto: string | null;
      lidaEm: Date | null;
      entregueEm: Date | null;
      deRespostaPronta: boolean;
      deTemplate: boolean;
    }
  | { genero: 'nota'; id: string; criadaEm: Date; corpo: string; autor: string | null };

export async function listarItensDaConversa(
  tx: TransacaoPipe,
  conversaId: string,
): Promise<ItemDaConversa[]> {
  const mensagens = await tx.execute<{
    id: string;
    criada_em: Date | string;
    direcao: 'entrada' | 'saida' | 'interna';
    tipo: string;
    conteudo: string | null;
    estado_entrega: string | null;
    erro_codigo: string | null;
    erro_texto: string | null;
    lida_em: Date | string | null;
    entregue_em: Date | string | null;
    resposta_pronta_id: string | null;
    template_id: string | null;
  }>(sql`
    select id, criada_em, direcao, tipo, conteudo, estado_entrega, erro_codigo, erro_texto,
           lida_em, entregue_em, resposta_pronta_id, template_id
      from mensagem
     where conversa_id = ${conversaId}
     order by criada_em
  `);

  const notas = await tx.execute<{
    id: string;
    em: Date | string;
    corpo: string;
    autor: string | null;
  }>(sql`
    select n.id, n.em, n.corpo, u.nome as autor
      from nota_interna n
      left join usuario u on u.id = n.usuario_id
     where n.conversa_id = ${conversaId}
     order by n.em
  `);

  const itens: ItemDaConversa[] = [
    ...mensagens.rows.map(
      (m): ItemDaConversa => ({
        genero: 'mensagem',
        id: m.id,
        criadaEm: data(m.criada_em),
        direcao: m.direcao === 'entrada' ? 'entrada' : 'saida',
        tipo: m.tipo,
        conteudo: m.conteudo,
        estadoEntrega: m.estado_entrega,
        erroCodigo: m.erro_codigo,
        erroTexto: m.erro_texto,
        lidaEm: dataOuNulo(m.lida_em),
        entregueEm: dataOuNulo(m.entregue_em),
        deRespostaPronta: m.resposta_pronta_id !== null,
        deTemplate: m.template_id !== null,
      }),
    ),
    ...notas.rows.map(
      (n): ItemDaConversa => ({
        genero: 'nota',
        id: n.id,
        criadaEm: data(n.em),
        corpo: n.corpo,
        autor: n.autor,
      }),
    ),
  ];
  return itens.sort((a, b) => a.criadaEm.getTime() - b.criadaEm.getTime());
}

/** `type` e não `interface`: só o alias ganha índice implícito, e `execute<T>` exige. */
export type RespostaProntaDoDesk = {
  id: string;
  escopo: 'empresa' | 'pessoal';
  categoria: string | null;
  atalho: string;
  titulo: string;
  corpo: string;
};

export async function listarRespostasProntas(
  tx: TransacaoPipe,
  atendenteId: string,
): Promise<RespostaProntaDoDesk[]> {
  const { rows } = await tx.execute<RespostaProntaDoDesk>(sql`
    select id, escopo, categoria, atalho, titulo, corpo
      from resposta_pronta
     where ativa
       and (escopo = 'empresa' or usuario_id = ${atendenteId})
     order by escopo, categoria nulls last, atalho
  `);
  return rows;
}

export type TemplateAprovado = {
  id: string;
  nome: string;
  categoria: 'utilidade' | 'marketing' | 'autenticacao';
  corpo: string;
};

export async function listarTemplatesAprovados(
  tx: TransacaoPipe,
  canalId: string,
): Promise<TemplateAprovado[]> {
  const { rows } = await tx.execute<TemplateAprovado>(sql`
    select id, nome, categoria, corpo
      from template_mensagem
     where canal_id = ${canalId}
       and status_meta = 'aprovado'
     order by categoria, nome
  `);
  return rows;
}

export interface EtiquetaDoDesk {
  id: string;
  nome: string;
  cor: string | null;
  obrigatoriaNoEncerramento: boolean;
}

export async function listarEtiquetas(tx: TransacaoPipe): Promise<EtiquetaDoDesk[]> {
  const { rows } = await tx.execute<{
    id: string;
    nome: string;
    cor: string | null;
    obrigatoria_no_encerramento: boolean;
  }>(sql`
    select id, nome, cor, obrigatoria_no_encerramento
      from etiqueta
     where escopo in ('conversa', 'ambos')
     order by obrigatoria_no_encerramento, nome
  `);
  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    cor: r.cor,
    obrigatoriaNoEncerramento: r.obrigatoria_no_encerramento,
  }));
}

export async function listarEtiquetasDaConversa(
  tx: TransacaoPipe,
  conversaId: string,
): Promise<{ id: string; nome: string }[]> {
  const { rows } = await tx.execute<{ id: string; nome: string }>(sql`
    select e.id, e.nome
      from conversa_etiqueta ce
      join etiqueta e on e.id = ce.etiqueta_id
     where ce.conversa_id = ${conversaId}
     order by e.nome
  `);
  return rows;
}

export interface MotivoDePausa {
  id: string;
  nome: string;
  duracaoSugeridaMin: number | null;
}

export async function listarMotivosDePausa(tx: TransacaoPipe): Promise<MotivoDePausa[]> {
  const { rows } = await tx.execute<{
    id: string;
    nome: string;
    duracao_sugerida_min: number | null;
  }>(sql`
    select id, nome, duracao_sugerida_min
      from motivo_pausa
     where ativo
     order by nome
  `);
  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    duracaoSugeridaMin: r.duracao_sugerida_min,
  }));
}

export type EstadoAtendente = 'online' | 'pausa' | 'invisivel' | 'offline';

export interface StatusDoAtendente {
  estado: EstadoAtendente;
  desde: Date;
  motivoPausa: string | null;
}

export async function carregarStatus(
  tx: TransacaoPipe,
  atendenteId: string,
): Promise<StatusDoAtendente> {
  const { rows } = await tx.execute<{
    estado: EstadoAtendente;
    desde: Date | string;
    motivo: string | null;
  }>(sql`
    select s.estado, s.desde, mp.nome as motivo
      from status_atendente s
      left join pausa p on p.usuario_id = s.usuario_id and p.encerrada_em is null
      left join motivo_pausa mp on mp.id = p.motivo_id
     where s.usuario_id = ${atendenteId}
     limit 1
  `);
  const r = rows[0];
  // Sem linha de status, o atendente ainda não entrou: o padrão da spec é Invisível.
  if (!r) return { estado: 'invisivel', desde: new Date(), motivoPausa: null };
  return { estado: r.estado, desde: data(r.desde), motivoPausa: r.motivo };
}

export async function listarColegas(
  tx: TransacaoPipe,
  atendenteId: string,
): Promise<{ id: string; nome: string }[]> {
  const { rows } = await tx.execute<{ id: string; nome: string }>(sql`
    select id, nome from usuario
     where ativo and id <> ${atendenteId}
     order by nome
  `);
  return rows;
}

export interface ConversaDoHistorico {
  id: string;
  criadaEm: Date;
  encerradaEm: Date | null;
  estado: EstadoConversa;
  filaNome: string | null;
}

export async function listarHistoricoDoContato(
  tx: TransacaoPipe,
  contatoId: string,
  exceto: string,
): Promise<ConversaDoHistorico[]> {
  const { rows } = await tx.execute<{
    id: string;
    criada_em: Date | string;
    encerrada_em: Date | string | null;
    estado: EstadoConversa;
    fila_nome: string | null;
  }>(sql`
    select c.id, c.criada_em, c.encerrada_em, c.estado, f.nome as fila_nome
      from conversa c
      left join fila f on f.id = c.fila_id
     where c.contato_id = ${contatoId}
       and c.id <> ${exceto}
     order by c.criada_em desc
     limit 6
  `);
  return rows.map((r) => ({
    id: r.id,
    criadaEm: data(r.criada_em),
    encerradaEm: dataOuNulo(r.encerrada_em),
    estado: r.estado,
    filaNome: r.fila_nome,
  }));
}
