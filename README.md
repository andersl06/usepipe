# Pipe

Atendimento no WhatsApp com API oficial, CRM alimentado pelas conversas, e monitoria por IA.

## Começar

Requisitos: Node 20 ou superior, pnpm 9, Docker.

```bash
pnpm install
pnpm banco:subir      # Postgres 16 na 5433 e Redis na 6380
pnpm banco:migrar
pnpm banco:semear
```

As portas fogem do padrão de propósito, para não brigar com outro Postgres na mesma máquina.

Depois:

```bash
pnpm --filter @pipe/desk dev     # tela do atendente
pnpm --filter @pipe/gestao dev   # tela do supervisor
```

## Verificar

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

`pnpm test` sobe o Postgres do compose para os testes de integração de `packages/db`. Se falhar
sem explicação, confira se a porta 5433 está livre.

## O que está dentro

```
apps/
  desk       tela do atendente
  gestao     monitoramento, relatórios, regras, monitoria
  crm        leads, oportunidades, contas
  api        REST, webhooks e servidor MCP
  workers    entrega de mensagem, IA, agregações
  site       landing page, blog e ferramentas
packages/
  db         schema, migrations e políticas de isolamento
  core       regras puras: métricas, esforço, score, distribuição, SLA, janela
  ai         resumo, classificação e avaliação
  ui         design system
  contracts  tipos compartilhados
  mcp        servidor MCP
```

### Onde mora a regra de negócio

Em `packages/core`, e só lá. Métrica, esforço, score, distribuição por carga, SLA e a janela de 24
horas são funções puras: entram dados, sai número. Nenhuma delas toca banco ou HTTP, e todas têm
tabela de casos com o valor esperado calculado à mão.

O motivo é prático: é onde erro de cálculo custa caro, porque vira número em relatório que o
cliente usa para decidir sobre gente. Se você precisar de um cálculo numa tela, chame `core`, não
reescreva.

### Como o isolamento entre clientes funciona

Um banco, `tenant_id` em toda tabela de negócio, RLS ligada no Postgres. Toda leitura e escrita
passa por:

```ts
await comTenant(db, tenantId, async (tx) => { /* … */ })
```

O helper abre transação e define `pipe.tenant_id` na sessão. Sem essa variável, a consulta **não
retorna linha**: falha fechada, nunca vazamento. O papel da aplicação não é dono das tabelas e não
tem `bypassrls`, então nem por engano a política é ignorada.

Consulta fora do `comTenant` não é atalho, é defeito.

**Nunca use `Promise.all` dentro de uma transação.** Consultas em paralelo na mesma conexão caem no
caminho depreciado do driver `pg`, e o `set_config('pipe.tenant_id')` da transação **desaparece**.
O resultado não é erro: é consulta rodando sem tenant definido. Dentro do `comTenant`, as consultas
vão em série. Paralelizar aqui troca alguns milissegundos por vazamento entre clientes.

Duas outras armadilhas já encontradas e resolvidas, para não serem redescobertas:

- `timestamptz` volta como **texto** dentro do bundle do Next. Normalize na camada de consulta.
- `mensagem` é particionada, então algumas chaves estrangeiras que apontariam para ela não existem
  (a unicidade lá é `(id, criada_em)`). Isso é decisão, não esquecimento.

### Migrations

Geradas pelo drizzle-kit, versionadas em `packages/db/migrations`. Duas coisas para saber antes de
mexer:

- `mensagem` e `evento_atendimento` são particionadas por mês. A função `pipe_criar_particao_mes`
  cria a partição já com política e permissão.
- Algumas chaves estrangeiras nascem em migration própria (`0003_chaves_cruzadas`) porque viveriam
  em ciclo de import entre módulos. Um `drizzle-kit generate` futuro não as conhece e vai propor
  removê-las. Não aceite.

## Documentação

| Documento | O que responde |
|---|---|
| [Desenho do produto](docs/specs/2026-09-05-pipe-design.md) | o que o Pipe é, os seis módulos, as fases |
| [Modelo de dados](docs/specs/2026-09-05-modelo-de-dados.md) | tabelas, estados, eventos, isolamento |
| [Métricas](docs/specs/2026-09-05-metricas-atendimento.md) | a definição exata de cada número. Vinculante |
| [Requisitos do Desk](docs/specs/2026-09-05-desk-requisitos.md) | como a tela do atendente se comporta |
| [Infraestrutura](docs/specs/2026-09-05-infraestrutura.md) | como roda em produção, LGPD, backup |
| [Comercial](docs/specs/2026-09-05-comercial.md) | contrato, RFP, cobrança, argumento de venda |
| [O que falta](docs/specs/2026-09-05-o-que-falta.md) | as lacunas conhecidas, sem maquiagem |
| [Marca](docs/marca/MARCA.md) | símbolo, paleta, tipografia |
| [Pesquisa](docs/pesquisa/) | levantamento de Blip, Chatwoot, Twenty, 2clix e concorrentes |

## Regra de licença, antes de copiar qualquer código

**Pode copiar**, mantendo o aviso de copyright: `chatwoot/*` exceto `chatwoot/enterprise/**`; e os
pacotes `twenty-ui`, `twenty-shared`, `twenty-sdk`, `twenty-client-sdk`. Todos MIT.

**Não pode copiar, só ler e reimplementar**: `twenty-server` e `twenty-front`, que são AGPLv3 e
contaminariam o Pipe inteiro, obrigando a publicar o código para qualquer cliente que o acesse pela
rede; e `chatwoot/enterprise/**`, que é proprietário pago.

Arquivo com código adaptado carrega no topo:
`Adaptado de <projeto> (<licença>) — <url do arquivo original>`

## Convenções

Português em nome de tabela, coluna, função, variável e comentário. As specs são em português e o
código acompanha, para não haver tradução mental no meio do caminho.

Comentário explica decisão, não repete código. Se o comentário descreve o que a linha faz, ele
sobra.
