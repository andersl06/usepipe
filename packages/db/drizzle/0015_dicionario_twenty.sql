-- O dicionário de dados passa a ser o ESPELHO dos metadados do CRM (Twenty) de cada cliente.
--
-- Diretriz do dono (11/09): nada inventado, tudo copiado. As colunas novas levam o NOME
-- da propriedade que a Metadata API do Twenty devolve (`objectMetadata`/`fieldMetadata`),
-- em snake_case, e guardam o VALOR literal: `type` continua `TEXT`, `CURRENCY`,
-- `RELATION`…, e `options`, `default_value`, `settings` e `relation` são o JSON que a
-- API devolveu, sem tradução. Rótulo em português só no `rotulo`, como o Twenty faz.
--
-- As quatro colunas que já existiam ficam com o nome que tinham, porque o CRM caseiro
-- (`apps/crm`) e o catálogo de blocos já as endereçam — mas recebem o valor do Twenty:
--   codigo    = nameSingular (objeto) / name (campo)   ← casar SEMPRE por aqui
--   rotulo    = labelSingular (objeto) / label (campo) ← só para exibir
--   tipo      = type, literal do FieldMetadataType
--   descricao = description
--
-- `twenty_id` é o `id` do metadado do lado de lá, pelo mesmo motivo de
-- `contato.twenty_pessoa_id` (0012): `text`, porque o id é opaco para nós. Ele também
-- separa o que veio do Twenty do que o CRM caseiro declarou à mão — a sincronização
-- só mexe em linha com `twenty_id`.
--
-- `is_custom`: o Twenty removeu `isCustom` na 2.12 e passou a dizer de quem é o
-- metadado por `applicationId`. Guardamos os dois: `application_id` como veio, e
-- `is_custom` com o nome antigo do próprio Twenty — lido direto nas versões antigas,
-- e derivado de `applicationId = workspaceCustomApplicationId` nas novas.
--
-- `excluido_em`: o metadado SUMIU do Twenty. Não apagamos a linha, porque um bloco de
-- fluxo pode apontar para ela e precisa acusar "campo removido" em vez de quebrar em
-- silêncio. É a exclusão lógica de `comum.ts`. Diferente de `is_active = false`, que é
-- o espelho do "desativado" do próprio Twenty — quando some, as duas marcas valem.

alter table "dicionario_objeto" add column "twenty_id" text;--> statement-breakpoint
alter table "dicionario_objeto" add column "name_plural" text;--> statement-breakpoint
alter table "dicionario_objeto" add column "label_plural" text;--> statement-breakpoint
alter table "dicionario_objeto" add column "icon" text;--> statement-breakpoint
alter table "dicionario_objeto" add column "is_custom" boolean default false not null;--> statement-breakpoint
alter table "dicionario_objeto" add column "is_active" boolean default true not null;--> statement-breakpoint
alter table "dicionario_objeto" add column "is_system" boolean default false not null;--> statement-breakpoint
alter table "dicionario_objeto" add column "is_remote" boolean default false not null;--> statement-breakpoint
alter table "dicionario_objeto" add column "application_id" text;--> statement-breakpoint
alter table "dicionario_objeto" add column "excluido_em" timestamp with time zone;--> statement-breakpoint

alter table "dicionario_campo" add column "twenty_id" text;--> statement-breakpoint
alter table "dicionario_campo" add column "icon" text;--> statement-breakpoint
alter table "dicionario_campo" add column "is_custom" boolean default false not null;--> statement-breakpoint
alter table "dicionario_campo" add column "is_active" boolean default true not null;--> statement-breakpoint
alter table "dicionario_campo" add column "is_system" boolean default false not null;--> statement-breakpoint
alter table "dicionario_campo" add column "is_nullable" boolean;--> statement-breakpoint
alter table "dicionario_campo" add column "is_unique" boolean;--> statement-breakpoint
alter table "dicionario_campo" add column "default_value" jsonb;--> statement-breakpoint
alter table "dicionario_campo" add column "options" jsonb;--> statement-breakpoint
alter table "dicionario_campo" add column "settings" jsonb;--> statement-breakpoint
alter table "dicionario_campo" add column "relation" jsonb;--> statement-breakpoint
alter table "dicionario_campo" add column "morph_relations" jsonb;--> statement-breakpoint
alter table "dicionario_campo" add column "application_id" text;--> statement-breakpoint
alter table "dicionario_campo" add column "atualizado_em" timestamp with time zone;--> statement-breakpoint
alter table "dicionario_campo" add column "excluido_em" timestamp with time zone;
