# Pipe — modelo de dados

Anexo do desenho do produto (`2026-09-05-pipe-design.md`). Define as tabelas dos seis módulos, as
máquinas de estado, o catálogo de eventos e as regras de isolamento. É a fonte da verdade para as
migrations em `packages/db`.

## 1. Convenções

- Postgres 16. Nomes em `snake_case`, sempre em português, singular.
- Chave: `id uuid primary key default gen_random_uuid()`.
- Toda tabela de negócio tem `tenant_id uuid not null references tenant(id)` e **RLS ligada**.
- Carimbos: `criado_em timestamptz not null default now()`, `atualizado_em timestamptz`.
- Exclusão lógica só onde o histórico importa (`excluido_em timestamptz`); no resto, exclusão real.
- Enumeração é `text` com `check`, não `enum` nativo — acrescentar valor num `enum` do Postgres
  trava a migration em produção, e vamos acrescentar valor o tempo todo.
- Dinheiro: `numeric(14,2)` com a moeda em coluna separada. Nunca ponto flutuante.
- Duração: inteiro em **segundos**. Nada de `interval` em coluna que entra em cálculo — a aritmética
  fica ambígua na hora de agregar.
- Texto livre do cliente é `text`. `varchar(n)` só quando o limite é regra de negócio real.
- Índice de busca textual e de atributo em JSONB: `gin`.

### Isolamento por tenant

A `api` abre a transação definindo `set local pipe.tenant_id = '<uuid>'`, e toda política é:

```sql
alter table <t> enable row level security;
create policy tenant_isolado on <t>
  using (tenant_id = current_setting('pipe.tenant_id')::uuid)
  with check (tenant_id = current_setting('pipe.tenant_id')::uuid);
```

Falha fechada: sem a variável de sessão, `current_setting` lança e a consulta não retorna nada. O
papel do banco usado pela aplicação **não** tem `bypassrls`. Migrations rodam com outro papel.

### Particionamento

`mensagem` e `evento_atendimento` crescem sem limite e são sempre consultadas por período.
Particionadas por mês em `criado_em` / `em`, com retenção configurável por tenant e as partições
antigas movidas para armazenamento frio.

---

## 2. Identidade e tenancy

| Tabela | Colunas principais |
|---|---|
| `tenant` | `nome`, `slug` único, `fuso`, `idioma`, `logo_url`, `cor_primaria`, `plano`, `ativo` |
| `usuario` | `tenant_id`, `nome`, `email` (único por tenant), `senha_hash`, `avatar_url`, `ativo`, `ultimo_acesso_em` |
| `papel` | `tenant_id`, `nome`, `de_sistema` (não editável) |
| `permissao` | `codigo` PK global, `descricao`, `grupo` — catálogo, não tem tenant |
| `papel_permissao` | `papel_id`, `permissao_codigo` |
| `usuario_papel` | `usuario_id`, `papel_id` |
| `equipe` | `tenant_id`, `nome`, `descricao` |
| `membro_equipe` | `equipe_id`, `usuario_id`, `funcao` (`membro` \| `lider`) |
| `sessao` | `usuario_id`, `token_hash`, `expira_em`, `ip`, `agente` |
| `chave_api` | `tenant_id`, `nome`, `prefixo` visível, `hash`, `escopos text[]`, `expira_em`, `ultimo_uso_em`, `criada_por` |
| `log_auditoria` | `tenant_id`, `ator_tipo` (`usuario`\|`chave`\|`sistema`), `ator_id`, `acao`, `objeto_tipo`, `objeto_id`, `antes jsonb`, `depois jsonb`, `ip`, `em` |

Papéis do dia 1: `administrador`, `gestor`, `supervisor`, `atendente`, `avaliador`.
Permissão é capacidade nomeada (`conversa.transferir`, `relatorio.esforco.ver`,
`monitoria.avaliacao.revisar`, `consulta.executar`), nunca flag booleana espalhada pelo código.

---

## 3. Conversas

| Tabela | Colunas principais |
|---|---|
| `canal` | `tenant_id`, `tipo` (`whatsapp_cloud`\|`email`\|`widget`), `nome`, `config jsonb` **cifrada**, `ativo` |
| `inbox` | `tenant_id`, `canal_id`, `nome`, `fila_padrao_id` |
| `fila` | `tenant_id`, `nome`, `cor`, `horario_id`, `capacidade_padrao`, `ordem`, `ativa` |
| `fila_atendente` | `fila_id`, `usuario_id`, `capacidade_override` |
| `contato` | `tenant_id`, `conta_id`, `nome`, `telefone_e164`, `email`, `documento`, `avatar_url`, `atributos jsonb`, `bloqueado` |
| `contato_identidade` | `contato_id`, `canal_tipo`, `identificador` — único por (tenant, canal_tipo, identificador) |
| `conversa` | ver abaixo |
| `mensagem` | ver abaixo |
| `anexo` | `tenant_id`, `chave_storage`, `mime`, `bytes`, `duracao_seg`, `largura`, `altura`, `nome_original`, `checksum` |
| `outbox_mensagem` | `mensagem_id`, `tentativas`, `proxima_tentativa_em`, `estado`, `ultimo_erro` |
| `atribuicao` | `conversa_id`, `de_usuario_id`, `para_usuario_id`, `de_fila_id`, `para_fila_id`, `motivo`, `por_usuario_id`, `em` |
| `motivo_pausa` | `tenant_id`, `nome`, `duracao_sugerida_min`, `conta_como_produtivo` |
| `pausa` | `tenant_id`, `usuario_id`, `motivo_id`, `iniciada_em`, `encerrada_em` |
| `status_atendente` | `usuario_id` PK, `estado`, `desde`, `conectado_em` |
| `resposta_pronta` | `tenant_id`, `escopo` (`empresa`\|`pessoal`), `usuario_id`, `categoria`, `atalho`, `titulo`, `corpo`, `ativa` |
| `etiqueta` | `tenant_id`, `nome`, `cor`, `escopo` (`conversa`\|`contato`\|`ambos`), `exclusiva_por_fila`, `obrigatoria_no_encerramento` |
| `conversa_etiqueta`, `contato_etiqueta` | ligação |
| `nota_interna` | `conversa_id`, `usuario_id`, `corpo`, `em` |
| `template_mensagem` | `tenant_id`, `canal_id`, `nome`, `idioma`, `categoria` (`utilidade`\|`marketing`\|`autenticacao`), `status_meta`, `corpo`, `variaveis jsonb`, `cabecalho_tipo` |

### `conversa`

`tenant_id`, `inbox_id`, `contato_id`, `fila_id`, `atendente_id`, `estado`, `prioridade`,
`criada_em`, `atribuida_em`, `primeira_resposta_em`, `encerrada_em`, `encerrada_por`,
`motivo_encerramento`, `em_espera_desde`, `pausado_seg`, `ultima_mensagem_em`,
`ultima_mensagem_de` (`contato`\|`atendente`\|`bot`).

Mais `janela_expira_em timestamptz` e `janela_aberta_por_mensagem_id`.

`ultima_mensagem_de` não é conveniência: é o que sustenta a trava do fechamento automático —
não fecha quando quem deve resposta é o atendente.

`janela_expira_em` é a janela de atendimento de 24 horas do WhatsApp, recalculada a cada mensagem
de entrada do contato. Nulo significa canal sem janela (e-mail, widget). É lido pelo Desk para
decidir se o campo é texto livre ou seletor de template, e pelo relatório de custo.

Índices: `(tenant_id, estado, fila_id)`, `(tenant_id, atendente_id, estado)`,
`(tenant_id, encerrada_em)`, `(tenant_id, contato_id, criada_em desc)`.

### `mensagem`

`tenant_id`, `conversa_id`, `direcao` (`entrada`\|`saida`\|`interna`), `autor_tipo`
(`contato`\|`atendente`\|`bot`\|`sistema`), `autor_id`, `tipo` (`texto`\|`imagem`\|`audio`\|
`video`\|`documento`\|`localizacao`\|`template`), `conteudo`, `anexo_id`, `resposta_pronta_id`,
`template_id`, `estado_entrega`, `erro_codigo`, `erro_texto`, `id_provedor`, `criada_em`,
`entregue_em`, `lida_em`.

Mais, para custo: `dentro_da_janela bool`, `categoria_cobranca`
(`livre`\|`utilidade`\|`marketing`\|`autenticacao`), `custo_centavos`, `disparo_id`.

`resposta_pronta_id` preenchido é o que permite ao relatório de esforço descontar o texto que o
atendente não digitou (ver anexo de métricas).

`disparo_id` amarra a resposta do cliente ao disparo que a originou. É o que faz o relatório de
mensagem ativa contar a janela **a partir do envio**, e não pelo dia do calendário — o defeito que
a comunidade da Blip reclama, em que o disparo das 17h perde as respostas do dia seguinte.

Índice: `(tenant_id, conversa_id, criada_em)`, e `(estado_entrega)` parcial em `falhou`.

---

## 4. Gestão

| Tabela | Colunas principais |
|---|---|
| `evento_atendimento` | `tenant_id`, `conversa_id`, `tipo`, `em`, `usuario_id`, `fila_id`, `dados jsonb` — **imutável**, particionada por mês |
| `metrica_diaria` | `tenant_id`, `dia`, `dimensao_tipo` (`fila`\|`atendente`\|`equipe`\|`inbox`\|`etiqueta`), `dimensao_id`, colunas de soma e contagem |
| `esforco_conversa` | `conversa_id`, `atendente_id`, `chars_escritos`, `chars_lidos`, `audio_ouvido_seg`, `audio_gravado_seg`, `chars_de_resposta_pronta`, `esforco_seg`, `pausado_seg` |
| `esforco_atendente_dia` | `tenant_id`, `dia`, `usuario_id`, `esforco_seg`, `tickets`, `sessao_seg`, `ocupacao` |
| `regra_fila` | `tenant_id`, `nome`, `ordem`, `combinador` (`e`\|`ou`), `fila_destino_id`, `ativa` |
| `regra_fila_condicao` | `regra_id`, `campo`, `operador`, `valor` |
| `regra_prioridade` | `tenant_id`, `nome`, `nivel` (`baixa`\|`media`\|`alta`), `escopo_tipo`, `escopo_id`, `condicao jsonb`, `ativa` |
| `regra_sla` | `tenant_id`, `nome`, `alvo`, `prazo_seg`, `alerta_seg`, `escopo_tipo`, `escopo_id`, `acao_alerta jsonb`, `acao_estouro jsonb`, `ativa` |
| `sla_conversa` | `conversa_id`, `regra_id`, `prazo_em`, `alertado_em`, `estourado_em`, `estado` |
| `horario_atendimento` | `tenant_id`, `nome`, `fuso` |
| `horario_faixa` | `horario_id`, `dia_semana`, `inicio`, `fim` |
| `horario_excecao` | `horario_id`, `data`, `fechado`, `inicio`, `fim`, `motivo` |
| `pesquisa` | `tenant_id`, `tipo` (`csat`\|`nps`), `escala_min`, `escala_max`, `pergunta`, `disparo`, `ativa` |
| `resposta_pesquisa` | `conversa_id`, `pesquisa_id`, `nota`, `escala_min`, `escala_max`, `classe`, `comentario`, `respondida_em` |

`resposta_pesquisa` **guarda a escala junto da nota**. Sem isso, um 4 de CSAT e um 4 de NPS acabam
somados no mesmo gráfico — que é o que acontece hoje quando a empresa tem os dois modelos.

### Catálogo de `evento_atendimento.tipo`

`criada` · `enfileirada` · `atribuida` · `reatribuida` · `transferida_fila` · `primeira_resposta` ·
`mensagem_entrada` · `mensagem_saida` · `espera_iniciada` · `espera_encerrada` · `sla_alertado` ·
`sla_estourado` · `encerrada` · `reaberta` · `avaliada` · `pesquisa_respondida`

Toda métrica do anexo de métricas é derivada daqui, nunca de campo mutável da conversa. É o que
permite recalcular o passado quando a definição de uma métrica muda.

---

## 5. CRM

| Tabela | Colunas principais |
|---|---|
| `conta` | `tenant_id`, `nome`, `documento`, `dominio`, `atributos jsonb`, `proprietario_id` |
| `lead` | `tenant_id`, `contato_id`, `conta_id`, `origem`, `campanha`, `utm jsonb`, `status`, `fase`, `fase_desde`, `proprietario_id`, `score_atual`, `faixa_atual`, `desqualificado_em`, `motivo_desqualificacao_id` |
| `formulario` | `tenant_id`, `nome`, `slug`, `ativo` |
| `formulario_versao` | `formulario_id`, `versao`, `publicada_em` |
| `formulario_pergunta` | `versao_id`, `codigo`, `rotulo`, `tipo`, `opcoes jsonb`, `ordem`, `obrigatoria` |
| `resposta_formulario` | `tenant_id`, `lead_id`, `versao_id`, `pergunta_id`, `valor_texto`, `valor_num`, `valor_data`, `valor_bool`, `valor_json` |
| `regra_score` | `tenant_id`, `versao`, `nome`, `condicao jsonb`, `pontos`, `ativa` |
| `score_lead` | `tenant_id`, `lead_id`, `versao_regra`, `valor`, `faixa`, `explicacao jsonb`, `calculado_em` |
| `faixa_score` | `tenant_id`, `versao`, `nome`, `minimo`, `maximo`, `fila_id`, `estrategia_proprietario` |
| `oportunidade` | `tenant_id`, `lead_id`, `conta_id`, `nome`, `valor`, `moeda`, `fase`, `probabilidade`, `fechamento_previsto`, `fechada_em`, `ganha`, `motivo_perda`, `proprietario_id` |
| `atividade` | `tenant_id`, `tipo`, `lead_id`, `conta_id`, `conversa_id`, `usuario_id`, `resumo`, `corpo`, `ocorrida_em` |
| `importacao` | `tenant_id`, `origem`, `arquivo`, `mapeamento jsonb`, `estado`, `total`, `aceitos`, `rejeitados`, `chave_relatorio` |
| `campo_customizado` | `tenant_id`, `objeto`, `codigo`, `rotulo`, `tipo`, `opcoes jsonb` |

### As duas decisões que sustentam este módulo

**Pergunta de formulário é linha, não coluna.** O Lead do Salesforce de hoje tem 353 campos, 304
customizados, porque cada pergunta virou coluna. Aqui a resposta vive em `resposta_formulario`,
com a versão do formulário junto — então mudar o questionário não quebra o histórico, e o
questionário de março continua legível depois do de setembro. Só sobe para coluna de `lead` o
punhado de campos que o negócio filtra o tempo todo. Campo customizado por tenant vai para JSONB
com índice GIN; nunca `alter table` em tempo de execução.

**Score se explica.** `score_lead.explicacao` guarda o array de `{regra, versão, pontos}` que
produziu o número. Duas consequências que a estrutura atual não dá: responder *por que* o lead
tirou 74, e recalcular a base inteira quando a regra muda, preservando o histórico — porque cada
cálculo é uma linha nova, não uma sobrescrita.

---

## 6. Monitoria com IA

| Tabela | Colunas principais |
|---|---|
| `formulario_avaliacao` | `tenant_id`, `nome`, `versao`, `nota_maxima`, `escopo_fila_id`, `ativo` |
| `grupo_criterio` | `formulario_id`, `nome`, `peso`, `ordem` |
| `criterio` | `grupo_id`, `nome`, `descricao`, `peso`, `tipo`, `fatal`, `ordem` |
| `avaliacao` | `tenant_id`, `conversa_id`, `formulario_id`, `avaliado_id`, `avaliador_tipo` (`humano`\|`ia`), `avaliador_id`, `nota`, `conceito`, `confianca_ia`, `estado`, `avaliada_em`, `revisada_por`, `revisada_em` |
| `resposta_avaliacao` | `avaliacao_id`, `criterio_id`, `valor`, `pontos`, `justificativa`, `evidencia_mensagem_id` |
| `contestacao` | `avaliacao_id`, `aberta_por`, `motivo`, `estado`, `resposta`, `decidida_por`, `decidida_em` |
| `calibracao` | `tenant_id`, `nome`, `periodo_inicio`, `periodo_fim`, `amostra_n` |
| `calibracao_item` | `calibracao_id`, `conversa_id`, `avaliacao_humana_id`, `avaliacao_ia_id`, `desvio_total`, `desvio_por_criterio jsonb` |
| `feedback` | `avaliacao_id`, `de_usuario_id`, `para_usuario_id`, `corpo`, `lido_em` |
| `plano_coach` | `tenant_id`, `usuario_id`, `criterio_id`, `meta`, `prazo`, `estado`, `criado_por` |
| `classificacao_conversa` | `tenant_id`, `conversa_id`, `categoria`, `subcategoria`, `resumo`, `intencao`, `sentimento`, `confianca`, `modelo`, `criada_em` |
| `insight` | `tenant_id`, `periodo_inicio`, `periodo_fim`, `categoria`, `volume`, `variacao_pct`, `candidata_automacao`, `exemplos uuid[]` |
| `consumo_ia` | `tenant_id`, `funcionalidade`, `modelo`, `tokens_entrada`, `tokens_saida`, `custo_centavos`, `objeto_tipo`, `objeto_id`, `em` |
| `base_conhecimento` | `tenant_id`, `nome`, `ativa` |
| `documento_conhecimento` | `base_id`, `titulo`, `corpo`, `versao`, `atualizado_em`, `ativo` |
| `trecho_conhecimento` | `documento_id`, `texto`, `embedding vector(1536)`, `ordem` |

`resposta_avaliacao.evidencia_mensagem_id` é obrigatório quando o critério não sai conforme. É o
que permite o atendente contestar com base em fato, e o que torna a nota auditável.

A base de conhecimento é **incremental e versionada** — documentos independentes, cada trecho
rastreável até o documento e a versão. É o oposto do arquivo único que se substitui inteiro, e é o
que faz a sugestão do copiloto poder citar a fonte.

---

## 7. Automação e extração

| Tabela | Colunas principais |
|---|---|
| `fluxo` | `tenant_id`, `nome`, `canal_id`, `estado` |
| `fluxo_versao` | `fluxo_id`, `versao`, `estado` (`rascunho`\|`publicada`\|`arquivada`), `publicada_em`, `publicada_por` |
| `bloco` | `versao_id`, `codigo`, `nome`, `tipo`, `conteudo jsonb`, `posicao jsonb` |
| `transicao` | `versao_id`, `de_bloco_id`, `para_bloco_id`, `condicao jsonb`, `ordem` |
| `execucao_fluxo` | `tenant_id`, `fluxo_versao_id`, `conversa_id`, `contato_id`, `estado`, `contexto jsonb`, `bloco_atual_id`, `iniciada_em`, `encerrada_em` |
| `execucao_passo` | `execucao_id`, `bloco_id`, `entrada jsonb`, `saida jsonb`, `erro`, `duracao_ms`, `tokens`, `em` |
| `workflow` | `tenant_id`, `nome`, `versao`, `ativo` |
| `gatilho` | `workflow_id`, `tipo` (`evento`\|`agendado`\|`manual`\|`webhook`), `config jsonb` |
| `acao` | `workflow_id`, `ordem`, `tipo`, `config jsonb`, `on_erro` (`parar`\|`continuar`\|`repetir`) |
| `execucao_workflow` | `tenant_id`, `workflow_id`, `payload_gatilho jsonb`, `estado`, `iniciada_em`, `encerrada_em`, `erro` |
| `execucao_acao` | `execucao_workflow_id`, `acao_id`, `entrada jsonb`, `saida jsonb`, `erro`, `duracao_ms` |
| `consulta_salva` | `tenant_id`, `nome`, `texto`, `parametros jsonb`, `criada_por` |
| `agendamento_consulta` | `consulta_id`, `cron`, `formato`, `destino jsonb`, `ativo`, `ultima_execucao_em` |
| `dicionario_objeto` | `tenant_id`, `codigo`, `rotulo`, `descricao` |
| `dicionario_campo` | `objeto_codigo`, `codigo`, `rotulo`, `tipo`, `descricao`, `consultavel`, `agregavel` |
| `webhook_saida` | `tenant_id`, `url`, `eventos text[]`, `segredo`, `ativo` |
| `entrega_webhook` | `webhook_id`, `evento`, `payload jsonb`, `tentativas`, `estado`, `ultimo_erro`, `proxima_tentativa_em` |

O `contexto` de `execucao_fluxo` é o mapa de variáveis que atravessa o fluxo — e ele **sobrevive à
transferência para humano**, porque é o que faz o atendente receber o cliente já sabendo o que o
robô coletou.

O `dicionario_campo` não é documentação: é o que a linguagem de consulta consulta para decidir se
um campo pode ser selecionado, filtrado ou agregado. Consulta nunca vira SQL cru vindo do cliente,
e o `tenant_id` é imposto pelo servidor, não pelo texto da consulta.

---

## 8. Máquinas de estado

**Conversa**

```
        ┌──────────────── reaberta ─────────────────┐
        ▼                                           │
    na_fila ──► atribuida ──► em_atendimento ──► encerrada
        │            │              │  ▲
        │            │              ▼  │
        │            │           em_espera
        │            │
        └────────────┴──────────► encerrada (perdida / abandonada)
```

Transições permitidas são explícitas em `packages/core`. Evento vindo do cliente **não** pode levar
a conversa a estado inválido — a lista de bugs da Blip tem "ticket encerrado pelo usuário em fluxo
humano" justamente porque lá isso não é garantido.

**Mensagem de saída**

```
pendente ──► enviando ──► enviada ──► entregue ──► lida
                 │
                 └──► falhou ──(reenviar)──► pendente
```

`falhou` guarda `erro_codigo` e `erro_texto` e aparece na tela do atendente com o motivo e o botão
de reenviar. Nunca falha em silêncio.

**Avaliação**

```
rascunho ──► concluida ──► encerrada
                 │            ▲
                 └► contestada ┘  (via revisada)
```

---

## 9. O que fica fora do banco

- Arquivo de mídia: storage de objetos; o banco guarda `chave_storage`, `mime`, `bytes` e checksum.
- Estado efêmero de presença e digitação: Redis, com expiração. Perder isso não perde informação.
- Fila de trabalho: BullMQ no Redis. O que precisa sobreviver a reinício tem linha em
  `outbox_mensagem`, `execucao_workflow` ou `entrega_webhook` — a fila é o transporte, não a verdade.
