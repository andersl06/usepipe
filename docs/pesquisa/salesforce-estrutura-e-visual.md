
# Salesforce: estrutura, visual e integração, como referência para o Pipe

Levantamento na org `playground` (`auvp--playground.sandbox.my.salesforce.com`, alias `playground`,
usuário `anderson.linhares@auvp.com.br.playground`), via MCP do Salesforce, somente leitura. Nenhum
registro, campo, objeto ou metadado foi criado, editado ou apagado.

Método: SOQL sobre `EntityDefinition` e `FieldDefinition` (Tooling API quando necessário) para a
estrutura de dados; documentação pública do Lightning Design System (BSD 3, `lightningdesignsystem.com`
e o arquivo `v1.lightningdesignsystem.com`) para os números de token; e, para o visual medido ao vivo,
o arquivo já existente `docs/pesquisa/visual-blip-salesforce.md`, que mediu o DOM real desta mesma org
em 05/09/2026 com sessão autenticada.

**Limitação registrada.** Nesta sessão eu tentei abrir o Chrome direto na org
(`https://auvp--playground.sandbox.my.salesforce.com/lightning/page/home`) para capturar cabeçalho,
listagem, ficha de registro, Kanban, Configuração e Relatórios. A aba pediu login do Salesforce (a
sessão do navegador não estava autenticada). Por instrução, não tentei autenticar. Os números de
telas específicas (ficha de registro, Kanban de Oportunidade, tela de Relatórios) portanto **não
foram medidos nesta sessão**; uso a medição de DOM que já existe (cabeçalho, listagem, Configuração)
e marco como "não medido" o que nem essa cobre.

---

## 1. Estrutura de dados

### 1.1 Campos por objeto, medidos

| Objeto | Total de campos | Padrão | Customizado | % customizado |
|---|---|---|---|---|
| Lead | 353 | 49 | 304 | 86% |
| Opportunity | 251 | 48 | 203 | 81% |
| Account | 171 | 61 | 110 | 64% |
| Case | 111 | 49 | 62 | 56% |
| Contact | 54 | 50 | 4 | 7% |

A contagem de customizados usa `QualifiedApiName LIKE '%__c'` sobre `FieldDefinition`, filtrada por
objeto; o risco de falso positivo desse padrão (explicado abaixo, item 1.3) é desprezível em nomes de
campo, porque nenhum campo padrão desses cinco objetos termina em letra + "c".

**O que isso ensina.** O caso do Lead (353 campos, 304 customizados, já registrado em
`ativos-internos.md`) não é um acidente isolado de formulário mal desenhado: é um padrão que se repete
em proporção parecida ou pior em Opportunity (81%) e Account (64%). Contact é a exceção limpa (7%),
porque a AUVP nunca usou Contact como lugar de captar pergunta de formulário, só Lead, Account e
Opportunity. **O que o Pipe deve evitar não é "campo demais no Lead"; é "objeto de negócio vira
depósito de pergunta de formulário", generalizado.** A decisão já tomada em
`docs/specs/2026-09-05-pipe-design.md` §4.2 (pergunta de formulário vira linha em
`resposta_formulario`, não coluna) precisa valer para todo objeto que capta formulário, não só Lead.

### 1.2 Objetos de atendimento

- **Case**: 111 campos, o objeto de atendimento nativo. RecordType controla o processo (ver 2.3).
- **CaseComment**: 11 campos, todos padrão. Nenhuma customização. É o objeto mais enxuto medido aqui,
  e mostra que nem todo objeto satélite de atendimento vira dumping ground.
- **EmailMessage**: 43 campos, todos padrão nesta amostra. Não é usado pelo pipeline `case-sync` hoje
  (ver seção 5).
- **Fila_de_Atendimento__c**: objeto **customizado**, 28 campos, que convive com o Group/Queue nativo
  (seção 2.1) mas resolve outro problema: é uma tabela de **consultor disponível para rotação**, com
  campos como `Ativo__c`, `Numero_na_Fila__c`, `Ferias_Licenca__c`, `Time_Novos_Neg_cios__c`,
  `Usuario_Relacionado__c`, `Proxima_Vez_IA__c`. Ou seja, o Salesforce nativo modela "fila como
  destino de roteamento" (Group/Queue), mas não modela "consultor está de férias, é a vez de quem" e
  a AUVP teve que construir isso à parte, em objeto próprio.
  **O que o Pipe deve imitar:** a distribuição por carga real do Pipe (`packages/ui`/`core`, já
  decidida em §4.3 do design) já cobre exatamente essa lacuna nativamente (capacidade, carga
  ponderada, desempate por tempo de espera), então o Pipe já resolve de fábrica o que a AUVP precisou
  remendar com objeto customizado.

### 1.3 Quantos objetos existem, e a advertência sobre o "LIKE"

`SELECT COUNT() FROM EntityDefinition` devolve **1401** entidades no total (padrão + customizado +
metadado de plataforma). Para isolar só os objetos customizados eu tentei
`QualifiedApiName LIKE '%__c'`, mas o padrão do SOQL trata `_` como curinga de um caractere, então
`'%__c'` na prática significa "termina em dois caracteres quaisquer seguidos de c" e capturou objetos
de sistema como `ActiveFeatureLicenseMetric`, `BroadcastTopic` e `PushTopic` (89 linhas no total, das
quais 19 são falso positivo). Filtrando manualmente os que realmente terminam em `__c`: **70 objetos**,
sendo:

- **18** do pacote gerenciado `et4ae5` (Salesforce Marketing Cloud / Pardot);
- **52** próprios da org, dos quais **2 são objetos de teste esquecidos em produção**
  (`teste_alyf__c`, `Objeto_te_teste_MKT__c`).

**O que evitar:** objeto de teste que nasce durante desenvolvimento e nunca é removido. É o mesmo
princípio do campo de formulário que nunca sai do Lead: metadado que entra é metadado que fica.

### 1.4 Registro de metadado, não de dado

O sandbox Playground é do tipo DEVELOPER: copia metadado, não copia dado. `Opportunity` não tem
nenhum registro com `StageName` preenchido nesta cópia e `Case` tem exatamente 1 registro. Isso
significa que os números desta seção são **de schema**, não de operação; para volume de operação
(quantos Cases por dia, por fila) a fonte é a produção (somente leitura) ou os relatórios já
existentes do `case-sync`.

---

## 2. Regras

### 2.1 Fila e atribuição: dois mecanismos que não são o mesmo

O Salesforce nativo modela fila com **`Group` do tipo `Queue`** e associa objeto a ela com
**`QueueSobject`**. Medido:

- **11 filas nativas**: `Casos Paulo Cuenca` e suas 3 variantes de nível, `Closer de Vendas`,
  `Fila de Atendimento - ISaEx`, `Gestão de Clientes`, `Leads Raul Sena`, `Caso de serviço`,
  `Suporte AUVP`, `Suporte AUVP Investimentos`.
- **12 vínculos objeto-fila**: a maioria em `Case` (5) e `Lead` (3), mas também em objetos
  customizados (`GestaoClientes__c`, `PatrimonioOrientado__c`) e em `MessagingSession` (a fila de
  atendimento omnichannel).

**Atribuição automática (`AssignmentRule`) é quase inexistente**: só **1 regra**, para `Case`
(`Atendimento Escola`), e está **inativa**. Isso quer dizer que o roteamento real de Lead e Case não
acontece pela ferramenta declarativa nativa para isso; acontece por **Flow** (seção 2.2). O Salesforce
oferece uma ferramenta dedicada (AssignmentRule, com critério e fila em UI simples e auditável) e a
AUVP não a usa: preferiu programar o roteamento em Flow, que é mais flexível mas menos legível para
quem não abre o Flow.

**O que o Pipe deve imitar:** ter uma camada declarativa de regra de fila, separada da lógica de
automação geral (o design já prevê isso, `regra_fila` em §4.4, e `workflow`/`gatilho`/`ação` como
camada geral em §4.6). **O que evitar:** deixar toda a regra de roteamento sepultada dentro de fluxo
de automação genérico, sem uma tela que responda "por que este caso foi para esta fila" sem abrir
código.

### 2.2 Regras de validação: quase não existem, e não estão em Case nem Lead

`ValidationRule` (Tooling API): **23 no org inteiro**. Nenhuma em `Case`. Nenhuma em `Lead`. As que
existem miram objetos customizados (`Planejamento_Patrimonial__c`, `GestaoClientes__c`,
`Fila_de_Atendimento__c`, `Faixa_de_Brinde__c`), `Account`, `Opportunity`, e dois objetos do pacote
Marketing Cloud.

Em compensação, **Flow é a ferramenta real de automação**: `FlowDefinitionView` devolve **306**
definições no total, **217** do tipo `AutoLaunchedFlow`/`Workflow`, e **23** disparadas por `Lead`
(nenhuma por `Case`, na amostra consultada). Nomes como `[Lead] - Before Save`,
`[Lead] — marca como Corporate (Criação)`, `Leads — Converte Wealth automaticamente` mostram que
regra de negócio que em outro desenho seria uma `ValidationRule` simples virou lógica de Flow.

**O que evitar:** empurrar toda regra de negócio para automação de propósito geral só porque ela é
mais flexível. Regra simples de "campo obrigatório sob esta condição" documentada como
`ValidationRule` é mais barata de auditar do que a mesma regra dentro de um Flow de 20 passos. O Pipe
já separa isso em `core` (regras puras testáveis) do `workflow` (automação geral); vale manter essa
fronteira também na experiência de quem configura, com uma tela de "regra simples" separada do
construtor de automação geral.

### 2.3 Tipos de registro: processo de negócio, ou nome de pessoa

`RecordType`: **42** no total, sendo Case **18**, Lead **12**, Opportunity **11**, Account **3**.

A leitura dos nomes é o achado. Em Lead e Opportunity, os RecordTypes nomeiam **produto/linha de
negócio** (`AUVPCredito`, `AUVPFazendas`, `AUVPSeguros`, `AUVP_Wealth`, `AUVPCorporate`), o que é
saudável: o processo muda por produto, faz sentido ter tipo de registro por produto.

Em **Case**, a maioria dos 18 RecordTypes nomeia **pessoa/criador de conteúdo**:
`Paulo_Cuenca`, `Paulo_Cuenca_FEC`, `Paulo_Cuenca_O_Portal`, `Paulo_Cuenca_O_Superpoder`,
`Paulo_Cuenca_Comunidade` (inativo), `Paulo_Cuenca_Reels_Superpoderoso` (inativo),
`Paulo_Cuenca_Temperatura_do_Algoritmo` (inativo), `Raul_Sena_AUVP`, `Raul_Sena_AUVP_Analitica`
(inativo), `Raul_Sena_AUVP_Capital`, `Raul_Sena_AUVP_IR` (inativo), `Raul_Sena_AUVP_Sempre`
(inativo), `Raul_Sena_Consultoria` (inativo), `Raul_Sena_ISaEx` (inativo), `Danielle_Noce`.

**Isso é o mesmo antipadrão do campo de formulário, só que em RecordType**: em vez de modelar o
**processo** de atendimento (dúvida técnica, cancelamento, cobrança, cada um com seu layout e sua
fila), modelou-se **quem gerou o lead**. O resultado à vista: **8 dos 18 RecordTypes de Case já estão
inativos**, o rastro de campanhas e parcerias encerradas que ninguém arquiva. Um RecordType morto não
aparece para o usuário final, mas continua existindo no schema, no relatório e na tela de quem
administra.

**O que o Pipe deve evitar:** tipo de registro (ou fila, ou etiqueta) nomeado por pessoa, campanha ou
parceria pontual. **O que imitar:** RecordType por produto em Lead/Opportunity é um bom padrão, e o
Pipe já tem o equivalente correto: `formulario`/`formulario_versao` versionado por produto, não por
pessoa.

### 2.4 Layout: proxy de quantos processos distintos por objeto

`Layout`: **Case tem 7**, **Lead tem 10**, **Account tem 1**. Quantidade de layout é um proxy honesto
de "quantos processos diferentes este objeto atende": Lead com 10 layouts bate com os 12 RecordTypes
(quase um layout por tipo de produto); Case com 7 layouts para 18 RecordTypes sugere que vários tipos
de registro (os por-pessoa) compartilham layout, o que reforça que não existiam para mudar
comportamento de tela, só para segmentar fila/relatório, uso menor do que o recurso permite.

---

## 3. Permissão

### 3.1 Perfil: 36 no total, a maioria de sistema, mas o padrão dos próprios é por departamento

`Profile`: **36** no total. Os que a AUVP criou (16, aproximadamente, pelo padrão de nome) seguem o
formato "Usuário - <Área>": Atendimento, Atendimento 2, Consultoria, Consultoria B2B, Consultoria JR,
Crédito, Marketing, Novos Negócios, Novos Negócios Vazio, Seguros, Wealth, além de Diretoria e
Relacionamento e um perfil de Administração de Consultoria.

**Isso é perfil por departamento**, a mesma lógica de "um destino fixo para cada recorte
organizacional" que gerou fila por pessoa e RecordType por pessoa. Perfil é o recurso mais caro de
manter no Salesforce (é fixo por usuário, um usuário só tem um perfil), e departamento muda mais
devagar do que função; ainda assim há **Atendimento** e **Atendimento 2** (o "2" sugere um remendo
para uma variação que não coube no primeiro perfil) e um **Novos Negócios Vazio**, provavelmente um
perfil criado e nunca usado.

### 3.2 Permission Set e Permission Set Group: a peça mais numerosa

`PermissionSet` (`IsOwnedByProfile = false`): **224** no total, das quais **114 sem namespace**
(próprias da org) e **110** de pacotes gerenciados. `PermissionSetGroup`: **23**.

Isso mostra que a AUVP **já usa** o padrão moderno recomendado pelo próprio Salesforce (perfil mínimo
+ permission set granular + permission set group para empacotar), não só perfil monolítico. A ressalva
é de escala: 114 permission sets próprios é um número alto para conferir manualmente quem tem acesso
a quê; sem uma tela que cruze "usuário → permission sets → o que isso realmente libera", a
granularidade vira opacidade.

**O que o Pipe deve imitar:** o modelo (papel enxuto + permissão granular + grupo de permissão), que
é exatamente o que o design já decideu (`papel` · `permissão` como "lista de capacidades nomeadas, não
flag booleana espalhada", §4.1). **O que evitar:** deixar a lista de permission sets crescer sem uma
tela de auditoria que mostre o efetivo, porque 224 objetos de permissão sem essa tela é tão opaco
quanto um perfil monolítico.

### 3.3 Campo nasce invisível: o alerta que já custou retrabalho

Registrado em memória do próprio operador (`salesforce-permissionamento`, 25/08/2026): campo criado
por deploy **nasce invisível para todo perfil**, exceto os obrigatórios e master-detail. Um Flow que
grava nesse campo falha com `INVALID_FIELD_FOR_INSERT_UPDATE` até alguém lembrar de anexar o
permission set com a FLS (Field-Level Security) certa. É o oposto de "seguro por padrão": é "quebrado
por padrão até alguém liberar".

**O que o Pipe deve evitar:** esse modelo de campo fechado por padrão sem aviso no momento da criação.
**O que imitar, invertendo:** todo campo novo no Pipe deveria nascer visível para o papel dono do
objeto (o CRM já pertence ao papel Comercial, o atendimento ao Atendente) e a exceção (campo restrito)
é que deveria pedir configuração explícita, não o contrário.

---

## 4. Visual, com números

### 4.1 Cor

Documentação pública (`v1.lightningdesignsystem.com/design-tokens`): os tokens do SLDS clássico se
organizam em **16 categorias de nomenclatura** (Colors, Background Color, Text Color, Border Color,
Font, Font Size, Opacity, Line Height, Spacing, Radius, Sizing, Shadow, Time, Touch, Media Query,
Z-index). A marca (`brand-*`) tem **cerca de 12 variações** nomeadas por papel, não por tom
(`brand-primary`, `brand-accessible`, `brand-light`, `brand-dark`, `brand-contrast`, `brand-disabled`,
`brand-background-primary`, `brand-text-link`, entre outras). Estado tem **3 papéis documentados**
(error, warning, success), cada um como cor de fundo pastel com uma variação mais escura para texto,
o mesmo formato de trio que a Blip e o `MARCA.md` do Pipe já adotam.

**Medido ao vivo** (`visual-blip-salesforce.md`, DOM real da mesma org, 05/09/2026): o `:root`
declara **1205 custom properties**, mas uma tela de listagem real usa **8 cores de texto** e a borda é
**uma cor só em 66% das arestas** (`#C9C9C9`). A cor de destaque é **uma** (`#0176D3`, azul), e
aparece só em link e estado ativo, nunca em etiqueta decorativa. Cor de estado soma **menos de 1%**
dos elementos da tela. **A conclusão do documento já existente se confirma aqui com uma fonte
diferente (a documentação pública dos tokens): o tamanho da paleta disponível (1205 tokens, 12
variações de marca) não tem relação com o tamanho da paleta usada numa tela (8 cores, 1 destaque).**

### 4.2 Tipografia

Família: **Salesforce Sans** no CSS clássico (confirmado no `@font-face` do bundle compilado, pesos
**300, 400 e 700**), com o corpo do documento em **0.8125rem = 13px** de base. Na aplicação Lightning
real, a pilha computada é `-apple-system`/`system-ui`, sempre **uma família só na tela**.

Medido ao vivo: **5 tamanhos existem** na tela de listagem (13px, 12px, 10px, 18px, 20px), mas **13px
e 12px somam 98%** das ocorrências. **4 pesos existem**, **400 e 700 somam 99%**. Caixa alta aparece
só em cabeçalho de coluna de tabela (12px, peso 700), sempre na mesma família do corpo, **nunca em
fonte monoespaçada**.

### 4.3 Espaçamento e raio

Escala pública de espaçamento (`v1.lightningdesignsystem.com`): `xxx-small` 0.125rem (2px),
`xx-small` 0.25rem (4px), `x-small` 0.5rem (8px), `small` 0.75rem (12px), `medium` 1rem (16px),
`large` 1.5rem (24px), `x-large` 2rem (32px), `xx-large` 3rem (48px). Oito degraus, todos múltiplos
de 4px.

Raio, documentado: `small` 2px, `medium` 4px, `large` 8px, `circle` 50%. Medido ao vivo: **4px domina
em 77%** dos elementos com raio, **50% em avatares** (10 ocorrências), 2px (2) e 8px (1) são exceção.
**O raio dominante do Salesforce (4px) é menor que o do Blip e o do Pipe (8px, ver seção 6).**

### 4.4 Densidade

Medido ao vivo: cabeçalho global **50px** + barra de módulos **40px** = **90px de cromo fixo** antes
do conteúdo. Linha de tabela **35px**. Célula com `padding: 8px` e `font-size: 13px`. Cabeçalho de
coluna com `padding: 4px 8px`, `font-size: 12px`, `font-weight: 700`, caixa alta, cor `#444444`.

### 4.5 Navegação: três camadas, cada uma num nível diferente

Isto é o achado mais importante para responder "como o Salesforce coloca centenas de função na frente
do usuário sem virar bagunça", e junta o que já estava medido com o que a documentação pública do
Setup confirma:

1. **Camada de aplicativo (o lançador).** O ícone de grade ("waffle") no canto esquerdo do cabeçalho
   abre a lista de aplicativos instalados na org. Trocar de aplicativo é trocar todo o conjunto de
   abas visíveis; é o nível mais raro de navegar, porque um usuário normalmente vive dentro de um só
   aplicativo o dia inteiro.
2. **Camada de objeto (as abas do aplicativo aberto).** Medido: barra de **40px**, **7 itens** na
   listagem de Contas (Início, Chatter, Contas, Contatos, Contratos, Calendário, Configurações). É
   plana, horizontal, sem submenu: cada aba é um objeto ou uma página, não uma árvore.
3. **Camada de Configuração, que é outro lugar, não um item de menu.** Ao clicar na engrenagem, o
   Salesforce **troca de domínio** (de `lightning.force.com` para `my.salesforce-setup.com`), **reduz
   a navegação de topo de 7 para 3 itens** (Iniciador de Apps, Início, Gerenciador de Objetos), e só
   **aí** aparece um menu lateral, de **250px**. A documentação pública descreve essa árvore como
   organizada hoje em **3 seções amplas** (Administração, Ferramentas de Plataforma, Configurações,
   sucessoras das antigas "Administer / Build / Deploy"), com uma caixa de **Quick Find** no topo que
   busca por palavra-chave em vez de exigir navegar a árvore inteira.

A resposta à pergunta do dono está nesse desenho: o Salesforce não esconde centenas de função dentro
de uma tela de trabalho com permissão; ele **muda de lugar**. Configuração é um produto à parte, com
o seu próprio domínio, a sua própria busca e a sua própria árvore, e a tela de trabalho nunca precisa
saber que ela existe.

**Não medido nesta sessão** (a tentativa de captura ao vivo não pôde autenticar): a estrutura exata da
ficha de registro (painel de destaque, abas internas, coluna de atividade), o Kanban de Oportunidade e
a tela de Relatórios. O que se sabe por documentação pública, sem número de pixel: a ficha de registro
Lightning usa um painel de destaque no topo com os campos mais importantes, abas para os related
lists, e uma coluna de atividade (tarefas, eventos, e-mails) ao lado dos detalhes; o Kanban de
Oportunidade usa o `StageName` como coluna; a tela de Relatórios lista relatórios salvos organizados
em pastas, com criação de relatório por tipo de relatório (junção pré-definida de objetos). Isso é
conhecimento de produto, não medição desta sessão, e está marcado como tal.

### 4.6 Componentes essenciais

A documentação pública organiza os componentes base em **7 categorias funcionais**: ação e menu,
contêiner, visual, entrada de dados, formulário, navegação, e status/notificação. Componentes citados
nominalmente pela documentação e pelo pacote de referência: tabela de dados, combobox, modal, path,
tree, badge, avatar, tabs, card, accordion, entre outros. Não consegui confirmar um número total exato
de componentes na versão atual do site (a navegação pública mudou de estrutura recentemente para o
SLDS 2 e as páginas antigas estão em arquivo); trato isso como não medido, em vez de estimar.

---

## 5. Integração com o Pipe

Contexto: já existe hoje uma ponte funcionando, o pipeline **case-sync** (n8n, workflow "Abertura de
caso automático"), que fecha o ciclo Blip → Salesforce. É o precedente real para o que o Pipe precisa
igualar ou superar.

### 5.1 Quais objetos recebem dado de atendimento, hoje e no que deveria

**Hoje**, o `case-sync` só escreve em **Case**, via endpoint Apex REST customizado
(`/services/apexrest/chatbot/caso/create/`), com resumo por IA, categoria, subcategoria e conta
vinculada. O caminho até o Case passa por uma cascata de busca em **Account** (telefone → cpf/cnpj →
email), mas a Account nunca é criada por esse pipeline, só localizada. **Contact** também não é escrito
pelo pipeline hoje.

**Task** e **EmailMessage** existem no schema (EmailMessage com 43 campos, todos padrão nesta
amostra) mas não fazem parte do fluxo atual. Isso é uma lacuna real: uma mensagem trocada fora do
e-mail (o áudio, a imagem, o texto do WhatsApp) hoje vira só o campo de resumo do Case; não existe
registro individual de interação (o equivalente a uma Task por mensagem, ou por trecho relevante da
conversa) no Salesforce. Para o Pipe, a decisão certa não é replicar isso: o histórico rico já vive no
banco do Pipe (`mensagem`, `evento_atendimento`); o que deve ir para o Salesforce do cliente é o
**resumo e a classificação** no Case (como já acontece), não a conversa inteira, porque duplicar o
conteúdo integral em Task/EmailMessage não tem consumidor no Salesforce e infla o schema do cliente,
o mesmo erro do "pergunta de formulário vira coluna" em outra forma: "mensagem de chat vira registro".

### 5.2 Qual API cabe em qual situação

O volume de referência é da ordem de 104 mil tickets por período (contexto já registrado pelo dono).
Isso separa claramente três padrões de uso, que a org de hoje mistura ao usar só REST síncrono:

- **REST simples** (o Apex REST customizado que já existe) é certo para o caminho de **1 caso por
  vez**, síncrono, quando o atendimento fecha e precisa criar o Case imediatamente. Não é a rota
  certa para carga retroativa ou reprocessamento em lote: cada chamada paga round-trip completo.
- **Bulk API 2.0** é a rota certa para volume, por exemplo um sync noturno que reprocessa tickets
  pendentes ou faz backfill de um período inteiro: aceita CSV/JSON em lote, processa assíncrono, e é
  a única das três pensada para dezenas de milhares de linhas sem estourar limite de chamada por dia.
- **Composite API** (ou Composite Graph) resolve o caso do case-sync de hoje que faz várias chamadas
  em sequência (buscar Account, criar Case) numa única viagem de rede, com rollback atômico se um
  passo falhar; hoje isso é feito com lógica Apex própria no endpoint customizado, mas o padrão nativo
  existe e evita reescrever a orquestração a cada novo objeto que entra na cadeia.
- **Platform Events / Change Data Capture** são a rota certa para o **caminho de volta** (seção
  seguinte): notificar o Pipe quando algo muda no Salesforce, sem o Pipe ficar perguntando (polling).

### 5.3 O caminho de volta: o atendente vendo o Salesforce dentro do Desk

O pedido é concreto: o atendente precisa ver conta, contato e casos abertos do cliente **enquanto
conversa**, sem travar a tela. SOQL direto a cada mensagem recebida é a opção mais lenta e mais frágil
(depende da org do cliente estar respondendo rápido no momento exato em que o atendente abre a
conversa). O padrão que não trava é:

1. O Pipe mantém uma **cópia de leitura** (cache) de Account/Contact/Case por identidade de contato,
   atualizada de forma assíncrona.
2. **Platform Events ou Change Data Capture** no Salesforce do cliente notificam o Pipe quando um Case
   ou Account relevante muda, e o Pipe atualiza o cache; não é o atendente esperando uma consulta ao
   vivo.
3. Só quando o cache não tem a informação (contato novo, por exemplo) o Pipe faz uma consulta SOQL
   síncrona, e mostra estado de carregamento em vez de travar a tela toda.

Esse desenho cabe dentro do que o `2026-09-05-pipe-design.md` já prevê em §4.6 (motor de workflow com
gatilho de "webhook" e "evento de dado"): o evento vindo do Salesforce é só mais um gatilho de
workflow, e a ação é "atualizar cache de conta/contato".

### 5.4 Casamento de registro: o que a memória já mostrou que é frágil

A migração de org da AUVP (`asupernova` → `auvp`, ver memória `salesforce-migracao-org-auvp`) trocou
o prefixo do Id de Case (`500U4...` → `500N5...`) e obrigou a casar dado antigo com novo pelo campo
`Subject` (formato "Assunto | Ticket #NNNN"), que **já gerou duplicata**: Subjects iguais em dois
Cases com `CreatedDate` igual e `CaseNumber` diferente. `Subject` é texto livre, editável, sem
garantia de unicidade: é o pior campo possível para ser chave de casamento, e só virou chave porque
era o único que sobreviveu à migração.

**O caminho robusto** é o padrão que o próprio Salesforce oferece para exatamente esse problema:
um campo marcado como **External ID** (indexado, com opção de exigir unicidade), preenchido pelo
sistema de origem, nunca editável por um humano no fluxo normal. Para o Pipe, isso quer dizer: desde
a primeira escrita no Salesforce do cliente, gravar o **identificador do Pipe** (o id da conversa, ou
o id do contato no Pipe) num campo customizado do tipo External ID em Contact e em Case. Isso permite
usar `upsert` pela chave externa (a API do Salesforce foi desenhada para isso) em vez de "buscar por
telefone, senão por CPF, senão por e-mail, senão por assunto", que é exatamente a cascata frágil que
o `case-sync` faz hoje. A cascata continua útil como *fallback* para o primeiro contato antes de o
External Id existir, nunca como método principal depois dele.

### 5.5 Autenticação: o que já dói, e o que evitar repetir

Três armadilhas já documentadas em memória, e que valem como requisito negativo para o Pipe:

- **Login web não roda sem interação.** `sf org login web` falha em ambiente headless. Um produto
  que vai conectar a orgs de clientes não pode depender de alguém digitar usuário e senha numa janela
  toda vez que o token expira.
- **Named Credential do sandbox volta a apontar para produção a cada refresh.** É um risco específico
  do ciclo de vida de sandbox, mas o ensinamento geral vale: **nunca fixar o endpoint da org no
  código**. O Salesforce devolve `instance_url` a cada autenticação; usar sempre esse valor, nunca uma
  URL gravada.
- **A produção é somente leitura por regra** (memória `salesforce-producao-read-only`), e a conta de
  API de produção usa **perfil Administrador do sistema com "Modificar todos os dados"**. Isso é
  exagero de permissão para um caso de uso que só precisa criar/ler Case, Account e Contact: o Pipe,
  ao pedir acesso à org de um cliente, deve pedir um **Connected App / permission set com escopo
  mínimo** (os objetos e campos que o produto realmente toca), não "acesso total", que é o que a
  AUVP concedeu para si mesma e que se tornaria um risco de segurança grande se replicado por
  fornecedor externo.

O caminho certo, e que a própria produção da AUVP já usa: **JWT Bearer Flow** com um **Connected App
(ou External Client App) certificado**, chave privada por conexão, sem senha de usuário envolvida em
nenhum passo. Para o Pipe conectar em orgs de clientes diferentes (multi-tenant), isso quer dizer um
par de chave/certificado **por tenant**, guardado como segredo cifrado (a mesma regra que o design já
define em §6 para token de canal), nunca um único Connected App com credencial compartilhada entre
clientes.

### 5.6 O que o Salesforce faz melhor, e vale copiar

- **CaseComment separa nota pública de nota interna** dentro do mesmo objeto, com um campo booleano
  simples (`IsPublished`). O Pipe já tem `nota_interna` na Conversa (§4.3); vale garantir que, quando
  o resumo ou um comentário do avaliador for exportado para o Salesforce do cliente, essa mesma
  distinção pública/interna viaje junto, em vez de tudo virar um campo de texto só.
- **Entitlement e Milestone** (não usados nesta org, 0 registros) são o modelo do Salesforce para SLA:
  um Entitlement vinculado a Account ou Contact define o nível de serviço contratado, e Milestones
  marcam prazos dentro do ciclo de vida do Case (primeira resposta, resolução), cada um com o próprio
  relógio, que pode pausar (por exemplo, fora do horário de atendimento). **É exatamente o par
  `regra_sla` + `horario_atendimento` que o Pipe já planeja em §4.4**, e o fato de o Entitlement
  nativo separar "o que foi contratado" (Entitlement) de "o prazo específico deste caso" (Milestone)
  é uma validação de que o Pipe já está desenhando a peça certa: vale manter essa separação em duas
  entidades, não uma só.

---

## 6. Onde Salesforce e Blip concordam, e onde divergem

O que dois sistemas maduros e construídos sem relação entre si concordam é regra de design, não gosto
de time. Uma tabela com os dois, e o que já era medido do Pipe hoje:

| Medida | Salesforce | Blip | Pipe hoje |
|---|---|---|---|
| Famílias de fonte numa tela | 1 | 1 | 2 (Sans + Mono) |
| Cor de destaque | 1 (azul) | 1 (azul) | 4 (moss, terracota, ocre, azul) |
| Cor de borda | 1 domina (66%) | 1 tinta, 3 alfas | 2 + 4 coloridas |
| Estado como | trio fundo/texto pastel | trio fundo/texto pastel | inconsistente |
| Raio dominante | 4px | 8px (implícito, ver `blip-design-system.md`) | 3 valores |
| Navegação principal | horizontal, no topo | horizontal, no topo | vertical, tudo empilhado |
| Configuração | tela própria, outro domínio | módulo próprio | misturada no menu de trabalho |
| Item sem função visível | 0 | 0 | 45 de 54 (83%) |

### Onde concordam (é regra)

1. **Uma família de fonte por tela.** Nenhum dos dois mistura família no corpo do produto.
2. **Uma cor de destaque**, usada só em ação primária e estado ativo, nunca em decoração.
3. **Estado é sempre um trio** (fundo pastel, texto escuro, e uma borda ou realce que une os dois),
   nunca cor saturada isolada.
4. **Navegação principal horizontal**, por módulo/aplicativo, no topo.
5. **Configuração vive num lugar à parte**, fora do fluxo de trabalho normal.
6. **Item que não funciona não aparece.**

Esses seis pontos já estavam nas regras de `MARCA.md`; o Salesforce é a terceira fonte independente
que concorda com todos, o que os promove de "boa prática copiada da Blip" para "regra que dois
sistemas maduros, sem relação entre si, chegaram sozinhos".

### Onde divergem, e o que faz mais sentido para o Pipe

- **Raio.** Salesforce usa 4px como dominante; Blip e o Pipe (por decisão já registrada em
  `MARCA.md`) usam 8px. **Ficar com 8px.** Não é o Salesforce sozinho contra o resto: é um valor
  específico do Salesforce contra Blip e Twenty, que convergem perto de 8px; trocar por causa de uma
  fonte só quebraria um precedente já dobrado e já implementado.
- **Grau de separação da Configuração.** O Salesforce troca de **domínio inteiro**
  (`my.salesforce-setup.com`) para configurar; a Blip mantém configuração como módulo dentro do
  mesmo domínio. **Para o Pipe, o grau da Blip é suficiente**: uma rota própria
  (`/configuracoes`) com o seu próprio lateral já entrega o benefício real (não competir por espaço
  com a navegação de trabalho) sem o custo de operar dois domínios, dois logins, duas sessões. O
  ponto de concordância entre os dois (Configuração separada do trabalho) é a regra; o quanto ela se
  separa é detalhe de custo de engenharia, e o Pipe já decidiu certo em `MARCA.md`.
- **Tipografia monoespaçada.** O Salesforce **não usa nenhuma fonte monoespaçada na interface**, nem
  em número, nem em rótulo; caixa alta existe, mas na mesma família do corpo. A Blip também não usa.
  O Pipe decidiu manter monoespaçada, mas **contada** (só número tabular e rótulo de seção,
  `MARCA.md`, seção "Regras de interface"). Isso já diverge das duas referências por decisão
  consciente de marca (é "a assinatura visual do produto"), não por descuido; a divergência é
  aceitável porque já veio com a contenção que faltava antes.

---

## 7. Produção, medida por JWT

Levantamento feito em 06/09/2026 na org **de produção** (`auvp.my.salesforce.com`, confirmado pelo
`instance_url` devolvido pelo próprio token, nunca fixado no código), via **JWT Bearer Flow** (External
Client App `Interno_Capital`, usuário `apiuser@auvp.com.br`), somente leitura, só metadado. Todas as
consultas abaixo foram feitas por REST API (`/query`), Tooling API (`/tooling/query`) ou `describe` de
objeto; nenhuma leu registro de negócio (Lead, Contact, Account, Case, Opportunity ou qualquer objeto
com dado de cliente), nenhuma escreveu, atualizou, apagou ou fez deploy.

### 7.1 Campos por objeto: números confirmados, com uma divergência real

| Objeto | Playground | Produção | Diferença |
|---|---|---|---|
| Lead | 353 total, 304 custom (86%) | **383 total, 323 custom (84%)** | próxima, produção com mais 30 campos |
| Opportunity | 251 total, 203 custom (81%) | **257 total, 209 custom (81%)** | confirma, quase idêntica |
| Account | 171 total, 110 custom (64%) | **185 total, 106 custom (57%)** | **corrige**: produção tem mais campos totais, mas proporção customizada menor |
| Case | 111 total, 62 custom (56%) | **105 total, 57 custom (54%)** | confirma, próxima |
| Contact | 54 total, 4 custom (7%) | **50 total, 4 custom (8%)** | confirma |

Contagem feita pelo flag `custom` do `describe` de cada objeto (não pelo padrão `LIKE '%__c'`, que já
tinha o falso positivo documentado na seção 1.3), e cruzada com `FieldDefinition.QualifiedApiName`
terminando exatamente em `__c`; os dois métodos batem a poucas unidades (a diferença de Account, 106
vs 102, é de campos compostos que o `describe` conta e o `FieldDefinition` não).

**O que muda no Pipe:** nada no diagnóstico. Os quatro de cinco objetos que confirmam a proporção do
sandbox mostram que o padrão "objeto de negócio vira depósito de formulário" não é artefato de cópia
de sandbox desatualizada, é a org real. Account com proporção menor em produção (57% vs 64%) é a única
correção, e ainda assim mais da metade dos campos são customizados: não muda a recomendação de
`resposta_formulario` como linha, só reduz um pouco a urgência relativa desse objeto especificamente.

### 7.2 Case: campos, RecordTypes vivos e mortos, status

Case em produção tem **105 campos** (57 customizados, ver acima).

**RecordType**: `SELECT` em `RecordType` devolve **16** registros reais para Case (o `describe` soma
mais 1, o pseudo-tipo `Mestre`, que não é uma linha real e não existia no levantamento do sandbox).
**8 ativos, 8 inativos** — o sandbox media 18 no total com 8 inativos; produção tem **2 a menos no
total, mas a mesma contagem de mortos**, o que **confirma o achado central** (metade dos RecordTypes de
Case morreram) com um número um pouco menor de RecordTypes vivos por nome de pessoa/campanha do que o
sandbox tinha copiado:

- Ativos: `AUVP`, `AUVP Capital` (mapping padrão), `Danielle Noce`, `O Portal`, `Paulo Cuenca`,
  `Paulo Cuenca - FEC`, `Paulo Cuenca - O Superpoder`, `Relacionamento com o Cliente`.
- Inativos: `Paulo Cuenca - Comunidade`, `Paulo Cuenca - Reels Superpoderoso`,
  `Paulo Cuenca - Temperatura do Algoritmo`, `Raul Sena - AUVP Analítica`,
  `Raul Sena - AUVP Investimentos`, `Raul Sena - AUVP IR`, `Raul Sena - AUVP Sempre`,
  `Raul Sena - Consultoria`.

Todos os inativos continuam nomeados por pessoa ou campanha, nenhum por processo: o antipadrão da
seção 2.3 é o mesmo em produção.

**Status de Case** (picklist real, 6 valores): `Aberto` (default) → `Em Atendimento` → `On Hold` →
`Em Análise` → `Pendente` → `Closed`. É uma máquina de estado rasa (nenhum status intermediário de
"aguardando cliente" separado de "aguardando interno", por exemplo), consistente com o Pipe manter seu
próprio `status_atendimento` mais granular e não tentar espelhar 1:1 o de cada org de cliente.

**O que muda no Pipe:** nada de novo, produção confirma a recomendação de RecordType/fila/etiqueta por
processo, nunca por pessoa (item 7 do "O que aplicar", abaixo).

### 7.3 Filas: 11, quase as mesmas do sandbox

`Group` com `Type = 'Queue'`: **11** filas, mesmos 11 nomes do sandbox (`Casos Paulo Cuenca` e as 3
variantes de nível, `Closer de Vendas`, `Fila de Atendimento - ISaEx`, `Gestão de Clientes`,
`Leads Raul Sena`, `Caso de serviço`, `Suporte AUVP`, `Suporte AUVP Investimentos`). **Confirma**
exatamente.

`QueueSobject`: **12** vínculos, mesma distribuição do sandbox exceto **Case com 6 em produção contra
5 no sandbox** (um vínculo de fila a mais que o sandbox não tinha copiado): `Case` (6), `Lead` (3),
`GestaoClientes__c` (1), `PatrimonioOrientado__c` (1), `MessagingSession` (1, a fila de atendimento
omnichannel).

### 7.4 Atribuição e escalonamento: confirma o quase-vazio

`AssignmentRule`: **1** regra no org inteiro, para `Case` (`Atendimento Escola`), **inativa**.
**Confirma exatamente** o número do sandbox. O roteamento real continua acontecendo por Flow, não pela
ferramenta declarativa nativa para isso.

**Regra de escalonamento (`Escalation Rules`)**: **não pôde ser consultada por SOQL/REST**. Diferente
de `AssignmentRule`, o Salesforce não expõe um objeto (`sObject`) de escalonamento na API REST/Tooling
(confirmado consultando a lista completa de objetos da org, `/sobjects`, e testando o nome; nenhum
`EscalationRule`/`CaseEscalationRule` existe como tipo consultável). Só é recuperável via **Metadata
API** (retrieve do tipo `EscalationRules`, sessão SOAP), fora do padrão simples de REST usado neste
levantamento. Registrado em "Não executei", não é recusa por alçada, é limitação técnica da via
escolhida.

**O que muda no Pipe:** nada muda na recomendação (regra de fila como camada declarativa própria,
seção 2.1); a limitação só significa que "quantas regras de escalonamento existem" fica sem resposta
numérica nesta rodada.

### 7.5 Entitlement e Milestone: o SLA nativo existe pela metade

**Confirma o "não usado" do sandbox, com um detalhe novo**: `Entitlement` = **0** registros,
`EntitlementTemplate` = **0**, `CaseMilestone` (instância de prazo aplicada a um caso) = **0**. Mas
**`MilestoneType` (o molde, "que tipo de prazo existe") tem 4 registros configurados**, que o sandbox
não media:

- `Primeira resposta` (sem recorrência)
- `Resolver em` (sem recorrência)
- `Acompanhar` (recorrência independente)
- `Atualização periódica` (recorrência encadeada)

Ou seja: alguém desenhou os **tipos** de prazo de SLA (o molde), mas nunca ligou isso a um
`Entitlement`/`SlaProcess` ativo nem a nenhum Case real. É uma peça pela metade: o vocabulário existe,
o motor que aplicaria relógio a um caso nunca foi ativado.

**O que muda no Pipe:** isso é a validação mais direta do par `regra_sla`/`horario_atendimento`
(§4.4 do design). O Salesforce nativo já separa corretamente "o que foi contratado" (Entitlement),
"o tipo de prazo" (MilestoneType) e "o prazo aplicado a este caso" (CaseMilestone) em três entidades, e
mesmo assim a AUVP não conseguiu operacionalizar isso: só desenhou o meio (o tipo), nunca o contrato
nem a instância. **O risco a evitar no Pipe não é o modelo de dado (que está certo), é deixar o SLA
existir só como configuração nunca ligada** exatamente como aconteceu aqui.

### 7.6 Regras de validação: 25, confirma a escassez, com uma no Lead

`ValidationRule` via Tooling API: **25** no org inteiro (sandbox: 23), **21 ativas, 4 inativas**.
**Nenhuma em Case** (confirma o sandbox). Diferente do sandbox, produção tem **1 em Lead**
(`AUVPSeguros_MotivoDesqualObrigatorio`, ativa) — pequena correção, mas não muda a conclusão. Por
objeto: `Opportunity` (9, 7 ativas), `GestaoClientes__c` (4, 3 ativas), `PatrimonioOrientado__c` (3),
`Reuniao__c` (2), `Account` (1, inativa), `Lead` (1), `Fila_de_Atendimento__c` (1),
`Relacionamento__c` (1), `Faixa_de_Brinde__c` (1), e 2 em objetos do pacote Marketing Cloud (`et4ae5`).

**O que muda no Pipe:** nada, confirma a recomendação de separar "regra simples" (ValidationRule) de
"automação geral" (Flow) como camadas distintas e visíveis.

### 7.7 Perfis e permission sets: mais numerosos em produção

`Profile`: **38** no total (sandbox: 36). Além do padrão "Usuário - <Área>" já visto, produção revela
**mais dois exemplos do mesmo antipadrão de perfil vazio/duplicado**: `Usuário Padrão Vazio` (par do já
conhecido `Novos Negócios Vazio`) e um par `FormETFsProdutosAUVP Perfil` / `FormETFsProdutosAUVP
Profile` (o mesmo perfil, nomeado uma vez em português e uma em inglês, quase certamente duplicata por
engano). `AvaliacaoEntrega Perfil` é mais um perfil de propósito único e estreito.

`PermissionSet` (`IsOwnedByProfile = false`): **238** no total (sandbox: 224) — **115 sem namespace**
(próprios da org, sandbox tinha 114) e **123 de pacotes gerenciados** (sandbox tinha 110).
`PermissionSetGroup`: **23**, **confirma exatamente** o número do sandbox.

**O que muda no Pipe:** reforça o achado do sandbox (perfil por departamento é caro e usado em excesso;
permission set granular já é o padrão adotado, mas cresce sem tela de auditoria) e adiciona um exemplo
concreto do custo de manter perfil por nome livre: duplicata por grafia (`Perfil` vs `Profile`) sobrevive
em produção porque nada barra a criação de um perfil com nome quase igual a outro.

### 7.8 Layout: números idênticos onde o sandbox media, mais um objeto novo

`Layout` via Tooling API: **Case 7**, **Lead 10**, **Account 1** — os três **idênticos** ao sandbox.
**Opportunity 6** (não medido no sandbox). Confirma a leitura da seção 2.4: layout como proxy de
"quantos processos diferentes" segue o mesmo padrão em produção.

### 7.9 External ID e campos únicos: já existe, e é o achado mais valioso desta rodada

Esta é a correção mais importante ao documento anterior. A seção 5.4 registrava que, depois da
migração de org (`asupernova` → `auvp`), o único campo que sobreviveu para casar registro antigo com
novo foi `Subject` (texto livre, já causou duplicata), e recomendava que o Pipe gravasse desde o início
um campo próprio marcado como **External ID**. **Produção já tem isso, hoje, em quatro dos cinco
objetos medidos**:

| Objeto | Campos External ID | Campos únicos (`unique`) |
|---|---|---|
| Lead | `Bext_Deal_Id__c`, `Formsort_Responder_Uuid__c`, `Legacy_Id__c`, `BSUID__c`, `Telefone_E164__c` | os 4 primeiros |
| Opportunity | `Bext_Deal_Id__c`, `Legacy_Id__c` | os 2 |
| Account | `ID_do_Cliente_ISaEx__c`, `Legacy_Id__c`, `BSUID__c` | só `Legacy_Id__c` |
| Case | `Legacy_Id__c` | `Legacy_Id__c` |
| Contact | nenhum | nenhum |

`Legacy_Id__c` existe em Lead, Opportunity, Account e Case: é quase certamente o campo criado
especificamente para resolver a própria migração de org que a seção 5.4 descreve, o que quer dizer que
**a AUVP já tinha a peça certa disponível** quando precisou casar registro antigo com novo, e mesmo
assim o `case-sync` (seção 5.1) usa a cascata telefone → CPF/CNPJ → e-mail, não `Legacy_Id__c`/upsert.
O problema documentado na seção 5.4 não é "falta o campo", é **"o campo existe e o pipeline não o usa
como chave principal"**. `Contact`, sem nenhum campo de External ID, é o único dos cinco sem essa
proteção.

**O que muda no Pipe:** a recomendação do item 6 ("gravar o Id do Pipe como External ID desde a
primeira escrita") continua certa, mas o exemplo real muda de "criar o campo que falta" para "criar o
campo E o hábito de usá-lo por upsert desde o primeiro sync", porque a org de referência mostra que ter
o campo sem o hábito de usá-lo já aconteceu uma vez e não resolveu o problema de duplicata sozinho.

---

### Comandos executados

Todos via REST/Tooling API do Salesforce, autenticados por JWT Bearer Flow (chave privada do App
`Interno_Capital`), contra a org resolvida pelo `instance_url` do próprio token (`auvp.my.salesforce.com`).
Nenhum comando abaixo leu, criou, alterou ou apagou registro de negócio ou metadado.

1. `POST /services/oauth2/token` (grant_type `jwt-bearer`) — autenticação.
2. `SELECT COUNT() FROM EntityDefinition` — total de entidades no org.
3. `GET /sobjects/{Lead,Opportunity,Account,Case,Contact}/describe` — total e customizado por objeto
   (via flag `custom` de cada campo), RecordTypeInfos, picklist de Status, External ID e campos únicos.
4. `SELECT QualifiedApiName FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '<objeto>'`
   — checagem cruzada da contagem de campos por objeto (para os mesmos cinco objetos).
5. `SELECT SobjectType, IsActive FROM RecordType` e `SELECT Name, DeveloperName, IsActive FROM
   RecordType WHERE SobjectType = 'Case' ORDER BY IsActive DESC, Name` — RecordTypes por objeto e
   detalhe de Case.
6. `SELECT Id, Name FROM Group WHERE Type = 'Queue'` — filas.
7. `SELECT QueueId, SobjectType FROM QueueSobject` — vínculo fila-objeto.
8. `SELECT SobjectType, Name, Active FROM AssignmentRule` — regras de atribuição.
9. Tentativa de `SELECT ... FROM AutoResponseRule` e `SELECT ... FROM SlaProcess` (Tooling API) —
   ambos recusados pela API com `INVALID_TYPE` (tipo não suportado via SOQL/Tooling).
10. `SELECT COUNT() FROM Entitlement`, `SELECT COUNT() FROM EntitlementTemplate`, `SELECT COUNT() FROM
    EntitlementContact`, `SELECT COUNT() FROM ProductEntitlementTemplate`, `SELECT COUNT() FROM
    EntityMilestone`, `SELECT COUNT() FROM QueueRoutingConfig` — todos zero.
11. `SELECT COUNT() FROM CaseMilestone` — zero.
12. `SELECT Name, RecurrenceType FROM MilestoneType` — os 4 moldes de prazo configurados.
13. `SELECT Id, ValidationName, Active, EntityDefinitionId FROM ValidationRule` (Tooling API) — regras
    de validação, seguido de `SELECT DurableId, QualifiedApiName FROM EntityDefinition WHERE DurableId
    IN (...)` para resolver os `EntityDefinitionId` numéricos em nome de objeto.
14. `SELECT COUNT() FROM Profile` e `SELECT Name FROM Profile ORDER BY Name` — perfis.
15. `SELECT COUNT() FROM PermissionSet WHERE IsOwnedByProfile = false`, com filtro adicional por
    `NamespacePrefix = null` / `!= null` — permission sets próprios vs. de pacote.
16. `SELECT COUNT() FROM PermissionSetGroup` — grupos de permission set.
17. `SELECT Id, Name FROM Layout WHERE EntityDefinitionId = '<objeto>'` (Tooling API) — Case, Lead,
    Account, Opportunity.
18. `GET /sobjects` (global describe) — lista de todos os sObjects da org, usada só para confirmar que
    não existe tipo consultável de regra de escalonamento (`Escalation`) nem de resposta automática.

### Não executei

- **Regras de escalonamento (`EscalationRules`)**: não são um `sObject` consultável por SOQL/REST nem
  Tooling API nesta org (confirmado pela lista completa de `sobjects` e por duas tentativas de nome
  recusadas com `INVALID_TYPE`). Só seriam recuperáveis via **Metadata API** (retrieve SOAP do tipo
  `EscalationRules`), que decidi não implementar nesta rodada por ser uma via bem mais pesada (sessão
  SOAP, `package.xml`, job assíncrono de retrieve) para um único número; isso é limitação de método, não
  recusa por alçada, porque um retrieve de metadado também seria leitura pura.
- **`SELECT` em qualquer objeto com dado de cliente** (Lead, Contact, Account, Case, Opportunity e
  qualquer objeto customizado que os referencie): fora do alçado por instrução explícita, mesmo que só
  para `COUNT()`.
- **Qualquer `create`, `update`, `delete`, `deploy` ou chamada de Metadata API de escrita**: não
  cogitado.
- **External ID / campos únicos além dos cinco objetos já medidos em todo o resto do documento** (os
  ~70 objetos customizados da seção 1.3, por exemplo): levantar isso exigiria `describe` de cada um dos
  1346 `EntityDefinition` da org, custo que não se justificava para responder ao pedido, que era sobre
  os objetos centrais de atendimento e vendas.

---

## O que aplicar no Pipe

Em ordem de valor. Mudança de interface primeiro, porque foi o que o dono reprovou; mudança de dado
depois; integração ao final.

### Mudança de interface

1. **Header de três camadas, com números de referência.** Barra de aplicativo (marca + seletor) →
   barra de módulo horizontal com poucos itens (o Salesforce mede 40px e 7 itens; a Blip usa 5) →
   Configuração como tela própria com o seu lateral. Cromo fixo total de referência: 90px
   (Salesforce), suficientemente enxuto para não competir com o conteúdo.
2. **Esconder item que não funciona.** As três referências medem 0% de item desabilitado visível; o
   Pipe mede 83% hoje. É a mudança de maior retorno visual por menor esforço: remover do menu, não
   escurecer.
3. **Reduzir a tela a dois tamanhos de fonte dominantes** (o Salesforce usa 13px e 12px para 98% do
   texto de uma tela; a Blip usa 16/14/12). O resto é exceção contada a dedo (`MARCA.md` já registra
   isso; reforçar com o número do Salesforce).
4. **Uma cor de destaque, estado como trio, e estado ocupando menos de 1% da tela**, replicando o
   padrão medido nas duas referências independentes.

### Mudança de dado

5. **Nunca deixar objeto de negócio virar depósito de pergunta de formulário.** Confirmado aqui que
   não é só o Lead: Opportunity (81% customizado) e Account (64%) sofrem do mesmo padrão nesta org. A
   decisão do Pipe (`resposta_formulario` como linha) precisa valer para todo objeto que capta
   formulário, não só o Lead.
6. **Identificador externo desde a primeira escrita**, nunca casamento por texto livre depois. A
   migração de org da AUVP mostrou o custo de casar por `Subject`; o Pipe deve gravar seu próprio Id
   como External ID no Contact e no Case do cliente desde o primeiro sync.
7. **Fila, RecordType e etiqueta nomeados por processo de negócio, nunca por pessoa ou campanha.** 8
   dos 18 RecordTypes de Case desta org já morreram porque nomeavam criador de conteúdo, não processo.
8. **Perfil por departamento é antipadrão quando a granularidade real é por capacidade.** O Pipe já
   decidiu certo (permissão como lista de capacidades nomeadas); manter, e não deixar a lista de
   permissões crescer sem uma tela que mostre o efetivo por usuário.
9. **Regra de fila e regra de validação como camada declarativa própria**, separada da automação
   geral. A AUVP tem só 1 AssignmentRule (inativa) e 23 ValidationRules no total, tudo empurrado para
   Flow; o Pipe já separa `regra_fila`/`core` de `workflow` no design, e vale manter essa fronteira
   visível também para quem configura, não só no código.

### Integração

10. **JWT Bearer Flow com Connected App por tenant**, chave/certificado próprio, nunca login
    interativo nem credencial compartilhada entre clientes; resolver o endpoint sempre pelo
    `instance_url` devolvido no token, nunca fixo no código.
11. **REST síncrono para o caso a caso, Bulk API para volume, Composite para operação em cadeia,
    Platform Events/CDC para o caminho de volta.** A org de hoje só usa REST síncrono; para 104 mil
    tickets por período isso é a rota mais cara das quatro.
12. **Entitlement + Milestone como validação do desenho de SLA que o Pipe já tem em §4.4**: manter
    "o que foi contratado" e "o prazo deste caso" como duas entidades, como o Salesforce já faz.
