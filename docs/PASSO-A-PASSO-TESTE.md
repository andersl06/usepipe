# Passo a passo: criar uma empresa e conectar um número

Para fazer com as próprias mãos, do zero até ver um atendimento nascer na tela.

São duas partes. A **primeira** vai até ver a conversa aparecer, e não depende da
Meta — dá para fazer agora. A **segunda** conecta um número de verdade, e depende de
uma conta de desenvolvedor na Meta, que é grátis mas leva alguns minutos.

---

## Parte 1 — a empresa, sem depender de ninguém

### 1. Banco de pé

```bash
cd ~/pipe
docker compose up -d postgres redis
```

### 2. Criar a empresa

```bash
pnpm --filter @pipe/api provisionar \
  --nome "Minha Empresa" \
  --slug minha-empresa \
  --admin voce@suaempresa.com.br
```

Guarde as duas linhas que ele imprime: o **id do tenant** e o **id do administrador**.
Já vêm junto 5 papéis, 46 permissões, 4 filas e 5 motivos de pausa.

> O comando não pergunta o nome da pessoa, então o administrador nasce com o nome
> derivado do e-mail, e **fora de todas as filas**. Corrija antes de testar
> distribuição — a consulta está no passo 4.

### 3. Subir a API

Ela precisa da chave que cifra o que é secreto no canal (token da Meta, PIN). Sem
ela o webhook responde 500 com `PIPE_CHAVES_SEGREDO não está definida` — foi o
primeiro tropeço quando rodei este roteiro.

```bash
# gere uma vez e guarde; em produção vem pelo cofre, nunca em arquivo versionado
CHAVE="k1:$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))")"

PIPE_CHAVES_SEGREDO="$CHAVE" PIPE_CHAVE_SEGREDO_ATUAL=k1 WHATSAPP_APP_SECRET=segredo-de-teste PORT=3010 pnpm --filter @pipe/api dev
```

A porta 3000 costuma estar ocupada por outro projeto; por isso 3010.

### 4. Colocar o administrador numa fila

Atendente fora de fila não recebe conversa. Rode uma vez, trocando o e-mail:

```bash
docker exec pipe-postgres psql -U pipe -d pipe -c "
  insert into fila_atendente (tenant_id, fila_id, usuario_id)
  select u.tenant_id, f.id, u.id
    from usuario u
    join fila f on f.tenant_id = u.tenant_id and f.nome = 'Suporte'
   where u.email = 'voce@suaempresa.com.br'
  on conflict do nothing;"
```

### 5. Criar um canal de teste

O canal é o que dá endereço ao webhook. Sem Meta ainda, crie um local:

```bash
docker exec pipe-postgres psql -U pipe -d pipe -c "
  with c as (
    insert into canal (tenant_id, tipo, nome, numero_id, waba_id, ativo)
    select id, 'whatsapp_cloud', 'Número de teste', 'teste-numero', 'teste-waba', true
      from tenant where slug = 'minha-empresa'
    returning id, tenant_id
  )
  insert into inbox (tenant_id, canal_id, nome, fila_padrao_id)
  select c.tenant_id, c.id, 'Entrada de teste',
         (select id from fila where tenant_id = c.tenant_id and nome = 'Suporte')
    from c returning canal_id;"
```

Guarde o `canal_id` que sai — e pegue **só a primeira linha**, senão o `INSERT 0 1`
vem grudado e a URL do webhook sai quebrada (o sintoma é `curl` devolvendo `000`):

```bash
CANAL=$(docker exec pipe-postgres psql -U pipe -d pipe -tAc   "select c.id from canal c join tenant t on t.id=c.tenant_id
    where t.slug='minha-empresa' order by c.criado_em desc limit 1" | head -1 | xargs)
echo "$CANAL"
```

### 6. Subir a ponte e a tela

```bash
# na pasta do pipe
PIPE_PONTE_TENANT_ID=<id do tenant> PIPE_PONTE_EMAIL=voce@suaempresa.com.br pnpm ponte

# noutro terminal
cd ~/desk-clone && node servidor.js
```

Abra `http://127.0.0.1:8787/?ponte=1`. A lista vem vazia — é uma empresa nova.

### 7. Fazer chegar uma mensagem

Isto imita exatamente o que a Meta manda. Troque o `CANAL` e o telefone:

```bash
cd ~/pipe
CANAL=<canal_id do passo 5>
SEGREDO=${WHATSAPP_APP_SECRET:-segredo-de-teste}
CORPO='{"object":"whatsapp_business_account","entry":[{"id":"teste-waba","changes":[{"field":"messages","value":{"messaging_product":"whatsapp","metadata":{"display_phone_number":"5531999990000","phone_number_id":"teste-numero"},"contacts":[{"profile":{"name":"Cliente de Teste"},"wa_id":"5531988887777"}],"messages":[{"from":"5531988887777","id":"wamid.teste-1","timestamp":"1789200000","type":"text","text":{"body":"Oi, preciso de ajuda"}}]}}]}]}'
ASSINATURA=$(node -e "const c=require('crypto');process.stdout.write('sha256='+c.createHmac('sha256',process.argv[1]).update(process.argv[2]).digest('hex'))" "$SEGREDO" "$CORPO")
curl -s -X POST "http://localhost:3010/webhooks/whatsapp/$CANAL" \
  -H 'content-type: application/json' -H "x-hub-signature-256: $ASSINATURA" \
  -d "$CORPO"
```

A API precisa estar rodando com o mesmo `WHATSAPP_APP_SECRET` usado na assinatura.

Rodei este roteiro inteiro antes de escrever: o webhook responde **200** e a conversa
nasce com o contato, o telefone, a fila Suporte e a mensagem gravada.

Recarregue a tela: o atendimento aparece na fila, com o nome e o telefone do
contato. Daí dá para abrir, responder, transferir e encerrar.

---

## Parte 2 — o seu número de verdade

A Meta dá, de graça, um **número de teste** que fala com até 5 telefones
verificados. É o caminho mais rápido para ver a coisa funcionando com o seu celular.

### 1. Criar o aplicativo na Meta

1. Entre em `developers.facebook.com` → **Meus aplicativos** → **Criar aplicativo**.
2. Tipo **Empresa**.
3. Dentro dele, adicione o produto **WhatsApp**.
4. Em **Configuração da API**, a Meta já mostra um número de teste e um **token
   temporário de 24 horas**.
5. No campo "Para", adicione **o seu celular** e confirme o código que chega por
   WhatsApp. Sem isso a Meta não entrega mensagem para você.

Anote três coisas: **Identificação do número de telefone**, **Identificação da conta
do WhatsApp Business** e o **token temporário**.

### 2. Deixar a API alcançável pela internet

A Meta precisa chegar no seu webhook, e `localhost` ela não alcança. Com o
Cloudflare, que não pede cadastro:

```bash
cloudflared tunnel --url http://localhost:3010
```

Ele imprime um endereço `https://...trycloudflare.com`. Suba a API com esse endereço
em `PIPE_URL_API` para o webhook ser registrado certo.

### 3. Conectar o número

Com a sessão aberta (o login de desenvolvimento serve), chame:

```bash
curl -s -X POST http://localhost:3010/v1/canais/whatsapp/manual \
  -H 'content-type: application/json' \
  -b "pipe_sessao=<o cookie da sua sessão>" \
  -d '{"waba_id":"<id da conta>","phone_number_id":"<id do número>","access_token":"<token temporário>","nome":"Número de teste"}'
```

O Pipe valida o número na Meta, cria o canal e **registra o webhook sozinho**. Se a
resposta trouxer `erroDeWebhook`, o túnel não está alcançável.

### 4. Mandar mensagem do seu celular

Mande qualquer coisa para o número de teste da Meta. O atendimento nasce na fila, e
você responde pela tela — a resposta chega no seu WhatsApp.

---

## O que esperar de atrito

- **O token dura 24 horas.** Para durar, é preciso usuário de sistema no Gerenciador
  de Negócios e verificação da empresa — trabalho de produção, não de teste.
- **O número de teste só fala com 5 telefones** e não recebe de desconhecidos.
- **Fora da janela de 24 horas**, a Meta só entrega template aprovado. No teste você
  sempre escreve primeiro, então a janela fica aberta.
- **O túnel muda de endereço** a cada vez que você o reinicia, e o webhook registrado
  na Meta aponta para o endereço antigo. Reconecte o canal depois de reiniciar.
