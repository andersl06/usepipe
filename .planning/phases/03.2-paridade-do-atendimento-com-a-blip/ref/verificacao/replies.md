Base: 28212259cdfeafca8647bc959e141160414e14a8
Tema: claro nas medições da Blip; o Pipe mantém os próprios tokens de superfície e tema escuro (D-12).

# Verificação: Respostas prontas (replies) Blip x Pipe

**Fonte Blip.** Captura ao vivo de 2026-10-01 em `ref/verificacao/replies-blip.md` (somente leitura). **Fonte Pipe.** Código, testes automáticos (servidor com banco real, regras puras) e tipos; sem render no navegador. Nenhuma linha está VISUALLY VERIFIED: toda linha visual é NEEDS VALIDATION.

Tela: `apps/management-vite/src/pages/registrations/communication-respostas.tsx` e `communication-respostas-formulario.tsx`. Servidor: `GET/POST/PATCH/DELETE /v1/management/communication/responses-ready` e `PATCH/DELETE /v1/management/communication/response-categories`.

## Estado: lista

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Título e ação | "Respostas prontas" e "+ Criar categoria" | igual | NEEDS VALIDATION |
| Cartão de categoria | 1401,9 x 86, raio 16, padding 20, passo 96, rótulo "Categoria", nome em negrito, lápis "Editar" e lixeira "Excluir" [M] | tokens `--p-atend-resposta-cartao-*` (altura 86, padding 20, passo 10); raio e sombra reaproveitam os da fila; fundo branco do cartão do Pipe em vez de `#f6f6f6` (decisão já adotada em MARCA.md) | NEEDS VALIDATION |
| Paginação | 5 por página, opções 5 a 500, "1-5 de 13" [M] | componente `Pagination` global, padrão 5; divisão feita na tela (poucas categorias) | NEEDS VALIDATION |
| Entidade de categoria | existe sem respostas | não existe tabela: categoria existe enquanto tiver resposta; a nova, vazia, vive só na tela até a primeira resposta (pendente do dono, ver DEPENDENCIAS-03.1.md) | divergência registrada |

## Estado: vazio

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Texto | não capturado na Blip; a ficha traz "Você ainda não criou respostas prontas" / "Crie respostas para agilizar seus atendimentos" | os mesmos textos | NEEDS VALIDATION |

## Estado: carregando

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Indicador | não capturado | `Carregando` do produto | NEEDS VALIDATION |

## Estado: erro

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Falha de leitura | não capturado | `Etiqueta` de erro "Não foi possível carregar as respostas prontas." | NEEDS VALIDATION |
| Falha ao gravar | não capturado | aviso (toast) vermelho com o motivo do servidor e a mensagem sob o cartão | NEEDS VALIDATION |

## Estado: criar categoria aberto

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Modal "Criar nova categoria" | texto "Dê um nome para essa categoria de respostas prontas", campo "Nome da categoria" 343,2 x 40, "Cancelar" e "Salvar" (começa desabilitado), X, Esc fecha [M] | mesmo texto e botões; Salvar desabilitado até o nome valer (não vazio, até 100, sem repetir); Enter salva; abre o detalhe da categoria nova | NEEDS VALIDATION |
| Ilustração à esquerda | presente | ausente (ilustração própria pendente do dono) | divergência registrada |

## Estado: detalhe da categoria aberto

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| URL | não muda [M] | não muda (estado da tela) | NEEDS VALIDATION |
| Cabeçalho | seta de voltar, nome com lápis (renomeia no lugar), "+ Adicionar resposta" | igual; renomear grava todas as respostas da categoria (409 se o nome já existe) | NEEDS VALIDATION |
| Menu de tipos | 14 tipos na ordem Texto, Quick reply, Menu, Carrossel, Imagem, Figurinha, Áudio, Vídeo, Documento, Pedir localização, Enviar localização, Web link, Solicitar ligação, Conteúdo dinâmico [M] | os 14, mesma ordem; só Texto habilitado; os outros 13 desabilitados com "Este recurso será liberado em breve para este fluxo." | NEEDS VALIDATION |
| Salvar | grava na hora, aviso "Categoria salva com sucesso!" [M] | grava ao sair do campo quando válida e alterada; mesmo aviso; falha mostra o motivo | NEEDS VALIDATION |
| Cartão de resposta | título editável, etiqueta do tipo, lixeira, campo "Algum texto" [M] | título editável, etiqueta "Texto", interruptor Ativa (campo do Pipe), lixeira, campo de atalho (o Desk precisa dele) e "Algum texto" | NEEDS VALIDATION |
| Excluir resposta | modal "Excluir resposta", "Tem certeza que deseja excluir essa resposta?", Cancelar e Excluir [M] | mesmo texto e botões | NEEDS VALIDATION |
| Excluir categoria | não medido | modal "Excluir categoria" com aviso de que as respostas dela saem junto | NEEDS VALIDATION |

## Navegação

- Menu lateral Comunicação > Respostas prontas; abrir uma categoria, voltar, criar categoria e modais não mudam a URL.
- Atalho `/` x `#` do compositor: esta tela mostra o atalho com `#` e não altera a regra do Desk; o ponto está em `DEPENDENCIAS-03.1.md`.
- Referência do Builder: nenhum bloco do Builder guarda id ou nome de resposta pronta ou de categoria (busca no motor e no editor), portanto renomear e excluir não precisam de recusa 409 por referência; se o Builder passar a referenciar, aplicar o padrão de `queue-references.ts`.

## Não medido

Validações e variáveis do texto na Blip; formulários dos outros 13 tipos; renomear e excluir categoria na Blip; tipografia dos títulos (shadow DOM); estados vazio, carregando e erro na Blip.
