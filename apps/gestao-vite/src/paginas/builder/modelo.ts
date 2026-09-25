import type { ConditionBlip } from '@pipe/core';
import { VARIABLE_OF_FORWARDING } from '@pipe/core';
import type { DesenhoDoBuilder } from '@pipe/contracts';

/**
 * O desenho do Builder como a TELA o segura: o mapa de blocos no formato do
 * editor da Blip (`{ <id>: estado }` com `$contentActions`, `$conditionOutputs`,
 * `$defaultOutput`…), que é o que `GET /v1/gestao/fluxos/:id/builder` devolve e o
 * que `PUT` recebe de volta — o `ExportDoEditor` de `@pipe/core`, com `flow`
 * chamado de `fluxo` e `globalActions` de `globais` (`DesenhoDoBuilder`).
 *
 * Tudo aqui é função pura sobre esse mapa: criar, renomear, mover, duplicar,
 * excluir bloco; ligar e desligar dois blocos; e montar o que vai no `PUT`. Os
 * componentes só chamam e guardam o resultado. Nada muda o mapa recebido —
 * cada gesto devolve um mapa novo, que é o que o desfazer/refazer empilha.
 *
 * As regras copiadas do editor da Blip (`portal.js`, `BuilderStateService` e
 * os `bind` do jsPlumb em `setConectionsListeners`):
 * - bloco novo nasce com uma "Entrada do usuário" (sem bypass), título "Novo
 *   bloco" e saída padrão para o bloco `fallback` (quando existe);
 * - o bloco "Humano" é o `desk:<uuid>` versão 3.0.0: `ForwardToDesk` na
 *   entrada, `LeavingFromDesk` depois da troca de estado, a entrada espera
 *   `desk_forwardToDeskState_status = Success` e as três "Saídas de
 *   atendimento" nascem sem destino;
 * - arrastar da saída de um bloco a outro cria UMA condição de saída nova
 *   (sem condição) para o destino; já existe uma para o mesmo destino → nada
 *   (o editor apaga a seta repetida); 25 é o limite;
 * - apagar a seta apaga a PRIMEIRA condição de saída para aquele destino —
 *   nas "Saídas de atendimento" só o destino é esvaziado, a saída fica;
 * - a saída padrão não é desenhada ("A seta que liga os blocos não será
 *   exibida");
 * - Início (raiz), `fallback` e `end` não se excluem ("Não é possível
 *   deletar este estado").
 */

/* ----------------------------------------------------------------- tipos */

export interface AcaoDoEditor {
  $id?: string;
  $title?: string;
  type: string;
  settings?: Record<string, unknown>;
  conditions?: ConditionBlip[];
  [extensao: string]: unknown;
}

export interface InboundValidation {
  rule: string;
  regex?: string | null;
  type?: string | null;
  error?: string | null;
}

export interface EditorInbound {
  bypass?: boolean;
  variable?: string | null;
  validation?: InboundValidation | null;
  conditions?: ConditionBlip[];
  expiration?: string | null;
  [extensao: string]: unknown;
}

export interface ItemDeConteudo {
  action?: AcaoDoEditor;
  input?: EditorInbound;
  [extensao: string]: unknown;
}

export interface SaidaDoEditor {
  $id?: string;
  stateId?: string;
  typeOfStateId?: string;
  conditions?: ConditionBlip[];
  $isDeskOutput?: boolean;
  $isDeskDefaultOutput?: boolean;
  [extensao: string]: unknown;
}

export interface Block {
  id: string;
  root?: boolean;
  $title?: string;
  $position?: { top?: string; left?: string };
  $tags?: unknown[];
  $contentActions?: ItemDeConteudo[];
  $conditionOutputs?: SaidaDoEditor[];
  $defaultOutput?: { stateId?: string; [extensao: string]: unknown } | null;
  $enteringCustomActions?: AcaoDoEditor[];
  $leavingCustomActions?: AcaoDoEditor[];
  $afterStateChangedActions?: AcaoDoEditor[];
  deskStateVersion?: string;
  [extensao: string]: unknown;
}

export type Mapa = Record<string, Block>;

export interface Position {
  top: number;
  left: number;
}

/** Uma seta do canvas: de um bloco a outro. */
export interface Aresta {
  de: string;
  para: string;
}

/* ------------------------------------------------------------- constantes */

export const TITULO_PADRAO = 'Novo bloco';
export const TITULO_OF_ATTENDANCE = 'Atendimento humano';
export const ROTULO_OF_INBOUND = 'Entrada do usuário';
export const LIMITE_DE_SAIDAS = 25;
export const ID_DO_FALLBACK = 'fallback';
export const ID_DO_FIM = 'end';
export const PREFIX_OF_ATTENDANCE = 'desk:';
export const VERSION_OF_BLOCK_OF_ATTENDANCE = '3.0.0';

export const MESSAGES = {
  limiteDeSaidas: 'Limite de 25 condições de saída atingidos',
  naoExclui: 'Não é possível deletar este estado',
  fimNaoLiga: "Um bloco de 'Fim' não se conecta com um próximo bloco. Ele deve ser sempre o último.",
} as const;

/** O `Ticket` que o Desk devolve ao bloco de atendimento quando o atendimento acaba. */
const TIPO_DO_TICKET = 'application/vnd.iris.ticket+json';

/** As três "Saídas de atendimento" do bloco `desk:`, na ordem do editor. */
export const OUTPUTS_OF_ATTENDANCE = [
  { status: 'ClosedAttendant', rotulo: 'ticket finalizado pelo atendente' },
  { status: 'ClosedClient', rotulo: 'ticket finalizado pelo cliente' },
  { status: 'ClosedClientInactivity', rotulo: 'ticket finalizado por inatividade do cliente' },
] as const;

/* -------------------------------------------------------------- utilidades */

export const gerarId = (): string => crypto.randomUUID();

const copiar = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Formato privado para copiar blocos entre pontos do mesmo Builder. */
const MARCADOR_DE_AREA_DE_TRANSFERENCIA = 'pipe-builder:block/v1:';

export const ehAttendance = (id: string): boolean => id.startsWith(PREFIX_OF_ATTENDANCE);

const px = (value: string | undefined, padrao: number): number => {
  const n = Number.parseFloat(value ?? '');
  return Number.isFinite(n) ? n : padrao;
};

export function positionOf(block: Block): Position {
  return { top: px(block.$position?.top, 40), left: px(block.$position?.left, 40) };
}

/** O editor da Blip nunca deixa um bloco em coordenada negativa (`checkNegative`). */
export function positionAsText(position: Position): { top: string; left: string } {
  return {
    top: `${Math.max(0, Math.round(position.top))}px`,
    left: `${Math.max(0, Math.round(position.left))}px`,
  };
}

/** A raiz do desenho, se houver uma só. */
export function raizDe(mapa: Mapa): Block | null {
  const raizes = Object.values(mapa).filter((b) => b.root);
  return raizes.length === 1 ? raizes[0]! : null;
}

/** A entrada de um bloco (o item `input` de `$contentActions`), se houver. */
export function inboundOf(block: Block): EditorInbound | null {
  return block.$contentActions?.find((c) => c.input)?.input ?? null;
}

/* ---------------------------------------------------------- ler e montar */

/** O que veio do `GET`, com a garantia de que cada bloco carrega o próprio id. */
/**
 * Onde o primeiro bloco sem posição cai, e o passo entre eles. O `left` começa
 * longe da borda porque a barra de ferramentas do canvas mora lá — bloco em 40
 * nasce escondido atrás dela.
 */
const ARRANJO = { left: 160, top: 96, passoX: 300, passoY: 180, porLinha: 4 } as const;

/**
 * Fluxo que nunca passou por este editor (importado, ou publicado por outro
 * caminho) vem com `$position` vazio em todo bloco, e todos nasceriam empilhados
 * no mesmo ponto. Quem não tem posição ganha uma, em grade, na ordem do mapa.
 */
function arranjarWithoutPosition(mapa: Mapa): void {
  const withoutPosition = Object.values(mapa).filter((b) => !b.$position?.top && !b.$position?.left);
  withoutPosition.forEach((block, i) => {
    block.$position = positionAsText({
      left: ARRANJO.left + (i % ARRANJO.porLinha) * ARRANJO.passoX,
      top: ARRANJO.top + Math.floor(i / ARRANJO.porLinha) * ARRANJO.passoY,
    });
  });
}

export function lerDesenho(desenho: DesenhoDoBuilder): Mapa {
  const mapa: Mapa = {};
  for (const [codigo, bruto] of Object.entries(desenho.flow)) {
    if (!bruto || typeof bruto !== 'object') continue;
    const block = copiar(bruto) as Block;
    if (typeof block.id !== 'string' || !block.id) block.id = codigo;
    mapa[codigo] = block;
  }
  arranjarWithoutPosition(mapa);
  return mapa;
}

/**
 * O que vai no `PUT /v1/gestao/fluxos/:id/builder`: o mapa de blocos como
 * está — o formato do editor É o que a `api` guarda em `bloco.conteudo.original`
 * — mais as ações globais. Só a chave do mapa é conferida contra o `id`, para
 * um bloco renomeado por fora nunca sair com dois nomes.
 */
export function montarDesenho(mapa: Mapa, global: Record<string, unknown>): DesenhoDoBuilder {
  const flow: Record<string, unknown> = {};
  for (const block of Object.values(mapa)) flow[block.id] = copiar(block);
  return { flow, globals: copiar(global) };
}

/* ------------------------------------------------------------- os blocos */

/** O cartão que o editor desenha para uma fala ou uma entrada. */
export function card(id: string, tipo: string, conteudo: unknown, lado: 'left' | 'right') {
  return {
    document: { id, type: tipo, content: conteudo },
    editable: true,
    deletable: true,
    position: lado,
    editing: false,
  };
}

/** A "Entrada do usuário" que todo bloco novo traz. */
export function newInbound(id = gerarId()): ItemDeConteudo {
  return {
    input: {
      bypass: false,
      $cardContent: card(id, 'text/plain', ROTULO_OF_INBOUND, 'right'),
      $invalid: false,
    },
    $invalid: false,
  };
}

function esqueleto(id: string, titulo: string, position: Position): Block {
  return {
    id,
    root: false,
    $title: titulo,
    $position: positionAsText(position),
    $tags: [],
    $contentActions: [],
    $conditionOutputs: [],
    $enteringCustomActions: [],
    $leavingCustomActions: [],
    $inputSuggestions: [],
    $defaultOutput: null,
    $invalidContentActions: false,
    $invalidOutputs: false,
    $invalidCustomActions: false,
    $invalid: false,
  };
}

/** A saída padrão de bloco novo: `fallback`, como no editor — se houver um. */
function saidaPadraoInicial(mapa: Mapa): Block['$defaultOutput'] {
  return mapa[ID_DO_FALLBACK] ? { stateId: ID_DO_FALLBACK, $invalid: false } : null;
}

/** "Padrão" do menu NOVO BLOCO (`createContentState`). */
export function newBlock(mapa: Mapa, position: Position, id = gerarId()): Block {
  return {
    ...esqueleto(id, TITULO_PADRAO, position),
    $contentActions: [newInbound(`${id}-entrada`)],
    $defaultOutput: saidaPadraoInicial(mapa),
  };
}

/** "Humano" do menu NOVO BLOCO (`createDeskStateWithForwardAndLeaving`). */
export function attendanceNewBlock(mapa: Mapa, position: Position, id = gerarId()): Block {
  const codigo = `${PREFIX_OF_ATTENDANCE}${id}`;
  const attendanceOutputs: SaidaDoEditor[] = OUTPUTS_OF_ATTENDANCE.map((s) => ({
    $id: `${id}-${s.status}`,
    $isDeskOutput: true,
    conditions: [
      { source: 'context', variable: 'input.type', comparison: 'equals', values: [TIPO_DO_TICKET] },
      { source: 'context', variable: 'input.content@status', comparison: 'equals', values: [s.status] },
    ],
  }));
  attendanceOutputs.push({
    $id: `${id}-erro`,
    $isDeskOutput: true,
    $isDeskDefaultOutput: true,
    conditions: [
      { source: 'context', variable: VARIABLE_OF_FORWARDING, comparison: 'equals', values: ['Error'] },
    ],
    ...(mapa[ID_DO_FALLBACK] ? { stateId: ID_DO_FALLBACK } : {}),
    $invalid: false,
  });
  const inbound = newInbound(`${id}-entrada`);
  inbound.input!.conditions = [
    { source: 'context', variable: VARIABLE_OF_FORWARDING, comparison: 'equals', values: ['Success'] },
  ];
  return {
    ...esqueleto(codigo, TITULO_OF_ATTENDANCE, position),
    deskStateVersion: VERSION_OF_BLOCK_OF_ATTENDANCE,
    $contentActions: [inbound],
    $enteringCustomActions: [{ $id: `${id}-forward`, type: 'ForwardToDesk', settings: {}, conditions: [] }],
    $afterStateChangedActions: [
      { $id: `${id}-leaving`, type: 'LeavingFromDesk', settings: {}, conditions: [] },
    ],
    $conditionOutputs: attendanceOutputs,
    // Encerrado o atendimento, a conversa volta a este mesmo bloco por padrão.
    $defaultOutput: { stateId: codigo, $invalid: false },
  };
}

export function addBlock(mapa: Mapa, block: Block): Mapa {
  return { ...mapa, [block.id]: block };
}

export function renomearBlock(mapa: Mapa, id: string, titulo: string): Mapa {
  const block = mapa[id];
  if (!block) return mapa;
  return { ...mapa, [id]: { ...block, $title: titulo } };
}

export function moverBlock(mapa: Mapa, id: string, position: Position): Mapa {
  const block = mapa[id];
  if (!block) return mapa;
  return { ...mapa, [id]: { ...block, $position: positionAsText(position) } };
}

/** Troca o bloco inteiro — é o que o painel faz ao editar conteúdo, ações e saídas. */
export function substituirBlock(mapa: Mapa, block: Block): Mapa {
  return { ...mapa, [block.id]: block };
}

/** "Duplicar" do menu de contexto: cópia com id novo, "[Cópia]" no título, 20px ao lado. */
function blockCopia(origem: Block, position: Position, novoId = gerarId()): Block {
  const copia = copiar(origem);
  copia.id = ehAttendance(origem.id) ? `${PREFIX_OF_ATTENDANCE}${novoId}` : novoId;
  copia.root = false;
  copia.$title = `${origem.$title ?? TITULO_PADRAO} [Cópia]`;
  copia.$position = positionAsText(position);
  for (const saida of copia.$conditionOutputs ?? []) {
    delete saida.$id;
    delete saida.$connId;
    if (saida.stateId === origem.id) saida.stateId = copia.id;
  }
  if (copia.$defaultOutput?.stateId === origem.id) {
    copia.$defaultOutput = { ...copia.$defaultOutput, stateId: copia.id };
  }
  return copia;
}

/** "Duplicar" conserva o deslocamento curto que o editor mostra ao lado do original. */
export function duplicarBlock(mapa: Mapa, id: string, novoId = gerarId()): Mapa {
  const origem = mapa[id];
  if (!origem) return mapa;
  const position = positionOf(origem);
  const copia = blockCopia(origem, { top: position.top + 20, left: position.left + 20 }, novoId);
  return { ...mapa, [copia.id]: copia };
}

export function copiedBlockText(block: Block): string {
  return `${MARCADOR_DE_AREA_DE_TRANSFERENCIA}${JSON.stringify(block)}`;
}

export function copiedTextBlock(texto: string): Block | null {
  if (!texto.startsWith(MARCADOR_DE_AREA_DE_TRANSFERENCIA)) return null;
  try {
    const value: unknown = JSON.parse(texto.slice(MARCADOR_DE_AREA_DE_TRANSFERENCIA.length));
    if (!value || typeof value !== 'object' || typeof (value as Block).id !== 'string') return null;
    return copiar(value as Block);
  } catch {
    return null;
  }
}

/** "Colar" cria uma cópia na posição do clique e nunca sobrescreve o original. */
export function colarBlock(mapa: Mapa, origem: Block, position: Position, novoId = gerarId()): Mapa {
  const copia = blockCopia(origem, position, novoId);
  return { ...mapa, [copia.id]: copia };
}

/** Início, Exceções e Fim não saem — como no editor. */
export function podeExcluir(mapa: Mapa, id: string): boolean {
  const block = mapa[id];
  if (!block) return false;
  return !block.root && id !== ID_DO_FALLBACK && id !== ID_DO_FIM;
}

/**
 * Exclui o bloco e o que apontava para ele: condição de saída comum some,
 * "Saída de atendimento" fica sem destino, saída padrão fica vazia.
 */
export function excluirBlock(mapa: Mapa, id: string): Mapa {
  if (!podeExcluir(mapa, id)) return mapa;
  const novo: Mapa = {};
  for (const block of Object.values(mapa)) {
    if (block.id === id) continue;
    novo[block.id] = desligarDe(block, id, true);
  }
  return novo;
}

/* -------------------------------------------------------------- as setas */

/** A saída sem o destino — o que o editor faz com uma "Saída de atendimento" desligada. */
export function withoutDestination(saida: SaidaDoEditor): SaidaDoEditor {
  const resto = { ...saida };
  delete resto.stateId;
  return resto;
}

/** As setas a desenhar: uma por par (origem, destino), só de saída com destino existente. */
export function arestasDe(mapa: Mapa): Aresta[] {
  const vistas = new Set<string>();
  const arestas: Aresta[] = [];
  for (const block of Object.values(mapa)) {
    for (const saida of block.$conditionOutputs ?? []) {
      if (!saida.stateId || saida.$isDeskDefaultOutput || !mapa[saida.stateId]) continue;
      const key = `${block.id}\u0000${saida.stateId}`;
      if (vistas.has(key)) continue;
      vistas.add(key);
      arestas.push({ de: block.id, para: saida.stateId });
    }
  }
  return arestas;
}

export type ConnectionResult = { ok: true; mapa: Mapa } | { ok: false; error: string };

/** Arrastou da saída de `de` até `para`: nasce uma condição de saída nova para `para`. */
export function ligar(mapa: Mapa, de: string, para: string, id = gerarId()): ConnectionResult {
  const origem = mapa[de];
  if (!origem || !mapa[para]) return { ok: false, error: 'Bloco não encontrado.' };
  if (de === ID_DO_FIM) return { ok: false, error: MESSAGES.fimNaoLiga };
  const saidas = origem.$conditionOutputs ?? [];
  if (saidas.some((s) => s.stateId === para)) return { ok: true, mapa };
  if (saidas.length >= LIMITE_DE_SAIDAS) return { ok: false, error: MESSAGES.limiteDeSaidas };
  const nova: SaidaDoEditor = {
    $id: id,
    stateId: para,
    typeOfStateId: 'state',
    conditions: [],
    $invalid: false,
  };
  return { ok: true, mapa: { ...mapa, [de]: { ...origem, $conditionOutputs: [...saidas, nova] } } };
}

/**
 * A primeira saída de `bloco` para `alvo` perde a ligação: saída de atendimento
 * fica sem destino, as outras somem. Com `tudo`, TODAS as saídas para `alvo`
 * (é o que excluir o bloco de destino precisa).
 */
function desligarDe(block: Block, alvo: string, tudo: boolean): Block {
  const saidas = block.$conditionOutputs ?? [];
  const padrao = block.$defaultOutput?.stateId === alvo;
  if (!saidas.some((s) => s.stateId === alvo) && !(tudo && padrao)) return block;
  let feito = false;
  const restantes: SaidaDoEditor[] = [];
  for (const saida of saidas) {
    if (saida.stateId !== alvo || (feito && !tudo)) {
      restantes.push(saida);
      continue;
    }
    feito = true;
    if (saida.$isDeskOutput) restantes.push(withoutDestination(saida));
  }
  return {
    ...block,
    $conditionOutputs: restantes,
    ...(tudo && padrao ? { $defaultOutput: null } : {}),
  };
}

/** Apagou a seta de `de` para `para`. */
export function desligar(mapa: Mapa, de: string, para: string): Mapa {
  const origem = mapa[de];
  if (!origem) return mapa;
  return { ...mapa, [de]: desligarDe(origem, para, false) };
}
