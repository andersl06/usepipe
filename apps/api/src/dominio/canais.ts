import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { cifrarConfig, registrarAuditoria } from '@pipe/db';
import type { TransacaoPipe } from '@pipe/db';
import { chaveiro, esquecerCanal, noTenant, resolverCanal } from '../banco.js';
import { ErroPipe } from '../erros.js';
import { codigoDoPostgres } from './dominios.js';
import { clienteMeta, versaoDaApi } from './meta.js';

/**
 * Conectar o WhatsApp do cliente.
 *
 * O buraco que este arquivo fecha: até aqui o canal só nascia por `insert` na
 * semente. Sem canal não chega mensagem, e sem mensagem o Desk fica vazio, a
 * Gestão em zero e o CRM sem lead — a porta de entrada do produto inteiro não
 * tinha como ser aberta por um cliente.
 *
 * O desenho vem de duas specs e nenhuma das duas é negociável aqui:
 *
 * - `2026-09-05-infraestrutura.md` §5: **o cliente é dono do WABA dele**. A
 *   conexão roda pelo cadastro embutido da Meta, dentro do Business Manager do
 *   cliente, e o Pipe entra como provedor de tecnologia. É o que torna literal a
 *   frase "o número é seu".
 * - `2026-09-07-webhook-por-cliente.md`: o webhook do número ganha
 *   `override_callback_uri` apontando para `…/webhooks/whatsapp/<canalId>`, com
 *   `verify_token` próprio daquele canal. O que não aceita override (template,
 *   qualidade, conta) continua caindo na rota guarda-chuva.
 *
 * Nenhuma URL é copiada e colada por ninguém: o cliente clica, e o resto é isto.
 */

/** A URL que vai para a Meta. Não é segredo — quem protege é a assinatura. */
export function urlDoWebhook(canalId: string): string {
  const base = (process.env['PIPE_URL_API'] ?? 'http://localhost:3100').replace(/\/$/, '');
  return `${base}/webhooks/whatsapp/${canalId}`;
}

/** Limite da Meta para `override_callback_uri` (§1 da spec). */
const LIMITE_DA_URL = 200;

export interface CanalWhatsAppVisivel {
  id: string;
  nome: string;
  ativo: boolean;
  wabaId: string | null;
  numeroId: string | null;
  numero: string | null;
  nomeExibicao: string | null;
  /**
   * `conectado` — a Meta respondeu sobre o número.
   * `desligado` — o canal foi desconectado aqui.
   * `indisponivel` — o canal está ligado mas a Meta não respondeu; `motivo` diz o quê.
   */
  estado: 'conectado' | 'desligado' | 'indisponivel';
  qualidade: string | null;
  limite: string | null;
  motivo: string | null;
  webhookUrl: string;
  criadoEm: Date;
}

interface LinhaCanal {
  [coluna: string]: unknown;
  id: string;
  nome: string;
  ativo: boolean;
  waba_id: string | null;
  numero_id: string | null;
  criado_em: string | Date;
}

export interface PedidoDeConexao {
  tenantId: string;
  usuarioId: string;
  /** O `code` que o cadastro embutido da Meta devolve no fim do fluxo. */
  codigo: string;
  /** Nome do canal na tela. Vazio vira "WhatsApp <número>". */
  nome?: string | undefined;
}

/**
 * Conclui a conexão a partir do código do cadastro embutido.
 *
 * A ordem importa e não é arbitrária:
 *
 * 1. troca o código pelo token do CLIENTE (nosso app, WABA dele);
 * 2. descobre WABA e número — são as duas chaves de roteamento da rota
 *    guarda-chuva, e por isso vão em COLUNA, não no `config`;
 * 3. grava o canal com o token **cifrado** (`cifrarConfig`) e o `verify_token`
 *    sorteado para ele;
 * 4. só então configura o override, porque a URL do override contém o `canalId`
 *    que só existe depois do passo 3.
 *
 * ponytail: os passos 4 e 5 falam com a Meta DENTRO da transação, para que
 * override recusado desfaça o canal em vez de deixar um canal que nunca recebe
 * nada. É uma transação de escrita segurando conexão durante uma chamada de rede
 * — aceitável porque é ação de administrador, uma vez por número. Se virar
 * problema, o caminho é gravar `pendente`, chamar a Meta fora e promover depois.
 */
export async function conectarWhatsApp(pedido: PedidoDeConexao): Promise<CanalWhatsAppVisivel> {
  const codigo = (pedido.codigo ?? '').trim();
  if (!codigo) {
    throw ErroPipe.requisicao(
      'codigo_ausente',
      'O cadastro embutido da Meta não devolveu código. Refaça a conexão.',
    );
  }

  const meta = clienteMeta();
  const token = await meta.trocarCodigo(codigo);
  const conta = await meta.descobrirConta(token);

  // O `verify_token` é legitimamente por canal: cada override carrega o seu, e é
  // assim que a Meta valida cada endpoint separadamente (§5 da spec).
  const verifyToken = randomBytes(24).toString('base64url');

  /*
   * O `appSecret` é do NOSSO aplicativo e é o mesmo em todos os canais — redundante,
   * mas é o que atende o cliente que chegar com aplicativo próprio. Ausente, não é
   * gravado: o webhook cai no `WHATSAPP_APP_SECRET` do ambiente, e gravar string
   * vazia esconderia a falta atrás de um valor.
   */
  const appSecret = process.env['WHATSAPP_APP_SECRET'] ?? '';
  const nome = (pedido.nome ?? '').trim() || `WhatsApp ${conta.numero || conta.numeroId}`;

  const config = cifrarConfig(
    {
      phoneNumberId: conta.numeroId,
      tokenAcesso: token,
      verifyToken,
      apiVersao: versaoDaApi(),
      numero: conta.numero,
      nomeExibicao: conta.nomeExibicao,
      ...(appSecret ? { appSecret } : {}),
    },
    chaveiro(),
  );

  let linha: LinhaCanal;
  try {
    linha = await noTenant(pedido.tenantId, async (tx) => {
      /*
       * Reconexão do MESMO tenant é atualização, não linha nova. A consulta roda
       * sob RLS, então ela só enxerga canal deste tenant — número de outro cliente
       * não aparece aqui e é o índice único global que o barra, no `catch` abaixo.
       */
      const { rows: existentes } = await tx.execute<{ id: string }>(
        sql`select id from canal where numero_id = ${conta.numeroId} limit 1`,
      );

      const anterior = existentes[0]?.id ?? null;
      const { rows } = anterior
        ? await tx.execute<LinhaCanal>(sql`
            update canal
               set nome = ${nome}, config = ${JSON.stringify(config)}::jsonb,
                   waba_id = ${conta.wabaId}, ativo = true, atualizado_em = now()
             where id = ${anterior}::uuid
            returning id, nome, ativo, waba_id, numero_id, criado_em
          `)
        : await tx.execute<LinhaCanal>(sql`
            insert into canal (tenant_id, tipo, nome, config, waba_id, numero_id)
            values (${pedido.tenantId}::uuid, 'whatsapp_cloud', ${nome},
                    ${JSON.stringify(config)}::jsonb, ${conta.wabaId}, ${conta.numeroId})
            returning id, nome, ativo, waba_id, numero_id, criado_em
          `);

      const gravado = rows[0]!;
      const url = urlDoWebhook(gravado.id);
      if (url.length > LIMITE_DA_URL) {
        throw new ErroPipe(
          500,
          'url_longa_demais',
          `A URL do webhook tem ${url.length} caracteres e a Meta aceita ${LIMITE_DA_URL}. Encurte PIPE_URL_API.`,
        );
      }

      // Canal sem caixa de entrada não recebe nada: a mensagem chega e não tem
      // onde cair (ver `acharInbox` em `dominio/entrada.ts`, que falha alto).
      await garantirInbox(tx, pedido.tenantId, gravado.id);

      await meta.assinarCampos(conta.wabaId, token);
      await meta.definirOverride(conta.numeroId, token, url, verifyToken);

      await registrarAuditoria(tx, pedido.tenantId, {
        ator: { tipo: 'usuario', id: pedido.usuarioId },
        acao: anterior ? 'alterou' : 'criou',
        objetoTipo: 'canal',
        objetoId: gravado.id,
        // `registrarAuditoria` descarta `config` sozinha — é campo que nunca entra no log.
        depois: gravado,
      });
      return gravado;
    });
  } catch (erro) {
    if (codigoDoPostgres(erro) === '23505') {
      throw ErroPipe.conflito(
        'numero_em_uso',
        'Este número de WhatsApp já está conectado a outra conta do Pipe. ' +
          'Desconecte-o lá antes de conectar aqui.',
      );
    }
    throw erro;
  }

  esquecerCanal(linha.id);
  return {
    ...visivel(linha),
    numero: conta.numero || null,
    nomeExibicao: conta.nomeExibicao || null,
    estado: 'conectado',
    qualidade: null,
    limite: null,
  };
}

/**
 * O estado da ligação, que é o que a tela de Canais da Gestão mostra.
 *
 * A qualidade e o limite vêm da Meta a cada leitura, e não do banco: os dois mudam
 * sozinhos, sem nos avisar por esta rota. Meta fora do ar vira `indisponivel` com
 * o motivo — nunca 502 na tela inteira, porque "não consegui perguntar" e "o canal
 * está quebrado" são coisas diferentes.
 */
export async function listarCanaisWhatsApp(tenantId: string): Promise<CanalWhatsAppVisivel[]> {
  const linhas = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<LinhaCanal & { config: Record<string, unknown> | null }>(sql`
      select id, nome, ativo, waba_id, numero_id, criado_em, config
        from canal
       where tipo = 'whatsapp_cloud'
       order by criado_em
    `);
    return rows;
  });

  const meta = clienteMeta();
  const saida: CanalWhatsAppVisivel[] = [];
  for (const linha of linhas) {
    const base = visivel(linha);
    const config = linha.config ?? {};
    base.numero = texto(config['numero']);
    base.nomeExibicao = texto(config['nomeExibicao']);

    if (!linha.ativo || !linha.numero_id) {
      saida.push(base);
      continue;
    }

    // O token sai cifrado da consulta acima; decifrar é o `resolverCanal`, que já
    // tem cache. Reaproveitar evita repetir a decifra a cada leitura de tela.
    const canal = await resolverCanal(linha.id);
    const token = texto(canal?.config['tokenAcesso']);
    if (!token) {
      saida.push({ ...base, estado: 'indisponivel', motivo: 'sem_token' });
      continue;
    }

    try {
      const numero = await meta.lerNumero(linha.numero_id, token);
      saida.push({
        ...base,
        estado: 'conectado',
        numero: numero.numero || base.numero,
        nomeExibicao: numero.nomeExibicao || base.nomeExibicao,
        qualidade: numero.qualidade,
        limite: numero.limite,
      });
    } catch (erro) {
      // O motivo é o CÓDIGO, nunca a mensagem: mensagem da Meta pode ecoar o que recebeu.
      saida.push({
        ...base,
        estado: 'indisponivel',
        motivo: erro instanceof ErroPipe ? erro.codigo : 'meta_inacessivel',
      });
    }
  }
  return saida;
}

/**
 * Desconectar: apaga o override na Meta e desativa o canal.
 *
 * **Não apaga conversa nem mensagem.** O histórico é do cliente, e desconectar um
 * canal não é motivo para ele perder o que já foi atendido.
 *
 * `forcar` existe para o caso em que o token do cliente já foi revogado do lado
 * dele: sem ele, o canal ficaria preso ligado para sempre e o número, travado pelo
 * índice único, nunca mais poderia ser reconectado.
 */
export async function desconectarWhatsApp(
  tenantId: string,
  usuarioId: string,
  canalId: string,
  forcar = false,
): Promise<CanalWhatsAppVisivel> {
  const canal = await resolverCanal(canalId);
  if (!canal || canal.tenantId !== tenantId) throw ErroPipe.naoEncontrado('Canal');

  const numeroId = texto(canal.config['phoneNumberId']);
  const token = texto(canal.config['tokenAcesso']);
  if (numeroId && token) {
    try {
      await clienteMeta().apagarOverride(numeroId, token);
    } catch (erro) {
      if (!forcar) throw erro;
      console.warn(`[canal] override do canal ${canalId} não foi apagado na Meta; seguindo forçado`);
    }
  }

  const linha = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<LinhaCanal>(sql`
      update canal set ativo = false, atualizado_em = now()
       where id = ${canalId}::uuid
      returning id, nome, ativo, waba_id, numero_id, criado_em
    `);
    const gravado = rows[0];
    if (!gravado) throw ErroPipe.naoEncontrado('Canal');
    await registrarAuditoria(tx, tenantId, {
      ator: { tipo: 'usuario', id: usuarioId },
      acao: 'desativou',
      objetoTipo: 'canal',
      objetoId: canalId,
      depois: gravado,
    });
    return gravado;
  });

  esquecerCanal(canalId);
  return visivel(linha);
}

async function garantirInbox(
  tx: TransacaoPipe,
  tenantId: string,
  canalId: string,
): Promise<void> {
  const { rows: caixas } = await tx.execute<{ id: string }>(
    sql`select id from inbox where canal_id = ${canalId}::uuid limit 1`,
  );
  if (caixas[0]) return;

  const { rows: filas } = await tx.execute<{ id: string }>(
    sql`select id from fila where ativa order by ordem, criado_em limit 1`,
  );
  await tx.execute(sql`
    insert into inbox (tenant_id, canal_id, nome, fila_padrao_id)
    values (${tenantId}::uuid, ${canalId}::uuid, 'Entrada', ${filas[0]?.id ?? null})
  `);
}

function visivel(linha: LinhaCanal): CanalWhatsAppVisivel {
  return {
    id: linha.id,
    nome: linha.nome,
    ativo: linha.ativo,
    wabaId: linha.waba_id,
    numeroId: linha.numero_id,
    numero: null,
    nomeExibicao: null,
    estado: linha.ativo ? 'indisponivel' : 'desligado',
    qualidade: null,
    limite: null,
    motivo: null,
    webhookUrl: urlDoWebhook(linha.id),
    criadoEm: linha.criado_em instanceof Date ? linha.criado_em : new Date(linha.criado_em),
  };
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor !== '' ? valor : null;
}
