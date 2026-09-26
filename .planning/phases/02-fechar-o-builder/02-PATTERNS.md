# Phase 2: Fechar o Builder - Pattern Map

**Mapped:** 2026-09-26
**Files analyzed:** 22 (arquivos citados em CONTEXT.md/RESEARCH.md como alvo de criação/edição, resolvidos contra o disco real)
**Analogs found:** 22 / 22 (todo alvo tem analog no próprio arquivo ou num vizinho imediato — o Builder já tem cobertura estrutural para cada papel; o gap é de catálogo, não de arquitetura)

**Nota de caminho (D-05).** Nenhum rename da Phase 1 foi aplicado em `apps/gestao-vite/src/paginas/builder`, `packages/core/src/fluxo` ou `apps/api/src/dominio/fluxo.ts` até o momento deste mapeamento — confirmado por `Glob` nesta sessão (todos os arquivos abaixo existem hoje com o nome em português citado). Toda referência de caminho abaixo é o caminho **real no disco agora**. Uma correção ao RESEARCH.md: o Pitfall 4 (`modelo.ts` → `template.ts`, colisão semântica) já está resolvido no mapa aprovado — `std/map/gestao-vite.csv`, linha `gestao-vite-file-ee6a9795`, `status=approved`, destino `apps/management-vite/src/pages/builder/model.ts` (não `template.ts`). O planner de implementação ainda deve reconferir o CSV no momento de cada task, mas não precisa mais sinalizar esse pitfall como bloqueio.

**Natureza desta fase.** D-01/D-02 travam catálogo de conteúdo/ação, schema de pesquisa de satisfação e desenho exato de painéis novos (Teste, Filas embutido, exportar versão) até a investigação de referência + portão do dono (D-04) fecharem. Este PATTERNS.md cobre os arquivos que **já são alvo certo** de qualquer wave de implementação (a extensão dos dois lados da whitelist, a busca no seletor de destino, os fixes de ProcessHttp, o teste de `arestasDe()`) com analogs concretos; onde o arquivo/campo exato depende do inventário congelado (novo tipo de conteúdo específico, schema de satisfação), o padrão de extensão é o mesmo mostrado aqui — só o número de entradas muda.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/gestao-vite/tests/builder-editor.test.ts` | test | transform | mesmo arquivo (testes de `ligar`/`desligar`) | exact |
| `apps/gestao-vite/src/paginas/builder/painel-saidas.tsx` | component | request-response (estado local) | mesmo arquivo (`seletorDeDestino`) + `painel-variaveis.tsx`/`variaveis.ts` (busca) | exact + role-match |
| `apps/gestao-vite/src/paginas/builder/painel-configuracao.tsx` | component | request-response | mesmo arquivo (`AbaDeVersoes`, import/export atual) | exact |
| `apps/gestao-vite/src/paginas/builder-gravar.ts` | service (front→API) | request-response | mesmo arquivo (`salvarRascunho`/`publicarFluxo`/`restaurarVersao`) | exact |
| `apps/gestao-vite/src/paginas/builder/painel-filas.tsx` | component | request-response | mesmo arquivo (atalho atual) | exact (decisão pendente de escopo, D-15) |
| `apps/gestao-vite/src/paginas/builder/modelo.ts` | model (pure) | transform | mesmo arquivo (`novoBlocoDeAtendimento`, `SAIDAS_DE_ATENDIMENTO`) | exact |
| `apps/gestao-vite/src/paginas/builder/etiquetas-do-bloco.ts` | utility | transform | mesmo arquivo (paleta de cor por rótulo) | exact |
| `packages/contracts/src/gestao-fluxo.ts` | model (contract) | transform | mesmo arquivo (`DesenhoDoBuilder`, `BuilderDoFluxo`, linhas 320-385) | exact |
| `packages/db/src/schema/*.ts` (schema de satisfação, a nomear no D-08.5) | migration/schema | CRUD | `packages/db/src/schema/conversas.ts` (`etiqueta`, linhas 486-502) | role-match |
| `apps/api/src/dominio/fluxo.ts` (`executarProcessHttp`) | service (motor/domínio) | event-driven | mesmo arquivo (guarda `idProvedorUsado`, linhas 484-493) | exact |
| `packages/core/src/fluxo/gerenciador.ts` | service (motor) | event-driven | mesmo arquivo (`processarAcoes`, cursor de retomada, linhas 360-419) | exact |
| `apps/api/src/filas.ts` (varredura ProcessHttp em BullMQ) | config/worker | batch | mesmo arquivo (`agendarVarreduraEspelhoCrm`/`Midia`/`Sla`/`DicionarioCrm`, padrão `upsertJobScheduler`) | exact |
| `packages/core/src/fluxo/editor.ts` (`CONTEUDOS_SUPORTADOS`) | config (whitelist) | transform | mesmo arquivo, linhas 151-153 | exact |
| `packages/core/src/fluxo/acoes.ts` (`ACOES_DO_MOTOR`) | service (motor, executor de ação) | event-driven | mesmo arquivo (`setVariable`/`deleteVariable`, linhas 21-56, 233-247) | exact |
| `apps/gestao-vite/src/paginas/builder/conteudo.ts` | model (pure, catálogo de conteúdo) | transform | mesmo arquivo (`novoTexto`/`novoMenu`/`novoQuickReply`, linhas 146-156) | exact |
| `apps/gestao-vite/src/paginas/builder/acoes-do-bloco.ts` | model (pure, catálogo de ação) | transform | mesmo arquivo (`CATALOGO_DE_ACOES`, linhas 57-126) | exact |
| `apps/gestao-vite/src/paginas/builder/painel-conteudo.tsx` | component | request-response | mesmo arquivo (cartões + menu "+") | exact |
| `apps/gestao-vite/src/paginas/builder/painel-acoes.tsx` | component | request-response | `painel-conteudo.tsx` (mesmo padrão de cartão + menu) | role-match |
| Adaptadores de canal (`apps/api/src/dominio/whatsapp/*`, `messenger/*`, `instagram/*`) | service (adapter) | transform | `apps/api/src/dominio/envio.ts` (`TipoEnvio`, tradução tipo→canal) | role-match |
| Painel de Teste (novo, D-14) | component + service | request-response | sem analog direto — ver "No Analog Found" | none |
| Painel de Filas embutido (se D-15 escolher CRUD, não atalho) | component | CRUD | `PaginaFilas` (fora do escopo desta leitura; citado em `painel-filas.tsx:6-10`) | role-match (não lido nesta sessão) |
| `apps/api/src/controladores/gestao-builder.ts` | controller | request-response | mesmo arquivo (`GET :id/builder/versoes`, já existe — só falta consumidor) | exact (sem mudança de contrato) |

## Pattern Assignments

### `apps/gestao-vite/tests/builder-editor.test.ts` (test, transform) — BUILDER-05, D-29

**Analog:** mesmo arquivo — os testes de `ligar`/`desligar`/`montarDesenho` já presentes.

**Estrutura do teste** (linhas 60-74, o par ligar/desligar mais próximo do que `arestasDe()` precisa):
```typescript
test('liga e desliga uma aresta sem duplicar a condição de saída', () => {
  const origem = novoBloco({}, { top: 0, left: 0 }, 'origem');
  const destino = novoBloco({ origem }, { top: 0, left: 200 }, 'destino');
  const mapa = { origem, destino };
  const ligado = ligar(mapa, 'origem', 'destino', 'saida');

  assert.equal(ligado.ok, true);
  if (!ligado.ok) return;
  assert.equal(ligado.mapa.origem!.$conditionOutputs?.length, 1);
  const repetido = ligar(ligado.mapa, 'origem', 'destino', 'outra');
  assert.equal(repetido.ok, true);
  if (!repetido.ok) return;
  assert.equal(repetido.mapa.origem!.$conditionOutputs?.length, 1);
  assert.deepEqual(desligar(ligado.mapa, 'origem', 'destino').origem!.$conditionOutputs, []);
});
```

**O que copiar para o teste de caracterização de `arestasDe()` (D-29.1):** o mesmo padrão `node:test` + `node:assert/strict`, sem framework nem fixture — importar `arestasDe` de `../src/paginas/builder/modelo.ts` junto dos demais imports (linha 3-17), construir o `Mapa` com `novoBloco`, e cobrir explicitamente: saída com `$conditionOutputs` válido (aresta esperada), `stateId` inexistente no mapa (sem aresta — já testado implicitamente em `excluirBloco`), `$isDeskDefaultOutput` (sem aresta, ver `novoBlocoDeAtendimento` linhas 293-302 de `modelo.ts` para montar o bloco de atendimento com a saída de erro), `$defaultOutput` preenchido mas fora de `$conditionOutputs` (sem aresta — comportamento intencional, D-29 último parágrafo), e múltiplas saídas para o mesmo destino (uma aresta só, dedupe por `Set`, ver `modelo.ts:427-429`).

---

### `apps/gestao-vite/src/paginas/builder/painel-saidas.tsx` (component) — BUILDER-02, D-23

**Analog para o seletor atual (a substituir):** mesmo arquivo, `seletorDeDestino` (linhas 57-73):
```tsx
const seletorDeDestino = (valor: string, onEscolher: (id: string) => void, rotulo: string) => (
  <label className="bl-campo">
    <span className="sub">{rotulo}</span>
    <Selecao
      value={existe(valor) ? valor : valor ? '__outro' : ''}
      onChange={(e) => onEscolher(e.target.value === '__outro' ? valor : e.target.value)}
    >
      <option value="">{ROTULOS_DAS_SAIDAS.direcionar}</option>
      {destinos.map((b) => (
        <option key={b.id} value={b.id}>{b.$title || b.id}</option>
      ))}
      {valor && !existe(valor) ? <option value="__outro">{valor} (não existe)</option> : null}
    </Selecao>
  </label>
);
```
Usado em três pontos do mesmo arquivo: saída normal (linha 227-231), saída de disponibilidade (linha 135-139) e saída padrão (linha 252-256) — os três precisam do combobox pesquisável (D-23), não só um.

**Analog para a busca a reaproveitar:** `apps/gestao-vite/src/paginas/builder/variaveis.ts`, `filtrarVariaveis`/`normalizar` (linhas 76-88):
```typescript
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export function filtrarVariaveis(nomes: readonly string[], busca: string): string[] {
  const alvo = normalizar(busca.trim());
  if (!alvo) return [...nomes];
  return nomes.filter((nome) => normalizar(nome).includes(alvo));
}
```
E o consumo em painel, `painel-variaveis.tsx` (linhas 46-50): `useState` para `busca`, filtro derivado a cada render, sem debounce — mesmo padrão a copiar para o novo combobox de destino (filtrar `Object.values(mapa)` por `$title`/`id` normalizados). Placeholder de texto já fixado no UI-SPEC: "Buscar bloco de destino…" (mesmo padrão do `painel-variaveis.tsx`).

---

### `apps/gestao-vite/src/paginas/builder/painel-configuracao.tsx` + `builder-gravar.ts` (component + service) — BUILDER-04, D-16

**Analog do formato a reaproveitar (nunca criar um segundo formato):** `importar-exportar.ts` (`textoDeExportacao`/`validarImportacao`, citado em CONTEXT.md D-16) — mesma serialização do rascunho atual, aplicada ao payload de uma versão publicada.

**Analog do consumo de API que falta (`listarVersoes`):** `builder-gravar.ts`, mesmo padrão das três funções existentes:
```typescript
export async function salvarRascunho(
  id: string,
  desenho: DesenhoDoBuilder,
): Promise<Resultado<RascunhoGravado>> {
  try {
    const valor = await api.put<RascunhoGravado>(`/v1/gestao/fluxos/${id}/builder`, desenho);
    atualizarLeituras();
    return { ok: true, valor };
  } catch (erro) {
    return { ok: false, erro: motivoDe(erro, 'Não foi possível salvar o rascunho.') };
  }
}
```
A função nova (`listarVersoes(id)`) segue o mesmo formato: `api.get<VersaoDoFluxo[]>('/v1/gestao/fluxos/${id}/builder/versoes')`, mesmo padrão `Resultado<T>`/`ErroDaApi`/`motivoDe`. O endpoint já existe e não muda (`apps/api/src/controladores/gestao-builder.ts`, linhas 79-90, `@Get(':id/builder/versoes')` → `VersaoDoFluxo[]`) — só falta o lado do front.

---

### `apps/gestao-vite/src/paginas/builder/modelo.ts` + `painel-saidas.tsx` (model + component) — BUILDER-03 (tags de encerramento)

**Analog de tabela/contrato a reaproveitar (Don't Hand-Roll, RESEARCH.md):** `packages/db/src/schema/conversas.ts`, `etiqueta` (linhas 486-502):
```typescript
export const etiqueta = pgTable(
  'etiqueta',
  {
    id: id(),
    tenantId: refTenant(),
    nome: text('nome').notNull(),
    cor: text('cor'),
    escopo: text('escopo').notNull().default('conversa'),
    exclusivaPorFila: boolean('exclusiva_por_fila').notNull().default(false),
    obrigatoriaNoEncerramento: boolean('obrigatoria_no_encerramento').notNull().default(false),
    ...carimbos(),
  },
  (t) => [
    listaCheck('etiqueta_escopo_ck', t.escopo, ESCOPOS_ETIQUETA),
    uniqueIndex('etiqueta_tenant_nome_uk').on(t.tenantId, t.nome),
  ],
);
```
E `packages/contracts/src/encerramento.ts` (`EncerrarConversaInput.etiqueta_ids?: string[]`) — o contrato que já liga etiqueta a ticket. BUILDER-03 (D-12) não cria uma segunda paleta: consome esta mesma tabela via `input.content@tags` depois do encerramento, exposto como saída de atendimento configurável em `modelo.ts`/`painel-saidas.tsx`.

**Analog para os `$tags` livres do bloco (cor por rótulo, sistema separado, D-11a):** `etiquetas-do-bloco.ts` (linhas 9-21):
```typescript
const CORES_DAS_ACOES: Record<string, string> = {
  ExecuteScript: '#ff961e',
  ExecuteScriptV2: '#ff961e',
  TrackEvent: '#61d36f',
  SendMessage: '#ee82ee',
  UserInput: '#000000',
};

function corDaEtiqueta(rotulo: string, corDaOrigem?: unknown): string {
  const cor = typeof corDaOrigem === 'string' ? corDaOrigem : CORES_DAS_ACOES[rotulo];
  if (!cor || ['#3f7de8', '#0096fa', '#1e6bf1', '#498bff'].includes(cor.toLowerCase())) return '#4a5d23';
  return cor;
}
```
Nota de padrão azul→verde (D-13): esta função já faz a troca azul→verde manualmente com uma lista de hex fixa — candidata a migrar para os tokens `--p-builder-marca-*` do D-32 em vez de manter o hex `#4a5d23` solto (mesmo grep de saída do D-32: `grep -rn "#4a5d23\|--bl-verde"`).

**Analog para adicionar um novo tipo de bloco/saída ao modelo (pesquisa de satisfação nativa, D-06):** mesmo arquivo `modelo.ts`, o par `SAIDAS_DE_ATENDIMENTO` (linhas 129-133) + `novoBlocoDeAtendimento` (linhas 283-319) — o precedente de "bloco especial com saídas fixas geradas por função pura, condição sobre `input.content@…`". Um bloco de pesquisa nativo (quando o D-08 fechar a investigação) segue a mesma forma: lista de status/condição fixos + função `novoBlocoDePesquisa(mapa, posicao, id)` que devolve um `Bloco` com `$conditionOutputs` prontos, análoga a `novoBlocoDeAtendimento`.

---

### `packages/contracts/src/gestao-fluxo.ts` (model/contract) — schema de satisfação (D-08.5)

**Analog:** mesmo arquivo, o par `BuilderDoFluxo`/`RascunhoGravado`/`VersaoPublicada` (linhas 358-385) — interfaces `export interface X { … }` documentadas com comentário de bloco explicando de qual endpoint/botão vêm, nomes em português com `$…` preservado quando é campo persistido da Blip (`DesenhoDoBuilder`, linha 320-323):
```typescript
export interface DesenhoDoBuilder {
  fluxo: Record<string, unknown>;
  globais: Record<string, unknown>;
}
```
Qualquer contrato novo de resposta de pesquisa (quando D-08 fechar) segue o mesmo estilo: interface simples, comentário de proveniência, sem `class`/decorator — este arquivo inteiro é `interface`/`type` puro.

---

### `apps/api/src/dominio/fluxo.ts` — `executarProcessHttp`/retomada (D-25, D-27, Pitfall 1)

**Analog/local exato do fix (D-27, opção A):** mesmo arquivo, linhas 484-493 — o comentário já documenta o bug e o ponto exato:
```typescript
// Numa retomada a entrada é a MESMA da suspensão original — `execucao_passo` já
// gravou aquele `id_provedor` (fluxo.ts:440-450). Repeti-lo aqui violaria
// `execucao_passo_entrada_uk` (a proteção contra webhook duplicado da Meta,
// migration 0014), então uma retomada nunca inclui `id_provedor` de novo.
let idProvedorUsado = Boolean(retomada);
const estadoAntes = estadoGuardado(variaveis, fluxo.id);
if (nova && estadoAntes?.startsWith('desk:') && fluxo.states.some((s) => s.id === estadoAntes)) {
  const ticket = await ultimoAtendimento(tx, e.contatoId, conversa.id);
  idProvedorUsado = true;
  ...
```
A linha `let idProvedorUsado = Boolean(retomada);` **já é** a opção A do diagnóstico (`.planning/debug/process-http-auto-resume.md`) — só falta confirmar se o gate de teste de caracterização (D-28) cobre exatamente esse caminho antes de fechar D-27 como corrigido, ou se o código já resolve e só falta o teste de regressão.

---

### `packages/core/src/fluxo/gerenciador.ts` — cursor de retomada em `$enteringCustomActions` (D-25)

**Analog:** mesmo arquivo, `processarAcoes` (linhas 360-419) — o cursor de suspensão já existe e é genérico por `lista`/`estadoId`/`indice`:
```typescript
const alvo = cursor && cursor.lista === lista && cursor.estadoId === estadoId ? cursor : null;
if (cursor && !cursor.consumido && !alvo) return;
for (const [indice, acaoDoFluxo] of ordenadas.entries()) {
  ...
  if (acaoDoFluxo.type === 'ProcessHttp' && contexto.servicos.suspenderHttp) {
    contexto.entradaContexto.set('process-http-cursor', { lista, estadoId, indice });
  }
  if (alvo && indice < alvo.indice) continue;
  if (alvo && !cursor?.consumido && indice === alvo.indice) {
    ...
    if (cursor) cursor.consumido = true;
    continue;
  }
  await comTempoLimite(acao.executar(contexto, configuracoes), tempoLimite);
}
```
`ListaDeAcoesSuspensa` já inclui `'entrada'` como valor de `lista` (usado nas chamadas em `processarEntrada`, linhas 190-194 e 298-303) — a suspeita de D-25 ("suspendendo e retomando sem pular as ações seguintes" em `$enteringCustomActions`) é sobre esse mesmo mecanismo genérico, não um caminho separado. O fix, se houver, é local a este bloco `processarAcoes`, testável isolando `lista = 'entrada'`.

---

### `apps/api/src/filas.ts` — varredura de `ProcessHttp` em modo BullMQ (D-26)

**Analog (o padrão a copiar, 4 ocorrências já existentes no mesmo arquivo):**
```typescript
export async function agendarVarreduraEspelhoCrm(): Promise<void> {
  if (modo() === 'memoria') return;
  filaEspelhoCrm ??= new Queue(FILA_ESPELHO_CRM, { connection: redis() });
  await filaEspelhoCrm.upsertJobScheduler(
    'varredura-espelho-crm',
    { every: Number(process.env['PIPE_ESPELHO_CRM_VARREDURA_MS'] ?? 300_000) },
    { name: 'varredura', data: {} },
  );
}
```
(mesma forma em `agendarVarreduraMidia`, `agendarVarreduraSla`, `agendarVarreduraDicionarioCrm`, `agendarRenovacaoInstagram`). O trecho a modificar é `agendarVarreduraProcessHttp` (linhas 111-129), que hoje só cobre `modo() === 'memoria'` com `setInterval`:
```typescript
export async function agendarVarreduraProcessHttp(): Promise<void> {
  if (modo() !== 'memoria' || process.env['PIPE_PROCESS_HTTP_EM_MEMORIA'] !== '1' || relogioProcessHttp) return;
  ...
}
```
D-26 pede o par BullMQ desta função, seguindo `upsertJobScheduler` acima — timeout + alerta em produção, análogo ao comentário de `agendarVarreduraEspelhoCrm` ("Falhar aqui não pode derrubar o atendimento... o erro é registrado e engolido").

---

### `packages/core/src/fluxo/editor.ts` — `CONTEUDOS_SUPORTADOS` (BUILDER-01, motor)

**Analog:** mesmo arquivo, linhas 151-153:
```typescript
/** Os tipos de conteúdo que o canal do Pipe manda hoje. O "digitando" passa sem efeito. */
export const CONTEUDOS_SUPORTADOS = new Set(['text/plain', 'application/vnd.lime.select+json']);
export const CONTEUDOS_SEM_EFEITO = new Set(['application/vnd.lime.chatstate+json']);
```
Cada tipo novo aprovado no portão do dono (D-04) entra como um item a mais neste `Set` — mecanismo já é o correto, só falta a entrada.

---

### `packages/core/src/fluxo/acoes.ts` — `ACOES_DO_MOTOR` (BUILDER-01/02, motor)

**Analog para uma ação nova simples (`AcaoDoMotor`):** mesmo arquivo, `setVariable` (linhas 47-56):
```typescript
export interface AcaoDoMotor {
  tipo: string;
  executar(contexto: Contexto, configuracoes: Configuracoes): Promise<void>;
}

const setVariable: AcaoDoMotor = {
  tipo: 'SetVariable',
  async executar(contexto, configuracoes) {
    const c = exigirConfiguracoes(this.tipo, configuracoes);
    const variavel = comoTexto(campo(c, 'variable'));
    if (variavel === null)
      throw new Error("O valor 'variable' é obrigatório na ação 'SetVariable'.");
    definirVariavel(contexto, variavel, comoTexto(campo(c, 'value')));
  },
};
```
E o registro final (linhas 233-247):
```typescript
export const ACOES_DO_MOTOR: readonly AcaoDoMotor[] = [
  setVariable, deleteVariable, sendMessage, sendRawMessage, trackEvent,
  createTicket, forwardToDesk, leavingFromDesk, redirect, processHttp,
];
export const PROVEDOR_PADRAO: ProvedorDeAcoes = new Map(ACOES_DO_MOTOR.map((a) => [a.tipo, a]));
```
Cada ação aprovada no portão (D-19/D-20) como "reproduzível no Pipe" (não dependência externa) ganha um objeto `AcaoDoMotor` neste padrão + uma entrada em `ACOES_DO_MOTOR`. Para ações com efeito colateral fora da transação (padrão `ProcessHttp`, que usa `contexto.servicos.suspenderHttp`), usar `processHttp` como analog em vez de `setVariable`.

---

### `apps/gestao-vite/src/paginas/builder/conteudo.ts` — catálogo de conteúdo na tela (BUILDER-01)

**Analog:** mesmo arquivo, `novoTexto`/`novoMenu`/`novoQuickReply` (linhas 146-156), todas construídas sobre a função privada `fala`:
```typescript
function fala(id: string, mime: string, conteudo: unknown, tipoDoCartao: string): ItemDeConteudo {
  return {
    action: {
      $id: id, $typeOfContent: tipoDoCartao, type: 'SendMessage',
      settings: { id, type: mime, content: conteudo },
      $cardContent: cartao(id, mime, conteudo, 'left'),
    },
    $invalid: false,
  };
}

export function novoTexto(conteudo = '', id = gerarId()): ItemDeConteudo {
  return fala(id, TIPO_TEXTO, conteudo, 'text');
}
```
Um tipo de conteúdo novo (Imagem, Áudio, Carrossel, …) é uma função `novoX(...)` no mesmo formato, mais uma entrada em `cartoesDe()` (linhas 105-129, o `if/else` por `mime`) para o Builder saber desenhar o cartão de volta ao reabrir. `errosDoConteudo` (linhas 258-285) é o analog para as validações de campo obrigatório/limite do tipo novo.

---

### `apps/gestao-vite/src/paginas/builder/acoes-do-bloco.ts` — catálogo de ação na tela (BUILDER-01/02)

**Analog:** mesmo arquivo, a entrada de `CATALOGO_DE_ACOES` para `SetVariable` (linhas 92-105):
```typescript
{
  tipo: 'SetVariable',
  rotulo: 'Definir variável',
  titulo: 'Definir variável',
  grupo: 'Manipular',
  info: 'Essa ação permite a definição do valor de uma variável de context no fluxo. Para utilizar a variável, utilize {{context.variableName}}',
  campos: [
    { chave: 'variable', rotulo: 'Nome da variável', obrigatorio: true },
    { chave: 'value', rotulo: 'Valor' },
  ],
},
```
Cada ação nova aprovada ganha uma entrada `TipoDeAcao` neste formato (`chave`/`rotulo`/`obrigatorio`/`tipo` por campo — `tipo: 'cabecalhos'` já existe como precedente para campo estruturado, ver `ProcessHttp.headers`). `novaAcao(tipo)` (linhas 164-173) e `valorDoCampo`/`comCampo` (linhas 178-224) são reaproveitados sem alteração — funcionam genericamente por `chave`, não precisam de um caso por tipo.

---

### `apps/gestao-vite/src/paginas/builder/painel-conteudo.tsx`/`painel-acoes.tsx` (component) — editor por cartão

**Analog:** `painel-conteudo.tsx`, cabeçalho + estado local (linhas 42-55) — `useState` para item selecionado/menu aberto, sem biblioteca de formulário; cada tipo de cartão vira uma seção condicional dentro do mesmo componente, seguindo `cartoesDe(bloco)` como fonte de verdade. Um painel novo por tipo de conteúdo (se o inventário exigir editor dedicado, ex. Carrossel) segue o mesmo padrão: `Campo`/`Etiqueta`/`Icone` de `@pipe/ui`, `IconeGestao`/`IconePortal` para ícones próprios do Pipe (nunca ícone da Blip, D-33), `Selecao` (`<select>` estilizado) para valores fechados.

---

### Adaptadores de canal (BUILDER-01, comportamento por canal)

**Analog mais próximo (tradução tipo→canal, não o motor de fluxo em si):** `apps/api/src/dominio/envio.ts`, `TipoEnvio` + `canalDoCore` (linhas 28, 80+):
```typescript
export type TipoEnvio = 'texto' | 'imagem' | 'audio' | 'video' | 'documento' | 'template';
```
Este arquivo trata do envio do atendimento humano (Desk), não da execução do Builder — mas é o único lugar do repositório com uma tradução tipo-de-conteúdo → canal já feita, incluindo a observação explícita sobre Instagram cair como canal "sem janela" (comentário linhas 76-79). Nenhum adaptador de canal específico para o **motor de conversa** (`packages/core/src/fluxo`) foi encontrado nesta leitura — a extensão de canal do D-18 ("o que a referência faz quando o canal não suporta: oculta, desabilita, avisa...") ainda não tem analog direto no motor; ver "No Analog Found".

## Shared Patterns

### Whitelist dupla motor + tela
**Fonte:** `packages/core/src/fluxo/{acoes,editor}.ts` (o que o motor executa) + `acoes-do-bloco.ts`/`conteudo.ts` (o que a tela oferece).
**Aplicar a:** todo plano de BUILDER-01/02 que adicione tipo de conteúdo ou ação — os dois lados sobem juntos (D-24). Comentário de origem em `acoes-do-bloco.ts:21-27` documenta a regra: "tudo o que o motor não executa aparece só para leitura quando veio de um fluxo importado, com a marca 'Não executada no Pipe'".

### Função pura sobre mapa imutável
**Fonte:** `modelo.ts`, `condicoes.ts`, `conteudo.ts`, `acoes-do-bloco.ts` — todo `novoX`/`definirX`/`adicionarX` recebe o `Bloco`/`Mapa` atual e devolve um novo (spread, nunca mutação). `estado.ts` empilha os mapas para desfazer/refazer.
**Aplicar a:** qualquer extensão de modelo do editor (novo bloco especial, novo campo de saída).

### Busca sem acento/caixa
**Fonte:** `variaveis.ts:76-97` (`normalizar`/`filtrarVariaveis`/`filtrarVariaveisDoSistema`).
**Aplicar a:** seletor de destino de ligação (D-23), biblioteca de funções (quando existir).

### `Resultado<T>`/`ErroDaApi`/`motivoDe` nas escritas do front
**Fonte:** `builder-gravar.ts` — toda função de escrita devolve `{ ok: true, valor } | { ok: false, erro }`, nunca lança para o componente.
**Aplicar a:** `listarVersoes` (D-16) e qualquer nova escrita de painel (Filas embutido, Teste).

### `upsertJobScheduler` para varredura periódica em BullMQ
**Fonte:** `apps/api/src/filas.ts` — `agendarVarreduraEspelhoCrm`/`Midia`/`Sla`/`DicionarioCrm`/`agendarRenovacaoInstagram`, todas com `if (modo() === 'memoria') return;` + `Queue.upsertJobScheduler(nome, { every }, { name, data })`.
**Aplicar a:** `agendarVarreduraProcessHttp` em modo BullMQ (D-26).

### Tokens `--p-*` / azul→verde
**Fonte:** `packages/ui/src/estilos/tokens.css`, `tema.ts` (D-32); hex solto hoje em `editor.css`/`painel-bloco.css` (`#4a5d23`, `--bl-verde`) e em `etiquetas-do-bloco.ts` (`corDaEtiqueta`, lista de hex azul).
**Aplicar a:** todo CSS/lógica de cor tocado nesta fase — migrar para `--p-builder-marca-*` conforme o papel visual, nunca introduzir hex novo.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| Painel de Teste (D-14) | component + service | request-response (simulação) ou streaming (canal real) | Nenhuma referência a canal/simulação de teste no builder atual (`grep` vazio confirmado no RESEARCH.md); decisão de mecanismo (simulação local vs canal real) ainda em aberto — sem analog até a investigação (D-14) fechar. Se a decisão for "simulação local contra `packages/core` em memória", o analog mais próximo passa a ser o runner de teste do motor (`packages/core/src/fluxo/*.teste.ts`, que já invoca `processarEntrada` fora de HTTP) — reavaliar quando D-14 fechar. |
| Biblioteca de funções do motor de conversa (D-22, BUILDER-02) | model + service + component | CRUD + event-driven (chamada em tempo de execução) | Não existe hoje nenhuma tabela/contrato de "função" no motor de conversa; o único `funcao` do repositório é do motor de **workflow** (`packages/db/src/schema/automacao.ts:443-454`), explicitamente uma máquina diferente (RESEARCH.md, "Padrões" §4). Não reaproveitar sem decisão explícita de escopo (D-22 já veta o reaproveitamento direto). |
| Adaptador de canal por tipo de conteúdo dentro do motor de fluxo (D-18, comportamento "oculta/desabilita/avisa/fallback") | service (adapter) | transform | O motor (`packages/core/src/fluxo`) hoje não tem uma camada de "isto não é suportado neste canal" — a checagem existe só como whitelist global (`CONTEUDOS_SUPORTADOS`), não por canal. `envio.ts` (Desk) tem uma tradução tipo→canal, mas é uma superfície diferente (atendimento humano, não bot). Sem investigação de referência (D-18) e sem esse mecanismo hoje, não há analog a copiar — só o padrão de whitelist do motor como ponto de partida estrutural. |
| Schema de persistência da pesquisa de satisfação (D-08.5) | migration/schema | CRUD | Modelo do Pipe depende da investigação de ponta a ponta (D-08.1-4) ainda não feita; `etiqueta` (`conversas.ts`) é o analog estrutural mais próximo (tabela por tenant, `pgTable` com `carimbos()`/`refTenant()`/checks), mas o schema real (nota, comentário, ticket, atendente, fila, timestamps) só é definido depois do portão do dono. |

## Metadata

**Analog search scope:** `apps/gestao-vite/src/paginas/builder/**`, `apps/gestao-vite/tests/builder-*.test.ts`, `apps/gestao-vite/src/paginas/builder-gravar.ts`, `packages/core/src/fluxo/**`, `apps/api/src/dominio/fluxo.ts`, `apps/api/src/dominio/gestao/builder-do-fluxo.ts`, `apps/api/src/controladores/gestao-builder.ts`, `apps/api/src/filas.ts`, `packages/contracts/src/gestao-fluxo.ts` + `encerramento.ts`, `packages/db/src/schema/conversas.ts` + `automacao.ts`, `apps/api/src/dominio/envio.ts` + `whatsapp/`, `messenger/`, `instagram/` (globs, não lidos em detalhe)
**Files scanned (leitura completa ou por trecho citado):** 17
**Pattern extraction date:** 2026-09-26

## Conventions

Derivado via `node bin/gsd-tools.cjs verify conventions --derive --scope apps/gestao-vite/src/paginas/builder` (mesmo módulo determinístico do `gsd-code-reviewer`), escopo restrito ao diretório do Builder (25 arquivos fonte).

| Eixo | Dominante | Share | Entropy | Status |
|---|---|---|---|---|
| Nome de arquivo (casing) | — (empate) | 52% kebab / 48% camel | 0.999 | **contested hotspot** |
| Nome de identificador (casing) | camel | 86.25% | 0.578 | named contract |
| Estilo de export | ESM | 100% | 0 | named contract |
| Estilo de import | ESM | 100% | 0 | named contract |

**Contested hotspots (author's choice).** O casing de nome de arquivo no diretório do Builder é literalmente um empate (13 kebab-case como `painel-saidas.tsx`/`acoes-do-bloco.ts` vs 12 camelCase como `modelo.ts`/`estado.ts` — a maioria dos `.ts` de uma palavra só não distingue casing, o que infla o lado "camel" artificialmente; os arquivos multi-palavra novos observados na prática seguem kebab: `painel-saidas.tsx`, `menu-novo-bloco.tsx`, `cabecalho-info.tsx`). Qualquer arquivo novo de múltiplas palavras nesta fase (painel de Teste, novo editor de conteúdo) deve seguir kebab-case, que é o padrão real quando há mais de uma palavra — não tratar o empate numérico como licença para escolher livremente. Identificador (`camelCase`, com `Pascal` só para componente React/tipo) e ESM import/export são contratos nomeados e não contestados — seguir sem questionar.

Fora deste diretório, o precedente arquitetural mais próximo de "contested hotspot intencional" no repositório é o resolver dual CJS↔SDK: `bin/lib/**` é CommonJS (`module.exports`/`require`), `sdk/src/**` é ESM (`export`/`import`) — cada metade é internamente consistente por diretório, contestada só quando medida repositório inteiro. Um plano/executor que tocar um arquivo já existente deve seguir o estilo local do diretório daquele arquivo, não o dominante global — o mesmo princípio que aplica-se ao empate kebab/camel do Builder.
