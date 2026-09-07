# Twenty CRM — Relatório de Extensibilidade (para o projeto Pipe)

> **Somente leitura, em 07/09/2026.** Este levantamento continua útil para entender decisões de
> arquitetura, mas o Pipe não copia código do Twenty sob licença nenhuma, MIT inclusive. Ver a
> regra de licença no `README.md`.

Fonte: clone raso de `github.com/twentyhq/twenty` (sparse-checkout de `twenty-server`, `twenty-front`, `twenty-shared`, `twenty-ui`) + scripts reais em `C:/Users/anderson.linhares/twenty-crm/*.mjs`. Versão de referência: `twenty-sdk@2.39.0` (`packages/twenty-sdk/package.json`).

## 1. Monorepo e stack

Yarn 4 + Nx, Node `^24.5.0` (`package.json:1`). Pacotes relevantes em `packages/`:
- `twenty-server` (NestJS + GraphQL + TypeORM/Postgres + BullMQ/Redis) — o core.
- `twenty-front` (React 19 + Recoil + Emotion) — SPA.
- `twenty-shared`, `twenty-ui` — tipos e design system, **licença MIT** (não AGPL).
- **Novidade relevante**: `twenty-sdk`, `twenty-cli`, `create-twenty-app`, `twenty-client-sdk`, `twenty-apps/{examples,internal,public,fixtures}` — uma plataforma de "apps" declarativa (tipo plugin), também MIT.

**Licença** (`LICENSE:1-9`): AGPLv3 no núcleo, com duas exceções: (a) arquivos marcados `/* @license Enterprise */` são licença comercial fechada (permissões/roles avançadas, SSO SAML/OIDC, alguns recursos de billing/admin); (b) `twenty-shared`, `twenty-ui`, `twenty-sdk`, `twenty-client-sdk`, `create-twenty-app` e os apps em `twenty-apps` são **MIT**. Implicação para fork comercial: dá para construir e vender um "Pipe app" via o SDK MIT sem tocar AGPL; mas alterar/redistribuir o `twenty-server` core exige AGPL (código aberto se distribuído, inclusive via rede/SaaS — cláusula de "network use").

## 2. Metadata engine — como nascem objetos e campos

Schema é **dinâmico por workspace**, não EAV: cada workspace ganha um schema Postgres próprio, criado em `workspace-schema.service.ts:37-43` (`getWorkspaceSchemaName(workspaceId)` → `queryRunner.createSchema(schemaName, true)`). Cada objeto/campo custom vira tabela/coluna real.

Metadados vivem em tabelas centrais: `object-metadata` (`engine/metadata-modules/object-metadata/object-metadata.entity.ts`) e `field-metadata` (`.../field-metadata/field-metadata.entity.ts`). Tipos de campo suportados (`twenty-shared/src/types/FieldMetadataType.ts:1-27`): TEXT, NUMBER, NUMERIC, BOOLEAN, DATE(_TIME), CURRENCY, ADDRESS, LINKS, EMAILS, PHONES, SELECT, MULTI_SELECT, RELATION, MORPH_RELATION, RATING, RICH_TEXT, RAW_JSON, ARRAY, FULL_NAME, ACTOR, FILES etc. **Não existe tipo FORMULA nativo** hoje — campo calculado precisa ser resolvido fora (workflow, logic function ou app).

Standard vs custom: a flag antiga `isCustom` foi **removida na versão 2.12** (`object-metadata.entity.ts:113-119`, comentário `2.12.0_DropIsCustomFromObjectAndFieldMetadataFastInstanceCommand`). Hoje a distinção é por **aplicação dona do objeto** — todo objeto/campo tem `applicationId` (visível em `field-metadata/dtos/create-field.input.ts`, `object-metadata/dtos/create-object.input.ts`): os objetos "de fábrica" (Company, Person, Opportunity...) pertencem à app interna `twenty-standard-application` (`engine/workspace-manager/twenty-standard-application/`), e tudo criado pelo usuário/app pertence a outra application. Isso já é a arquitetura de plugin: standard = "app pré-instalada".

**Duas formas de criar um objeto novo (ex.: Lead, Demanda, Conversa)**:
1. **Metadata GraphQL API** (runtime, via UI de Settings ou chamada direta): mutations `createOneObject` (`object-metadata/object-metadata.resolver.ts:335-352`) e `createOneField` (`field-metadata/field-metadata.resolver.ts:245-262`). Cada chamada dispara uma `workspace-migration` que altera o schema Postgres do workspace de fato.
2. **Twenty Apps SDK** (novo, recomendado para algo versionável/deployável): arquivo declarativo com `defineObject`/`defineField` de `twenty-sdk/define`. Exemplo real, `twenty-apps/examples/hello-world/src/objects/example-object.ts`:
```ts
export default defineObject({
  universalIdentifier: EXAMPLE_OBJECT_UNIVERSAL_IDENTIFIER, // UUID estável entre ambientes
  nameSingular: 'exampleItem', namePlural: 'exampleItems',
  labelSingular: 'Example item', labelPlural: 'Example items',
  icon: 'IconBox',
  labelIdentifierFieldMetadataUniversalIdentifier: NAME_FIELD_UNIVERSAL_IDENTIFIER,
  fields: [{ universalIdentifier: ..., type: FieldType.TEXT, name: 'name', label: 'Name' }],
});
```
Fluxo: `yarn twenty remote:add` (auth) → `yarn twenty dev` (build + sync ao vivo + gera client tipado) → aparece em `/settings/applications`. Isso é essencialmente um app store interno com CLI de dev, hot-reload e testes de integração (`hello-world/README.md`).

## 3. APIs

Duas GraphQL APIs distintas (`engine/api/graphql/*-graphql-api.module.ts`): **Core API** (CRUD dos dados do workspace, schema gerado dinamicamente a partir do metadata — `workspace-schema.factory.ts`) e **Metadata API** (CRUD de objetos/campos/views/roles — o "schema do schema"). Também há **REST** (`engine/api/rest/`), auto-derivado do metadata, no padrão `/rest/<namePlural>` — confirmado nos scripts reais: `POST /rest/people`, `GET /rest/people/:id`, `POST /rest/disparos` (`C:/Users/anderson.linhares/twenty-crm/smoke-test.mjs:49-67`), aceitando `RAW_JSON`, multi-select e números com precisão sem perda (linhas 70-75 do mesmo arquivo validam isso).

Auth: API key Bearer para integrações (`engine/core-modules/api-key/`, usado nos `.mjs` via header `Authorization: Bearer ${KEY}`), JWT para sessão de usuário (`engine/guards/jwt-auth.guard.ts`, `engine/core-modules/auth/strategies/jwt.auth.strategy.ts`), mais OAuth Google/Microsoft e **SSO enterprise SAML/OIDC** (`auth/strategies/saml.auth.strategy.ts`, `oidc.auth.strategy.ts` — provavelmente sob a licença comercial). Webhooks configuráveis por workspace (`engine/metadata-modules/webhook/webhook.service.ts`), disparados em eventos de registro. Limite conhecido: throttler nativo com headers de rate-limit (`engine/core-modules/throttler/`, `usage-limit/utils/build-rate-limit-response-headers.util.ts`) — em self-host dá pra ajustar/remover.

## 4. Workflows/automação nativa

Motor de automação completo em `twenty-shared/src/workflow/schemas/`. Gatilhos (`base-trigger-schema.ts:11`): `DATABASE_EVENT` (criação/alteração de registro), `MANUAL`, `CRON`, `WEBHOOK`. Ações disponíveis (arquivos `*-action-schema.ts`): create/update/delete/upsert/find record, send-email, draft-email, create-calendar-event, http-request, code (sandbox), logic-function, ai-agent, if-else, filter, iterator, form, delay, workflow-file, pick-record. Ou seja: já é um n8n/Zapier embutido — suficiente para boa parte de "lead scoring" e roteamento sem sair do produto, mas sem UI de reporting sobre execuções tão madura quanto n8n.

## 5. Views, filtros, kanban, dashboards

Sistema de views (`engine/metadata-modules/flat-view/`, front em `twenty-front/src/modules/views/`) cobre tabela, kanban (agrupado por SELECT/RELATION), filtros e ordenações salvas por objeto. **Dashboards nativos já existem** (`modules/dashboard/`, `modules/dashboard/chart-data/` com bar/line/pie chart resolvers e limites de série documentados em constantes, ex. `line-chart-maximum-number-of-stacked-series.constant.ts`) — isso é recente e substitui o que antes era gap total. Falta ainda: exportação avançada, drill-down cruzado entre gráficos, agendamento/envio de relatórios.

## 6. Multi-tenant e self-hosted

Isolamento é por **schema Postgres dedicado por workspace** (`workspace-schema.service.ts`), não por linha com tenant_id — forte isolamento de dados dentro do mesmo banco. Em self-host single-tenant, isso simplifica: um único workspace, sem necessidade de lógica cross-tenant, mas o mecanismo de schema dinâmico continua existindo (não há atalho para "workspace único fixo" no código — é tratado igual a qualquer outro).

## 7. Pontos de extensão relevantes para o Pipe

- **Lead scoring / campos calculados**: sem FORMULA nativo — implementar como logic function (`twenty-apps/.../logic-functions/*.ts`, roda em sandbox Node com `twenty-client-sdk/core` CoreApiClient) escrita via `DATABASE_EVENT` trigger de workflow, ou como serviço satélite que escreve de volta via REST/GraphQL Core API.
- **Importação de outros CRMs**: via REST/GraphQL Core API com API key — mesmo caminho já usado nos scripts `.mjs` do usuário (`schema-banking.mjs`, `campos-funil.mjs`) para popular campos custom em Person.
- **Timeline de atividades / histórico de conversas com resumo IA**: `modules/timeline/` já tem um mecanismo de regras (`timeline-activity-rule.type.ts`) que resolve eventos de qualquer standard/custom object para a timeline de um registro relacionado (via `resolve-timeline-activity-*.util.ts`) — dá pra registrar eventos de "Conversa"/"Chatwoot" custom object e fazê-los aparecer na timeline de Person/Company nativamente.
- **AI Agents nativos**: `defineAgent` (`twenty-apps/examples/hello-world/src/agents/example-agent.ts`) — agente com prompt e ferramentas, plugável num app; útil para o "resumo por IA" ficar dentro do próprio Twenty em vez de serviço externo.

## 8. Dificuldades de manter fork sincronizado com upstream

O core (`twenty-server`, `twenty-front`) evolui rápido e mexe em decorators/entities de standard objects (o próprio histórico de `upgrade-version-command/2-*` mostra dezenas de migrações estruturais por versão, ex. remoção de `isCustom` na 2.12, mudança de readability na 2.39). Fazer fork hard do core amplia o custo de merge a cada release. **Estratégia recomendada**: tratar o Twenty como upstream não-modificado (apenas objetos/campos custom + apps via SDK) e construir tudo específico do Pipe (scoring, resumo IA, integrações) como **app/serviço satélite via API** (REST/GraphQL + webhooks + logic functions), do jeito que os `.mjs` já fazem. Isso evita AGPL copyleft sobre código proprietário e sobrevive a upgrades de versão sem merge manual.

## 9. Frontend: design system, white-label, i18n

Design system em `twenty-ui` (MIT), tema com CSS vars claras/escuras (`twenty-ui/src/theme-constants/theme-light.css`, `theme-dark.css`, `ThemeProvider.tsx`). Branding por workspace já existe nativamente: `Workspace` tem `logo`/`logoFileId` e `displayName`/`subdomain` (`engine/core-modules/workspace/workspace.entity.ts:83-99,260`) — trocar logo e nome é suportado sem fork, cor de destaque também é configurável por tema. i18n via Lingui, **pt-BR já traduzido de fábrica** em server, front e emails (`twenty-front/src/locales/pt-BR.po`, `twenty-server/.../i18n/locales/pt-BR.po`, `twenty-emails/src/locales/pt-BR.po`).

---

## Resumo executivo (conclusões acionáveis)

O Twenty deixou de ser "só um CRM open-source com metadata engine" — a versão atual (twenty-sdk 2.39) já embute uma **plataforma de apps completa**: CLI de dev com hot-reload (`yarn twenty dev`), SDK declarativo MIT (`defineObject`, `defineField`, `defineAgent`, `defineLogicFunction`, `defineApplication`), marketplace interno (`/settings/applications`), agentes de IA nativos e um motor de workflow full-featured (4 tipos de gatilho, ~15 tipos de ação). Isso muda a recomendação: **não é preciso fazer fork hard do core para o Pipe**. O caminho de menor atrito e menor risco de licença é:

1. **Modelagem de dados via API, não fork**: criar objetos como `Lead`, `LeadScore`, `Conversa`, `Demanda` via Metadata API (mutations `createOneObject`/`createOneField`) ou, melhor, como um **Twenty App versionado** com `twenty-sdk` — isso dá controle de versão, ambiente de dev/staging e deploy reproduzível, sem tocar no core AGPL. Os scripts `.mjs` já em uso (`schema-banking.mjs` etc.) provam que o caminho REST + API key funciona bem para popular e ler campos custom (incluindo RAW_JSON e multi-select) — mas devem migrar para a abordagem `defineObject` do SDK para ganhar idempotência e versionamento nativo, em vez de scripts imperativos com `--dry-run` caseiro.

2. **Lead scoring e campos calculados**: como não há FORMULA nativo, construir como **logic function** (roda dentro do Twenty, sandboxed, chamada via workflow em `DATABASE_EVENT`) que escreve o score de volta no registro. Isso mantém a lógica versionada dentro do app do Pipe e visível nos logs de execução do workflow, evitando um n8n externo para essa parte específica.

3. **Timeline de conversas com resumo por IA**: aproveitar o mecanismo de timeline-activity-rule para plugar eventos do Chatwoot/WhatsApp como atividades nativas ligadas a Person/Company, e usar `defineAgent` para gerar o resumo dentro do próprio Twenty (reduz peças móveis vs. um serviço de IA externo).

4. **Importação de outros CRMs (Salesforce/Twenty-crm atual)**: via REST/GraphQL Core API com API key, mesmo padrão já validado localmente; para volume alto, preferir GraphQL em lote a REST por registro.

5. **White-label**: trocar nome e logo é suportado nativamente por workspace, sem fork — suficiente para "empresa cliente vê a marca dela" em um único workspace self-hosted.

6. **Licenciamento**: qualquer coisa que precise ficar fechada/proprietária deve viver fora do `twenty-server`/`twenty-front` (AGPL) — como app SDK (MIT) ou serviço satélite consumindo a API. Modificar o core AGPL e distribuir/operar como SaaS exige abrir esse código sob a cláusula de uso em rede da AGPLv3.

7. **Risco de manutenção**: o core sofre migrações estruturais frequentes entre versões (removeu `isCustom`, mudou permissões de leitura, etc.). Ficar apenas na camada de API/SDK isola o Pipe dessas mudanças internas; um fork hard do `twenty-server` herdaria esse custo de merge a cada upgrade.
