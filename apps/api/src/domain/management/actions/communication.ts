import type { Campos, Resultado } from './campos.js';
import { and, eq } from 'drizzle-orm';
import { CATEGORIAS_TEMPLATE, channel, templateMensagem as templateMessage } from '@pipe/db/schema';
import type { TransacaoPipe as TransactionPipe, Ator } from '@pipe/db';
import { PipeError } from '../../../errors.js';
import { CABECALHOS_TEMPLATE, createResponseReady } from '../communication.js';

/** A transação já vem com o tenant fixado; `consultar` só nomeia o bloco, como na Gestão. */
const consultar = <T>(tx: TransactionPipe, fn: (tx: TransactionPipe) => Promise<T>): Promise<T> =>
  fn(tx);

/**
 * Server Actions de Comunicação. Seguem o mesmo formato `Resultado` de
 * `apps/desk/src/app/acoes.ts`: sem exceção para o caso esperado de erro de
 * formulário, para o `useActionState` do lado do cliente mostrar mensagem sem
 * precisar de try/catch na tela.
 *
 * As duas ações fazem UMA transação cada, com os `selects` de conflito antes
 * do `insert` — nunca em paralelo (`Promise.all` dentro de `comTenant` derruba
 * o `set_config('pipe.tenant_id')` da sessão, ver README §Banco de dados).
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
 * Casca fina sobre `criarRespostaPronta` de `comunicacao.ts` — a mesma que a
 * rota REST nova (`POST /v1/gestao/comunicacao/respostas-prontas`) chama.
 * Antes desta ação validava e gravava aqui, sem permissão nenhuma.
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
      titulo: String(data.get('titulo') ?? ''),
      corpo: String(data.get('corpo') ?? ''),
      categoria: data.get('categoria'),
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

    // `template_mensagem_uk` é `uniqueIndex` de verdade (tenant, canal, nome, idioma),
    // mas o conflito é checado aqui mesmo assim: erro de constraint no banco vira
    // 500 sem contexto, e quem cadastra precisa saber QUAL modelo já existe.
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
      channelId,
      nome,
      idioma,
      categoria,
      cabecalhoTipo,
      corpo,
      variables,
      // Nasce pendente sempre: aprovação é da Meta, não desta tela. Ver comentário
      // de `status_meta` em `packages/db/src/schema/conversas.ts`.
      statusMeta: 'pendente',
    });

    recarregar();
    return OK;
  });
}
