# O webhook do WhatsApp, com um cliente por número

Vinculante. Nasce da pergunta "como fica a URL do webhook de cada cliente", e a resposta
contraria o desenho que estava implícito: **não é uma URL, são duas**, e uma delas não pode ser
por cliente por decisão da Meta, não nossa.

Fontes: [visão geral dos webhooks](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview)
e [override de callback](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/override/),
consultadas em 07/09/2026.

## 1. Como a Meta decide para onde manda

O webhook nasce no **aplicativo**, não no número. Todo WABA que assina o nosso app entrega na URL
do app. Sobre isso existem dois níveis de sobrescrita, e a precedência é de baixo para cima:

```
número de telefone  →  se tiver override, vai para lá
       ↓ senão
WABA                →  se tiver override, vai para lá
       ↓ senão
aplicativo          →  a URL padrão, nossa
```

O override se configura por API, com dois campos:

| Alvo | Chamada | Campos |
|---|---|---|
| WABA | `POST /<WABA_ID>/subscribed_apps` | `override_callback_uri`, `verify_token` |
| Número | `POST /<PHONE_NUMBER_ID>` | `override_callback_uri`, `verify_token` |

A URL tem **limite de 200 caracteres**. Apagar o override é assinar sem parâmetros (WABA) ou enviar
`override_callback_uri` vazio (número).

## 2. O que NÃO aceita override, e é isso que muda o desenho

Só alguns campos aceitam sobrescrita — `messages` entre eles. Mas:

> "Template webhooks e account-level webhooks não suportam callback overrides."

Ou seja: **aprovação e rejeição de template, qualidade do número, mudança de limite de mensagens e
alerta de banimento vão SEMPRE para a URL do aplicativo**, misturando todos os clientes num
endereço só. Não há como dar uma URL própria para esses.

Isso derruba a suposição de que bastava uma URL por canal.

## 3. A decisão: duas rotas, com dois modos de resolver o tenant

### Rota A — por canal, para o que aceita override

```
POST /webhooks/whatsapp/:canalId
```

É a que já existe. O tenant vem do **caminho**, nunca do conteúdo, e a assinatura é conferida com o
segredo daquele canal. É o caminho de mensagem e status, que é 99% do volume.

Configurada por API no fim do cadastro do cliente, com override no **número** (não no WABA): o
cliente que tiver dois números no mesmo WABA vira dois canais, e cada um com a sua URL.

O `canalId` é UUID e aparece na URL que vai para a Meta. **Ele não é segredo, e não deve ser
tratado como um**: quem protege é a assinatura `X-Hub-Signature-256` sobre o corpo cru. URL
adivinhada sem assinatura válida é 401.

### Rota B — guarda-chuva, para o que não aceita override

```
POST /webhooks/whatsapp
```

Recebe template, qualidade e conta, de todos os clientes. Aqui o tenant **não pode** vir do
caminho, então vem do payload — e é por isso que esta rota precisa de cuidado que a outra não
precisa:

1. A assinatura é conferida com o **`appSecret` do nosso aplicativo**, que é um só. Isso prova que
   veio da Meta, e não de quem é o dono do evento.
2. O tenant sai de `entry[].id`, que é o **WABA ID**, ou de `metadata.phone_number_id`. Os dois
   precisam estar em COLUNA com índice único, não enterrados no `config` jsonb: resolução por
   payload é consulta, e consulta em jsonb sem índice é varredura.
3. **Payload que não casa com canal nenhum é descartado com log, nunca processado.** Um evento sem
   dono é evento de outro app ou de canal removido — processar "no melhor palpite" é como se cria
   vazamento entre clientes.

## 4. O que isso exige do modelo

`canal` ganha duas colunas, hoje inexistentes:

- `waba_id` — o WhatsApp Business Account do cliente
- `numero_id` — o `phone_number_id`, que é o que a Meta manda no payload

Ambas com índice único parcial (só valem para `tipo = 'whatsapp_cloud'`), porque são a chave de
roteamento da rota B. Dois canais com o mesmo `numero_id` é estado impossível: significaria dois
clientes disputando o mesmo número, e o banco deve recusar antes de a aplicação decidir errado.

## 5. Sobre o `appSecret` por canal

Hoje cada canal guarda o seu `appSecret`. Com o cadastro embutido da Meta o aplicativo é **nosso**,
então o valor será o mesmo em todos os canais — redundante, mas não errado, e é o que permite
atender o cliente que chegar com aplicativo próprio (empresa grande com o time de tecnologia dela
já integrado). Fica como está.

O `verify_token`, ao contrário, é **legitimamente por canal**: cada override carrega o seu, e é
assim que a Meta valida cada endpoint separadamente.

## 6. O que o cliente vê

Nada disso. O cadastro embutido da Meta roda dentro do Business Manager do cliente, e ao fim dele o
Pipe:

1. troca o código pelo token do cliente;
2. registra `waba_id` e `numero_id` no canal;
3. gera o `verify_token` do canal;
4. chama a API da Meta configurando o override do número para `…/webhooks/whatsapp/<canalId>`;
5. assina os campos que interessam.

Nenhuma URL é copiada e colada por ninguém. A tela de Canais mostra o estado da ligação — conectado,
número, qualidade — e não os campos de configuração, que são coisa nossa.

## 7. O que ainda não está resolvido

- A rota B não existe no código. Enquanto não existir, **não sabemos quando um template é rejeitado**
  nem quando a qualidade do número cai — e os dois viram surpresa no dia do disparo.
- O limite de 200 caracteres na URL de override cabe folgado hoje
  (`https://api.usepipe.com.br/webhooks/whatsapp/<uuid>` tem 62), mas fecha a porta para caminho longo
  com subdomínio de cliente.
- Rotação: se um `canalId` precisar mudar, o override precisa ser reconfigurado na Meta. Vale
  considerar um `webhook_slug` separado do id, rotacionável sem trocar o canal.
