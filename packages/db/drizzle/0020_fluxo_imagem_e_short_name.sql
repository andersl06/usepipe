-- A foto e o identificador curto do contato inteligente.
--
-- Duas colunas que a tela de criação já pedia e a tabela não tinha.
--
-- 1) `imagem_url`
--
-- No passo do nome da origem há um `<upload-button>` OPCIONAL
-- (`.gif .png .jpeg .jpg`); o serviço sobe o arquivo para o media store deles e
-- grava o endereço em `imageUri` — o mesmo campo que o cartão do portal lê para
-- desenhar o avatar (`ng-if="!$ctrl.contact.imageUri"` cai no ícone padrão).
--
-- A falha do upload é ENGOLIDA de propósito: `uploadApplicationImageSafely` só
-- faz `console.warn` e a criação segue. Contato sem foto é contato criado;
-- contato não criado é trabalho perdido. A nossa Server Action faz o mesmo.
--
-- O nome da coluna é `imagem_url` e não `imagem`: o que mora aqui é um
-- ENDEREÇO de imagem, e hoje esse endereço é um `data:` URI com os bytes
-- dentro (ver `apps/gestao/src/app/criar/roteador/acoes.ts`, que explica o teto
-- de 256 KB e o caminho de saída para o storage de anexos). No dia em que a
-- foto for para o `anexo`, o que muda é o conteúdo da coluna, não o tipo dela.
--
-- 2) `short_name`
--
-- `application.shortName = application.name.toLowerCase()`, em
-- `CreateApplicationService.prepareApplicationData`. É o identificador do
-- contato na URL deles (`/application/detail/{shortName}/home`) e é o motivo de
-- o nome ter de começar com LETRA — a regra já estava em
-- `criar/roteador/regras.ts` como `nomeCurto()` e até agora não tinha onde
-- morar.
--
-- Sem índice único: quem garante nome sem repetição continua sendo o `select`
-- da Server Action, sobre `nome`. Um índice aqui faria "Meu Bot" e "meu-bot"
-- colidirem, que é regra nova e não é cópia de nada.
--
-- As duas nascem nulas, e ficam nulas nas linhas que já existem: nem foto nem
-- identificador curto são obrigatórios para um fluxo funcionar.

ALTER TABLE "fluxo"
  ADD COLUMN IF NOT EXISTS "imagem_url" text,
  ADD COLUMN IF NOT EXISTS "short_name" text;
