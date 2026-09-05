-- Instagram entra como canal do dia 1 (§4.3 da spec).
--
-- É a convenção da §1 do modelo de dados provando o seu valor: enumeração é text com
-- check, então acrescentar valor é trocar duas constraints. Com enum nativo do Postgres
-- esta migration travaria em produção.

ALTER TABLE "canal" DROP CONSTRAINT "canal_tipo_ck";--> statement-breakpoint
ALTER TABLE "contato_identidade" DROP CONSTRAINT "contato_identidade_canal_tipo_ck";--> statement-breakpoint
ALTER TABLE "canal" ADD CONSTRAINT "canal_tipo_ck" CHECK ("tipo" in ('whatsapp_cloud', 'instagram', 'email', 'widget'));--> statement-breakpoint
ALTER TABLE "contato_identidade" ADD CONSTRAINT "contato_identidade_canal_tipo_ck" CHECK ("canal_tipo" in ('whatsapp_cloud', 'instagram', 'email', 'widget'));