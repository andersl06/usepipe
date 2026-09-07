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
