# Integração do Pipe com o Twenty

**Companheira de [Fork do Twenty](2026-09-07-fork-do-twenty.md), que decidiu que o CRM é um fork
AGPL vivendo em repositório próprio. Esta spec decide COMO o Pipe conversa com ele.**

A fronteira da outra spec continua valendo e é o motivo de tudo aqui ser chamada de rede: nenhuma
linha do fork entra em `apps/*` ou `packages/*`. O que este documento acrescenta é o contrato.

## 0. O que foi verificado na instância no ar, e não presumido

Tudo abaixo foi descoberto chamando `http://localhost:3500` — a instância v2.29.0 que o outro agente
está customizando. Nada de campo inventado.

| Achado | Por que muda o desenho |
|---|---|
| **O esquema de auth NÃO está em `/graphql`, está em `/metadata`.** `/graphql` serve só o esquema de dados do workspace. | Cliente apontado para `/graphql` recebe `Cannot query field "getLoginTokenFromCredentials" on type "Mutation"` e parece bug de versão. Perdi meia hora nisso; está escrito para ninguém repetir. |
| `person` e `company` mantêm `nameSingular` em inglês; só os RÓTULOS viraram pt-BR (`Pessoa`, `Empresa`). | **Casar por `name`, nunca por `label`.** O `x-locale` do workspace está em `pt-BR` e a API devolve rótulo traduzido. Casar por rótulo quebra no dia em que alguém reescrever uma tradução. |
| `person.name` é composto (`{firstName, lastName}`), `emails` é `{primaryEmail, additionalEmails}`, `phones` é `{primaryPhoneNumber, primaryPhoneCallingCode, primaryPhoneCountryCode}`. `company.name` é texto simples e `company.domainName` é link. | O `contato` do Pipe tem `nome` em campo único e `telefone_e164` com o `+`. Precisa de conversão nos dois sentidos, e ela é a parte chata. |
| Introspecção do GraphQL está desligada para quem não está autenticado. | Descoberta de esquema exige token. Não dá para "olhar o esquema" sem entrar. |
| Chave de API tem **papel** (`roleId`), e os papéis de fábrica `Admin`/`Member` não servem: `Member` tem `canBeAssignedToApiKeys: false`. | Foi preciso criar um papel `Integracao Pipe` com `canBeAssignedToApiKeys: true` e `canUpdateAllSettings: false`. É o menor privilégio que funciona. |
| Com esse papel mínimo, `sendInvitations` responde `PERMISSION_DENIED`. Só funciona com credencial de administrador. | **Provisionar usuário no Twenty exige chave de administrador.** Isso encarece o caminho de login por provisionamento — ver §2. |
| `IS_MULTIWORKSPACE_ENABLED=false`. Uma instância serve um workspace. | É o centro da decisão de multi-tenant — ver §5. |
| `EMAIL_DRIVER=LOGGER`. Convite, reset de senha e verificação **não são entregues**, só logados. | Qualquer desenho que dependa de e-mail do Twenty não funciona hoje. |
| O front tem a rota `/verify?loginToken=<token>`, que troca o token por sessão no navegador. | É o mecanismo do "um clique" do §2, e é AGPL — não passa perto do SSO Enterprise. |
| A ficha de um registro é `/object/person/<uuid>` e `/object/company/<uuid>`. | É o link direto do §3. |

## 1. As decisões, em uma linha cada

1. **Quem fala com o Twenty é `apps/api`, e só ela.** Nenhuma tela abre conexão com o CRM.
2. **O endpoint de auth é `/metadata`; o de dados é `/graphql`.** Os dois são configuráveis a partir de uma URL base só.
3. **A verdade do contato continua no Pipe; o Twenty é espelho.** O Pipe escreve, o Twenty exibe.
4. **A amarração é de mão dupla**: o Pipe guarda `twenty_pessoa_id`/`twenty_empresa_id`, e o Twenty guarda `pipeContatoId`/`pipeEmpresaId`. A segunda existe para não duplicar registro quando a primeira se perde.
5. **A chave de API é por tenant e vive cifrada** com o chaveiro que já existe (`packages/db/src/segredo.ts`).
6. **Sincronização é fila com varredura de segurança**, igual à entrega de mensagem: a fila é o empurrão, a varredura é quem garante.
7. **O login é o mesmo Google dos dois lados** — decidido pelo dono em 07/09. Nada de credencial-sombra (§2).
8. **Uma instância do Twenty por cliente** — decidido pelo dono em 07/09, isolamento físico. A URL e a chave ficam por tenant (§5).

## 2. Login: o que custa cada caminho

O SSO deles (`core-modules/sso/**`) é Enterprise e está fora — decidido antes desta spec e confirmado
aqui: o guard `enterprise-features-enabled.guard.ts` bloqueia até a query de leitura. O que sobra é
o módulo `auth` AGPL: e-mail/senha e Google OAuth.

### Caminho A — o mesmo Google dos dois lados (**escolhido pelo dono, 07/09/2026**)

O Pipe já entra por Google (`packages/autenticacao/src/google.ts`, OIDC com PKCE). O Twenty também
sabe (`AUTH_GOOGLE_ENABLED` + as quatro variáveis, hoje comentadas no compose do fork).

- **Custo**: praticamente zero de código nosso. Cadastrar mais uma URL de retorno no mesmo projeto do
  Google Cloud e o outro agente descomentar as variáveis.
- **Como fica para a pessoa**: ela clica em "CRM" no trilho do Desk, cai na tela do Twenty, clica
  "Entrar com Google", e como o navegador já tem sessão no Google ela entra sem digitar senha.
- **O que fica em aberto, sem maquiagem**:
  - **São dois cliques, não um.** O segundo é o botão do Google.
  - **A pessoa precisa já existir no workspace.** O Twenty não cria usuário sozinho, e o convite exige
    credencial de administrador — e o e-mail nem sai, porque o driver é `LOGGER`. Ou seja: hoje, criar
    gente no CRM é trabalho manual de quem administra o workspace.
  - Duas sessões independentes: sair do Pipe não derruba a sessão do CRM.

### Caminho B — provisionamento e token pelo nosso lado

Verificado que funciona de ponta a ponta:

```
apps/api  →  POST /metadata  getLoginTokenFromCredentials(email, senha, origin)  →  loginToken
navegador →  302 para  <twenty>/verify?loginToken=<token>                        →  já dentro
```

- **Custo real, e é o motivo de eu não recomendá-lo**: para minerar esse token, o Pipe precisa
  **saber a senha da pessoa no Twenty**. Na prática: gerar uma senha aleatória por usuário, guardá-la
  cifrada no nosso banco, e usá-la para forjar a entrada. É uma **credencial-sombra**. Se o cofre do
  Pipe vazar, vazam junto todas as contas do CRM.
- **Custo adicional**: o provisionamento (`sendInvitations`) exige chave de **administrador** do
  workspace, não a chave de menor privilégio da integração. Ou seja, o caminho B obriga o Pipe a
  guardar, por tenant, uma credencial que pode tudo dentro do CRM daquele cliente.
- **O que ele entrega em troca**: um clique de verdade, e criação automática de usuário.

**Decidido: A.** O dono escolheu com as duas opções na frente: o segundo clique do Google é aceitável,
e guardar uma senha por pessoa não é. Nenhuma linha de credencial-sombra foi escrita, e o caminho B
fica registrado aqui só para não ser redescoberto como novidade.

### Como uma pessoa nova ganha acesso ao CRM — o caminho real, com A

Isto é trabalho que sobra para o cliente, e está escrito com todas as letras porque o dono precisa
saber antes de vender.

Hoje, com `EMAIL_DRIVER=LOGGER` e sem SMTP configurado:

1. A pessoa entra na empresa e é criada no Pipe pelo fluxo normal (convite do Pipe, que funciona).
2. **No CRM, não acontece nada automaticamente.** O Twenty não cria usuário sozinho.
3. Alguém com papel de administrador **daquele workspace** precisa abrir o CRM do cliente e convidar
   a pessoa (Configurações → Membros). Isso é feito **por cliente**, na instância dele.
4. O e-mail do convite **não é entregue** — só aparece no log do contêiner. Na prática, o
   administrador copia o link de convite e manda pela mão, ou a pessoa entra direto pelo botão
   "Entrar com Google" se o convite já tiver sido aceito.
5. Só depois disso o "Abrir no CRM" do Desk funciona para aquela pessoa. Antes, ela cai na tela de
   login do Twenty e não consegue passar.

**Três formas de tirar esse trabalho da frente do cliente**, em ordem de custo:

- **Configurar SMTP na instância** (`EMAIL_DRIVER=SMTP` + servidor). Barato, resolve o passo 4, e
  ainda conserta reset de senha e verificação de e-mail. É o mínimo antes de vender.
- **Automatizar o convite**: `apps/api` chama `sendInvitations` quando um usuário do Pipe recebe
  permissão de CRM. Exige guardar, por tenant, uma chave de **administrador** do Twenty — bem mais
  poderosa que a chave de integração de menor privilégio. É uma troca consciente; não foi feita.
- **Deixar como está** e tratar "convidar no CRM" como passo do onboarding do cliente, documentado.

Enquanto nada disso for decidido, o passo 3 é manual e é do cliente.

**O que NÃO foi feito de propósito**: nenhuma linha depende do SSO Enterprise deles, e o `authorizeApp`
/ OAuth de aplicação do Twenty também ficou de fora — resolveria o "um clique" de forma limpa, mas
exige registrar o Pipe como aplicação dentro do CRM, e isso é território do fork.

## 3. Navegação entre os aplicativos

O trilho do Desk já tem um item "CRM" apontando para `NEXT_PUBLIC_PIPE_CRM_URL`
(`http://localhost:3300`, o CRM caseiro). Ele passa a apontar para o Twenty.

**O link cai no REGISTRO, não na home.** Quando o contato da conversa já tem espelho:

```
<PIPE_TWENTY_URL>/object/person/<contato.twenty_pessoa_id>
```

Quando não tem, o bloco simplesmente **não aparece**. Falha fechada: sem espelho, sem link — nunca um
link que leva à home e faz a pessoa procurar o cliente à mão.

**O caminho de volta é a aba.** O link abre em outra aba (`fora` no `trilho-desk.tsx`, padrão que já
existe), então "voltar para a conversa" é fechar a aba — a conversa continua aberta atrás, com o
estado intacto. Um link de verdade de dentro do Twenty para a conversa exigiria uma rota por contato
no Desk, que hoje não existe (o Desk é uma tela só), e um campo do lado do fork. **Teto conhecido**,
anotado aqui e não escondido: quando o Desk tiver rota por conversa, vira um campo LINK no `person`.

## 4. Os dados que atravessam

### Ida — `contato`/`conta` do Pipe → `person`/`company` do Twenty

| Pipe | Twenty | Observação |
|---|---|---|
| `contato.nome` | `person.name.firstName` / `.lastName` | O Pipe tem campo único. Quebra no **primeiro** espaço: o resto vai para `lastName`. Nome sem espaço deixa `lastName` vazio. |
| `contato.telefone_e164` | `person.phones.primaryPhoneNumber` + `primaryPhoneCallingCode` + `primaryPhoneCountryCode` | O Pipe guarda `+5511988887777`. O Twenty quer os três separados. |
| `contato.email` | `person.emails.primaryEmail` | Direto. |
| `contato.id` | `person.pipeContatoId` | Campo customizado, criado por API. |
| `conta.nome` | `company.name` | Direto. |
| `conta.dominio` | `company.domainName.primaryLinkUrl` | Direto. |
| `conta.id` | `company.pipeEmpresaId` | Campo customizado, criado por API. |
| `contato.conta_id` | `person.companyId` | Só quando a conta já tem espelho. |

**O que NÃO atravessa, e por quê**: `documento` (CPF/CNPJ é dado sensível e o Twenty não tem campo
próprio para ele — iria para um customizado sem necessidade hoje), `atributos` (jsonb livre, sem
destino óbvio), `bloqueado` e `excluido_em` (estado de atendimento, não de CRM).

### O algoritmo do espelho, e por que ele é assim

```
1. contato tem twenty_pessoa_id?  → updatePerson(id)
2. não tem → people(filter: {pipeContatoId: {eq: contato.id}})  → achou? grava o id e updatePerson
3. não achou → createPerson(...)  → grava o id
```

O passo 2 é o que impede duplicata. Sem ele, o roteiro "cria no Twenty, transação do Pipe falha antes
de gravar o id" cria um registro órfão e a próxima execução cria **outro**. Com ele, a segunda
execução acha o órfão pelo `pipeContatoId` e adota. É por isso que a amarração é de mão dupla.

### Volta — leitura no painel do Desk

`GET /v1/crm/contato/:contatoId` na `apps/api` devolve o que o CRM sabe daquele cliente (nome no CRM,
empresa vinculada, e o link direto). O Desk renderiza; o Desk **não** fala com o Twenty.

É leitura e só leitura. Escrita a partir do Desk exigiria log de auditoria, que é a mesma pendência
que já segura a edição de contato lá — não vou abrir essa porta de lado.

### Onde a sincronização roda

Fila `pipe-espelho-crm` em `apps/workers`, com o mesmo formato da entrega de mensagem:

- **A fila é o empurrão**: `apps/api` enfileira quando cria ou muda o contato.
- **A varredura é a garantia**: a cada 5 minutos, contatos sem `twenty_pessoa_id` voltam para a fila.
  Job perdido atrasa o espelho; não perde o espelho.
- **Sem `Promise.all` dentro da transação.** As consultas do espelho vão em série, pelo motivo de
  sempre: paralelo na mesma conexão derruba o `set_config('pipe.tenant_id')` e a consulta passa a
  rodar sem tenant. Aqui o risco é pior que o normal, porque o passo seguinte é **escrever no CRM de
  um cliente** — e escrever no CRM errado é o defeito que esta spec inteira existe para evitar.

## 5. Multi-tenant — a regra que não se dobra

> "Eu só não posso ter clientes acessando dados de outros clientes."

O Pipe isola por linha, com RLS e `tenant_id`, falhando fechada. O Twenty isola por workspace, e
resolve o workspace pelo **host** da requisição. São modelos diferentes, e a costura entre eles é o
ponto mais perigoso desta integração.

**A amarração**: cada tenant do Pipe tem, em `tenant`, a URL da sua instância/workspace de CRM e a
sua chave de API cifrada. `apps/api` resolve as duas **a partir do `tenant_id` da sessão**, dentro do
`comTenant` — nunca de parâmetro de requisição, nunca de cabeçalho, nunca de variável global de
processo.

**Onde isso é conferido**, e é conferido em três lugares porque um só não basta:

1. **Na leitura da configuração.** `configDoTenant` roda dentro do `comTenant`. Se o RLS não deixar
   ver a linha do tenant, não há URL nem chave, e a integração não acontece. Falha fechada.
2. **Na origem do dado.** O worker recebe `tenantId` e `contatoId`, e relê o contato dentro do
   `comTenant` daquele tenant. Um `contatoId` de outro cliente simplesmente não retorna linha.
3. **Antes de escrever.** A resposta do Twenty traz `pipeContatoId`; se ele não bate com o contato que
   originou a chamada, a operação aborta e não grava id nenhum. É a rede que pega URL trocada entre
   tenants — o caso em que a chave é válida, mas para o CRM do cliente errado.

### A decisão: (A) uma instância do Twenty por cliente

**Decidido pelo dono em 07/09/2026**, com a alternativa na frente. A opção descartada era uma
instância só com multi-workspace ligado (`cliente.crm.usepipe.com.br`), que custaria um contêiner em
vez de N — mas poria o isolamento nas mãos de código que não é nosso e que não auditamos, e a
permissão por linha deles, que seria a defesa mais fina, é Enterprise. A frase do dono é literal, e
ele preferiu pagar em contêiner.

Consequência prática: `IS_MULTIWORKSPACE_ENABLED` **fica desligado**. Cada instância serve um
workspace, e é o workspace de um cliente só. Não há dado de outro cliente naquele processo — que é
exatamente o ponto.

### 5.1 Como nasce a instância de um cliente novo

Uma linha em `tenant` apontando para uma URL que ninguém sabe criar não é isolamento, é promessa.
Então o caminho está aqui, mesmo sendo manual hoje.

Por cliente, com projeto docker próprio (`pipe-crm-<slug>`) e volumes próprios:

1. **Compose.** Copiar `docker-compose.yml` do `twenty-docker`, com projeto `pipe-crm-<slug>`. Os
   volumes (`db-data`, `server-local-data`) nascem com o nome do projeto, então são naturalmente
   separados. **Nunca reaproveitar volume entre clientes** — é o erro que transforma A em nada.
2. **Segredos por cliente.** `APP_SECRET` e `ENCRYPTION_KEY` **novos e diferentes por instância**
   (`openssl rand -base64 32`). Reaproveitar o mesmo `APP_SECRET` entre clientes faz um token emitido
   para o cliente A ser aceito pelo cliente B — vazamento cross-tenant com isolamento físico intacto.
   É a armadilha mais fácil de cair aqui.
3. **Postgres e Redis próprios**, subindo no mesmo compose, sem porta publicada no host.
4. **DNS**: `crm-<slug>.usepipe.com.br` → o host. **Certificado**: o Traefik da nossa infra já resolve
   por Let's Encrypt (é o mesmo caminho do "domínio próprio" que a spec do fork lista como resolvido).
5. **`SERVER_URL`** = exatamente a URL pública. O Twenty resolve workspace por host; `SERVER_URL`
   errado quebra o login com erro que não explica nada.
6. **Subir e semear**: `docker compose -p pipe-crm-<slug> up -d`, esperar `healthz`, criar o workspace
   e a primeira conta de administrador do cliente.
7. **Campos da integração**, por instância, via API de metadados: `pipeContatoId` em `person` e
   `pipeEmpresaId` em `company`. São dado, não código — não vêm no upgrade, e **cada instância nova
   precisa deles**. Sem eles o espelho duplica registro (§4).
8. **Papel e chave**: criar o papel `Integracao Pipe` (`canBeAssignedToApiKeys: true`,
   `canUpdateAllSettings: false`) e uma chave de API com esse papel. Os papéis de fábrica não servem:
   `Member` tem `canBeAssignedToApiKeys: false`.
9. **Gravar em `tenant`**: `twenty_url` com a URL pública e `twenty_chave` com a chave, cifrada.

Os passos 6 a 9 são roteirizáveis e devem virar script antes do segundo cliente. Enquanto forem
manuais, são checklist de implantação — e o passo 2 é o que precisa de conferência de gente.

### 5.2 URL errada ou vazia falha fechado

**Nunca existe instância padrão.** Não há fallback para "o CRM da casa", porque o fallback silencioso
é justamente como o dado de um cliente vai parar no CRM de outro.

- `tenant.twenty_url` vazia ou nula → a integração **não acontece**. Sem espelho, sem link, sem erro
  na cara do atendente. O bloco do CRM some do painel.
- `tenant.twenty_chave` vazia → idem.
- URL preenchida mas inalcançável ou recusando a chave → o job **falha e é retentado**; nada é
  gravado. Nunca cai em outra instância.
- URL preenchida apontando para a instância de OUTRO cliente (erro de digitação na implantação) → a
  terceira conferência do §5 pega: a resposta traz `pipeContatoId` diferente do contato que originou a
  chamada, e a operação aborta sem gravar id.

**Isso vale teste**, e tem: `apps/api/tests/twenty.test.ts` cobre os quatro casos.

### 5.3 O custo por cliente, em números

Medido nesta máquina com `docker stats` e `du` nos volumes, na nossa imagem
(`pipe-crm:local`), instância **ociosa** com a semente completa de demonstração (~1000
`workspaceMember`) e os quatro contêineres de pé:

| Peça | RAM ociosa | Disco |
|---|---|---|
| `server` | **952 MB** | — |
| `worker` | **798 MB** | — |
| `postgres:16` | **109 MB** | **96 MB** (com a semente de demonstração inteira) |
| `redis` | **49 MB** | ~0 |
| volume `server-local-data` | — | **16 MB** |
| **Total por cliente** | **~1,9 GB** | **~112 MB** |

Mais a imagem: **1,78 GB em disco, uma vez por host** — compartilhada entre todas as instâncias da
mesma máquina, então não multiplica por cliente.

**Atenção a um número que engana, e que quase entrou nesta spec errado.** Medido segundos depois do
boot, o `server` marcava 285 MB e o `worker` estava parado — dava um total de ~600 MB, que é
otimista por um fator de três. O Node cresce o heap conforme trabalha, e o `worker` do Twenty **é um
processo do mesmo tamanho do server**, não um ajudante pequeno. O número que vale para preço é o de
regime, com o worker no ar: **~1,9 GB**.

Leitura para o preço: **conte ~2 GB de RAM e ~120 MB de disco por cliente, ocioso.** Numa VPS de
8 GB isso é, na conta grossa, **3 a 4 clientes de CRM** — e isso **sem** contar o que o Pipe em si
consome no mesmo host. O disco não é o gargalo; a RAM é, com folga. O disco cresce com o uso real do
cliente; a RAM quase não, porque já nasce alta.

Se 3 a 4 clientes por VPS de 8 GB inviabilizar o preço, o caminho **não** é voltar para a instância
compartilhada sem discutir de novo: é ou máquina maior, ou aceitar o custo como parte do preço do
isolamento que foi pedido. A decisão A foi tomada sabendo que custaria contêiner; o que ela não sabia
é que custaria este tanto. **Vale reapresentar o número ao dono.**

Dois avisos que o preço precisa carregar:

- **O upgrade do Twenty passa a ser N upgrades.** Cada instância roda a própria sequência de migração
  (levou ~2 minutos nesta máquina) e cada uma pode falhar sozinha.
- **Backup também é N backups**, com N bancos separados.

## 5.4 A prova de ponta a ponta, rodada contra a instância no ar

O roteiro está versionado em `apps/api/tests/prova-e2e-twenty.ts` — não é teste automatizado, é a
evidência, para a próxima pessoa repetir em vez de acreditar:

```
PIPE_TWENTY_CHAVE=<chave> pnpm --filter @pipe/api exec tsx tests/prova-e2e-twenty.ts
```

Resultado em 07/09/2026, contra a nossa imagem (`pipe-crm:local`) em `localhost:3500`:

```
tenant  86747871-6f75-4540-a875-9d53c8eee3c3
contato 7c646b70-9cbd-437b-89b1-dadea1958ebc  "Cliente Prova 4d9fcfb4"
espelho: {"estado":"espelhado","pessoaId":"9f14af3c-bfc9-41e9-97bd-4780a79a527f"}
coluna twenty_pessoa_id = 9f14af3c-bfc9-41e9-97bd-4780a79a527f
no CRM: {"id":"9f14af3c-…","pipeContatoId":"7c646b70-…",
         "name":{"firstName":"Cliente","lastName":"Prova 4d9fcfb4"},
         "emails":{"primaryEmail":"prova.4d9fcfb4@exemplo.com.br"},
         "phones":{"primaryPhoneNumber":"11977776666",
                   "primaryPhoneCallingCode":"+55","primaryPhoneCountryCode":"BR"}}
segunda passada: {"estado":"espelhado","pessoaId":"9f14af3c-…"} — mesmo id, sem duplicata
```

O que isso prova, ponto a ponto:

- contato do Pipe virou `person` no CRM, com nome partido, telefone partido em DDI/país e e-mail;
- o `pipeContatoId` do lado de lá é o id do nosso contato — a amarração de mão dupla fechou;
- o `twenty_pessoa_id` voltou para a nossa coluna, que é o que faz o link direto existir;
- **a segunda passada devolveu o MESMO id**, ou seja, o passo anti-duplicata do §4 funciona de
  verdade e não só no teste com `fetch` de mentira;
- o link `http://localhost:3500/object/person/9f14af3c-…` responde 200, e `…/objects/people` também.

## 6. Segredo

A chave de API do Twenty entra em `tenant.twenty_chave` cifrada por `cifrar()` do
`packages/db/src/segredo.ts`, com o mesmo chaveiro `PIPE_CHAVES_SEGREDO` que já protege o token da
Meta. Vale o que já valia: **nunca em texto puro no banco, nunca em log**. O cliente do Twenty
registra a URL e o objeto da falha, jamais o cabeçalho `Authorization`.

Uma chave do Twenty é o CRM inteiro daquele cliente na mão de quem a tiver — e, diferente do token da
Meta, ela também **lê**. Um dump sem cifra entrega a base de clientes de todos os tenants de uma vez.

## 7. Variáveis novas

```
PIPE_TWENTY_URL=http://localhost:3500     # base; dela saem /graphql e /metadata
PIPE_TWENTY_TIMEOUT_MS=8000               # o CRM fora do ar não pode pendurar o worker
NEXT_PUBLIC_PIPE_CRM_URL=http://localhost:3500   # o trilho do Desk passa a apontar aqui
```

`PIPE_TWENTY_URL` é o **fallback** para instalação de um cliente só. O lugar certo é
`tenant.twenty_url`, pelo mesmo motivo que o token da Meta mora em `canal.config` e não no ambiente.

## 8. O que fica pendente, e de quem depende

| Pendência | De quem |
|---|---|
| ~~A ou B do §5~~ | **decidido: A**, 07/09 |
| ~~1 ou 2 do §2~~ | **decidido: 1 (Google)**, 07/09 |
| Credenciais do Google e descomentar `AUTH_GOOGLE_*` no compose | dono (credenciais) + agente do fork (compose) |
| Script de provisionamento dos passos 6–9 do §5.1 | antes do segundo cliente |
| SMTP na instância do cliente (`EMAIL_DRIVER=SMTP`) | antes de vender — hoje convite não é entregue (§2) |
| Rota por conversa no Desk, para o link de volta de dentro do Twenty | depois; teto anotado no §3 |
| Convidar gente no workspace do Twenty | manual e do cliente hoje (§2) |
