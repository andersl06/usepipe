import { ErroPipe } from '../../erros.js';
import { lerCanalWhatsApp, pedirReautorizacao, texto } from './canal.js';
import type { CanalWhatsApp } from './canal.js';
import { configurarWebhooksDoCanal } from './configuracao-de-webhook.js';
import { criarCanal } from './criacao-de-canal.js';
import { buscarInfoDoNumero } from './info-do-numero.js';
import { reautorizar } from './reautorizacao.js';
import { buscarSaude, numeroPendente } from './saude.js';
import { trocarCodigo } from './troca-de-token.js';

/**
 * Portado de chatwoot/chatwoot (MIT), app/services/whatsapp/embedded_signup_service.rb
 *
 * O que acontece depois que o cliente fecha o popup da Meta, na ordem do original:
 *
 * 1. troca o `code` pelo token do cliente (`troca-de-token.ts`);
 * 2. descobre o número dentro da WABA (`info-do-numero.ts`);
 * 3. cria o canal, ou reautoriza o existente quando vem `canalId`;
 * 4. registra o número e aponta o webhook (`configuracao-de-webhook.ts`) — falha
 *    aqui marca o canal para reautorização em vez de desfazê-lo;
 * 5. confere a saúde do número recém-criado e marca para reautorização se a Meta
 *    ainda o dá como pendente. Pula na reautorização (evita alarme falso) e na
 *    coexistência (a saúde da Meta demora minutos para acompanhar).
 *
 * O `state` contra CSRF não é deste serviço: é conferido antes, no controlador
 * (`estado-de-conexao.ts`), e é acréscimo do Pipe — o original não tem.
 */

export interface PedidoDeCadastroEmbutido {
  tenantId: string;
  usuarioId: string;
  codigo?: string | undefined;
  wabaId?: string | undefined;
  numeroId?: string | undefined;
  coexistencia?: boolean | undefined;
  /** O `inbox_id` do original: presente, é reautorização daquele canal. */
  canalId?: string | undefined;
}

/** `validate_parameters!` do serviço e `validate_embedded_signup_params!` do controlador. */
export function validarParametros(pedido: { codigo?: string | undefined; wabaId?: string | undefined }): void {
  const ausentes: string[] = [];
  if (!pedido.codigo?.trim()) ausentes.push('code');
  if (!pedido.wabaId?.trim()) ausentes.push('waba_id');
  if (ausentes.length === 0) return;
  throw ErroPipe.requisicao(
    'parametros_ausentes',
    `Parâmetros obrigatórios ausentes: ${ausentes.join(', ')}`,
  );
}

export async function executarCadastroEmbutido(
  pedido: PedidoDeCadastroEmbutido,
): Promise<CanalWhatsApp> {
  try {
    validarParametros(pedido);
    const wabaId = pedido.wabaId!.trim();
    const coexistencia = pedido.coexistencia === true;

    const token = await trocarCodigo(pedido.codigo);

    const reautorizando = pedido.canalId
      ? await lerCanalWhatsApp(pedido.tenantId, pedido.canalId)
      : null;
    const info = await buscarInfoDoNumero(
      wabaId,
      pedido.numeroId || undefined,
      token,
      reautorizando ? texto(reautorizando.config['numero']) : null,
    );

    const canal = pedido.canalId
      ? await reautorizar({
          tenantId: pedido.tenantId,
          canalId: pedido.canalId,
          numeroId: pedido.numeroId,
          wabaId,
          token,
          info,
        })
      : await criarCanal({
          tenantId: pedido.tenantId,
          usuarioId: pedido.usuarioId,
          infoDaWaba: { wabaId, nomeDaEmpresa: info.nomeDaEmpresa },
          infoDoNumero: info,
          token,
        });

    const configurado = await configurarWebhooksDoCanal(canal, coexistencia);
    if (!pedido.canalId && !coexistencia) await conferirSaude(configurado);

    return lerCanalWhatsApp(pedido.tenantId, canal.id);
  } catch (erro) {
    console.error(`[whatsapp] o cadastro embutido falhou: ${(erro as Error).message}`);
    throw erro;
  }
}

/** `check_channel_health_and_prompt_reauth`. Falha da checagem só vai para o log. */
async function conferirSaude(canal: CanalWhatsApp): Promise<void> {
  try {
    const saude = await buscarSaude({
      tokenAcesso: texto(canal.config['tokenAcesso']),
      numeroId: texto(canal.config['phoneNumberId']),
      wabaId: canal.wabaId,
    });
    if (numeroPendente(saude)) await pedirReautorizacao(canal);
  } catch (erro) {
    console.error(`[whatsapp] a checagem de saúde do canal ${canal.id} falhou: ${(erro as Error).message}`);
  }
}
