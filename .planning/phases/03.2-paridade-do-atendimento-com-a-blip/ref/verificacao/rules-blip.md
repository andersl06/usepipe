# Regras de atendimento na Blip: captura ao vivo

**Fonte:** bot dev `auvpcapitaldev1`, aba logada, **só leitura**, 2026-10-01, janela 1920x863 (viewport do Chrome da automação). Medido com `ref/medir-tela.js` estendido para atravessar shadow DOM. Os arquivos brutos (HTML com shadow roots, JSON, screenshots) ficam fora do Git em `referencias-blip/atendimento/03.2-capturas/2026-10-01-regras-*`. Nenhum nome de contato, e-mail ou telefone foi copiado para este arquivo. Valores `[M]` = medidos ao vivo; `[B]` = texto lido do bundle do desk (`portal-fragment-desk-mfe`), não visto na tela; `[A]` = estimado.

## Menu lateral (grupo "Regras")
Ordem completa do menu do Atendimento [M]: Monitoramento, Histórico, **Relatórios** (Atendimento, Satisfação, Calls, Vendas), **Comunicação** (Respostas prontas, Modelos de mensagens), **Regras** (Atendimento, SLA, Horários), **Atendentes** (Gestão de atendentes, Filas de atendimento, Pausas personalizadas), **Preferências** (Configurações gerais, Canais de atendimento). O grupo "Regras" tem exatamente três itens: Atendimento, SLA e Horários, nessa ordem.

## URLs [M]
- Lista: `.../attendance/desk/rules`.
- Criar regra e editar regra **não mudam a URL**: o formulário ocupa o lugar da lista dentro da mesma rota (Cancelar e a seta de voltar devolvem a lista, sem confirmação).

## Lista de regras [M]
- Título da página "Regras de atendimento", 24px, peso 400, cor `rgb(40,40,40)`, altura 32px, no topo, alinhado à esquerda (x=381).
- Botão azul **"+ Criar nova regra"** à direita do título: 166,8 x 40px, fundo `rgb(30,107,241)`, raio 8px, padding 0 16px, texto 16px.
- Busca abaixo do título: placeholder "Buscar regras de atendimento", 420,6 x 42px, borda 1px `rgba(0,0,0,0.2)`, raio 8px, padding `8px 4px 8px 12px`, ícone de lupa à esquerda. A busca é uma só (nome da regra).
- Cada regra é um cartão (`bds-paper`): 1401,9 x 86px, fundo `rgb(246,246,246)`, raio 16px, sombra `0 2px 8px -2px rgba(0,0,0,.16)`, padding 20px, margem vertical 10px (passo entre linhas 96px).
- Conteúdo da linha, da esquerda para a direita: rótulo pequeno **"Nome da Regra"** (12px/18px, cor `rgb(40,40,40)`) sobre o valor em negrito (16px, peso 700, 24px); segunda coluna alinhada em x=1008: rótulo **"Fila"** sobre o nome da fila (mesmo estilo); à direita três controles: **lápis** (editar, 40x40, raio 8px, ícone ~20px), **lixeira** (excluir, 40 de largura) e **interruptor** ligado/desligado (42x24 o hospedeiro, trilho 32x18 interno).
- Os interruptores aparecem **ligados** nas 5 regras da primeira página.
- Rodapé: "Resultados por página" (14px/21px) seguido do seletor de 74x40px (valor 5, raio 8px, borda 1px `rgba(0,0,0,.2)`), e à direita "1-5 de 12" (14px) e navegação `|<  <  1  >  >|` (gap 8px, 216,4 x 40px).
- Há **uma regra por fila**: o nome da fila aparece como valor da coluna "Fila"; o formulário diz "Encaminhar atendimento para" uma fila.
- Estado vazio e carregando: **carregando** é um spinner central (`bds-loading-spinner`, 64px) sobre a lista (visto no primeiro quadro da captura); **vazio** existe no DOM (`pagination-and-search-empty-data-container`), mas esta lista tem 12 regras, então não foi visto renderizado. Texto do vazio no bundle [B]: "Crie uma regra para definir como seu chatbot deve direcionar os atendimentos entre os atendentes cadastrados."

## Formulário de criar regra [M]
- Cabeçalho: seta de voltar (`arrow-left`, botão 40x40, transparente, ícone 24px) e o título **"Regras de atendimento"** (24px) em x=428.
- Cartão do formulário: 1421,7 x 474px, fundo `rgb(246,246,246)`, raio 16px, sombra leve; dentro, o **nome da regra** editável no lugar (componente `bds-input-editable`, valor padrão **"Regra N"**, N = próximo número, ex.: "Regra 12", com um lápis ao lado; mensagem de erro "Ops! Este campo precisa ser preenchido", mínimo 1 caractere), 1341,7 x 44px.
- Dentro dele, um cartão interno de condições (1341,7 x 261px, padding `10px 20px 20px`) com **uma linha por condição**:
  - **"Se"** (select, 299,8 x 56px): opções **Mensagem** (`Message`), **Nome Contato** (`Contact.Name`), **Email Contato** (`Contact.Email`), **Extras Contato** (`Contact.Extras`). Valor inicial: Mensagem.
  - **"Condição"** (select, 297,5 x 66px): **Contém** (`Contains`), **Não contém** (`NotContains`), **É igual** (`Equals`), **Não é igual** (`NotEquals`). Valor inicial: Contém.
  - **"Valor"** (`bds-input-chips`, 684,3 x 66px, cresce em altura): campo de **chips** (vários valores por condição; Enter confirma um chip). Erro: "Ops! Este campo precisa ser preenchido".
  - Quando "Se" = **Extras Contato**, aparece abaixo do select um campo extra com o rótulo "Contact.Extras" (chave do extra, ex.: um nome de campo), 277,3 x 59px; o chips "Valor" e o select "Condição" crescem para a mesma altura.
- Botão **"+ Adicionar condição"** centralizado abaixo das condições: 184,7 x 56px, contorno 1px `rgb(82,99,108)`, raio 8px, padding 0 16px.
  - Ao adicionar uma segunda condição aparece, **acima dela**, um seletor de conector de 70 x 40px com **E** e **OU** (valor inicial **OU**) e o texto de apoio **"qualquer uma das condições abaixo"**; a segunda condição fica recuada, com uma **linha vertical** à esquerda ligando ao conector, repete Se/Condição/Valor e tem um botão de **remover condição** (ícone `delete` num botão 40x40) à direita.
  - Há **um conector por grupo de condições adicionais** (não um por condição).
- **"Encaminhar atendimento para"** (select, 1301,7 x 56px, largura total): lista **todas as filas do bot** em ordem alfabética (17 no dev, inclusive "Default"); valor inicial "Default". A regra encaminha para **uma** fila.
- Rodapé do formulário, alinhado à direita: **Cancelar** (90,8 x 40px, secundário, contorno) e **Salvar** (75,2 x 40px, azul `rgb(30,107,241)`, raio 8px). Em regra nova, **Salvar começa desabilitado** (aparece claro) até haver valor; em regra existente, já vem habilitado.

## Formulário de editar regra [M]
- Mesma tela e mesma URL; vem preenchido com nome, condições (chips existentes), fila e conector; sem confirmação ao abrir. A condição vista usava "Extras Contato" (campo extra com a chave) e um valor em chips.
- **Salvar** habilitado ao abrir.

## Excluir [B] (não aberto ao vivo)
O clique na lixeira **não foi feito** para não arriscar excluir (a regra do dono pede evitar exclusão e a existência da confirmação não estava confirmada). Textos do bundle [B]: título "Excluir regra"; corpo "Ao excluir essa regra, você removerá permanentemente o direcionamento dos tickets condicionados para a fila de atendimento {fila}." (variante sem o nome da fila também existe); botões "Cancelar" e "Excluir". Existe um aviso de erro de exclusão no bundle.

## Textos úteis do bundle [B]
"Configure regras de atendimento do seu canal"; "Defina as regras de atendimento para a fila"; "Defina em quais filas a regra será aplicada"; "Buscar regras de atendimento"; "Criar nova regra"; "Criar regra". Estas strings servem para conferir o texto, não são medidas.

## Não medido e por quê
- **Excluir (modal de confirmação):** não clicado por segurança; texto só do bundle [B].
- **Estado vazio da lista renderizado:** o bot dev tem 12 regras; não dá para esvaziar sem excluir.
- **Rótulo do conector "E":** a seleção de "E" por clique sintético não mudou o texto de apoio; o texto para "E" (provavelmente "todas as condições abaixo") **não foi visto**.
- **Condições com 3 ou mais linhas, validações de duplicidade e mensagem de sucesso ao salvar:** exigiriam salvar.
- **Largura de janela menor:** só 1920x863.
- **Tipografia interna do nome editável ("Regra N"):** o `bds-input-editable` foi lido só por geometria (44px de altura, fonte do título grande); não há medida de fonte confiável.
- **Estado carregando em milissegundos exatos e foco/hover:** não capturados.

## Alterações no bot dev
Nenhuma. Foram abertos o formulário de criar (nada digitado ou salvo), o de editar e o de adicionar condição, e todos foram fechados com Cancelar. O primeiro `click()` sintético no seletor de conector não gravou nada.
