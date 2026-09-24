import { registrarAuditoria } from '@pipe/db';
import { noTenant } from '../../banco.js';
import { ErroPipe } from '../../erros.js';
import { atualizarCanal, lerCanalWhatsApp } from './canal.js';
import type { CanalWhatsApp } from './canal.js';

// A régua mora no worker, que é quem monta a mensagem; aqui só se reexporta.
export { formatoDaPergunta, LIMITE_MENU, LIMITE_QUICK_REPLY } from '@pipe/workers/whatsapp';

/**
 * As abas "Configurações" e "Configurações de alerta" do canal WhatsApp na Blip
 * (`referencias-blip/fichas/FICHA-canal-whatsapp.md` §3 e §4). Nada disto é
 * campo da Meta: são escolhas do Pipe guardadas no `config` do canal.
 *
 * - **Quick reply**: pergunta com até 3 opções sai como botões; com 4 ou mais,
 *   continua em texto numerado.
 * - **Menu**: até 10 opções saem como lista; com 11 ou mais, texto.
 * - **Alerta de recategorização de modelos**: quando a Meta muda a categoria de
 *   um modelo, avisa estes e-mails; lista vazia = todos os administradores.
 *
 * Os dois interruptores nascem ligados, que é o estado observado na origem.
 */

const LIMITE_EMAILS = 20;

export interface PreferenciasDoCanal {
  quickReply: boolean;
  menu: boolean;
  alertaRecategorizacao: { ativo: boolean; emails: string[] };
}

export function preferenciasDe(canal: { config: Record<string, unknown> }): PreferenciasDoCanal {
  const guardado = (canal.config['preferencias'] ?? {}) as Partial<PreferenciasDoCanal>;
  return {
    quickReply: guardado.quickReply ?? true,
    menu: guardado.menu ?? true,
    alertaRecategorizacao: {
      ativo: guardado.alertaRecategorizacao?.ativo ?? true,
      emails: guardado.alertaRecategorizacao?.emails ?? [],
    },
  };
}

export interface PedidoDePreferencias {
  quickReply?: boolean;
  menu?: boolean;
  alertaRecategorizacao?: { ativo?: boolean; emails?: string[] | string };
}

function recusa(campo: string, mensagem: string): ErroPipe {
  return new ErroPipe(422, 'preferencias_invalidas', mensagem, { campo });
}

/** A tela manda "separados por vírgula"; a API aceita a lista pronta também. */
function emailsDe(bruto: string[] | string): string[] {
  const lista = (Array.isArray(bruto) ? bruto : bruto.split(','))
    .map((e) => String(e).trim().toLowerCase())
    .filter(Boolean);
  const unicos = [...new Set(lista)];
  if (unicos.length > LIMITE_EMAILS) throw recusa('emails', `São no máximo ${LIMITE_EMAILS} e-mails.`);
  const invalido = unicos.find((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  if (invalido) throw recusa('emails', `E-mail inválido: ${invalido}`);
  return unicos;
}

export function aplicarPedido(atual: PreferenciasDoCanal, pedido: PedidoDePreferencias): PreferenciasDoCanal {
  const booleano = (valor: unknown, campo: string): boolean | undefined => {
    if (valor === undefined) return undefined;
    if (typeof valor !== 'boolean') throw recusa(campo, 'Use ligado ou desligado.');
    return valor;
  };
  const alerta = pedido.alertaRecategorizacao;
  return {
    quickReply: booleano(pedido.quickReply, 'quickReply') ?? atual.quickReply,
    menu: booleano(pedido.menu, 'menu') ?? atual.menu,
    alertaRecategorizacao: {
      ativo: booleano(alerta?.ativo, 'ativo') ?? atual.alertaRecategorizacao.ativo,
      emails: alerta?.emails === undefined ? atual.alertaRecategorizacao.emails : emailsDe(alerta.emails),
    },
  };
}

export async function lerPreferencias(tenantId: string, canalId: string): Promise<PreferenciasDoCanal> {
  return preferenciasDe(await lerCanalWhatsApp(tenantId, canalId));
}

export async function gravarPreferencias(
  tenantId: string,
  usuarioId: string,
  canalId: string,
  pedido: PedidoDePreferencias,
): Promise<PreferenciasDoCanal> {
  const canal: CanalWhatsApp = await lerCanalWhatsApp(tenantId, canalId);
  const antes = preferenciasDe(canal);
  const depois = aplicarPedido(antes, pedido ?? {});
  await atualizarCanal(canal, { preferencias: depois });
  await noTenant(tenantId, (tx) =>
    registrarAuditoria(tx, tenantId, {
      ator: { tipo: 'usuario', id: usuarioId },
      acao: 'alterou',
      objetoTipo: 'canal',
      objetoId: canal.id,
      antes: { preferencias: antes },
      depois: { preferencias: depois },
    }),
  );
  return depois;
}
