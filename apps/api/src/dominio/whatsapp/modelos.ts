import { sql } from 'drizzle-orm';
import { registrarAuditoria } from '@pipe/db';
import { noTenant } from '../../banco.js';
import { ErroPipe } from '../../erros.js';
import { lerCanalWhatsApp, texto } from './canal.js';
import type { CanalWhatsApp } from './canal.js';
import { clienteGraph } from './cliente-graph.js';
import type { ComponenteDoModelo, ModeloDaMeta, NovoModeloDaMeta } from './cliente-graph.js';

/**
 * Modelos de mensagem (templates) do WhatsApp direto na Meta, com o token do canal.
 *
 * Antes daqui o `template_mensagem` era cadastro à mão: quem cadastrava colava o
 * texto aprovado e o status nascia `pendente` para sempre. Agora a Meta é a fonte:
 *
 * - **sincronizar** lê todos os modelos da WABA e grava/atualiza a cópia local
 *   (status, categoria, corpo, cabeçalho). Modelo que sumiu da Meta sai daqui;
 * - **criar** manda para análise da Meta e grava a cópia `pendente`;
 * - **excluir** apaga na Meta (em todos os idiomas daquele nome, que é como a
 *   Meta apaga por nome) e aqui.
 *
 * O mapeamento de variáveis (`variaveis`) é do Pipe: ao sincronizar, uma linha
 * que já existia mantém os nomes que alguém deu, desde que a quantidade de
 * `{{n}}` do corpo não tenha mudado.
 *
 * ponytail: criar só com cabeçalho de texto ou sem cabeçalho. Mídia no cabeçalho
 * pede um arquivo de exemplo subido pela Resumable Upload API; entra quando a
 * tela de criação tiver o campo.
 */

const STATUS: Readonly<Record<string, string>> = {
  APPROVED: 'aprovado',
  PENDING: 'pendente',
  IN_APPEAL: 'pendente',
  PENDING_DELETION: 'pendente',
  REJECTED: 'rejeitado',
  PAUSED: 'pausado',
  DISABLED: 'pausado',
  LIMIT_EXCEEDED: 'pausado',
};

const CATEGORIA_DA_META: Readonly<Record<string, string>> = {
  UTILITY: 'utilidade',
  MARKETING: 'marketing',
  AUTHENTICATION: 'autenticacao',
};

const CABECALHO_DA_META: Readonly<Record<string, string>> = {
  TEXT: 'texto',
  IMAGE: 'imagem',
  VIDEO: 'video',
  DOCUMENT: 'documento',
};

/** Regras de nome e tamanho da Cloud API para `message_templates`. */
const NOME_VALIDO = /^[a-z0-9_]{1,512}$/;
const CORPO_MAX = 1024;
const CABECALHO_TEXTO_MAX = 60;

function recusa(campo: string, mensagem: string): ErroPipe {
  return new ErroPipe(422, 'modelo_invalido', mensagem, { campo });
}

/** As variáveis do texto, na ordem em que aparecem: `{{1}}`, `{{2}}` ou nomeadas `{{nome}}`. */
export function variaveisDoTexto(textoDoModelo: string): string[] {
  const vistas: string[] = [];
  for (const achado of textoDoModelo.matchAll(/\{\{\s*([\w]+)\s*\}\}/g)) {
    if (!vistas.includes(achado[1]!)) vistas.push(achado[1]!);
  }
  return vistas;
}

interface ModeloLocal {
  nome: string;
  idioma: string;
  categoria: string;
  statusMeta: string;
  corpo: string;
  cabecalhoTipo: string;
  quantasVariaveis: number;
}

export function comoLocal(modelo: ModeloDaMeta): ModeloLocal | null {
  const categoria = CATEGORIA_DA_META[modelo.category ?? ''];
  // Categoria que o Pipe não conhece não entra: o `check` da tabela recusaria.
  if (!categoria) return null;
  const componentes = modelo.components ?? [];
  const corpo = componentes.find((c) => c.type === 'BODY')?.text ?? '';
  const cabecalho = componentes.find((c) => c.type === 'HEADER');
  return {
    nome: modelo.name,
    idioma: modelo.language,
    categoria,
    statusMeta: STATUS[modelo.status ?? ''] ?? 'pendente',
    corpo,
    cabecalhoTipo: cabecalho ? (CABECALHO_DA_META[cabecalho.format ?? ''] ?? 'nenhum') : 'nenhum',
    quantasVariaveis: variaveisDoTexto(corpo).length,
  };
}

function wabaDo(canal: CanalWhatsApp): string {
  if (!canal.wabaId) throw ErroPipe.conflito('canal_sem_waba', 'O canal não tem WABA: reconecte o WhatsApp.');
  return canal.wabaId;
}

function tokenDo(canal: CanalWhatsApp): string {
  const token = texto(canal.config['tokenAcesso']);
  if (!token) throw ErroPipe.conflito('canal_sem_token', 'O canal não tem token: reconecte o WhatsApp.');
  return token;
}

export interface ResultadoDaSincronizacao {
  criados: number;
  atualizados: number;
  removidos: number;
  /** Modelos de categoria que o Pipe não conhece, deixados de fora. */
  ignorados: number;
}

export async function sincronizarModelos(
  tenantId: string,
  usuarioId: string,
  canalId: string,
): Promise<ResultadoDaSincronizacao> {
  const canal = await lerCanalWhatsApp(tenantId, canalId);
  const daMeta = await clienteGraph(tokenDo(canal)).listarModelos(wabaDo(canal));
  const locais = daMeta.map(comoLocal);
  const validos = locais.filter((m): m is ModeloLocal => m !== null);
  const resultado: ResultadoDaSincronizacao = {
    criados: 0,
    atualizados: 0,
    removidos: 0,
    ignorados: locais.length - validos.length,
  };

  await noTenant(tenantId, async (tx) => {
    // Em série, como toda escrita dentro de `noTenant`.
    for (const m of validos) {
      const padrao = JSON.stringify(Array.from({ length: m.quantasVariaveis }, (_, i) => `Variável ${i + 1}`));
      const { rows } = await tx.execute<{ criado: boolean }>(sql`
        insert into template_mensagem
          (tenant_id, canal_id, nome, idioma, categoria, status_meta, corpo, cabecalho_tipo, variaveis)
        values (${tenantId}::uuid, ${canalId}::uuid, ${m.nome}, ${m.idioma}, ${m.categoria},
                ${m.statusMeta}, ${m.corpo}, ${m.cabecalhoTipo}, ${padrao}::jsonb)
        on conflict (tenant_id, canal_id, nome, idioma) do update
           set categoria = excluded.categoria,
               status_meta = excluded.status_meta,
               corpo = excluded.corpo,
               cabecalho_tipo = excluded.cabecalho_tipo,
               -- Os nomes que alguém deu às variáveis ficam, se o número delas não mudou.
               variaveis = case
                 when jsonb_array_length(template_mensagem.variaveis) = jsonb_array_length(excluded.variaveis)
                 then template_mensagem.variaveis else excluded.variaveis end,
               atualizado_em = now()
        returning (xmax = 0) as criado
      `);
      if (rows[0]?.criado) resultado.criados += 1;
      else resultado.atualizados += 1;
    }

    // Nome e idioma não têm `|` (regras da Meta): serve de separador.
    const chaves = JSON.stringify(validos.map((m) => `${m.nome}|${m.idioma}`));
    const { rows: removidos } = await tx.execute<{ id: string }>(sql`
      delete from template_mensagem
       where canal_id = ${canalId}::uuid
         and (nome || '|' || idioma) not in (select jsonb_array_elements_text(${chaves}::jsonb))
      returning id
    `);
    resultado.removidos = removidos.length;

    await registrarAuditoria(tx, tenantId, {
      ator: { tipo: 'usuario', id: usuarioId },
      acao: 'alterou',
      objetoTipo: 'canal',
      objetoId: canalId,
      depois: { modelos_sincronizados: { ...resultado } },
    });
  });

  return resultado;
}

export interface PedidoDeModelo {
  nome?: string;
  idioma?: string;
  categoria?: string;
  /** Texto do cabeçalho; ausente ou vazio = sem cabeçalho. */
  cabecalho?: string;
  corpo?: string;
  rodape?: string;
  /** Um exemplo por variável do corpo, na ordem em que aparecem — a Meta exige. */
  exemplos?: string[];
  /** Exemplo da variável do cabeçalho, quando ele tem uma. */
  exemploDoCabecalho?: string;
}

const CATEGORIA_PARA_META: Readonly<Record<string, NovoModeloDaMeta['category']>> = {
  utilidade: 'UTILITY',
  marketing: 'MARKETING',
};

export function montarModelo(pedido: PedidoDeModelo): NovoModeloDaMeta {
  const nome = (pedido.nome ?? '').trim();
  if (!NOME_VALIDO.test(nome)) {
    throw recusa('nome', 'O nome usa só letras minúsculas, números e _ (sem espaço nem acento).');
  }
  const idioma = (pedido.idioma ?? 'pt_BR').trim();
  if (!/^[a-z]{2,3}(_[A-Z]{2})?$/.test(idioma)) throw recusa('idioma', 'Idioma inválido (ex.: pt_BR).');
  const categoria = CATEGORIA_PARA_META[pedido.categoria ?? ''];
  if (!categoria) {
    // Autenticação tem componentes próprios (código e botão de copiar) — não é texto livre.
    throw recusa('categoria', 'A categoria é utilidade ou marketing.');
  }

  const corpo = (pedido.corpo ?? '').trim();
  if (!corpo) throw recusa('corpo', 'Escreva o texto da mensagem.');
  if (corpo.length > CORPO_MAX) throw recusa('corpo', `O texto aceita no máximo ${CORPO_MAX} caracteres.`);
  const variaveis = variaveisDoTexto(corpo);
  const exemplos = (pedido.exemplos ?? []).map((e) => String(e).trim());
  if (exemplos.length !== variaveis.length || exemplos.some((e) => !e)) {
    throw recusa('exemplos', `Dê um exemplo para cada variável do texto (${variaveis.length}).`);
  }

  const componentes: ComponenteDoModelo[] = [];
  const cabecalho = (pedido.cabecalho ?? '').trim();
  if (cabecalho) {
    if (cabecalho.length > CABECALHO_TEXTO_MAX) {
      throw recusa('cabecalho', `O cabeçalho aceita no máximo ${CABECALHO_TEXTO_MAX} caracteres.`);
    }
    const doCabecalho = variaveisDoTexto(cabecalho);
    if (doCabecalho.length > 1) throw recusa('cabecalho', 'O cabeçalho aceita no máximo uma variável.');
    const componente: ComponenteDoModelo = { type: 'HEADER', format: 'TEXT', text: cabecalho };
    if (doCabecalho.length === 1) {
      const exemplo = (pedido.exemploDoCabecalho ?? '').trim();
      if (!exemplo) throw recusa('exemploDoCabecalho', 'Dê um exemplo para a variável do cabeçalho.');
      componente.example = { header_text: [exemplo] };
    }
    componentes.push(componente);
  }

  const componenteDoCorpo: ComponenteDoModelo = { type: 'BODY', text: corpo };
  if (variaveis.length > 0) componenteDoCorpo.example = { body_text: [exemplos] };
  componentes.push(componenteDoCorpo);

  const rodape = (pedido.rodape ?? '').trim();
  if (rodape) {
    if (rodape.length > CABECALHO_TEXTO_MAX) {
      throw recusa('rodape', `O rodapé aceita no máximo ${CABECALHO_TEXTO_MAX} caracteres.`);
    }
    componentes.push({ type: 'FOOTER', text: rodape });
  }

  return { name: nome, language: idioma, category: categoria, components: componentes };
}

export async function criarModeloNaMeta(
  tenantId: string,
  usuarioId: string,
  canalId: string,
  pedido: PedidoDeModelo,
): Promise<{ id: string; statusMeta: string }> {
  const canal = await lerCanalWhatsApp(tenantId, canalId);
  const modelo = montarModelo(pedido);
  const criado = await clienteGraph(tokenDo(canal)).criarModelo(wabaDo(canal), modelo);
  const local = comoLocal({ ...modelo, status: criado.status ?? 'PENDING' })!;
  const variaveis = JSON.stringify(variaveisDoTexto(local.corpo));

  return noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<{ id: string }>(sql`
      insert into template_mensagem
        (tenant_id, canal_id, nome, idioma, categoria, status_meta, corpo, cabecalho_tipo, variaveis)
      values (${tenantId}::uuid, ${canalId}::uuid, ${local.nome}, ${local.idioma}, ${local.categoria},
              ${local.statusMeta}, ${local.corpo}, ${local.cabecalhoTipo}, ${variaveis}::jsonb)
      on conflict (tenant_id, canal_id, nome, idioma) do update
         set status_meta = excluded.status_meta, corpo = excluded.corpo,
             categoria = excluded.categoria, cabecalho_tipo = excluded.cabecalho_tipo,
             variaveis = excluded.variaveis, atualizado_em = now()
      returning id
    `);
    const id = rows[0]!.id;
    await registrarAuditoria(tx, tenantId, {
      ator: { tipo: 'usuario', id: usuarioId },
      acao: 'criou',
      objetoTipo: 'template_mensagem',
      objetoId: id,
      depois: { nome: local.nome, idioma: local.idioma, categoria: local.categoria },
    });
    return { id, statusMeta: local.statusMeta };
  });
}

export async function excluirModeloNaMeta(
  tenantId: string,
  usuarioId: string,
  canalId: string,
  nome: string,
): Promise<{ removidos: number }> {
  const canal = await lerCanalWhatsApp(tenantId, canalId);
  if (!NOME_VALIDO.test(nome)) throw ErroPipe.naoEncontrado('Modelo');
  await clienteGraph(tokenDo(canal)).excluirModelo(wabaDo(canal), nome);

  return noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<{ id: string }>(sql`
      delete from template_mensagem where canal_id = ${canalId}::uuid and nome = ${nome} returning id
    `);
    for (const { id } of rows) {
      await registrarAuditoria(tx, tenantId, {
        ator: { tipo: 'usuario', id: usuarioId },
        acao: 'excluiu',
        objetoTipo: 'template_mensagem',
        objetoId: id,
        antes: { nome },
      });
    }
    return { removidos: rows.length };
  });
}
