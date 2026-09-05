-- `mensagem.dados` estava na §3 do modelo de dados e faltou no schema.
--
-- Achado durante a construção da entrega de mensagem: sem esta coluna, os valores
-- posicionais do template só existem dentro do job da fila. Job perdido leva junto a
-- possibilidade de reenviar e de auditar o que foi mandado ao cliente, e o outbox
-- precisa recusar o envio em vez de mandar template com parâmetro faltando.
--
-- Guarda também a origem da conversa no Instagram: mensagem direta, resposta a story
-- com a referência do story, menção, ou comentário promovido a conversa privada.

ALTER TABLE "mensagem" ADD COLUMN IF NOT EXISTS "dados" jsonb;
