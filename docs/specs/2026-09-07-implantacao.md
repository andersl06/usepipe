# Implantação: do zero ao WhatsApp respondendo

Vinculante. Escrito em 07/09/2026, depois de revisar `infra/compose/docker-compose.prod.yml`
linha a linha — que até hoje nunca tinha subido.

Este documento é o roteiro de uma pessoa só, na ordem exata. Cada passo diz **quem faz**:

- **[DONO]** — só você pode. Envolve cartão de crédito, painel de terceiro, ou uma decisão.
- **[SISTEMA]** — o script faz. Se ele parar, a mensagem diz o que falta.

A regra que vale para o documento inteiro: **quando um passo [SISTEMA] falha, não improvise um
contorno.** Ou a mensagem de erro explica o que fazer, ou é defeito nosso e vira correção no
repositório. Contorno manual em produção é dívida que ninguém registra.

---

## 1. O que precisa existir antes de qualquer comando

Cinco coisas, todas **[DONO]**, e nenhuma leva mais que meia hora — mas duas delas têm espera
de terceiros no meio, então comece por elas.

| # | O que | Onde | Espera |
|---|---|---|---|
| 1.1 | Registrar `usepipe.com.br` | Registro.br | minutos; propagação até 24h |
| 1.2 | Contratar a VPS | painel do provedor | minutos |
| 1.3 | Criar o aplicativo OAuth no Google | Google Cloud Console | minutos |
| 1.4 | Criar o aplicativo na Meta e pedir o número | Meta for Developers | **dias**, se o número for novo |
| 1.5 | Gerar as chaves de cifra e o par `age` | sua máquina | minutos |

### 1.1 O domínio — [DONO]

`usepipe.com.br` é `.br`, então nasce no **Registro.br**, não em registrador estrangeiro. Precisa
de CPF ou CNPJ brasileiro. Registre e **deixe os nameservers como estão por enquanto**: a §4
decide se o DNS fica no Registro.br mesmo ou vai para a Cloudflare.

### 1.2 A VPS — [DONO], e é aqui que a spec de infraestrutura tem uma exigência

A §2 de [`2026-09-05-infraestrutura.md`](2026-09-05-infraestrutura.md) diz, com todas as letras:
**produção do Pipe não divide máquina com experimento.**

Você tem duas VPS em uso hoje — Hostinger `76.13.170.84` e OVH `149.56.12.166`, ambas com
`/opt/stack`, Traefik próprio e Postgres/Redis compartilhados com Twenty, Chatwoot e n8n.
**Nenhuma das duas serve**, e não é preciosismo:

1. As duas já têm um Traefik ocupando as portas 80 e 443. Dois Traefik na mesma máquina não
   convivem, e o `implantar.sh` para no passo 5 justamente por isso.
2. O compose do Pipe sobe um Postgres próprio, com `shared_buffers=2GB` e teto de 6 GB. Somado ao
   Postgres que já está lá, a máquina fica sem memória — e quem morre primeiro é o banco de quem
   estava sem culpa.
3. Dado de cliente pagante no mesmo disco de um n8n de experimento é o tipo de economia que custa
   caro uma vez só.

**Contrate uma máquina nova, exclusiva.** O que o compose pede: **4 vCPU, 16 GB de RAM, 100 GB de
disco**, Ubuntu 24.04. É o `hostingercom-vps-kvm4` que o `infra/terraform/ambientes/producao`
já referencia — e como você já tem conta e token de API na Hostinger, é o caminho de menor
atrito. Não é obrigatório: qualquer provedor com Ubuntu 24.04 e IP fixo serve, porque tudo é
Docker.

Se quiser cortar custo no começo: a pilha de observabilidade (Prometheus, Alertmanager,
node-exporter, postgres-exporter) come cerca de 1,3 GB. Dá para começar em 8 GB **sem ela** — mas
aí você não tem alerta, e a §8 da spec chama isso de mínimo honesto. Prefira a máquina maior.

**Terraform é opcional neste primeiro momento.** `infra/terraform/` exige um bucket S3 para o
estado, token da Hostinger, token da Cloudflare e valores de datacenter que ainda são inventados
(pendência 4 do `infra/README.md`). Nada disso aproxima você de uma mensagem de WhatsApp
respondida. Contrate a máquina pelo painel, siga este roteiro, e traga o Terraform quando for
criar a **segunda** máquina — que é quando ele começa a pagar.

### 1.3 O aplicativo do Google — [DONO]

Sem isto ninguém entra, nem você. `GET /v1/auth/google` devolve `?erro=falha_no_provedor` e a tela
de login não diz muito mais que isso.

1. [console.cloud.google.com](https://console.cloud.google.com) → crie um projeto (`pipe`).
2. **APIs e Serviços → Tela de consentimento OAuth** → tipo **Externo** → preencha nome do app,
   e-mail de suporte e e-mail do desenvolvedor. Enquanto estiver em *Testing*, só e-mails
   listados em "Usuários de teste" entram — **acrescente o seu**. Publicar vem depois.
3. **APIs e Serviços → Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web.**
4. Em **URIs de redirecionamento autorizados**, cole exatamente:

   ```
   https://api.usepipe.com.br/v1/auth/google/retorno
   ```

   Exatamente. O código não monta essa URL: ele manda para o Google o literal de
   `GOOGLE_URL_RETORNO`, e o Google compara caractere a caractere. Barra final sobrando, `http`
   em vez de `https`, `www` a mais — qualquer diferença dá `redirect_uri_mismatch`.
5. Guarde o **ID do cliente** e a **chave secreta**. Vão para `GOOGLE_CLIENTE_ID` e
   `GOOGLE_CLIENTE_SEGREDO`.

### 1.4 O aplicativo da Meta — [DONO], e é o de prazo mais longo

Comece por aqui se o número de WhatsApp for novo: aprovação de número e verificação de negócio
levam dias, não minutos.

1. [developers.facebook.com](https://developers.facebook.com) → **Meus apps → Criar app** → tipo
   **Empresa**.
2. Adicione o produto **WhatsApp**.
3. **Configurações → Básico → Chave secreta do app**: é o `WHATSAPP_APP_SECRET`. É com ele que o
   HMAC de `X-Hub-Signature-256` é conferido — sem ele, o webhook recusa tudo, de propósito.
4. **Usuário de sistema** no Business Manager, com as permissões
   `whatsapp_business_messaging` e `whatsapp_business_management`, e gere um token **sem
   expiração**. Token de usuário comum expira em 24h e não serve para produção.
5. O **número** entra depois, no passo 6 deste documento — porque a URL do webhook precisa do
   `canalId`, que só existe depois do tenant provisionado.

**De quem é a conta:** o WABA é do cliente (§5 da spec de infraestrutura). Para o seu próprio
teste, o cliente é você — use seu Business Manager. Quando o primeiro cliente de verdade chegar,
a ligação é feita dentro do BM dele, pelo cadastro embutido, e nada disto é copiado e colado.

### 1.5 As chaves — [DONO]

Duas coisas diferentes, e confundi-las é caro.

**a) O chaveiro que cifra `canal.config`** (`PIPE_CHAVES_SEGREDO`). Na sua máquina:

```bash
node -e "console.log('k1:'+require('crypto').randomBytes(32).toString('base64'))"
```

Formato `<id>:<32 bytes em base64>`. Rotacionar depois é acrescentar `,k2:<nova>` e apontar
`PIPE_CHAVE_SEGREDO_ATUAL=k2` — a antiga fica na lista até tudo ter sido regravado.

**b) O par `age` que abre o arquivo SOPS.** Dois pares: o seu e o da máquina.

```bash
age-keygen -o operador.key      # fica na sua máquina E numa cópia offline
age-keygen -o deploy-prod.key   # a pública vai no .sops.yaml, a privada vai para a VPS
```

As duas linhas `age1…` públicas entram em `infra/.sops.yaml`, substituindo os valores de exemplo
(`age1operador000…`, `age1deployprod000…`), que são placeholders e **não abrem nada**. Só o
operador com cópia offline: perder o notebook não pode ser perder produção.

---

## 2. Preparar a máquina — [DONO] uma vez, depois [SISTEMA]

```bash
# na VPS, como root
apt-get update && apt-get install -y ca-certificates curl git age ufw unattended-upgrades
curl -fsSL https://get.docker.com | sh

# sops NÃO está no apt do Ubuntu. Binário único.
curl -fsSLo /usr/local/bin/sops \
  https://github.com/getsops/sops/releases/download/v3.9.4/sops-v3.9.4.linux.amd64
chmod +x /usr/local/bin/sops

ufw default deny incoming && ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp
ufw --force enable

mkdir -p /opt/pipe /opt/pipe-dados/acme
git clone <o repositório> /opt/pipe
```

Depois, a chave privada de deploy — **[DONO]**, e é a única coisa que nunca passa pelo git:

```bash
# da sua máquina
scp deploy-prod.key root@<ip>:/opt/pipe-dados/age.key
ssh root@<ip> chmod 600 /opt/pipe-dados/age.key
```

O `cloud-init.yaml` do módulo Terraform faz tudo isto sozinho, se um dia você usar o Terraform.
O `ufw` acima, vale dizer, **não fecha porta publicada por contêiner**: o Docker escreve no
netfilter antes das regras dele. Aqui não importa porque só o Traefik publica porta — mas lembre
disso antes de acrescentar um `ports:` no compose achando que o firewall protege.

---

## 3. Os segredos, um por um — [DONO]

O modelo completo, com comentário em cada linha, está em
[`infra/compose/env.prod.exemplo`](../../infra/compose/env.prod.exemplo). O que segue é o
**porquê**: o que cada segredo é, onde nasce, e o que acontece quando falta.

| Variável | O que é | Onde nasce | Sem ela |
|---|---|---|---|
| `PIPE_CHAVES_SEGREDO` | chaveiro AES-256 que cifra `canal.config` — token da Meta, appSecret, senha de SMTP | `node -e "…randomBytes(32)…"` (§1.5a) | **a API SOBE, `/saude` dá 200, e todo webhook do WhatsApp devolve 500.** A chave só é lida na hora de decifrar o canal. É a falha mais cara de diagnosticar da tabela, e por isso o `implantar.sh` recusa subir sem ela |
| `PIPE_CHAVE_SEGREDO_ATUAL` | qual chave do chaveiro cifra o que for gravado agora | você escolhe (`k1`) | default é a primeira da lista; erra só se apontar para id inexistente |
| `POSTGRES_SENHA` | senha do papel `pipe`, dono das tabelas | invente: `openssl rand -base64 24` | banco não sobe |
| `POSTGRES_APP_SENHA` | senha do papel `pipe_app`, o da aplicação | idem, **diferente da anterior** | o papel não é criado e a API não conecta |
| `DATABASE_URL` / `DATABASE_URL_APP` | as duas acima, em URL | você escreve | a senha na URL tem que bater com a variável; o `implantar.sh` confere |
| `GOOGLE_CLIENTE_ID` / `_SEGREDO` / `GOOGLE_URL_RETORNO` | aplicativo OAuth | Google Cloud Console (§1.3) | login redireciona para `?erro=falha_no_provedor` |
| `PIPE_ORIGENS` | lista fechada de origens de navegador | as três URLs das telas | CORS recusa tudo e as telas ficam em branco |
| `PIPE_COOKIE_DOMINIO` | `.usepipe.com.br`, **com ponto** | você escreve | login redireciona certo e volta deslogado |
| `PIPE_URL_APP` / `_ENTRADA` / `_API` | bases públicas | você escreve | o retorno do Google cai em `localhost` |
| `ANTHROPIC_API_KEY` | modelo de IA (resumo, classificação, avaliação) | console.anthropic.com | monitoria e resumo não rodam; o resto funciona |
| `WHATSAPP_APP_SECRET` | HMAC de `X-Hub-Signature-256` | Meta → app → Básico (§1.4) | rota guarda-chuva devolve 403; template rejeitado nunca chega |
| `WHATSAPP_VERIFY_TOKEN` | string que você inventa e repete na Meta | você inventa | a Meta não consegue inscrever o webhook |
| `BACKUP_S3_KEY` / `_SEGREDO` | bucket do pgBackRest | Backblaze B2, Cloudflare R2 ou equivalente | backup não roda e o WAL não arquiva |
| `PGBACKREST_REPO1_CIPHER_PASS` | cifra do repositório de backup | `openssl rand -base64 32` | **todo comando do pgBackRest para.** E perdê-la depois é perder todos os backups: guarde cópia offline |
| `HEALTHCHECK_URL_BACKUP` / `_RESTAURACAO` | interruptor de homem morto | healthchecks.io (grátis) | se a VPS inteira morrer, o Prometheus morre junto e ninguém avisa |
| `ACME_EMAIL` | contato do Let's Encrypt | seu e-mail | ACME recusa emitir |
| `GRAFANA_SENHA` | painel opcional | invente | só afeta o perfil `painel` |
| `PIPE_METRICS_TOKEN` | protege `/metrics` | vazio nesta topologia | ver a nota abaixo |

**Sobre `PIPE_METRICS_TOKEN`:** ele pode ficar vazio aqui, e a razão é uma correção feita hoje. O
roteador do Traefik para a API era `Host(api.usepipe.com.br)` puro, o que publicava
`https://api.usepipe.com.br/metrics` para a internet inteira — e o porteiro da própria rota libera
faixa privada quando não há token, sendo que atrás do Traefik o IP visto **é** privado. A defesa da
aplicação não valia. O roteador agora é `Host(…) && !PathPrefix('/metrics')`, e o Prometheus
continua coletando por dentro, em `api:3100`. Só preencha o token quando alguém de fora for
coletar — e aí acrescente `authorization` no `scrape_config`.

Com o arquivo preenchido, cifre e commite:

```bash
cd infra
cp compose/env.prod.exemplo /tmp/producao.env   # preencha
sops --encrypt /tmp/producao.env > compose/segredos/producao.enc.env
shred -u /tmp/producao.env
git add compose/segredos/producao.enc.env && git commit -m "segredo de produção"
```

**Não existe mais `producao-crm.enc.env`.** O `apps/crm` de hoje é código nosso, no mesmo
monorepo, lendo o mesmo banco — um segundo arquivo cifrado era só mais uma coisa para esquecer de
criar antes do primeiro `up`. Quando o fork AGPLv3 do Twenty entrar, ele ganha o arquivo próprio,
e aí a separação existe por licença, não por hábito.

---

## 4. DNS — [DONO]

Seis registros A, todos para o IP da VPS:

```
@        A   <ip>
www      A   <ip>
app      A   <ip>
gestao   A   <ip>
crm      A   <ip>
api      A   <ip>
```

TTL de 300 enquanto estiver mexendo. **Onde criar:** o Registro.br tem editor de DNS próprio e
resolve — é o caminho mais curto. Se preferir Cloudflare (o `infra/terraform/modules/dns` assume
Cloudflare), troque os nameservers no Registro.br para os que a Cloudflare entregar e espere a
propagação. Nesse caso, **deixe as entradas em modo DNS-only, nuvem cinza**: com o proxy laranja
ligado, o desafio HTTP do Let's Encrypt não chega ao Traefik e o certificado não emite.

Confira antes de continuar:

```bash
for h in usepipe.com.br app.usepipe.com.br gestao.usepipe.com.br crm.usepipe.com.br api.usepipe.com.br; do
  printf '%-28s %s\n' "$h" "$(dig +short "$h" | tail -1)"
done
```

O `implantar.sh` confere isto sozinho e **para** se não bater — mas conferir antes economiza uma
rodada.

---

## 5. Subir — [SISTEMA]

Construa e publique as imagens, da sua máquina:

```bash
PUBLICAR=1 ./infra/construir-imagens.sh v1.0.0
```

Depois, na VPS:

```bash
cd /opt/pipe && git pull
./infra/compose/implantar.sh v1.0.0
```

O script faz nove passos e para com mensagem no primeiro que não puder resolver:

1. ferramentas (`docker`, `sops`, `age`) e permissão de root;
2. decifra o SOPS para `/opt/pipe-dados/.env`, modo 600;
3. **confere o `.env`** — variável faltando, chaveiro fora do formato, chave sem 32 bytes,
   `PIPE_COOKIE_DOMINIO` sem o ponto, curinga em `PIPE_ORIGENS`, senha de `pipe_app` divergindo
   entre `POSTGRES_APP_SENHA` e `DATABASE_URL_APP`;
4. confere que os cinco nomes resolvem para o IP desta máquina;
5. confere que as portas 80 e 443 estão livres;
6. constrói a imagem do Postgres, baixa as demais;
7. **sobe só o Postgres e o Redis** e confirma que o papel `pipe_app` existe;
8. roda a migration;
9. sobe o resto com `--wait`, esperando healthcheck verde.

**Por que o passo 7 é separado do 9, e não é preciosismo:** os `grant` para `pipe_app` nas
migrations de `packages/db/drizzle` vêm todos embrulhados em
`IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='pipe_app')`. Se o papel nascer depois da
migration, cada grant é **pulado em silêncio**, a migration consta como aplicada, ninguém roda de
novo — e a API conecta sem enxergar tabela nenhuma. O papel nasce em
`infra/compose/postgres/init/10-papel-app.sh`, que o entrypoint do Postgres roda uma vez, com o
volume ainda vazio, antes de qualquer outra coisa.

---

## 6. Ligar o WhatsApp — [DONO] e [SISTEMA] alternando

### 6.1 O tenant — [SISTEMA]

```bash
cd /opt/pipe/infra/compose
docker compose -f docker-compose.prod.yml --env-file /opt/pipe-dados/.env \
  --profile tarefa run --rm provisionar \
  --nome "Sua Empresa" --slug sua-empresa --plano operacao \
  --admin voce@seudominio.com.br
```

Cria o tenant, o catálogo de permissões, os cinco papéis, as filas de exemplo, os motivos de pausa
e o **primeiro administrador** — sem senha, ligado ao Google na primeira entrada. Imprime, no fim,
o registro TXT de verificação do domínio.

> Provisionar é **comando, não rota**, e de propósito: exposto por HTTP, viraria uma chave mestra
> na internet. A credencial aqui é a que já existe e já é protegida — o acesso ao banco.

### 6.2 Verificar o domínio — [DONO]

Publique o TXT que o comando imprimiu, no DNS do domínio do **e-mail do administrador** (não é
`usepipe.com.br`, é o domínio da empresa dele). Depois:

```bash
docker compose … run --rm provisionar --nome "Sua Empresa" --slug sua-empresa \
  --plano operacao --admin voce@seudominio.com.br --reaplicar --verificar
```

Enquanto o domínio não estiver verificado **ninguém entra por domínio** — a porta é convite
(`POST /v1/convites`).

### 6.3 Entrar — [DONO]

Abra `https://app.usepipe.com.br/entrar` e entre com o Google do administrador. Se a tela de
consentimento do Google ainda estiver em *Testing*, o e-mail precisa estar na lista de usuários de
teste (§1.3).

**Este é o primeiro marco: você está dentro.**

### 6.4 Criar o canal — [DONO], pela tela de Canais

O canal precisa existir no banco para que o `canalId` exista, e é ele que compõe a URL do webhook.

### 6.5 Cadastrar o webhook na Meta — [DONO]

No App Dashboard → WhatsApp → Configuração:

- **URL de callback:** `https://api.usepipe.com.br/webhooks/whatsapp/<canalId>`
- **Token de verificação:** o `verifyToken` do canal (ou `WHATSAPP_VERIFY_TOKEN`, se estiver
  usando o fallback de um número só)
- **Campos assinados:** `messages`

A Meta chama `GET` com `hub.challenge` na hora de salvar. Se ela reclamar, a resposta veio de nós:
403 `verificacao_recusada` significa token diferente; 404 significa `canalId` errado na URL.

Vale saber, e está detalhado em
[`2026-09-07-webhook-por-cliente.md`](2026-09-07-webhook-por-cliente.md): **são duas URLs.** Essa,
por canal, leva mensagem e status — 99% do volume. A outra,
`https://api.usepipe.com.br/webhooks/whatsapp` sem id, recebe evento de template e de qualidade de
todos os clientes, porque a Meta não aceita override nesses campos. Cadastre as duas.

### 6.6 A mensagem — [DONO]

Mande um WhatsApp do seu celular para o número conectado. Ela precisa aparecer no Desk. Responda
pelo Desk. A resposta precisa chegar no celular.

**Este é o segundo marco, e é o que o roteiro inteiro existe para alcançar.**

### 6.7 Backup — [SISTEMA], e não pule

O arquivamento de WAL nasce **desligado** (`PG_ARCHIVE_MODE=off`), e isso é deliberado: ligado
antes de a stanza existir, o `archive_command` falha a cada segmento, o Postgres nunca recicla o
WAL e a VPS fica sem disco em dias.

```bash
docker compose … --profile tarefa run --rm backup -c 'pgbackrest --stanza=pipe stanza-create'
```

Depois troque `PG_ARCHIVE_MODE` para `on` no segredo SOPS, rode `./deploy.sh v1.0.0`, e confirme:

```bash
docker compose … --profile tarefa run --rm backup -c 'pgbackrest --stanza=pipe check'
```

---

## 7. Verificação pós-implantação

Sequência que prova que está no ar. Da **sua máquina**, não da VPS — o ponto é atravessar a
internet, o DNS e o Traefik, que é o caminho que a Meta e o cliente fazem.

```bash
# 1. TLS e saúde, de fora. Espera-se 200 e `"ok":true`.
curl -sS https://api.usepipe.com.br/saude | tee /dev/stderr | grep -q '"ok":true' \
  && echo "  ✓ API no ar" || echo "  ✗ API"

# 2. Certificado de verdade, e quanto falta para vencer.
echo | openssl s_client -servername api.usepipe.com.br -connect api.usepipe.com.br:443 2>/dev/null \
  | openssl x509 -noout -issuer -dates

# 3. As quatro telas respondem (200 ou 3xx; 502 é Traefik sem alvo).
for h in usepipe.com.br app.usepipe.com.br gestao.usepipe.com.br crm.usepipe.com.br; do
  printf '%-28s %s\n' "$h" "$(curl -sS -o /dev/null -w '%{http_code}' "https://$h/")"
done

# 4. /metrics NÃO pode responder de fora. Espera-se 404.
curl -sS -o /dev/null -w '/metrics de fora: %{http_code} (tem que ser 404)\n' \
  https://api.usepipe.com.br/metrics

# 5. O webhook é alcançável e recusa quem não é a Meta. Espera-se 403.
curl -sS -o /dev/null -w 'webhook sem assinatura: %{http_code} (tem que ser 401 ou 403)\n' \
  -X POST -H 'content-type: application/json' -d '{}' \
  https://api.usepipe.com.br/webhooks/whatsapp
```

E na VPS, o que só se vê por dentro:

```bash
cd /opt/pipe/infra/compose
C="docker compose -f docker-compose.prod.yml --env-file /opt/pipe-dados/.env"

# 6. Nenhum contêiner fora de `running`/`healthy`.
$C ps

# 7. Migration aplicada: 12 linhas hoje, e zero pendente na métrica.
$C exec -T postgres psql -U pipe -d pipe -tAc \
  'select count(*) from drizzle.__drizzle_migrations'
$C exec -T api node -e \
  "require('http').get('http://127.0.0.1:3100/metrics',r=>r.pipe(process.stdout))" \
  | grep pipe_migration_pendente

# 8. O papel da aplicação existe, não é dono de nada e não tem bypassrls.
$C exec -T postgres psql -U pipe -d pipe -tAc \
  "select rolname, rolbypassrls from pg_roles where rolname='pipe_app'"
$C exec -T postgres psql -U pipe -d pipe -tAc \
  "select count(*) from pg_class c join pg_roles r on r.oid=c.relowner
   where r.rolname='pipe_app'"      # tem que ser 0

# 9. Tenant provisionado, com administrador.
$C exec -T postgres psql -U pipe -d pipe -tAc \
  "select t.slug, t.plano, count(u.id) from tenant t
   left join usuario u on u.tenant_id = t.id group by 1,2"

# 10. O Prometheus enxerga a API.
$C exec -T prometheus wget -qO- 'http://localhost:9090/api/v1/targets?state=active' \
  | grep -o '"health":"[a-z]*"'
```

O item 8 merece atenção: `rolbypassrls` tem que sair `f` e a contagem de tabelas tem que sair `0`.
Se `pipe_app` for dono de alguma coisa, a RLS existe no papel e não protege ninguém — e a suíte
`packages/db/tests/rls.test.ts` passaria sem provar nada.

---

## 8. Quando der errado

### 8.1 O certificado não emite

Sintoma: `curl` reclama de certificado autoassinado (`TRAEFIK DEFAULT CERT`), ou o navegador
mostra aviso de segurança.

```bash
docker compose … logs traefik | grep -i acme
```

As quatro causas, em ordem de frequência:

1. **O DNS não aponta para a máquina.** O desafio HTTP-01 exige que o Let's Encrypt alcance
   `http://<host>/.well-known/acme-challenge/…` **nesta** máquina. Confira com `dig +short`. Se você
   pôs o DNS na Cloudflare com proxy laranja ligado, desligue — nuvem cinza.
2. **Porta 80 fechada ou ocupada.** O redirecionamento para HTTPS não dispensa a 80: é por ela que
   o desafio chega. `ufw allow 80/tcp`, e `ss -ltnp sport = :80` para ver quem está lá.
3. **`acme.json` sem modo 600.** O Traefik recusa o arquivo e não diz muito.
   `chmod 600 /opt/pipe-dados/acme/acme.json`.
4. **Limite do Let's Encrypt.** São 5 falhas por hora e 50 certificados por domínio por semana.
   Se você bateu, o log diz `too many failed authorizations`. **Não fique tentando** — cada
   tentativa afunda mais. Use o ambiente de teste enquanto conserta, acrescentando ao `command:`
   do Traefik:
   `--certificatesresolvers.le.acme.caserver=https://acme-staging-v02.api.letsencrypt.org/directory`
   e apagando o `acme.json` **antes de voltar para produção**, senão ele guarda o certificado de
   teste, que nenhum navegador aceita.

### 8.2 A migration falha no meio

Sintoma: o `implantar.sh` para no passo 8, ou o `deploy.sh` para antes do `up`.

**Primeiro, o alívio:** nada foi publicado. É exatamente por isso que a migration roda antes do
código novo (§9 da spec) — a versão antiga continua no ar, atendendo, com o esquema antigo.

O drizzle aplica **uma migration por transação**. As anteriores à que falhou estão aplicadas e
valem; a que falhou não deixou meia tabela. Descubra onde parou:

```bash
$C exec -T postgres psql -U pipe -d pipe -c \
  'select id, hash, created_at from drizzle.__drizzle_migrations order by created_at'
```

Compare com `packages/db/drizzle/meta/_journal.json`: a primeira do journal que não está na tabela
é a que quebrou. **O conserto é no `.sql`, no repositório, seguido de imagem nova.** Editar o banco
à mão para "destravar" cria uma máquina cujo esquema não corresponde a nenhuma versão do código, e
a próxima migration falha por um motivo que ninguém consegue reconstruir.

Duas armadilhas específicas daqui:

- **Grants pulados.** Se `pipe_app` não existia quando a migration rodou, ela **passou** e os
  grants foram ignorados em silêncio. O sintoma não é erro de migration: é a API conectando e não
  enxergando tabela. Confira com o item 8 da §7; se o papel nasceu tarde, o conserto é criar o
  papel e reaplicar os grants à mão a partir dos blocos `DO $$` de `0001_rls.sql`.
- **Partição do mês.** `garantirParticoes` cria o mês corrente e três à frente. Se a migration
  parar depois das migrations e antes das partições, rode de novo: é idempotente.

### 8.3 A Meta não alcança o webhook

Sintoma: a Meta recusa salvar a URL, ou salva e a mensagem nunca chega ao Desk.

Faça o teste na ordem, porque cada resposta elimina uma camada:

```bash
# a) Chega ao Traefik? Nome errado ou DNS: 404 do Traefik, sem corpo JSON nosso.
curl -sS -i https://api.usepipe.com.br/webhooks/whatsapp/00000000-0000-0000-0000-000000000000 | head -5
#    Esperado: 404 com corpo {"erro":{"codigo":"nao_encontrado"…}} — isso já prova
#    que a requisição atravessou DNS, TLS e Traefik e chegou na API.

# b) O desafio de verificação, com o token certo:
curl -sS "https://api.usepipe.com.br/webhooks/whatsapp/<canalId>?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=abc"
#    Esperado: `abc` em texto puro. 403 = token diferente do gravado no canal.

# c) O que a API viu:
$C logs --tail=100 api | grep -i webhook
```

As causas, em ordem:

1. **`canalId` errado na URL.** Devolve 404. O id é UUID, sai da tela de Canais, e **não é
   segredo** — quem protege é a assinatura.
2. **`verifyToken` diferente.** Devolve 403 `verificacao_recusada`. O valor conferido é o do
   `canal.config`, e só cai para `WHATSAPP_VERIFY_TOKEN` se o canal não tiver um.
3. **`appSecret` ausente.** Devolve 403 `canal_sem_app_secret`. Recusa fechada de propósito: sem
   segredo não há como distinguir a Meta de qualquer um.
4. **Assinatura não bate.** Devolve 401 `assinatura_invalida`. O HMAC é sobre o **corpo cru**, e a
   API sobe com `bodyParser: false` só para preservá-lo. Se aparecer, o `appSecret` gravado no
   canal é de outro aplicativo da Meta.
5. **`PIPE_CHAVES_SEGREDO` faltando ou trocada.** Devolve **500 `erro_interno`**, e é a única
   causa desta lista que não diz o que é. Acontece porque o chaveiro é lido preguiçosamente, na
   hora de decifrar o canal — a API sobe, `/saude` dá 200, e só o webhook morre. Se você trocou a
   chave depois de gravar o canal, o material antigo não decifra mais: o id da chave viaja dentro
   do valor cifrado, então **mantenha a chave antiga na lista**.
6. **A Meta não alcança nada.** Se (a) falhou, o problema é anterior: DNS, porta 443, ou
   certificado. A Meta **exige HTTPS com certificado válido** — autoassinado ela recusa em
   silêncio, sem log do nosso lado.

---

## 9. O que este roteiro deixa por resolver

Honestidade sobre o que você vai encontrar depois do segundo marco:

1. ~~**Os links entre as telas apontam para `localhost`.**~~ **Resolvido em 07/09/2026.**
   `NEXT_PUBLIC_PIPE_GESTAO_URL`, `NEXT_PUBLIC_PIPE_CRM_URL` e `NEXT_PUBLIC_PIPE_DESK_URL` são
   embutidas no bundle **em tempo de build**, e por isso não adianta pô-las no `.env` de runtime.
   Os Dockerfiles do Desk e da Gestão agora aceitam `ARG`, e `construir-imagens.sh` passa os
   `--build-arg` com o domínio de produção por padrão (`PIPE_DOMINIO` muda os três de uma vez).
2. **`apps/workers` não expõe métrica.** Não há `/metrics` nem porta HTTP. O alvo `pipe-workers` e
   o alerta `WorkerParado` foram **removidos** de `infra/observabilidade/`: eles ficariam em
   disparo permanente, tocando o telefone toda madrugada sem nada a fazer, que é o mecanismo pelo
   qual todo o resto do arquivo de alertas passa a ser ignorado. `FilaParada` cobre o sintoma real,
   com métrica que existe (a API a emite).
3. **O storage de objetos não está ligado.** `PIPE_STORAGE_URL_BASE` aponta para um host que ainda
   não existe. Mídia recebida é registrada; o arquivo não tem onde morar. Texto funciona, e é o
   suficiente para o teste de ponta a ponta.
4. **Homologação não existe.** Este roteiro sobe produção direto. É aceitável para o primeiro
   cliente, que é você; deixa de ser no dia em que houver um segundo.
5. **`packages/db` declara o script `particoes` apontando para `src/scripts/criar-particoes.ts`,
   que não existe.** Não afeta a implantação — `migrar.js` já garante as partições —, mas é um
   comando quebrado no `package.json`.
