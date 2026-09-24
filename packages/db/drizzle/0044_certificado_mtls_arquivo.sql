-- mTLS de verdade: o `.pfx` e a senha dele passam a ser guardados — CIFRADOS.
--
-- A migration 0039 nasceu sem arquivo nem senha de propósito: o Pipe não tinha
-- onde usar o certificado. Agora tem — a Pipe apresenta o certificado do
-- cliente quando ELA chama os hosts dele (`apps/api/src/dominio/mtls.ts`: os
-- webhooks de saída hoje, a chamada externa do Builder amanhã), que é o que a
-- origem faz com o `.pfx` subido em `/mtls` (`referencias-blip/pesquisa/blip-certificados-mtls.md`).
-- O dono do produto aprovou guardar o material.
--
-- As duas colunas novas são envelopes `pipev1.` de `packages/db/src/segredo.ts`
-- (AES-256-GCM, chave FORA do banco): nunca texto claro, nunca devolvidas por
-- `GET`, nunca no log de auditoria. O motivo é o mesmo do `canal.config`: o
-- risco não é um cliente ler o outro (a RLS já cuida), é o dump — um backup com
-- a chave privada de cada cliente em claro entrega a identidade de todos de uma
-- vez.
--
-- O arquivo vai em base64 dentro do envelope, e não em `bytea` nem no storage
-- de objetos: `cifrar()` é de texto; um `.pfx` tem poucos KB (a origem limita a
-- 10 MB); e o storage de `packages/armazenamento` existe para servir mídia por
-- link assinado — exatamente o que uma chave privada nunca pode ter.
--
-- `emissor` e `sujeito` são públicos (saem do próprio certificado) e servem à
-- tela. `expira_em` e `impressao_digital` continuam, mas agora saem do arquivo
-- (`X509Certificate` de `node:crypto`), não da digitação.
--
-- Colunas anuláveis: o que foi cadastrado à mão antes desta migration fica,
-- com status "sem arquivo" — não autentica nada, e a tela mostra isso.
--
-- ## Como desfazer
--
-- ALTER TABLE "certificado_mtls"
--   DROP COLUMN "arquivo_cifrado", DROP COLUMN "senha_cifrada",
--   DROP COLUMN "emissor", DROP COLUMN "sujeito";

ALTER TABLE "certificado_mtls" ADD COLUMN IF NOT EXISTS "arquivo_cifrado" text;--> statement-breakpoint
ALTER TABLE "certificado_mtls" ADD COLUMN IF NOT EXISTS "senha_cifrada" text;--> statement-breakpoint
ALTER TABLE "certificado_mtls" ADD COLUMN IF NOT EXISTS "emissor" text;--> statement-breakpoint
ALTER TABLE "certificado_mtls" ADD COLUMN IF NOT EXISTS "sujeito" text;
