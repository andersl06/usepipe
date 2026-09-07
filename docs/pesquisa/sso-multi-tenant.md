# SSO multi-tenant que o cliente configura sozinho (BYO IdP)

Pesquisa de 07/09/2026. **Decisões tomadas**, com o preço de cada uma escrito.

O problema, em uma frase: a empresa cliente chega com Microsoft Entra ID, Google Workspace ou
Okta, liga ao Pipe pela tela dela mesma, e nós não escrevemos uma linha por cliente.

Três restrições que vêm de decisão já tomada e não se negociam aqui:

1. **O tenant é resolvido pelo login, não pelo subdomínio**
   ([infraestrutura §3](../specs/2026-09-05-infraestrutura.md)). O SSO tem de descobrir *qual
   empresa* antes de saber *quem é a pessoa* — a ordem inversa da intuição.
2. **A sessão precisa carregar o `tenant_id`**, senão a RLS não devolve linha
   ([README](../../README.md)). Quem autentica tem de terminar com uma linha em `sessao` nossa.
3. **O SSO tem de ser nosso.** Os 28 arquivos de `sso + auth + jwt` do Twenty são
   `/* @license Enterprise */`, licença comercial fechada
   ([fork do Twenty §2](../specs/2026-09-07-fork-do-twenty.md)). Ler para entender é permitido;
   copiar não é. E o fork precisa aceitar a nossa sessão.

---

## Antes de tudo: quando isso entra

**Não agora.** SSO empresarial só ganha o seu container no dia em que o primeiro contrato exigir.
Até lá, senha + TOTP na `sessao` que já existe resolve, e todo o desenho abaixo fica escrito
esperando o gatilho. O que **entra desde já** são três coisas baratas que ficam caras depois:
a tabela `identidade_externa` (§8), o e-mail nunca virar chave de conta, e a `politica_sso` do
tenant existir mesmo desligada.

O resto deste documento é o que se faz quando o gatilho chega.

---

## 1. Construir ou usar pronto

### Decisão: **Keycloak**, como *broker* de federação, não como dono do login.

Isso é mais estreito do que "adotar Keycloak" e é a parte que importa:

```
navegador ──► api.usepipe.com.br          (dono da sessão, da RLS e do usuário)
                   │  OIDC, um único cliente, para sempre
                   ▼
              Keycloak (realm único `pipe`)
                   │  N conexões, uma por cliente, configuradas por API
        ┌──────────┼──────────┬──────────────┐
        ▼          ▼          ▼              ▼
     Entra ID    Okta   Google Workspace   ADFS…
```

A nossa API fala **um** protocolo com **um** provedor. Quantos IdPs os clientes trouxerem é
problema de configuração do Keycloak, não de código nosso. `usuario`, `papel`, `sessao` e a RLS
continuam sendo nossos, exatamente como estão em
[`identidade.ts`](../../packages/db/src/schema/identidade.ts). Keycloak **não** vira dono do
usuário e **não** autentica quem usa senha — migrar o login por senha para lá não compra nada e
custa o caminho inteiro de autenticação.

### Por que Keycloak e não os outros

| | Keycloak | Authentik | Zitadel | Biblioteca na nossa API |
|---|---|---|---|---|
| Licença | Apache 2.0, CNCF incubating desde 04/2023 ([CNCF](https://www.cncf.io/blog/2023/04/11/keycloak-joins-cncf-as-an-incubating-project/)) | MIT no núcleo, licença comercial para parte das funções ([comparativo](https://wz-it.com/en/blog/authentik-vs-zitadel-identity-provider-comparison/)) | **AGPLv3 desde o v3, 31/03/2025** ([anúncio](https://zitadel.com/blog/apache-to-agpl)) | n/a |
| IdP por cliente com descoberta por domínio de e-mail | **pronto** (Organizations) | por *brand*/fluxo, com trabalho | Organizations | escrever |
| Memória | JVM: ~1250 MB base com 10k sessões em cache ([sizing oficial](https://www.keycloak.org/high-availability/multi-cluster/concepts-memory-and-cpu-sizing)) | ~2 GB numa VPS pequena ([comparativo](https://use-apify.com/blog/authentik-vs-keycloak-2026)) | binário Go, pegada baixa ([Cerbos](https://www.cerbos.dev/blog/keycloak-vs-zitadel)) | ~0 |
| Manutenção | upgrade trimestral, tuning de JVM | upgrades + Redis/worker Python | upgrade de binário | **nós viramos os mantenedores do SAML** |

O desempate é a licença. Este produto **já carrega uma obrigação AGPL** — o fork do Twenty — e a
regra técnica mais importante do projeto é manter essa obrigação parada no CRM. Zitadel migrou de
Apache 2.0 para AGPLv3 no v3 ([Zitadel](https://zitadel.com/blog/apache-to-agpl)). Rodar Zitadel
sem modificar não contamina nada (é serviço separado, e a §13 alcança a *versão modificada*), mas
significa uma segunda superfície AGPL na camada mais sensível do produto, e a primeira vez que
alguém precisar de um patch no provedor de identidade a conversa vira jurídica. Keycloak é Apache
2.0: patch, fork e customização sem consequência. Não vale trocar isso por RAM.

O que fecha a escolha é a peça que resolve sozinha o requisito central: **Keycloak Organizations**,
estável desde a 26. Uma organização mapeia um ou mais domínios de e-mail, tem identity providers
próprios ligados a ela, e com *"Redirect when email domain matches"* ligado o usuário é mandado
direto ao IdP da empresa dele e vira membro da organização no primeiro login
([Keycloak](https://www.keycloak.org/2024/06/announcement-keycloak-organizations),
[CNCF](https://www.cncf.io/blog/2024/11/13/scalable-authentication-across-organizations-with-keycloak-26/)).
Isso é Home Realm Discovery por tenant, de fábrica. **Uma organização do Keycloak = um tenant do
Pipe.**

E é tudo dirigível por API, o que é o que permite o cliente configurar **na nossa tela** e nunca
ver o console do Keycloak: `POST /{realm}/identity-provider/import-config` importa o descriptor
SAML a partir da URL de metadata, `POST /{realm}/identity-provider/instances` cria o provedor, e
`/admin/realms/{realm}/organizations/{orgId}` gerencia organização, domínios e membros
([Admin REST API](https://www.keycloak.org/docs-api/latest/rest-api/index.html)).

### Por que não biblioteca direto no NestJS

`openid-client` + `@node-saml/node-saml` é o caminho de menor RAM e nenhum container novo, e o
`passport-saml` suporta múltiplas instâncias com configurações diferentes, que é o que
multi-tenant exige ([node-saml](https://github.com/node-saml/passport-saml)). É tentador e está
errado. Passaríamos a ser os donos de: parse de metadata, rotação de certificado, validação de
assinatura à prova de XSW, cache de replay, tolerância de relógio, `InResponseTo`, e as manias
individuais de cada IdP. A §8 deste documento é a lista do que quebra — é longa, cada item já
derrubou produto de gente séria, e nenhum item dá erro visível quando está errado: dá **login
concedido**. Preguiça de verdade é não escrever esse código; é o oposto de preguiça assumir a
manutenção dele para economizar um container.

### O preço da escolha, sem maquiagem

- **~1,5 GB de RAM** na VPS, mais o crescimento por sessão em cache: +500 MB por 100 mil sessões
  ativas, e 1 vCPU por 15 logins/s ([sizing oficial](https://www.keycloak.org/high-availability/multi-cluster/concepts-memory-and-cpu-sizing)).
  Para a escala do Pipe (dezenas de atendentes por cliente) é ruído; para a VPS de hoje não é.
- **Um banco a mais** para o Keycloak. Não é o nosso Postgres com RLS: é um banco separado, com
  backup próprio, e entra na rotina de restauração testada da
  [infraestrutura §7](../specs/2026-09-05-infraestrutura.md).
- **Cadência de upgrade do Keycloak**, que é trimestral e ocasionalmente quebra configuração.
- **Um componente Java na stack**, que ninguém aqui vai querer depurar às 3 da manhã. Mitigação:
  ele é uma caixa preta com uma responsabilidade única e configuração declarativa versionada
  (import de realm no boot). Se ele cair, o login por senha continua funcionando — e essa é uma
  decisão de projeto, não um acidente.

---

## 2. Como o tenant é descoberto no login

### Decisão: **e-mail primeiro** (HRD por domínio verificado), com **código do tenant** como saída e **link direto** como conveniência.

Uma tela, um campo: e-mail. O botão diz "Continuar", não "Entrar".

```
POST /auth/descobrir { email }
        │
        ├─ domínio verificado e ligado a um tenant com SSO ativo
        │     → 302 para o Keycloak com a organização, sem senha, sem botão de SSO
        │
        ├─ domínio verificado e ligado a tenant SEM SSO
        │     → campo de senha, tenant já resolvido
        │
        └─ domínio público (gmail/hotmail/…) ou desconhecido
              → campo de senha; tenant resolvido depois, pelo par (email, senha)
```

Isso é o padrão do mercado e é o que o Keycloak faz nativamente quando o domínio bate com a
organização ([Keycloak Organizations](https://www.keycloak.org/2024/06/announcement-keycloak-organizations)).

**O domínio só roteia depois de verificado por DNS.** O cliente adiciona um TXT
`_pipe-verificacao.<dominio>` com um token que geramos; até o TXT aparecer, o domínio está
cadastrado e inerte. Verificação por TXT é o padrão porque não depende do site estar no ar e
sobrevive a troca de servidor ([Namesilo](https://www.namesilo.com/blog/en/dns/custom-domains-in-saas-txt-vs-cname-verification-and-when-to-use-each)),
e sem ela qualquer cliente sequestra o login de qualquer outro só digitando o domínio dele
([boas práticas](https://www.domchekr.com/blog/domain-verification-best-practices/)). O mesmo TXT
tem de permanecer depois: removê-lo libera o domínio para outro tenant reivindicar.

### E quando a pessoa tem e-mail pessoal

Acontece mais do que se admite: o dono da agência que usa `@gmail.com`, o terceirizado, o
consultor. Três regras:

1. **Lista de domínios públicos é bloqueada para mapeamento**, permanentemente. `gmail.com`,
   `outlook.com`, `hotmail.com`, `yahoo.com.br`, `icloud.com` e companhia nunca podem ser
   reivindicados por um tenant. Um cliente que mapeasse `gmail.com` capturaria o login de meio
   Brasil.
2. **E-mail pessoal nunca entra por JIT.** Ele existe porque um admin convidou, e entra por senha
   — ou pelo IdP, se a empresa colocou aquele endereço como convidado no diretório dela; aí o IdP
   responde por ele, e o vínculo é por `sub`, não por domínio.
3. **Saída para o tenant:** o link direto `app.usepipe.com.br/e/<slug>` — que é a mesma descoberta,
   feita pela URL em vez do e-mail — e, na tela de senha, um "minha empresa usa SSO" que pede o
   código do tenant. Código digitado é a terceira opção porque ninguém decora código; ele existe
   para o caso em que o e-mail não resolve.

**Duas armadilhas do endpoint de descoberta:**

- **Enumeração.** `POST /auth/descobrir` responde a mesma forma, e no mesmo tempo, para e-mail
  conhecido e desconhecido, exceto no caso de domínio verificado com SSO — que é público de
  qualquer jeito, porque o cliente escolheu ligar. Sem isso o endpoint vira catálogo de "quais
  empresas usam Pipe".
- **Mesmo e-mail em dois tenants.** Já é permitido: o índice é
  `usuario_tenant_email_uk (tenant_id, email)`. Se o domínio não desempatar, o seletor de empresa
  aparece **depois** da autenticação, nunca antes — antes seria vazamento.

---

## 3. Onde o cliente configura, na prática

**Gestão → Configurações → Acesso e SSO.** Ele nunca vê o console do Keycloak; a tela fala com o
Admin REST API.

### O que ele preenche

**Caminho curto (o que 90% vai usar), SAML:**

| Campo | Observação |
|---|---|
| URL de metadata do IdP | um campo. Puxamos entity ID, URL de SSO e certificado dela |
| Domínios de e-mail | um ou mais, cada um com o TXT a verificar |

Metadata por URL também resolve rotação de certificado sozinha, que é a causa número um de "o SSO
parou num sábado".

**Caminho longo, para IdP que não publica metadata:** Entity ID / Issuer do IdP, URL de SSO
(HTTP-POST), e o certificado X.509 de assinatura colado.

**OIDC:** URL do *issuer* (`.well-known/openid-configuration`), `client_id` e `client_secret`.

### O que devolvemos para ele colar no IdP

| O que damos | Nome no Entra ID | Nome no Okta | Nome no Google Workspace |
|---|---|---|---|
| `https://sso.usepipe.com.br/realms/pipe/broker/<alias>/endpoint` | Reply URL (ACS) | Single sign-on URL | ACS URL |
| `https://sso.usepipe.com.br/realms/pipe` | Identifier (Entity ID) | Audience URI (SP Entity ID) | Entity ID |
| URL de metadata do SP, mais um botão "baixar XML" | — | — | — |

Nomes conferidos na documentação de cada um: o Entra ID pede *Identifier (Entity ID)* e *Reply URL*
num app não-galeria ([Microsoft](https://learn.microsoft.com/en-us/answers/questions/450746/unable-to-set-identifier-(entity-id)-or-reply-url),
[WorkOS](https://workos.com/docs/integrations/entra-id-saml)); o Okta pede *Single sign on URL* e
*Audience URI (SP Entity ID)* ([Okta](https://devforum.okta.com/t/saml-acs-url-and-sp-entity-id/14785));
o Google pede ACS URL e Entity ID do lado SP e devolve SSO URL, Entity ID e certificado
([Google via authentik](https://docs.goauthentik.io/users-sources/sources/social-logins/google/workspace/)).
A tela mostra os três nomes lado a lado, porque o suporte que a gente economiza aqui paga a tela.

**Atributos que pedimos que o IdP mande:** `email`, `firstName`/`lastName` e, se houver mapeamento
de papel (§5), `groups`. Para Entra ID via OIDC, pedir também o claim opcional **`xms_edov`** — a
razão está na §8 e não é opcional.

### Como se testa sem quebrar o login de quem já está dentro

A conexão tem estado, e ele avança em passos separados. **Salvar não liga nada.**

| Estado | O que faz | Quem é afetado |
|---|---|---|
| `rascunho` | configuração salva, IdP criado no Keycloak, domínio ainda não roteia | ninguém |
| `testada` | um teste passou nos últimos 30 dias | ninguém |
| `ativa` | domínio roteia; usuários entram por SSO | todos, mas a senha continua valendo |

E, **separado da conexão**, a política do tenant: `desligado → opcional → obrigatorio` (§6).
Ligar o SSO e exigir o SSO são dois botões e dois registros de auditoria. Todo incidente de "o
cliente inteiro ficou de fora" nasce de serem o mesmo botão.

**O teste** é um link `/sso/testar/<id>` que faz o fluxo inteiro — redireciona ao IdP, recebe a
asserção, valida — e no fim **não cria sessão**: renderiza uma tabela com os claims recebidos, o
`sub`, o e-mail, os grupos, e o que casou ou não casou com usuário existente. Quem clica é o admin
do cliente, já logado por senha, e a sessão dele não é tocada. Só depois de um teste verde a
conexão pode ir para `ativa`.

---

## 4. Provisionamento de usuário

### Decisão: **JIT por padrão. SCIM quando um cliente exigir, não antes. Convite manual sempre disponível.**

JIT cria e atualiza a conta no login e **não desprovisiona ninguém**, que é exatamente por que ele
não basta sozinho para a TI de empresa grande; SCIM cobre o ciclo de vida inteiro, incluindo o
desligamento ([Clerk](https://clerk.com/articles/scim-vs-jit-provisioning-when-to-use-each),
[SSOJet](https://ssojet.com/blog/scim-vs-manual-user-provisioning-enterprise)). A régua que a
literatura usa é a de mil assentos ([SSOJet](https://ssojet.com/blog/scim-vs-manual-user-provisioning-enterprise));
a nossa, mais honesta para o nosso tamanho: **SCIM entra quando o primeiro cliente colocar isso em
RFP**, e não antes, porque implementar `/Users` e `/Groups` do SCIM 2.0 com `PATCH` correto é
semanas de trabalho para clientes que ainda não existem. Quando entrar, o Keycloak tem servidor
SCIM nativo em *preview* a partir da 26.6, e extensões de comunidade antes disso
([Keycloak](https://www.keycloak.org/2026/02/scim-support-survey-feedback)) — mas o alvo da
sincronização é a nossa tabela `usuario`, não a dele, então provavelmente o endpoint é nosso.

**Regras do JIT**, que são o que impede a conta órfã:

- Só cria usuário se o domínio do e-mail estiver **verificado para aquele tenant**.
- Nasce com o papel mais baixo do tenant. **JIT nunca cria admin**, aconteça o que acontecer com o
  mapeamento de grupo.
- Vincula por `(emissor, sujeito)`, nunca por e-mail (§8).
- A Gestão tem um painel "criados por SSO nos últimos 7 dias", que é como o admin descobre que 40
  pessoas entraram sem ele saber.

### Quando a sessão morre

A pergunta certa. Quatro caminhos, e a resposta honesta para o cliente é o **pior** deles:

| Caminho | Latência | Existe quando |
|---|---|---|
| Admin do Pipe clica "encerrar sessões" | imediato | sempre |
| Back-channel logout do Keycloak → nossa API apaga as linhas de `sessao` | segundos | sempre, se o IdP mandar o logout ([OIDC back-channel](https://auth0.com/docs/authenticate/login/logout/back-channel-logout)) |
| SCIM `active: false` → `usuario.ativo = false` + sessões apagadas | segundos | só com SCIM |
| **Expiração natural da sessão de SSO** | **até 8 horas** | sempre |

**Sessão de usuário de SSO vive 8 horas, não 30 dias.** Na renovação, a API refaz o fluxo contra o
Keycloak com `prompt=none`: se o IdP disser que a pessoa não está mais lá, a sessão termina ali. É
o que fecha a janela sem SCIM.

> `ponytail:` a janela de 8h é o teto assumido. A resposta comercial para "e se demitirem alguém às
> 9h da manhã?" é: o admin clica em encerrar, ou o cliente contrata SCIM. Não prometa revogação
> instantânea sem SCIM ou sem back-channel logout confirmado do IdP dele.

---

## 5. Papel e permissão vindos do IdP

### Decisão: **o papel é nosso. Mapeamento de grupo existe, vem desligado, e é opcional por tenant.**

Os papéis do Pipe são semânticos e por tenant — atendente com fila, supervisor de equipe,
monitoria — e `papel` já é uma tabela com `tenant_id` e `de_sistema`
([`identidade.ts`](../../packages/db/src/schema/identidade.ts)). Nenhum cliente modela isso no AD
dele, e nenhum vai criar `pipe-supervisor-fila-financeiro` no Entra só para nos agradar. Mapear
grupo por padrão troca um problema que já temos resolvido por um que não temos.

Quando o cliente pedir — e cliente grande pede, porque a auditoria interna dele exige que acesso
saia do diretório —, o mapeamento liga com quatro travas:

1. **De grupo para papel existente.** Grupo sem correspondência não cria papel, não vira admin,
   não faz nada: cai no papel padrão do tenant.
2. **Autoritativo em todo login.** Grupo removido no IdP remove o papel no Pipe. Mapeamento que só
   concede e nunca revoga é catraca, e catraca é o mecanismo pelo qual todo mundo vira admin em
   dezoito meses.
3. **A conta de emergência é imune** (§6). Se o mapeamento errar, alguém ainda entra para
   consertar.
4. **Toda mudança de papel por mapeamento vai para `log_auditoria`** com ator `sistema`. A tabela
   já existe e já é o lugar disso.

---

## 6. Convivência: SSO e senha no mesmo tenant

### Decisão: **política por tenant com três estados e uma lista explícita de exceções.**

`politica_sso`: `desligado` (só senha) → `opcional` (os dois, para migrar) → `obrigatorio`
(só SSO, exceto exceções). O caminho normal de um cliente é `desligado → opcional → obrigatorio`,
e `opcional` pode durar meses. Isso é normal, e é o motivo de a política existir.

O que impede isso de virar porta dos fundos — cada item é um jeito conhecido de furar SSO
obrigatório:

- **A checagem é no servidor, contra a política do tenant, no endpoint de senha.** Não é a tela
  que esconde o campo. Com `obrigatorio`, `POST /auth/senha` recusa o usuário daquele tenant
  **mesmo que `senha_hash` exista e esteja certa**.
- **Ao entrar em `obrigatorio`, `senha_hash` vai a `NULL`** para todo mundo menos as exceções.
  Senha que existe mas não pode ser usada é uma mina esperando um refactor.
- **Recuperação de senha respeita a política.** É a porta dos fundos clássica: SSO exigido, e o
  "esqueci minha senha" continua emitindo sessão. Com `obrigatorio`, o fluxo de recuperação
  responde "sua empresa entra pelo SSO" e não manda e-mail nenhum.
- **Convite por link também respeita.** Convite em tenant `obrigatorio` não define senha: manda
  para o IdP.
- **Conta de emergência (*break-glass*): no mínimo uma, no máximo duas, nomeadas.** Senha forte +
  TOTP, isentas do mapeamento de papel, e cada login delas gera alerta, não só linha de auditoria.
  Sem uma conta assim declarada, o IdP do cliente cai numa sexta-feira e ninguém entra — e aí
  alguém inventa uma porta dos fundos não documentada, que é bem pior.
- **`chave_api` não é sessão de usuário e não é afetada pela política.** Mas ela é revogável e
  pertence a um usuário: quando o usuário é desativado, as chaves criadas por ele entram na
  revisão. Chave de API é o vetor de acesso que sobrevive a desligamento em todo produto que
  esqueceu de olhar para ele.

---

## 7. O fork do Twenty na conversa

### Decisão: **o fork vira mais um cliente OIDC do mesmo Keycloak.** Não é token de serviço.

O fork já conversa com o Pipe por rede, por decisão de licença
([fork §2](../specs/2026-09-07-fork-do-twenty.md)). O SSO dele é Enterprise e não pode ser copiado
— mas **reimplementar do zero é permitido pelo mesmo documento**, e um *relying party* OIDC
escrito do zero é código pequeno e conhecido. Ele vive no repositório do fork, é nosso, e nada
dele volta para `apps/*` ou `packages/*`.

Fluxo: o atendente clica em CRM na Gestão → o fork inicia authorization code + PKCE contra o
Keycloak → o Keycloak já tem sessão daquele usuário, porque ele acabou de entrar no Pipe → volta
sem pedir nada. Login único de verdade, sem o Pipe emitir credencial para o CRM.

O ID token leva um claim `pipe_tenant` com o `tenant.slug`. Onde mora o mapeamento
tenant → *workspace* do Twenty é a **decisão 3 do [fork §4](../specs/2026-09-07-fork-do-twenty.md)**,
que ainda não tem resposta, e este documento não a antecipa. O que fica fixado aqui é que a
informação chega ao fork como claim, e não como consulta ao nosso banco.

**Por que não token de serviço / impersonação.** A alternativa seria a nossa API assinar um JWT
que o fork aceita como "este usuário está autenticado". Isso transforma a nossa API em autoridade
certificadora do CRM: qualquer defeito de assinatura, de escopo ou de expiração lá vira
comprometimento total do CRM de todos os clientes, e o log do fork passa a mostrar sessões cuja
origem só existe do nosso lado. Não vale para economizar um cliente OIDC.

**Para chamada máquina-a-máquina** — a ponte de `packages/core` que transforma conversa em lead —
nada disso se aplica: é uma API key do Twenty por tenant, que é o mecanismo nativo dele
(`Authorization: Bearer <api key>` no REST e no GraphQL), guardada cifrada do nosso lado como já
manda a [infraestrutura §6](../specs/2026-09-05-infraestrutura.md).

---

## 8. As armadilhas que derrubam implementação de SSO

Nenhuma delas dá erro. Todas dão **login concedido**. Esta lista é o que justifica a §1.

### Validação da asserção

| Armadilha | Mitigação |
|---|---|
| Assinatura validada com a chave que vem **dentro** do próprio documento (`KeyInfo`) | validar contra o certificado guardado localmente e **ignorar `KeyInfo`**; exigir RSA-SHA-256 ou mais forte, rejeitar SHA-1 ([OWASP](https://cheatsheetseries.owasp.org/cheatsheets/SAML_Security_Cheat_Sheet.html)) |
| **XML Signature Wrapping**: a assinatura é válida, mas cobre outro elemento que não a asserção usada | verificar que o `<ds:Reference URI>` cobre a `<saml:Assertion>` de fato consumida; XPath absoluto, nunca relativo ([OWASP](https://cheatsheetseries.owasp.org/cheatsheets/SAML_Security_Cheat_Sheet.html), [Snyk](https://snyk.io/blog/common-saml-vulnerabilities-remediate/)) |
| **`audience` não validado**: asserção emitida para outro SP é aceita aqui | `<saml:Audience>` igual ao nosso Entity ID; `Destination` igual à nossa ACS exata; em OIDC, `aud` igual ao nosso `client_id` ([OWASP](https://cheatsheetseries.owasp.org/cheatsheets/SAML_Security_Cheat_Sheet.html)) |
| **Emissor não fixado**: em app multi-tenant no Entra, qualquer diretório da Microsoft entra | validar `iss` exato e o `tid` contra a lista daquele tenant; o `iss` é `https://login.microsoftonline.com/{tid}/v2.0`, nunca curinga ([Microsoft](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference)) |
| **Replay**: a resposta passa pelo navegador, é trivial capturar e reenviar | cache de IDs de asserção (e `jti` em OIDC) até o `NotOnOrAfter`; validar `NotBefore`/`NotOnOrAfter` com tolerância pequena; validar `InResponseTo`, `state` e `nonce` ([WorkOS](https://workos.com/blog/fun-with-saml-sso-vulnerabilities-and-footguns)) |
| **Login iniciado pelo IdP** não tem `InResponseTo` para comparar | só SP-initiated. Se um cliente exigir IdP-initiated, o cache de replay deixa de ser opcional e vira condição |
| **`RelayState` como redirect aberto** | `RelayState` carrega **um identificador opaco** de um registro nosso, nunca uma URL vinda da requisição; no destino, allowlist ([OWASP](https://cheatsheetseries.owasp.org/cheatsheets/SAML_Security_Cheat_Sheet.html)) |
| **Certificado do IdP vence** e o SSO cai num fim de semana | metadata por URL, com releitura periódica; aceitar dois certificados durante a rotação; alerta 30 dias antes do vencimento |

### Identidade da conta — a armadilha que mais custa

**O e-mail não é a chave da conta. Nunca.** A OIDC Core §5.7 diz que `email` não deve ser usado
como chave de identidade sem `email_verified` verdadeiro, e o padrão de ataque é conhecido: quem
consiga fazer um IdP confiável emitir um token com o `email` da vítima e `email_verified` falso
entra como a vítima, com os papéis dela — inclusive admin
([advisory Budibase](https://advisories.gitlab.com/npm/@budibase/server/GHSA-hp6v-6jw7-gv2f/)).

O agravante prático: **o Entra ID não emite `email_verified`**, então quem trata claim ausente como
falso quebra o Entra inteiro, e quem trata como verdadeiro abre o buraco
([coder#26380](https://github.com/coder/coder/issues/26380),
[mcp-context-forge#4391](https://github.com/IBM/mcp-context-forge/issues/4391)). O equivalente da
Microsoft é o claim opcional **`xms_edov`** — booleano dizendo que o domínio do e-mail foi
verificado pelo dono do tenant; contas SAML/WS-Fed federadas **não** têm domínio verificado
([Microsoft](https://learn.microsoft.com/en-us/entra/identity-platform/optional-claims-reference)).
A mesma página avisa, em caixa de alerta, que `email` e `upn` são mutáveis e **nunca** devem ser
usados para autorização.

Portanto:

- **Chave da conta = `(emissor, sujeito)`**, guardada em `identidade_externa`. Para Entra, o
  sujeito é `oid`, não `sub`: o `sub` é *pairwise* por registro de aplicativo e muda se o app for
  recriado, orfanando todas as contas; o `oid` é estável no diretório, e o par estável de verdade
  é `{tid}:{oid}` ([Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/2279009/difference-between-oid-and-sub-of-access-token)).
- **Vincular a um usuário existente pelo e-mail só se as três forem verdade:** o domínio está
  verificado para aquele tenant (§2), *e* o claim de verificação é positivo (`email_verified`, ou
  `xms_edov` no Entra), *e* o usuário existente pertence ao mesmo tenant. Faltando qualquer uma,
  não vincula: cria identidade nova e pede vínculo explícito do admin.
- **E-mail que muda no IdP não muda a conta.** Atualiza o campo `email` do usuário; a identidade
  continua sendo o par emissor/sujeito.

### Conta órfã e escalada

| Armadilha | Mitigação |
|---|---|
| JIT cria usuários que nenhum admin viu, e eles ficam para sempre | JIT só em domínio verificado; painel de criados por SSO; sessão de 8h com revalidação (§4) |
| Mapeamento de grupo concede admin por acidente | JIT nunca cria admin; mapeamento só para papéis existentes; mapeamento autoritativo (§5) |
| Usuário some do IdP mas continua entrando | revalidação `prompt=none`, back-channel logout, e SCIM quando existir (§4) |
| Um tenant reivindica o domínio de outro e captura o login | TXT no DNS antes de rotear, domínios públicos bloqueados, TXT tem de permanecer (§2) |
| SSO obrigatório furado pelo "esqueci minha senha" | política checada no servidor em **todos** os caminhos que emitem sessão (§6) |
| Endpoint de descoberta vira catálogo de clientes | resposta e tempo iguais para e-mail conhecido e desconhecido (§2) |

Tudo isso vai para `log_auditoria` — a tabela já existe e já tem `ator_tipo = 'sistema'`.

---

## O que isso pede de `packages/db`

Lido o [`identidade.ts`](../../packages/db/src/schema/identidade.ts) antes de propor. `usuario`
já tem `senha_hash` **nullable**, que é exatamente o que um usuário só-SSO precisa, e `sessao` já
tem o necessário para revogar. Faltam três tabelas e um campo, e nenhum é enfeite:

| Tabela / campo | Por quê |
|---|---|
| `dominio_tenant` (`tenant_id`, `dominio`, `token_verificacao`, `verificado_em`) | sem ela não há descoberta por e-mail nem vínculo seguro (§2, §8) |
| `identidade_externa` (`tenant_id`, `usuario_id`, `emissor`, `sujeito`), único em `(emissor, sujeito)` | é a chave real da conta. Sem ela, o e-mail vira chave e a §8 inteira desmorona |
| `conexao_sso` (`tenant_id`, `tipo`, `idp_alias`, `estado`, `politica_sso`, `excecoes`, carimbos) | espelho fino da configuração que vive no Keycloak, para a nossa tela e a nossa auditoria. **Segredo do IdP não mora aqui** — mora no Keycloak |
| `sessao.origem` (`'senha' \| 'sso'`) | encerrar em massa por política sem um join a cada revogação |

---

## Resumo das decisões

| # | Decisão |
|---|---|
| 1 | **Keycloak** (Apache 2.0, CNCF) como broker de federação. Não é dono do usuário nem da sessão. Preço: ~1,5 GB de RAM, um banco a mais, JVM na stack. Entra quando o primeiro contrato exigir |
| 2 | **E-mail com domínio verificado por DNS TXT** (HRD). Link direto por tenant como conveniência, código digitado como saída. Domínio público nunca mapeia |
| 3 | Tela na **Gestão**, dirigindo o Admin REST API do Keycloak. Uma URL de metadata resolve o caminho curto. Conexão tem estado, e **ligar SSO e exigir SSO são dois botões** |
| 4 | **JIT** por padrão, com trava de domínio verificado e papel mínimo. **SCIM** só sob demanda de contrato. Sessão de SSO vive **8 horas** |
| 5 | **Papel é nosso.** Mapeamento de grupo é opcional, desligado por padrão, autoritativo quando ligado |
| 6 | Política por tenant: `desligado / opcional / obrigatorio`, checada **no servidor em todo caminho que emite sessão**, com conta de emergência declarada |
| 7 | O **fork do Twenty vira cliente OIDC** do mesmo Keycloak, com RP escrito do zero no repositório do fork. Máquina-a-máquina continua por API key do Twenty |
| 8 | Chave da conta é `(emissor, sujeito)` — `{tid}:{oid}` no Entra. E-mail nunca. `xms_edov` obrigatório no Entra |
