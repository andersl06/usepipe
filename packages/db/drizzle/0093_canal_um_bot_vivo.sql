-- Um canal pertence a no maximo um bot vivo. Ate aqui so o codigo da API conferia (`botOfChannel` + `lockChannel`); isto e a rede de seguranca no banco, para corrida entre duas requisicoes ou escrita direta. Aditiva e idempotente; nao toca em dado existente (conferido: 0 canais em mais de um bot vivo em producao).
-- 1) Entre fluxos: so um fluxo PUBLICADO por canal. Rascunho pode manter o vinculo enquanto e editado, como ja acontece.
CREATE UNIQUE INDEX IF NOT EXISTS "fluxo_canal_publicado_uk"
  ON "fluxo" ("canal_id")
  WHERE "canal_id" IS NOT NULL AND "estado" = 'publicado';--> statement-breakpoint
-- 2) Canais extras de roteador (`roteador_canal`): nenhum outro bot nao arquivado pode ter o mesmo canal, nem como canal principal (`fluxo.canal_id`) nem como extra de outro roteador.
CREATE OR REPLACE FUNCTION "roteador_canal_um_bot"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF EXISTS (
       SELECT 1 FROM "fluxo" f
        WHERE f."canal_id" = NEW."canal_id" AND f."id" <> NEW."roteador_id" AND f."estado" <> 'arquivado'
     ) OR EXISTS (
       SELECT 1 FROM "roteador_canal" o JOIN "fluxo" r ON r."id" = o."roteador_id"
        WHERE o."canal_id" = NEW."canal_id" AND o."roteador_id" <> NEW."roteador_id" AND r."estado" <> 'arquivado'
     ) THEN
    RAISE EXCEPTION 'canal % ja pertence a outro bot', NEW."canal_id"
      USING ERRCODE = '23505', CONSTRAINT = 'roteador_canal_um_bot';
  END IF;
  RETURN NEW;
END
$fn$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "roteador_canal_um_bot" ON "roteador_canal";--> statement-breakpoint
CREATE TRIGGER "roteador_canal_um_bot"
  BEFORE INSERT OR UPDATE OF "canal_id", "roteador_id" ON "roteador_canal"
  FOR EACH ROW EXECUTE FUNCTION "roteador_canal_um_bot"();
