/**
 * O que está configurado no tenant: o retrato, e o que o muda.
 *
 * A leitura era somente leitura porque a edição exige log de auditoria com
 * autor, valor anterior e horário, e configurar sem rastro é passivo. O log
 * chegou (`registrarAuditoria` do `@pipe/db`), então a segunda metade deste
 * arquivo escreve — sempre na MESMA transação da mudança, que é o que impede o
 * log de mentir quando a alteração falha ou é desfeita.
 *
 * Nada aqui sabe que o Next existe: sem `revalidatePath`, sem JSX. Recebe
 * parâmetro, devolve dado. É o que faz virar endpoint da `apps/api` por
 * movimentação e não por reescrita (README, "Quem fala com o banco").
 */

export interface RegraSlaConfigurada {
  id: string;
  nome: string;
  alvo: string;
  prazoSeg: number;
  alertaSeg: number | null;
  scopeType: string;
  scopeName: string | null;
  active: boolean;
}

export interface QueueConfigured {
  id: string;
  nome: string;
  capacityDefault: number;
  order: number;
  temHorario: boolean;
  active: boolean;
}

/** Rótulos do banco em português corrente. O alvo é enum, não texto livre. */
export const ROTULO_ALVO: Record<string, string> = {
  firstResponse: 'Primeira resposta',
  resposta: 'Tempo de resposta',
  resolution: 'Encerramento',
  waitQueue: 'Espera na fila',
};

export const LABEL_SCOPE: Record<string, string> = {
  tenant: 'Toda a operação',
  queue: 'Fila',
};

/*
 * `carregarOperacao` foi embora com a tela `/configuracoes/operacao`. Ela lia
 * duas coisas: o quadro de atendentes, que virou `carregarAtendentes` em
 * `cadastros.ts` com as colunas de fila e de teto que faltavam; e uma cópia
 * só-leitura dos motivos de pausa, que já têm tela com formulário em
 * `/atendentes/pausas`.
 */

export interface EtiquetaConfigurada {
  id: string;
  nome: string;
  scope: string;
  requiredInClosure: boolean;
  usos: number;
}

export interface ChannelConfigured {
  id: string;
  nome: string;
  tipo: string;
  ativo: boolean;
}

/**
 * O módulo Canais, que na barra deles é módulo e aqui estava diluído em
 * Preferências ├ Dados.
 *
 * A caixa de entrada aparece junto porque é ela, e não o canal, que carrega a
 * fila padrão: canal é a conexão com a operadora, caixa é para onde a conversa
 * daquela conexão cai. Confundir os dois é o que faz alguém procurar a fila
 * padrão na tela do WhatsApp e não achar.
 *
 * A contagem é de conversas ABERTAS, não do total histórico: o que interessa
 * ao olhar um canal é se ele está entregando agora.
 */
export interface ChannelBox {
  id: string;
  nome: string;
  queueDefault: string | null;
  abertas: number;
}

export interface ChannelDetailed extends ChannelConfigured {
  criadoEm: string;
  caixas: ChannelBox[];
}

/* ============================================ Preferências ├ Configurações gerais
   A segunda lacuna que `estrutura-gestao.tsx` registrava. Diferente de tudo
   acima, aqui a leitura alimenta um formulário que ESCREVE. O que não tem
   cartão de configuração continua somente leitura.

   Um cartão por configuração, e cada um salva sozinho
   (`blip-telas-cadastro.md` §3): "em Configurações gerais não há um botão
   Salvar da tela". */

export interface TenantIdentity {
  nome: string;
  fuso: string;
  idioma: string;
  plano: string;
}

export interface PesquisaConfigurada {
  id: string;
  tipo: string;
  escalaMin: number;
  escalaMax: number;
  pergunta: string;
  disparo: string;
  active: boolean;
}

export interface ClosureTag {
  id: string;
  nome: string;
  obrigatoria: boolean;
  usos: number;
}

export interface SettingsGeneral {
  identity: TenantIdentity;
  /** A pesquisa ativa do tenant, ou `null` quando ninguém configurou nenhuma. */
  pesquisa: PesquisaConfigurada | null;
  /** Quantas pesquisas existem além dessa — a §6 exige uma escala por pesquisa. */
  outrasPesquisas: number;
  etiquetas: ClosureTag[];
}

/* ------------------------------------------------- escrita das configurações
   O que muda o tenant mora aqui, e não na Server Action: front é front, banco é
   da `api` (README, "Quem fala com o banco"). Cada função recebe parâmetro,
   devolve dado, e grava a auditoria na MESMA transação — `registrarAuditoria`
   do `@pipe/db` recebe a `tx` justamente para que log e dado nunca discordem.

   `diferenca` guarda só o que mudou: quem lê o log quer saber que o fuso foi de
   São Paulo para Manaus, não reler as colunas que continuaram iguais. */

export type Recording = { ok: true } | { ok: false; error: string };

/* `type` e não `interface`: só o alias ganha índice implícito, e é isso que
   deixa `diferenca` — que recebe `Record<string, unknown>` — aceitar o objeto. */
export type IdentityForSave = {
  nome: string;
  fuso: string;
  idioma: string;
};

export interface PesquisaParaGravar {
  /** Vazio cria; preenchido altera a pesquisa existente. */
  id: string;
  tipo: string;
  escalaMin: number;
  escalaMax: number;
  pergunta: string;
  disparo: string;
  active: boolean;
}
