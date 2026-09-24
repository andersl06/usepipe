	"aberta_por" uuid NOT NULL,
	"acao" text NOT NULL,
	"acao_alerta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"acao_estouro" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"acao_id" uuid,
	"aceito_em" timestamp with time zone,
	"aceitos" integer DEFAULT 0 NOT NULL,
	"agente" text,
	"agregavel" boolean DEFAULT false NOT NULL,
	"alerta_seg" integer,
	"alertado_em" timestamp with time zone,
	"altura" integer,
	"alvo" text NOT NULL,
	"amostra_n" integer DEFAULT 0 NOT NULL,
	"anexo_id" uuid,
	"antes" jsonb,
	"application_id" text,
	"application_id" text,
	"arquivo" text,
	"atalho" text NOT NULL,
	"atendente_id" uuid,
	"atendente_id" uuid,
	"atendimento_n" integer DEFAULT 0 NOT NULL,
	"atendimento_seg" integer DEFAULT 0 NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"ativada_em" timestamp with time zone,
	"ativo" boolean DEFAULT false NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ator_id" uuid,
	"ator_tipo" text NOT NULL,
	"atribuida_em" timestamp with time zone,
	"atributos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"atributos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"atualizado_em" timestamp with time zone
	"atualizado_em" timestamp with time zone
	"atualizado_em" timestamp with time zone
	"atualizado_em" timestamp with time zone
	"atualizado_em" timestamp with time zone
	"atualizado_em" timestamp with time zone
	"atualizado_em" timestamp with time zone
	"atualizado_em" timestamp with time zone
	"atualizado_em" timestamp with time zone
	"atualizado_em" timestamp with time zone
	"atualizado_em" timestamp with time zone
	"atualizado_em" timestamp with time zone
	"atualizado_em" timestamp with time zone
	"atualizado_em" timestamp with time zone
	"atualizado_em" timestamp with time zone
	"atualizado_em" timestamp with time zone
	"atualizado_em" timestamp with time zone
	"atualizado_em" timestamp with time zone
	"atualizado_em" timestamp with time zone
	"atualizado_em" timestamp with time zone
	"atualizado_em" timestamp with time zone
	"atualizado_em" timestamp with time zone
	"atualizado_em" timestamp with time zone
	"atualizado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone,
	"audio_gravado_seg" integer DEFAULT 0 NOT NULL,
	"audio_ouvido_seg" integer DEFAULT 0 NOT NULL,
	"autenticacao_senha" text,
	"autenticacao_usuario" text,
	"autor_id" uuid,
	"autor_tipo" text NOT NULL,
	"avaliacao_humana_id" uuid,
	"avaliacao_ia_id" uuid,
	"avaliacao_id" uuid NOT NULL,
	"avaliacao_id" uuid NOT NULL,
	"avaliacao_id" uuid NOT NULL,
	"avaliada_em" timestamp with time zone,
	"avaliado_id" uuid NOT NULL,
	"avaliador_id" uuid,
	"avaliador_tipo" text NOT NULL,
	"avatar_url" text,
	"avatar_url" text,
	"base_id" uuid NOT NULL,
	"bloco_atual_id" uuid,
	"bloco_codigo" text NOT NULL,
	"bloco_id" uuid,
	"bloco_id" uuid,
	"bloco_inicial" text
	"bloqueado" boolean DEFAULT false NOT NULL,
	"bytes" integer NOT NULL,
	"cabecalho_tipo" text DEFAULT 'nenhum' NOT NULL,
	"cabecalhos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"calculado_em" timestamp with time zone DEFAULT now() NOT NULL
	"calculado_em" timestamp with time zone DEFAULT now() NOT NULL
	"calibracao_id" uuid NOT NULL,
	"campanha" text,
	"campo" text NOT NULL,
	"canal_id" uuid NOT NULL,
	"canal_id" uuid NOT NULL,
	"canal_id" uuid,
	"canal_id" uuid,
	"canal_tipo" text NOT NULL,
	"candidata_automacao" boolean DEFAULT false NOT NULL,
	"capacidade_override" integer,
	"capacidade_padrao" integer DEFAULT 5 NOT NULL,
	"categoria" text NOT NULL,
	"categoria" text NOT NULL,
	"categoria" text,
	"categoria" text,
	"categoria_cobranca" text,
	"chars_de_resposta_pronta" integer DEFAULT 0 NOT NULL,
	"chars_escritos" integer DEFAULT 0 NOT NULL,
	"chars_lidos" integer DEFAULT 0 NOT NULL,
	"chave" text NOT NULL,
	"chave_relatorio" text,
	"chave_storage" text NOT NULL,
	"checksum" text,
	"cidade" text,
	"classe" text,
	"cliente_id" text NOT NULL,
	"codigo" text NOT NULL,
	"codigo" text NOT NULL,
	"codigo" text NOT NULL,
	"codigo" text NOT NULL,
	"codigo" text NOT NULL,
	"codigo" text PRIMARY KEY NOT NULL,
	"combinador" text DEFAULT 'e' NOT NULL,
	"comentario" text,
	"concedida" boolean NOT NULL,
	"conceito" text,
	"condicao" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"condicao" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"condicao" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"conectado_em" timestamp with time zone,
	"confianca" numeric(5, 4),
	"confianca_ia" numeric(5, 4),
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"configuracao" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"consulta_id" uuid NOT NULL,
	"consultavel" boolean DEFAULT true NOT NULL,
	"conta_como_produtivo" boolean DEFAULT false NOT NULL,
	"conta_id" uuid,
	"conta_id" uuid,
	"conta_id" uuid,
	"conta_id" uuid,
	"contato_id" uuid NOT NULL,
	"contato_id" uuid NOT NULL,
	"contato_id" uuid NOT NULL,
	"contato_id" uuid NOT NULL,
	"contato_id" uuid,
	"contato_id" uuid,
	"conteudo" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"conteudo" text NOT NULL,
	"conteudo" text,
	"contexto" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"contexto" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"contexto" jsonb NOT NULL,
	"conversa_id" uuid NOT NULL,
	"conversa_id" uuid NOT NULL,
	"conversa_id" uuid NOT NULL,
	"conversa_id" uuid NOT NULL,
	"conversa_id" uuid NOT NULL,
	"conversa_id" uuid NOT NULL,
	"conversa_id" uuid NOT NULL,
	"conversa_id" uuid NOT NULL,
	"conversa_id" uuid NOT NULL,
	"conversa_id" uuid NOT NULL,
	"conversa_id" uuid NOT NULL,
	"conversa_id" uuid NOT NULL,
	"conversa_id" uuid,
	"conversa_id" uuid,
	"conversas_abandonadas" integer DEFAULT 0 NOT NULL,
	"conversas_criadas" integer DEFAULT 0 NOT NULL,
	"conversas_encerradas" integer DEFAULT 0 NOT NULL,
	"conversas_perdidas" integer DEFAULT 0 NOT NULL,
	"convidado_por" uuid,
	"cor" text,
	"cor" text,
	"cor_primaria" text,
	"corpo" text NOT NULL,
	"corpo" text NOT NULL,
	"corpo" text NOT NULL,
	"corpo" text NOT NULL,
	"corpo" text NOT NULL,
	"corpo" text,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criada_por" uuid,
	"criada_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"criado_por" uuid,
	"criterio_id" uuid NOT NULL,
	"criterio_id" uuid,
	"cron" text NOT NULL,
	"custo_centavos" integer DEFAULT 0 NOT NULL,
	"custo_centavos" integer,
	"customizados" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dados" jsonb,
	"data" date NOT NULL,
	"de_bloco_id" uuid NOT NULL,
	"de_fila_id" uuid,
	"de_sistema" boolean DEFAULT false NOT NULL,
	"de_usuario_id" uuid,
	"de_usuario_id" uuid,
	"decidida_em" timestamp with time zone,
	"decidida_por" uuid,
	"default_value" jsonb,
	"dentro_da_janela" boolean,
	"depois" jsonb,
	"descricao" text NOT NULL,
	"descricao" text,
	"descricao" text,
	"descricao" text,
	"descricao" text,
	"descricao" text,
	"descricao" text,
	"desde" timestamp with time zone DEFAULT now() NOT NULL,
	"desde" timestamp with time zone DEFAULT now() NOT NULL,
	"desqualificado_em" timestamp with time zone,
	"destino" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"desvio_por_criterio" jsonb DEFAULT '{}'::jsonb NOT NULL
	"desvio_total" numeric(6, 2),
	"dia" date NOT NULL,
	"dia" date NOT NULL,
	"dia_semana" smallint NOT NULL,
	"dimensao_id" uuid,
	"dimensao_tipo" text NOT NULL,
	"direcao" text NOT NULL,
	"disparo" text DEFAULT 'encerramento' NOT NULL,
	"disparo_id" uuid,
	"documento" text,
	"documento" text,
	"documento_id" uuid NOT NULL,
	"dominio" text NOT NULL,
	"dominio" text,
	"download_erro" text,
	"download_proxima_tentativa_em" timestamp with time zone,
	"download_tentativas" integer DEFAULT 0 NOT NULL,
	"duracao_ms" integer,
	"duracao_ms" integer,
	"duracao_seg" integer,
	"duracao_sugerida_min" integer,
	"em" timestamp with time zone DEFAULT now() NOT NULL
	"em" timestamp with time zone DEFAULT now() NOT NULL
	"em" timestamp with time zone DEFAULT now() NOT NULL
	"em" timestamp with time zone DEFAULT now() NOT NULL
	"em" timestamp with time zone DEFAULT now() NOT NULL
	"em" timestamp with time zone DEFAULT now() NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL,
	"em_espera_desde" timestamp with time zone,
	"email" text NOT NULL,
	"email" text NOT NULL,
	"email" text,
	"email_no_provedor" text,
	"embedding" vector(1536),
	"emissor" text NOT NULL,
	"emissor" text NOT NULL,
	"encerrada_em" timestamp with time zone
	"encerrada_em" timestamp with time zone,
	"encerrada_em" timestamp with time zone,
	"encerrada_em" timestamp with time zone,
	"encerrada_em" timestamp with time zone,
	"encerrada_por" uuid,
	"entrada" jsonb NOT NULL,
	"entrada" jsonb,
	"entrada" jsonb,
	"entregue_em" timestamp with time zone,
	"equipe_id" uuid NOT NULL,
	"erro" text,
	"erro" text,
	"erro" text,
	"erro_codigo" text,
	"erro_texto" text,
	"escala_max" smallint NOT NULL,
	"escala_max" smallint NOT NULL,
	"escala_min" smallint NOT NULL,
	"escala_min" smallint NOT NULL,
	"escopo" text DEFAULT 'atendimento' NOT NULL,
	"escopo" text DEFAULT 'atendimento' NOT NULL,
	"escopo" text DEFAULT 'conta' NOT NULL,
	"escopo" text DEFAULT 'conversa' NOT NULL,
	"escopo" text DEFAULT 'empresa' NOT NULL,
	"escopo_fila_id" uuid,
	"escopo_id" uuid,
	"escopo_id" uuid,
	"escopo_tipo" text DEFAULT 'tenant' NOT NULL,
	"escopo_tipo" text DEFAULT 'tenant' NOT NULL,
	"escopos" text[] DEFAULT '{}'::text[] NOT NULL,
	"esforco_seg" integer DEFAULT 0 NOT NULL,
	"esforco_seg" integer DEFAULT 0 NOT NULL,
	"espera_fila_n" integer DEFAULT 0 NOT NULL,
	"espera_fila_seg" integer DEFAULT 0 NOT NULL,
	"estado" text DEFAULT 'aberta' NOT NULL,
	"estado" text DEFAULT 'aberto' NOT NULL,
	"estado" text DEFAULT 'correndo' NOT NULL,
	"estado" text DEFAULT 'executando' NOT NULL,
	"estado" text DEFAULT 'executando' NOT NULL,
	"estado" text DEFAULT 'na_fila' NOT NULL,
	"estado" text DEFAULT 'offline' NOT NULL,
	"estado" text DEFAULT 'pendente' NOT NULL,
	"estado" text DEFAULT 'pendente' NOT NULL,
	"estado" text DEFAULT 'pendente' NOT NULL,
	"estado" text DEFAULT 'rascunho' NOT NULL,
	"estado" text DEFAULT 'rascunho' NOT NULL,
	"estado" text DEFAULT 'rascunho' NOT NULL,
	"estado" text DEFAULT 'rascunho' NOT NULL,
	"estado" text DEFAULT 'rascunho' NOT NULL,
	"estado" text,
	"estado_entrega" text,
	"estourado_em" timestamp with time zone,
	"estrategia_proprietario" text DEFAULT 'nenhuma' NOT NULL,
	"etiqueta_id" uuid NOT NULL,
	"etiqueta_id" uuid NOT NULL,
	"evento" text NOT NULL,
	"eventos" text[] DEFAULT '{}'::text[] NOT NULL,
	"evidencia_mensagem_id" uuid
	"excluido_em" timestamp with time zone
	"excluido_em" timestamp with time zone,
	"excluido_em" timestamp with time zone,
	"excluido_em" timestamp with time zone,
	"excluido_em" timestamp with time zone,
	"exclusiva_por_fila" boolean DEFAULT false NOT NULL,
	"execucao_id" uuid NOT NULL,
	"execucao_id" uuid NOT NULL,
	"execucao_workflow_id" uuid NOT NULL,
	"exemplos" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"expira_em" timestamp with time zone,
	"expira_em" timestamp with time zone,
	"expiracao_min" integer,
	"explicacao" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"faixa" text,
	"faixa_atual" text,
	"falhas_csv" text,
	"fase" text NOT NULL,
	"fase" text,
	"fase_desde" timestamp with time zone,
	"fatal" boolean DEFAULT false NOT NULL,
	"fechada_em" timestamp with time zone,
	"fechado" boolean DEFAULT true NOT NULL,
	"fechamento_previsto" date,
	"fila_destino_id" uuid NOT NULL,
	"fila_id" uuid NOT NULL,
	"fila_id" uuid,
	"fila_id" uuid,
	"fila_id" uuid,
	"fila_padrao_id" uuid,
	"fim" time NOT NULL
	"fim" time,
	"fixada_em" timestamp with time zone,
	"fluxo_id" uuid NOT NULL,
	"fluxo_id" uuid NOT NULL,
	"fluxo_id" uuid,
	"fluxo_versao_id" uuid NOT NULL,
	"formato" text DEFAULT 'csv' NOT NULL,
	"formulario_id" uuid NOT NULL,
	"formulario_id" uuid NOT NULL,
	"formulario_id" uuid NOT NULL,
	"funcao" text DEFAULT 'membro' NOT NULL,
	"funcionalidade" text NOT NULL,
	"funcionarios" text,
	"fuso" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"fuso" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"ganha" boolean,
	"global" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"grupo" text NOT NULL
	"grupo_id" uuid NOT NULL,
	"hash" text NOT NULL,
	"horario_id" uuid NOT NULL,
	"horario_id" uuid NOT NULL,
	"horario_id" uuid,
	"icon" text,
	"icon" text,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id_provedor" text,
	"identificador" text NOT NULL,
	"idioma" text DEFAULT 'pt-BR' NOT NULL,
	"idioma" text DEFAULT 'pt_BR' NOT NULL,
	"imagem_url" text,
	"implantacao" text DEFAULT 'compartilhada' NOT NULL,
	"importacao_id" uuid PRIMARY KEY NOT NULL,
	"inbox_id" uuid NOT NULL,
	"indice" integer NOT NULL,
	"iniciada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"iniciada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"iniciada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"inicio" time NOT NULL,
	"inicio" time,
	"intencao" text,
	"ip" text,
	"ip" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_custom" boolean DEFAULT false NOT NULL,
	"is_custom" boolean DEFAULT false NOT NULL,
	"is_nullable" boolean,
	"is_remote" boolean DEFAULT false NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_unique" boolean,
	"janela_aberta_por_mensagem_id" uuid,
	"janela_expira_em" timestamp with time zone,
	"justificativa" text,
	"label_plural" text,
	"largura" integer,
	"lead_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"lead_id" uuid,
	"lead_id" uuid,
	"lida_em" timestamp with time zone,
	"lido_em" timestamp with time zone,
	"lista" text NOT NULL,
	"logo_url" text,
	"mapeamento" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"maximo" integer NOT NULL,
	"mensagem_id" uuid NOT NULL,
	"mensagens_entrada" integer DEFAULT 0 NOT NULL,
	"mensagens_saida" integer DEFAULT 0 NOT NULL,
	"meta" text NOT NULL,
	"mime" text NOT NULL,
	"minimo" integer NOT NULL,
	"modelo" text NOT NULL,
	"modelo" text,
	"moeda" text DEFAULT 'BRL' NOT NULL,
	"morph_relations" jsonb,
	"motivo" text
	"motivo" text NOT NULL,
	"motivo" text,
	"motivo_desqualificacao_id" uuid,
	"motivo_encerramento" text,
	"motivo_id" uuid,
	"motivo_perda" text,
	"name_plural" text,
	"nao_lida_em" timestamp with time zone,
	"nivel" text NOT NULL,
	"nome" text NOT NULL,
	"nome" text NOT NULL,
	"nome" text NOT NULL,
	"nome" text NOT NULL,
	"nome" text NOT NULL,
	"nome" text NOT NULL,
	"nome" text NOT NULL,
	"nome" text NOT NULL,
	"nome" text NOT NULL,
	"nome" text NOT NULL,
	"nome" text NOT NULL,
	"nome" text NOT NULL,
	"nome" text NOT NULL,
	"nome" text NOT NULL,
	"nome" text NOT NULL,
	"nome" text NOT NULL,
	"nome" text NOT NULL,
	"nome" text NOT NULL,
	"nome" text NOT NULL,
	"nome" text NOT NULL,
	"nome" text NOT NULL,
	"nome" text NOT NULL,
	"nome" text NOT NULL,
	"nome" text NOT NULL,
	"nome" text NOT NULL,
	"nome" text NOT NULL,
	"nome" text NOT NULL,
	"nome" text NOT NULL,
	"nome" text NOT NULL,
	"nome" text NOT NULL,
	"nome" text,
	"nome_original" text,
	"nota" numeric(6, 2),
	"nota" smallint,
	"nota_maxima" numeric(6, 2) DEFAULT '100' NOT NULL,
	"numero_id" text,
	"oauth2_client_id" text,
	"oauth2_client_secret" text,
	"oauth2_url_autorizacao" text,
	"objeto" text NOT NULL,
	"objeto_codigo" text NOT NULL,
	"objeto_id" uuid,
	"objeto_id" uuid,
	"objeto_tipo" text NOT NULL,
	"objeto_tipo" text,
	"obrigatoria" boolean DEFAULT false NOT NULL,
	"obrigatoria_no_encerramento" boolean DEFAULT false NOT NULL,
	"ocorrida_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ocupacao" numeric(5, 4),
	"on_erro" text DEFAULT 'parar' NOT NULL,
	"onboarding_concluido_em" timestamp with time zone,
	"opcoes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"opcoes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"operador" text NOT NULL,
	"optin_whatsapp" boolean DEFAULT false NOT NULL,
	"options" jsonb,
	"ordem" integer DEFAULT 0 NOT NULL
	"ordem" integer DEFAULT 0 NOT NULL
	"ordem" integer DEFAULT 0 NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"origem" text DEFAULT 'senha' NOT NULL,
	"origem" text NOT NULL,
	"origem" text,
	"pais" text,
	"papel_id" uuid NOT NULL,
	"papel_id" uuid NOT NULL,
	"papel_id" uuid NOT NULL,
	"papel_no_fluxo" text DEFAULT 'visualizar' NOT NULL,
	"para_bloco_id" uuid,
	"para_fila_id" uuid,
	"para_usuario_id" uuid NOT NULL,
	"para_usuario_id" uuid,
	"para_variavel" text,
	"parametros" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pausado_seg" integer DEFAULT 0 NOT NULL,
	"pausado_seg" integer DEFAULT 0 NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"payload_gatilho" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pedido" jsonb NOT NULL,
	"pergunta" text NOT NULL,
	"pergunta_id" uuid NOT NULL,
	"periodo_fim" date NOT NULL,
	"periodo_fim" date NOT NULL,
	"periodo_inicio" date NOT NULL,
	"periodo_inicio" date NOT NULL,
	"permissao_codigo" text NOT NULL,
	"permissao_codigo" text NOT NULL,
	"permissoes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"persistente" boolean DEFAULT false NOT NULL,
	"peso" numeric(6, 2) DEFAULT '1' NOT NULL,
	"peso" numeric(6, 2) DEFAULT '1' NOT NULL,
	"pesquisa_id" uuid NOT NULL,
	"plano" text DEFAULT 'essencial' NOT NULL,
	"politica" text DEFAULT 'desligado' NOT NULL,
	"pontos" integer NOT NULL,
	"pontos" numeric(6, 2),
	"por_usuario_id" uuid,
	"por_usuario_id" uuid,
	"posicao" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"prazo" date,
	"prazo_em" timestamp with time zone NOT NULL,
	"prazo_seg" integer NOT NULL,
	"prefixo" text NOT NULL,
	"primeira_resposta_em" timestamp with time zone,
	"primeira_resposta_n" integer DEFAULT 0 NOT NULL,
	"primeira_resposta_seg" integer DEFAULT 0 NOT NULL,
	"principal" boolean DEFAULT false NOT NULL,
	"prioridade" text DEFAULT 'sem_prioridade' NOT NULL,
	"probabilidade" smallint,
	"proprietario_id" uuid,
	"proprietario_id" uuid,
	"proprietario_id" uuid,
	"provedor" text DEFAULT 'generico' NOT NULL,
	"proxima_tentativa_em" timestamp with time zone,
	"proxima_tentativa_em" timestamp with time zone,
	"publicada_em" timestamp with time zone,
	"publicada_em" timestamp with time zone,
	"publicada_por" uuid,
	"regra_id" uuid NOT NULL,
	"regra_id" uuid NOT NULL,
	"reiniciar" boolean DEFAULT false NOT NULL,
	"rejeitados" integer DEFAULT 0 NOT NULL,
	"relation" jsonb,
	"respondida_em" timestamp with time zone,
	"resposta" jsonb,
	"resposta" text,
	"resposta_pronta_id" uuid,
	"resumo" text,
	"resumo" text,
	"revisada_em" timestamp with time zone,
	"revisada_por" uuid,
	"revogada_em" timestamp with time zone,
	"roteador_id" uuid NOT NULL,
	"roteador_id" uuid NOT NULL,
	"rotulo" text NOT NULL,
	"rotulo" text NOT NULL,
	"rotulo" text NOT NULL,
	"rotulo" text NOT NULL,
	"saida" jsonb,
	"saida" jsonb,
	"score_atual" integer,
	"segredo" text NOT NULL,
	"senha_hash" text,
	"sentimento" text,
	"servico_id" uuid NOT NULL,
	"servico_id" uuid NOT NULL,
	"sessao_seg" integer DEFAULT 0 NOT NULL,
	"settings" jsonb,
	"short_name" text,
	"site" text,
	"sla_cumpridos" integer DEFAULT 0 NOT NULL,
	"sla_estourados" integer DEFAULT 0 NOT NULL,
	"slug" text NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'novo' NOT NULL,
	"status_meta" text DEFAULT 'pendente' NOT NULL,
	"subcategoria" text,
	"sujeito" text NOT NULL,
	"telefone" text,
	"telefone_e164" text,
	"template_id" uuid,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"termo" text NOT NULL,
	"testada_em" timestamp with time zone,
	"texto" text NOT NULL,
	"texto" text NOT NULL,
	"tickets" integer DEFAULT 0 NOT NULL,
	"tipo" text DEFAULT 'conforme' NOT NULL,
	"tipo" text DEFAULT 'fluxo' NOT NULL,
	"tipo" text DEFAULT 'oidc' NOT NULL,
	"tipo" text DEFAULT 'texto' NOT NULL,
	"tipo" text NOT NULL,
	"tipo" text NOT NULL,
	"tipo" text NOT NULL,
	"tipo" text NOT NULL,
	"tipo" text NOT NULL,
	"tipo" text NOT NULL,
	"tipo" text NOT NULL,
	"tipo" text NOT NULL,
	"tipo" text NOT NULL,
	"tipo" text NOT NULL,
	"tipo_autenticacao" text DEFAULT 'nenhuma' NOT NULL,
	"titulo" text NOT NULL,
	"titulo" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_verificacao" text,
	"tokens" integer,
	"tokens_entrada" integer DEFAULT 0 NOT NULL,
	"tokens_saida" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"twenty_chave" text,
	"twenty_empresa_id" text,
	"twenty_id" text,
	"twenty_id" text,
	"twenty_pessoa_id" text,
	"twenty_url" text,
	"ultima_execucao_em" timestamp with time zone,
	"ultima_mensagem_de" text,
	"ultima_mensagem_em" timestamp with time zone,
	"ultimo_acesso_em" timestamp with time zone,
	"ultimo_acesso_em" timestamp with time zone,
	"ultimo_erro" text,
	"ultimo_erro" text,
	"ultimo_uso_em" timestamp with time zone,
	"url" text NOT NULL,
	"usa_contexto_do_roteador" boolean DEFAULT false NOT NULL,
	"usuario_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"usuario_id" uuid PRIMARY KEY NOT NULL,
	"usuario_id" uuid,
	"usuario_id" uuid,
	"usuario_id" uuid,
	"usuario_id" uuid,
	"usuario_id" uuid,
	"utm" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"valor" integer NOT NULL,
	"valor" numeric(14, 2),
	"valor" text
	"valor" text,
	"valor_bool" boolean,
	"valor_data" timestamp with time zone,
	"valor_json" jsonb,
	"valor_num" numeric(20, 6),
	"valor_texto" text,
	"variacao_pct" numeric(8, 2),
	"variaveis" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verificado_em" timestamp with time zone,
	"versao" integer DEFAULT 1 NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	"versao" integer NOT NULL,
	"versao" integer NOT NULL,
	"versao" integer NOT NULL,
	"versao" integer NOT NULL,
	"versao_id" uuid NOT NULL,
	"versao_id" uuid NOT NULL,
	"versao_id" uuid NOT NULL,
	"versao_id" uuid NOT NULL,
	"versao_regra" integer NOT NULL,
	"volume" integer DEFAULT 0 NOT NULL,
	"waba_id" text,
	"webhook_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	CONSTRAINT "acao_on_erro_ck" CHECK ("on_erro" in ('parar', 'continuar', 'repetir'))
	CONSTRAINT "acao_tipo_ck" CHECK ("tipo" in ('criar_registro', 'atualizar_registro', 'enviar_mensagem', 'enviar_template', 'atribuir_proprietario', 'mover_fila', 'criar_avaliacao', 'http', 'funcao', 'agente_ia')),
	CONSTRAINT "agendamento_consulta_formato_ck" CHECK ("formato" in ('csv', 'json', 'parquet'))
	CONSTRAINT "atividade_tipo_ck" CHECK ("tipo" in ('nota', 'ligacao', 'reuniao', 'email', 'conversa', 'tarefa', 'mudanca_fase'))
	CONSTRAINT "avaliacao_avaliador_tipo_ck" CHECK ("avaliador_tipo" in ('humano', 'ia')),
	CONSTRAINT "avaliacao_estado_ck" CHECK ("estado" in ('rascunho', 'concluida', 'contestada', 'revisada', 'encerrada'))
	CONSTRAINT "bloco_tipo_ck" CHECK ("tipo" in ('inicio', 'mensagem', 'pergunta', 'condicao', 'chamada_externa', 'script', 'ia', 'transferencia', 'fim'))
	CONSTRAINT "campo_customizado_objeto_ck" CHECK ("objeto" in ('lead', 'conta', 'contato', 'oportunidade')),
	CONSTRAINT "campo_customizado_tipo_ck" CHECK ("tipo" in ('texto', 'texto_longo', 'numero', 'data', 'booleano', 'selecao_unica', 'selecao_multipla'))
	CONSTRAINT "canal_tipo_ck" CHECK ("tipo" in ('whatsapp_cloud', 'instagram', 'messenger', 'email', 'widget'))
	CONSTRAINT "classificacao_conversa_sentimento_ck" CHECK ("sentimento" in ('positivo', 'neutro', 'negativo'))
	CONSTRAINT "conexao_sso_estado_ck" CHECK ("estado" in ('rascunho', 'testada', 'ativa')),
	CONSTRAINT "conexao_sso_politica_ck" CHECK ("politica" in ('desligado', 'opcional', 'obrigatorio'))
	CONSTRAINT "conexao_sso_provedor_ck" CHECK ("provedor" in ('generico', 'entra', 'google_workspace', 'okta')),
	CONSTRAINT "conexao_sso_tipo_ck" CHECK ("tipo" in ('oidc')),
	CONSTRAINT "contato_etiqueta_contato_id_etiqueta_id_pk" PRIMARY KEY("contato_id","etiqueta_id")
	CONSTRAINT "contato_identidade_canal_tipo_ck" CHECK ("canal_tipo" in ('whatsapp_cloud', 'instagram', 'messenger', 'email', 'widget'))
	CONSTRAINT "contestacao_estado_ck" CHECK ("estado" in ('aberta', 'aceita', 'recusada'))
	CONSTRAINT "conversa_estado_ck" CHECK ("estado" in ('na_fila', 'atribuida', 'em_atendimento', 'em_espera', 'encerrada')),
	CONSTRAINT "conversa_etiqueta_conversa_id_etiqueta_id_pk" PRIMARY KEY("conversa_id","etiqueta_id")
	CONSTRAINT "conversa_prioridade_ck" CHECK ("prioridade" in ('maxima', 'alta', 'media', 'baixa', 'sem_prioridade')),
	CONSTRAINT "conversa_ultima_mensagem_de_ck" CHECK ("ultima_mensagem_de" in ('contato', 'atendente', 'bot'))
	CONSTRAINT "convite_escopo_ck" CHECK ("escopo" in ('conta'))
	CONSTRAINT "criterio_tipo_ck" CHECK ("tipo" in ('conforme', 'escala', 'nota'))
	CONSTRAINT "entrega_webhook_estado_ck" CHECK ("estado" in ('pendente', 'entregue', 'falhou', 'descartada'))
	CONSTRAINT "etiqueta_escopo_ck" CHECK ("escopo" in ('conversa', 'contato', 'ambos'))
	CONSTRAINT "evento_atendimento_id_em_pk" PRIMARY KEY("id","em"),
	CONSTRAINT "evento_atendimento_tipo_ck" CHECK ("tipo" in ('criada', 'enfileirada', 'atribuida', 'reatribuida', 'transferida_fila', 'primeira_resposta', 'mensagem_entrada', 'mensagem_saida', 'espera_iniciada', 'espera_encerrada', 'sla_alertado', 'sla_estourado', 'encerrada', 'reaberta', 'avaliada', 'pesquisa_respondida'))
	CONSTRAINT "execucao_fluxo_estado_ck" CHECK ("estado" in ('executando', 'aguardando', 'concluida', 'falhou', 'cancelada'))
	CONSTRAINT "execucao_workflow_estado_ck" CHECK ("estado" in ('executando', 'aguardando', 'concluida', 'falhou', 'cancelada'))
	CONSTRAINT "faixa_score_estrategia_ck" CHECK ("estrategia_proprietario" in ('rodizio', 'menor_carga', 'fixo', 'nenhuma'))
	CONSTRAINT "fila_atendente_fila_id_usuario_id_pk" PRIMARY KEY("fila_id","usuario_id")
	CONSTRAINT "fluxo_descricao_ck" CHECK (char_length("descricao") <= 160)
	CONSTRAINT "fluxo_estado_ck" CHECK ("estado" in ('rascunho', 'publicado', 'arquivado')),
	CONSTRAINT "fluxo_membro_papel_ck" CHECK ("papel_no_fluxo" in ('visualizar', 'personalizado', 'editar', 'admin'))
	CONSTRAINT "fluxo_tipo_ck" CHECK ("tipo" in ('fluxo', 'roteador')),
	CONSTRAINT "fluxo_versao_estado_ck" CHECK ("estado" in ('rascunho', 'publicada', 'arquivada'))
	CONSTRAINT "formulario_pergunta_tipo_ck" CHECK ("tipo" in ('texto', 'texto_longo', 'numero', 'data', 'booleano', 'selecao_unica', 'selecao_multipla'))
	CONSTRAINT "gatilho_tipo_ck" CHECK ("tipo" in ('evento', 'agendado', 'manual', 'webhook'))
	CONSTRAINT "importacao_estado_ck" CHECK ("estado" in ('rascunho', 'validando', 'pronta', 'executando', 'concluida', 'falhou'))
	CONSTRAINT "importacao_origem_ck" CHECK ("origem" in ('salesforce', 'hubspot', 'rd_station', 'csv')),
	CONSTRAINT "lead_status_ck" CHECK ("status" in ('novo', 'em_contato', 'qualificado', 'convertido', 'desqualificado'))
	CONSTRAINT "log_auditoria_ator_tipo_ck" CHECK ("ator_tipo" in ('usuario', 'chave', 'sistema'))
	CONSTRAINT "marcacao_conversa_alguma_ck" CHECK ("marcacao_conversa"."fixada_em" is not null or "marcacao_conversa"."nao_lida_em" is not null)
	CONSTRAINT "marcacao_conversa_pk" PRIMARY KEY("usuario_id","conversa_id"),
	CONSTRAINT "membro_equipe_equipe_id_usuario_id_pk" PRIMARY KEY("equipe_id","usuario_id"),
	CONSTRAINT "membro_equipe_funcao_ck" CHECK ("funcao" in ('membro', 'lider'))
	CONSTRAINT "mensagem_autor_tipo_ck" CHECK ("autor_tipo" in ('contato', 'atendente', 'bot', 'sistema')),
	CONSTRAINT "mensagem_categoria_cobranca_ck" CHECK ("categoria_cobranca" in ('livre', 'utilidade', 'marketing', 'autenticacao'))
	CONSTRAINT "mensagem_direcao_ck" CHECK ("direcao" in ('entrada', 'saida', 'interna')),
	CONSTRAINT "mensagem_estado_entrega_ck" CHECK ("estado_entrega" in ('pendente', 'enviando', 'enviada', 'entregue', 'lida', 'falhou')),
	CONSTRAINT "mensagem_id_criada_em_pk" PRIMARY KEY("id","criada_em"),
	CONSTRAINT "mensagem_tipo_ck" CHECK ("tipo" in ('texto', 'imagem', 'audio', 'video', 'documento', 'localizacao', 'template')),
	CONSTRAINT "metrica_diaria_dimensao_tipo_ck" CHECK ("dimensao_tipo" in ('fila', 'atendente', 'equipe', 'inbox', 'etiqueta'))
	CONSTRAINT "outbox_mensagem_estado_ck" CHECK ("estado" in ('pendente', 'enviando', 'enviada', 'entregue', 'lida', 'falhou'))
	CONSTRAINT "palavra_proibida_termo_ck" CHECK (length(btrim("palavra_proibida"."termo")) > 0)
	CONSTRAINT "papel_escopo_ck" CHECK ("escopo" in ('conta', 'atendimento'))
	CONSTRAINT "papel_permissao_papel_id_permissao_codigo_pk" PRIMARY KEY("papel_id","permissao_codigo")
	CONSTRAINT "pesquisa_tipo_ck" CHECK ("tipo" in ('csat', 'nps'))
	CONSTRAINT "plano_coach_estado_ck" CHECK ("estado" in ('aberto', 'em_andamento', 'concluido', 'cancelado'))
	CONSTRAINT "process_http_execucao_estado_ck" CHECK ("estado" in ('pendente', 'chamando', 'respondida', 'retomada'))
	CONSTRAINT "regra_fila_combinador_ck" CHECK ("combinador" in ('e', 'ou'))
	CONSTRAINT "regra_prioridade_escopo_tipo_ck" CHECK ("escopo_tipo" in ('tenant', 'fila', 'inbox', 'equipe', 'etiqueta'))
	CONSTRAINT "regra_prioridade_nivel_ck" CHECK ("nivel" in ('maxima', 'alta', 'media', 'baixa')),
	CONSTRAINT "regra_sla_alvo_ck" CHECK ("alvo" in ('primeira_resposta', 'resposta', 'resolucao', 'espera_fila')),
	CONSTRAINT "regra_sla_escopo_tipo_ck" CHECK ("escopo_tipo" in ('tenant', 'fila', 'inbox', 'equipe', 'etiqueta'))
	CONSTRAINT "resposta_pronta_escopo_ck" CHECK ("escopo" in ('empresa', 'pessoal'))
	CONSTRAINT "roteador_servico_distintos_ck" CHECK ("roteador_servico"."roteador_id" <> "roteador_servico"."servico_id"),
	CONSTRAINT "roteador_servico_expiracao_ck" CHECK ("roteador_servico"."expiracao_min" is null or "roteador_servico"."expiracao_min" > 0),
	CONSTRAINT "roteador_servico_persistente_ck" CHECK (not "roteador_servico"."persistente" or "roteador_servico"."expiracao_min" is null),
	CONSTRAINT "roteador_servico_principal_ck" CHECK (not "roteador_servico"."principal" or (not "roteador_servico"."persistente" and "roteador_servico"."expiracao_min" is null)),
	CONSTRAINT "roteador_servico_redirecionamento_ck" CHECK ("roteador_servico"."principal" or "roteador_servico"."persistente" or "roteador_servico"."expiracao_min" is not null)
	CONSTRAINT "sessao_origem_ck" CHECK ("origem" in ('senha', 'google', 'sso'))
	CONSTRAINT "sla_conversa_estado_ck" CHECK ("estado" in ('correndo', 'alertado', 'estourado', 'cumprido', 'cancelado'))
	CONSTRAINT "status_atendente_estado_ck" CHECK ("estado" in ('online', 'pausa', 'invisivel', 'offline'))
	CONSTRAINT "template_mensagem_categoria_ck" CHECK ("categoria" in ('utilidade', 'marketing', 'autenticacao'))
	CONSTRAINT "tenant_implantacao_ck" CHECK ("implantacao" in ('compartilhada', 'dedicada')),
	CONSTRAINT "tenant_plano_ck" CHECK ("plano" in ('essencial', 'operacao', 'escala'))
	CONSTRAINT "tenant_slug_unique" UNIQUE("slug"),
	CONSTRAINT "transicao_destino_ck" CHECK (("transicao"."para_bloco_id" is null) <> ("transicao"."para_variavel" is null))
	CONSTRAINT "usuario_papel_usuario_id_papel_id_pk" PRIMARY KEY("usuario_id","papel_id")
	CONSTRAINT "usuario_permissao_usuario_id_permissao_codigo_pk" PRIMARY KEY("usuario_id","permissao_codigo")
	CONSTRAINT "webhook_saida_tipo_autenticacao_ck" CHECK ("tipo_autenticacao" in ('nenhuma', 'basica', 'oauth2_client_credentials'))
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
);
ALTER TABLE "acao" ADD CONSTRAINT "acao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "acao" ADD CONSTRAINT "acao_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "agendamento_consulta" ADD CONSTRAINT "agendamento_consulta_consulta_id_consulta_salva_id_fk" FOREIGN KEY ("consulta_id") REFERENCES "public"."consulta_salva"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "agendamento_consulta" ADD CONSTRAINT "agendamento_consulta_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "anexo" ADD CONSTRAINT "anexo_canal_id_canal_id_fk" FOREIGN KEY ("canal_id") REFERENCES "public"."canal"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "anexo" ADD CONSTRAINT "anexo_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "atividade" ADD CONSTRAINT "atividade_conta_id_conta_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."conta"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "atividade" ADD CONSTRAINT "atividade_conversa_id_conversa_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversa"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "atividade" ADD CONSTRAINT "atividade_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "atividade" ADD CONSTRAINT "atividade_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "atividade" ADD CONSTRAINT "atividade_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "atribuicao" ADD CONSTRAINT "atribuicao_conversa_id_conversa_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversa"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "atribuicao" ADD CONSTRAINT "atribuicao_de_fila_id_fila_id_fk" FOREIGN KEY ("de_fila_id") REFERENCES "public"."fila"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "atribuicao" ADD CONSTRAINT "atribuicao_de_usuario_id_usuario_id_fk" FOREIGN KEY ("de_usuario_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "atribuicao" ADD CONSTRAINT "atribuicao_para_fila_id_fila_id_fk" FOREIGN KEY ("para_fila_id") REFERENCES "public"."fila"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "atribuicao" ADD CONSTRAINT "atribuicao_para_usuario_id_usuario_id_fk" FOREIGN KEY ("para_usuario_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "atribuicao" ADD CONSTRAINT "atribuicao_por_usuario_id_usuario_id_fk" FOREIGN KEY ("por_usuario_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "atribuicao" ADD CONSTRAINT "atribuicao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "avaliacao" ADD CONSTRAINT "avaliacao_avaliado_id_usuario_id_fk" FOREIGN KEY ("avaliado_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "avaliacao" ADD CONSTRAINT "avaliacao_avaliador_id_usuario_id_fk" FOREIGN KEY ("avaliador_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "avaliacao" ADD CONSTRAINT "avaliacao_conversa_id_conversa_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversa"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "avaliacao" ADD CONSTRAINT "avaliacao_formulario_id_formulario_avaliacao_id_fk" FOREIGN KEY ("formulario_id") REFERENCES "public"."formulario_avaliacao"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "avaliacao" ADD CONSTRAINT "avaliacao_revisada_por_usuario_id_fk" FOREIGN KEY ("revisada_por") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "avaliacao" ADD CONSTRAINT "avaliacao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "base_conhecimento" ADD CONSTRAINT "base_conhecimento_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "bloco" ADD CONSTRAINT "bloco_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "bloco" ADD CONSTRAINT "bloco_versao_id_fluxo_versao_id_fk" FOREIGN KEY ("versao_id") REFERENCES "public"."fluxo_versao"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "calibracao" ADD CONSTRAINT "calibracao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "calibracao_item" ADD CONSTRAINT "calibracao_item_avaliacao_humana_id_avaliacao_id_fk" FOREIGN KEY ("avaliacao_humana_id") REFERENCES "public"."avaliacao"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "calibracao_item" ADD CONSTRAINT "calibracao_item_avaliacao_ia_id_avaliacao_id_fk" FOREIGN KEY ("avaliacao_ia_id") REFERENCES "public"."avaliacao"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "calibracao_item" ADD CONSTRAINT "calibracao_item_calibracao_id_calibracao_id_fk" FOREIGN KEY ("calibracao_id") REFERENCES "public"."calibracao"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "calibracao_item" ADD CONSTRAINT "calibracao_item_conversa_id_conversa_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversa"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "calibracao_item" ADD CONSTRAINT "calibracao_item_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "campo_customizado" ADD CONSTRAINT "campo_customizado_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "canal" ADD CONSTRAINT "canal_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "chave_api" ADD CONSTRAINT "chave_api_criada_por_usuario_id_fk" FOREIGN KEY ("criada_por") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "chave_api" ADD CONSTRAINT "chave_api_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "classificacao_conversa" ADD CONSTRAINT "classificacao_conversa_conversa_id_conversa_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversa"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "classificacao_conversa" ADD CONSTRAINT "classificacao_conversa_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "conexao_sso" ADD CONSTRAINT "conexao_sso_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "consulta_salva" ADD CONSTRAINT "consulta_salva_criada_por_usuario_id_fk" FOREIGN KEY ("criada_por") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "consulta_salva" ADD CONSTRAINT "consulta_salva_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "consumo_ia" ADD CONSTRAINT "consumo_ia_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "conta" ADD CONSTRAINT "conta_proprietario_id_usuario_id_fk" FOREIGN KEY ("proprietario_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "conta" ADD CONSTRAINT "conta_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "contato" ADD CONSTRAINT "contato_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "contato_etiqueta" ADD CONSTRAINT "contato_etiqueta_contato_id_contato_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contato"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "contato_etiqueta" ADD CONSTRAINT "contato_etiqueta_etiqueta_id_etiqueta_id_fk" FOREIGN KEY ("etiqueta_id") REFERENCES "public"."etiqueta"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "contato_etiqueta" ADD CONSTRAINT "contato_etiqueta_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "contato_identidade" ADD CONSTRAINT "contato_identidade_contato_id_contato_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contato"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "contato_identidade" ADD CONSTRAINT "contato_identidade_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "contestacao" ADD CONSTRAINT "contestacao_aberta_por_usuario_id_fk" FOREIGN KEY ("aberta_por") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "contestacao" ADD CONSTRAINT "contestacao_avaliacao_id_avaliacao_id_fk" FOREIGN KEY ("avaliacao_id") REFERENCES "public"."avaliacao"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "contestacao" ADD CONSTRAINT "contestacao_decidida_por_usuario_id_fk" FOREIGN KEY ("decidida_por") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "contestacao" ADD CONSTRAINT "contestacao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "conversa" ADD CONSTRAINT "conversa_atendente_id_usuario_id_fk" FOREIGN KEY ("atendente_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "conversa" ADD CONSTRAINT "conversa_contato_id_contato_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contato"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "conversa" ADD CONSTRAINT "conversa_encerrada_por_usuario_id_fk" FOREIGN KEY ("encerrada_por") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "conversa" ADD CONSTRAINT "conversa_fila_id_fila_id_fk" FOREIGN KEY ("fila_id") REFERENCES "public"."fila"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "conversa" ADD CONSTRAINT "conversa_inbox_id_inbox_id_fk" FOREIGN KEY ("inbox_id") REFERENCES "public"."inbox"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "conversa" ADD CONSTRAINT "conversa_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "conversa_etiqueta" ADD CONSTRAINT "conversa_etiqueta_conversa_id_conversa_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversa"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "conversa_etiqueta" ADD CONSTRAINT "conversa_etiqueta_etiqueta_id_etiqueta_id_fk" FOREIGN KEY ("etiqueta_id") REFERENCES "public"."etiqueta"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "conversa_etiqueta" ADD CONSTRAINT "conversa_etiqueta_por_usuario_id_usuario_id_fk" FOREIGN KEY ("por_usuario_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "conversa_etiqueta" ADD CONSTRAINT "conversa_etiqueta_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "convite" ADD CONSTRAINT "convite_criado_por_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "convite" ADD CONSTRAINT "convite_papel_escopo_fk" FOREIGN KEY ("papel_id","escopo") REFERENCES "public"."papel"("id","escopo") ON DELETE cascade ON UPDATE cascade;
ALTER TABLE "convite" ADD CONSTRAINT "convite_papel_id_papel_id_fk" FOREIGN KEY ("papel_id") REFERENCES "public"."papel"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "convite" ADD CONSTRAINT "convite_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "convite" ADD CONSTRAINT "convite_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "criterio" ADD CONSTRAINT "criterio_grupo_id_grupo_criterio_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupo_criterio"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "criterio" ADD CONSTRAINT "criterio_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "dicionario_campo" ADD CONSTRAINT "dicionario_campo_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "dicionario_objeto" ADD CONSTRAINT "dicionario_objeto_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "documento_conhecimento" ADD CONSTRAINT "documento_conhecimento_base_id_base_conhecimento_id_fk" FOREIGN KEY ("base_id") REFERENCES "public"."base_conhecimento"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "documento_conhecimento" ADD CONSTRAINT "documento_conhecimento_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "dominio_tenant" ADD CONSTRAINT "dominio_tenant_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "entrega_webhook" ADD CONSTRAINT "entrega_webhook_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "entrega_webhook" ADD CONSTRAINT "entrega_webhook_webhook_id_webhook_saida_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhook_saida"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "equipe" ADD CONSTRAINT "equipe_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "esforco_atendente_dia" ADD CONSTRAINT "esforco_atendente_dia_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "esforco_atendente_dia" ADD CONSTRAINT "esforco_atendente_dia_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "esforco_conversa" ADD CONSTRAINT "esforco_conversa_atendente_id_usuario_id_fk" FOREIGN KEY ("atendente_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "esforco_conversa" ADD CONSTRAINT "esforco_conversa_conversa_id_conversa_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversa"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "esforco_conversa" ADD CONSTRAINT "esforco_conversa_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "etiqueta" ADD CONSTRAINT "etiqueta_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "evento_atendimento" ADD CONSTRAINT "evento_atendimento_conversa_id_conversa_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversa"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "evento_atendimento" ADD CONSTRAINT "evento_atendimento_fila_id_fila_id_fk" FOREIGN KEY ("fila_id") REFERENCES "public"."fila"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "evento_atendimento" ADD CONSTRAINT "evento_atendimento_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "evento_atendimento" ADD CONSTRAINT "evento_atendimento_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "execucao_acao" ADD CONSTRAINT "execucao_acao_acao_id_acao_id_fk" FOREIGN KEY ("acao_id") REFERENCES "public"."acao"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "execucao_acao" ADD CONSTRAINT "execucao_acao_execucao_workflow_id_execucao_workflow_id_fk" FOREIGN KEY ("execucao_workflow_id") REFERENCES "public"."execucao_workflow"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "execucao_acao" ADD CONSTRAINT "execucao_acao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "execucao_fluxo" ADD CONSTRAINT "execucao_fluxo_bloco_atual_id_bloco_id_fk" FOREIGN KEY ("bloco_atual_id") REFERENCES "public"."bloco"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "execucao_fluxo" ADD CONSTRAINT "execucao_fluxo_contato_id_contato_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contato"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "execucao_fluxo" ADD CONSTRAINT "execucao_fluxo_conversa_id_conversa_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversa"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "execucao_fluxo" ADD CONSTRAINT "execucao_fluxo_fluxo_versao_id_fluxo_versao_id_fk" FOREIGN KEY ("fluxo_versao_id") REFERENCES "public"."fluxo_versao"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "execucao_fluxo" ADD CONSTRAINT "execucao_fluxo_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "execucao_passo" ADD CONSTRAINT "execucao_passo_bloco_id_bloco_id_fk" FOREIGN KEY ("bloco_id") REFERENCES "public"."bloco"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "execucao_passo" ADD CONSTRAINT "execucao_passo_execucao_id_execucao_fluxo_id_fk" FOREIGN KEY ("execucao_id") REFERENCES "public"."execucao_fluxo"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "execucao_passo" ADD CONSTRAINT "execucao_passo_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "execucao_workflow" ADD CONSTRAINT "execucao_workflow_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "execucao_workflow" ADD CONSTRAINT "execucao_workflow_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "faixa_score" ADD CONSTRAINT "faixa_score_fila_id_fila_id_fk" FOREIGN KEY ("fila_id") REFERENCES "public"."fila"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "faixa_score" ADD CONSTRAINT "faixa_score_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_avaliacao_id_avaliacao_id_fk" FOREIGN KEY ("avaliacao_id") REFERENCES "public"."avaliacao"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_de_usuario_id_usuario_id_fk" FOREIGN KEY ("de_usuario_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_para_usuario_id_usuario_id_fk" FOREIGN KEY ("para_usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "fila" ADD CONSTRAINT "fila_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "fila_atendente" ADD CONSTRAINT "fila_atendente_fila_id_fila_id_fk" FOREIGN KEY ("fila_id") REFERENCES "public"."fila"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "fila_atendente" ADD CONSTRAINT "fila_atendente_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "fila_atendente" ADD CONSTRAINT "fila_atendente_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "fluxo" ADD CONSTRAINT "fluxo_canal_id_canal_id_fk" FOREIGN KEY ("canal_id") REFERENCES "public"."canal"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "fluxo" ADD CONSTRAINT "fluxo_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "fluxo_membro" ADD CONSTRAINT "fluxo_membro_convidado_por_usuario_id_fk" FOREIGN KEY ("convidado_por") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "fluxo_membro" ADD CONSTRAINT "fluxo_membro_fluxo_id_fluxo_id_fk" FOREIGN KEY ("fluxo_id") REFERENCES "public"."fluxo"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "fluxo_membro" ADD CONSTRAINT "fluxo_membro_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "fluxo_membro" ADD CONSTRAINT "fluxo_membro_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "fluxo_versao" ADD CONSTRAINT "fluxo_versao_fluxo_id_fluxo_id_fk" FOREIGN KEY ("fluxo_id") REFERENCES "public"."fluxo"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "fluxo_versao" ADD CONSTRAINT "fluxo_versao_publicada_por_usuario_id_fk" FOREIGN KEY ("publicada_por") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "fluxo_versao" ADD CONSTRAINT "fluxo_versao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "formulario" ADD CONSTRAINT "formulario_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "formulario_avaliacao" ADD CONSTRAINT "formulario_avaliacao_escopo_fila_id_fila_id_fk" FOREIGN KEY ("escopo_fila_id") REFERENCES "public"."fila"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "formulario_avaliacao" ADD CONSTRAINT "formulario_avaliacao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "formulario_pergunta" ADD CONSTRAINT "formulario_pergunta_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "formulario_pergunta" ADD CONSTRAINT "formulario_pergunta_versao_id_formulario_versao_id_fk" FOREIGN KEY ("versao_id") REFERENCES "public"."formulario_versao"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "formulario_versao" ADD CONSTRAINT "formulario_versao_formulario_id_formulario_id_fk" FOREIGN KEY ("formulario_id") REFERENCES "public"."formulario"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "formulario_versao" ADD CONSTRAINT "formulario_versao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "gatilho" ADD CONSTRAINT "gatilho_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "gatilho" ADD CONSTRAINT "gatilho_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "grupo_criterio" ADD CONSTRAINT "grupo_criterio_formulario_id_formulario_avaliacao_id_fk" FOREIGN KEY ("formulario_id") REFERENCES "public"."formulario_avaliacao"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "grupo_criterio" ADD CONSTRAINT "grupo_criterio_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "horario_atendimento" ADD CONSTRAINT "horario_atendimento_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "horario_excecao" ADD CONSTRAINT "horario_excecao_horario_id_horario_atendimento_id_fk" FOREIGN KEY ("horario_id") REFERENCES "public"."horario_atendimento"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "horario_excecao" ADD CONSTRAINT "horario_excecao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "horario_faixa" ADD CONSTRAINT "horario_faixa_horario_id_horario_atendimento_id_fk" FOREIGN KEY ("horario_id") REFERENCES "public"."horario_atendimento"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "horario_faixa" ADD CONSTRAINT "horario_faixa_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "identidade_externa" ADD CONSTRAINT "identidade_externa_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "identidade_externa" ADD CONSTRAINT "identidade_externa_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "importacao" ADD CONSTRAINT "importacao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "importacao_arquivo" ADD CONSTRAINT "importacao_arquivo_importacao_id_importacao_id_fk" FOREIGN KEY ("importacao_id") REFERENCES "public"."importacao"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "importacao_arquivo" ADD CONSTRAINT "importacao_arquivo_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "inbox" ADD CONSTRAINT "inbox_canal_id_canal_id_fk" FOREIGN KEY ("canal_id") REFERENCES "public"."canal"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "inbox" ADD CONSTRAINT "inbox_fila_padrao_id_fila_id_fk" FOREIGN KEY ("fila_padrao_id") REFERENCES "public"."fila"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "inbox" ADD CONSTRAINT "inbox_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "insight" ADD CONSTRAINT "insight_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "lead" ADD CONSTRAINT "lead_conta_id_conta_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."conta"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "lead" ADD CONSTRAINT "lead_contato_id_contato_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contato"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "lead" ADD CONSTRAINT "lead_proprietario_id_usuario_id_fk" FOREIGN KEY ("proprietario_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "lead" ADD CONSTRAINT "lead_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "log_auditoria" ADD CONSTRAINT "log_auditoria_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "marcacao_conversa" ADD CONSTRAINT "marcacao_conversa_conversa_id_conversa_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversa"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "marcacao_conversa" ADD CONSTRAINT "marcacao_conversa_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "marcacao_conversa" ADD CONSTRAINT "marcacao_conversa_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "membro_equipe" ADD CONSTRAINT "membro_equipe_equipe_id_equipe_id_fk" FOREIGN KEY ("equipe_id") REFERENCES "public"."equipe"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "membro_equipe" ADD CONSTRAINT "membro_equipe_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "membro_equipe" ADD CONSTRAINT "membro_equipe_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mensagem" ADD CONSTRAINT "mensagem_anexo_id_anexo_id_fk" FOREIGN KEY ("anexo_id") REFERENCES "public"."anexo"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "mensagem" ADD CONSTRAINT "mensagem_conversa_id_conversa_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversa"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mensagem" ADD CONSTRAINT "mensagem_resposta_pronta_id_resposta_pronta_id_fk" FOREIGN KEY ("resposta_pronta_id") REFERENCES "public"."resposta_pronta"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "mensagem" ADD CONSTRAINT "mensagem_template_id_template_mensagem_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."template_mensagem"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "mensagem" ADD CONSTRAINT "mensagem_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "metrica_diaria" ADD CONSTRAINT "metrica_diaria_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "motivo_pausa" ADD CONSTRAINT "motivo_pausa_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "nota_interna" ADD CONSTRAINT "nota_interna_conversa_id_conversa_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversa"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "nota_interna" ADD CONSTRAINT "nota_interna_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "nota_interna" ADD CONSTRAINT "nota_interna_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "oportunidade" ADD CONSTRAINT "oportunidade_conta_id_conta_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."conta"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "oportunidade" ADD CONSTRAINT "oportunidade_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "oportunidade" ADD CONSTRAINT "oportunidade_proprietario_id_usuario_id_fk" FOREIGN KEY ("proprietario_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "oportunidade" ADD CONSTRAINT "oportunidade_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "outbox_mensagem" ADD CONSTRAINT "outbox_mensagem_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "palavra_proibida" ADD CONSTRAINT "palavra_proibida_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "papel" ADD CONSTRAINT "papel_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "papel_permissao" ADD CONSTRAINT "papel_permissao_papel_id_papel_id_fk" FOREIGN KEY ("papel_id") REFERENCES "public"."papel"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "papel_permissao" ADD CONSTRAINT "papel_permissao_permissao_codigo_permissao_codigo_fk" FOREIGN KEY ("permissao_codigo") REFERENCES "public"."permissao"("codigo") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "papel_permissao" ADD CONSTRAINT "papel_permissao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "pausa" ADD CONSTRAINT "pausa_motivo_id_motivo_pausa_id_fk" FOREIGN KEY ("motivo_id") REFERENCES "public"."motivo_pausa"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "pausa" ADD CONSTRAINT "pausa_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "pausa" ADD CONSTRAINT "pausa_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "pesquisa" ADD CONSTRAINT "pesquisa_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "plano_coach" ADD CONSTRAINT "plano_coach_criado_por_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "plano_coach" ADD CONSTRAINT "plano_coach_criterio_id_criterio_id_fk" FOREIGN KEY ("criterio_id") REFERENCES "public"."criterio"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "plano_coach" ADD CONSTRAINT "plano_coach_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "plano_coach" ADD CONSTRAINT "plano_coach_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "posicao_no_roteador" ADD CONSTRAINT "posicao_no_roteador_contato_id_contato_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contato"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "posicao_no_roteador" ADD CONSTRAINT "posicao_no_roteador_roteador_id_fluxo_id_fk" FOREIGN KEY ("roteador_id") REFERENCES "public"."fluxo"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "posicao_no_roteador" ADD CONSTRAINT "posicao_no_roteador_servico_id_fluxo_id_fk" FOREIGN KEY ("servico_id") REFERENCES "public"."fluxo"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "posicao_no_roteador" ADD CONSTRAINT "posicao_no_roteador_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "process_http_execucao" ADD CONSTRAINT "process_http_execucao_bloco_id_bloco_id_fk" FOREIGN KEY ("bloco_id") REFERENCES "public"."bloco"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "process_http_execucao" ADD CONSTRAINT "process_http_execucao_execucao_id_execucao_fluxo_id_fk" FOREIGN KEY ("execucao_id") REFERENCES "public"."execucao_fluxo"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "process_http_execucao" ADD CONSTRAINT "process_http_execucao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "regra_fila" ADD CONSTRAINT "regra_fila_fila_destino_id_fila_id_fk" FOREIGN KEY ("fila_destino_id") REFERENCES "public"."fila"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "regra_fila" ADD CONSTRAINT "regra_fila_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "regra_fila_condicao" ADD CONSTRAINT "regra_fila_condicao_regra_id_regra_fila_id_fk" FOREIGN KEY ("regra_id") REFERENCES "public"."regra_fila"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "regra_fila_condicao" ADD CONSTRAINT "regra_fila_condicao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "regra_prioridade" ADD CONSTRAINT "regra_prioridade_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "regra_score" ADD CONSTRAINT "regra_score_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "regra_sla" ADD CONSTRAINT "regra_sla_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "resposta_avaliacao" ADD CONSTRAINT "resposta_avaliacao_avaliacao_id_avaliacao_id_fk" FOREIGN KEY ("avaliacao_id") REFERENCES "public"."avaliacao"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "resposta_avaliacao" ADD CONSTRAINT "resposta_avaliacao_criterio_id_criterio_id_fk" FOREIGN KEY ("criterio_id") REFERENCES "public"."criterio"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "resposta_avaliacao" ADD CONSTRAINT "resposta_avaliacao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "resposta_formulario" ADD CONSTRAINT "resposta_formulario_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "resposta_formulario" ADD CONSTRAINT "resposta_formulario_pergunta_id_formulario_pergunta_id_fk" FOREIGN KEY ("pergunta_id") REFERENCES "public"."formulario_pergunta"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "resposta_formulario" ADD CONSTRAINT "resposta_formulario_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "resposta_formulario" ADD CONSTRAINT "resposta_formulario_versao_id_formulario_versao_id_fk" FOREIGN KEY ("versao_id") REFERENCES "public"."formulario_versao"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "resposta_pesquisa" ADD CONSTRAINT "resposta_pesquisa_conversa_id_conversa_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversa"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "resposta_pesquisa" ADD CONSTRAINT "resposta_pesquisa_pesquisa_id_pesquisa_id_fk" FOREIGN KEY ("pesquisa_id") REFERENCES "public"."pesquisa"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "resposta_pesquisa" ADD CONSTRAINT "resposta_pesquisa_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "resposta_pronta" ADD CONSTRAINT "resposta_pronta_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "resposta_pronta" ADD CONSTRAINT "resposta_pronta_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "roteador_servico" ADD CONSTRAINT "roteador_servico_roteador_id_fluxo_id_fk" FOREIGN KEY ("roteador_id") REFERENCES "public"."fluxo"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "roteador_servico" ADD CONSTRAINT "roteador_servico_servico_id_fluxo_id_fk" FOREIGN KEY ("servico_id") REFERENCES "public"."fluxo"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "roteador_servico" ADD CONSTRAINT "roteador_servico_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "score_lead" ADD CONSTRAINT "score_lead_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "score_lead" ADD CONSTRAINT "score_lead_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "sessao" ADD CONSTRAINT "sessao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "sessao" ADD CONSTRAINT "sessao_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "sla_conversa" ADD CONSTRAINT "sla_conversa_conversa_id_conversa_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversa"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "sla_conversa" ADD CONSTRAINT "sla_conversa_regra_id_regra_sla_id_fk" FOREIGN KEY ("regra_id") REFERENCES "public"."regra_sla"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "sla_conversa" ADD CONSTRAINT "sla_conversa_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "status_atendente" ADD CONSTRAINT "status_atendente_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "status_atendente" ADD CONSTRAINT "status_atendente_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "template_mensagem" ADD CONSTRAINT "template_mensagem_canal_id_canal_id_fk" FOREIGN KEY ("canal_id") REFERENCES "public"."canal"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "template_mensagem" ADD CONSTRAINT "template_mensagem_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "transicao" ADD CONSTRAINT "transicao_de_bloco_id_bloco_id_fk" FOREIGN KEY ("de_bloco_id") REFERENCES "public"."bloco"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "transicao" ADD CONSTRAINT "transicao_para_bloco_id_bloco_id_fk" FOREIGN KEY ("para_bloco_id") REFERENCES "public"."bloco"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "transicao" ADD CONSTRAINT "transicao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "transicao" ADD CONSTRAINT "transicao_versao_id_fluxo_versao_id_fk" FOREIGN KEY ("versao_id") REFERENCES "public"."fluxo_versao"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "trecho_conhecimento" ADD CONSTRAINT "trecho_conhecimento_documento_id_documento_conhecimento_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documento_conhecimento"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "trecho_conhecimento" ADD CONSTRAINT "trecho_conhecimento_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "usuario_papel" ADD CONSTRAINT "usuario_papel_papel_escopo_fk" FOREIGN KEY ("papel_id","escopo") REFERENCES "public"."papel"("id","escopo") ON DELETE cascade ON UPDATE cascade;
ALTER TABLE "usuario_papel" ADD CONSTRAINT "usuario_papel_papel_id_papel_id_fk" FOREIGN KEY ("papel_id") REFERENCES "public"."papel"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "usuario_papel" ADD CONSTRAINT "usuario_papel_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "usuario_papel" ADD CONSTRAINT "usuario_papel_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "usuario_permissao" ADD CONSTRAINT "usuario_permissao_permissao_codigo_permissao_codigo_fk" FOREIGN KEY ("permissao_codigo") REFERENCES "public"."permissao"("codigo") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "usuario_permissao" ADD CONSTRAINT "usuario_permissao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "usuario_permissao" ADD CONSTRAINT "usuario_permissao_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "webhook_saida" ADD CONSTRAINT "webhook_saida_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "workflow" ADD CONSTRAINT "workflow_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "atividade_conta_idx" ON "atividade" USING btree ("tenant_id","conta_id","ocorrida_em" DESC NULLS LAST);
CREATE INDEX "atividade_lead_idx" ON "atividade" USING btree ("tenant_id","lead_id","ocorrida_em" DESC NULLS LAST);
CREATE INDEX "atribuicao_conversa_idx" ON "atribuicao" USING btree ("tenant_id","conversa_id","em");
CREATE INDEX "avaliacao_avaliado_idx" ON "avaliacao" USING btree ("tenant_id","avaliado_id","avaliada_em" DESC NULLS LAST);
CREATE INDEX "avaliacao_conversa_idx" ON "avaliacao" USING btree ("tenant_id","conversa_id");
CREATE INDEX "avaliacao_estado_idx" ON "avaliacao" USING btree ("tenant_id","estado");
CREATE INDEX "canal_tenant_tipo_idx" ON "canal" USING btree ("tenant_id","tipo");
CREATE INDEX "canal_waba_id_idx" ON "canal" USING btree ("waba_id") WHERE "canal"."waba_id" is not null;
CREATE INDEX "chave_api_fluxo_idx" ON "chave_api" USING btree ("tenant_id","fluxo_id");
CREATE INDEX "classificacao_conversa_categoria_idx" ON "classificacao_conversa" USING btree ("tenant_id","categoria","criada_em");
CREATE INDEX "consumo_ia_periodo_idx" ON "consumo_ia" USING btree ("tenant_id","funcionalidade","em");
CREATE INDEX "conta_atributos_gin" ON "conta" USING gin ("atributos");
CREATE INDEX "conta_tenant_documento_idx" ON "conta" USING btree ("tenant_id","documento");
CREATE INDEX "conta_tenant_nome_idx" ON "conta" USING btree ("tenant_id","nome");
CREATE INDEX "contato_atributos_gin" ON "contato" USING gin ("atributos");
CREATE INDEX "contato_espelho_pendente_idx" ON "contato" USING btree ("tenant_id","atualizado_em") WHERE twenty_pessoa_id is null and excluido_em is null;
CREATE INDEX "contato_tenant_documento_idx" ON "contato" USING btree ("tenant_id","documento");
CREATE INDEX "contato_tenant_email_idx" ON "contato" USING btree ("tenant_id","email");
CREATE INDEX "contato_tenant_telefone_idx" ON "contato" USING btree ("tenant_id","telefone_e164");
CREATE INDEX "conversa_atendente_estado_idx" ON "conversa" USING btree ("tenant_id","atendente_id","estado");
CREATE INDEX "conversa_contato_idx" ON "conversa" USING btree ("tenant_id","contato_id","criada_em" DESC NULLS LAST);
CREATE INDEX "conversa_encerrada_idx" ON "conversa" USING btree ("tenant_id","encerrada_em");
CREATE INDEX "conversa_estado_fila_idx" ON "conversa" USING btree ("tenant_id","estado","fila_id");
CREATE INDEX "conversa_inbox_idx" ON "conversa" USING btree ("tenant_id","inbox_id");
CREATE INDEX "convite_tenant_email_idx" ON "convite" USING btree ("tenant_id","email","expira_em");
CREATE INDEX "criterio_grupo_idx" ON "criterio" USING btree ("grupo_id","ordem");
CREATE INDEX "documento_conhecimento_base_idx" ON "documento_conhecimento" USING btree ("tenant_id","base_id","ativo");
CREATE INDEX "entrega_webhook_pendente_idx" ON "entrega_webhook" USING btree ("estado","proxima_tentativa_em");
CREATE INDEX "evento_atendimento_conversa_idx" ON "evento_atendimento" USING btree ("tenant_id","conversa_id","em");
CREATE INDEX "evento_atendimento_tipo_idx" ON "evento_atendimento" USING btree ("tenant_id","tipo","em");
CREATE INDEX "execucao_acao_execucao_idx" ON "execucao_acao" USING btree ("tenant_id","execucao_workflow_id","em");
CREATE INDEX "execucao_fluxo_conversa_idx" ON "execucao_fluxo" USING btree ("tenant_id","conversa_id");
CREATE INDEX "execucao_fluxo_estado_idx" ON "execucao_fluxo" USING btree ("tenant_id","estado","iniciada_em");
CREATE INDEX "execucao_fluxo_versao_idx" ON "execucao_fluxo" USING btree ("tenant_id","fluxo_versao_id");
CREATE INDEX "execucao_passo_execucao_idx" ON "execucao_passo" USING btree ("tenant_id","execucao_id","em");
CREATE INDEX "execucao_workflow_idx" ON "execucao_workflow" USING btree ("tenant_id","workflow_id","iniciada_em" DESC NULLS LAST);
CREATE INDEX "feedback_para_idx" ON "feedback" USING btree ("tenant_id","para_usuario_id","lido_em");
CREATE INDEX "fluxo_membro_usuario_ix" ON "fluxo_membro" USING btree ("usuario_id");
CREATE INDEX "gatilho_workflow_idx" ON "gatilho" USING btree ("tenant_id","workflow_id","tipo");
CREATE INDEX "grupo_criterio_formulario_idx" ON "grupo_criterio" USING btree ("formulario_id","ordem");
CREATE INDEX "horario_faixa_horario_idx" ON "horario_faixa" USING btree ("horario_id","dia_semana");
CREATE INDEX "identidade_externa_usuario_idx" ON "identidade_externa" USING btree ("tenant_id","usuario_id");
CREATE INDEX "inbox_tenant_canal_idx" ON "inbox" USING btree ("tenant_id","canal_id");
CREATE INDEX "lead_customizados_gin" ON "lead" USING gin ("customizados");
CREATE INDEX "lead_tenant_faixa_idx" ON "lead" USING btree ("tenant_id","faixa_atual");
CREATE INDEX "lead_tenant_proprietario_idx" ON "lead" USING btree ("tenant_id","proprietario_id");
CREATE INDEX "lead_tenant_status_idx" ON "lead" USING btree ("tenant_id","status");
CREATE INDEX "log_auditoria_em_idx" ON "log_auditoria" USING btree ("tenant_id","em");
CREATE INDEX "log_auditoria_objeto_idx" ON "log_auditoria" USING btree ("tenant_id","objeto_tipo","objeto_id","em");
CREATE INDEX "marcacao_conversa_usuario_idx" ON "marcacao_conversa" USING btree ("tenant_id","usuario_id");
CREATE INDEX "mensagem_conversa_idx" ON "mensagem" USING btree ("tenant_id","conversa_id","criada_em");
CREATE INDEX "mensagem_disparo_idx" ON "mensagem" USING btree ("tenant_id","disparo_id");
CREATE INDEX "mensagem_falhou_idx" ON "mensagem" USING btree ("estado_entrega") WHERE estado_entrega = 'falhou';
CREATE INDEX "nota_interna_conversa_idx" ON "nota_interna" USING btree ("tenant_id","conversa_id","em");
CREATE INDEX "oportunidade_tenant_fase_idx" ON "oportunidade" USING btree ("tenant_id","fase");
CREATE INDEX "oportunidade_tenant_fechamento_idx" ON "oportunidade" USING btree ("tenant_id","fechamento_previsto");
CREATE INDEX "outbox_mensagem_pendente_idx" ON "outbox_mensagem" USING btree ("estado","proxima_tentativa_em");
CREATE INDEX "palavra_proibida_ativa_idx" ON "palavra_proibida" USING btree ("tenant_id") WHERE "palavra_proibida"."ativo";
CREATE INDEX "pausa_usuario_idx" ON "pausa" USING btree ("tenant_id","usuario_id","iniciada_em");
CREATE INDEX "process_http_execucao_pendente_idx" ON "process_http_execucao" USING btree ("tenant_id","estado");
CREATE INDEX "regra_fila_condicao_regra_idx" ON "regra_fila_condicao" USING btree ("regra_id");
CREATE INDEX "regra_fila_ordem_idx" ON "regra_fila" USING btree ("tenant_id","ativa","ordem");
CREATE INDEX "regra_score_versao_idx" ON "regra_score" USING btree ("tenant_id","versao","ativa");
CREATE INDEX "resposta_formulario_pergunta_idx" ON "resposta_formulario" USING btree ("tenant_id","pergunta_id");
CREATE INDEX "resposta_pesquisa_periodo_idx" ON "resposta_pesquisa" USING btree ("tenant_id","respondida_em");
CREATE INDEX "resposta_pronta_atalho_idx" ON "resposta_pronta" USING btree ("tenant_id","atalho");
CREATE INDEX "score_lead_lead_idx" ON "score_lead" USING btree ("tenant_id","lead_id","calculado_em" DESC NULLS LAST);
CREATE INDEX "sessao_usuario_idx" ON "sessao" USING btree ("tenant_id","usuario_id","expira_em");
CREATE INDEX "sla_conversa_prazo_idx" ON "sla_conversa" USING btree ("tenant_id","estado","prazo_em");
CREATE INDEX "transicao_de_bloco_idx" ON "transicao" USING btree ("versao_id","de_bloco_id","ordem");
CREATE INDEX "trecho_conhecimento_documento_idx" ON "trecho_conhecimento" USING btree ("tenant_id","documento_id","ordem");
CREATE INDEX "webhook_saida_tenant_idx" ON "webhook_saida" USING btree ("tenant_id","ativo");
CREATE TABLE "acao" (
CREATE TABLE "agendamento_consulta" (
CREATE TABLE "anexo" (
CREATE TABLE "atividade" (
CREATE TABLE "atribuicao" (
CREATE TABLE "avaliacao" (
CREATE TABLE "base_conhecimento" (
CREATE TABLE "bloco" (
CREATE TABLE "calibracao" (
CREATE TABLE "calibracao_item" (
CREATE TABLE "campo_customizado" (
CREATE TABLE "canal" (
CREATE TABLE "chave_api" (
CREATE TABLE "classificacao_conversa" (
CREATE TABLE "conexao_sso" (
CREATE TABLE "consulta_salva" (
CREATE TABLE "consumo_ia" (
CREATE TABLE "conta" (
CREATE TABLE "contato" (
CREATE TABLE "contato_etiqueta" (
CREATE TABLE "contato_identidade" (
CREATE TABLE "contestacao" (
CREATE TABLE "conversa" (
CREATE TABLE "conversa_etiqueta" (
CREATE TABLE "convite" (
CREATE TABLE "criterio" (
CREATE TABLE "dicionario_campo" (
CREATE TABLE "dicionario_objeto" (
CREATE TABLE "documento_conhecimento" (
CREATE TABLE "dominio_tenant" (
CREATE TABLE "entrega_webhook" (
CREATE TABLE "equipe" (
CREATE TABLE "esforco_atendente_dia" (
CREATE TABLE "esforco_conversa" (
CREATE TABLE "etiqueta" (
CREATE TABLE "evento_atendimento" (
CREATE TABLE "execucao_acao" (
CREATE TABLE "execucao_fluxo" (
CREATE TABLE "execucao_passo" (
CREATE TABLE "execucao_workflow" (
CREATE TABLE "faixa_score" (
CREATE TABLE "feedback" (
CREATE TABLE "fila" (
CREATE TABLE "fila_atendente" (
CREATE TABLE "fluxo" (
CREATE TABLE "fluxo_membro" (
CREATE TABLE "fluxo_versao" (
CREATE TABLE "formulario" (
CREATE TABLE "formulario_avaliacao" (
CREATE TABLE "formulario_pergunta" (
CREATE TABLE "formulario_versao" (
CREATE TABLE "gatilho" (
CREATE TABLE "grupo_criterio" (
CREATE TABLE "horario_atendimento" (
CREATE TABLE "horario_excecao" (
CREATE TABLE "horario_faixa" (
CREATE TABLE "identidade_externa" (
CREATE TABLE "importacao" (
CREATE TABLE "importacao_arquivo" (
CREATE TABLE "inbox" (
CREATE TABLE "insight" (
CREATE TABLE "lead" (
CREATE TABLE "log_auditoria" (
CREATE TABLE "marcacao_conversa" (
CREATE TABLE "membro_equipe" (
CREATE TABLE "mensagem" (
CREATE TABLE "metrica_diaria" (
CREATE TABLE "motivo_pausa" (
CREATE TABLE "nota_interna" (
CREATE TABLE "oportunidade" (
CREATE TABLE "outbox_mensagem" (
CREATE TABLE "palavra_proibida" (
CREATE TABLE "papel" (
CREATE TABLE "papel_permissao" (
CREATE TABLE "pausa" (
CREATE TABLE "permissao" (
CREATE TABLE "pesquisa" (
CREATE TABLE "plano_coach" (
CREATE TABLE "posicao_no_roteador" (
CREATE TABLE "process_http_execucao" (
CREATE TABLE "regra_fila" (
CREATE TABLE "regra_fila_condicao" (
CREATE TABLE "regra_prioridade" (
CREATE TABLE "regra_score" (
CREATE TABLE "regra_sla" (
CREATE TABLE "resposta_avaliacao" (
CREATE TABLE "resposta_formulario" (
CREATE TABLE "resposta_pesquisa" (
CREATE TABLE "resposta_pronta" (
CREATE TABLE "roteador_servico" (
CREATE TABLE "score_lead" (
CREATE TABLE "sessao" (
CREATE TABLE "sla_conversa" (
CREATE TABLE "status_atendente" (
CREATE TABLE "template_mensagem" (
CREATE TABLE "tenant" (
CREATE TABLE "transicao" (
CREATE TABLE "trecho_conhecimento" (
CREATE TABLE "usuario" (
CREATE TABLE "usuario_papel" (
CREATE TABLE "usuario_permissao" (
CREATE TABLE "webhook_saida" (
CREATE TABLE "workflow" (
CREATE UNIQUE INDEX "acao_uk" ON "acao" USING btree ("workflow_id","ordem");
CREATE UNIQUE INDEX "bloco_uk" ON "bloco" USING btree ("versao_id","codigo");
CREATE UNIQUE INDEX "calibracao_item_uk" ON "calibracao_item" USING btree ("calibracao_id","conversa_id");
CREATE UNIQUE INDEX "campo_customizado_uk" ON "campo_customizado" USING btree ("tenant_id","objeto","codigo");
CREATE UNIQUE INDEX "canal_numero_id_uk" ON "canal" USING btree ("numero_id") WHERE "canal"."numero_id" is not null;
CREATE UNIQUE INDEX "chave_api_prefixo_uk" ON "chave_api" USING btree ("prefixo");
CREATE UNIQUE INDEX "classificacao_conversa_uk" ON "classificacao_conversa" USING btree ("conversa_id");
CREATE UNIQUE INDEX "conexao_sso_tenant_uk" ON "conexao_sso" USING btree ("tenant_id");
CREATE UNIQUE INDEX "consulta_salva_uk" ON "consulta_salva" USING btree ("tenant_id","nome");
CREATE UNIQUE INDEX "contato_identidade_uk" ON "contato_identidade" USING btree ("tenant_id","canal_tipo","identificador");
CREATE UNIQUE INDEX "convite_token_hash_uk" ON "convite" USING btree ("token_hash");
CREATE UNIQUE INDEX "dicionario_campo_uk" ON "dicionario_campo" USING btree ("tenant_id","objeto_codigo","codigo");
CREATE UNIQUE INDEX "dicionario_objeto_uk" ON "dicionario_objeto" USING btree ("tenant_id","codigo");
CREATE UNIQUE INDEX "dominio_tenant_dominio_uk" ON "dominio_tenant" USING btree ("dominio");
CREATE UNIQUE INDEX "esforco_atendente_dia_uk" ON "esforco_atendente_dia" USING btree ("tenant_id","dia","usuario_id");
CREATE UNIQUE INDEX "esforco_conversa_uk" ON "esforco_conversa" USING btree ("conversa_id","atendente_id");
CREATE UNIQUE INDEX "etiqueta_tenant_nome_uk" ON "etiqueta" USING btree ("tenant_id","nome");
CREATE UNIQUE INDEX "execucao_passo_entrada_uk" ON "execucao_passo" USING btree ("tenant_id",("entrada" ->> 'id_provedor')) WHERE "execucao_passo"."entrada" ? 'id_provedor';
CREATE UNIQUE INDEX "faixa_score_uk" ON "faixa_score" USING btree ("tenant_id","versao","nome");
CREATE UNIQUE INDEX "fila_tenant_nome_uk" ON "fila" USING btree ("tenant_id","nome");
CREATE UNIQUE INDEX "fluxo_membro_uk" ON "fluxo_membro" USING btree ("fluxo_id","usuario_id");
CREATE UNIQUE INDEX "fluxo_versao_uk" ON "fluxo_versao" USING btree ("fluxo_id","versao");
CREATE UNIQUE INDEX "formulario_avaliacao_uk" ON "formulario_avaliacao" USING btree ("tenant_id","nome","versao");
CREATE UNIQUE INDEX "formulario_pergunta_uk" ON "formulario_pergunta" USING btree ("versao_id","codigo");
CREATE UNIQUE INDEX "formulario_tenant_slug_uk" ON "formulario" USING btree ("tenant_id","slug");
CREATE UNIQUE INDEX "formulario_versao_uk" ON "formulario_versao" USING btree ("formulario_id","versao");
CREATE UNIQUE INDEX "horario_excecao_uk" ON "horario_excecao" USING btree ("horario_id","data");
CREATE UNIQUE INDEX "identidade_externa_tenant_emissor_sujeito_uk" ON "identidade_externa" USING btree ("tenant_id","emissor","sujeito");
CREATE UNIQUE INDEX "insight_uk" ON "insight" USING btree ("tenant_id","periodo_inicio","periodo_fim","categoria");
CREATE UNIQUE INDEX "metrica_diaria_uk" ON "metrica_diaria" USING btree ("tenant_id","dia","dimensao_tipo","dimensao_id");
CREATE UNIQUE INDEX "outbox_mensagem_mensagem_uk" ON "outbox_mensagem" USING btree ("mensagem_id");
CREATE UNIQUE INDEX "palavra_proibida_termo_uk" ON "palavra_proibida" USING btree ("tenant_id",lower("termo"));
CREATE UNIQUE INDEX "papel_id_escopo_uk" ON "papel" USING btree ("id","escopo");
CREATE UNIQUE INDEX "papel_tenant_nome_uk" ON "papel" USING btree ("tenant_id","nome");
CREATE UNIQUE INDEX "posicao_no_roteador_uk" ON "posicao_no_roteador" USING btree ("roteador_id","contato_id");
CREATE UNIQUE INDEX "process_http_execucao_chave_uk" ON "process_http_execucao" USING btree ("execucao_id","chave");
CREATE UNIQUE INDEX "resposta_avaliacao_uk" ON "resposta_avaliacao" USING btree ("avaliacao_id","criterio_id");
CREATE UNIQUE INDEX "resposta_formulario_uk" ON "resposta_formulario" USING btree ("lead_id","pergunta_id");
CREATE UNIQUE INDEX "resposta_pesquisa_uk" ON "resposta_pesquisa" USING btree ("conversa_id","pesquisa_id");
CREATE UNIQUE INDEX "roteador_servico_nome_uk" ON "roteador_servico" USING btree ("roteador_id","nome");
CREATE UNIQUE INDEX "roteador_servico_principal_uk" ON "roteador_servico" USING btree ("roteador_id") WHERE "roteador_servico"."principal";
CREATE UNIQUE INDEX "roteador_servico_servico_uk" ON "roteador_servico" USING btree ("roteador_id","servico_id");
CREATE UNIQUE INDEX "sessao_token_hash_uk" ON "sessao" USING btree ("token_hash");
CREATE UNIQUE INDEX "sla_conversa_uk" ON "sla_conversa" USING btree ("conversa_id","regra_id");
CREATE UNIQUE INDEX "template_mensagem_uk" ON "template_mensagem" USING btree ("tenant_id","canal_id","nome","idioma");
CREATE UNIQUE INDEX "usuario_papel_um_da_conta_uk" ON "usuario_papel" USING btree ("usuario_id") WHERE "escopo" = 'conta';
CREATE UNIQUE INDEX "usuario_tenant_email_uk" ON "usuario" USING btree ("tenant_id","email");
CREATE UNIQUE INDEX "workflow_uk" ON "workflow" USING btree ("tenant_id","nome","versao");
