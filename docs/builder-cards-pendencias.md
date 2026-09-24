# Cards do Builder — pendências de paridade

Atualizado em 23/09/2026. A reprodução integral da Blip ainda não está concluída.

## Referências disponíveis

- DOM fornecido: três variantes (Início, comum e atendimento humano).
- CSS e JavaScript capturados em `referencias-blip/builder/zip19/supernova.blip.ai`.
- Consulta visual do Builder da Blip no navegador, sem edição deliberada do fluxo.

## Ainda falta no frontend

- Catálogo completo de conteúdos e seus formulários. Atualmente o menu oferece texto, menu e quick reply.
- Catálogo completo de ações e respectivos formulários. ProcessHttp já tem editor; ainda faltam os demais recursos da referência.
- Biblioteca de funções: criar, gerenciar e selecionar funções do contrato.
- Seletor de destino com pesquisa, criação de bloco e variável com ID do bloco.
- Pesquisa de satisfação nas saídas do atendimento humano.
- Paleta e sugestões de tags iguais às da referência.
- Comparação visual de todos os estados expandidos, menus e validações; os ajustes atuais não comprovam igualdade integral.

## Dependências além do visual

- Executar scripts e funções da biblioteca exige suporte seguro no motor e persistência da biblioteca; não basta acrescentar botões.
- A expiração da ação Definir variável aparece na Blip, mas o executor atual do Pipe não utiliza esse campo.
- Ações e conteúdos adicionais precisam ter o suporte do motor/canal confirmado antes de serem apresentados como funcionais.

## Verificação desta etapa

- Typecheck do frontend e 27 testes de Builder aprovados.
- Prévia local com os componentes reais e três blocos em memória; não é uma validação de persistência pela API nem de produção.
- Conferidos abertura/retorno de detalhes, abas específicas de atendimento e inclusão de condição de disponibilidade.
- Adicionado teste de colagem: IDs distintos, dados independentes e limite de 15 aplicado à seleção inteira.
- Sem deploy nesta etapa.
