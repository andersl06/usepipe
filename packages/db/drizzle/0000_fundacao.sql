CREATE EXTENSION IF NOT EXISTS "pgcrypto";--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "vector";--> statement-breakpoint
CREATE TABLE "chave_api" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"prefixo" text NOT NULL,
	"hash" text NOT NULL,
	"escopos" text[] DEFAULT '{}'::text[] NOT NULL,
	"expira_em" timestamp with time zone,
	"ultimo_uso_em" timestamp with time zone,
	"criada_por" uuid,
	"revogada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "equipe" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "log_auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ator_tipo" text NOT NULL,
	"ator_id" uuid,
	"acao" text NOT NULL,
	"objeto_tipo" text NOT NULL,
	"objeto_id" uuid,
	"antes" jsonb,
	"depois" jsonb,
	"ip" text,
	"em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "log_auditoria_ator_tipo_ck" CHECK ("ator_tipo" in ('usuario', 'chave', 'sistema'))
);
--> statement-breakpoint
CREATE TABLE "membro_equipe" (
	"tenant_id" uuid NOT NULL,
	"equipe_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"funcao" text DEFAULT 'membro' NOT NULL,
	CONSTRAINT "membro_equipe_equipe_id_usuario_id_pk" PRIMARY KEY("equipe_id","usuario_id"),
	CONSTRAINT "membro_equipe_funcao_ck" CHECK ("funcao" in ('membro', 'lider'))
);
--> statement-breakpoint
CREATE TABLE "papel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"de_sistema" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "papel_permissao" (
	"tenant_id" uuid NOT NULL,
	"papel_id" uuid NOT NULL,
	"permissao_codigo" text NOT NULL,
	CONSTRAINT "papel_permissao_papel_id_permissao_codigo_pk" PRIMARY KEY("papel_id","permissao_codigo")
);
--> statement-breakpoint
CREATE TABLE "permissao" (
	"codigo" text PRIMARY KEY NOT NULL,
	"descricao" text NOT NULL,
	"grupo" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"ip" text,
	"agente" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"encerrada_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tenant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"slug" text NOT NULL,
	"fuso" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"idioma" text DEFAULT 'pt-BR' NOT NULL,
	"logo_url" text,
	"cor_primaria" text,
	"plano" text DEFAULT 'padrao' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone,
	CONSTRAINT "tenant_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "usuario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"senha_hash" text,
	"avatar_url" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"ultimo_acesso_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "usuario_papel" (
	"tenant_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"papel_id" uuid NOT NULL,
	CONSTRAINT "usuario_papel_usuario_id_papel_id_pk" PRIMARY KEY("usuario_id","papel_id")
);
--> statement-breakpoint
CREATE TABLE "anexo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"chave_storage" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"duracao_seg" integer,
	"largura" integer,
	"altura" integer,
	"nome_original" text,
	"checksum" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atribuicao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"conversa_id" uuid NOT NULL,
	"de_usuario_id" uuid,
	"para_usuario_id" uuid,
	"de_fila_id" uuid,
	"para_fila_id" uuid,
	"motivo" text,
	"por_usuario_id" uuid,
	"em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"nome" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone,
	CONSTRAINT "canal_tipo_ck" CHECK ("tipo" in ('whatsapp_cloud', 'email', 'widget'))
);
--> statement-breakpoint
CREATE TABLE "contato" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"conta_id" uuid,
	"nome" text,
	"telefone_e164" text,
	"email" text,
	"documento" text,
	"avatar_url" text,
	"atributos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"bloqueado" boolean DEFAULT false NOT NULL,
	"excluido_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "contato_etiqueta" (
	"tenant_id" uuid NOT NULL,
	"contato_id" uuid NOT NULL,
	"etiqueta_id" uuid NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contato_etiqueta_contato_id_etiqueta_id_pk" PRIMARY KEY("contato_id","etiqueta_id")
);
--> statement-breakpoint
CREATE TABLE "contato_identidade" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contato_id" uuid NOT NULL,
	"canal_tipo" text NOT NULL,
	"identificador" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contato_identidade_canal_tipo_ck" CHECK ("canal_tipo" in ('whatsapp_cloud', 'email', 'widget'))
);
--> statement-breakpoint
CREATE TABLE "conversa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"inbox_id" uuid NOT NULL,
	"contato_id" uuid NOT NULL,
	"fila_id" uuid,
	"atendente_id" uuid,
	"estado" text DEFAULT 'na_fila' NOT NULL,
	"prioridade" text DEFAULT 'media' NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atribuida_em" timestamp with time zone,
	"primeira_resposta_em" timestamp with time zone,
	"encerrada_em" timestamp with time zone,
	"encerrada_por" uuid,
	"motivo_encerramento" text,
	"em_espera_desde" timestamp with time zone,
	"pausado_seg" integer DEFAULT 0 NOT NULL,
	"ultima_mensagem_em" timestamp with time zone,
	"ultima_mensagem_de" text,
	"janela_expira_em" timestamp with time zone,
	"janela_aberta_por_mensagem_id" uuid,
	"atualizado_em" timestamp with time zone,
	CONSTRAINT "conversa_estado_ck" CHECK ("estado" in ('na_fila', 'atribuida', 'em_atendimento', 'em_espera', 'encerrada')),
	CONSTRAINT "conversa_prioridade_ck" CHECK ("prioridade" in ('baixa', 'media', 'alta')),
	CONSTRAINT "conversa_ultima_mensagem_de_ck" CHECK ("ultima_mensagem_de" in ('contato', 'atendente', 'bot'))
);
--> statement-breakpoint
CREATE TABLE "conversa_etiqueta" (
	"tenant_id" uuid NOT NULL,
	"conversa_id" uuid NOT NULL,
	"etiqueta_id" uuid NOT NULL,
	"por_usuario_id" uuid,
	"em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversa_etiqueta_conversa_id_etiqueta_id_pk" PRIMARY KEY("conversa_id","etiqueta_id")
);
--> statement-breakpoint
CREATE TABLE "etiqueta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"cor" text,
	"escopo" text DEFAULT 'conversa' NOT NULL,
	"exclusiva_por_fila" boolean DEFAULT false NOT NULL,
	"obrigatoria_no_encerramento" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone,
	CONSTRAINT "etiqueta_escopo_ck" CHECK ("escopo" in ('conversa', 'contato', 'ambos'))
);
--> statement-breakpoint
CREATE TABLE "fila" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"cor" text,
	"horario_id" uuid,
	"capacidade_padrao" integer DEFAULT 5 NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "fila_atendente" (
	"tenant_id" uuid NOT NULL,
	"fila_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"capacidade_override" integer,
	CONSTRAINT "fila_atendente_fila_id_usuario_id_pk" PRIMARY KEY("fila_id","usuario_id")
);
--> statement-breakpoint
CREATE TABLE "inbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"canal_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"fila_padrao_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "mensagem" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"conversa_id" uuid NOT NULL,
	"direcao" text NOT NULL,
	"autor_tipo" text NOT NULL,
	"autor_id" uuid,
	"tipo" text DEFAULT 'texto' NOT NULL,
	"conteudo" text,
	"anexo_id" uuid,
	"resposta_pronta_id" uuid,
	"template_id" uuid,
	"estado_entrega" text,
	"erro_codigo" text,
	"erro_texto" text,
	"id_provedor" text,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"entregue_em" timestamp with time zone,
	"lida_em" timestamp with time zone,
	"dentro_da_janela" boolean,
	"categoria_cobranca" text,
	"custo_centavos" integer,
	"disparo_id" uuid,
	CONSTRAINT "mensagem_id_criada_em_pk" PRIMARY KEY("id","criada_em"),
	CONSTRAINT "mensagem_direcao_ck" CHECK ("direcao" in ('entrada', 'saida', 'interna')),
	CONSTRAINT "mensagem_autor_tipo_ck" CHECK ("autor_tipo" in ('contato', 'atendente', 'bot', 'sistema')),
	CONSTRAINT "mensagem_tipo_ck" CHECK ("tipo" in ('texto', 'imagem', 'audio', 'video', 'documento', 'localizacao', 'template')),
	CONSTRAINT "mensagem_estado_entrega_ck" CHECK ("estado_entrega" in ('pendente', 'enviando', 'enviada', 'entregue', 'lida', 'falhou')),
	CONSTRAINT "mensagem_categoria_cobranca_ck" CHECK ("categoria_cobranca" in ('livre', 'utilidade', 'marketing', 'autenticacao'))
) PARTITION BY RANGE ("criada_em");
--> statement-breakpoint
CREATE TABLE "motivo_pausa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"duracao_sugerida_min" integer,
	"conta_como_produtivo" boolean DEFAULT false NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "nota_interna" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"conversa_id" uuid NOT NULL,
	"usuario_id" uuid,
	"corpo" text NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_mensagem" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"mensagem_id" uuid NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"proxima_tentativa_em" timestamp with time zone,
	"estado" text DEFAULT 'pendente' NOT NULL,
	"ultimo_erro" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone,
	CONSTRAINT "outbox_mensagem_estado_ck" CHECK ("estado" in ('pendente', 'enviando', 'enviada', 'entregue', 'lida', 'falhou'))
);
--> statement-breakpoint
CREATE TABLE "pausa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"motivo_id" uuid,
	"iniciada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"encerrada_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "resposta_pronta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"escopo" text DEFAULT 'empresa' NOT NULL,
	"usuario_id" uuid,
	"categoria" text,
	"atalho" text NOT NULL,
	"titulo" text NOT NULL,
	"corpo" text NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone,
	CONSTRAINT "resposta_pronta_escopo_ck" CHECK ("escopo" in ('empresa', 'pessoal'))
);
--> statement-breakpoint
CREATE TABLE "status_atendente" (
	"usuario_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"estado" text DEFAULT 'offline' NOT NULL,
	"desde" timestamp with time zone DEFAULT now() NOT NULL,
	"conectado_em" timestamp with time zone,
	CONSTRAINT "status_atendente_estado_ck" CHECK ("estado" in ('online', 'pausa', 'invisivel', 'offline'))
);
--> statement-breakpoint
CREATE TABLE "template_mensagem" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"canal_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"idioma" text DEFAULT 'pt_BR' NOT NULL,
	"categoria" text NOT NULL,
	"status_meta" text DEFAULT 'pendente' NOT NULL,
	"corpo" text NOT NULL,
	"variaveis" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cabecalho_tipo" text DEFAULT 'nenhum' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone,
	CONSTRAINT "template_mensagem_categoria_ck" CHECK ("categoria" in ('utilidade', 'marketing', 'autenticacao'))
);
--> statement-breakpoint
CREATE TABLE "esforco_atendente_dia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"dia" date NOT NULL,
	"usuario_id" uuid NOT NULL,
	"esforco_seg" integer DEFAULT 0 NOT NULL,
	"tickets" integer DEFAULT 0 NOT NULL,
	"sessao_seg" integer DEFAULT 0 NOT NULL,
	"ocupacao" numeric(5, 4),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "esforco_conversa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"conversa_id" uuid NOT NULL,
	"atendente_id" uuid,
	"chars_escritos" integer DEFAULT 0 NOT NULL,
	"chars_lidos" integer DEFAULT 0 NOT NULL,
	"audio_ouvido_seg" integer DEFAULT 0 NOT NULL,
	"audio_gravado_seg" integer DEFAULT 0 NOT NULL,
	"chars_de_resposta_pronta" integer DEFAULT 0 NOT NULL,
	"esforco_seg" integer DEFAULT 0 NOT NULL,
	"pausado_seg" integer DEFAULT 0 NOT NULL,
	"calculado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evento_atendimento" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"conversa_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL,
	"usuario_id" uuid,
	"fila_id" uuid,
	"dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "evento_atendimento_id_em_pk" PRIMARY KEY("id","em"),
	CONSTRAINT "evento_atendimento_tipo_ck" CHECK ("tipo" in ('criada', 'enfileirada', 'atribuida', 'reatribuida', 'transferida_fila', 'primeira_resposta', 'mensagem_entrada', 'mensagem_saida', 'espera_iniciada', 'espera_encerrada', 'sla_alertado', 'sla_estourado', 'encerrada', 'reaberta', 'avaliada', 'pesquisa_respondida'))
) PARTITION BY RANGE ("em");
--> statement-breakpoint
CREATE TABLE "horario_atendimento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"fuso" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "horario_excecao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"horario_id" uuid NOT NULL,
	"data" date NOT NULL,
	"fechado" boolean DEFAULT true NOT NULL,
	"inicio" time,
	"fim" time,
	"motivo" text
);
--> statement-breakpoint
CREATE TABLE "horario_faixa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"horario_id" uuid NOT NULL,
	"dia_semana" smallint NOT NULL,
	"inicio" time NOT NULL,
	"fim" time NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metrica_diaria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"dia" date NOT NULL,
	"dimensao_tipo" text NOT NULL,
	"dimensao_id" uuid,
	"conversas_criadas" integer DEFAULT 0 NOT NULL,
	"conversas_encerradas" integer DEFAULT 0 NOT NULL,
	"conversas_perdidas" integer DEFAULT 0 NOT NULL,
	"conversas_abandonadas" integer DEFAULT 0 NOT NULL,
	"mensagens_entrada" integer DEFAULT 0 NOT NULL,
	"mensagens_saida" integer DEFAULT 0 NOT NULL,
	"espera_fila_seg" integer DEFAULT 0 NOT NULL,
	"espera_fila_n" integer DEFAULT 0 NOT NULL,
	"primeira_resposta_seg" integer DEFAULT 0 NOT NULL,
	"primeira_resposta_n" integer DEFAULT 0 NOT NULL,
	"atendimento_seg" integer DEFAULT 0 NOT NULL,
	"atendimento_n" integer DEFAULT 0 NOT NULL,
	"sla_cumpridos" integer DEFAULT 0 NOT NULL,
	"sla_estourados" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone,
	CONSTRAINT "metrica_diaria_dimensao_tipo_ck" CHECK ("dimensao_tipo" in ('fila', 'atendente', 'equipe', 'inbox', 'etiqueta'))
);
--> statement-breakpoint
CREATE TABLE "pesquisa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"escala_min" smallint NOT NULL,
	"escala_max" smallint NOT NULL,
	"pergunta" text NOT NULL,
	"disparo" text DEFAULT 'encerramento' NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone,
	CONSTRAINT "pesquisa_tipo_ck" CHECK ("tipo" in ('csat', 'nps'))
);
--> statement-breakpoint
CREATE TABLE "regra_fila" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"combinador" text DEFAULT 'e' NOT NULL,
	"fila_destino_id" uuid NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone,
	CONSTRAINT "regra_fila_combinador_ck" CHECK ("combinador" in ('e', 'ou'))
);
--> statement-breakpoint
CREATE TABLE "regra_fila_condicao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"regra_id" uuid NOT NULL,
	"campo" text NOT NULL,
	"operador" text NOT NULL,
	"valor" text
);
--> statement-breakpoint
CREATE TABLE "regra_prioridade" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"nivel" text NOT NULL,
	"escopo_tipo" text DEFAULT 'tenant' NOT NULL,
	"escopo_id" uuid,
	"condicao" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone,
	CONSTRAINT "regra_prioridade_nivel_ck" CHECK ("nivel" in ('baixa', 'media', 'alta')),
	CONSTRAINT "regra_prioridade_escopo_tipo_ck" CHECK ("escopo_tipo" in ('tenant', 'fila', 'inbox', 'equipe', 'etiqueta'))
);
--> statement-breakpoint
CREATE TABLE "regra_sla" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"alvo" text NOT NULL,
	"prazo_seg" integer NOT NULL,
	"alerta_seg" integer,
	"escopo_tipo" text DEFAULT 'tenant' NOT NULL,
	"escopo_id" uuid,
	"acao_alerta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"acao_estouro" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone,
	CONSTRAINT "regra_sla_alvo_ck" CHECK ("alvo" in ('primeira_resposta', 'resposta', 'resolucao', 'espera_fila')),
	CONSTRAINT "regra_sla_escopo_tipo_ck" CHECK ("escopo_tipo" in ('tenant', 'fila', 'inbox', 'equipe', 'etiqueta'))
);
--> statement-breakpoint
CREATE TABLE "resposta_pesquisa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"conversa_id" uuid NOT NULL,
	"pesquisa_id" uuid NOT NULL,
	"nota" smallint,
	"escala_min" smallint NOT NULL,
	"escala_max" smallint NOT NULL,
	"classe" text,
	"comentario" text,
	"respondida_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sla_conversa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"conversa_id" uuid NOT NULL,
	"regra_id" uuid NOT NULL,
	"prazo_em" timestamp with time zone NOT NULL,
	"alertado_em" timestamp with time zone,
	"estourado_em" timestamp with time zone,
	"estado" text DEFAULT 'correndo' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone,
	CONSTRAINT "sla_conversa_estado_ck" CHECK ("estado" in ('correndo', 'alertado', 'estourado', 'cumprido', 'cancelado'))
);
--> statement-breakpoint
CREATE TABLE "atividade" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"lead_id" uuid,
	"conta_id" uuid,
	"conversa_id" uuid,
	"usuario_id" uuid,
	"resumo" text,
	"corpo" text,
	"ocorrida_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "atividade_tipo_ck" CHECK ("tipo" in ('nota', 'ligacao', 'reuniao', 'email', 'conversa', 'tarefa', 'mudanca_fase'))
);
--> statement-breakpoint
CREATE TABLE "campo_customizado" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"objeto" text NOT NULL,
	"codigo" text NOT NULL,
	"rotulo" text NOT NULL,
	"tipo" text NOT NULL,
	"opcoes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone,
	CONSTRAINT "campo_customizado_objeto_ck" CHECK ("objeto" in ('lead', 'conta', 'contato', 'oportunidade')),
	CONSTRAINT "campo_customizado_tipo_ck" CHECK ("tipo" in ('texto', 'texto_longo', 'numero', 'data', 'booleano', 'selecao_unica', 'selecao_multipla'))
);
--> statement-breakpoint
CREATE TABLE "conta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"documento" text,
	"dominio" text,
	"atributos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"proprietario_id" uuid,
	"excluido_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "faixa_score" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"versao" integer NOT NULL,
	"nome" text NOT NULL,
	"minimo" integer NOT NULL,
	"maximo" integer NOT NULL,
	"fila_id" uuid,
	"estrategia_proprietario" text DEFAULT 'nenhuma' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone,
	CONSTRAINT "faixa_score_estrategia_ck" CHECK ("estrategia_proprietario" in ('rodizio', 'menor_carga', 'fixo', 'nenhuma'))
);
--> statement-breakpoint
CREATE TABLE "formulario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"slug" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "formulario_pergunta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"versao_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"rotulo" text NOT NULL,
	"tipo" text NOT NULL,
	"opcoes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"obrigatoria" boolean DEFAULT false NOT NULL,
	CONSTRAINT "formulario_pergunta_tipo_ck" CHECK ("tipo" in ('texto', 'texto_longo', 'numero', 'data', 'booleano', 'selecao_unica', 'selecao_multipla'))
);
--> statement-breakpoint
CREATE TABLE "formulario_versao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"formulario_id" uuid NOT NULL,
	"versao" integer NOT NULL,
	"publicada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "importacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"origem" text NOT NULL,
	"arquivo" text,
	"mapeamento" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"estado" text DEFAULT 'rascunho' NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"aceitos" integer DEFAULT 0 NOT NULL,
	"rejeitados" integer DEFAULT 0 NOT NULL,
	"chave_relatorio" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone,
	CONSTRAINT "importacao_origem_ck" CHECK ("origem" in ('salesforce', 'hubspot', 'rd_station', 'csv')),
	CONSTRAINT "importacao_estado_ck" CHECK ("estado" in ('rascunho', 'validando', 'pronta', 'executando', 'concluida', 'falhou'))
);
--> statement-breakpoint
CREATE TABLE "lead" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contato_id" uuid,
	"conta_id" uuid,
	"origem" text,
	"campanha" text,
	"utm" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'novo' NOT NULL,
	"fase" text,
	"fase_desde" timestamp with time zone,
	"proprietario_id" uuid,
	"score_atual" integer,
	"faixa_atual" text,
	"desqualificado_em" timestamp with time zone,
	"motivo_desqualificacao_id" uuid,
	"customizados" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"excluido_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone,
	CONSTRAINT "lead_status_ck" CHECK ("status" in ('novo', 'em_contato', 'qualificado', 'convertido', 'desqualificado'))
);
--> statement-breakpoint
CREATE TABLE "oportunidade" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lead_id" uuid,
	"conta_id" uuid,
	"nome" text NOT NULL,
	"valor" numeric(14, 2),
	"moeda" text DEFAULT 'BRL' NOT NULL,
	"fase" text NOT NULL,
	"probabilidade" smallint,
	"fechamento_previsto" date,
	"fechada_em" timestamp with time zone,
	"ganha" boolean,
	"motivo_perda" text,
	"proprietario_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "regra_score" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"versao" integer NOT NULL,
	"nome" text NOT NULL,
	"condicao" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pontos" integer NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "resposta_formulario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"versao_id" uuid NOT NULL,
	"pergunta_id" uuid NOT NULL,
	"valor_texto" text,
	"valor_num" numeric(20, 6),
	"valor_data" timestamp with time zone,
	"valor_bool" boolean,
	"valor_json" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "score_lead" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"versao_regra" integer NOT NULL,
	"valor" integer NOT NULL,
	"faixa" text,
	"explicacao" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"calculado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "avaliacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"conversa_id" uuid NOT NULL,
	"formulario_id" uuid NOT NULL,
	"avaliado_id" uuid NOT NULL,
	"avaliador_tipo" text NOT NULL,
	"avaliador_id" uuid,
	"nota" numeric(6, 2),
	"conceito" text,
	"confianca_ia" numeric(5, 4),
	"estado" text DEFAULT 'rascunho' NOT NULL,
	"avaliada_em" timestamp with time zone,
	"revisada_por" uuid,
	"revisada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone,
	CONSTRAINT "avaliacao_avaliador_tipo_ck" CHECK ("avaliador_tipo" in ('humano', 'ia')),
	CONSTRAINT "avaliacao_estado_ck" CHECK ("estado" in ('rascunho', 'concluida', 'contestada', 'revisada', 'encerrada'))
);
--> statement-breakpoint
CREATE TABLE "base_conhecimento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "calibracao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"periodo_inicio" date NOT NULL,
	"periodo_fim" date NOT NULL,
	"amostra_n" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "calibracao_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"calibracao_id" uuid NOT NULL,
	"conversa_id" uuid NOT NULL,
	"avaliacao_humana_id" uuid,
	"avaliacao_ia_id" uuid,
	"desvio_total" numeric(6, 2),
	"desvio_por_criterio" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classificacao_conversa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"conversa_id" uuid NOT NULL,
	"categoria" text,
	"subcategoria" text,
	"resumo" text,
	"intencao" text,
	"sentimento" text,
	"confianca" numeric(5, 4),
	"modelo" text,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classificacao_conversa_sentimento_ck" CHECK ("sentimento" in ('positivo', 'neutro', 'negativo'))
);
--> statement-breakpoint
CREATE TABLE "consumo_ia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"funcionalidade" text NOT NULL,
	"modelo" text NOT NULL,
	"tokens_entrada" integer DEFAULT 0 NOT NULL,
	"tokens_saida" integer DEFAULT 0 NOT NULL,
	"custo_centavos" integer DEFAULT 0 NOT NULL,
	"objeto_tipo" text,
	"objeto_id" uuid,
	"em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contestacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"avaliacao_id" uuid NOT NULL,
	"aberta_por" uuid NOT NULL,
	"motivo" text NOT NULL,
	"estado" text DEFAULT 'aberta' NOT NULL,
	"resposta" text,
	"decidida_por" uuid,
	"decidida_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone,
	CONSTRAINT "contestacao_estado_ck" CHECK ("estado" in ('aberta', 'aceita', 'recusada'))
);
--> statement-breakpoint
CREATE TABLE "criterio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"grupo_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"peso" numeric(6, 2) DEFAULT '1' NOT NULL,
	"tipo" text DEFAULT 'conforme' NOT NULL,
	"fatal" boolean DEFAULT false NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "criterio_tipo_ck" CHECK ("tipo" in ('conforme', 'escala', 'nota'))
);
--> statement-breakpoint
CREATE TABLE "documento_conhecimento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"base_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"corpo" text NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	"atualizado_em" timestamp with time zone,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"avaliacao_id" uuid NOT NULL,
	"de_usuario_id" uuid,
	"para_usuario_id" uuid NOT NULL,
	"corpo" text NOT NULL,
	"lido_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "formulario_avaliacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	"nota_maxima" numeric(6, 2) DEFAULT '100' NOT NULL,
	"escopo_fila_id" uuid,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "grupo_criterio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"formulario_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"peso" numeric(6, 2) DEFAULT '1' NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insight" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"periodo_inicio" date NOT NULL,
	"periodo_fim" date NOT NULL,
	"categoria" text NOT NULL,
	"volume" integer DEFAULT 0 NOT NULL,
	"variacao_pct" numeric(8, 2),
	"candidata_automacao" boolean DEFAULT false NOT NULL,
	"exemplos" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "plano_coach" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"criterio_id" uuid,
	"meta" text NOT NULL,
	"prazo" date,
	"estado" text DEFAULT 'aberto' NOT NULL,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone,
	CONSTRAINT "plano_coach_estado_ck" CHECK ("estado" in ('aberto', 'em_andamento', 'concluido', 'cancelado'))
);
--> statement-breakpoint
CREATE TABLE "resposta_avaliacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"avaliacao_id" uuid NOT NULL,
	"criterio_id" uuid NOT NULL,
	"valor" text,
	"pontos" numeric(6, 2),
	"justificativa" text,
	"evidencia_mensagem_id" uuid
);
--> statement-breakpoint
CREATE TABLE "trecho_conhecimento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"documento_id" uuid NOT NULL,
	"texto" text NOT NULL,
	"embedding" vector(1536),
	"ordem" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "acao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"tipo" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"on_erro" text DEFAULT 'parar' NOT NULL,
	CONSTRAINT "acao_tipo_ck" CHECK ("tipo" in ('criar_registro', 'atualizar_registro', 'enviar_mensagem', 'enviar_template', 'atribuir_proprietario', 'mover_fila', 'criar_avaliacao', 'http', 'funcao', 'agente_ia')),
	CONSTRAINT "acao_on_erro_ck" CHECK ("on_erro" in ('parar', 'continuar', 'repetir'))
);
--> statement-breakpoint
CREATE TABLE "agendamento_consulta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"consulta_id" uuid NOT NULL,
	"cron" text NOT NULL,
	"formato" text DEFAULT 'csv' NOT NULL,
	"destino" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ultima_execucao_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone,
	CONSTRAINT "agendamento_consulta_formato_ck" CHECK ("formato" in ('csv', 'json', 'parquet'))
);
--> statement-breakpoint
CREATE TABLE "bloco" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"versao_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"nome" text NOT NULL,
	"tipo" text NOT NULL,
	"conteudo" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"posicao" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "bloco_tipo_ck" CHECK ("tipo" in ('inicio', 'mensagem', 'pergunta', 'condicao', 'chamada_externa', 'script', 'ia', 'transferencia', 'fim'))
);
--> statement-breakpoint
CREATE TABLE "consulta_salva" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"texto" text NOT NULL,
	"parametros" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"criada_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dicionario_campo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"objeto_codigo" text NOT NULL,
	"codigo" text NOT NULL,
	"rotulo" text NOT NULL,
	"tipo" text NOT NULL,
	"descricao" text,
	"consultavel" boolean DEFAULT true NOT NULL,
	"agregavel" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dicionario_objeto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"rotulo" text NOT NULL,
	"descricao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "entrega_webhook" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"webhook_id" uuid NOT NULL,
	"evento" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"estado" text DEFAULT 'pendente' NOT NULL,
	"ultimo_erro" text,
	"proxima_tentativa_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entrega_webhook_estado_ck" CHECK ("estado" in ('pendente', 'entregue', 'falhou', 'descartada'))
);
--> statement-breakpoint
CREATE TABLE "execucao_acao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"execucao_workflow_id" uuid NOT NULL,
	"acao_id" uuid,
	"entrada" jsonb,
	"saida" jsonb,
	"erro" text,
	"duracao_ms" integer,
	"em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execucao_fluxo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"fluxo_versao_id" uuid NOT NULL,
	"conversa_id" uuid,
	"contato_id" uuid,
	"estado" text DEFAULT 'executando' NOT NULL,
	"contexto" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"bloco_atual_id" uuid,
	"iniciada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"encerrada_em" timestamp with time zone,
	CONSTRAINT "execucao_fluxo_estado_ck" CHECK ("estado" in ('executando', 'aguardando', 'concluida', 'falhou', 'cancelada'))
);
--> statement-breakpoint
CREATE TABLE "execucao_passo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"execucao_id" uuid NOT NULL,
	"bloco_id" uuid,
	"entrada" jsonb,
	"saida" jsonb,
	"erro" text,
	"duracao_ms" integer,
	"tokens" integer,
	"em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execucao_workflow" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"payload_gatilho" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"estado" text DEFAULT 'executando' NOT NULL,
	"iniciada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"encerrada_em" timestamp with time zone,
	"erro" text,
	CONSTRAINT "execucao_workflow_estado_ck" CHECK ("estado" in ('executando', 'aguardando', 'concluida', 'falhou', 'cancelada'))
);
--> statement-breakpoint
CREATE TABLE "fluxo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"canal_id" uuid,
	"estado" text DEFAULT 'rascunho' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone,
	CONSTRAINT "fluxo_estado_ck" CHECK ("estado" in ('rascunho', 'publicado', 'arquivado'))
);
--> statement-breakpoint
CREATE TABLE "fluxo_versao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"fluxo_id" uuid NOT NULL,
	"versao" integer NOT NULL,
	"estado" text DEFAULT 'rascunho' NOT NULL,
	"publicada_em" timestamp with time zone,
	"publicada_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone,
	CONSTRAINT "fluxo_versao_estado_ck" CHECK ("estado" in ('rascunho', 'publicada', 'arquivada'))
);
--> statement-breakpoint
CREATE TABLE "gatilho" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "gatilho_tipo_ck" CHECK ("tipo" in ('evento', 'agendado', 'manual', 'webhook'))
);
--> statement-breakpoint
CREATE TABLE "transicao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"versao_id" uuid NOT NULL,
	"de_bloco_id" uuid NOT NULL,
	"para_bloco_id" uuid NOT NULL,
	"condicao" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_saida" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"url" text NOT NULL,
	"eventos" text[] DEFAULT '{}'::text[] NOT NULL,
	"segredo" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workflow" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	"ativo" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "chave_api" ADD CONSTRAINT "chave_api_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chave_api" ADD CONSTRAINT "chave_api_criada_por_usuario_id_fk" FOREIGN KEY ("criada_por") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipe" ADD CONSTRAINT "equipe_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_auditoria" ADD CONSTRAINT "log_auditoria_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membro_equipe" ADD CONSTRAINT "membro_equipe_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membro_equipe" ADD CONSTRAINT "membro_equipe_equipe_id_equipe_id_fk" FOREIGN KEY ("equipe_id") REFERENCES "public"."equipe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membro_equipe" ADD CONSTRAINT "membro_equipe_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "papel" ADD CONSTRAINT "papel_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "papel_permissao" ADD CONSTRAINT "papel_permissao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "papel_permissao" ADD CONSTRAINT "papel_permissao_papel_id_papel_id_fk" FOREIGN KEY ("papel_id") REFERENCES "public"."papel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "papel_permissao" ADD CONSTRAINT "papel_permissao_permissao_codigo_permissao_codigo_fk" FOREIGN KEY ("permissao_codigo") REFERENCES "public"."permissao"("codigo") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessao" ADD CONSTRAINT "sessao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessao" ADD CONSTRAINT "sessao_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_papel" ADD CONSTRAINT "usuario_papel_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_papel" ADD CONSTRAINT "usuario_papel_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_papel" ADD CONSTRAINT "usuario_papel_papel_id_papel_id_fk" FOREIGN KEY ("papel_id") REFERENCES "public"."papel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anexo" ADD CONSTRAINT "anexo_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atribuicao" ADD CONSTRAINT "atribuicao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atribuicao" ADD CONSTRAINT "atribuicao_conversa_id_conversa_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atribuicao" ADD CONSTRAINT "atribuicao_de_usuario_id_usuario_id_fk" FOREIGN KEY ("de_usuario_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atribuicao" ADD CONSTRAINT "atribuicao_para_usuario_id_usuario_id_fk" FOREIGN KEY ("para_usuario_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atribuicao" ADD CONSTRAINT "atribuicao_de_fila_id_fila_id_fk" FOREIGN KEY ("de_fila_id") REFERENCES "public"."fila"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atribuicao" ADD CONSTRAINT "atribuicao_para_fila_id_fila_id_fk" FOREIGN KEY ("para_fila_id") REFERENCES "public"."fila"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atribuicao" ADD CONSTRAINT "atribuicao_por_usuario_id_usuario_id_fk" FOREIGN KEY ("por_usuario_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canal" ADD CONSTRAINT "canal_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contato" ADD CONSTRAINT "contato_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contato_etiqueta" ADD CONSTRAINT "contato_etiqueta_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contato_etiqueta" ADD CONSTRAINT "contato_etiqueta_contato_id_contato_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contato"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contato_etiqueta" ADD CONSTRAINT "contato_etiqueta_etiqueta_id_etiqueta_id_fk" FOREIGN KEY ("etiqueta_id") REFERENCES "public"."etiqueta"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contato_identidade" ADD CONSTRAINT "contato_identidade_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contato_identidade" ADD CONSTRAINT "contato_identidade_contato_id_contato_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contato"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversa" ADD CONSTRAINT "conversa_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversa" ADD CONSTRAINT "conversa_inbox_id_inbox_id_fk" FOREIGN KEY ("inbox_id") REFERENCES "public"."inbox"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversa" ADD CONSTRAINT "conversa_contato_id_contato_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contato"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversa" ADD CONSTRAINT "conversa_fila_id_fila_id_fk" FOREIGN KEY ("fila_id") REFERENCES "public"."fila"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversa" ADD CONSTRAINT "conversa_atendente_id_usuario_id_fk" FOREIGN KEY ("atendente_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversa" ADD CONSTRAINT "conversa_encerrada_por_usuario_id_fk" FOREIGN KEY ("encerrada_por") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversa_etiqueta" ADD CONSTRAINT "conversa_etiqueta_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversa_etiqueta" ADD CONSTRAINT "conversa_etiqueta_conversa_id_conversa_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversa_etiqueta" ADD CONSTRAINT "conversa_etiqueta_etiqueta_id_etiqueta_id_fk" FOREIGN KEY ("etiqueta_id") REFERENCES "public"."etiqueta"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversa_etiqueta" ADD CONSTRAINT "conversa_etiqueta_por_usuario_id_usuario_id_fk" FOREIGN KEY ("por_usuario_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etiqueta" ADD CONSTRAINT "etiqueta_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fila" ADD CONSTRAINT "fila_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fila_atendente" ADD CONSTRAINT "fila_atendente_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fila_atendente" ADD CONSTRAINT "fila_atendente_fila_id_fila_id_fk" FOREIGN KEY ("fila_id") REFERENCES "public"."fila"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fila_atendente" ADD CONSTRAINT "fila_atendente_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox" ADD CONSTRAINT "inbox_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox" ADD CONSTRAINT "inbox_canal_id_canal_id_fk" FOREIGN KEY ("canal_id") REFERENCES "public"."canal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox" ADD CONSTRAINT "inbox_fila_padrao_id_fila_id_fk" FOREIGN KEY ("fila_padrao_id") REFERENCES "public"."fila"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagem" ADD CONSTRAINT "mensagem_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagem" ADD CONSTRAINT "mensagem_conversa_id_conversa_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagem" ADD CONSTRAINT "mensagem_anexo_id_anexo_id_fk" FOREIGN KEY ("anexo_id") REFERENCES "public"."anexo"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagem" ADD CONSTRAINT "mensagem_resposta_pronta_id_resposta_pronta_id_fk" FOREIGN KEY ("resposta_pronta_id") REFERENCES "public"."resposta_pronta"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagem" ADD CONSTRAINT "mensagem_template_id_template_mensagem_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."template_mensagem"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motivo_pausa" ADD CONSTRAINT "motivo_pausa_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota_interna" ADD CONSTRAINT "nota_interna_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota_interna" ADD CONSTRAINT "nota_interna_conversa_id_conversa_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota_interna" ADD CONSTRAINT "nota_interna_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_mensagem" ADD CONSTRAINT "outbox_mensagem_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pausa" ADD CONSTRAINT "pausa_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pausa" ADD CONSTRAINT "pausa_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pausa" ADD CONSTRAINT "pausa_motivo_id_motivo_pausa_id_fk" FOREIGN KEY ("motivo_id") REFERENCES "public"."motivo_pausa"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resposta_pronta" ADD CONSTRAINT "resposta_pronta_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resposta_pronta" ADD CONSTRAINT "resposta_pronta_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_atendente" ADD CONSTRAINT "status_atendente_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_atendente" ADD CONSTRAINT "status_atendente_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_mensagem" ADD CONSTRAINT "template_mensagem_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_mensagem" ADD CONSTRAINT "template_mensagem_canal_id_canal_id_fk" FOREIGN KEY ("canal_id") REFERENCES "public"."canal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esforco_atendente_dia" ADD CONSTRAINT "esforco_atendente_dia_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esforco_atendente_dia" ADD CONSTRAINT "esforco_atendente_dia_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esforco_conversa" ADD CONSTRAINT "esforco_conversa_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esforco_conversa" ADD CONSTRAINT "esforco_conversa_conversa_id_conversa_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esforco_conversa" ADD CONSTRAINT "esforco_conversa_atendente_id_usuario_id_fk" FOREIGN KEY ("atendente_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_atendimento" ADD CONSTRAINT "evento_atendimento_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_atendimento" ADD CONSTRAINT "evento_atendimento_conversa_id_conversa_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_atendimento" ADD CONSTRAINT "evento_atendimento_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_atendimento" ADD CONSTRAINT "evento_atendimento_fila_id_fila_id_fk" FOREIGN KEY ("fila_id") REFERENCES "public"."fila"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horario_atendimento" ADD CONSTRAINT "horario_atendimento_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horario_excecao" ADD CONSTRAINT "horario_excecao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horario_excecao" ADD CONSTRAINT "horario_excecao_horario_id_horario_atendimento_id_fk" FOREIGN KEY ("horario_id") REFERENCES "public"."horario_atendimento"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horario_faixa" ADD CONSTRAINT "horario_faixa_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horario_faixa" ADD CONSTRAINT "horario_faixa_horario_id_horario_atendimento_id_fk" FOREIGN KEY ("horario_id") REFERENCES "public"."horario_atendimento"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrica_diaria" ADD CONSTRAINT "metrica_diaria_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pesquisa" ADD CONSTRAINT "pesquisa_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regra_fila" ADD CONSTRAINT "regra_fila_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regra_fila" ADD CONSTRAINT "regra_fila_fila_destino_id_fila_id_fk" FOREIGN KEY ("fila_destino_id") REFERENCES "public"."fila"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regra_fila_condicao" ADD CONSTRAINT "regra_fila_condicao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regra_fila_condicao" ADD CONSTRAINT "regra_fila_condicao_regra_id_regra_fila_id_fk" FOREIGN KEY ("regra_id") REFERENCES "public"."regra_fila"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regra_prioridade" ADD CONSTRAINT "regra_prioridade_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regra_sla" ADD CONSTRAINT "regra_sla_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resposta_pesquisa" ADD CONSTRAINT "resposta_pesquisa_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resposta_pesquisa" ADD CONSTRAINT "resposta_pesquisa_conversa_id_conversa_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resposta_pesquisa" ADD CONSTRAINT "resposta_pesquisa_pesquisa_id_pesquisa_id_fk" FOREIGN KEY ("pesquisa_id") REFERENCES "public"."pesquisa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_conversa" ADD CONSTRAINT "sla_conversa_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_conversa" ADD CONSTRAINT "sla_conversa_conversa_id_conversa_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_conversa" ADD CONSTRAINT "sla_conversa_regra_id_regra_sla_id_fk" FOREIGN KEY ("regra_id") REFERENCES "public"."regra_sla"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atividade" ADD CONSTRAINT "atividade_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atividade" ADD CONSTRAINT "atividade_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atividade" ADD CONSTRAINT "atividade_conta_id_conta_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."conta"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atividade" ADD CONSTRAINT "atividade_conversa_id_conversa_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversa"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atividade" ADD CONSTRAINT "atividade_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campo_customizado" ADD CONSTRAINT "campo_customizado_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conta" ADD CONSTRAINT "conta_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conta" ADD CONSTRAINT "conta_proprietario_id_usuario_id_fk" FOREIGN KEY ("proprietario_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faixa_score" ADD CONSTRAINT "faixa_score_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faixa_score" ADD CONSTRAINT "faixa_score_fila_id_fila_id_fk" FOREIGN KEY ("fila_id") REFERENCES "public"."fila"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formulario" ADD CONSTRAINT "formulario_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formulario_pergunta" ADD CONSTRAINT "formulario_pergunta_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formulario_pergunta" ADD CONSTRAINT "formulario_pergunta_versao_id_formulario_versao_id_fk" FOREIGN KEY ("versao_id") REFERENCES "public"."formulario_versao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formulario_versao" ADD CONSTRAINT "formulario_versao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formulario_versao" ADD CONSTRAINT "formulario_versao_formulario_id_formulario_id_fk" FOREIGN KEY ("formulario_id") REFERENCES "public"."formulario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacao" ADD CONSTRAINT "importacao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_contato_id_contato_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contato"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_conta_id_conta_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."conta"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_proprietario_id_usuario_id_fk" FOREIGN KEY ("proprietario_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidade" ADD CONSTRAINT "oportunidade_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidade" ADD CONSTRAINT "oportunidade_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidade" ADD CONSTRAINT "oportunidade_conta_id_conta_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."conta"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidade" ADD CONSTRAINT "oportunidade_proprietario_id_usuario_id_fk" FOREIGN KEY ("proprietario_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regra_score" ADD CONSTRAINT "regra_score_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resposta_formulario" ADD CONSTRAINT "resposta_formulario_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resposta_formulario" ADD CONSTRAINT "resposta_formulario_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resposta_formulario" ADD CONSTRAINT "resposta_formulario_versao_id_formulario_versao_id_fk" FOREIGN KEY ("versao_id") REFERENCES "public"."formulario_versao"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resposta_formulario" ADD CONSTRAINT "resposta_formulario_pergunta_id_formulario_pergunta_id_fk" FOREIGN KEY ("pergunta_id") REFERENCES "public"."formulario_pergunta"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_lead" ADD CONSTRAINT "score_lead_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_lead" ADD CONSTRAINT "score_lead_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avaliacao" ADD CONSTRAINT "avaliacao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avaliacao" ADD CONSTRAINT "avaliacao_conversa_id_conversa_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avaliacao" ADD CONSTRAINT "avaliacao_formulario_id_formulario_avaliacao_id_fk" FOREIGN KEY ("formulario_id") REFERENCES "public"."formulario_avaliacao"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avaliacao" ADD CONSTRAINT "avaliacao_avaliado_id_usuario_id_fk" FOREIGN KEY ("avaliado_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avaliacao" ADD CONSTRAINT "avaliacao_avaliador_id_usuario_id_fk" FOREIGN KEY ("avaliador_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avaliacao" ADD CONSTRAINT "avaliacao_revisada_por_usuario_id_fk" FOREIGN KEY ("revisada_por") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "base_conhecimento" ADD CONSTRAINT "base_conhecimento_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibracao" ADD CONSTRAINT "calibracao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibracao_item" ADD CONSTRAINT "calibracao_item_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibracao_item" ADD CONSTRAINT "calibracao_item_calibracao_id_calibracao_id_fk" FOREIGN KEY ("calibracao_id") REFERENCES "public"."calibracao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibracao_item" ADD CONSTRAINT "calibracao_item_conversa_id_conversa_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibracao_item" ADD CONSTRAINT "calibracao_item_avaliacao_humana_id_avaliacao_id_fk" FOREIGN KEY ("avaliacao_humana_id") REFERENCES "public"."avaliacao"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibracao_item" ADD CONSTRAINT "calibracao_item_avaliacao_ia_id_avaliacao_id_fk" FOREIGN KEY ("avaliacao_ia_id") REFERENCES "public"."avaliacao"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classificacao_conversa" ADD CONSTRAINT "classificacao_conversa_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classificacao_conversa" ADD CONSTRAINT "classificacao_conversa_conversa_id_conversa_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumo_ia" ADD CONSTRAINT "consumo_ia_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contestacao" ADD CONSTRAINT "contestacao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contestacao" ADD CONSTRAINT "contestacao_avaliacao_id_avaliacao_id_fk" FOREIGN KEY ("avaliacao_id") REFERENCES "public"."avaliacao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contestacao" ADD CONSTRAINT "contestacao_aberta_por_usuario_id_fk" FOREIGN KEY ("aberta_por") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contestacao" ADD CONSTRAINT "contestacao_decidida_por_usuario_id_fk" FOREIGN KEY ("decidida_por") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "criterio" ADD CONSTRAINT "criterio_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "criterio" ADD CONSTRAINT "criterio_grupo_id_grupo_criterio_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupo_criterio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_conhecimento" ADD CONSTRAINT "documento_conhecimento_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_conhecimento" ADD CONSTRAINT "documento_conhecimento_base_id_base_conhecimento_id_fk" FOREIGN KEY ("base_id") REFERENCES "public"."base_conhecimento"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_avaliacao_id_avaliacao_id_fk" FOREIGN KEY ("avaliacao_id") REFERENCES "public"."avaliacao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_de_usuario_id_usuario_id_fk" FOREIGN KEY ("de_usuario_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_para_usuario_id_usuario_id_fk" FOREIGN KEY ("para_usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formulario_avaliacao" ADD CONSTRAINT "formulario_avaliacao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formulario_avaliacao" ADD CONSTRAINT "formulario_avaliacao_escopo_fila_id_fila_id_fk" FOREIGN KEY ("escopo_fila_id") REFERENCES "public"."fila"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grupo_criterio" ADD CONSTRAINT "grupo_criterio_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grupo_criterio" ADD CONSTRAINT "grupo_criterio_formulario_id_formulario_avaliacao_id_fk" FOREIGN KEY ("formulario_id") REFERENCES "public"."formulario_avaliacao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight" ADD CONSTRAINT "insight_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plano_coach" ADD CONSTRAINT "plano_coach_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plano_coach" ADD CONSTRAINT "plano_coach_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plano_coach" ADD CONSTRAINT "plano_coach_criterio_id_criterio_id_fk" FOREIGN KEY ("criterio_id") REFERENCES "public"."criterio"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plano_coach" ADD CONSTRAINT "plano_coach_criado_por_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resposta_avaliacao" ADD CONSTRAINT "resposta_avaliacao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resposta_avaliacao" ADD CONSTRAINT "resposta_avaliacao_avaliacao_id_avaliacao_id_fk" FOREIGN KEY ("avaliacao_id") REFERENCES "public"."avaliacao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resposta_avaliacao" ADD CONSTRAINT "resposta_avaliacao_criterio_id_criterio_id_fk" FOREIGN KEY ("criterio_id") REFERENCES "public"."criterio"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trecho_conhecimento" ADD CONSTRAINT "trecho_conhecimento_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trecho_conhecimento" ADD CONSTRAINT "trecho_conhecimento_documento_id_documento_conhecimento_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documento_conhecimento"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acao" ADD CONSTRAINT "acao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acao" ADD CONSTRAINT "acao_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agendamento_consulta" ADD CONSTRAINT "agendamento_consulta_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agendamento_consulta" ADD CONSTRAINT "agendamento_consulta_consulta_id_consulta_salva_id_fk" FOREIGN KEY ("consulta_id") REFERENCES "public"."consulta_salva"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bloco" ADD CONSTRAINT "bloco_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bloco" ADD CONSTRAINT "bloco_versao_id_fluxo_versao_id_fk" FOREIGN KEY ("versao_id") REFERENCES "public"."fluxo_versao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consulta_salva" ADD CONSTRAINT "consulta_salva_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consulta_salva" ADD CONSTRAINT "consulta_salva_criada_por_usuario_id_fk" FOREIGN KEY ("criada_por") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dicionario_campo" ADD CONSTRAINT "dicionario_campo_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dicionario_objeto" ADD CONSTRAINT "dicionario_objeto_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrega_webhook" ADD CONSTRAINT "entrega_webhook_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrega_webhook" ADD CONSTRAINT "entrega_webhook_webhook_id_webhook_saida_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhook_saida"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execucao_acao" ADD CONSTRAINT "execucao_acao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execucao_acao" ADD CONSTRAINT "execucao_acao_execucao_workflow_id_execucao_workflow_id_fk" FOREIGN KEY ("execucao_workflow_id") REFERENCES "public"."execucao_workflow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execucao_acao" ADD CONSTRAINT "execucao_acao_acao_id_acao_id_fk" FOREIGN KEY ("acao_id") REFERENCES "public"."acao"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execucao_fluxo" ADD CONSTRAINT "execucao_fluxo_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execucao_fluxo" ADD CONSTRAINT "execucao_fluxo_fluxo_versao_id_fluxo_versao_id_fk" FOREIGN KEY ("fluxo_versao_id") REFERENCES "public"."fluxo_versao"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execucao_fluxo" ADD CONSTRAINT "execucao_fluxo_conversa_id_conversa_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execucao_fluxo" ADD CONSTRAINT "execucao_fluxo_contato_id_contato_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contato"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execucao_fluxo" ADD CONSTRAINT "execucao_fluxo_bloco_atual_id_bloco_id_fk" FOREIGN KEY ("bloco_atual_id") REFERENCES "public"."bloco"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execucao_passo" ADD CONSTRAINT "execucao_passo_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execucao_passo" ADD CONSTRAINT "execucao_passo_execucao_id_execucao_fluxo_id_fk" FOREIGN KEY ("execucao_id") REFERENCES "public"."execucao_fluxo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execucao_passo" ADD CONSTRAINT "execucao_passo_bloco_id_bloco_id_fk" FOREIGN KEY ("bloco_id") REFERENCES "public"."bloco"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execucao_workflow" ADD CONSTRAINT "execucao_workflow_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execucao_workflow" ADD CONSTRAINT "execucao_workflow_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fluxo" ADD CONSTRAINT "fluxo_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fluxo" ADD CONSTRAINT "fluxo_canal_id_canal_id_fk" FOREIGN KEY ("canal_id") REFERENCES "public"."canal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fluxo_versao" ADD CONSTRAINT "fluxo_versao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fluxo_versao" ADD CONSTRAINT "fluxo_versao_fluxo_id_fluxo_id_fk" FOREIGN KEY ("fluxo_id") REFERENCES "public"."fluxo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fluxo_versao" ADD CONSTRAINT "fluxo_versao_publicada_por_usuario_id_fk" FOREIGN KEY ("publicada_por") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gatilho" ADD CONSTRAINT "gatilho_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gatilho" ADD CONSTRAINT "gatilho_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transicao" ADD CONSTRAINT "transicao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transicao" ADD CONSTRAINT "transicao_versao_id_fluxo_versao_id_fk" FOREIGN KEY ("versao_id") REFERENCES "public"."fluxo_versao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transicao" ADD CONSTRAINT "transicao_de_bloco_id_bloco_id_fk" FOREIGN KEY ("de_bloco_id") REFERENCES "public"."bloco"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transicao" ADD CONSTRAINT "transicao_para_bloco_id_bloco_id_fk" FOREIGN KEY ("para_bloco_id") REFERENCES "public"."bloco"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_saida" ADD CONSTRAINT "webhook_saida_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow" ADD CONSTRAINT "workflow_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chave_api_prefixo_uk" ON "chave_api" USING btree ("prefixo");--> statement-breakpoint
CREATE INDEX "log_auditoria_objeto_idx" ON "log_auditoria" USING btree ("tenant_id","objeto_tipo","objeto_id","em");--> statement-breakpoint
CREATE INDEX "log_auditoria_em_idx" ON "log_auditoria" USING btree ("tenant_id","em");--> statement-breakpoint
CREATE UNIQUE INDEX "papel_tenant_nome_uk" ON "papel" USING btree ("tenant_id","nome");--> statement-breakpoint
CREATE UNIQUE INDEX "sessao_token_hash_uk" ON "sessao" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessao_usuario_idx" ON "sessao" USING btree ("tenant_id","usuario_id","expira_em");--> statement-breakpoint
CREATE UNIQUE INDEX "usuario_tenant_email_uk" ON "usuario" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "atribuicao_conversa_idx" ON "atribuicao" USING btree ("tenant_id","conversa_id","em");--> statement-breakpoint
CREATE INDEX "canal_tenant_tipo_idx" ON "canal" USING btree ("tenant_id","tipo");--> statement-breakpoint
CREATE INDEX "contato_tenant_telefone_idx" ON "contato" USING btree ("tenant_id","telefone_e164");--> statement-breakpoint
CREATE INDEX "contato_tenant_email_idx" ON "contato" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "contato_tenant_documento_idx" ON "contato" USING btree ("tenant_id","documento");--> statement-breakpoint
CREATE INDEX "contato_atributos_gin" ON "contato" USING gin ("atributos");--> statement-breakpoint
CREATE UNIQUE INDEX "contato_identidade_uk" ON "contato_identidade" USING btree ("tenant_id","canal_tipo","identificador");--> statement-breakpoint
CREATE INDEX "conversa_estado_fila_idx" ON "conversa" USING btree ("tenant_id","estado","fila_id");--> statement-breakpoint
CREATE INDEX "conversa_atendente_estado_idx" ON "conversa" USING btree ("tenant_id","atendente_id","estado");--> statement-breakpoint
CREATE INDEX "conversa_encerrada_idx" ON "conversa" USING btree ("tenant_id","encerrada_em");--> statement-breakpoint
CREATE INDEX "conversa_contato_idx" ON "conversa" USING btree ("tenant_id","contato_id","criada_em" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "etiqueta_tenant_nome_uk" ON "etiqueta" USING btree ("tenant_id","nome");--> statement-breakpoint
CREATE UNIQUE INDEX "fila_tenant_nome_uk" ON "fila" USING btree ("tenant_id","nome");--> statement-breakpoint
CREATE INDEX "inbox_tenant_canal_idx" ON "inbox" USING btree ("tenant_id","canal_id");--> statement-breakpoint
CREATE INDEX "mensagem_conversa_idx" ON "mensagem" USING btree ("tenant_id","conversa_id","criada_em");--> statement-breakpoint
CREATE INDEX "mensagem_falhou_idx" ON "mensagem" USING btree ("estado_entrega") WHERE estado_entrega = 'falhou';--> statement-breakpoint
CREATE INDEX "mensagem_disparo_idx" ON "mensagem" USING btree ("tenant_id","disparo_id");--> statement-breakpoint
CREATE INDEX "nota_interna_conversa_idx" ON "nota_interna" USING btree ("tenant_id","conversa_id","em");--> statement-breakpoint
CREATE INDEX "outbox_mensagem_pendente_idx" ON "outbox_mensagem" USING btree ("estado","proxima_tentativa_em");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_mensagem_mensagem_uk" ON "outbox_mensagem" USING btree ("mensagem_id");--> statement-breakpoint
CREATE INDEX "pausa_usuario_idx" ON "pausa" USING btree ("tenant_id","usuario_id","iniciada_em");--> statement-breakpoint
CREATE INDEX "resposta_pronta_atalho_idx" ON "resposta_pronta" USING btree ("tenant_id","atalho");--> statement-breakpoint
CREATE UNIQUE INDEX "template_mensagem_uk" ON "template_mensagem" USING btree ("tenant_id","canal_id","nome","idioma");--> statement-breakpoint
CREATE UNIQUE INDEX "esforco_atendente_dia_uk" ON "esforco_atendente_dia" USING btree ("tenant_id","dia","usuario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "esforco_conversa_uk" ON "esforco_conversa" USING btree ("conversa_id","atendente_id");--> statement-breakpoint
CREATE INDEX "evento_atendimento_conversa_idx" ON "evento_atendimento" USING btree ("tenant_id","conversa_id","em");--> statement-breakpoint
CREATE INDEX "evento_atendimento_tipo_idx" ON "evento_atendimento" USING btree ("tenant_id","tipo","em");--> statement-breakpoint
CREATE UNIQUE INDEX "horario_excecao_uk" ON "horario_excecao" USING btree ("horario_id","data");--> statement-breakpoint
CREATE INDEX "horario_faixa_horario_idx" ON "horario_faixa" USING btree ("horario_id","dia_semana");--> statement-breakpoint
CREATE UNIQUE INDEX "metrica_diaria_uk" ON "metrica_diaria" USING btree ("tenant_id","dia","dimensao_tipo","dimensao_id");--> statement-breakpoint
CREATE INDEX "regra_fila_ordem_idx" ON "regra_fila" USING btree ("tenant_id","ativa","ordem");--> statement-breakpoint
CREATE INDEX "regra_fila_condicao_regra_idx" ON "regra_fila_condicao" USING btree ("regra_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resposta_pesquisa_uk" ON "resposta_pesquisa" USING btree ("conversa_id","pesquisa_id");--> statement-breakpoint
CREATE INDEX "resposta_pesquisa_periodo_idx" ON "resposta_pesquisa" USING btree ("tenant_id","respondida_em");--> statement-breakpoint
CREATE UNIQUE INDEX "sla_conversa_uk" ON "sla_conversa" USING btree ("conversa_id","regra_id");--> statement-breakpoint
CREATE INDEX "sla_conversa_prazo_idx" ON "sla_conversa" USING btree ("tenant_id","estado","prazo_em");--> statement-breakpoint
CREATE INDEX "atividade_lead_idx" ON "atividade" USING btree ("tenant_id","lead_id","ocorrida_em" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "atividade_conta_idx" ON "atividade" USING btree ("tenant_id","conta_id","ocorrida_em" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "campo_customizado_uk" ON "campo_customizado" USING btree ("tenant_id","objeto","codigo");--> statement-breakpoint
CREATE INDEX "conta_tenant_documento_idx" ON "conta" USING btree ("tenant_id","documento");--> statement-breakpoint
CREATE INDEX "conta_tenant_nome_idx" ON "conta" USING btree ("tenant_id","nome");--> statement-breakpoint
CREATE INDEX "conta_atributos_gin" ON "conta" USING gin ("atributos");--> statement-breakpoint
CREATE UNIQUE INDEX "faixa_score_uk" ON "faixa_score" USING btree ("tenant_id","versao","nome");--> statement-breakpoint
CREATE UNIQUE INDEX "formulario_tenant_slug_uk" ON "formulario" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "formulario_pergunta_uk" ON "formulario_pergunta" USING btree ("versao_id","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "formulario_versao_uk" ON "formulario_versao" USING btree ("formulario_id","versao");--> statement-breakpoint
CREATE INDEX "lead_tenant_status_idx" ON "lead" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "lead_tenant_faixa_idx" ON "lead" USING btree ("tenant_id","faixa_atual");--> statement-breakpoint
CREATE INDEX "lead_tenant_proprietario_idx" ON "lead" USING btree ("tenant_id","proprietario_id");--> statement-breakpoint
CREATE INDEX "lead_customizados_gin" ON "lead" USING gin ("customizados");--> statement-breakpoint
CREATE INDEX "oportunidade_tenant_fase_idx" ON "oportunidade" USING btree ("tenant_id","fase");--> statement-breakpoint
CREATE INDEX "oportunidade_tenant_fechamento_idx" ON "oportunidade" USING btree ("tenant_id","fechamento_previsto");--> statement-breakpoint
CREATE INDEX "regra_score_versao_idx" ON "regra_score" USING btree ("tenant_id","versao","ativa");--> statement-breakpoint
CREATE UNIQUE INDEX "resposta_formulario_uk" ON "resposta_formulario" USING btree ("lead_id","pergunta_id");--> statement-breakpoint
CREATE INDEX "resposta_formulario_pergunta_idx" ON "resposta_formulario" USING btree ("tenant_id","pergunta_id");--> statement-breakpoint
CREATE INDEX "score_lead_lead_idx" ON "score_lead" USING btree ("tenant_id","lead_id","calculado_em" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "avaliacao_avaliado_idx" ON "avaliacao" USING btree ("tenant_id","avaliado_id","avaliada_em" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "avaliacao_conversa_idx" ON "avaliacao" USING btree ("tenant_id","conversa_id");--> statement-breakpoint
CREATE INDEX "avaliacao_estado_idx" ON "avaliacao" USING btree ("tenant_id","estado");--> statement-breakpoint
CREATE UNIQUE INDEX "calibracao_item_uk" ON "calibracao_item" USING btree ("calibracao_id","conversa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "classificacao_conversa_uk" ON "classificacao_conversa" USING btree ("conversa_id");--> statement-breakpoint
CREATE INDEX "classificacao_conversa_categoria_idx" ON "classificacao_conversa" USING btree ("tenant_id","categoria","criada_em");--> statement-breakpoint
CREATE INDEX "consumo_ia_periodo_idx" ON "consumo_ia" USING btree ("tenant_id","funcionalidade","em");--> statement-breakpoint
CREATE INDEX "criterio_grupo_idx" ON "criterio" USING btree ("grupo_id","ordem");--> statement-breakpoint
CREATE INDEX "documento_conhecimento_base_idx" ON "documento_conhecimento" USING btree ("tenant_id","base_id","ativo");--> statement-breakpoint
CREATE INDEX "feedback_para_idx" ON "feedback" USING btree ("tenant_id","para_usuario_id","lido_em");--> statement-breakpoint
CREATE UNIQUE INDEX "formulario_avaliacao_uk" ON "formulario_avaliacao" USING btree ("tenant_id","nome","versao");--> statement-breakpoint
CREATE INDEX "grupo_criterio_formulario_idx" ON "grupo_criterio" USING btree ("formulario_id","ordem");--> statement-breakpoint
CREATE UNIQUE INDEX "insight_uk" ON "insight" USING btree ("tenant_id","periodo_inicio","periodo_fim","categoria");--> statement-breakpoint
CREATE UNIQUE INDEX "resposta_avaliacao_uk" ON "resposta_avaliacao" USING btree ("avaliacao_id","criterio_id");--> statement-breakpoint
CREATE INDEX "trecho_conhecimento_documento_idx" ON "trecho_conhecimento" USING btree ("tenant_id","documento_id","ordem");--> statement-breakpoint
CREATE UNIQUE INDEX "acao_uk" ON "acao" USING btree ("workflow_id","ordem");--> statement-breakpoint
CREATE UNIQUE INDEX "bloco_uk" ON "bloco" USING btree ("versao_id","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "consulta_salva_uk" ON "consulta_salva" USING btree ("tenant_id","nome");--> statement-breakpoint
CREATE UNIQUE INDEX "dicionario_campo_uk" ON "dicionario_campo" USING btree ("tenant_id","objeto_codigo","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "dicionario_objeto_uk" ON "dicionario_objeto" USING btree ("tenant_id","codigo");--> statement-breakpoint
CREATE INDEX "entrega_webhook_pendente_idx" ON "entrega_webhook" USING btree ("estado","proxima_tentativa_em");--> statement-breakpoint
CREATE INDEX "execucao_acao_execucao_idx" ON "execucao_acao" USING btree ("tenant_id","execucao_workflow_id","em");--> statement-breakpoint
CREATE INDEX "execucao_fluxo_conversa_idx" ON "execucao_fluxo" USING btree ("tenant_id","conversa_id");--> statement-breakpoint
CREATE INDEX "execucao_fluxo_estado_idx" ON "execucao_fluxo" USING btree ("tenant_id","estado","iniciada_em");--> statement-breakpoint
CREATE INDEX "execucao_passo_execucao_idx" ON "execucao_passo" USING btree ("tenant_id","execucao_id","em");--> statement-breakpoint
CREATE INDEX "execucao_workflow_idx" ON "execucao_workflow" USING btree ("tenant_id","workflow_id","iniciada_em" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "fluxo_versao_uk" ON "fluxo_versao" USING btree ("fluxo_id","versao");--> statement-breakpoint
CREATE INDEX "gatilho_workflow_idx" ON "gatilho" USING btree ("tenant_id","workflow_id","tipo");--> statement-breakpoint
CREATE INDEX "transicao_de_bloco_idx" ON "transicao" USING btree ("versao_id","de_bloco_id","ordem");--> statement-breakpoint
CREATE INDEX "webhook_saida_tenant_idx" ON "webhook_saida" USING btree ("tenant_id","ativo");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_uk" ON "workflow" USING btree ("tenant_id","nome","versao");