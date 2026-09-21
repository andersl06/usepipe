ALTER TABLE "canal" DROP CONSTRAINT "canal_tipo_ck";--> statement-breakpoint
ALTER TABLE "contato_identidade" DROP CONSTRAINT "contato_identidade_canal_tipo_ck";--> statement-breakpoint
ALTER TABLE "canal" ADD CONSTRAINT "canal_tipo_ck" CHECK ("tipo" in ('whatsapp_cloud', 'instagram', 'messenger', 'email', 'widget'));--> statement-breakpoint
ALTER TABLE "contato_identidade" ADD CONSTRAINT "contato_identidade_canal_tipo_ck" CHECK ("canal_tipo" in ('whatsapp_cloud', 'instagram', 'messenger', 'email', 'widget'));
