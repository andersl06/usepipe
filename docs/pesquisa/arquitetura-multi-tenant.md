# Modelo de isolamento e topologia de entrega do Pipe

Pesquisa de 07/09/2026. Responde a uma pergunta: como o Pipe atende do cliente de 5 atendentes
até o de 300 com cláusula de separação no contrato, sem trocar de arquitetura no meio do caminho.

Toda afirmação que veio de fora tem URL. Onde não há fonte, é opinião assumida como tal.

## Resumo, para quem só vai ler isto

1. **O que existe hoje (um banco, `tenant_id`, RLS) é o degrau certo, e aguenta mais do que o
   Pipe vai vender.** Não é decisão provisória. Nenhuma fonte séria recomenda schema por tenant
   para quem quer crescer em número de clientes.
2. **O silo não substitui o pool: ele convive.** É o modelo *bridge* da AWS e a *partição vertical*
   da Microsoft. O código precisa suportar os dois, e é isso que custa — não a máquina extra.
3. **Kubernetes por cliente é a opção mais cara e mais lenta de todas, e não compra isolamento de
   dado** — compra isolamento de processo, que não é o que o cliente está pedindo no contrato.
   Recomendação: nem Kubernetes no degrau pequeno.
4. **O que quebra primeiro no pool não é a RLS, é o `VACUUM`.** Foi o que derrubou Notion e Figma.
   O particionamento mensal de `mensagem` e `evento_atendimento` que o Pipe já tem é exatamente a
   defesa contra isso, e por isso vale mais do que parece.
5. **O fork do Twenty tem um teto de clientes uma ordem de grandeza menor que o do Pipe**, porque
   isola por schema. Ele é o componente que vai forçar a separação primeiro, e a decisão 3 do doc
   do fork ("de quem é a verdade do dado") deve ser resolvida a favor do Pipe por causa disso.

---

## 1. Pool, silo ou bridge

A AWS nomeia três modelos: **silo** (recurso dedicado por tenant), **pool** (recurso compartilhado,
isolamento lógico) e **bridge** (mistura dos dois, camada a camada). A AWS é explícita de que o
bridge é o caso normal, não a exceção: "you will often discover that your solution will require a
mix of the silo and pool models"
([AWS, SaaS Tenant Isolation Strategies](https://docs.aws.amazon.com/whitepapers/latest/saas-tenant-isolation-strategies/the-bridge-model.html)).

A Microsoft chama a mesma coisa de *vertically partitioned deployments*: a maioria dos clientes em
infraestrutura compartilhada, e implantação de tenant único para quem exige performance ou
isolamento de dado — com um aviso que é o custo real da decisão: "Your codebase needs to be designed
to support both multitenant and single-tenant deployments"
([Azure Architecture Center, Tenancy models](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/considerations/tenancy-models)).

### Os três degraus no Postgres, com números

| | **Pool** (hoje) | **Silo por banco/schema** | **Silo por cluster/VM** |
|---|---|---|---|
| Como isola | `tenant_id` + RLS na mesma tabela | schema ou banco lógico por tenant | Postgres inteiro por tenant |
| Teto prático | "many thousands" de tenants; a fonte fala em milhões com discriminador ([PlanetScale](https://planetscale.com/blog/approaches-to-tenancy-in-postgres), [Crunchy Data](https://www.crunchydata.com/blog/designing-your-postgres-database-for-multi-tenancy)) | schema: "100s", degrada em "several thousand" (Crunchy); PlanetScale é mais duro: "likely won't scale beyond a few hundred tenants". Banco por tenant: "a few hundred", limitado por conexão | limitado por dinheiro e por gente, não por Postgres |
| Custo marginal por tenant | ~€1–3/mês no degrau 2 abaixo (rateio) | ~8 MB de template por banco novo (PlanetScale), mais catálogo | €16–43/mês de VM + operação |
| Complexidade operacional | uma migration, um backup, um upgrade | migration × N schemas; janela de deploy cresce linear | N stacks para atualizar, N backups para testar |
| O que quebra primeiro | `autovacuum` e wraparound de XID na maior tabela | `pg_catalog` (milhões de linhas, planner lento) e a janela de migration | o custo fixo e a divergência de versão entre instâncias |

Detalhes que valem citação:

- **O catálogo é o gargalo do schema-por-tenant.** Cada schema replica todas as tabelas e índices no
  `pg_catalog`; com muitos tenants os catálogos crescem a milhões de linhas e o *planner* fica lento
  ([PlanetScale](https://planetscale.com/blog/approaches-to-tenancy-in-postgres)). Isso não aparece
  em teste com 3 tenants — aparece no cliente 200.
- **Banco por tenant estoura o pooler antes de estourar o Postgres.** Pool do PgBouncer é por par
  usuário/banco (`default_pool_size` é "the maximum number of server connections to allow per
  user/database pair", [PgBouncer config](https://www.pgbouncer.org/config.html)), então N bancos =
  N pools, e o limite de conexões do servidor chega rápido
  ([PlanetScale](https://planetscale.com/blog/approaches-to-tenancy-in-postgres)).
- **O pool não morre por tamanho de disco.** A própria AWS registra 64 TB por instância PostgreSQL
  como teto do RDS ([AWS, Multitenancy on RDS](https://docs.aws.amazon.com/whitepapers/latest/multi-tenant-saas-storage-strategies/multitenancy-on-rds.html)).
  O Pipe não chega perto disso; o que chega antes é contenção de CPU e I/O, que a mesma página cita.
- **O que quebra primeiro no pool, na prática, é o `VACUUM`.** A Notion migrou porque "the Postgres
  `VACUUM` process began to stall consistently" e por risco de wraparound de TXID
  ([Notion Engineering](https://www.notion.com/blog/sharding-postgres-at-notion)); a Figma tinha o
  mesmo sintoma em tabelas de vários TB
  ([pganalyze](https://pganalyze.com/blog/5mins-postgres-figma-dbproxy-sharding-postgres)).
  **A migração da Notion custou 5 minutos de janela**, depois de meses de preparo — número que vale
  guardar para a §5.
- **RLS não é o custo que se imagina, se escrita direito.** Com a expressão embrulhada em subquery
  escalar, o Postgres avalia uma vez por consulta como `InitPlan` em vez de por linha; medido em
  ~0,02 ms de acréscimo com índice adequado
  ([Supabase/DevriQ](https://devriq.in/blog/supabase-row-level-security-performance-cost/),
  [Scott Pierce](https://scottpierce.dev/posts/optimizing-postgres-rls/)).

**Ação para o Pipe:** conferir se as políticas usam `(select current_setting('pipe.tenant_id', true))`
e não `current_setting(...)` solto. É a diferença entre um `InitPlan` e uma chamada por linha em
`mensagem`. Um `EXPLAIN` numa partição cheia responde em um minuto.

### Veredito

Pool para o produto inteiro. Silo por **VM inteira com o mesmo compose**, nunca por schema dentro do
banco compartilhado — schema por tenant é o pior dos dois mundos: paga o catálogo e a migration × N
sem entregar a separação física que o contrato pede.

---

## 2. Quando trocar de degrau — o gatilho objetivo

A regra: **o tenant sai do pool quando dispara um dos quatro gatilhos abaixo em duas medições
semanais consecutivas.** Duas medições porque pico sazonal (Black Friday do cliente) não é motivo
para migrar ninguém.

| # | Gatilho | Limite | De onde sai o número |
|---|---|---|---|
| **A** | **Contrato** | cláusula de separação física assinada | binário, não tem métrica |
| **B** | **Consumo** | tenant responde por **> 20% do tempo total de banco** em 7 dias corridos | o log estruturado já carrega `tenant_id` e duração; some por tenant |
| **C** | **Volume** | tenant passa de **20% das linhas de `mensagem`** ou de **250 GB** de dado próprio | acima disso, restaurar só ele deixa de ser tratável |
| **D** | **Saúde do pool** | `autovacuum` na partição quente não conclui em **6 h**, ou `age(datfrozenxid) > 500M` | sinal da Notion e da Figma, acima |

Os gatilhos A, B e C movem **um tenant**. O gatilho D **não move ninguém** — ele diz que o pool
inteiro precisa de mais máquina, de partição menor (quinzenal em vez de mensal) ou de descarte de
partição fria. Confundir os dois é migrar cliente para resolver problema de banco.

Sobre o gatilho A, a AWS dá o conselho comercial junto com o técnico: SaaS que oferece silo
normalmente **não publica isso como plano**, para limitar quantos escolhem — "If too many of your
tenants fall into this model, you'll begin to fall back to a fully siloed model" — e exige que o
cliente do silo **rode a mesma versão do produto** que o pool, para que a operação continue sendo um
painel só ([AWS, Tier-based isolation](https://docs.aws.amazon.com/whitepapers/latest/saas-tenant-isolation-strategies/tier-based-isolation.html)).
Isso vira duas regras de contrato do Pipe:

1. Separação física é **negociação, não item de tabela de preço**.
2. Cliente em silo **não escolhe quando atualiza**. Se escolher, o silo vira produto próprio e a
   conta de manutenção dobra por cliente.

---

## 3. Vizinho barulhento no Postgres compartilhado

Os cinco pontos de contenção, na ordem em que aparecem: CPU, memória (consulta que derrama para
disco), I/O, conexões e locks ([Neon](https://neon.com/blog/noisy-neighbor-multitenant)).

### O que fazer, em ordem de retorno

**1. `statement_timeout` por classe de carga, não por tenant.** A recomendação de mercado é
timeout diferenciado por camada de plano — o exemplo da Neon usa 60 s para Enterprise e 15 s para
Basic. Para o Pipe faz mais sentido separar por **rota**, porque o dano vem da consulta cara, não do
cliente caro:

| Papel Postgres | Uso | `statement_timeout` sugerido |
|---|---|---|
| `pipe_app_desk` | tela do atendente | 5 s |
| `pipe_app_gestao` | relatório e agregação | 30 s |
| `pipe_app_worker` | entrega, IA, agregação noturna | 120 s |

**2. `idle_in_transaction_session_timeout` sempre ligado.** É o item que a Neon marca como
"critical configuration detail". Transação esquecida aberta segura tupla morta e é o caminho direto
para o gatilho D.

**3. PgBouncer em modo `transaction`, com pool por papel.** O ponto honesto: **o PgBouncer não sabe
cotar por tenant no modelo pool.** `default_pool_size` é por par usuário/banco, `max_db_connections`
é por banco e `max_user_connections` é por usuário ([PgBouncer](https://www.pgbouncer.org/config.html)) —
e no pool todos os tenants compartilham o mesmo par. Cota por tenant tem de ser feita:

- **na aplicação**, com um semáforo por `tenant_id` no caminho de consulta pesada; e
- **na fila**, com concorrência e limite de taxa por tenant no BullMQ, que é onde a carga de IA e de
  agregação realmente mora.

Quem promete "cotas por tenant no PgBouncer" está falando do modelo banco-por-tenant, não do pool.

**4. Particionamento — o Pipe já fez o que importa.** `mensagem` e `evento_atendimento` particionadas
por mês (`pipe_criar_particao_mes`) significam que o `autovacuum` trabalha partição a partição, e que
partição fria pode ser desanexada e arquivada em vez de vacuada para sempre. Essa é literalmente a
defesa contra o que quebrou a Notion. Duas coisas a acrescentar quando o volume subir:

- **desanexar e arquivar** partição além da retenção contratada (já previsto na §6 do doc de infra);
- **índice com `tenant_id` como primeira coluna** nas partições, para que o filtro da RLS seja
  resolvido no índice.

**5. Sub-particionar por tenant só depois do gatilho C.** É complexidade que só se paga quando um
tenant sozinho domina a tabela — e, quando chegar lá, o Citus resolve melhor: a função
`isolate_tenant_to_new_shard(tabela, tenant_id)` move um tenant para um shard dedicado, e desde o
Citus 11 isso é **open source** e desde o 11.1 roda **sem bloquear escrita**
([Citus 11 fully open source](https://www.citusdata.com/blog/2022/06/17/citus-11-goes-fully-open-source/),
[Citus 11.1](https://www.citusdata.com/blog/2022/09/19/citus-11-1-shards-postgres-tables-without-interruption/)).
Registrar como saída disponível, não adotar agora: Citus é mais uma peça para operar.

---

## 4. Kubernetes por cliente vale a pena?

Resposta curta: **não, e por três motivos independentes.**

**Motivo 1 — não é o isolamento que o cliente pediu.** O guia de boas práticas do EKS é direto: o
Kubernetes é um orquestrador de tenant único, e "the cluster is the only construct that provides a
strong security boundary"
([EKS Best Practices, Tenant Isolation](https://docs.aws.amazon.com/eks/latest/best-practices/tenant-isolation.html)).
Só que o que o contrato do cliente grande cobra é separação **de dado**, e essa vem do Postgres
dedicado — que se entrega com uma VM e o mesmo `docker-compose`, sem cluster nenhum.

**Motivo 2 — custo.** O mesmo guia lista os três problemas do cluster por tenant: paga-se o plano de
controle de cada cluster, não se compartilha computação entre clusters, e "this will eventually cause
fragmentation where a subset of your clusters are underutilized while others are overutilized". Em
número: plano de controle do EKS é **US$ 0,10/h = US$ 73/mês por cluster**, antes de qualquer carga
([CloudZero](https://www.cloudzero.com/blog/eks-pricing/)). Trinta clientes = US$ 2.190/mês só de
plano de controle.

**Motivo 3 — velocidade.** "Creating a cluster per tenant will be slow relative to creating a
namespace" (EKS Best Practices). Namespace nasce em segundos; cluster gerenciado, em minutos a
dezenas de minutos. Onboarding de cliente pequeno não pode depender disso.

### As alternativas, com custo

Comparativo medido com 50 tenants (nós baratos, sem contar plano de controle gerenciado)
([vCluster](https://www.vcluster.com/blog/multi-tenancy-in-kubernetes-comparing-isolation-and-costs)):

| Opção | Isolamento | Custo por tenant/mês | Provisionamento |
|---|---|---|---|
| Namespace por tenant (HNC) | mais fraco | ~0 (operador: 300 MB RAM, 100 mCPU no total) | instantâneo |
| Cluster virtual (vCluster) | médio — plano de controle por tenant | ~US$ 5 | minutos |
| Cluster por tenant (Karmada) | mais forte | ~US$ 12 **+ US$ 73 se gerenciado (EKS)** | minutos |

E a quarta opção, que é a recomendada para o Pipe hoje:

| Opção | Isolamento | Custo | Observação |
|---|---|---|---|
| **Sem Kubernetes** — Docker Compose atrás do Traefik | por VM, quando quiser | €8,49–15,99/mês por VM compartilhada (Hetzner CX33/CX43) | é o que a §1 do doc de infra já descreve |

Preços de VM usados como referência
([Hetzner, set/2026](https://costgoat.com/pricing/hetzner)): CX33 (4 vCPU/8 GB) €8,49; CX43
(8 vCPU/16 GB) €15,99; **CCX13** (2 vCPU dedicadas/8 GB) €42,99; **CCX23** (4 vCPU dedicadas/16 GB)
€85,99; CCX33 (8/32 GB) €138,49. Vale notar que a Hetzner **reajustou a linha CCX em +110% a +176%
em 15/06/2026** ([wz-it](https://wz-it.com/en/blog/hetzner-price-increase-june-2026-cpx-ccx-alternatives/)) —
o vCPU dedicado ficou caro, o que empurra ainda mais a favor do pool. Comparação: Hostinger KVM 4
US$ 14,99 promocional e **US$ 28,99 na renovação**; KVM 8 US$ 29,99 e **US$ 73,99 na renovação**
([HostAdvice](https://hostadvice.com/hosting-company/hostinger-reviews/vps-pricing/)) — orçar sempre
pelo preço de renovação, não pelo de captura.

**Recomendação:** Kubernetes só entra quando houver **mais de um nó de aplicação a orquestrar por
razão de carga**, e aí como **namespace por tenant em cluster único**, nunca cluster por tenant. Até
lá, Compose + Traefik. Quando entrar, k3s auto-hospedado numa VM em vez de EKS/GKE elimina os US$ 73
por cluster inteiros.

---

## 5. Migrar um tenant do pool para o silo sem parar o cliente

O caminho é replicação lógica com **filtro de linha**, disponível desde o PostgreSQL 15
([PostgreSQL, Row Filters](https://www.postgresql.org/docs/17/logical-replication-row-filter.html)).
O Pipe roda Postgres 16, então está coberto.

```
1. Provisiona a VM do silo com o MESMO compose e a MESMA versão do produto.
2. No pool:  CREATE PUBLICATION pub_tenant_x FOR TABLE ... WHERE (tenant_id = '…');
3. No silo:  CREATE SUBSCRIPTION … (copy_data = true)
   → a cópia inicial JÁ respeita o filtro: "only data that satisfies the row filter
     expressions is copied to the subscriber".
4. Roda em paralelo por dias. Compara contagens e somas por tabela (leitura escura).
5. Corte: bloqueia escrita do tenant por segundos, espera o lag zerar,
   vira a rota do tenant no mapa tenant→implantação, libera.
6. Depois de 30 dias sem incidente, apaga as linhas do tenant no pool.
```

**As três armadilhas, todas verificáveis antes:**

1. **`REPLICA IDENTITY`.** Se a publicação inclui `UPDATE`/`DELETE`, "the row filter WHERE clause
   must contain only columns that are covered by the replica identity". Como o filtro é por
   `tenant_id`, ou a `replica identity` das tabelas inclui `tenant_id`, ou é preciso
   `REPLICA IDENTITY FULL` (mais caro no WAL). **Conferir tabela a tabela antes de prometer prazo.**
2. **Tabelas particionadas.** `mensagem` e `evento_atendimento` são particionadas; publicar a tabela
   pai exige `publish_via_partition_root`, senão a assinatura espera as partições nominalmente.
3. **Sequências e a chave estrangeira de `0003_chaves_cruzadas`** não vêm pela replicação lógica.
   Sequência tem de ser reposicionada no corte.

**O que torna isso seguro não é o Postgres, é o roteamento.** É a "camada de mapeamento tenant →
implantação" da Microsoft ([Azure, Tenancy models](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/considerations/tenancy-models)):
uma tabela que diz em qual instância cada tenant vive, consultada no login. **Isso precisa existir
antes do primeiro cliente de silo, não no dia dele** — hoje o tenant é resolvido pelo login (§3 do
doc de infra), e falta o segundo campo: em qual implantação. Um campo `implantacao` no registro do
tenant, lido na emissão da sessão, é o trabalho inteiro. Feito cedo, custa uma tarde; feito na
véspera do cliente grande, custa a migração.

Ordem de grandeza da janela: a Notion, com volume incomparavelmente maior, fez o corte em
**5 minutos de manutenção programada** depois de meses de preparo
([Notion](https://www.notion.com/blog/sharding-postgres-at-notion)). Para um tenant do Pipe, o corte
é de segundos; o que leva tempo é a verificação.

---

## 6. O que o fork do Twenty muda

Confirmado no clone: o Twenty nomeia o schema de cada workspace como
`workspace_${uuidToBase36(workspaceId)}`
(`pipe-crm-fork/packages/twenty-server/src/engine/workspace-datasource/utils/get-workspace-schema-name.util.ts`).
São **32 arquivos `*.workspace-entity.ts`** no servidor, ou seja, da ordem de 32 tabelas por
workspace antes de qualquer campo customizado — e campo customizado no Twenty vira coluna e, em
alguns casos, tabela. Para comparação, o Pipe inteiro tem ~91 tabelas, **uma vez só**.

Contra a referência da §1:

| Clientes | Tabelas no catálogo do CRM | Diagnóstico |
|---|---|---|
| 50 | ~1.600 | tranquilo |
| 200 | ~6.400 | zona em que a PlanetScale diz que já não escala e a Crunchy fala em degradação |
| 1.000 | ~32.000 | fora de questão numa instância só |

**Três consequências práticas:**

1. **O teto de clientes do CRM chega antes do teto do Pipe, por uma ordem de grandeza.** Não é
   defeito do fork; é o modelo dele. Planejar o CRM como **fila de instâncias** — N workspaces por
   instância do Twenty, com uma instância nova a cada ~150 clientes — em vez de uma instância que
   cresce para sempre. Isso é o *bin packing* da Microsoft aplicado a um serviço só.
2. **O banco do fork tem de ser um banco lógico separado, mesmo que no mesmo cluster.** O
   `pg_catalog` é por banco: um banco separado já isola o inchaço do catálogo do Twenty do *planner*
   do Pipe. Schema separado **não** isola. Custo dessa escolha: o PgBouncer passa a ter um pool a
   mais (pool é por par usuário/banco), o que é barato.
3. **A ironia útil: o modelo pior para escalar é melhor para migrar.** Mover um workspace do Twenty
   para instância dedicada é `pg_dump -n workspace_xxx` e restaurar. Mover um tenant do Pipe exige
   toda a §5. Ou seja, **quando o cliente grande exigir separação, a parte CRM é a fácil.**

**Sobre a decisão 3 em aberto do doc do fork ("de quem é a verdade do dado"):** esta pesquisa aponta
para **o Pipe continuar dono de `mensagem`, `atendimento` e `evento_atendimento`**, e o fork ser dono
só do que é CRM (conta, contato, oportunidade). Motivo de arquitetura, não de gosto: mover o histórico
de conversa para dentro de um modelo schema-por-workspace multiplica **o catálogo e o volume ao mesmo
tempo**, e joga o dado que mais cresce exatamente no modelo que menos aguenta crescer. Se a conversa
tiver de aparecer no CRM, que apareça por chamada de API — que é, aliás, a fronteira que a licença já
obriga.

---

## 7. A recomendação em degraus

Câmbio suposto para as colunas em real: **R$ 6,00/€** e **R$ 5,50/US$** (suposição, não fonte).
Valores de infraestrutura, sem contar Meta, IA nem storage de objetos.

### Degrau 1 — uma máquina, do primeiro cliente até ~15

Compose completo numa VM: Postgres, Redis, api, workers, os três fronts, Traefik. Backup diário com
WAL contínuo, restauração testada por mês.

- **Máquina:** 1 × CX43 (8 vCPU/16 GB) — €15,99/mês (~R$ 96)
- **Total:** ~€20/mês com IPv4 e snapshot (~R$ 120), ou **~€1,3 por cliente/mês** com 15 clientes
- **Gatilho de saída:** Postgres acima de 70% de CPU no pico, ou fila do BullMQ acumulando na hora
  cheia (os dois já estão na §7 do doc de infra)

### Degrau 2 — banco separado, até ~150 clientes

Postgres na sua própria máquina, com vCPU dedicada; app e workers em outra; PgBouncer em modo
transação na frente; réplica de leitura quando relatório começar a competir com atendimento.

- **Banco:** 1 × CCX23 (4 vCPU dedicadas/16 GB) — €85,99/mês
- **App + workers:** 1 × CX43 — €15,99/mês
- **Réplica de leitura (quando doer):** 1 × CX53 — €29,49/mês
- **Total:** €102–131/mês (~R$ 610–790), ou **~€0,80 por cliente/mês** com 150 clientes
- **Gatilho de saída:** os quatro gatilhos da §2. O gatilho D leva a mais máquina ou partição menor;
  A, B e C levam ao degrau 3 — **para aquele cliente, não para todos**

### Degrau 3 — silo por cliente, convivendo com o pool

O mesmo compose, um tenant só, VM própria, **mesma versão do produto**. O pool continua existindo e
continua sendo o normal.

- **Cliente médio em silo:** 1 × CX43 — €15,99/mês (~R$ 96)
- **Cliente grande em silo (centenas de atendentes):** CCX23 para o banco + CX43 para app —
  €102/mês (~R$ 610)
- **Custo escondido, e é o maior:** ~1–2 h/mês de operação por silo (publicação, verificação de
  backup, incidente) e a disciplina de nunca deixar a versão divergir
- **Preço a cobrar:** a AWS descreve o silo como oferta de "substantially higher price point"
  ([tier-based isolation](https://docs.aws.amazon.com/whitepapers/latest/saas-tenant-isolation-strategies/tier-based-isolation.html)).
  O piso é infraestrutura + operação; o teto é o que o contrato de separação vale para o cliente
- **Gatilho de saída:** mais de ~8 silos ativos. Aí a operação manual deixa de escalar e vale
  automatizar provisionamento (ainda sem Kubernetes) ou revisar a política comercial da §2

### O que NÃO fazer, em nenhum degrau

| Ideia | Por que não |
|---|---|
| Schema por tenant no banco compartilhado | paga catálogo e migration × N sem entregar separação física ([PlanetScale](https://planetscale.com/blog/approaches-to-tenancy-in-postgres)) |
| Cluster Kubernetes gerenciado por cliente | US$ 73/mês por cluster antes de qualquer carga, fragmentação de nós, provisionamento lento ([EKS](https://docs.aws.amazon.com/eks/latest/best-practices/tenant-isolation.html), [CloudZero](https://www.cloudzero.com/blog/eks-pricing/)) |
| Publicar "instância dedicada" na tabela de preços | vira o padrão pedido, e o produto volta a ser silo integral ([AWS](https://docs.aws.amazon.com/whitepapers/latest/saas-tenant-isolation-strategies/tier-based-isolation.html)) |
| Deixar cliente de silo escolher quando atualiza | duas versões em produção multiplicam a conta de manutenção por cliente |
| Adiar o campo `implantacao` no registro do tenant | é o que torna a migração da §5 uma virada de rota em vez de um deploy |

---

## 8. As três tarefas que esta pesquisa gera

1. **Conferir a forma das políticas de RLS** — `(select current_setting('pipe.tenant_id', true))`
   embrulhado em subquery, e índice com `tenant_id` na frente nas partições de `mensagem`. Uma tarde.
2. **Adicionar `implantacao` ao registro do tenant** e ler na emissão da sessão. Hoje vale uma
   migration; na véspera do primeiro cliente de silo, vale uma semana.
3. **Ligar `statement_timeout` por papel e `idle_in_transaction_session_timeout`.** É a defesa mais
   barata contra vizinho barulhento que existe, e não depende de nada mais estar pronto.

## Fontes

- AWS — [SaaS Tenant Isolation Strategies: the bridge model](https://docs.aws.amazon.com/whitepapers/latest/saas-tenant-isolation-strategies/the-bridge-model.html)
- AWS — [SaaS Tenant Isolation Strategies: tier-based isolation](https://docs.aws.amazon.com/whitepapers/latest/saas-tenant-isolation-strategies/tier-based-isolation.html)
- AWS — [SaaS Storage Strategies: multitenancy on Amazon RDS](https://docs.aws.amazon.com/whitepapers/latest/multi-tenant-saas-storage-strategies/multitenancy-on-rds.html)
- AWS — [EKS Best Practices: tenant isolation](https://docs.aws.amazon.com/eks/latest/best-practices/tenant-isolation.html)
- Microsoft — [Azure Architecture Center: tenancy models for a multitenant solution](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/considerations/tenancy-models)
- PlanetScale — [Approaches to tenancy in Postgres](https://planetscale.com/blog/approaches-to-tenancy-in-postgres)
- Crunchy Data — [Designing your Postgres database for multi-tenancy](https://www.crunchydata.com/blog/designing-your-postgres-database-for-multi-tenancy)
- Crunchy Data — [Row level security for tenants in Postgres](https://www.crunchydata.com/blog/row-level-security-for-tenants-in-postgres)
- Neon — [The noisy neighbor problem in multitenant architectures](https://neon.com/blog/noisy-neighbor-multitenant)
- Notion — [Herding elephants: lessons learned from sharding Postgres at Notion](https://www.notion.com/blog/sharding-postgres-at-notion)
- pganalyze — [How Figma built DBProxy for sharding Postgres](https://pganalyze.com/blog/5mins-postgres-figma-dbproxy-sharding-postgres)
- PostgreSQL — [Logical replication row filters](https://www.postgresql.org/docs/17/logical-replication-row-filter.html)
- PgBouncer — [Configuration](https://www.pgbouncer.org/config.html)
- Citus — [Citus 11 goes fully open source](https://www.citusdata.com/blog/2022/06/17/citus-11-goes-fully-open-source/) · [Citus 11.1 shards without interruption](https://www.citusdata.com/blog/2022/09/19/citus-11-1-shards-postgres-tables-without-interruption/)
- vCluster — [Multi-tenancy in Kubernetes: comparing isolation and costs](https://www.vcluster.com/blog/multi-tenancy-in-kubernetes-comparing-isolation-and-costs)
- CloudZero — [EKS pricing and cost optimization (2026)](https://www.cloudzero.com/blog/eks-pricing/)
- CostGoat — [Hetzner cloud VPS pricing (set/2026)](https://costgoat.com/pricing/hetzner) · wz-it — [Reajuste CPX/CCX de junho/2026](https://wz-it.com/en/blog/hetzner-price-increase-june-2026-cpx-ccx-alternatives/)
- HostAdvice — [Hostinger VPS pricing com preços de renovação](https://hostadvice.com/hosting-company/hostinger-reviews/vps-pricing/)
- DevriQ — [Supabase RLS performance & optimization](https://devriq.in/blog/supabase-row-level-security-performance-cost/) · Scott Pierce — [Optimizing Postgres RLS](https://scottpierce.dev/posts/optimizing-postgres-rls/)
