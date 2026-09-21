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
 * O cabeçalho pode ser texto OU mídia (imagem, vídeo, documento). Mídia pede um
 * arquivo de exemplo, que sobe pela Resumable Upload API (`subirFoto`, a mesma
 * da foto do perfil) e vai em `example.header_handle`. A categoria
 * AUTENTICAÇÃO tem componentes fixos da Meta (corpo com o código, botão de
 * copiar) — não é texto livre; ver `montarComponentesDeAutenticacao`.
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

/**
 * Autenticação, pela Cloud API ("Authentication Templates"): o botão de copiar
 * (`OTP` / `COPY_CODE`) aceita até 25 caracteres, e `code_expiration_minutes`
 * vai de 1 a 90. O texto padrão do botão é o `copyButton` da origem
 * (`blip-conteudos-templates.md`: "Copiar código").
 */
const BOTAO_COPIAR_MAX = 25;
const EXPIRACAO_MIN = 1;
const EXPIRACAO_MAX = 90;
const BOTAO_COPIAR_PADRAO = 'Copiar código';

type FormatoDeMidia = 'IMAGE' | 'VIDEO' | 'DOCUMENT';

/**
 * A mídia que o cabeçalho aceita, por formato da Meta.
 *
 * Tipos: os que a tela da origem anuncia (`blip-conteudos-templates.md`,
 * `attachment`): imagem "Compatível com JPG, JPEG ou PNG", documento "Formato
 * PDF", vídeo "Compatível com MP4 até 16MB". Tamanhos: imagem 5 MB (Cloud
 * API, "Supported Media Types" — o mesmo teto da foto do perfil), vídeo 16 MB
 * e documento 100 MB (`regras-blip.md` §1.6). A Meta confere de novo; conferir
 * aqui é para recusar ANTES de subir o arquivo, com a frase da tela.
 */
const MIDIA_DO_CABECALHO: Readonly<
  Record<FormatoDeMidia, { tipos: readonly string[]; maxBytes: number; rotulo: string; formatos: string }>
> = {
  IMAGE: {
    tipos: ['image/jpeg', 'image/png'],
    maxBytes: 5 * 1024 * 1024,
    rotulo: 'A imagem',
    formatos: 'compatível com JPG, JPEG ou PNG',
  },
  VIDEO: {
    tipos: ['video/mp4', 'video/3gpp'],
    maxBytes: 16 * 1024 * 1024,
    rotulo: 'O vídeo',
    formatos: 'compatível com MP4 até 16MB',
  },
  DOCUMENT: {
    tipos: ['application/pdf'],
    maxBytes: 100 * 1024 * 1024,
    rotulo: 'O documento',
    formatos: 'formato PDF',
  },
};

function recusa(campo: string, mensagem: string): ErroPipe {
  return new ErroPipe(422, 'modelo_invalido', mensagem, { campo });
}

/**
 * O texto que a Meta gera para o corpo de um modelo de autenticação — ela não
 * aceita texto nosso nessa categoria. Fica como cópia local até a primeira
 * sincronização, que traz o texto de verdade (localizado por ela) no `BODY`.
 *
 * conferir com token real: a frase exata em pt_BR que a Meta devolve. O que
 * importa aqui é ter UM `{{1}}` (o código é o parâmetro 1 no envio), e o
 * complemento de segurança quando `add_security_recommendation` foi ligado.
 */
export function textoDeAutenticacao(recomendacaoDeSeguranca: boolean): string {
  return recomendacaoDeSeguranca
    ? '{{1}} é seu código de verificação. Para sua segurança, não compartilhe este código.'
    : '{{1}} é seu código de verificação.';
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
  const doCorpo = componentes.find((c) => c.type === 'BODY');
  // Autenticação recém-criada vem sem `text` (o texto é da Meta): cópia local até a sincronização.
  const corpo =
    doCorpo?.text ??
    (categoria === 'autenticacao' ? textoDeAutenticacao(doCorpo?.add_security_recommendation === true) : '');
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

export interface OpcoesDeAutenticacao {
  /**
   * `add_security_recommendation`: acrescenta "não compartilhe este código" ao
   * corpo. Nasce LIGADO — é o texto que a origem mostra no cartão
   * (`authenticationMessage`: "… Para sua segurança, não o compartilhe.").
   */
  recomendacaoDeSeguranca?: boolean;
  /** `code_expiration_minutes` (1 a 90): o rodapé "este código expira em N minutos". Ausente = sem rodapé. */
  expiraEmMinutos?: number;
  /** Texto do botão de copiar (`OTP`/`COPY_CODE`, até 25). Padrão "Copiar código". */
  textoDoBotao?: string;
}

export interface PedidoDeModelo {
  nome?: string;
  idioma?: string;
  categoria?: string;
  /** Texto do cabeçalho; ausente ou vazio = sem cabeçalho de texto. */
  cabecalho?: string;
  /**
   * Mídia de exemplo do cabeçalho, `data:<tipo>;base64,…` — o mesmo formato da
   * foto do perfil. Imagem (JPG/PNG), vídeo (MP4) ou documento (PDF); o formato
   * do cabeçalho sai do MIME. Exclui `cabecalho` (é texto OU mídia).
   */
  cabecalhoMidia?: string;
  corpo?: string;
  rodape?: string;
  /** Um exemplo por variável do corpo, na ordem em que aparecem — a Meta exige. */
  exemplos?: string[];
  /** Exemplo da variável do cabeçalho de texto, quando ele tem uma. */
  exemploDoCabecalho?: string;
  /** Só na categoria autenticação. Ignorado nas outras. */
  autenticacao?: OpcoesDeAutenticacao;
}

const CATEGORIA_PARA_META: Readonly<Record<string, NovoModeloDaMeta['category']>> = {
  utilidade: 'UTILITY',
  marketing: 'MARKETING',
  autenticacao: 'AUTHENTICATION',
};

export interface MidiaDoCabecalho {
  formato: FormatoDeMidia;
  bytes: Buffer;
  /** O MIME, que é o `file_type` da Resumable Upload API. */
  tipo: string;
}

/** A mídia de exemplo do cabeçalho, conferida por tipo e tamanho — antes de qualquer chamada à Meta. */
export function lerMidiaDoCabecalho(dataUrl: string): MidiaDoCabecalho {
  const partes = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
  if (!partes) {
    throw recusa('cabecalhoMidia', 'O arquivo do cabeçalho tem de vir como data URL (data:<tipo>;base64,…).');
  }
  const tipo = partes[1]!.toLowerCase();
  const formato: FormatoDeMidia = tipo.startsWith('image/')
    ? 'IMAGE'
    : tipo.startsWith('video/')
      ? 'VIDEO'
      : 'DOCUMENT';
  const regra = MIDIA_DO_CABECALHO[formato];
  if (!regra.tipos.includes(tipo)) {
    throw recusa('cabecalhoMidia', `${regra.rotulo} do cabeçalho é ${regra.formatos}.`);
  }
  const bytes = Buffer.from(partes[2]!, 'base64');
  if (bytes.length === 0) throw recusa('cabecalhoMidia', 'O arquivo do cabeçalho está vazio.');
  if (bytes.length > regra.maxBytes) {
    throw recusa(
      'cabecalhoMidia',
      `${regra.rotulo} do cabeçalho tem de ter no máximo ${regra.maxBytes / (1024 * 1024)} MB.`,
    );
  }
  return { formato, bytes, tipo };
}

type Cabecalho =
  | { tipo: 'nenhum' }
  | { tipo: 'texto'; texto: string; exemplo: string | null }
  | { tipo: 'midia'; midia: MidiaDoCabecalho };

function conferirCabecalho(pedido: PedidoDeModelo): Cabecalho {
  const textoDoCabecalho = (pedido.cabecalho ?? '').trim();
  const dataUrl = (pedido.cabecalhoMidia ?? '').trim();
  if (textoDoCabecalho && dataUrl) throw recusa('cabecalho', 'O cabeçalho é texto OU mídia, não os dois.');
  if (dataUrl) return { tipo: 'midia', midia: lerMidiaDoCabecalho(dataUrl) };
  if (!textoDoCabecalho) return { tipo: 'nenhum' };

  if (textoDoCabecalho.length > CABECALHO_TEXTO_MAX) {
    throw recusa('cabecalho', `O cabeçalho aceita no máximo ${CABECALHO_TEXTO_MAX} caracteres.`);
  }
  const variaveis = variaveisDoTexto(textoDoCabecalho);
  if (variaveis.length > 1) throw recusa('cabecalho', 'O cabeçalho aceita no máximo uma variável.');
  if (variaveis.length === 0) return { tipo: 'texto', texto: textoDoCabecalho, exemplo: null };
  const exemplo = (pedido.exemploDoCabecalho ?? '').trim();
  if (!exemplo) throw recusa('exemploDoCabecalho', 'Dê um exemplo para a variável do cabeçalho.');
  return { tipo: 'texto', texto: textoDoCabecalho, exemplo };
}

/**
 * Os componentes de um modelo de AUTENTICAÇÃO, como a Cloud API documenta em
 * "Authentication Templates › Create authentication template" (`POST
 * /{waba}/message_templates`, `category: AUTHENTICATION`):
 *
 * - `BODY` sem `text` — o texto ("{{1}} é seu código de verificação.") é da
 *   Meta, localizado por ela; `add_security_recommendation: true` acrescenta
 *   a frase de não compartilhar;
 * - `FOOTER` só com `code_expiration_minutes` — o rodapé "este código expira
 *   em N minutos" também é dela; sem o campo, sem rodapé;
 * - `BUTTONS` com UM botão `{ type: 'OTP', otp_type: 'COPY_CODE', text }`.
 *   Só o de copiar: `ONE_TAP`/`ZERO_TAP` pedem `package_name` e
 *   `signature_hash` do app Android do cliente, que a tela não tem.
 *
 * Texto livre não entra: corpo, cabeçalho e rodapé são recusados, não
 * ignorados — mandar texto e vê-lo sumir é o que confunde quem cadastra.
 *
 * conferir com token real: o formato exato que a Meta devolve no `GET` (se
 * `BODY.text` vem preenchido, se `FOOTER.text` vem) e se ela aceita
 * `add_security_recommendation` ausente como `false`.
 */
function montarComponentesDeAutenticacao(pedido: PedidoDeModelo): ComponenteDoModelo[] {
  if ((pedido.corpo ?? '').trim() || (pedido.cabecalho ?? '').trim() || (pedido.rodape ?? '').trim()) {
    throw recusa('corpo', 'Na categoria autenticação o texto é fixo da Meta: não envie corpo, cabeçalho nem rodapé.');
  }
  if ((pedido.cabecalhoMidia ?? '').trim()) {
    throw recusa('cabecalhoMidia', 'A categoria autenticação não aceita mídia no cabeçalho.');
  }
  const opcoes = pedido.autenticacao ?? {};

  const componentes: ComponenteDoModelo[] = [];
  const corpo: ComponenteDoModelo = { type: 'BODY' };
  if (opcoes.recomendacaoDeSeguranca ?? true) corpo.add_security_recommendation = true;
  componentes.push(corpo);

  if (opcoes.expiraEmMinutos !== undefined && opcoes.expiraEmMinutos !== null) {
    const minutos = Number(opcoes.expiraEmMinutos);
    if (!Number.isInteger(minutos) || minutos < EXPIRACAO_MIN || minutos > EXPIRACAO_MAX) {
      throw recusa(
        'autenticacao.expiraEmMinutos',
        `A validade do código vai de ${EXPIRACAO_MIN} a ${EXPIRACAO_MAX} minutos.`,
      );
    }
    componentes.push({ type: 'FOOTER', code_expiration_minutes: minutos });
  }

  const textoDoBotao = (opcoes.textoDoBotao ?? '').trim() || BOTAO_COPIAR_PADRAO;
  if (textoDoBotao.length > BOTAO_COPIAR_MAX) {
    throw recusa(
      'autenticacao.textoDoBotao',
      `O texto do botão de copiar aceita no máximo ${BOTAO_COPIAR_MAX} caracteres.`,
    );
  }
  componentes.push({
    type: 'BUTTONS',
    buttons: [{ type: 'OTP', otp_type: 'COPY_CODE', text: textoDoBotao }],
  });
  return componentes;
}

/**
 * Confere o pedido inteiro e monta o que vai para a Meta. TUDO é conferido
 * antes de `subirMidia` ser chamada: um corpo errado não custa um upload, e
 * tipo ou tamanho errado da mídia recusa sem tocar na Meta.
 */
export async function montarModelo(
  pedido: PedidoDeModelo,
  subirMidia: (midia: MidiaDoCabecalho) => Promise<string>,
): Promise<NovoModeloDaMeta> {
  const nome = (pedido.nome ?? '').trim();
  if (!NOME_VALIDO.test(nome)) {
    throw recusa('nome', 'O nome usa só letras minúsculas, números e _ (sem espaço nem acento).');
  }
  const idioma = (pedido.idioma ?? 'pt_BR').trim();
  if (!/^[a-z]{2,3}(_[A-Z]{2})?$/.test(idioma)) throw recusa('idioma', 'Idioma inválido (ex.: pt_BR).');
  const categoria = CATEGORIA_PARA_META[pedido.categoria ?? ''];
  if (!categoria) throw recusa('categoria', 'A categoria é utilidade, marketing ou autenticação.');

  if (categoria === 'AUTHENTICATION') {
    return { name: nome, language: idioma, category: categoria, components: montarComponentesDeAutenticacao(pedido) };
  }

  const cabecalho = conferirCabecalho(pedido);

  const corpo = (pedido.corpo ?? '').trim();
  if (!corpo) throw recusa('corpo', 'Escreva o texto da mensagem.');
  if (corpo.length > CORPO_MAX) throw recusa('corpo', `O texto aceita no máximo ${CORPO_MAX} caracteres.`);
  const variaveis = variaveisDoTexto(corpo);
  const exemplos = (pedido.exemplos ?? []).map((e) => String(e).trim());
  if (exemplos.length !== variaveis.length || exemplos.some((e) => !e)) {
    throw recusa('exemplos', `Dê um exemplo para cada variável do texto (${variaveis.length}).`);
  }

  const rodape = (pedido.rodape ?? '').trim();
  if (rodape.length > CABECALHO_TEXTO_MAX) {
    throw recusa('rodape', `O rodapé aceita no máximo ${CABECALHO_TEXTO_MAX} caracteres.`);
  }

  // Daqui para baixo só monta: nada mais recusa, e é só agora que o arquivo sobe.
  const componentes: ComponenteDoModelo[] = [];
  if (cabecalho.tipo === 'texto') {
    const componente: ComponenteDoModelo = { type: 'HEADER', format: 'TEXT', text: cabecalho.texto };
    if (cabecalho.exemplo) componente.example = { header_text: [cabecalho.exemplo] };
    componentes.push(componente);
  } else if (cabecalho.tipo === 'midia') {
    // O exemplo de mídia é o handle da Resumable Upload API, em `header_handle`.
    const handle = await subirMidia(cabecalho.midia);
    componentes.push({ type: 'HEADER', format: cabecalho.midia.formato, example: { header_handle: [handle] } });
  }

  const componenteDoCorpo: ComponenteDoModelo = { type: 'BODY', text: corpo };
  if (variaveis.length > 0) componenteDoCorpo.example = { body_text: [exemplos] };
  componentes.push(componenteDoCorpo);

  if (rodape) componentes.push({ type: 'FOOTER', text: rodape });

  return { name: nome, language: idioma, category: categoria, components: componentes };
}

/** O app dono do token, onde a mídia sobe: o do cliente (manual) ou o nosso (embutido) — como a foto do perfil. */
function appDo(canal: CanalWhatsApp): string {
  const appId = texto(canal.config['appId']) ?? process.env['WHATSAPP_APP_ID'] ?? '';
  if (!appId) {
    throw ErroPipe.conflito(
      'canal_sem_app',
      'Não sabemos o aplicativo deste canal para enviar o arquivo do cabeçalho: reconecte o WhatsApp.',
    );
  }
  return appId;
}

export async function criarModeloNaMeta(
  tenantId: string,
  usuarioId: string,
  canalId: string,
  pedido: PedidoDeModelo,
): Promise<{ id: string; statusMeta: string }> {
  const canal = await lerCanalWhatsApp(tenantId, canalId);
  const cliente = clienteGraph(tokenDo(canal));
  const waba = wabaDo(canal);
  const modelo = await montarModelo(pedido, (midia) => cliente.subirFoto(appDo(canal), midia.bytes, midia.tipo));
  const criado = await cliente.criarModelo(waba, modelo);
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
