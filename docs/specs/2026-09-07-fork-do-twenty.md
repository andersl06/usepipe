# Fork do Twenty como base do CRM

**Decisão do dono, tomada em 07/09/2026, com a consequência de licença explicada e aceita.**
Vinculante. Este documento existe para que ninguém a redescubra por acidente daqui a seis meses.

## 1. A decisão

O CRM do Pipe passa a ser um **fork de `twenty-server` e `twenty-front`**, customizado para a nossa
identidade e para o nosso modelo. Não é uso da plataforma de aplicativos, não é leitura para
reimplementar: é fork, com liberdade de mexer no núcleo.

O clone raso já está em `../pipe-crm-fork` (316 MB, versão `0.2.1`, `yarn@4.13.0`).

## 2. A consequência, escrita para não haver dúvida

`twenty-server` e `twenty-front` são **AGPLv3**. O `LICENSE` do projeto traz uma permissão adicional
sob a seção 7 — a *Twenty Application Exception* — mas ela tem um limite explícito:

> "This additional permission does not apply to Twenty itself: if you modify Twenty, the AGPLv3,
> including section 13, applies to your modified version in full."

Fork é modificação. Logo:

**O CRM do Pipe é código aberto obrigatório.** A seção 13 da AGPL diz que quem interage com o
software através de uma rede tem direito de receber o código-fonte correspondente. Como o Pipe é
vendido como SaaS, **todo cliente que abrir o CRM pode exigir o fonte completo do CRM, com as nossas
modificações**, e temos de fornecer.

Isso foi apresentado ao dono duas vezes, com a alternativa que evitaria a obrigação, e a decisão foi
mantida nas duas. Não é omissão: é escolha informada.

### O que a decisão NÃO alcança, e como manter assim

A obrigação segue o código combinado, não a marca. Para que ela pare no CRM em vez de engolir o
produto inteiro:

1. **O fork vive em repositório próprio** (`pipe-crm-fork`), fora do monorepo do Pipe. Nunca como
   pacote do workspace, nunca importado por `apps/*` ou `packages/*`.
2. **A integração é por rede**: o Pipe conversa com o CRM pela API dele (REST/GraphQL) e por
   webhook, como conversaria com qualquer serviço de terceiro.
3. **Nada do fork entra em `packages/core`, `packages/db`, `packages/ui` ou nos apps Desk e Gestão.**
   O dia em que uma linha do Twenty for importada por um desses, a AGPL passa a alcançá-los.

Se essa fronteira for quebrada, a obrigação de abrir o código se estende ao que foi combinado — e
aí o Desk, a Gestão e a monitoria por IA entram junto. **A fronteira é a regra técnica mais
importante deste documento.**

## 3. O que já existe dos dois lados

### O CRM do Pipe hoje

Rotas: painel, leads (com visões salvas, colunas redimensionáveis, agrupamento), oportunidades
(quadro de funil), contas, contatos, e configurações de regras de score e faixas.

O `lead` do Pipe tem campos que o Twenty não tem por padrão:
`origem, campanha, utm, status, fase, faseDesde, proprietarioId, scoreAtual, faixaAtual,
desqualificadoEm, motivoDesqualificacaoId, customizados`.

O cromo de duas camadas do Lightning (50 + 40 = 90px), o raio de 4px e a densidade de célula de 13px
foram medidos e aplicados em 07/09/2026 (commit `ca1147e`).

### O Twenty

Objetos padrão: `person`, `company`, `opportunity`, `note`, `task`, `attachment`, `calendar-event`,
`message`, `dashboard`, `workflow`, `timeline-activity`, entre outros. **Não há objeto `lead`** — no
modelo deles, lead é uma `person` com estágio, ou um objeto customizado.

Pacotes MIT, que continuam copiáveis com atribuição mesmo fora do fork: `twenty-ui`,
`twenty-shared`, `twenty-sdk`, `twenty-client-sdk`, `create-twenty-app` e `twenty-apps`.

### O que é proprietário, e por isso fica fora

347 arquivos marcados `/* @license Enterprise */` — 290 no server, 52 no front, 5 no shared. Não são
AGPL: são licença comercial fechada, e **não entram no fork**. Distribuição por bloco:

| Bloco | Arquivos | O que é |
|---|---|---|
| billing + billing-webhook + usage + usage-limit | 184 | cobrança, assinatura, medição e teto de uso |
| sso + auth + jwt | 28 | SAML/OIDC |
| row-level-permission-predicate (+ flat) | 25 | permissão por linha, com predicado por registro |
| enterprise | 16 | o gate que checa a licença |
| event-logs | 12 | trilha de auditoria |
| workspace-migration, twenty-orm/utils, upgrade-version | 13 | migração de workspace e de versão |
| admin-panel, emailing-domain, cloudflare, dns-manager | 11 | painel de admin e domínio próprio |

No front, 45 dos 52 estão em `modules/settings`: são as telas dessas mesmas funções.

**53% do enterprise é cobrança e medição de uso**, que teríamos de escrever de qualquer forma — o
modelo de cobrança do Pipe (franquia de conversa, mensagem ativa, plano por atendente) não é o
deles. Das quatro funções que sobram e valem trabalho, três já têm caminho no Pipe:

- **Permissão por linha** — temos RLS no Postgres com `tenant_id` em toda tabela, falhando fechada.
  A deles é mais fina (predicado por registro); é evolução do que existe.
- **SSO SAML/OIDC** — Keycloak ou Authentik na frente resolve, sem escrever provedor.
- **Trilha de auditoria** — já está na lista de pendências, e é o que hoje segura a edição nas telas
  de Comunicação e Atendentes.
- **Domínio próprio** — o Traefik da nossa infra já faz.

## 4. O que precisa ser decidido antes da primeira linha

1. **O que acontece com `apps/crm`.** Vira descarte, ou as partes que não existem no Twenty (score,
   faixa, roteamento, desqualificação com motivo) migram para dentro do fork como customização?
2. **Onde o lead mora.** Objeto customizado no fork, ou `person` com estágio, como eles fazem?
3. **De quem é a verdade do dado.** O CRM forkado passa a ser dono de lead, conta e oportunidade, e
   o `packages/db` do Pipe para de ter essas tabelas? Ou o Pipe continua dono e o fork é só a
   interface? Duas fontes de verdade para o mesmo lead é a receita conhecida de divergência.
4. **Como o atendimento chega lá.** Hoje a conversa vira lead por regra em `packages/core`. Com o
   fork, essa ponte passa a ser chamada de API.

Nenhuma destas tem resposta ainda, e nenhuma pode ser resolvida escrevendo código primeiro.

## 5. Duas stacks convivendo

| | Pipe | Fork |
|---|---|---|
| Gerenciador | pnpm 9 | Yarn 4 |
| Build | Turborepo | Nx |
| Servidor | Next.js (App Router) | NestJS + GraphQL + TypeORM |
| Front | Next.js RSC | React 19 SPA + Recoil |
| Banco | Postgres 16 com RLS por `tenant_id` | Postgres com schema por workspace |

O modelo de isolamento é o ponto de atrito real: o Pipe isola por linha com RLS, e o Twenty isola
por **schema por workspace**. São filosofias diferentes, e a decisão 3 acima depende de qual vence.

---

## 6. A execução: o fork virou "Pipe CRM"

Escrito em 07/09/2026, depois de construir a imagem a partir do fork e subi-la. Esta parte é
operacional: como reconstruir, onde estão as três coisas que mudamos, e o que dói no próximo
`git pull`.

**Nada foi desligado.** Nenhum módulo removido, nenhum item de menu escondido, nenhuma aba de
configuração cortada. A imagem serve o produto inteiro deles — a decisão foi só de tinta, marca e
idioma. O que não funciona de fato por falta de credencial ou de licença está listado em §10, e é
lista de compra, não de corte.

### O comando único

Na raiz de `pipe-crm-fork`:

```bash
docker build --target twenty -f packages/twenty-docker/twenty/Dockerfile -t pipe-crm:local .
```

Depois:

```bash
cd packages/twenty-docker
# no .env: CRM_IMAGE=pipe-crm:local
docker compose -p pipe-crm up -d
```

Duas regras que custam horas se ignoradas:

1. **Nunca `yarn install` no Windows.** O build deles é feito para Linux (Alpine, Node 24.19
   pinado por digest) e quebra em caminho e binário nativo. Construa dentro do Docker, sempre. O
   repositório nunca teve `node_modules` e não precisa ter.
2. **A primeira build demora** (a etapa `yarn workspaces focus` sozinha leva minutos, e
   `nx build twenty-front` é a mais pesada). As seguintes são rápidas: as camadas de dependência
   só dependem dos `package.json`, então enquanto você não mexer neles o cache vale.

O alvo é `twenty` (servidor + front). Existem outros no mesmo Dockerfile: `twenty-server` (sem
front), `twenty-aws`, e `twenty-app-dev` (tudo-em-um com Postgres e Redis dentro).

### Onde fica a porta, e por que existe uma override

`packages/twenty-docker/docker-compose.override.yml`. Duas coisas moram lá:

- **A imagem**, por variável: `image: ${CRM_IMAGE:-twentycrm/twenty:latest}`. Trocar `CRM_IMAGE`
  no `.env` alterna entre a oficial deles e a nossa, sem editar arquivo de compose.
- **A porta**, com `ports: !override ['3500:3000']`. O `!override` não é preciosismo: lista em
  compose **soma** por padrão, e o `3000` do arquivo original é a api do Pipe. Publicado junto, o
  contêiner rouba a porta e a api some do `localhost` sem erro nenhum.

## 7. Onde ficam as cores

Já estava resolvido em [`crm-tinta-nossa`](2026-09-07-crm-tinta-nossa.md); aqui fica só o mapa de
arquivo, para quem for mexer.

**Mude na fonte, nunca no gerado.** Os arquivos em `packages/twenty-ui/src/theme/constants/` dizem
no topo que são gerados. A fonte é `packages/twenty-ui/design-tokens/`:

| Arquivo | O que carrega |
|---|---|
| `design-tokens/color/moss.ts` | **novo, nosso.** O verde `#4a5d23` na escala de 12 degraus, em OKLCH, com três âncoras vindas de `packages/ui/src/estilos/tokens.css` |
| `design-tokens/accent.ts` | o destaque inteiro do produto. Era `COLOR_TOKENS.blue*`, virou `MOSS.moss*` |
| `design-tokens/color/gray.ts` | a escala neutra: o creme `#f2f1ec` no lugar do cinza puro |
| `design-tokens/background.ts` | `transparent.blue` (alvo de arraste, item ativo) |
| `design-tokens/border.ts` | `color.blue` (borda de campo em foco) |
| `design-tokens/illustrationIcon.ts` | ícone e preenchimento das ilustrações |

Regenerar:

```bash
npx nx generateTokens twenty-ui
```

Isso reescreve `ThemeLight.ts`, `ThemeDark.ts`, `GrayScaleLight.ts`, `GrayScaleDark.ts`,
`ThemeCommon.ts`, `theme-light.css`, `theme-dark.css` e mais. O gerador é
`packages/twenty-ui/scripts/generateThemeTokens.ts`, e ele tem modo `--check` que a CI usa para
reprovar artefato desatualizado.

**Atenção:** o gerador precisa de `node_modules` (roda `npx oxfmt` no fim). Como não instalamos
nada no Windows, os artefatos gerados **estão versionados no fork** e é isso que a imagem usa — o
Dockerfile não roda `generateTokens`. Quem mexer em token tem de rodar o gerador dentro de um
contêiner Node antes de construir, ou os artefatos ficam mentindo.

Uma inversão deliberada, documentada em `gray.ts`: no Twenty o `gray1` (fundo da aplicação) é
branco e o `gray2` (cartão) é quase-branco. No Pipe o fundo é o creme e o cartão é branco, então no
tema claro `gray1` é **mais escuro** que `gray2`. É o único degrau não monótono da escala, e existe
para que o creme ocupe a área que a pessoa realmente vê.

## 8. Onde fica o idioma

**Não existe variável de ambiente de idioma no Twenty.** Procuramos: `config-variables.ts` (o
catálogo de 2.440 linhas com todas as env vars do server) não tem uma única ocorrência de `locale`,
`language` ou `lang`. Também não há chave de locale no `window._env_` injetado no `index.html`.
Então o padrão pt-BR é mudança de código, e é o menor conjunto possível.

**A constante:** `packages/twenty-shared/src/translations/constants/DefaultAppLocale.ts` —
`DEFAULT_APP_LOCALE = 'pt-BR'`, exportada pelo barril `translations/index.ts`.

**Não confundir com `SOURCE_LOCALE`.** Aquele é `'en'` e continua `'en'`: é o `sourceLocale` do
Lingui, o idioma em que os `msgid` estão escritos no código. Trocá-lo quebra `lingui extract`,
`lingui compile` e o fallback de mensagem faltante. São coisas diferentes: um é a língua do
código-fonte, o outro é a preferência padrão da pessoa.

A resolução acontece em **duas ativações em sequência**, e mexer só na primeira faz o app abrir em
português e piscar de volta para inglês quando o usuário carrega:

| Camada | Arquivo | O que mudou |
|---|---|---|
| Antes do login | `twenty-front/src/utils/i18n/initialI18nActivate.ts:11` | o fallback era `APP_LOCALES.en`, virou `DEFAULT_APP_LOCALE` |
| " | mesmo arquivo | **o ramo `fromNavigator()` foi removido.** Ele fazia o idioma do NAVEGADOR vencer o padrão do produto: num Chrome em `en-US` o CRM abria em inglês |
| " | `twenty-front/src/utils/i18n/dynamicActivate.ts:8` | fallback de locale inválido |
| Depois do login | `twenty-front/src/modules/users/hooks/useLoadCurrentUser.ts:98` e `:105` | reativa com `workspaceMember.locale`; o `??` agora cai em pt-BR |
| Cadastro | `twenty-front/src/modules/auth/hooks/useAuth.ts:393` e `:479` | o locale enviado no signup |
| Usuário novo | `twenty-server/.../compute-workspace-member-standard-flat-field-metadata.util.ts:280` | `defaultValue` do campo `locale` do workspaceMember: era `"'en'"`, virou `"'pt-BR'"` |
| " | `twenty-server/.../user-workspace/user-workspace.service.ts:151` e `:201` | cinto e suspensório para convite e SSO, onde o locale não vem do front |
| " | `twenty-server/.../auth/auth.resolver.ts:466` e `:556` | idem, no signup |
| E-mail e erro | `twenty-server/src/engine/utils/bind-data-to-request-object.util.ts:29` e `middlewares/middleware.service.ts:160` | o locale da requisição sem token |
| HTML | `twenty-front/index.html:2` | `lang="en"` virou `lang="pt-BR"` |

**A ordem de precedência continua sendo a deles**, e nenhum idioma saiu do seletor: `?locale=` na
URL > `localStorage.locale` > `workspaceMember.locale` (o que a pessoa escolheu em Configurações) >
`DEFAULT_APP_LOCALE`. Quem quiser inglês troca em Configurações e continua em inglês. Os 31
catálogos compilados continuam na imagem.

**As colunas do banco continuam com `DEFAULT 'en'`** (`core.user.locale`,
`core."userWorkspace".locale`). Isso é de propósito: mudá-las exigiria migração, e o valor sempre
chega explícito pelo serviço. Consequência prática: **usuário que já existia continua em inglês até
rodar um UPDATE**, porque o campo é `NOT NULL` e tem `'en'` gravado de verdade. O que foi rodado na
instância local:

```sql
UPDATE core."user"          SET locale='pt-BR' WHERE locale <> 'pt-BR';
UPDATE core."userWorkspace" SET locale='pt-BR' WHERE locale <> 'pt-BR';
UPDATE workspace_<hash>."workspaceMember" SET locale='pt-BR' WHERE locale <> 'pt-BR';
```

O `<hash>` sai de
`SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'workspace_%'`.

### O catálogo

`packages/twenty-front/src/locales/pt-BR.po`. O upstream já trazia 4.026 entradas com 38 vazias; as
38 foram preenchidas (quase todas da função nova de campanha de e-mail). As que ficaram iguais ao
inglês são termo que a interface brasileira usa sem traduzir: tipo de bloco do editor (`h1`, `p`,
`ul`), sigla (`CRUD`) e nome de formato (`JSON`, `Prompt`). **O catálogo pt-BR está 100%
preenchido.**

## 9. Onde fica a marca

A política de marca do próprio Twenty (`.github/TRADEMARK.md`) **exige** isto:

> "You may maintain and distribute forks of the source code under the terms of the applicable
> licenses. If you distribute or operate a fork publicly, give it its own name and branding."

Ou seja: renomear não é liberdade que tomamos, é obrigação que a licença nos dá. E o mesmo
documento diz que podemos afirmar com verdade que somos "a fork of Twenty" — o que continuamos
fazendo, aqui e nos cabeçalhos de licença, que não foram tocados.

**O truque que evitou mexer em código:** quase toda string "Twenty" que o usuário lê passa pelo
macro de tradução do Lingui. Como o produto abre em pt-BR, trocar o **`msgstr`** do `pt-BR.po` muda
o que a pessoa lê **sem tocar no `msgid`** — e o `msgid` é o que gera o hash `js-lingui-id`. Mexer
nele invalidaria o catálogo inteiro. Foram 25 linhas de `msgstr` trocadas.

| Onde | Arquivo |
|---|---|
| Título da aba (HTML inicial) | `twenty-front/index.html:31` |
| Título da aba (SPA, fallback de rota) | `twenty-front/src/utils/title-utils.ts:63` |
| `lang`, descrição, og: e twitter: | `twenty-front/index.html:2,16,19,21,22,26,29,30` |
| PWA | `twenty-front/public/manifest.json:2,3` |
| Strings de interface traduzidas | `twenty-front/src/locales/pt-BR.po` (só `msgstr`) |
| Autor de sistema na linha do tempo | `.../timeline-activities/utils/getTimelineActivityAuthorFullName.ts:14` |
| Nome do conector MCP | `.../mcp-and-apis/constants/McpSetup.ts:14` (o `name: 'twenty'` na linha 13 é chave técnica e **ficou**) |
| Dados de exemplo do campo Links | `.../data-model/constants/SettingsCompositeFieldTypeConfigs.ts:182-190` |
| Logo padrão do workspace | `.../navigation-drawer/constants/DefaultWorkspaceLogo.ts` — apontava para o GitHub Pages da Twenty, agora é asset local |
| Ícones (112 PNG) | `twenty-front/public/images/icons/{android,ios,windows11}/` |
| SVG da marca | `twenty-front/public/images/icons/pipe/` e `images/integrations/twenty-logo.svg` |
| E-mails | `twenty-emails/src/components/{Logo,BaseHead}.tsx`, `src/locales/pt-BR.po` |
| Nome do remetente | `twenty-server/.../twenty-config/config-variables.ts:490` |

Os 112 PNG foram gerados do `favicon.svg` do Pipe com `imagemagick` e `librsvg` **dentro de um
contêiner** (não há rasterizador no Windows), preservando a dimensão de cada arquivo: para cada
`.png` sob `public/images/icons/`, lê-se a dimensão com `magick identify` e regrava-se o símbolo
centrado sobre o creme `#F2F1EC`.

### O que ficou "Twenty" de propósito

Isto não é descuido — é a fronteira entre marca e fato:

- **Cabeçalhos de licença e `LICENSE`**: intocados. A AGPL exige.
- **`Twenty.com, Public Benefit Corporation`** no rodapé dos e-mails: é a entidade jurídica deles.
  Trocar exigiria o nome da NOSSA entidade jurídica, que ninguém me deu. **Pendência do dono.**
- **O texto do DPA** (`SettingsLegalDpaNew.tsx`): o PDF é pré-assinado pela Twenty PBC. É fato
  jurídico, não marca.
- **O texto da chave enterprise**: a chave é comprada da Twenty. Fato comercial.
- **O texto de parceiros de implantação**: são parceiros do ecossistema Twenty.
- **Rodapé dos e-mails** ("Visite o site do Twenty", GitHub, documentação): os links apontam para
  `twenty.com`. Trocar o rótulo e manter o link seria mentir.
- **`IconTwentyStar` e `IconTwentyStarFilled`**: são estrelas de avaliação, não logotipo.
- **`id="twenty-env-config"` e os comentários de BEGIN/END da Twenty Config** no `index.html`: o
  entrypoint do contêiner procura esses marcadores para injetar `window._env_`. Renomear quebra o
  boot em silêncio.
- **`nameSingular` / `namePlural` de objeto e `name` de campo**: `person`, `company`, `people`,
  `companies`, `emails`, `phones`, `name.firstName`, `domainName`. São o contrato da API
  GraphQL/REST. Traduzir isso quebraria toda integração do Pipe em silêncio. **Só o label muda.**
- **Toda a lista de identificadores de código** (~222 ocorrências: `TwentyIconDictionary`, imports
  `twenty-ui` e `twenty-shared`, `allowRequestsToTwentyIcons`, URLs de documentação).

## 10. O que precisa de credencial ou de licença para funcionar de fato

Nada disto foi desligado. Está tudo ligado como vem, e é lista de compra.

O boot **não quebra** por falta de nenhuma delas: o decorator
`config-variables-metadata.decorator.ts:48-53` marca como opcional toda variável sem default. O que
derruba o processo é só `PG_DATABASE_URL`, `REDIS_URL` e `APP_SECRET`/`ENCRYPTION_KEY` — os três que
o nosso `.env` já tem.

### Precisa de licença paga da Twenty (`ENTERPRISE_KEY`)

| Função | O que acontece sem a chave |
|---|---|
| **SSO SAML/OIDC** | a seção continua visível em Configurações, mas toda query e mutação dá erro pelo guard `enterprise-features-enabled.guard.ts` — inclusive a leitura |
| **Permissão por linha** (predicado por registro) | erro `ROW_LEVEL_PERMISSION_FEATURE_DISABLED` |
| **Trilha de auditoria** (event logs) | erro "Audit logs require an Enterprise subscription" |
| **Mais de 5 workspaces na instância** | erro no cadastro |
| **Provedor de IA customizado acima de 25 usuários** | abaixo de 25 é liberado sem chave; acima, os modelos customizados somem |

A chave também traz `ENTERPRISE_VALIDITY_TOKEN`, renovado por cron diário contra
`https://twenty.com/api/enterprise` — e essa validação **envia telemetria da instância**: id do
servidor, URL, versão, contagem de workspaces e usuários, e o e-mail do primeiro admin.

### Precisa de credencial de terceiro

| Função | Variáveis | Custo |
|---|---|---|
| **Entrar com Google** | `AUTH_GOOGLE_ENABLED`, `_CLIENT_ID`, `_CLIENT_SECRET`, `_CALLBACK_URL` | grátis |
| **Sincronizar Gmail e Google Calendar** | `MESSAGING_PROVIDER_GMAIL_ENABLED`, `CALENDAR_PROVIDER_GOOGLE_ENABLED` mais as de cima | grátis, mas exige verificação do app no Google |
| **Entrar com Microsoft, Outlook, Calendar** | `AUTH_MICROSOFT_*`, `MESSAGING_PROVIDER_MICROSOFT_ENABLED`, `CALENDAR_PROVIDER_MICROSOFT_ENABLED` | grátis |
| **IA (chat, agentes, ação de agente em workflow, resumo de gravação)** | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `XAI_API_KEY`, `GROQ_API_KEY`, `MISTRAL_API_KEY`, `AI_PROVIDERS` | **pago, por uso** |
| **E-mail transacional** (convite, reset de senha, verificação) | `EMAIL_DRIVER` mais `EMAIL_SMTP_*` | depende do provedor |
| **Domínio de envio próprio e campanha de e-mail** | `EMAILING_DOMAIN_DRIVER` mais `AWS_SES_*` ou `RESEND_API_KEY` | pago |
| **Cobrança e assinatura** | `IS_BILLING_ENABLED`, `BILLING_STRIPE_API_KEY`, `_WEBHOOK_SECRET`, `_PUBLISHABLE_KEY` | Stripe |
| **Anexo em S3** | `STORAGE_TYPE=s3` mais `STORAGE_S3_*` | AWS |
| **Gravação de chamada** (Meet, Zoom, Teams) | `RECALL_API_KEY`, `RECALL_WEBHOOK_SECRET` (Recall.ai) | **pago**; o resumo ainda exige chave de LLM, e o agendamento por calendário exige Google ou Microsoft conectado |
| **Funções lógicas em código** (ação de workflow) | `LOGIC_FUNCTION_TYPE` mais `LOGIC_FUNCTION_LAMBDA_*` | AWS Lambda; **vem desligado em produção** |
| **Interpretador de código da IA** | `CODE_INTERPRETER_TYPE`, `E2B_API_KEY` | pago; **vem desligado em produção** |
| **Autocompletar de endereço** | `IS_MAPS_AND_ADDRESS_AUTOCOMPLETE_ENABLED`, `GOOGLE_MAP_API_KEY` | pago |
| **Enriquecimento de empresa** | `PEOPLE_DATA_LABS_API_KEY` | pago |
| **Domínio próprio por workspace** | `CLOUDFLARE_*` | Cloudflare |
| **Captcha no login** | `CAPTCHA_DRIVER`, `CAPTCHA_SITE_KEY`, `CAPTCHA_SECRET_KEY` | grátis |
| **Sentry** | `SENTRY_DSN`, `SENTRY_FRONT_DSN` | tem plano grátis |
| **Apps do marketplace** | Slack, Discord, Linear, Fathom, Fireflies, Exa — cada um com sua chave | varia |

Alternativa sem credencial de terceiro para e-mail e calendário: `IS_IMAP_SMTP_CALDAV_ENABLED` **já
vem ligado**, e nele o próprio usuário informa as credenciais IMAP, SMTP e CalDAV dele.

**Uma coisa a decidir agora:** `TELEMETRY_ENABLED` vem `true` por padrão. A instância reporta ao
Twenty mesmo sem chave enterprise. Se quisermos instância muda, é `TELEMETRY_ENABLED=false` no
`.env`.

### Feature flags

São 11 no total (`twenty-shared/src/types/FeatureFlagKey.ts`). Workspace novo nasce com **uma**
ligada (`IS_REST_METADATA_API_NEW_FORMAT_DIRECT`), e só **uma** aparece na aba "Lab" para o usuário
(`IS_JUNCTION_RELATIONS_ENABLED`). As demais dependem do painel de admin, que por sua vez depende de
`IS_FEATURE_FLAG_MANAGEMENT_ENABLED` (default `false`). Nenhuma delas depende de credencial de
terceiro.

## 11. As três coisas que vão doer no próximo `git pull` do upstream

Em ordem de dor.

### 1. Os artefatos de tema gerados, que conflitam sem avisar

`ThemeLight.ts`, `ThemeDark.ts`, `GrayScaleLight.ts`, `GrayScaleDark.ts`, `ThemeCommon.ts`,
`theme-light.css`, `theme-dark.css` — sete arquivos **gerados** que estão versionados dos dois
lados. Qualquer commit deles que mexa em qualquer token gera conflito em arquivo que ninguém edita à
mão, com centenas de linhas de cor de um lado e do outro.

**O jeito certo de resolver:** aceitar a versão do upstream nos SETE arquivos gerados
(`git checkout --theirs`), resolver o conflito só na FONTE (`design-tokens/`, onde as nossas
mudanças são poucas e legíveis) e **rodar `npx nx generateTokens twenty-ui` de novo**. Resolver
conflito no arquivo gerado é trabalho jogado fora e produz artefato que não corresponde à fonte — e
a CI deles tem `--check` justamente para pegar isso.

O risco maior é silencioso: se o upstream acrescentar um token novo em `accent.ts` ou `gray.ts` e o
merge aceitar a versão deles nesse arquivo, o token novo nasce **azul** no meio do nosso verde, e
ninguém vê até alguém abrir a tela.

### 2. O catálogo `pt-BR.po`, que é reescrito por máquina

O Docker build roda `nx run twenty-front:lingui:extract` e `:compile` — ou seja, o catálogo é
**regravado a cada build** a partir dos `msgid` encontrados no código. Nossas duas intervenções
vivem nele: as 38 traduções preenchidas e as 25 linhas de `msgstr` com "Pipe CRM".

O `extract` preserva `msgstr` existente e só acrescenta entrada nova, então em condição normal nada
se perde. Mas:

- string que o upstream **reescrever** ganha `msgid` novo, hash novo, e volta como `msgstr` vazio.
  Se ela contiver "Twenty", volta "Twenty" na tela;
- string que o upstream **remover** some junto com a nossa tradução;
- o `CLAUDE.md` do repositório deles diz para não commitar catálogo. Para um fork rebrandeado isso
  vira exceção: temos de commitar, e todo `git pull` traz o catálogo deles por cima.

**Verificação depois de todo pull:** `grep -c '^msgstr ""$' pt-BR.po` (esperado: 5 — o cabeçalho e
quatro aberturas de bloco multilinha) e `grep -n '^msgstr .*Twenty' pt-BR.po` (esperado: 3, as
jurídicas de §9).

### 3. A cadeia de idioma, espalhada por dez arquivos que eles mexem

`DEFAULT_APP_LOCALE` é nosso e não conflita — o arquivo é novo. O que conflita são os dez pontos de
uso da tabela em §8, e dois deles são armadilha:

- **`initialI18nActivate.ts`**: nós REMOVEMOS o ramo `fromNavigator()`. Um merge que reintroduza
  esse ramo devolve o comportamento antigo — e é uma regressão invisível na máquina de quem
  desenvolve, porque o navegador dele está em português. Só aparece no cliente com Chrome em inglês.
- **`compute-workspace-member-standard-flat-field-metadata.util.ts`**: uma linha de `defaultValue` no
  meio de um arquivo grande de metadados padrão, que eles mexem com frequência. Se voltar para
  `"'en'"`, usuário novo nasce em inglês e ninguém percebe até alguém convidar alguém.

Uma quarta, menor, que vale anotar: os **112 PNG de ícone**. Binário não dá merge. Se o upstream
trocar o logo deles, o `git pull` traz os arquivos deles e o Git resolve como "both modified" em 112
binários. A recuperação é barata (rodar de novo o contêiner de rasterização de §9), mas é preciso
lembrar que é preciso.

## 12. Como entrar

A instância local está em **http://localhost:3500**, com a semente de desenvolvimento rodada:

```bash
docker compose -p pipe-crm exec server yarn command:prod workspace:seed:dev --light
```

Isso cria o workspace `Apple` com dados de demonstração e o usuário **`tim@apple.dev`**, cuja senha
é **`tim@apple.dev`** (a senha é o próprio e-mail — está no repositório deles, em
`packages/twenty-e2e-testing/.env.example` e em `useSignInUpForm.ts`; não foi inventada nem escolhida
por nós). Com `SIGN_IN_PREFILLED=true` no `.env`, o formulário de login já vem preenchido.

Existe também o workspace `Pipe`, criado à mão pelo dono, com a conta dele. Como
`IS_MULTIWORKSPACE_ENABLED` vem `false`, só um dos dois é servido em `localhost`.

### A prova, medida em 07/09/2026 com a imagem `pipe-crm:local` no ar

```
$ curl -s -o /dev/null -w "%{http_code}" http://localhost:3500/
200

$ curl -s http://localhost:3500/ | grep -oE '<html lang="[^"]*"|<title>[^<]*</title>'
<html lang="pt-BR"
<title>Pipe CRM</title>
```

E dentro da imagem, no front já compilado:

- `assets/utilities-*.js` contém `0.824 0.851 0.773` (o moss no papel de destaque) e
  `0.948 0.945 0.927` (o creme no fundo da aplicação) — as cores não ficaram só na fonte;
- `assets/pt-BR-*.js` existe e contém "Bem-vindo ao Pipe CRM" — o catálogo pt-BR foi compilado e a
  marca sobreviveu ao `lingui extract` do build.

O login foi verificado de ponta a ponta contra a imagem nova:

```
$ curl -s -X POST http://localhost:3500/metadata -H 'content-type: application/json' \
  -d '{"query":"mutation($e:String!,$p:String!,$o:String!){getLoginTokenFromCredentials(email:$e,password:$p,origin:$o){loginToken{expiresAt}}}",
       "variables":{"e":"tim@apple.dev","p":"tim@apple.dev","o":"http://localhost:3500"}}'
{"data":{"getLoginTokenFromCredentials":{"loginToken":{"expiresAt":"..."}}}}
```

**Repare no endpoint.** As mutações de autenticação e de metadados respondem em **`/metadata`**, não
em `/graphql` — `/graphql` serve só o esquema de DADOS do workspace. A mesma mutação em `/graphql`
devolve `Cannot query field "getLoginTokenFromCredentials" on type "Mutation"`, o que parece erro de
versão e não é. Quem for escrever cliente de API tem de receber o caminho como parâmetro.

### O worker

O `docker compose up -d` pode terminar com `dependency failed to start: container
pipe-crm-server-1 is unhealthy` **sem que nada esteja quebrado**: o entrypoint roda a sequência de
upgrade (228 passos) antes de o servidor responder, e isso passa da janela do healthcheck
(20 tentativas de 5s). O efeito colateral é que o **worker não sobe**, e fica em `Created`.

Sem worker não rodam workflows, jobs de sincronização, nem nada em fila. A correção é rodar
`docker compose -p pipe-crm up -d` de novo depois que o servidor ficar saudável. Vale conferir com
`docker compose -p pipe-crm ps` que os quatro serviços (`db`, `redis`, `server`, `worker`) estão de
pé — é o erro mais fácil de não perceber nesta stack.
