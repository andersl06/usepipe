-- Mídia recebida (WhatsApp e Instagram) só grava a referência da Meta
-- (`guardarAnexo` em `apps/api/src/dominio/entrada.ts`): `chave_storage = 'meta:<media_id>'`
-- ou a URL do CDN do Instagram, `bytes = 0` marcando "ainda não baixado". A URL da
-- Meta expira e o Desk não consegue mostrar a mídia depois — o download para o nosso
-- storage roda numa fila (`dominio/midia.ts`), fora do webhook.
--
-- ## anexo.canal_id
--
-- O download precisa do TOKEN do canal (WhatsApp) para chamar o Graph. Sem esta
-- coluna, achar o canal exigiria juntar `anexo -> mensagem -> conversa -> inbox ->
-- canal` — em `mensagem`, tabela particionada e sem índice em `anexo_id`, isso é
-- varredura completa a cada tentativa de download. `canal_id` é gravado uma vez, no
-- mesmo insert que já tem o canal em mãos (`entrada.ts`), e o lookup vira busca por
-- chave primária. `null` para anexo de upload manual (`controladores/anexos.ts`), que
-- não passa pelo Graph e não precisa de canal nenhum. `ON DELETE SET NULL`: canal
-- removido não pode arrastar o anexo — mensagem antiga continua existindo.
--
-- ## anexo.download_tentativas / download_erro / download_proxima_tentativa_em
--
-- O mesmo desenho de `outbox_mensagem` (`tentativas`, `ultimo_erro`,
-- `proxima_tentativa_em`): a varredura periódica reprocessa quem falhou, com
-- limite de tentativas, e falha PERMANENTE (host fora da lista, sha256 divergente,
-- tamanho acima do limite) esgota as tentativas na hora, sem esperar o backoff.
--
-- ## Como desfazer
--
-- DROP INDEX "anexo_download_pendente_idx";
-- ALTER TABLE "anexo" DROP CONSTRAINT "anexo_canal_id_canal_id_fk";
-- ALTER TABLE "anexo" DROP COLUMN "canal_id";
-- ALTER TABLE "anexo" DROP COLUMN "download_tentativas";
-- ALTER TABLE "anexo" DROP COLUMN "download_erro";
-- ALTER TABLE "anexo" DROP COLUMN "download_proxima_tentativa_em";

ALTER TABLE "anexo" ADD COLUMN "canal_id" uuid;
--> statement-breakpoint
ALTER TABLE "anexo" ADD COLUMN "download_tentativas" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "anexo" ADD COLUMN "download_erro" text;
--> statement-breakpoint
ALTER TABLE "anexo" ADD COLUMN "download_proxima_tentativa_em" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "anexo"
  ADD CONSTRAINT "anexo_canal_id_canal_id_fk"
  FOREIGN KEY ("canal_id") REFERENCES "public"."canal"("id")
  ON DELETE SET NULL;
--> statement-breakpoint

-- Índice parcial: só quem ainda não baixou entra na varredura, e ela filtra por
-- `download_proxima_tentativa_em`. Anexo de upload manual (`canal_id is null`) nunca
-- cai aqui — bytes já veio preenchido no upload.
CREATE INDEX "anexo_download_pendente_idx" ON "anexo" ("download_proxima_tentativa_em")
  WHERE "bytes" = 0 AND "canal_id" IS NOT NULL;
