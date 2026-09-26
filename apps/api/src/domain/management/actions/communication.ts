import type { Campos, Resultado } from './campos.js';
import { and, eq } from 'drizzle-orm';
import { CATEGORIAS_TEMPLATE, channel, templateMessage } from '@pipe/db/schema';
import type { TransactionPipe, Ator } from '@pipe/db';
import { PipeError } from '../../../errors.js';
import { CABECALHOS_TEMPLATE, createResponseReady } from '../communication.js';

/** A transação já vem com o tenant fixado; `consultar` só nomeia o bloco, como na Gestão. */
const consultar = <T>(tx: TransactionPipe, fn: (tx: TransactionPipe) => Promise<T>): Promise<T> =>
  fn(tx);

/**
 * Communication Server Actions return expected form errors as `Resultado`, following `apps/desk/src/app/acoes.ts`, so client `useActionState` can show them without try/catch. Each action performs ONE transaction, using conflict `selects` before `insert`. Never use `Promise.all` inside `comTenant`: parallel queries can lose the session `set_config('pipe.tenant_id')`; see README section Banco de dados.
 */

const OK: Resultado = { ok: true };

function falha(error: string): Resultado {
  return { ok: false, error };
}

function recarregar() {}

/** `ErroPipe` de validação/permissão/conflito vira a frase da tela; qualquer outro erro sobe. */
async function comoResultado(fn: () => Promise<unknown>): Promise<Resultado> {
  try {
    await fn();
    return OK;
  } catch (erro) {
    if (erro instanceof PipeError) return falha(erro.message);
    throw erro;
  }
}

// --------------------------------------------------------- respostas prontas

/**
 * Thin wrapper around `criarRespostaPronta` in `comunicacao.ts`, also used by `POST /v1/gestao/comunicacao/respostas-prontas`. Previously this action validated and wrote here without permission checks.
 */
export async function salvarRespostaPronta(
  tx: TransactionPipe,
  tid: string,
  ator: Ator,
  data: Campos,
): Promise<Resultado> {
  return comoResultado(async () => {
    await createResponseReady(tx, tid, ator.id ?? '', {
      shortcut: String(data.get('atalho') ?? ''),
      title: String(data.get('titulo') ?? ''),
      body: String(data.get('corpo') ?? ''),
      category: data.get('categoria'),
    });
    recarregar();
  });
}

// -------------------------------------------------------------------- modelos

export async function saveTemplate(
  tx: TransactionPipe,
  tid: string,
  _ator: Ator,
  dados: Campos,
): Promise<Resultado> {
  const channelId = String(dados.get('canalId') ?? '');
  const nome = String(dados.get('nome') ?? '').trim();
  const idioma = String(dados.get('idioma') ?? '').trim() || 'pt_BR';
  const categoria = String(dados.get('categoria') ?? '');
  const cabecalhoTipo = String(dados.get('cabecalhoTipo') ?? 'nenhum');
  const corpo = String(dados.get('corpo') ?? '').trim();
  const variablesJson = String(dados.get('variaveis') ?? '[]');

  if (!channelId) return falha('Escolha o canal do WhatsApp.');
  if (!nome) return falha('Informe o nome do modelo — o mesmo nome aprovado na Meta.');
  if (!(CATEGORIAS_TEMPLATE as readonly string[]).includes(categoria)) {
    return falha('Categoria inválida. É a categoria da Meta, não é campo livre.');
  }
  if (!(CABECALHOS_TEMPLATE as readonly string[]).includes(cabecalhoTipo)) {
    return falha('Tipo de cabeçalho inválido.');
  }
  if (!corpo)
    return falha('Cole o texto aprovado na Meta, para referência de quem vai usar o modelo.');

  let variables: string[];
  try {
    const bruto: unknown = JSON.parse(variablesJson);
    if (!Array.isArray(bruto) || !bruto.every((v) => typeof v === 'string'))
      throw new Error('formato');
    variables = bruto;
  } catch {
    return falha('Mapeamento de variáveis inválido.');
  }

  return consultar(tx, async (tx) => {
    const [channelEscolhido] = await tx
      .select({ id: channel.id, tipo: channel.tipo })
      .from(channel)
      .where(and(eq(channel.tenantId, tid), eq(channel.id, channelId)))
      .limit(1);
    if (!channelEscolhido) return falha('Canal não encontrado.');
    if (channelEscolhido.tipo !== 'whatsapp_cloud')
      return falha('Modelo de mensagem é só para canal WhatsApp.');

    // `template_mensagem_uk` is a real `uniqueIndex` on tenant, channel, name, and language,
    // but check for conflict here anyway: a database constraint error becomes
    // an unexplained 500, and the user needs to know WHICH template exists.
    const [conflito] = await tx
      .select({ id: templateMessage.id })
      .from(templateMessage)
      .where(
        and(
          eq(templateMessage.tenantId, tid),
          eq(templateMessage.canalId, channelId),
          eq(templateMessage.nome, nome),
          eq(templateMessage.idioma, idioma),
        ),
      )
      .limit(1);
    if (conflito) {
      return falha(`Já existe um modelo "${nome}" no idioma "${idioma}" para este canal.`);
    }

    await tx.insert(templateMessage).values({
      tenantId: tid,
      canalId: channelId,
      nome,
      idioma,
      categoria,
      cabecalhoTipo,
      corpo,
      variables,
      // A template always starts pending: Meta approves it, not this screen. See the `status_meta` comment in `packages/db/src/schema/conversas.ts`.
      // de `status_meta` em `packages/db/src/schema/conversas.ts`.
      statusMeta: 'pendente',
    });

    recarregar();
    return OK;
  });
}
