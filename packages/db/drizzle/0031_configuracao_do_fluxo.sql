-- `fluxo.configuracao`: guarda "Tela de Boas-vindas" e "Menu Persistente" —
-- as duas telas de `/configurations/welcome` e `/configurations/persistentMenu`
-- que hoje só existem no front (`apps/gestao-vite/src/paginas/fluxo/configuracoes/
-- {boasvindas,menu-persistente}/`) e não gravam nada.
--
-- Uma coluna jsonb, não uma tabela: são poucos campos, de UMA tela cada, sem
-- histórico (ao contrário de `fluxo_versao.global`, que é POR VERSÃO
-- publicada) — é o retrato atual do contato, como `nome` e `descricao` já são.
--
-- Default `'{}'::jsonb` com `ADD COLUMN ... NOT NULL DEFAULT`: no Postgres 11+
-- isso não reescreve a tabela (default constante, guardado no catálogo).
--
-- ## Como desfazer
--
-- ALTER TABLE "fluxo" DROP COLUMN "configuracao";

ALTER TABLE "fluxo" ADD COLUMN "configuracao" jsonb DEFAULT '{}'::jsonb NOT NULL;
