import type { CanalDoFluxo } from '@pipe/contracts';

/**
 * O canal DO BOT — regras PURAS do lado da tela (`fluxo/canais/**`), sem
 * `./api` de propósito, para `tests/canal-do-fluxo.test.ts` rodar sem
 * `import.meta.env`.
 *
 * A origem (`FICHA-conectar-canal-no-bot.md` §1) tem UMA página por canal
 * dentro do bot; o cartão da lista só decide entre "Conectar" e "Conectado" e
 * leva à mesma página. Aqui fica o que decide isso e o que a página oferece.
 */

/** Os canais que a Pipe tem página própria — os mesmos `tipo` de `canal.tipo`. */
export type TipoDeCanalDoBot = 'whatsapp_cloud' | 'instagram' | 'messenger';

/** O segmento da URL de cada canal: `/{tipo}/{id}/canais/{segmento}` (o `/whatsapp-embedded` da origem vira `/whatsapp`). */
export const SEGMENTO_DO_CANAL: Readonly<Record<TipoDeCanalDoBot, string>> = {
  whatsapp_cloud: 'whatsapp',
  instagram: 'instagram',
  messenger: 'messenger',
};

export function rotaDoCanal(base: string, tipo: TipoDeCanalDoBot): string {
  return `${base}/canais/${SEGMENTO_DO_CANAL[tipo]}`;
}

/**
 * O estado que a página do canal desenha para ESTE bot:
 * - `conectado`: o bot está com um canal ativo deste tipo (o `VERIFIED` da origem);
 * - `nao_conectado`: o bot não tem canal (o `LOGIN` da origem);
 * - `outro_canal`: o bot já está com um canal de OUTRO tipo — decisão Pipe,
 *   porque `fluxo.canal_id` é uma coluna só (na origem um bot tem vários).
 */
export type EstadoDoCanalNoBot =
  | { estado: 'conectado'; canal: CanalDoFluxo }
  | { estado: 'nao_conectado' }
  | { estado: 'outro_canal'; canal: CanalDoFluxo };

export function estadoDoCanalNoBot(
  canal: CanalDoFluxo | null,
  tipo: TipoDeCanalDoBot,
): EstadoDoCanalNoBot {
  if (!canal) return { estado: 'nao_conectado' };
  if (canal.tipo !== tipo) return { estado: 'outro_canal', canal };
  if (!canal.ativo) return { estado: 'nao_conectado' };
  return { estado: 'conectado', canal };
}

/** O cartão da lista: "Conectado" quando o bot está com um canal ATIVO deste tipo. */
export function cartaoConectado(
  contato: { canalTipo: string | null; canalAtivo: boolean | null },
  tipo: string,
): boolean {
  return contato.canalAtivo === true && contato.canalTipo === tipo;
}

/**
 * O que a etapa "Ativação do número" oferece (decisão Pipe — na origem o número
 * nasce no bot e não há lista): os canais ATIVOS deste tipo que estão livres
 * (sem bot vivo), e os que já estão com outro bot, para a tela dizer qual — a
 * origem manda "remover do anterior", e a tela aponta onde.
 */
export function canaisParaOferecer(
  disponiveis: readonly CanalDoFluxo[],
  tipo: TipoDeCanalDoBot,
  fluxoId: string,
): { livres: CanalDoFluxo[]; emUso: CanalDoFluxo[] } {
  const doTipo = disponiveis.filter((c) => c.tipo === tipo && c.ativo);
  return {
    livres: doTipo.filter((c) => c.fluxoId === null || c.fluxoId === fluxoId),
    emUso: doTipo.filter((c) => c.fluxoId !== null && c.fluxoId !== fluxoId),
  };
}

/** O rótulo de um canal na lista: o número (ou `@usuário`, ou o id da Página) e, sem ele, o nome. */
export function rotuloDoCanal(canal: Pick<CanalDoFluxo, 'nome' | 'numero'>): string {
  return canal.numero ? `${canal.numero} — ${canal.nome}` : canal.nome;
}

/** Só dígitos, para o `https://wa.me/{numero}` do "Testar no WhatsApp". */
export function numeroParaWaMe(numero: string | null): string {
  return (numero ?? '').replace(/\D/g, '');
}

/**
 * O botão "Desconectar {canal}" do modal de desconexão da origem só habilita
 * com o motivo preenchido E a concordância marcada (`class H`, portal.js
 * 120544: `disconnectButtonDisabled = !agreedChecked || !motiveInputValue`).
 */
export function podeConfirmarDesconexao(motivo: string, concordou: boolean): boolean {
  return concordou && motivo.trim().length > 0;
}
