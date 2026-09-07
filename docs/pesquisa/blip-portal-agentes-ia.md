# Portal Blip — Módulo Agentes IA (AI Agents)

Levantamento do módulo **Agentes IA** do Portal Blip, extraído de arquivo capturado da organização **Supernova** (app "AUVP Capital"), **somente leitura**.

**Fontes exploradas:**
- `portalmfe.blip.ai/beagle/portal-fragment-ai-agents/latest/main.js` (7.5 MB) — módulo específico de Agentes IA

---

## 1. Estrutura geral do módulo

O módulo **Agentes IA** (AI Agents) oferece um **gerenciador de skills e integrações** — tools reutilizáveis que agentes IA podem usar para executar tarefas.

### Componentes principais

- **Skills** — blocos de funcionalidade (integrações com APIs, scripts, etc)
  - Skills customizados (custom skills)
  - Skills da biblioteca (library)
  - Skills da loja (store)
- **Tarefas** (Tasks) — formulários que amarram skills a cenários
- **Integrações** (Integrations) — conexões com plataformas externas
- **FAQ Skills** — skills especializadas em responder perguntas frequentes

### Conceito: "Skill"

Uma skill é uma **unidade de trabalho** que um agente IA pode executar:
- Exemplos: "Buscar cliente em BD", "Enviar email", "Consultar ordem", "Classificar sentimento"
- Pode ser customizada ou pré-construída
- Tem entrada/saída definida (padrão não confirmado)

---

## 2. Telas e roteamento

### Rotas descobertas

| Tela | Rota | Função |
|---|---|---|
| Skills — Biblioteca | `/skills` | Listagem central de skills disponíveis |
| Detalhe da Skill | `/skills/{skillId}` | Informações, histórico, uso |
| Skill Customizada | `/skills/custom` | Editor/gerenciador de custom skills |
| Gerenciamento | `/skills/management` | CRUD de skills próprias |
| Detalhe (Gerenciar) | `/skills/management/{skillId}` | Editar skill individual |
| Loja de Skills | `/skills/store` | Marketplace de skills pré-construídas |
| Detalhe (Loja) | `/skills/store/{skillId}` | Informações de skill comercial |
| Integrações | `/skills/integrations` | Listagem de integrações ativas |
| Criar Integração | `/skills/integrations/create` | Fluxo de setup de nova integração |
| Editar Integração | `/skills/integrations/{integrationId}/edit` | Alterar integração existente |
| Tarefas | `/skills/tasks` | Listagem de task forms |
| Formulário de Tarefa | `/skills/tasks/form` | Editor visual de tarefa |
| FAQ Skills | `/skills/faq` | Skills para FAQ |
| Diagnóstico | `/events/diagnostic/` | Logs e troubleshooting |

### Rota principal com redirecionamento

- Padrão: `/skills/` — redireciona para `/skills` (biblioteca principal)

---

## 3. Blocos de conteúdo e campos

### Cabeçalho de skill

| Campo | Tipo | Exemplo |
|---|---|---|
| Nome da skill | texto | "Buscar Cliente", "Classificar Sentimento" |
| Descrição | texto | explicação breve da funcionalidade |
| Ícone/Logo | imagem | visual identificador |
| Status | enum | ativa, inativa, beta |
| Versão | versão | "1.0.0", "2.1.3" |

### Propriedades de skill

Baseado em padrões de "skill detail":

- **Input** — parâmetros que skill recebe (ex.: "customer_id", "message_text")
- **Output** — dados que skill retorna (ex.: "customer_data", "sentiment_score")
- **Integração** — qual API/serviço a skill conecta
- **Timeout** — máximo de tempo que skill pode demorar (não confirmado, inferido)
- **Retry Policy** — comportamento em falha (não confirmado)

### Campos de custom skill

- Nome (obrigatório)
- Descrição (obrigatório)
- Código/Script (editor de código)
- Parametros de entrada (mapeamento)
- Mapeamento de saída

---

## 4. Listagem e descoberta de skills

### Guias/Abas principais

- **Biblioteca** (`/skills`) — todas as skills disponíveis (próprias + loja)
- **Customizadas** (`/skills/custom`) — só skills que você criou
- **Gerenciamento** (`/skills/management`) — editar/deletar skills próprias
- **Loja** (`/skills/store`) — skills premium/marketplace
- **Integrações** (`/skills/integrations`) — conexões com APIs externas
- **Tarefas** (`/skills/tasks`) — forms vinculadas a skills
- **FAQ** (`/skills/faq`) — skills para perguntas frequentes

### Buscas e filtros

Não confirmado em detalhe, mas provável:
- Busca por nome de skill
- Filtro por categoria (integrações, customizadas, loja, FAQ)
- Filtro por status (ativa/inativa)
- Ordenação (nome, popularidade, data de criação)

### Mensagens de estado

- "Unlock Full Potential" — CTA para ativar funcionalidades (inferido de `u.unlockFullPotential`)
- "Discover AI Agents" — CTA para explorar agentes (inferido de `u.discoverAiAgents`)

---

## 5. Integração de APIs externas

### Fluxo de integração

1. Ir para `/skills/integrations`
2. Clicar "Criar Integração" ou `Create Integration`
3. Selecionar tipo de integração (Salesforce, HubSpot, Stripe, etc.)
4. Preencher credenciais (API key, tokens, URLs)
5. Testar conexão
6. Salvar integração
7. Usar integração em custom skills

### Campos de integração

- **Nome da integração** — identificador único
- **Tipo/Plataforma** — qual serviço (Salesforce, CRM, etc.)
- **Credenciais** — API key, Bearer token, OAuth flow
- **Status** — conectado, erro, aguardando permissão
- **Última sincronização** — timestamp de último sync

### Mensagens de estado de integração

- "Conectado com sucesso"
- "Falha na autenticação" (credenciais inválidas)
- "Aguardando autorização" (OAuth pendente)
- "Integração expirou" (token expirado)

---

## 6. Criação e edição de skills customizadas

### Modo de criação

- Tipo: **Editor visual** ou **Editor de código** (não confirmado qual é padrão)
- Entrada: parâmetros que skill recebe (ex.: customer_id: number, message: string)
- Lógica: código/fluxo que processa entrada
- Saída: resultado que skill retorna (ex.: customer_name: string, is_vip: boolean)

### Validações

Inferidas de padrões comuns:
- Nome é obrigatório
- Descrição é recomendada
- Pelo menos 1 parâmetro de entrada
- Pelo menos 1 parâmetro de saída
- Código/lógica deve ser válida (parsing, sintaxe)

### Publicação e versioning

- Ao salvar skill customizada, recebe versão automática (1.0.0, 1.0.1, etc.)
- Histórico de versões conservado (não confirmado se rollback é possível)
- Skill fica "rascunho" até publicação (não confirmado)

---

## 7. Task Forms (Formulários de Tarefa)

Uma **task** vincula uma skill a um formulário visual que usuários/agentes preenchem.

### Componentes de task form

- **Título da tarefa**
- **Descrição**
- **Campos de entrada** — inputs que usuário/agente fornece
  - Tipo: texto, número, data, select, checkbox, etc.
  - Validação (obrigatório, min/max length, regex)
- **Skill vinculada** — qual skill é disparada ao submeter
- **Mapeamento de campos** — liga campos do form aos parâmetros da skill
- **Resposta/Resultado** — como mostrar saída da skill ao usuário

### Editor de task form

Rota: `/skills/tasks/form`

- UI visual para drag-and-drop de campos
- Preview do form em tempo real (não confirmado)
- Teste de skill durante edição (não confirmado)

---

## 8. FAQ Skills

Skills especializadas em responder **perguntas frequentes** (FAQ).

### Características de FAQ Skill

- Tipo de skill especializado para uso em FAQ
- Indexa base de conhecimento (perguntas + respostas)
- Busca semântica (não confirmado, inferido do padrão)
- Rota específica: `/skills/faq`

### Dados de FAQ

Campos de cada entrada FAQ:
- Pergunta
- Resposta
- Categoria (opcional)
- Tags (opcional)
- Sincronismo com agentes (em "Agents using FAQ")

---

## 9. Eventos e diagnóstico

### Dashboard de diagnóstico

Rota: `/events/diagnostic/`

- Logs de execução de skills
- Status de integrações
- Erros e avisos
- Histórico de tentativas
- Performance (latência, timeout)

### Informações de evento

Para cada execução de skill:
- Timestamp (quando rodou)
- Skill ID
- Status (sucesso, erro, timeout)
- Input data (parâmetros enviados)
- Output data (resultado obtido)
- Mensagem de erro (se houver)
- Tempo de execução

---

## 10. Limites, timeouts e intervalos

### Limites de skill

| Parâmetro | Valor | Contexto |
|---|---|---|
| Timeout de skill | Não confirmado | máximo de tempo de execução |
| Tamanho máximo de entrada | Não confirmado | limite de dados que skill recebe |
| Tamanho máximo de saída | Não confirmado | limite de dados que skill retorna |
| Retenção de logs | Não confirmado | dias de histórico mantido |
| Limite de integrações | Não confirmado | quantas integrações por conta |
| Limite de custom skills | Não confirmado | quantas skills customizadas por conta |

### Timeouts operacionais

Inferidos de padrões de execução:
- Negociação de sessão: 16 segundos
- Busca de skill: debounce/cache típicos
- Sincronização de integração: batch job (horário não confirmado)

---

## 11. Mensagens de erro e bloqueio

### Erros de integração

- "Falha na autenticação com [Plataforma]"
- "Credenciais inválidas ou expiradas"
- "Integração não disponível no momento"
- "Erro ao testar conexão com [Plataforma]"

### Erros de skill

- "Skill não encontrada"
- "Parâmetro obrigatório ausente: [name]"
- "Tipo de dado inválido para [param]: esperado [type], recebido [received]"
- "Timeout — skill demorou mais que o máximo permitido"
- "Skill falhou com erro: [message]"

### Validações de input

- "Nome é obrigatório"
- "Descrição deve ter no mínimo 10 caracteres"
- "Código contém erro de sintaxe na linha [line]"

---

## 12. Permissões e controles de acesso

Baseado em padrões de Blip:

- **Visualizar biblioteca de skills** — padrão, sem permissão especial
- **Criar custom skill** — pode exigir permissão `AI_AGENTS_CUSTOM_SKILLS`
- **Editar skill própria** — requerido `AI_AGENTS_CUSTOM_SKILLS`
- **Criar integração** — pode exigir permissão de admin
- **Editar integração** — requerido admin ou criador
- **Usar skill em agent** — requerido permissão de usar agentes IA

---

## 13. Navegação e fluxos

### Do Builder (Editor de Fluxo) para Agentes IA

No Builder, ao criar bloco de tipo "IA Agent" ou similar:
1. Seleciona agente IA disponível
2. Agente tem skills vinculadas
3. Cada skill pode ter task form que pausa fluxo para entrada do usuário
4. Resultado da skill volta ao fluxo como variável

### Discovery de agentes

- Padrão: ver "Discover AI Agents" → ir para loja ou marketplace
- Sugestão: carregar sugestões baseadas em caso de uso

---

## 14. Diferenças vs. documentos anteriores

**Novidade:** Nenhum documento anterior cobria Agentes IA em detalhe.

- **blip-portal-telas.md** — focava em Builder, não em Agentes
- **blip-telas-atendimento.md** — focava em Desk/Atendimento
- **blip-portal-home.md** — focava em home/entry point

**Este documento é complementar** ao ecossistema de interface do Blip.

---

## 15. Notas de método

- Arquivo explorado: `portal-fragment-ai-agents/latest/main.js` (7.5 MB)
- Técnica: busca por rotas, nomes de componentes, padrões de feature flags
- Limitações:
  - Sem acesso a DOM vivo
  - Alguns campos e comportamentos inferidos de nomes de rota/componente
  - UI visual não capturada
- Não confirmado:
  - Layout exato de telas
  - Validações de campo detalhadas
  - Timeouts e limites numéricos (típicos não disponíveis em bundle compilado)
  - Fluxos de OAuth/integração (detalhes de segredo)

**O que não é escopo (YAGNI):**
- Documentação de API de skills
- Guia de desenvolvimento de skill
- Documentação de segurança de integração
- Especificação de formato de input/output

**Não confirmado:** Quais skills vêm pré-instaladas, qual é o preço de skills da loja, fluxo de publicação de skill própria para loja.
