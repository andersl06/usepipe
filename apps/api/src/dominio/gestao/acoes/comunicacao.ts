import type { Campos, Resultado } from './campos.js';
import { and, eq } from 'drizzle-orm';
import { CATEGORIAS_TEMPLATE, canal, respostaPronta, templateMensagem } from '@pipe/db/schema';
import type { TransacaoPipe, Ator } from '@pipe/db';
import { CABECALHOS_TEMPLATE } from '../comunicacao.js';

/** A transação já vem com o tenant fixado; `consultar` só nomeia o bloco, como na Gestão. */
const consultar = <T>(tx: TransacaoPipe, fn: (tx: TransacaoPipe) => Promise<T>): Promise<T> =>
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

function falha(erro: string): Resultado {
  return { ok: false, erro };
}

function recarregar() {}

// --------------------------------------------------------- respostas prontas

export async function salvarRespostaPronta(
  tx: TransacaoPipe,
  tid: string,
  _ator: Ator,
  dados: Campos,
): Promise<Resultado> {
  const atalho = String(dados.get('atalho') ?? '')
    .trim()
    .replace(/^#/, '');
  const titulo = String(dados.get('titulo') ?? '').trim();
  const corpo = String(dados.get('corpo') ?? '').trim();
  const categoria = String(dados.get('categoria') ?? '').trim() || null;

  if (!atalho) return falha('Informe o atalho.');
  if (/\s/.test(atalho)) {
    return falha('O atalho não pode ter espaço — é o que o atendente digita direto depois do #.');
  }
  if (!titulo) return falha('Informe o título.');
  if (!corpo) return falha('Informe o corpo da resposta.');

  return consultar(tx, async (tx) => {
    // Único por tenant é regra da TELA, não do banco: `resposta_pronta_atalho_idx`
    // é índice, não `uniqueIndex`. Sem este `select`, dois atalhos iguais entram
    // e o `#` do Desk vira ambíguo na hora de escolher qual resposta inserir.
    const [conflito] = await tx
      .select({ titulo: respostaPronta.titulo })
      .from(respostaPronta)
      .where(and(eq(respostaPronta.tenantId, tid), eq(respostaPronta.atalho, atalho)))
      .limit(1);
    if (conflito) {
      return falha(`O atalho "#${atalho}" já é usado por "${conflito.titulo}". Escolha outro.`);
    }

    await tx.insert(respostaPronta).values({
      tenantId: tid,
      escopo: 'empresa',
      categoria,
      atalho,
      titulo,
      corpo,
    });

    recarregar();
    return OK;
  });
}

// -------------------------------------------------------------------- modelos

export async function salvarModelo(
  tx: TransacaoPipe,
  tid: string,
  _ator: Ator,
  dados: Campos,
): Promise<Resultado> {
  const canalId = String(dados.get('canalId') ?? '');
  const nome = String(dados.get('nome') ?? '').trim();
  const idioma = String(dados.get('idioma') ?? '').trim() || 'pt_BR';
  const categoria = String(dados.get('categoria') ?? '');
  const cabecalhoTipo = String(dados.get('cabecalhoTipo') ?? 'nenhum');
  const corpo = String(dados.get('corpo') ?? '').trim();
  const variaveisJson = String(dados.get('variaveis') ?? '[]');

  if (!canalId) return falha('Escolha o canal do WhatsApp.');
  if (!nome) return falha('Informe o nome do modelo — o mesmo nome aprovado na Meta.');
  if (!(CATEGORIAS_TEMPLATE as readonly string[]).includes(categoria)) {
    return falha('Categoria inválida. É a categoria da Meta, não é campo livre.');
  }
  if (!(CABECALHOS_TEMPLATE as readonly string[]).includes(cabecalhoTipo)) {
    return falha('Tipo de cabeçalho inválido.');
  }
  if (!corpo)
    return falha('Cole o texto aprovado na Meta, para referência de quem vai usar o modelo.');

  let variaveis: string[];
  try {
    const bruto: unknown = JSON.parse(variaveisJson);
    if (!Array.isArray(bruto) || !bruto.every((v) => typeof v === 'string'))
      throw new Error('formato');
    variaveis = bruto;
  } catch {
    return falha('Mapeamento de variáveis inválido.');
  }

  return consultar(tx, async (tx) => {
    const [canalEscolhido] = await tx
      .select({ id: canal.id, tipo: canal.tipo })
      .from(canal)
      .where(and(eq(canal.tenantId, tid), eq(canal.id, canalId)))
      .limit(1);
    if (!canalEscolhido) return falha('Canal não encontrado.');
    if (canalEscolhido.tipo !== 'whatsapp_cloud')
      return falha('Modelo de mensagem é só para canal WhatsApp.');

    // `template_mensagem_uk` é `uniqueIndex` de verdade (tenant, canal, nome, idioma),
    // mas o conflito é checado aqui mesmo assim: erro de constraint no banco vira
    // 500 sem contexto, e quem cadastra precisa saber QUAL modelo já existe.
    const [conflito] = await tx
      .select({ id: templateMensagem.id })
      .from(templateMensagem)
      .where(
        and(
          eq(templateMensagem.tenantId, tid),
          eq(templateMensagem.canalId, canalId),
          eq(templateMensagem.nome, nome),
          eq(templateMensagem.idioma, idioma),
        ),
      )
      .limit(1);
    if (conflito) {
      return falha(`Já existe um modelo "${nome}" no idioma "${idioma}" para este canal.`);
    }

    await tx.insert(templateMensagem).values({
      tenantId: tid,
      canalId,
      nome,
      idioma,
      categoria,
      cabecalhoTipo,
      corpo,
      variaveis,
      // Nasce pendente sempre: aprovação é da Meta, não desta tela. Ver comentário
      // de `status_meta` em `packages/db/src/schema/conversas.ts`.
      statusMeta: 'pendente',
    });

    recarregar();
    return OK;
  });
}
