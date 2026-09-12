# Ponte LIME — a cópia da Blip falando com o Pipe

Decisão do dono em 12/09/2026: **a tela que o cliente abre é a cópia**, e o Pipe
responde por trás. Este documento descreve a ponte que faz isso.

## O limite, dito uma vez

A cópia é o bundle compilado da Blip. Rodar aqui, para desenvolver e medir, é uma
coisa; **entregar esse bundle a um cliente pagante é distribuir o software deles**.
Antes de ir para um cliente, ou a tela passa a ser nossa, ou existe autorização
escrita da Take. A ponte descrita aqui é código nosso e vale nos dois caminhos: com
ela, a cópia deixa de ser maquete e vira banco de prova do backend com dados reais.

## Como a cópia fala hoje

O Desk não fala HTTP com o servidor: ele fala **LIME**, um protocolo de comandos.
`desk-local/boot-mock.js` monta um cliente falso já "conectado" cujo `processCommand`
chama `window.__mockLime(comando)` e devolve:

```js
processCommand: function (cmd) {
  var r = window.__mockLime(cmd);
  return Promise.resolve(Object.assign(
    { id: cmd.id, from: cmd.to, to: canal.localNode, method: cmd.method }, r));
}
```

Dois fatos que decidem o desenho:

1. **A resposta já é uma promessa.** A ponte pode ser assíncrona (uma chamada HTTP)
   sem tocar em uma linha do bundle da Blip.
2. **Todo o vocabulário passa por um ponto só.** Trocar `window.__mockLime` por uma
   função que pergunta ao Pipe é toda a integração do lado da tela.

O comando tem a forma `{ id, method, to, uri, type?, resource? }`, e a resposta
`{ status: 'success' | 'failure', type, resource }`. O `type` importa: o Desk lê
`application/vnd.iris.*` para decidir como montar a tela.

## Desenho

```
cópia (Desk 8787 / Gestão 8790)
      │  window.__mockLime(cmd)   → vira →   POST /comandos  { id, method, to, uri, resource }
      ▼
apps/ponte  (novo)
      │  traduz LIME → domínio do Pipe, sob o tenant da sessão (RLS)
      ▼
apps/api / packages/db   (conversas, filas, atendentes, métricas, CRM)
```

A ponte **não** repete regra de negócio: ela traduz vocabulário e chama o domínio que
já existe. Onde o domínio não tem o dado, a ponte responde o mesmo que o mock responde
hoje, e o item entra na lista de pendências abaixo — nunca inventa número.

### Onde ela mora

`apps/ponte`, app próprio. Não entra na `apps/api` porque tem público diferente
(a cópia, não o nosso front), formato diferente (LIME, não REST) e ciclo de vida
diferente: some no dia em que a tela for nossa.

### Autenticação

A cópia não tem login — `boot-mock.js` só finge que está conectado. A ponte recebe uma
chave de laboratório que resolve para `(tenant, usuário)` e abre a conexão com o papel
do app, sob RLS. **A chave não vale em produção**: enquanto a tela for a cópia, o
acesso é por rede fechada. Quando a tela for nossa, a sessão já existente substitui
isso.

## Mapa dos comandos

Levantado dos dois mocks, que são a lista exata do que as telas pedem:
**34 no Desk**, **73 na Gestão**.

### Desk (8787) — 34 comandos

| Comando | De onde vem no Pipe | Estado |
|---|---|---|
| `/account`, `/agents/info`, `/agents/preferences` | `usuario`, `status_atendente` | existe |
| `/attendants/change-status`, `/presence` | `dominio/status-atendente.ts` | existe |
| `/tickets/active`, `/tickets/{id}`, `/tickets/{id}/messages` | `dominio/conversa.ts` | existe |
| `/tickets` (abrir, encerrar, transferir) | `conversa.ts`, `distribuicao.ts` | existe |
| `/contacts`, `/contacts/{id}`, `/contacts/{id}/comments` | `contato`, nota interna | existe |
| `/history-contacts` | histórico de conversas do contato | existe |
| `/attendance-teams`, `/attendance-queues/name/{fila}/tags` | `fila`, `etiqueta` | existe |
| `/buckets/blip:desk:tags` | catálogo de etiquetas do tenant | existe |
| `/analytics/reports/tickets`, `/analytics/reports/timings` | `metrica_diaria` | existe |
| `/metadatas/tickets/*`, `/metadatas/*` | metadados da conversa | parcial |
| `/copilot/lead-score`, `/copilot/*` | `packages/ai` | parcial |
| `/agent/permissions/all`, `/configuration/caller` | papéis e permissões do Pipe | traduzir |
| `/applications/*/tenant`, `/tenants-mine`, `/accounts/*` | `tenant` | traduzir |
| `/ping`, `/now`, `/receipt` | resposta fixa | trivial |

### Gestão (8790) — 73 comandos, por área

| Área | Comandos | De onde vem | Estado |
|---|---|---|---|
| Monitoramento | 9 (`/monitoring/tickets`, `/monitoring/ticket-metrics`, `/monitoring/attendant-status-metrics`…) | `metrica_diaria`, `evento_atendimento`, `status_atendente` | existe |
| Filas | 4 (`/attendance-queues*`) | `fila` | existe |
| Atendentes | 2 (`/attendants`, `/attendants/queue/{id}`) | `usuario`, `fila_usuario` | existe |
| Equipes | 2 (`/teams`, `/teams/agents-online`) | `fila`, `status_atendente` | existe |
| Regras de atendimento | 3 (`/rules*`) | `regra` (schema gestao) | existe |
| SLA | 2 (`/sla-policy*`) | `politica_sla` | existe |
| Horários | 2 (`/attendance-hour*`) | `horario_atendimento` | existe |
| Pausas | 2 (`/custom-pauses*`) | `pausa` | existe |
| Prioridade | 1 (`/priority-rules`) | prioridade da conversa | existe |
| Etiquetas e buckets | 7 (`/buckets/*`) | catálogo, e o fluxo do Builder | parcial |
| Builder | 2 (`/templates/builder`, buckets do fluxo) | `fluxo`, `fluxo_versao`, `bloco` | **falta converter** |
| Contrato e conta | 15 (`/tenants*`, `/applications*`, `/account`, `/agents/v2`…) | `tenant`, `usuario` | traduzir |
| Planos e assinatura | 3 (`/plans`, `/active-subscription`, `/agent-plan/*`) | não existe módulo de cobrança | responder fixo |
| Infraestrutura | 5 (`/ping`, `/deployment-status`, `/threads/*`, `/configuration/gateways`, `/copilot/*`) | fixo ou parcial | trivial |

### O que a ponte não consegue responder de verdade hoje

- **Cobrança**: plano, assinatura e limites não existem no Pipe. Resposta fixa, e a tela
  mostra "plano local".
- **Builder**: o fluxo do Pipe está no formato do motor (publicado). A tela edita o
  formato do editor. A conversão nos dois sentidos é trabalho próprio — o importador
  em `packages/core/src/fluxo/editor.ts` já faz metade (editor → publicado).
- **Copiloto e metadados**: existem em parte no `packages/ai` e na conversa; o resto
  responde vazio, que é o comportamento do mock hoje.

## Ordem de construção

1. **Casca**: `apps/ponte` com `POST /comandos`, roteador por `to` + `uri` no mesmo
   formato dos mocks, e a chave de laboratório resolvendo tenant e usuário.
2. **Leitura do Desk**: conta, tickets, mensagens, contatos, filas, etiquetas. É o que
   faz a tela abrir com dado real.
3. **Escrita do Desk**: abrir, responder, transferir, encerrar, mudar status. Aqui a
   cópia deixa de ser vitrine e vira operação.
4. **Gestão**: monitoramento, filas, atendentes, regras, SLA, horários, pausas.
5. **Builder**: a conversão publicado ↔ editor.
6. **Resto**: contrato, planos e o que ficar.

Cada etapa troca um pedaço do `dados-mock.js` por chamada à ponte, e o que ainda não
foi migrado continua no mock. Assim a cópia nunca fica quebrada no meio do caminho.

## Como o laboratório liga uma coisa na outra

`desk-local/dados-ponte.js` (novo) substitui `window.__mockLime` por uma chamada à
ponte, e o `servidor.js` passa a servir esse arquivo em vez do mock quando a variável
`PIPE_PONTE` estiver ligada. Desligada, tudo volta ao mock — o laboratório continua
funcionando sem banco nenhum.

## O que isto não resolve

Continua valendo o limite do começo: com a cópia na frente, não dá para acrescentar
tela que a Blip não tem — construtor de fluxo nosso, monitoria, assistente de IA. Eles
existirão fora da cópia, em `apps/gestao`, ou esperarão a tela ser nossa.
