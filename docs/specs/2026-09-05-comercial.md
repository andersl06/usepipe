# Pipe — modelo comercial

Origem: mentoria com conselheiro em 03/09/2026, registrada em anotações da reunião. O conselheiro
trouxe um manual de comercialização vindo de contratos reais com Vale e HP. Este documento traduz
aquilo para o Pipe e marca o que exige decisão sua.

## 1. A divergência, dita de frente

O conselho foi: escolha **uma** ferramenta open source (Chatwoot), construa três ou quatro builds
diferentes em ambientes variados, prove estabilidade, e só então venda serviço em cima dela. E o
alerta que veio junto: competir com Salesforce, SAP e Totvs em CRM corporativo é caro e complexo
para uma pessoa só.

A decisão tomada foi outra: construir o Pipe do zero, CRM, atendimento e monitoria no mesmo
produto. O alerta continua válido e vale mantê-lo à vista — **o risco não é técnico, é de fôlego**.
Produto próprio significa carregar sozinho o que o open source já resolveu, e o tempo até a
primeira venda é maior.

O que reduz esse risco, e vem do próprio conselho: a **monitoria com IA funciona plugada na
plataforma que o cliente já usa**. Ela não precisa do resto do Pipe para ser vendida, e é o caminho
mais curto até receita enquanto o produto completo amadurece.

## 2. Portfólio: o conselho que continua valendo

A lógica dos "três a quatro builds" não morre com produto próprio, só muda de forma. O que o
cliente precisa ver não é código, é **prova de que roda em cenários diferentes**:

1. **Instalação de referência da PJ**, com dados reais de uso próprio. É o laboratório e a vitrine.
2. **Operação comercial**: fila única, poucos atendentes, foco em lead e score.
3. **Operação de suporte**: várias filas, SLA apertado, volume alto.
4. **Monitoria avulsa**, plugada num Chatwoot ou numa Blip de terceiro, sem trocar o sistema.

Cada uma vira caso demonstrável, com número medido e não estimado. É isso que substitui o
depoimento de cliente que ainda não existe, e o que a landing page hoje chama de cenário
ilustrativo.

## 3. Como empresa privada compra

O conselheiro foi direto: empresa privada não compra inovação, compra **lucro, redução de custo ou
aumento de produtividade**. Inovação como argumento funciona em governo e ensino, não aqui.

Isso muda a conversa de venda do Pipe. Os argumentos, em ordem de força:

| Argumento | Como se prova |
|---|---|
| Reduz o custo de plataforma | comparação direta com o que ele paga hoje por assento |
| Reduz o custo de qualidade | um analista avalia todas as conversas em vez de cinco por atendente |
| Aumenta a produtividade | relatório de esforço mostra ocupação real e onde há folga |
| Elimina risco | número na API oficial, com o WABA no nome do cliente |
| Descobre o que automatizar | demanda recorrente com volume, que vira decisão de tirar da mão |

Nenhum deles fala de tecnologia. É de propósito.

## 4. Estrutura de contrato

O conselheiro mostrou um contrato real. A estrutura que ele defende, adaptada:

**Ciclos de implantação de 30 dias.** Consultoria prévia, início da implantação, e só então
operação. Não é entrega única.

**Suporte de 180 dias** incluído após a implantação, com a operação continuada cobrada à parte.

**Escopo, e sobretudo o fora de escopo.** A parte que blinda contra expectativa irreal é a lista do
que o cliente **não** deve esperar. Para o Pipe, o fora de escopo inicial é: migração de dados de
outra plataforma, desenvolvimento de integração sob medida, treinamento presencial, customização de
tela, e suporte a canal fora dos quatro do produto.

**Pedido novo é contrato novo.** Migração de dados, no exemplo dado, acrescentou três meses de
faturamento. Não é rigidez, é o que impede o projeto de virar prejuízo silencioso.

**Matriz RACI** — quem é responsável pela execução e quem responde legalmente. A observação que
você mesmo fez na reunião vale registrar: a responsabilidade jurídica por perda recai sobre quem
implementa, não sobre quem faz execução pontual. No Pipe, isso significa deixar escrito quem
responde pelo conteúdo enviado ao cliente final, e pela decisão automatizada que a IA sugerir.

**Níveis de suporte** definidos (L1, L2), com o que cada um cobre e prazo de resposta.

## 5. RFP: responder antes de ser perguntado

Empresa média para cima compra por RFP. Quem chega com o documento pronto ganha tempo e credibilidade.

O Pipe precisa de uma **matriz de requisitos** própria, no formato que o conselheiro descreveu:
cada requisito classificado como mandatório, desejado ou informativo, e uma coluna dizendo se a
plataforma atende de forma total, parcial ou não atende, **com evidência**. Blocos:

- **Funcionais**: atendimento, filas, SLA, relatórios, CRM, monitoria, automação
- **Normativos**: LGPD, e onde couber ISO 27001 e SOC 2. GDPR só se houver cliente na Europa
- **Engenharia**: API REST, webhooks, autenticação, SSO, exportação, retenção
- **Segurança**: cifra em repouso e em trânsito, auditoria, controle de acesso, teste de invasão
- **Operação**: disponibilidade, backup, recuperação, suporte, escalonamento

Preencher isso honestamente, incluindo os "não atende", é o que separa fornecedor sério de vendedor.

## 6. Modelos de cobrança

Três caminhos foram discutidos, e eles não são excludentes:

**Camadas.** Planos com limites claros. Previsível para os dois lados, fácil de comprar.

**Por uso.** Consumo de IA e envio de template. Já está construído no `consumo_ia`, e é o que
protege a margem quando um cliente usa dez vezes mais que outro.

**Suporte especializado à parte.** Vender horas de especialista sem substituir o time do cliente.
O conselheiro citou o "rate card", que lista exaustivamente cada tipo de chamado, mas ele mesmo
considera complexo demais e não usa mais. Fica registrado como referência, não como recomendação.

A combinação que faz sentido para o Pipe: **camada por atendente + consumo de IA e de envio
medido**. Preço fica em aberto e continua sendo a decisão que trava o módulo de cobrança.

## 7. Requisitos de produto que saíram da reunião

Três coisas que o conselheiro citou e que **não estavam** nas specs:

**Observabilidade exportável.** Ele citou New Relic, DataDog e Grafana. Cliente médio quer ver a
saúde da plataforma nas ferramentas dele, não só nas suas. O Pipe precisa expor métrica em formato
padrão (Prometheus) e permitir envio para destino externo. Entra na spec de infraestrutura.

**Integração com diretório da empresa.** Ele falou de Active Directory para gestão de perfis. Já
está coberto pelo SSO em três degraus que entrou na spec de identidade, com SAML e provisionamento
automático.

**Mineração das conversas como produto secundário.** Já é o módulo de insights, mas vale a
observação dele: isso é produto vendável por si só, não recurso de apoio.

## 8. Antes de vender: teste de invasão

O conselheiro tratou como pré-requisito, não como boa prática. Uma plataforma que guarda conversa de
cliente final e token da Meta precisa de teste de segurança feito por terceiro **antes** da primeira
venda, e o relatório vira anexo de RFP.

## 9. O que trava, e é decisão sua

1. **Preço e unidade de cobrança.** Trava o módulo de faturamento, a tela de consumo e a proposta.
2. **Nicho inicial.** O conselheiro insistiu nisso e ainda não foi respondido. Vender para quem:
   operação comercial, suporte de software, saúde, educação, varejo? O nicho define o formulário de
   avaliação padrão, os modelos de resposta pronta e o argumento de venda.
3. **Primeiro cliente pago ou piloto gratuito.** Piloto acelera o portfólio e atrasa a receita.

## 10. Próximas etapas registradas na reunião

Da lista de ações que ficou para você, o que toca este projeto:

- Montar o portfólio com builds diferentes, agora no formato da §2
- Definir nicho e modelo de negócio, com preço e licenciamento
- Estruturar o modelo de venda a partir do que os portfólios mostrarem
- Solicitar teste de invasão
- Construir portfólio, modelo de negócio e contrato **em paralelo**, sem esperar um terminar

O último ponto é o mais fácil de esquecer e o que mais custa: esperar o produto ficar pronto para
começar a estruturar contrato e preço adia a primeira venda sem melhorar o produto.
