# Edição de fila na Blip: cartões e formulários internos (captura ao vivo)

**Base:** captura ao vivo em 2026-10-01 no bot dev `auvpcapitaldev1`, só leitura (nada foi salvo; ver "Alterações no bot dev" no fim). Viewport 1707x767, escala 100%. Fonte: Nunito Sans. Medidas marcadas [M] (medidas ao vivo); [B] = lidas do código/traduções do módulo de atendimento capturado (`portal-fragment-desk-mfe/main.js`), sem geometria. Sem nomes, e-mails ou telefones reais. Arquivos brutos (HTML com shadow roots, screenshots) ficam em `referencias-blip/atendimento/03.2-capturas/2026-10-01-fila-cartoes-*` (fora do Git).

## Regra geral: tudo acontece DENTRO da página, a URL nunca muda

A URL fica `.../attendance/desk/queue-management` do começo ao fim. Confirmado ao abrir a edição de uma fila e ao abrir cada formulário e modal. Não há navegação para "outro lugar":

| Ação | O que acontece na Blip |
|---|---|
| Lápis da lista de filas | A mesma página troca a lista pela edição da fila (seta de voltar + nome com lápis) |
| Adicionar atendentes | Abre um **modal** na própria página |
| Criar regra (Atendimento) | Abre um **formulário inline** dentro do próprio cartão |
| Criar regra (Priorização) | Abre um **formulário inline** dentro do próprio cartão |
| Tags da fila | Campo de chips no próprio cartão, com seu botão Salvar alterações |
| Encerramento automático | Interruptor no cabeçalho do cartão que expande o conteúdo no próprio cartão |

Isso responde diretamente ao que o dono apontou: no Pipe, "Adicionar atendentes" não pode levar para a Gestão de atendentes e "Criar regra" não pode levar para outra página.

## Cartão de base (os 5 são iguais) [M]

`bds-paper`: fundo `#f6f6f6`, raio 16px, sombra `0 2px 8px -2px rgba(0,0,0,.16)`, largura 1366,9, x=291 (coluna de conteúdo à direita do menu lateral), margem inferior 20px. Padding 40px nos cartões de Atendentes, Regras de Atendimento, Regras de Priorização e Tags; padding 0 no cartão de Encerramento (o conteúdo interno traz o próprio espaçamento). Cabeçalho do cartão: título 24px bold (`fs-24 bold`, cor `#282828`), subtítulo 14px regular (`fs-14`, cor `#282828`), ação principal à direita (`bds-button` sólido primário, tamanho médio, 40px de altura). Exceção: o título do cartão de Encerramento é 20px bold e o subtítulo `#595959`, e a ação é um interruptor.

Cores: texto `#282828`; texto auxiliar `#595959`; azul de ação `#1e6bf1` (a Blip), que no Pipe vira o token verde `--p-*`.

## 1. Atendentes atribuídos

- Título "Atendentes atribuídos"; subtítulo "Defina os atendentes que irão atender nesta fila"; botão **Adicionar atendentes** (`+` à esquerda, 200,1x40).
- Busca: campo com lupa, placeholder "Buscar por nome ou e-mail".
- Linha "Selecionar todos" (checkbox). Ao selecionar aparecem "Todos os registros foram selecionados" e o link "Limpar seleção" (presentes no DOM, escondidos até haver seleção).
- Cada atendente é uma linha-cartão: checkbox, avatar com iniciais (círculo colorido), coluna "Nome" (rótulo 12px, valor em negrito), coluna "E-mail" (rótulo 12px, valor em negrito), lixeira à direita (`trash`).
- Rodapé: "Resultados por página" (select; opções 5, 10, 15, 25, 50, 100, 250, 500), contador "1-3 de 3", primeira / anterior / página / próxima / última.
- Estado vazio e carregando: não capturados.
- A seleção em lote só habilita a ação de remover vários? **Não observado.** Só vimos "Selecionar todos", "Limpar seleção" e a lixeira por linha.

### Modal "Adicionar atendentes" (`bds-modal`, tamanho dinâmico) [M]

- Caixa 790px de largura, fundo `#f6f6f6`, raio 8, padding 32, sombra `0 8px 4px -4px rgba(0,0,0,.04), 0 12px 12px -4px rgba(0,0,0,.16)`; fundo da página escurecido; botão fechar (X) no canto superior direito; área de conteúdo 726px.
- Ilustração à esquerda (arte da Blip; **não copiar**: o Pipe usa arte própria).
- Título "Adicionar atendentes"; ajuda "Procure por seus atendentes para atribuí-los à fila".
- Interruptor "Inserção em massa" (alinhado à direita, desligado por padrão).
- Desligado: campo `bds-input-chips` com seletor, placeholder "Insira um ou mais e-mails dos atendentes"; abre uma lista com os e-mails de todos os atendentes do bot (ordem alfabética). Escolher adiciona um chip.
- Ligado (inserção em massa): o mesmo campo vira texto livre, com a ajuda (ícone de informação) "Insira os valores separados por vírgula".
- Botões no rodapé: **Cancelar** (texto) e **Atribuir** (sólido, desabilitado até haver pelo menos um e-mail).
- Fechar e Cancelar fecham o modal sem confirmação. Não se descobriu a validação de e-mail inválido (não foi digitado nada).

## 2. Regras de Atendimento

- Título "Regras de Atendimento"; subtítulo "Defina as regras de atendimento para a fila"; botão **Criar regra** (131,8x40, com `+`).
- Busca "Buscar regra".
- Cada regra é uma linha-cartão: rótulo "Nome da regra" (12px) e o nome (16px, bold); à direita três controles: lápis (editar), lixeira (excluir) e **interruptor** (regra ativa/inativa, ligado na fila vista).
- Rodapé: mesmo seletor "Resultados por página" e a mesma paginação ("1-1 de 1").

### Formulário inline "Criar regra" / "Editar regra" [M]

O cartão da lista é substituído, no mesmo lugar, por um formulário:

- Título do formulário = nome da regra com lápis para renomear no lugar. Nome padrão: "Regra {N}" (N = próximo número).
- Uma **condição** por linha: três campos lado a lado.
  - **Se** (select): Mensagem, Nome Contato, Email Contato, Extras Contato. Ao escolher "Extras Contato" aparece um campo extra com rótulo `Contact.Extras` (a chave do extra) abaixo do select, e o campo Valor passa a aceitar vários valores (chips).
  - **Condição** (select): Contém, Não contém, É igual, Não é igual. Padrão: Contém.
  - **Valor** (campo de texto, rótulo "Valor").
- Botão **Adicionar condição** (contorno, centralizado, com `+`). Cada condição adicionada aparece com recuo, precedida por um seletor de conector **E / OU** (padrão OU na primeira adição) com o texto "qualquer uma das condições abaixo" ao lado, e ganha um botão de remover (`delete`, círculo com traço) à direita.
- Rodapé do formulário: **Cancelar** (texto) e **Salvar** (sólido, desabilitado até o formulário ficar válido). Cancelar fecha sem confirmação.
- Tamanhos [M]: cartão do formulário 405,4 de altura com uma condição e 631,6 com duas; selects "Se" ~269 a 287 de largura e 55,8 de altura; seletor de conector 70x39,8.
- Não existe campo de "ação" ou "destino": a regra só tem nome + condições. A ação (atribuir à fila) é implícita.

## 3. Regras de Priorização

- Título "Regras de Priorização"; subtítulo "Defina a prioridade para todos os atendimentos da fila ou crie condições para a priorização"; botão **Criar regra**.
- Estado vazio: ilustração (arte da Blip, não copiar), título "Esta fila ainda não tem regras de priorização!" e texto "Crie uma regra para definir a prioridade de atendimento dos clientes." Cartão de 498,2 de altura com o estado vazio.

### Formulário inline "Criar regra de priorização" [M]

- Título editável "Nome da regra de priorização" com lápis (`bds-input-editable`).
- **Grau de urgência** (select): Baixa prioridade (valor 1000, padrão), Média prioridade (2000), Alta prioridade (3000).
- Checkbox **"Aplicar condições a esta regra de priorização"**. Desmarcado: a regra vale para todos os atendimentos da fila. Marcado: aparece o mesmo editor de condições da regra de atendimento (Se / Condição / Valor, **Adicionar condição**, conector E/OU).
- Rodapé: **Cancelar** e **Salvar**. Cartão de 317,4 de altura sem condições.

## 4. Tags da fila [M]

- Título "Tags da fila"; subtítulo "Adicione ou edite as tags disponíveis para os atendentes desta fila."
- Um único campo `bds-input-chips`, rótulo e placeholder "Insira as tags separando por vírgulas" (Enter/vírgula cria o chip).
- Botão **Salvar alterações** no canto inferior direito, **desabilitado enquanto nada mudou** (esmaecido). Este cartão tem o próprio botão de salvar.
- Cartão de 269,7 de altura. Limites de quantidade e de tamanho da tag: não observados.

## 5. Encerramento automático de tickets

Cabeçalho (cartão fechado, 102,3 de altura) [M]: título "Encerramento automático de tickets" (20px bold), subtítulo "Encerre automaticamente os tickets por inatividade" (14px, `#595959`) e, à direita, um **interruptor alto** (`size=tall`, 56x32, x=1562).

**O interruptor grava na hora** (não há botão Salvar para ligá-lo): ao ligar apareceu o aviso de erro "Ocorreu um erro ao alterar os dados" (toast vermelho "Error"), o que mostra que o clique já tenta gravar. Por isso o Pipe não deve tratar o interruptor como estado local até clicar em Salvar.

Cartão aberto (interruptor ligado) [M, textos também em B]:

- Seção **"Regras de encerramento"** (16px semi-bold) com a ajuda "Defina as regras para encerrar automaticamente os tickets inativos."
  - Texto "Encerrar ticket quando o tempo de inatividade do cliente for maior que:" (12px).
  - Campo numérico **"Tempo de inatividade"** (largura 1067,3, altura 86,2 com a mensagem de apoio "O tempo deve ser um valor maior que 0.") e select **"Unidade"** (174,6 de largura): **Minutos** (padrão) e **Horas**. Valor mínimo 0; precisa ser maior que 0 [B].
  - Três checkboxes (21px de altura, largura total): "Encerrar ticket apenas se o primeiro atendimento já tiver ocorrido"; "Não encerrar se cliente estiver aguardando resposta do atendente"; "Remover automaticamente o ticket da tela quando ele for encerrado".
- Dois **sub-cartões com interruptor** (24px de altura do interruptor, 42 de largura, desligados por padrão), cada um com título 16px semi-bold:
  - "Enviar alerta de inatividade para o cliente" [B]: ao ligar mostra "Crie uma mensagem para alertar o cliente antes do encerramento automático do ticket", campo **Mensagem** (placeholder "Adicione sua mensagem aqui"; erro "É necessário informar uma mensagem"), tempo antes do encerramento ("Quanto tempo antes do encerramento o cliente deve receber a mensagem?", com unidade Minutos/Horas) e a validação "Esse valor não pode ser maior que o tempo de inatividade".
  - "Incluir tags no encerramento do ticket" [B]: ao ligar mostra "Defina as tags que serão usadas nos tickets encerrados" e o campo de chips **"Tags de encerramento"**.
- Linha de aviso (12px): "Para personalizar a mensagem após o encerramento do ticket, confira as condições de saída no bloco de atendimento no builder" (com link externo para o builder).
- Botão **Salvar** (sólido, 74,9x40) no canto inferior direito, desabilitado até o formulário ficar válido (`formIsValid`).
- Regra de inatividade (traduções [B]): "Regra para tempo de inatividade", com a explicação das interações que restauram ou reiniciam a contagem ("Mensagem do cliente: Restaura/Reinicia tempo de inatividade", "Mensagem do atendente: Reinicia tempo de inatividade"); não vimos em qual condição ela aparece na tela.
- Se a fila ainda usa blocos de atendimento desatualizados, a seção fica desabilitada com o título "Ative o encerramento automático de tickets!" e uma mensagem para atualizar os blocos no builder [B]. Não vimos esse estado.

## Para o Pipe (consequências diretas)

1. A edição de fila e **todos** os formulários e modais acima acontecem na mesma página e na mesma URL; nada de levar à Gestão de atendentes nem à página de regras.
2. "Criar regra" de atendimento e de priorização são formulários inline no cartão (nome editável, condições Se/Condição/Valor, conector E/OU), não páginas. Operadores e campos: ver as listas acima.
3. Tags da fila: um campo de chips por cartão, com Salvar alterações próprio.
4. Encerramento automático: cabeçalho com interruptor; o conteúdo aberto traz tempo + unidade, três checkboxes, alerta de inatividade (mensagem + antecedência), tags de encerramento e Salvar. Se o Pipe ainda não tem o backend (dependência da 03.1), mostrar o cartão desabilitado com o texto padrão, mas com este layout.
5. Nada de "fila padrão" nem de cartão de dados da fila.

## Não medido e por quê

- Tipografia exata do rótulo e do valor das linhas de atendente e de regra (só os tamanhos 12/16 do texto de rótulo e valor).
- Estados vazio, carregando e erro dos cartões de Atendentes e de Regras de Atendimento; confirmação ao excluir um atendente da fila ou uma regra (a lixeira não foi clicada).
- Validações do modal de atendentes com e-mail inválido ou duplicado, e o efeito de "Atribuir" (não gravar).
- Editar uma regra existente (o lápis não foi clicado; deve abrir o mesmo formulário preenchido, mas não foi visto).
- O conteúdo de "Enviar alerta de inatividade" e de "Incluir tags" com o interruptor ligado, e a regra para tempo de inatividade na tela (vêm só das traduções).
- Limites de quantidade de tags e de condições por regra.
- A persistência do interruptor de Encerramento depois do clique (a sessão da Blip travou ao recarregar para verificar).

## Alterações no bot dev

- Nenhum dado foi criado ou excluído e nada foi salvo (Salvar, Atribuir, Excluir e lixeiras não foram clicados). Modais e formulários foram abertos e cancelados.
- **Um clique no interruptor de Encerramento automático de tickets** (de uma fila existente) para ver o conteúdo aberto: gerou o aviso de erro "Ocorreu um erro ao alterar os dados". Em seguida o interruptor foi desligado de novo e a tela voltou ao estado fechado (altura 102,3). **Não foi possível confirmar depois de recarregar** que a configuração gravada continua desligada (a sessão da Blip ficou instável). Vale conferir na Blip se o encerramento automático dessa fila (a primeira da lista, a que tem 3 atendentes) continua desligado.
