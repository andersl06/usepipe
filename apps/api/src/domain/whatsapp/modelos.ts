import { sql } from 'drizzle-orm';
import { registrarAuditoria } from '@pipe/db';
import { noTenant } from '../../database.js';
import { PipeError } from '../../errors.js';
import { readChannelWhatsApp, texto } from './channel.js';
import type { ChannelWhatsApp } from './channel.js';
import { clienteGraph } from './cliente-graph.js';
import type { ComponentOfTemplate, TemplateOfMeta, NewTemplateOfMeta } from './cliente-graph.js';

/**
 * Manage WhatsApp templates directly through Meta using the channel token. Previously `template_mensagem` was manually registered and stayed `pendente`; now Meta is authoritative. Synchronize all WABA templates into the local copy (status, category, body, header), removing ones missing at Meta. Create by submitting for Meta review and saving a `pendente` copy. Delete at Meta across all languages of a name, then locally. Preserve Pipe's `variaveis` names on sync if the number of `{{n}}` body slots is unchanged. Headers use text or media; media requires a sample file uploaded through Resumable Upload API (`subirFoto`) as `example.header_handle`. AUTHENTICATION components are Meta-defined, not free text; see `montarComponentesDeAutenticacao`.
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
 * Cloud API Authentication Templates: `OTP`/`COPY_CODE` labels have a 25-character limit, `code_expiration_minutes` is 1–90, and the default button text is Blip's `copyButton` ("Copiar código", `blip-conteudos-templates.md`).
 */
const BOTAO_COPIAR_MAX = 25;
const EXPIRATION_MIN = 1;
const EXPIRATION_MAX = 90;
const BOTAO_COPIAR_PADRAO = 'Copiar código';

type FormatOfMedia = 'IMAGE' | 'VIDEO' | 'DOCUMENT';

/**
 * Validate header media against Meta formats and the original UI (`blip-conteudos-templates.md`, `attachment`): JPG/JPEG/PNG image up to 5 MB (Cloud API Supported Media Types), PDF document up to 100 MB, or MP4 video up to 16 MB (`regras-blip.md` §1.6). Meta validates again; checking before upload gives the user the screen's specific error.
 */
const MEDIA_OF_HEADER: Readonly<
  Record<FormatOfMedia, { tipos: readonly string[]; maxBytes: number; rotulo: string; formatos: string }>
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

function recusa(campo: string, message: string): PipeError {
  return new PipeError(422, 'template_invalid', message, { campo });
}

/**
 * Local placeholder for Meta-generated authentication template body until first sync imports the actual localized `BODY` text. Verify the exact pt_BR phrase with a real token. The required invariant is one `{{1}}` code variable. Synchronization also resolves the Meta-owned `add_security_recommendation` text.
 */
export function textOfAuthentication(recommendationOfSecurity: boolean): string {
  return recommendationOfSecurity
    ? '{{1}} é seu código de verificação. Para sua segurança, não compartilhe este código.'
    : '{{1}} é seu código de verificação.';
}

/** Text variables in occurrence order: `{{1}}`, `{{2}}`, or named `{{nome}}`. */
export function variablesOfText(textOfTemplate: string): string[] {
  const vistas: string[] = [];
  for (const achado of textOfTemplate.matchAll(/\{\{\s*([\w]+)\s*\}\}/g)) {
    if (!vistas.includes(achado[1]!)) vistas.push(achado[1]!);
  }
  return vistas;
}

interface TemplateLocal {
  name: string;
  idioma: string;
  category: string;
  statusMeta: string;
  body: string;
  headerType: string;
  howManyVariables: number;
}

export function comoLocal(template: TemplateOfMeta): TemplateLocal | null {
  const categoria = CATEGORIA_DA_META[template.category ?? ''];
  // Skip unknown Pipe categories; the table's `check` constraint would reject them.
  if (!categoria) return null;
  const components = template.components ?? [];
  const doCorpo = components.find((c) => c.type === 'BODY');
  // A newly created authentication template has no `text` because Meta supplies it; keep a local placeholder until synchronization.
  const corpo =
    doCorpo?.text ??
    (categoria === 'autenticacao' ? textOfAuthentication(doCorpo?.add_security_recommendation === true) : '');
  const cabecalho = components.find((c) => c.type === 'HEADER');
  return {
    name: template.name,
    idioma: template.language,
    category: categoria,
    statusMeta: STATUS[template.status ?? ''] ?? 'pendente',
    body: corpo,
    headerType: cabecalho ? (CABECALHO_DA_META[cabecalho.format ?? ''] ?? 'nenhum') : 'nenhum',
    howManyVariables: variablesOfText(corpo).length,
  };
}

function wabaDo(channel: ChannelWhatsApp): string {
  if (!channel.wabaId) throw PipeError.conflito('channel_without_waba', 'O canal não tem WABA: reconecte o WhatsApp.');
  return channel.wabaId;
}

function tokenDo(canal: ChannelWhatsApp): string {
  const token = texto(canal.config['tokenAcesso']);
  if (!token) throw PipeError.conflito('channel_without_token', 'O canal não tem token: reconecte o WhatsApp.');
  return token;
}

export interface ResultOfSynchronization {
  created: number;
  updated: number;
  removed: number;
  /** Templates in categories unknown to Pipe are excluded. */
  ignorados: number;
}

export async function sincronizarModelos(
  tenantId: string,
  userId: string,
  channelId: string,
): Promise<ResultOfSynchronization> {
  const channel = await readChannelWhatsApp(tenantId, channelId);
  const daMeta = await clienteGraph(tokenDo(channel)).listarModelos(wabaDo(channel));
  const locations = daMeta.map(comoLocal);
  const validos = locations.filter((m): m is TemplateLocal => m !== null);
  const resultado: ResultOfSynchronization = {
    created: 0,
    updated: 0,
    removed: 0,
    ignorados: locations.length - validos.length,
  };

  await noTenant(tenantId, async (tx) => {
    // Write serially, as for every write inside `noTenant`.
    for (const m of validos) {
      const padrao = JSON.stringify(Array.from({ length: m.howManyVariables }, (_, i) => `Variável ${i + 1}`));
      const { rows } = await tx.execute<{ criado: boolean }>(sql`
        insert into template_mensagem
          (tenant_id, canal_id, nome, idioma, categoria, status_meta, corpo, cabecalho_tipo, variaveis)
        values (${tenantId}::uuid, ${channelId}::uuid, ${m.name}, ${m.idioma}, ${m.category},
                ${m.statusMeta}, ${m.body}, ${m.headerType}, ${padrao}::jsonb)
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
      if (rows[0]?.criado) resultado.created += 1;
      else resultado.updated += 1;
    }

    // Meta names and languages cannot contain `|`, so it is a safe separator.
    const chaves = JSON.stringify(validos.map((m) => `${m.name}|${m.idioma}`));
    const { rows: removidos } = await tx.execute<{ id: string }>(sql`
      delete from template_mensagem
       where canal_id = ${channelId}::uuid
         and (nome || '|' || idioma) not in (select jsonb_array_elements_text(${chaves}::jsonb))
      returning id
    `);
    resultado.removed = removidos.length;

    await registrarAuditoria(tx, tenantId, {
      ator: { type: 'usuario', id: userId },
      acao: 'alterou',
      objetoTipo: 'canal',
      objetoId: channelId,
      depois: { modelos_sincronizados: { ...resultado } },
    });
  });

  return resultado;
}

export interface OptionsOfAuthentication {
  /**
   * `add_security_recommendation` adds Meta's "não compartilhe este código" to the body. Default it on, as in the source card (`authenticationMessage`: "… Para sua segurança, não o compartilhe.").
   */
  recommendationOfSecurity?: boolean;
  /** `code_expiration_minutes` (1–90) adds Meta's "este código expira em N minutos" footer; absent means no footer. */
  expiraEmMinutos?: number;
  /** Copy button label for `OTP`/`COPY_CODE`, up to 25 characters; default is "Copiar código". */
  textoDoBotao?: string;
}

export interface RequestOfTemplate {
  name?: string;
  idioma?: string;
  category?: string;
  /** Header text; absent or empty means no text header. */
  cabecalho?: string;
  /**
   * Header sample media in `data:<tipo>;base64,…` form, as for a profile photo: JPG/PNG image, MP4 video, or PDF document. MIME determines header format. Excludes `cabecalho`, since the header is text or media.
   */
  headerMedia?: string;
  body?: string;
  rodape?: string;
  /** Meta requires one sample per body variable in occurrence order. */
  exemplos?: string[];
  /** Sample for a text header variable, if present. */
  exemploDoCabecalho?: string;
  /** Authentication category only; ignored otherwise. */
  authentication?: OptionsOfAuthentication;
}

const CATEGORIA_PARA_META: Readonly<Record<string, NewTemplateOfMeta['category']>> = {
  utilidade: 'UTILITY',
  marketing: 'MARKETING',
  autenticacao: 'AUTHENTICATION',
};

export interface MediaOfHeader {
  format: FormatOfMedia;
  bytes: Buffer;
  /** MIME used as Resumable Upload API `file_type`. */
  type: string;
}

/** Validate sample header media type and size before calling Meta. */
export function readMediaOfHeader(dataUrl: string): MediaOfHeader {
  const partes = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
  if (!partes) {
    throw recusa('cabecalhoMidia', 'O arquivo do cabeçalho tem de vir como data URL (data:<tipo>;base64,…).');
  }
  const tipo = partes[1]!.toLowerCase();
  const format: FormatOfMedia = tipo.startsWith('image/')
    ? 'IMAGE'
    : tipo.startsWith('video/')
      ? 'VIDEO'
      : 'DOCUMENT';
  const regra = MEDIA_OF_HEADER[format];
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
  return { format, bytes, type: tipo };
}

type Cabecalho =
  | { type: 'nenhum' }
  | { type: 'texto'; texto: string; exemplo: string | null }
  | { type: 'midia'; media: MediaOfHeader };

function conferirCabecalho(pedido: RequestOfTemplate): Cabecalho {
  const textoDoCabecalho = (pedido.cabecalho ?? '').trim();
  const dataUrl = (pedido.headerMedia ?? '').trim();
  if (textoDoCabecalho && dataUrl) throw recusa('cabecalho', 'O cabeçalho é texto OU mídia, não os dois.');
  if (dataUrl) return { type: 'midia', media: readMediaOfHeader(dataUrl) };
  if (!textoDoCabecalho) return { type: 'nenhum' };

  if (textoDoCabecalho.length > CABECALHO_TEXTO_MAX) {
    throw recusa('cabecalho', `O cabeçalho aceita no máximo ${CABECALHO_TEXTO_MAX} caracteres.`);
  }
  const variables = variablesOfText(textoDoCabecalho);
  if (variables.length > 1) throw recusa('cabecalho', 'O cabeçalho aceita no máximo uma variável.');
  if (variables.length === 0) return { type: 'texto', texto: textoDoCabecalho, exemplo: null };
  const exemplo = (pedido.exemploDoCabecalho ?? '').trim();
  if (!exemplo) throw recusa('exemploDoCabecalho', 'Dê um exemplo para a variável do cabeçalho.');
  return { type: 'texto', texto: textoDoCabecalho, exemplo };
}

/**
 * Build AUTHENTICATION template components per Cloud API "Authentication Templates › Create authentication template" (`POST /{waba}/message_templates`, `category: AUTHENTICATION`). `BODY` omits `text`: Meta localizes "{{1}} é seu código de verificação." and can append a no-sharing sentence via `add_security_recommendation: true`. `FOOTER` uses only `code_expiration_minutes`; absence means no footer. `BUTTONS` contains one `{ type: 'OTP', otp_type: 'COPY_CODE', text }` button; `ONE_TAP` and `ZERO_TAP` need Android `package_name` and `signature_hash`, which the UI lacks. Reject free-form body, header, and footer rather than silently dropping input. Verify with a real token the exact GET fields (`BODY.text`, `FOOTER.text`) and whether omitting `add_security_recommendation` means false. The endpoint is `POST /{waba}/message_templates`; check the `GET` response with a real token, including the behavior when `add_security_recommendation` is `false`.
 */
function assembleComponentsOfAuthentication(pedido: RequestOfTemplate): ComponentOfTemplate[] {
  if ((pedido.body ?? '').trim() || (pedido.cabecalho ?? '').trim() || (pedido.rodape ?? '').trim()) {
    throw recusa('corpo', 'Na categoria autenticação o texto é fixo da Meta: não envie corpo, cabeçalho nem rodapé.');
  }
  if ((pedido.headerMedia ?? '').trim()) {
    throw recusa('cabecalhoMidia', 'A categoria autenticação não aceita mídia no cabeçalho.');
  }
  const options = pedido.authentication ?? {};

  const componentes: ComponentOfTemplate[] = [];
  const corpo: ComponentOfTemplate = { type: 'BODY' };
  if (options.recommendationOfSecurity ?? true) corpo.add_security_recommendation = true;
  componentes.push(corpo);

  if (options.expiraEmMinutos !== undefined && options.expiraEmMinutos !== null) {
    const minutos = Number(options.expiraEmMinutos);
    if (!Number.isInteger(minutos) || minutos < EXPIRATION_MIN || minutos > EXPIRATION_MAX) {
      throw recusa(
        'autenticacao.expiraEmMinutos',
        `A validade do código vai de ${EXPIRATION_MIN} a ${EXPIRATION_MAX} minutos.`,
      );
    }
    componentes.push({ type: 'FOOTER', code_expiration_minutes: minutos });
  }

  const textoDoBotao = (options.textoDoBotao ?? '').trim() || BOTAO_COPIAR_PADRAO;
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
 * Validate the entire request before `subirMidia`: invalid body, media type, or size must fail without a Meta upload.
 */
export async function assembleTemplate(
  pedido: RequestOfTemplate,
  upMedia: (media: MediaOfHeader) => Promise<string>,
): Promise<NewTemplateOfMeta> {
  const nome = (pedido.name ?? '').trim();
  if (!NOME_VALIDO.test(nome)) {
    throw recusa('nome', 'O nome usa só letras minúsculas, números e _ (sem espaço nem acento).');
  }
  const idioma = (pedido.idioma ?? 'pt_BR').trim();
  if (!/^[a-z]{2,3}(_[A-Z]{2})?$/.test(idioma)) throw recusa('idioma', 'Idioma inválido (ex.: pt_BR).');
  const categoria = CATEGORIA_PARA_META[pedido.category ?? ''];
  if (!categoria) throw recusa('categoria', 'A categoria é utilidade, marketing ou autenticação.');

  if (categoria === 'AUTHENTICATION') {
    return { name: nome, language: idioma, category: categoria, components: assembleComponentsOfAuthentication(pedido) };
  }

  const cabecalho = conferirCabecalho(pedido);

  const corpo = (pedido.body ?? '').trim();
  if (!corpo) throw recusa('corpo', 'Escreva o texto da mensagem.');
  if (corpo.length > CORPO_MAX) throw recusa('corpo', `O texto aceita no máximo ${CORPO_MAX} caracteres.`);
  const variaveis = variablesOfText(corpo);
  const exemplos = (pedido.exemplos ?? []).map((e) => String(e).trim());
  if (exemplos.length !== variaveis.length || exemplos.some((e) => !e)) {
    throw recusa('exemplos', `Dê um exemplo para cada variável do texto (${variaveis.length}).`);
  }

  const rodape = (pedido.rodape ?? '').trim();
  if (rodape.length > CABECALHO_TEXTO_MAX) {
    throw recusa('rodape', `O rodapé aceita no máximo ${CABECALHO_TEXTO_MAX} caracteres.`);
  }

  // After validation, only assemble components; upload the file now, when no later validation can reject it.
  const componentes: ComponentOfTemplate[] = [];
  if (cabecalho.type === 'texto') {
    const component: ComponentOfTemplate = { type: 'HEADER', format: 'TEXT', text: cabecalho.texto };
    if (cabecalho.exemplo) component.example = { header_text: [cabecalho.exemplo] };
    componentes.push(component);
  } else if (cabecalho.type === 'midia') {
    // Media sample is the Resumable Upload API handle in `header_handle`.
    const handle = await upMedia(cabecalho.media);
    componentes.push({ type: 'HEADER', format: cabecalho.media.format, example: { header_handle: [handle] } });
  }

  const componentOfBody: ComponentOfTemplate = { type: 'BODY', text: corpo };
  if (variaveis.length > 0) componentOfBody.example = { body_text: [exemplos] };
  componentes.push(componentOfBody);

  if (rodape) componentes.push({ type: 'FOOTER', text: rodape });

  return { name: nome, language: idioma, category: categoria, components: componentes };
}

/** Upload media to the token-owning app, either the customer's manual app or Pipe's embedded app, as for profile photos. */
function appDo(canal: ChannelWhatsApp): string {
  const appId = texto(canal.config['appId']) ?? process.env['WHATSAPP_APP_ID'] ?? '';
  if (!appId) {
    throw PipeError.conflito(
      'channel_without_app',
      'Não sabemos o aplicativo deste canal para enviar o arquivo do cabeçalho: reconecte o WhatsApp.',
    );
  }
  return appId;
}

export async function createTemplateInMeta(
  tenantId: string,
  usuarioId: string,
  canalId: string,
  pedido: RequestOfTemplate,
): Promise<{ id: string; statusMeta: string }> {
  const canal = await readChannelWhatsApp(tenantId, canalId);
  const cliente = clienteGraph(tokenDo(canal));
  const waba = wabaDo(canal);
  const template = await assembleTemplate(pedido, (midia) => cliente.upPhoto(appDo(canal), midia.bytes, midia.type));
  const criado = await cliente.createTemplate(waba, template);
  const local = comoLocal({ ...template, status: criado.status ?? 'PENDING' })!;
  const variaveis = JSON.stringify(variablesOfText(local.body));

  return noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<{ id: string }>(sql`
      insert into template_mensagem
        (tenant_id, canal_id, nome, idioma, categoria, status_meta, corpo, cabecalho_tipo, variaveis)
      values (${tenantId}::uuid, ${canalId}::uuid, ${local.name}, ${local.idioma}, ${local.category},
              ${local.statusMeta}, ${local.body}, ${local.headerType}, ${variaveis}::jsonb)
      on conflict (tenant_id, canal_id, nome, idioma) do update
         set status_meta = excluded.status_meta, corpo = excluded.corpo,
             categoria = excluded.categoria, cabecalho_tipo = excluded.cabecalho_tipo,
             variaveis = excluded.variaveis, atualizado_em = now()
      returning id
    `);
    const id = rows[0]!.id;
    await registrarAuditoria(tx, tenantId, {
      ator: { type: 'usuario', id: usuarioId },
      acao: 'criou',
      objetoTipo: 'template_mensagem',
      objetoId: id,
      depois: { nome: local.name, idioma: local.idioma, categoria: local.category },
    });
    return { id, statusMeta: local.statusMeta };
  });
}

export async function deleteTemplateInMeta(
  tenantId: string,
  usuarioId: string,
  canalId: string,
  nome: string,
): Promise<{ removed: number }> {
  const canal = await readChannelWhatsApp(tenantId, canalId);
  if (!NOME_VALIDO.test(nome)) throw PipeError.naoEncontrado('Modelo');
  await clienteGraph(tokenDo(canal)).deleteTemplate(wabaDo(canal), nome);

  return noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<{ id: string }>(sql`
      delete from template_mensagem where canal_id = ${canalId}::uuid and nome = ${nome} returning id
    `);
    for (const { id } of rows) {
      await registrarAuditoria(tx, tenantId, {
        ator: { type: 'usuario', id: usuarioId },
        acao: 'excluiu',
        objetoTipo: 'template_mensagem',
        objetoId: id,
        antes: { nome },
      });
    }
    return { removed: rows.length };
  });
}
