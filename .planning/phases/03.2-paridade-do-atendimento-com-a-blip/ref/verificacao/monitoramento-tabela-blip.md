# Tabela do Monitoramento detalhado na Blip: estrutura e medidas

**Base:** medido ao vivo em 2026-10-01 no bot dev, só leitura. Viewport 1707 px CSS, DPR 1,125. [M] medido; [A] estimado da captura.
**Arquivos brutos (fora do Git):** `2026-10-01-monitoramento-detalhado-atribuido.html`, `-monitoramento-aguardando.html`, `-medidas-monitoramento-*.json`, screenshots `2026-10-01-monitoramento-*.jpg`.

## Cartão "Monitoramento detalhado"
- Cartão `#f6f6f6` com título "Monitoramento detalhado" e, à direita, busca "Buscar pelo Nº do ticket".
- Abas: **Atribuído/Em andamento**, **Aguardando atendimento**, **Atendentes**, **Filas**, **Tags**. A aba ativa tem sublinhado azul.
- Dentro do cartão a tabela é um bloco branco: **fundo branco `#ffffff`, raio 8, borda 1px `rgba(0,0,0,.06)`**, sem sombra [M]. Largura 1327, altura 197 com 3 linhas [M].
- Abaixo: "Resultados por página" (seletor, 250 nas capturas) + "1-3 de 3" + 4 botões de página; e um aviso em amarelo: "O destaque amarelo sinaliza que um ticket foi atribuído a um atendente, mas o contato ainda não recebeu a primeira resposta." (ícone de informação, fundo amarelo, só na aba Atribuído) [A].

## Aba Atribuído/Em andamento
- Colunas, todas de **largura igual** (~165,6 cada em 1327): **Tempo na fila · Tempo de 1ª resposta · Tempo de atendimento · Ticket · Contato · Fila · Atendente · Ações** [M].
- Cabeçalho: linha de 48,4 de altura, fundo da tabela (branco); título centralizado nas colunas de tempo e Ticket e à esquerda em Contato, Fila e Atendente; coluna ordenável (`th_cell--sortable`) [M].
- Linha: 48,9 de altura, clicável, **sem fundo próprio e sem zebra**, célula com padding `0 8px 0 16px`, texto 14 px `#282828` [M]; separador fino entre linhas [A].
- Células: tempos e **ticket em texto simples, centralizados** ("#27", sem botão); **Contato** à esquerda com ícone de pessoa (16x16) + nome; Fila e Atendente em texto; **Ações** centralizado com 3 ícones de 20x20 sem caixa: transferir, balão de mensagem (Falar com atendente) e três pontos verticais (menu) [M].
- Realce amarelo: linhas de tickets atribuídos sem primeira resposta ficam destacadas em amarelo (a legenda existe; nenhuma linha estava destacada na captura).

## Aba Aguardando atendimento
- Colunas: **Tempo na fila · Prioridade · Ticket · Contato · Fila · Atendente · Ações** [M].
- Ações: 2 ícones de 20x20, **transferir** e **assumir** (check no círculo); sem três pontos. Prioridade em texto ("Sem prioridade"). A coluna Atendente mostra "Transferência direta" quando houve transferência para um atendente.

## Outras abas (só colunas, sem dados na captura)
- **Atendentes:** Atendente · Tickets em atendimento · Tempo médio de resposta · Tempo médio de atendimento · Ações.
- **Filas:** Fila · Tickets aguardando · Tickets em atendimento · Tempo médio de espera · Tempo médio de resposta · Tempo médio de atendimento.
- **Tags:** Tag · Tickets finalizados · Tempo médio de atendimento.

## Diferença para o Pipe (a corrigir)
O Pipe usa uma `mon-tabela` própria com colunas de largura variável, número do ticket como botão, texto "Aguardando..." na coluna de atendimento e ações em botões 40x40. A Blip usa tabela branca de raio 8 com colunas iguais, ticket em texto, ícones 20x20 sem caixa e abas por visão.

## Não medido e por quê
- Peso e tamanho exatos do texto do cabeçalho e a cor do separador: o componente aplica estilo por classe interna que o script não leu com precisão ([A]).
- Estado vazio das abas, carregando e erro, rolagem horizontal e larguras de outras janelas: sem captura.
