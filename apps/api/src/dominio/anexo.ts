import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  ArmazenamentoEmDisco,
  VALIDADE_LINK_MS,
  assinar,
  assinaturaValida,
  chaveDeAnexo,
  chaveDoTenant,
  maxBytesDoMime,
  mimeAceito,
  mimeParaServir,
  servirComoAnexo,
  tipoDoMime,
} from '@pipe/armazenamento';
import type { Armazenamento } from '@pipe/armazenamento';
import { chaveiroDoAmbiente } from '@pipe/db';
import { noTenant } from '../banco.js';
import { ErroPipe } from '../erros.js';

/**
 * Anexo: subir, ler e montar o link.
 *
 * Ver `docs/specs/2026-09-07-storage-de-anexos.md`. Três regras que não se dobram:
 *
 * 1. **O tenant vem da credencial, e é o primeiro segmento da chave.** Um cliente
 *    nunca compartilha prefixo com outro.
 * 2. **Nada é servido por URL pública adivinhável por id.** Sai link assinado com 15
 *    minutos, o mesmo modelo de *file token* da Blip.
 * 3. **O tipo é carimbado pelos BYTES.** Extensão e `Content-Type` do upload são texto
 *    que o cliente escreveu; um `.png` que é HTML vira XSS na tela de quem abrir.
 */

let armazem: Armazenamento | null = null;

export function armazenamento(): Armazenamento {
  armazem ??= new ArmazenamentoEmDisco();
  return armazem;
}

/** Só para teste: troca o backend sem subir infra. */
export function usarArmazenamento(novo: Armazenamento | null): void {
  armazem = novo;
}

/**
 * O segredo que assina os links.
 *
 * Reaproveita o chaveiro que já protege o token da Meta — uma chave a menos para
 * rotacionar e um lugar a menos para vazar.
 */
function segredoDeLink(): string {
  const chaveiro = chaveiroDoAmbiente();
  const chave = chaveiro.chaves.get(chaveiro.atual);
  if (!chave) throw new Error('chaveiro sem a chave atual: link de anexo não pode ser assinado');
  return chave.toString('base64');
}

export interface AnexoGuardado {
  id: string;
  mime: string;
  bytes: number;
  tipo: 'imagem' | 'audio' | 'video' | 'documento';
  link: string;
}

export interface PedidoDeUpload {
  tenantId: string;
  nomeOriginal: string | null;
  mimeDeclarado: string;
  dados: Uint8Array;
}

export async function guardarAnexo(pedido: PedidoDeUpload): Promise<AnexoGuardado> {
  if (!mimeAceito(pedido.mimeDeclarado)) {
    throw ErroPipe.requisicao(
      'tipo_nao_aceito',
      `O tipo "${pedido.mimeDeclarado}" não é aceito.`,
      { mime: pedido.mimeDeclarado },
    );
  }

  // O tipo real primeiro: o teto de tamanho depende dele, e um vídeo declarado como
  // PDF passaria pelo limite de 100 MB em vez do de 16 MB.
  const mime = mimeParaServir(pedido.mimeDeclarado, pedido.dados);
  if (!mimeAceito(mime)) {
    throw ErroPipe.requisicao(
      'tipo_real_nao_aceito',
      `O arquivo diz ser "${pedido.mimeDeclarado}", mas o conteúdo é "${mime}".`,
      { declarado: pedido.mimeDeclarado, real: mime },
    );
  }

  const teto = maxBytesDoMime(mime);
  if (pedido.dados.byteLength > teto) {
    throw ErroPipe.requisicao(
      'arquivo_grande_demais',
      `O arquivo tem ${mb(pedido.dados.byteLength)} MB e o limite para este tipo é ${mb(teto)} MB.`,
      { bytes: pedido.dados.byteLength, limite: teto },
    );
  }
  if (pedido.dados.byteLength === 0) {
    throw ErroPipe.requisicao('arquivo_vazio', 'O arquivo está vazio.');
  }

  const chave = chaveDeAnexo(pedido.tenantId, pedido.nomeOriginal);
  const checksum = createHash('sha256').update(pedido.dados).digest('hex');

  // Grava no storage ANTES do banco: linha sem arquivo é anexo quebrado na tela;
  // arquivo sem linha é só lixo, e o disco aguenta.
  await armazenamento().guardar(chave, pedido.dados);

  const id = await noTenant(pedido.tenantId, async (tx) => {
    const { rows } = await tx.execute<{ id: string }>(sql`
      insert into anexo (tenant_id, chave_storage, mime, bytes, nome_original, checksum)
      values (${pedido.tenantId}, ${chave}, ${mime}, ${pedido.dados.byteLength},
              ${pedido.nomeOriginal}, ${checksum})
      returning id
    `);
    const criado = rows[0]?.id;
    if (!criado) throw new Error('não gravou o anexo');
    return criado;
  });

  return {
    id,
    mime,
    bytes: pedido.dados.byteLength,
    tipo: tipoDoMime(mime),
    link: linkDoAnexo(id),
  };
}

/**
 * O link assinado de um anexo, com 15 minutos de validade.
 *
 * É esta URL que a Meta baixa quando mandamos mídia, e é ela que a tela usa. Absoluta
 * porque a Meta busca de fora — `PIPE_STORAGE_URL_BASE` deixa de apontar para um host
 * que não existe e passa a ser a base pública da própria `api`.
 */
export function linkDoAnexo(anexoId: string, agora = Date.now()): string {
  const expira = agora + VALIDADE_LINK_MS;
  const assinatura = assinar(anexoId, expira, segredoDeLink());
  const base = (
    process.env['PIPE_STORAGE_URL_BASE'] ??
    process.env['PIPE_URL_API'] ??
    'http://localhost:3000'
  ).replace(/\/$/, '');
  return `${base}/v1/anexos/${anexoId}?expira=${expira}&assinatura=${assinatura}`;
}

export interface AnexoParaServir {
  dados: Uint8Array;
  mime: string;
  nomeOriginal: string | null;
  /** `true` obriga download em vez de abrir inline. Ver `servirComoAnexo`. */
  comoAnexo: boolean;
}

/**
 * Lê um anexo a partir de um link assinado.
 *
 * **Não exige sessão de propósito**: a Meta precisa baixar a mídia e não tem cookie
 * nosso. A credencial é a própria assinatura, e por isso ela é curta e por anexo.
 *
 * O tenant é o do ANEXO, resolvido do banco pelo id — não vem da URL. Assinatura
 * prova que o link saiu de nós; a conferência de prefixo prova que o arquivo é do
 * tenant daquele anexo.
 */
export async function lerAnexoAssinado(
  anexoId: string,
  expira: number,
  assinatura: string,
  tenantIdDoAnexo: (id: string) => Promise<{ tenantId: string } | null>,
): Promise<AnexoParaServir> {
  if (!assinaturaValida(anexoId, expira, assinatura, segredoDeLink())) {
    // Link vencido e link forjado dão a MESMA resposta: distinguir contaria a quem
    // tenta qual metade do palpite acertou.
    throw ErroPipe.naoAutorizado('Link inválido ou vencido.');
  }

  const dono = await tenantIdDoAnexo(anexoId);
  if (!dono) throw ErroPipe.naoEncontrado('Anexo');

  const linha = await noTenant(dono.tenantId, async (tx) => {
    const { rows } = await tx.execute<{
      chave_storage: string;
      mime: string;
      nome_original: string | null;
    }>(sql`
      select chave_storage, mime, nome_original from anexo where id = ${anexoId}::uuid limit 1
    `);
    return rows[0] ?? null;
  });
  if (!linha) throw ErroPipe.naoEncontrado('Anexo');

  // Cinto e suspensório: a chave gravada tem de estar na faixa do tenant dela.
  if (!chaveDoTenant(linha.chave_storage, dono.tenantId)) {
    throw ErroPipe.naoEncontrado('Anexo');
  }

  const objeto = await armazenamento().ler(linha.chave_storage);
  if (!objeto) throw ErroPipe.naoEncontrado('Anexo');

  return {
    dados: objeto.dados,
    mime: linha.mime,
    nomeOriginal: linha.nome_original,
    comoAnexo: servirComoAnexo(linha.mime),
  };
}

function mb(bytes: number): string {
  return (bytes / 1_048_576).toFixed(0);
}
