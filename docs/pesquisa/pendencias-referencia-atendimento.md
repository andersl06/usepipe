# Pendências de referência — Atendimento

Registro do que não pode ser afirmado visualmente a partir de `supernova.blip.ai (23).zip`.
O ZIP contém o shell e os bundles, mas não serializa o DOM depois das interações nem respostas de API.

## Monitoramento

1. **Filtro rápido > Filas**
   - O bundle e o DOM medido comprovam a pílula e o papel de filtro.
   - Falta o estado aberto para confirmar largura, busca, seleção simples/múltipla e rodapé.
   - Captura necessária: abra **Atendimento > Monitoramento**, clique em **Filas** e envie screenshot + HTML com o popover aberto.

2. **Filtro rápido > Atendentes**
   - Falta o estado aberto e a confirmação visual de multiseleção.
   - Captura necessária: em **Monitoramento**, clique em **Atendentes** e envie screenshot + HTML antes e depois de selecionar dois atendentes.

3. **Filtro rápido > Contato**
   - O material não mostra se a busca ocorre enquanto digita ou após confirmação.
   - Captura necessária: em **Monitoramento**, clique em **Contato**, digite parte de um nome e envie screenshot + HTML dos resultados.

4. **Filtro rápido > Status do atendente**
   - As opções Online, Pausa e Invisível são comprovadas pelo bundle; o popover aberto não foi capturado.
   - Captura necessária: clique em **Status do atendente** e envie screenshot + HTML com as opções abertas.

5. **Ticket / Falar com atendente**
   - O bundle comprova `ThreadMessageSidebar`, mas não o conteúdo renderizado aberto.
   - Captura necessária: clique no número de um ticket e, separadamente, em **Falar com atendente**; envie screenshot + HTML de cada estado.

6. **Transferir**
   - O bundle comprova `TransferTicketModal`; campos, passos, textos e estados desabilitados não estão no ZIP.
   - Captura necessária: clique em **Transferir** num ticket, abra as escolhas de fila e atendente e envie screenshot + HTML de cada etapa.

7. **Menu de três pontos**
   - As opções dependem do estado do ticket e o ZIP não traz o menu aberto.
   - Captura necessária: abra o menu em um ticket aguardando e em um ticket atribuído; envie screenshot + HTML dos dois menus.

## Histórico

1. **Lista com resultados**
   - A captura original disponível mostra somente o estado vazio. As medidas de cartão vêm de DOM vivo e do padrão usado em outras telas.
   - Captura necessária: abra **Atendimento > Histórico** num período com tickets e envie screenshot + HTML da lista, incluindo rodapé/paginação.

2. **Detalhe do ticket**
   - A seta de detalhe é comprovada, mas o destino aberto não está serializado.
   - Captura necessária: clique na seta de um cartão do Histórico e envie screenshot + HTML do estado resultante.

3. **Enviar por e-mail / exportações**
   - O bundle contém `ExportTicketsCsvModal`, `ExportTicketsPdfModal` e termos de uso, mas não há estado aberto nem contrato equivalente no Pipe.
   - Captura necessária: selecione um ticket, clique em **Enviar por e-mail** e envie screenshot + HTML de todas as etapas, incluindo validação, confirmação e erro.

4. **Filtros rápidos abertos**
   - IDs dos tickets, Atendentes e Tags são comprovados fechados; conteúdo e comportamento abertos não.
   - Captura necessária: abra cada uma das três pílulas e envie screenshot + HTML; para Atendentes e Tags, inclua seleção múltipla se existir.

## Validação local

- O frontend foi validado por testes, typecheck e build.
- A automação de navegador abriu a aplicação em `http://127.0.0.1:3111`, mas recebeu a tela de login porque o contexto Playwright não herda a sessão autenticada do navegador do usuário.
- Nenhuma credencial foi solicitada, lida ou reutilizada. A inspeção autenticada fica pendente até existir um estado de armazenamento de teste próprio para o ambiente local.
