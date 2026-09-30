-- P15 (plan 02-55): semantic search over the tenant's knowledge base.
--
-- `base_conhecimento` / `documento_conhecimento` / `trecho_conhecimento` exist since 0000 (with
-- `embedding vector(1536)` and RLS `tenant_isolado`). This adds only what the search needs:
-- * `trecho_conhecimento.modelo_embedding`: the model that produced `embedding`. Passages are
--   embedded lazily with the flow's provider key; a passage embedded by another model is re-embedded
--   before it is compared.
-- * `documento_conhecimento.tags`: the `tags` filter of `ProcessContentAssistant`.
-- * a GIN full-text index (the lexical search used when the flow has no embeddings key) and an HNSW
--   cosine index for the vector search.
ALTER TABLE "trecho_conhecimento" ADD COLUMN IF NOT EXISTS "modelo_embedding" text;--> statement-breakpoint
ALTER TABLE "documento_conhecimento" ADD COLUMN IF NOT EXISTS "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trecho_conhecimento_texto_fts_idx"
  ON "trecho_conhecimento" USING gin (to_tsvector('portuguese', "texto"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trecho_conhecimento_embedding_idx"
  ON "trecho_conhecimento" USING hnsw ("embedding" vector_cosine_ops);
