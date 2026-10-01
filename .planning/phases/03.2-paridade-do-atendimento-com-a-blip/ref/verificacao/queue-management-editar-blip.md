# Edição de fila na Blip (queue-management): estrutura e medidas

**Base:** medido ao vivo em 2026-10-01 no bot dev `auvpcapitaldev1`, só leitura (nada foi salvo). Viewport do navegador: 1707 px CSS de largura, DPR 1,125 (por isso a borda de 1 px sai como 0,889 px). [M] = medido ao vivo; [A] = estimado a partir da captura de tela.
**Arquivos brutos (fora do Git):** `referencias-blip/atendimento/03.2-capturas/2026-10-01-fila-lista.html`, `-fila-editar.html`, `-fila-editar-estrutura.txt`, `-medidas-fila-*.json` e screenshots `2026-10-01-fila-editar-*.jpg`.

## URL e navegação
- A lista e a edição ficam **na mesma URL**: `.../attendance/desk/queue-management`. Clicar no lápis de uma fila troca o conteúdo da página, sem mudar o caminho nem a query. (Decisão do dono em 2026-10-01: o Pipe segue essa URL, sem `/:id/edit`; o id da fila fica em estado ou em query do Pipe.)
- Cabeçalho da edição: seta de voltar, nome da fila e um lápis que renomeia no lugar (`edit-queue-name-button`).

## Lista de filas
- Título "Filas de atendimento", botão primário "+ Nova fila" à direita, campo "Buscar fila".
- Cada fila é um cartão: "Fila de atendimento" (rótulo pequeno) + nome em negrito; "Atendentes atribuídos" + número; à direita lápis, lixeira e interruptor (ativa/inativa). Lápis 40x40, interruptor da lista 42x24 [M].

## Página de edição (de cima para baixo, uma coluna de cartões)
Cartão = fundo `#f6f6f6`, raio 16, sombra `0 2px 8px -2px rgba(0,0,0,.16)`, padding 40, margem inferior 20 [M]; largura 1366,9 no viewport medido.

1. **Atendentes atribuídos** — "Defina os atendentes que irão atender nesta fila" (14 px, `#282828`); botão primário "+ Adicionar atendentes" (200x40, `#1e6bf1`, raio 8, padding 0 16, 14 px bold branco) [M]; busca "Buscar por nome ou e-mail" (386x42, borda 1px `rgba(0,0,0,.2)`, raio 8, padding 8 4 8 12) [M]; lista com paginação; estado vazio com ilustração, "Nenhum resultado encontrado" (20 px bold) e "Não encontramos nenhum resultado a partir da pesquisa realizada. Que tal refazer a sua busca?".
2. **Regras de Atendimento** — "Defina as regras de atendimento para a fila"; botão "+ Criar regra"; busca "Buscar regra"; cada regra é um cartão (1287x86, `#f6f6f6`, raio 16, padding 20) com "Nome da regra" + nome, lápis, lixeira e interruptor; rodapé "Resultados por página" (seletor, padrão 5) + "1-1 de 1" + 4 botões de página [M].
3. **Regras de Priorização** — "Defina a prioridade para todos os atendimentos da fila ou crie condições para a priorização"; botão "+ Criar regra"; estado vazio "Esta fila ainda não tem regras de priorização!" + "Crie uma regra para definir a prioridade de atendimento dos clientes."
4. **Tags da fila** — "Adicione ou edite as tags disponíveis para os atendentes desta fila."; campo de chips "Insira as tags separando por vírgulas" (1287x59, mesma borda e raio, rótulo de 12 px bold) [M]; botão "Salvar alterações" (146x40, `#1e6bf1`, desabilitado enquanto não há mudança).
5. **Encerramento automático de tickets** (cartão de 102 px de altura, padding 20): "Encerre automaticamente os tickets por inatividade" (14 px, `#595959`); interruptor alto 56x32, desligado `#8c8c8c`, raio 34 [M].

- **Não existe** opção de "fila padrão" nem cartão de dados de cor, capacidade ou ordem.
- Os cartões são empilhados com 20 px entre eles; a página tem rolagem própria; rodapé do Portal no fim.
- Os grupos **Comunicação** e **Regras** (e Preferências) que o dono citou são os grupos do **menu lateral** (Comunicação: Respostas prontas, Modelos de mensagens; Regras: Atendimento, SLA, Horários), não seções da edição da fila.

## Não medido e por quê
- Tipografia exata dos títulos dos cartões (aparecem ~20-24 px bold, [A]) e dos rótulos pequenos "Fila de atendimento"/"Atendentes atribuídos": estão em elementos dentro de componentes que o script não alcançou com precisão.
- Estados com atendentes atribuídos (a fila medida estava sem atendentes), erro, carregando e confirmação de excluir fila: sem captura.
- Modais "Adicionar atendentes" da fila e "Criar regra": não abertos nesta rodada (poderiam levar a gravar).
