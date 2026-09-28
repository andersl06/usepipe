# Capturas ao vivo F-1..F-6 — Builder da Blip (AUVP Capital [DEV])

**Data:** 2026-09-28. **Quem:** orquestrador, no Chrome do dono, com autorização dele ("pode pegar no dev").
**Como:** `getBoundingClientRect`/`getComputedStyle`, incluindo o shadow DOM dos componentes `bds-*`. Janela CSS de 1707×842 com `devicePixelRatio` 1,125. Por isso as bordas aparecem como 0,89 px, que é 1 px físico: use **1px** no Pipe.
**Edição no DEV:** um bloco "Novo bloco" descartável foi criado para ver os estados de erro e depois **excluído**; o rascunho voltou a "Salvo". Nada foi publicado, nenhum teste rodado e nenhuma fila criada, excluída ou alternada.
**Achado lateral:** a última versão publicada do fluxo DEV é de **30/07/2026 16:32**. O clique em "Testar fluxo em construção" de 2026-09-27 **não publicou** o rascunho.

Estas medidas têm precedência sobre os valores marcados [A] em `FIDELIDADE-F1-F6.md`.

## F-1 — Condições de saída (bloco `ccpf100_menu`, 2 saídas)

| Peça | Medida |
|---|---|
| Título da seção | "CONDIÇÕES DE SAÍDA" 16px/700, maiúsculas, com ícone (i) |
| Contador | "2/25" 12px/400, alinhado à direita |
| Card (`output-condition-card` > `div.condition-wrapper.pa3`) | padding 10px, sem fundo próprio; largura útil 341px |
| Linha "Se" + "Condição" | dois `bds-select.reduced-blip-select.w-50`, cada um **155×56**, com **10px** de espaço entre eles (flex) |
| Caixa do select | `div.input`: padding **7px 4px 7px 12px**, borda **1px rgba(255,255,255,.2)**, raio **8px** |
| Rótulo interno ("Se", "Condição", "Ir para") | dentro da caixa, acima do valor: **12px/700**, line-height 18px, branco |
| Valor | `input` **14px/400**, line-height 22px, branco |
| Seta do select | ícone 20×20 à direita |
| "+" entre condição e "Ir para" | `bds-icon.more-conditions` **25×26**, círculo (raio 100%), fundo **#393939**, centralizado |
| Lixeira da saída | `bds-button-icon` 30×30, raio 50%, padding 3px, ícone `delete`, à direita da linha "Se/Condição" |
| Alça de arrasto | à esquerda do card (⠿), fora da caixa |
| "Ir para" | um campo na largura toda do card (mesma caixa de 56px, rótulo interno "Ir para") |
| Divisor entre saídas | "OU" **16px/700** centralizado, com linha fina dos dois lados; bloco de 24px de altura |
| Abas do painel do bloco | itens de 46px de altura; ativa com sublinhado **2px rgb(73,139,255)** (azul → verde do Pipe), inativa com o texto em `rgb(82,99,108)` |

**Card inválido (V-F6-02):** o card inteiro ganha `div.output-card-container` com padding **5px**, borda **1px rgb(182,12,12)**, raio **10px**, fundo **#1f1f1f**. À esquerda, fora do card (left −28px, top 5px), aparece um ícone de informação 16px na cor **rgb(240,72,71)**.

**Saída padrão:** "SAÍDA PADRÃO" com (i), o texto "Defina para qual bloco o usuário será direcionado se nenhuma das condições forem cumpridas", o campo "Ir para" (valor "Exceções") e a nota "A seta que liga os blocos não será exibida".

## F-1 — Ações (bloco `ccpf100_menu`)

| Peça | Medida |
|---|---|
| Ordem da aba | primeiro **BIBLIOTECA DE FUNÇÕES**, com a etiqueta verde-escura "Novo", o texto "Crie e gerencie funções globais para serem chamadas sempre que necessário nos chatbots do seu contrato" e os botões "Gerenciar funções" (ghost com ícone) e "Criar função" (primary com ícone). Depois AÇÕES DE ENTRADA e AÇÕES DE SAÍDA |
| Cabeçalho de seção | "AÇÕES DE ENTRADA" 16/700 com (i), contador "1/15" à direita, texto "Inclua ações que serão executadas **antes do envio do primeiro conteúdo**" (trecho em negrito), link sublinhado "Entenda como funcionam as ações de entrada" |
| Linha "Selecionar todos" | checkbox + texto à esquerda; **"Colar ação" com contorno** (secondary) à direita |
| Linha de ação | `div.pointer.flex` 362px de largura, **40px** com título de uma linha e **52px** com duas linhas; checkbox, ícone do tipo **24×24** (`bds-icon.anchor-icon`), título **14px/400** line-height 21 (até 2 linhas, `w-80 ml2`) e menu **⋮** (`bds-button-icon`, ícone `more-options-vertical`, 40×40) à direita |
| Ação inválida | chip **"Erro"** `bds-chip-tag` danger: 47×24, raio 12, padding 0 4px, fundo **rgb(123,61,61)**, texto **12px/700** branco; fica à esquerda do ⋮ |
| Botão "Adicionar ação de entrada" | largura total, fundo branco, texto escuro |
| Divisores | linha fina entre as seções |
| Seletor de nova ação | painel próprio à esquerda do painel do bloco, título "ADICIONAR AÇÃO DE ENTRADA" + X; grupos Consultar (Assistente de conteúdo), Executar (Selecionar função da biblioteca, Redirecionar para serviço, Executar script, Executar script 2.0, Processar comando), Integrar (Requisitar HTTP), Manipular (Definir variável, Gerenciar lista de distribuição, Registrar eventos…) |

## F-2 — Configuração ("Configurações gerais")

- Painel direito 460×674, `top/right 16px`, raio 16, fundo #1f1f1f. O título é **"Configurações gerais"**.
- Abas **Variáveis | Versões | Ações globais**, cada item com 46px de altura e sublinhado de 2px na ativa. A aba padrão é Variáveis.
- **Variáveis:** 8 seções recolhíveis, com chevron à esquerda e título em maiúsculas:
  1. CONFIABILIDADE DE IA: "Defina o percentual de confiabilidade de uma intenção para ser considerada uma resposta válida.", com slider e valor "50%" abaixo, em azul.
  2. TRACKING AUTOMÁTICO: switch 42×24 na linha do título. Texto: "Executar automaticamente uma ação de registro de eventos para todo bloco do fluxo. A categoria dos eventos registrados é 'flow' e a ação é o nome de cada bloco."
  3. UTILIZAR CONTEXTO DO ROTEADOR: switch na linha do título. Texto: "Executa ações e comandos em nome do roteador. Desta forma as variáveis de contexto, dados do contato, atendimento humano, análise, recursos e inteligência artificial utilizados por este bot virão do roteador. Válido somente para mensagens encaminhadas por um roteador. Esta configuração também pode sobrescrever o valor definido na configuração 'Proprietário do contexto' se presente."
  4. EXPIRAÇÃO DA SESSÃO: "Tempo em segundos de expiração da sessão dos usuários em caso de inatividade. Em caso de expiração da sessão, o usuário volta para o estado inicial do fluxo. Se este valor não estiver definido, a expiração não ocorre." Campo com rótulo interno "Expiração da sessão".
  5. TEMPO LIMITE DE AÇÕES: "Tempo em segundos padrão para limitar a execução de cada ação. Se não especificado, o padrão é 30 segundos. Está limitado tempo limite global de processamento de uma mensagem, de 60 segundos." Campo "Tempo limite de ações".
  6. IDENTIFICADOR DO FLUXO: "Identificador único do fluxo. As sessões do usuários ficam associadas a este identificador. Se alterado, todas as sessões de usuário são redefinidas." Campo "Identificador do fluxo" e o link/botão "Redefinir identificador do fluxo".
  7. VARIÁVEIS DE CONFIGURAÇÃO: "Para mostrar as informações da consulta no fluxo, utilize: {{config.VariableName}}". Linhas chave-valor, com os campos "Variável" e "Valor" (`blip-input-dpr`, 160×56 cada), e o botão tracejado "+ Adicionar informações extras" (60px).
  8. VARIÁVEIS SENSÍVEIS: "Para utilizar as informações sensíveis no fluxo, utilize {{secret.VariableName}}" e "Valores suprimidos. Caso queira apenas alterar o valor, insira novamente no campo destinado. Caso queira alterar o nome da chave, ajuste o nome e também reinsira o valor desejado.", com "+ Adicionar informações extras".
- **Versões:** itens em lista, cada um com ícone e texto: "Carregar fluxo" (upload), "Baixar fluxo" (download), a nota "(i) Baixar o fluxo e as configurações de ações globais." e "Restaurar versão" (histórico). Depois a seção recolhível **VERSÕES PUBLICADAS**, com o texto "Confira o histórico de versões publicadas do seu fluxo" e **10 cards**:
  - `bds-paper` 383×96, padding **24px 16px 24px 24px**, raio **16**, fundo **#393939**, sombra `0 6px 16px -4px rgba(0,0,0,.16)`;
  - à esquerda, a data "30/07/2026 - 16:32:52" em negrito e o autor abaixo;
  - à direita, três botões-ícone 40×40: `edit` (primary), `restore` (secondary) e `download` (secondary).
- **Ações globais:** BIBLIOTECA DE FUNÇÕES com "Novo", depois AÇÕES DE ENTRADA 0/15 e AÇÕES DE SAÍDA 0/15. Os textos e o layout são os da aba Ações do bloco. Na saída: "Inclua ações que serão executadas **após o envio do último conteúdo ou resposta do usuário**" e "Entenda como funcionam as ações de saída".
- **Convivência (V-F2-07):** abrir a Biblioteca com a Configuração aberta **não fecha** a Configuração. Os dois painéis ficam abertos, um de cada lado.

## F-3 — Biblioteca de variáveis

- Painel **à esquerda**: `bds-grid.library-sidebar.left-entrance-animation`, 460×674, `left/top 16px`, raio 16, fundo #1f1f1f, sombra `32px 0 56px 32px rgba(0,0,0,.5)`, com o X no canto superior direito.
- Abas **"Biblioteca de variáveis" | "Minhas variáveis"**, com 46px de altura e sublinhado de 2px na ativa.
- A busca é um `bds-input` de 383×42, com ícone de lupa e placeholder "Digite um nome ou tema para buscar variáveis". Os demais valores do input seguem a V-F4-01.
- **Lista da Biblioteca:** 118 variáveis de sistema da Blip. A contagem de 236 `li` inclui as duas abas. Cada `li.pv3.ph4` tem 383×103, padding 10px 20px, e as linhas alternam fundo **#141414** e **#1f1f1f**. O nome aparece acima da descrição, e a descrição vem em texto menor e pode ter várias linhas. Exemplos, na ordem: agent.email, agent.firstName, agent.fullName, agent.identity, agent.phoneNumber, aiAgent.*, aiAnswers.*, application.*, bucket.?, calendar.*…
- **Copiar:** no hover da linha aparece o botão-ícone `copy` 40×40 **logo à direita do nome**. No clique o botão fica com fundo ativo e aparece um tooltip claro **"Copiado!"** à direita. Não há toast.
- **Busca sem resultado:** a linha discreta "Nenhuma variável encontrada", em texto pequeno e cinza, sobre uma faixa um pouco mais clara.
- **Minhas variáveis:** só o nome, sem descrição, em ordem alfabética. Linhas de 60px, com o mesmo padding e a mesma alternância de cor.

## F-4 — Busca (lupa)

- A caixa é `bds-paper.search-wrapper`: **440×66**, padding **10px**, raio **8px**, fundo **#141414**, sombra `0 2px 8px -2px rgba(0,0,0,.16)`, gap 10px. Ela flutua junto à pílula, na altura do botão da lupa, e o botão da lupa vira **X** com o tooltip "Fechar".
- O input tem 368×42: padding 8px 4px 8px 12px, borda 1px rgba(255,255,255,.2), raio 8, lupa 20px à esquerda e placeholder "Pesquisar". Em foco, a borda fica 1px rgb(73,139,255) e ganha um anel `0 0 0 2px rgb(0,79,86)`.
- À direita do input fica o botão-ícone (i). No hover ele mostra um tooltip claro com as linhas "Para facilitar a pesquisa, use:", "title: Início", "tags: valor", "content: valor", "actions: valor" e "output: valor".
- **Termo que casa:** os blocos que não casam recebem a classe `no-match-node` e **opacidade 0,2**; os que casam ficam em opacidade 1. **Todas as setas** (`.jtk-connector`) ficam com `display:none`. Cada nó recebe a classe `on-search`.
- **Termo sem resultado ("zzzz"):** nada muda; o canvas fica intacto, com setas.
- **Fechar pelo X da pílula com termo:** fecha a caixa, **limpa o termo** e restaura blocos e setas.

## F-5 — Gerenciamento de filas

- O botão da pílula tem o tooltip "Gerenciamento de Filas". Ele abre o painel direito "**Gerenciamento de filas**", com o f minúsculo, depois de um spinner central.
- O painel tem 460×674, `top/right 16px`, raio 16, fundo #1f1f1f. O corpo tem padding **24px 32px**. O título é um input readonly de 16px, com padding 0 50px 5px 0.
- **Linha de busca:** input com lupa (319×48 na linha, placeholder "Pesquisar") e botão-ícone **primary 48×48 com "+"**. Espaçamento de 16px abaixo. A busca **só filtra ao apertar Enter**; com termo aplicado, o "+" vira **X** (primary), que limpa.
- **Card de fila:** `bds-paper.output-card-container.mb3`, com 383×91, raio 8, fundo **#393939**, sombra `0 2px 12px rgba(96,123,153,.15)` e padding **20px**.
  - Rótulo "Fila de Atendimento" em **12px/400 rgb(148,148,148)**, line-height 25.6.
  - Nome em **16px/700** branco.
  - À direita, um `bds-switch` 50×24 com padding-left 8.
  - No hover aparece, à esquerda do switch, o lápis "Editar fila" seguido de um divisor vertical. A área `.actions` tem opacidade 0→1, `border-right 2px rgb(140,160,179)` e 29px de altura.
- **"+" (criar):**
  - cabeçalho com seta de voltar e **"CRIAR NOVA FILA"**, 16px/700 em maiúsculas;
  - linha `hr`;
  - "Dê um nome para essa fila de atendimento";
  - input 396×40 com placeholder "Nome da fila";
  - à direita, os botões **Cancelar** (ghost, 91×56) e **Confirmar** (primary, 56 de altura, apagado enquanto o nome está vazio).
- **Busca sem resultado:** ilustração grande de balão triste, depois **"Fila não encontrada :("** em negrito e "Não há filas cadastradas com este nome".
- **Editar (modo regras):**
  - cabeçalho com seta de voltar, o nome da fila ("Wealth") e um lápis; a **lixeira não aparece**, o que confirma o bug do template da Blip;
  - linha `hr`;
  - busca + botão primary "+";
  - card de regra com o rótulo "Nome da regra", o nome ("Regra 9") e um switch;
  - rodapé **"Exibindo 1 de 1"** centralizado em negrito.

## F-6 — Erros

- **Nó inválido** (bloco com saída sem "Ir para"): classe `invalid-node`, fundo **rgb(123,61,61) (#7b3d3d)** e o ponto de saída vermelho. Com o nó selecionado ou em edição, aparece um anel `box-shadow 0 0 0 4px rgb(182,12,12)`.
- **Card inválido e ação inválida:** ver as seções F-1 acima (borda de 1px rgb(182,12,12) no card, ícone rgb(240,72,71) e chip "Erro" #7b3d3d).
- **Abas do painel:** não apareceu marcador de erro na aba "Condições de saída", nem com ela inativa e o card inválido. O "9px dot" do relatório não foi confirmado nesta versão, então **não implementar** sem nova evidência.
- **Toast:** não medido. O "Colar" no canvas com texto fora do formato pediu acesso à área de transferência e o aviso sumiu antes da medida. Publicar com erro não foi testado, para não arriscar publicar o rascunho de DEV. Os valores do toast ficam os do código em `FIDELIDADE-F1-F6.md`.

## Menu "Novo bloco" (referência extra)

O menu tem o título "NOVO BLOCO" e o X, com os itens Padrão, Humano, Pagamento (etiqueta "Novo"), Catálogo, Biblioteca de blocos e Subfluxo, cada um com ícone. O bloco novo já abre o painel na aba Conteúdo, com "0/25", "Entrada do usuário >", "Aguardando resposta do usuário (Alterar)" e a barra de conteúdo Texto | Quick reply | Imagem | Carrossel | Menu | ⋯, seguida do link "Entenda como funcionam os tipos de conteúdo".

## Menu de contexto do bloco (referência extra)

Duplicar, Copiar, Copiar id, Excluir.
