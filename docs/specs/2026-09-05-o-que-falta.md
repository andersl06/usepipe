# Pipe — o que ainda falta

Levantamento honesto em 05/09/2026, depois de fechar as specs, o modelo de dados, a fundação do
banco e as regras de negócio. Lista o que **não existe nem está planejado**, separado do que já
está desenhado e só não foi construído.

Ordenado por quanto dói descobrir tarde.

---

## Bloqueia a primeira venda

### 1. Cobrança
Não existe módulo de faturamento. Nada. Para um produto vendido por assinatura, isso é a maior
lacuna da lista: assinatura, plano, medição de consumo, emissão de fatura, cobrança recorrente,
tentativa de nova cobrança, inadimplência, suspensão e reativação. O `consumo_ia` mede tokens, mas
ninguém transforma isso em dinheiro.

Decisões embutidas: gateway (Stripe, Asaas, Pagar.me), emissão de nota fiscal de serviço com a
prefeitura, e o que acontece com os dados do cliente que parou de pagar.

### 2. Preço
Continua em aberto desde a primeira versão da spec. Por atendente, por conversa, por avaliação, ou
híbrido. Isso não é detalhe comercial: define o que o `consumo_ia` precisa medir e como a tela de
consumo é desenhada.

### 3. Entrada do cliente
Não há cadastro. Hoje um tenant nasce por semente no banco. Falta: criar conta, criar o tenant,
conectar o WhatsApp pelo fluxo da Meta, convidar a equipe, importar contatos e histórico, e chegar
na primeira conversa atendida. É a diferença entre vender e implantar na mão, um por um.

### 4. Domínio
`pipe.com.br` está registrado por terceiro, assim como `pipe.com`, `pipe.app`, `pipe.io` e
`pipe.app.br`. A landing page já aponta canonical para um domínio que não é nosso.
Disponíveis em 05/09: `usepipe.com.br`, `usepipe.app`, `pipeatendimento.com.br`,
`pipeatendimento.com`, `pipecrm.app`. Decisão pendente, e ela também afeta o nome do produto se a
escolha exigir mudar a marca.

### 5. Documentos legais
Termos de uso, política de privacidade e o contrato de tratamento de dados exigido pela LGPD, já
que no modelo SaaS você é operador. Sem isso não há venda para empresa que tem jurídico.

---

## Bloqueia a operação depois de vender

### 6. Suporte ao cliente
Não existe canal de suporte no produto, nem central de ajuda, nem base de conhecimento voltada ao
usuário final. O caminho natural é usar o próprio Pipe para atender o cliente do Pipe, o que tem a
vantagem de te obrigar a sentir o que ele sente.

### 7. Notificação fora do aplicativo
E-mail transacional (convite, recuperação de senha, alerta de SLA, relatório semanal), push do
navegador e resumo diário. A spec fala de notificação dentro do Desk, mas o gestor que fechou o
navegador não fica sabendo que a fila estourou.

### 8. Migração de entrada
A spec cobre importar CRM (Salesforce, HubSpot, RD, CSV). Não cobre importar **atendimento**:
trazer contatos, conversas e histórico de Blip, Digisac, Chatwoot ou Zenvia. É exatamente o que o
cliente vai pedir na primeira reunião, e é o que decide se ele troca ou adia.

### 9. Celular
O Desk é web responsivo, e app nativo está fora de escopo. Mas atendente usa celular, e supervisor
olha fila no ônibus. O mínimo honesto é aplicativo web instalável com notificação, e isso não está
planejado.

---

## Bloqueia crescer

### 10. Papéis customizados
Hoje são cinco papéis fixos. Empresa média vai pedir papel próprio, e supervisor que vê só a
própria equipe. Isso é o que o Chatwoot deixou na versão paga, e é pedido comum.

### 11. Testes de ponta a ponta e homologação
Existe teste de unidade em `packages/core` e de integração em `packages/db`. Não existe teste que
percorra o caminho do atendente na tela, nem ambiente de homologação. A spec de infraestrutura
prevê homologação; ninguém construiu.

### 12. Documentação
As specs são de produto, e servem a quem constrói. Falta documentação de desenvolvedor (como subir
o ambiente, como a API se comporta, registro das decisões de arquitetura) e documentação de usuário
(como usar o Desk, como montar formulário de avaliação, como ler cada métrica).

---

## Já desenhado, só não construído

Para não confundir buraco com fila de trabalho. Tudo abaixo tem spec e caminho claro:

Desk, Gestão, CRM e Monitoria como aplicações · canal WhatsApp oficial e canal Instagram ·
entrega de mensagem com outbox e retry · realtime por WebSocket · motor de workflow ·
construtor de fluxo · ações no chat · linguagem de consulta e dicionário de dados ·
servidor MCP · SSO em três degraus · resumo e avaliação por IA · base de conhecimento com citação

---

## As três decisões suas que travam trabalho

1. **Preço e unidade de cobrança.** Trava o módulo de faturamento e a tela de consumo.
2. **Domínio e, se for o caso, o nome.** Trava a publicação do site e a identidade do produto.
3. **Política padrão da nota da IA**: sugestão sempre, automática acima de um limiar de confiança,
   ou só apoio ao avaliador humano. Trava o fluxo de encerramento da monitoria.

A quarta, de onde saem os insights quando o canal não é oficial, já tem resposta provável escrita
no desenho e só precisa de confirmação: sai da transcrição, que existe independentemente de o canal
ser oficial. O canal oficial protege o número, não a análise.
