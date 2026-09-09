# Desk Pipe - identidade visual sobre layout Blip

## Objetivo

Aplicar a identidade minima do Pipe ao Desk ja construido, preservando o layout e
o comportamento visual validados do Blip Desk. Esta etapa e somente visual: nao cria
backend, autenticacao nova, integracao com Twenty, Chatwoot, WhatsApp ou IA.

## Decisoes

- O `apps/desk` atual e a base da implementacao.
- O layout continua com trilho vertical e tres colunas: lista, conversa e painel do contato.
- Tipografia, icones, espacamento, densidade, raios, estados e composicao seguem a referencia Blip.
- A logo do Pipe substitui a marca do Desk.
- O verde Moss `#4A5D23` substitui o azul principal em acoes primarias, selecao e foco.
- Neutros, erro, alerta e informacao permanecem com contraste equivalente ao Desk original.
- Os dados demo atuais continuam sendo usados para validar a aparencia e as interacoes basicas.

## O que entra

- Logo Pipe no trilho e nos pontos de marca visiveis.
- Tokens visuais necessarios para sobrescrever marca e estados ativos.
- Ajustes de fundo, superficie, borda e selecao para o Moss sem mudar a geometria da tela.
- Revisao visual de lista, cabecalho da conversa, composer, painel do contato e navegacao lateral.
- Validacao em desktop e viewport estreito, preservando a responsividade existente.

## O que nao entra

- Refatoracao da arquitetura do Desk.
- Novo fluxo de login.
- Persistencia ou mudanca no modelo de dados.
- Integracao com Chatwoot, Twenty, WhatsApp ou provedores de IA.
- Recriacao do bundle original da Blip.
- Aplicacao da tipografia ou da linguagem completa do Pipe nesta fase.

## Criterio de aceite

Ao abrir o Desk, a pessoa deve reconhecer imediatamente o layout do Blip Desk,
mas identificar o Pipe pela logo e pela cor Moss. Nenhum componente deve ganhar
uma nova forma apenas por causa da marca. Os fluxos demo existentes continuam
funcionando e nao surgem erros de hidratacao, navegacao ou contraste na troca de
tema visual.

## Proxima fase

Depois da aprovacao visual, a implementacao sera planejada em mudancas pequenas:

1. localizar os tokens realmente usados pelo `apps/desk`;
2. aplicar logo e Moss sem alterar a geometria;
3. revisar as superficies e estados afetados;
4. rodar typecheck, testes e inspecao renderizada;
5. comparar a tela antes/depois e registrar o que ficou para a integracao real.
