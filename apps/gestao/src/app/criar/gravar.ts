import { and, eq } from 'drizzle-orm';
import { registrarAuditoria } from '@pipe/db';
import { fluxo } from '@pipe/db/schema';
import { atorDaGestao, consultar, exigirEu, tenantId } from '../../lib/banco';
import {
  IMAGEM,
  type RecadosDoNome,
  conferir,
  limparNome,
  nomeCurto,
  tipoRealDaImagem,
} from './regras-de-nome';

/**
 * A gravação do contato — a mesma para o roteador e para o fluxo.
 *
 * Na origem esta é a `CreateApplicationService.createApplication(application, template)`,
 * chamada pelo `createApplication()` do controlador quando alguém clica no botão
 * de envio do passo do nome. Ela faz SETE coisas, nesta ordem:
 *
 *   1. `prepareApplicationData` — resolve o "marketplace" do template
 *      (`getMarketplaceTemplateAsync`), deriva `shortName` e valida o nome.
 *      Para `master` (roteador) e para `builder` (fluxo do zero) o retorno cai
 *      no `default` e é `{ id: '0', type: <template> }`: não há modelo a
 *      aplicar. É só o caminho "Usar template" que sai daqui com um `id` de
 *      verdade — e é justamente o que não copiamos.
 *   2. `uploadApplicationImageSafely` — a foto, opcional, com o erro engolido
 *      DE PROPÓSITO. Acontece, em `lerImagem` logo abaixo.
 *   3. `createApplicationOnIris` — o `set /applications` no LIME. É a nossa
 *      linha na tabela `fluxo`. Se falhar, `cleanupFailedApplication` desfaz;
 *      aqui a transação já faz isso sozinha.
 *   4. `setApplicationExtras` — grava `#marketplace.id` nos extras. Sem modelo,
 *      o valor é `'0'` nos dois casos: nada a guardar.
 *   5. `activateApplicationFeatures` — `if (template === Builder || Pipeline)`.
 *      É AQUI que as duas telas se separam do lado do servidor, e é a diferença
 *      que este arquivo NÃO consegue copiar. Ver o bloco abaixo.
 *   6. `applyMarketplaceTemplate` — `if (marketplace.id !== '0')`. Não é o caso
 *      de nenhum dos dois caminhos que temos.
 *   7. devolve o contato criado, e o controlador vai para o detalhe dele.
 *
 * ═══ O PASSO 5, QUE O ROTEADOR PULA E O FLUXO NÃO ═══
 *
 * Para `master`, `activateApplicationFeatures` não faz nada: roteador nasce sem
 * construtor e sem atendimento — ele só aponta para outros contatos. Para
 * `builder`, ela faz duas chamadas:
 *
 *   `ChatbotSettingsService.setBuilderActive(app, true)` — liga o construtor.
 *     Se ESTA falhar, o contato inteiro é apagado (`BuilderActivation` é o único
 *     passo que dispara `cleanupFailedApplication`): fluxo sem construtor não é
 *     um fluxo.
 *   `activateAttendance()` — liga o atendimento. Se falhar, a criação SEGUE
 *     ("continuing without help desk features"). Ela manda um `set` para
 *     `postmaster@desk.msging.net/configuration` e, com ele, cria: a equipe
 *     "Default" com quem criou dentro, a fila "Default" com 0 atendentes, e
 *     — atrás do toggle `isRedirectOutOfAttendanceHourEnabled` — o horário
 *     "Horário Regular", de segunda a sexta, das 08:00 às 18:00.
 *
 * NADA DISSO É REPLICADO AQUI, e é a divergência maior desta tela. Motivo: as
 * três peças que ela criaria (equipe, fila, horário de atendimento) são tabelas
 * do produto de atendimento, e ligar o construtor é um estado que a nossa
 * tabela `fluxo` ainda não tem coluna para guardar. Criar equipe e fila a partir
 * da criação de um fluxo, sem a tela que as mostra, seria inventar linha que
 * ninguém consegue ver nem apagar. Está no relatório.
 *
 * ponytail: o passo 5 fica de fora; quando existirem as telas de fila e equipe,
 * é aqui que entram — um `if (tipo === 'fluxo')` em volta das três inserções.
 */

/** O que a gravação devolve: o id criado, ou o motivo da recusa. */
export type Resultado = { id: string; erro?: undefined } | { id?: undefined; erro: string };

export interface OpcoesDaGravacao {
  /** `'fluxo'` (o `builder` deles) ou `'roteador'` (o `master`). */
  tipo: 'fluxo' | 'roteador';
  /** As duas frases de recusa do nome, na palavra de cada tela. */
  recados: RecadosDoNome & { nomeEmUso: string; semPermissao: string };
}

export async function gravarContato(
  dados: FormData,
  { tipo, recados }: OpcoesDaGravacao,
): Promise<Resultado> {
  /* `canCreateChatbot` deles é `hasRequiredTenantRole(…, [Admin, Member])` —
     conferido no `$onInit` da tela, e quem não passa é mandado de volta para a
     lista ANTES de ver o formulário. Aqui a permissão equivalente é
     `automacao.fluxo.editar` (a mesma que `lib/portal.ts` usa para decidir se
     os botões de criar aparecem). Conferimos de novo na gravação porque tela
     escondida não é porta trancada. */
  const eu = await exigirEu();
  if (!eu.permissoes.includes('automacao.fluxo.editar')) return { erro: recados.semPermissao };

  /* `limparNome` antes de tudo porque na origem o campo JÁ CHEGA limpo: o
     saneamento roda a cada tecla, então o valor que o formulário envia nunca
     teve caractere proibido. Quem manda o POST por fora não passou por isso. */
  const nome = limparNome(String(dados.get('nome') ?? '')).trim();

  const recusa = conferir(nome, recados);
  if (recusa) return { erro: recusa.motivo };

  /* A foto vem ANTES da gravação, como na origem: lá
     `uploadApplicationImageSafely(e)` roda antes de `createApplicationOnIris`,
     porque o `imageUri` precisa estar no objeto que é criado. */
  const imagemUrl = await lerImagem(dados.get('imagem'));

  const tid = await tenantId();
  const ator = await atorDaGestao();

  const id = await consultar(async (tx) => {
    /* O nome é único na prática, e não por índice: na origem o `shortName` sai
       do nome (`name.toLowerCase()`) e é a chave do contato na plataforma —
       dois nomes iguais colidem lá dentro, e o que a pessoa lê é justamente
       "Experimente usar outro nome". Sem este `select` a colisão só apareceria
       como dois cartões idênticos na grade do portal.

       Consultas UMA DE CADA VEZ dentro da transação: `Promise.all` aqui derruba
       o `set_config('pipe.tenant_id')` da sessão (README §Banco de dados). */
    const [conflito] = await tx
      .select({ id: fluxo.id })
      .from(fluxo)
      .where(and(eq(fluxo.tenantId, tid), eq(fluxo.nome, nome)))
      .limit(1);
    if (conflito) return null;

    const [criado] = await tx
      .insert(fluxo)
      .values({
        tenantId: tid,
        nome,
        /* O `template` da origem: `master` vira `roteador`, `builder` vira
           `fluxo`. A coluna já existe com o check `('fluxo','roteador')`; é ela
           que etiqueta o cartão do portal. */
        tipo,
        /* `shortName = name.toLowerCase()` da origem, com os espaços virando
           hífen (ver `nomeCurto` em `regras-de-nome.ts`). */
        shortName: nomeCurto(nome),
        /* Nulo quando não veio foto, quando ela passou do teto ou quando os
           bytes não são de um dos três tipos — e nenhum desses casos derruba a
           criação, que é o que `uploadApplicationImageSafely` faz lá. */
        imagemUrl,
        /* `estado` fica no padrão `rascunho`: na origem o contato nasce sem
           publicação. */
      })
      .returning({ id: fluxo.id });
    if (!criado) return null;

    await registrarAuditoria(tx, tid, {
      ator,
      acao: 'criou',
      objetoTipo: 'fluxo',
      objetoId: criado.id,
      depois: { nome, tipo, estado: 'rascunho' },
    });

    return criado.id;
  });

  if (!id) return { erro: recados.nomeEmUso };
  return { id };
}

/**
 * A foto do contato, pronta para a coluna — ou `null`, sem reclamar.
 *
 * É a nossa `uploadApplicationImageSafely`: na origem ela é um `try/catch` que
 * só faz `console.warn("Image upload failed, continuing without image")` e
 * deixa a criação seguir. Aqui não há exceção a engolir porque nada é lançado:
 * todo caminho que não dá certo devolve `null`, e quem chama grava nulo.
 *
 * Isso é DE PROPÓSITO, e é a decisão da origem: a foto é enfeite de um contato
 * que já existe; o contato é o trabalho. Recusar a criação inteira porque
 * alguém escolheu um arquivo grande demais troca um enfeite por um formulário
 * preenchido de novo.
 *
 * ═══ ONDE A FOTO MORA, E QUAL É O TETO DESSA ESCOLHA ═══
 *
 * Ela vira um `data:` URI e mora na PRÓPRIA coluna `fluxo.imagem_url`. Na
 * origem ela vai para o media store deles e a coluna guarda um endereço
 * (`https://blipmediastore…`).
 *
 * O que existe aqui para fazer isso direito é o storage de anexo de
 * `apps/api` — `guardarAnexo`, tabela `anexo`, link assinado de 15 minutos. Ele
 * não foi usado porque cobrar a foto de um avatar exigiria, além do upload, uma
 * rota de leitura nesta aplicação para reassinar o link a cada carregamento da
 * grade do portal: três peças novas para uma imagem de 150px.
 *
 * Gravar em `public/` foi descartado antes: arquivo em disco dentro do pacote
 * do Next não sobrevive a um novo `build`, não é compartilhado entre réplicas e
 * fica para sempre quando o fluxo é apagado.
 *
 * ponytail: data URI na coluna; o teto é o tamanho da linha — cada consulta que
 * seleciona `imagem_url` arrasta os bytes junto, e por isso o limite é 256 KB e
 * não os 100 MB do anexo. Quando a foto passar a ser grande, ou quando a grade
 * do portal ficar lenta, troque por `anexo` + link assinado, que já existem.
 */
async function lerImagem(campo: FormDataEntryValue | null): Promise<string | null> {
  /* Campo vazio chega como um `File` de zero byte, e não como `null`. */
  if (!(campo instanceof File) || campo.size === 0) return null;
  if (campo.size > IMAGEM.maxBytes) return null;

  const bytes = new Uint8Array(await campo.arrayBuffer());

  /* O tipo sai dos BYTES, nunca da extensão nem do `type` do `File`: os dois
     são texto que quem enviou escreveu, e um `.png` que na verdade é HTML é
     como um anexo vira execução de script na sessão de quem abrir. */
  const mime = tipoRealDaImagem(bytes);
  if (!mime) return null;

  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}
