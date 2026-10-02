# Respostas prontas (attendance/desk/replies): captura ao vivo da Blip

**Fonte:** bot dev `auvpcapitaldev1`, 2026-10-01, só leitura (exceção registrada abaixo). Janela de 1920 px de largura. Arquivos brutos (HTML com shadow roots, JSON, screenshots) em `referencias-blip/atendimento/03.2-capturas/2026-10-01-respostas-*` (fora do Git, sem dados pessoais copiados para cá). Legenda: [M] medido ao vivo, [A] estimado do screenshot.

## URL e navegação
- A URL é sempre `.../attendance/desk/replies`. Abrir uma categoria, adicionar resposta, abrir modais: nada muda a URL.
- Menu lateral, grupo **Comunicação**: Respostas prontas, Modelos de mensagens.

## Lista de categorias
- Título "Respostas prontas" e, à direita, botão azul "+ Criar categoria".
- Cada categoria é um cartão [M]: 1401,9 x 86, fundo `#f6f6f6`, raio 16, sombra `rgba(0,0,0,.16) 0 2px 8px -2px`, padding 20, passo vertical de 96 (10 de espaço entre cartões), x = 381.
- Conteúdo do cartão: rótulo pequeno "Categoria" e o nome em negrito; à direita lápis (`list-item-edit-button`, tooltip "Editar") e lixeira (tooltip "Excluir").
- Rodapé: "Resultados por página" com seletor de 74 x 40 [M] (opções 5, 10, 15, 25, 50, 100, 250, 500; padrão 5), contador "1-5 de 13", botões primeira, anterior, "1", próxima e última (`first-page-test`, `decrement-page-test`, `increment-page-test`, `last-page-test`).
- Estados vazio, carregando e erro: não capturados.

## Modal "Criar nova categoria"
- Ilustração à esquerda; à direita título "Criar nova categoria", texto "Dê um nome para essa categoria de respostas prontas", campo com placeholder "Nome da categoria" (343,2 x 40 [M]), botões "Cancelar" e "Salvar" (Salvar começa desabilitado). Botão X no canto. Esc fecha.

## Detalhe da categoria (mesma URL)
- Cabeçalho: seta de voltar "<", nome da categoria com lápis (renomeia no lugar, vira campo de texto) e botão "+ Adicionar resposta" (183,7 x 40 [M]).
- "+ Adicionar resposta" abre um menu com 14 tipos, nesta ordem: Texto, Quick reply, Menu, Carrossel, Imagem, Figurinha, Áudio, Vídeo, Documento, Pedir localização, Enviar localização, Web link, Solicitar ligação, Conteúdo dinâmico.
- Cada resposta é um cartão [M]: 1401,9 de largura, `#f6f6f6`, raio 16, padding 20; os de "Conteúdo dinâmico" medem 484 de altura. Título da resposta com lápis (renomear no lugar), etiqueta do tipo à direita ("Conteúdo dinâmico", "Texto"), lixeira.
- Corpo de "Conteúdo dinâmico": caixa interna com "Tipo" (`application/json`) e "Conteúdo" em JSON, fonte monoespaçada de 14 px, com rolagem.
- Excluir resposta: modal com cabeçalho vermelho "Excluir resposta", texto "Tem certeza que deseja excluir essa resposta?", botões "Cancelar" e "Excluir".
- Resposta do tipo Texto (única aberta): cartão com título "Texto" (editável), etiqueta "Texto", lixeira e um campo com placeholder "Algum texto".

## Comportamento ao salvar (achado importante)
- **Adicionar uma resposta salva a categoria na hora, sem botão Salvar.** Apareceu o aviso verde "Categoria salva com sucesso!" e, depois de recarregar a página, a resposta continuava lá. Excluir também salva a categoria inteira.
- Em consequência, o Pipe não deve ter botão "Salvar" por resposta se quiser igualar a Blip, mas precisa de aviso de sucesso e de erro.

## Alteração no bot dev (reportada)
- Para testar o menu criei uma resposta do tipo Texto chamada "Texto" na categoria "AUVP e Capital - Aberturas de conversa". Como ela foi salva sozinha, **excluí em seguida a mesma resposta** (confirmando só o modal "Excluir resposta" daquele cartão). Resultado líquido: nenhuma resposta a mais, mas a categoria foi salva duas vezes.

## Não medido e por quê
- Formulários dos outros 13 tipos de resposta (cada abertura cria e salva um cartão; não repeti).
- Validações, limites de tamanho e variáveis do texto.
- Renomear categoria e excluir categoria (modal de confirmação não aberto para não arriscar exclusão).
- Tipografia dos títulos (os componentes mostram 16 px por padrão no host; os reais ficam dentro do shadow DOM) [A].
- Estados vazio, carregando, erro.
