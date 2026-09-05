# Pipe — desenho do produto

Data: 2026-09-05 · Estado: aprovado verbalmente pelo Anderson, pendente de revisão escrita

## 1. O que é

Pipe é uma plataforma de **CRM + atendimento + monitoria com IA** para empresas, construída para
ser vendida pela PJ de tecnologia do Anderson. Substitui a combinação cara e fragmentada que as
empresas usam hoje — uma plataforma de chat, um CRM e uma ferramenta de qualidade — com três
diferenciais que nenhuma delas entrega junto:

1. **WhatsApp pela API oficial da Meta** — o cliente para de correr o risco de perder o número.
2. **Desk do atendente separado do app de gestão** — o atendente vê só o que precisa para atender.
3. **Monitoria de atendimento com IA** — avaliação automática, insights e demandas recorrentes,
   no lugar de amostragem manual.

### Decisões já tomadas

| Decisão | Escolha | Quando |
|---|---|---|
| Estratégia de construção | **Do zero**, com Twenty e Chatwoot como mapa funcional | 05/09/2026 |
| Reuso de código | Permitido só de pacote MIT (ver §2) | 05/09/2026 |
| Modelo de negócio | Produto vendido pela PJ; multi-tenant desde a primeira linha | 05/09/2026 |
| Separação Desk/Gestão | Dois apps distintos, não um app com permissão | 05/09/2026 |

## 2. Regra de licença e reuso — vinculante

Copiar o código errado inviabiliza a venda do produto. A regra não tem exceção.

**Pode copiar** (MIT; manter o aviso de copyright no arquivo):

- `chatwoot/*` — **exceto** `chatwoot/enterprise/**`
- `twenty/packages/twenty-ui`, `twenty-shared`, `twenty-sdk`, `twenty-client-sdk`

**Não pode copiar — ler e reimplementar:**

- `twenty/packages/twenty-server` e `twenty-front` — **AGPLv3**. Código derivado desses pacotes
  obriga a publicar o código do Pipe para qualquer usuário que o acesse pela rede, o que mata a
  venda de licença fechada.
- `chatwoot/enterprise/**` — licença proprietária paga. É onde ficam, no Chatwoot, a distribuição
  por carga real, o RBAC customizado, o SLA e o copiloto de IA. Todos serão escritos do zero aqui.

**Documentação de terceiros** (help.blip.ai, docs do Chatwoot e do Twenty): o comportamento de
uma função não é protegido por copyright, o texto que a descreve é. Descrever o comportamento com
nossas palavras é livre; colar o texto deles não.

Todo arquivo que contiver código copiado carrega no topo o comentário
`Adaptado de <projeto> (<licença>) — <url do arquivo original>`.

## 3. Arquitetura

Um monorepo, cinco aplicações, um banco.

```
pipe/
  apps/
    desk        Next.js   tela do atendente
    gestao      Next.js   monitoramento, relatórios, regras, monitoria
    crm         Next.js   leads, oportunidades, contas, contatos
    api         NestJS    REST + WebSocket; dono das regras de domínio
    workers     NestJS    BullMQ: entrega de mensagem, IA, agregações, relatórios
  packages/
    ui          design system Pipe (tokens, componentes, marca)
    db          Drizzle: schema, migrations, políticas RLS
    core        regras puras e testáveis: score, esforço, SLA, distribuição, métricas
    ai          resumo, classificação e avaliação — Claude
    contracts   tipos e schemas Zod compartilhados entre api e fronts
```

- **Postgres** único. `tenant_id` em toda tabela de negócio, com Row Level Security ligada.
- **Redis + BullMQ** para fila de trabalho e agendamento.
- **WebSocket** com canal por tenant e por conversa, para o realtime do Desk e do Monitoramento.
- **Docker Compose** atrás do Traefik que já roda na VPS OVH (`149.56.12.166`, `/opt/stack`).

### Por que três front-ends e não um com permissão

É a lição direta da Blip: o Desk do atendente tem cinco ícones e nada mais — sem relatório, sem
regra, sem configuração de fila. Isso não é resultado de esconder menu por papel; é resultado de
ser outro aplicativo, com outro modelo mental e outro ciclo de release. Esconder por permissão
produz uma tela cheia de caminhos mortos e um bundle que carrega código que o atendente nunca usa.

Os três fronts compartilham `packages/ui` e `packages/contracts`, e falam com a mesma `api`.

### Por que a lógica vive em `packages/core`

Score, esforço, SLA, distribuição por carga e cálculo de métrica são funções puras: entram dados,
sai número. Isoladas em `core`, são testáveis sem banco, sem HTTP e sem dublê — e é exatamente aí
que erro de cálculo custa caro, porque vira número em relatório que o cliente usa para decidir
sobre gente.

## 4. Módulos e fronteiras

Cinco módulos. Cada um com dono claro, interface explícita, e compreensível sozinho.

### 4.1 Identidade e Tenancy

`tenant` · `usuario` · `papel` · `permissao` · `equipe` · `membro_equipe` · `sessao`

Base de tudo; não depende de ninguém. Papéis do dia 1: **administrador**, **gestor**,
**supervisor**, **atendente**, **avaliador**. Permissão é lista de capacidades nomeadas, não flag
booleana espalhada pelo código.

O `tenant` carrega a personalização: nome, logo, cor primária, fuso, idioma. White-label é
configuração, nunca build separado.

### 4.2 CRM

`conta` · `contato` · `lead` · `oportunidade` · `formulario` · `formulario_versao` ·
`formulario_pergunta` · `resposta_formulario` · `regra_score` · `score_lead` · `atividade`

**A decisão que evita repetir o erro do Salesforce.** A org de hoje tem 353 campos no Lead, 304
deles customizados, porque cada pergunta de formulário virou uma coluna
(`Com_que_frequencia_vcposta_reels__c`, `Como_se_sente_em_rela_o_ao_seu_banco__c`). Aqui:

- pergunta de formulário vira **linha** em `resposta_formulario` (formulário + versão + pergunta +
  valor tipado), não coluna;
- só o punhado de campos que o negócio filtra o tempo todo sobe para coluna do `lead`;
- campo customizado por tenant existe, declarado em `campo_customizado` e guardado em JSONB com
  índice GIN — não vira DDL em tempo de execução.

**Score é objeto de primeira classe.** `regra_score` (condição, peso, versão, ativa) produz
`score_lead` (valor, faixa, versão da regra, explicação por regra, timestamp). Duas consequências
que a estrutura atual não dá: responder *por que* este lead tirou 62, e recalcular a base inteira
quando a regra muda, sem perder o histórico. A faixa é a saída do motor, e é ela que decide fila e
proprietário — replicando o comportamento do webhook n8n `kq4lU8aFv5CKNpvr` (60 ou mais vai para
closer, abaixo disso para o Comercial).

**Importação de outros CRMs** é um mapeamento origem → campo Pipe, com pré-visualização,
deduplicação por CPF, e-mail ou telefone, e relatório de linhas rejeitadas. Salesforce, HubSpot,
RD Station e CSV.

### 4.3 Conversas

`canal` · `inbox` · `conversa` · `mensagem` · `anexo` · `fila` · `atribuicao` · `pausa` ·
`resposta_pronta` · `etiqueta` · `nota_interna`

Canais do dia 1: **WhatsApp Cloud API oficial**, **e-mail** e **widget de site**. Os três caem na
mesma tela do Desk — um dos pedidos explícitos.

**Entrega de mensagem é o coração, e é onde a concorrência falha.** A lista de bugs da comunidade
da Blip é literalmente a lista de requisitos. Portanto:

- toda mensagem de saída passa por **outbox** com estado próprio
  (`pendente → enviando → enviada → entregue → lida | falhou`) e retry com backoff;
- falha é **visível na tela do atendente**, com motivo e botão de reenviar — nunca silenciosa;
- mídia sobe primeiro para o storage e só depois é referenciada no envio, com verificação de tipo
  e tamanho antes de chamar a Meta;
- o estado da conversa é máquina de estados explícita, e evento do usuário final não pode levá-la
  a estado inválido.

**Distribuição por carga real**, não round-robin. Cada atendente tem capacidade configurável, e a
carga é a soma ponderada das conversas abertas atribuídas a ele — conversa aguardando resposta do
atendente pesa mais que conversa aguardando o cliente. A escolha: entre os atendentes online,
habilitados na fila e abaixo da capacidade, vai para o de menor carga; empate desempata pelo que
está há mais tempo sem receber. Vive em `packages/core`, testado com tabela de casos.

### 4.4 Gestão

`evento_atendimento` · `metrica_diaria` · `regra_fila` · `regra_sla` · `horario_atendimento` ·
`esforco_atendente` · `relatorio_agendado`

Cada transição relevante da conversa grava um `evento_atendimento` imutável: entrou na fila,
atribuída, primeira resposta do atendente, resposta do cliente, transferida, pausada, encerrada,
avaliada. Toda métrica é derivada desses eventos, nunca de campo mutável na conversa — é isso que
permite recalcular o passado quando a definição de uma métrica muda.

**Monitoramento em tempo real** replica os cartões da Blip, porque eles estão certos: na fila,
tempo máximo na fila, tempo máximo até a primeira resposta, em atendimento, média de tickets por
atendente, status dos atendentes (online, pausa, invisível), tempos médios do dia e tickets
perdidos, abandonados, finalizados e fechados. Abaixo, a tabela detalhada com abas por
atribuído/aguardando, atendentes, filas e etiquetas.

**Relatório semanal individual de esforço** usa a régua determinística já validada em produção
(implementação em `~/digisac-esforco`):

- caracteres escritos pelo atendente ÷ 200/min (digitação)
- caracteres recebidos do cliente ÷ 1.000/min (leitura)
- duração dos áudios recebidos (escuta em 1×) e dos áudios gravados (fala)
- duração de áudio estimada por tamanho quando não vier no metadado: Opus a ~16 kbps → 2 KB/s
- régua de apoio: tempo em sessão, somando intervalos entre mensagens consecutivas de até 10 min
- média ponderada por construção: esforço total ÷ tickets total, para que dia cheio pese mais

Ressalva registrada no relatório original, que o produto precisa expor: a régua assume texto
digitado à mão, então template e resposta pronta inflam o esforço. O Pipe desconta o conteúdo
originado de resposta pronta e o exibe em coluna separada.

**Regras** são condição → ação versionada, em três famílias separadas, como na Blip: regra de fila
(decide para onde a conversa vai), regra de SLA (o que dispara e o que acontece ao estourar) e
horário de atendimento (expediente, feriado, mensagem fora do horário).

### 4.5 Monitoria com IA

`formulario_avaliacao` · `grupo_criterio` · `criterio` · `avaliacao` · `resposta_avaliacao` ·
`contestacao` · `calibracao` · `plano_coach` · `insight` · `consumo_ia`

Modelo copiado em espírito do 2clix, que acertou a estrutura: formulário (grupo → critério → peso,
com critério fatal que zera a nota) × avaliação (avaliado, avaliador humano **ou** IA, nota,
conceito, etiquetas, sinalizações) × ciclo (feedback → contestação → calibração → coach).

O 2clix tem cerca de setenta relatórios. Eles não são setenta consultas: são recortes desse modelo
cruzado com a hierarquia (avaliado → superior → equipe → campanha). Acertando o modelo, o Pipe
entrega o mesmo com uma camada de relatório parametrizada, não com setenta telas.

**Avaliação automática:** ao encerrar, a conversa vira transcrição normalizada; o agente de IA
responde o formulário critério a critério, cada resposta com trecho citado como evidência. A nota
da IA nasce como **sugestão** e vira nota efetiva conforme a política do tenant — sempre, só acima
de um limiar de confiança, ou nunca (apoio ao avaliador humano).

**Calibração** é o mecanismo que mantém a IA honesta: uma amostra é avaliada por humano e por IA,
e o desvio por critério é medido e exibido. Critério que desvia demais é sinalizado para revisão de
prompt. É a bancada de medição que levou o `case-sync` de 26% para 64% de acurácia, generalizada.

**Insights e demandas recorrentes:** resumos e classificações de conversa são agregados por período
em `insight`, com volume, tendência e conversas de exemplo. É a tela onde o gestor decide o que
automatizar — o pedido original, e o `case-sync` generalizado.

**Consumo** registra tokens e chamadas por tenant, por funcionalidade e por modelo. Sem isso o
produto vende IA no prejuízo. Aparece como painel para o cliente e como base de cobrança.

## 5. O fluxo que costura os cinco

```
formulário do site
      │
      ▼
  Lead criado ──► motor de score ──► faixa ──► fila + proprietário
      │                                            │
      │                                            ▼
      │                                    conversa no WhatsApp
      │                                            │
      │                                atendimento e encerramento
      │                                            │
      │                     ┌──────────────────────┴──────────────────────┐
      │                     ▼                                             ▼
      │              resumo por IA                             avaliação da monitoria
      │                     │                                             │
      └─ timeline do Lead ◄─┘                                             ▼
                            │                                   nota, ofensores, coach
                            ▼
                 classificação agregada ──► demanda recorrente ──► decidir o que automatizar
```

## 6. Multi-tenant e segurança

- `tenant_id` em toda tabela de negócio; RLS ligada com política baseada em variável de sessão que
  a `api` define a cada requisição. Consulta sem tenant não retorna linha — falha fechada.
- Segredo de canal (token da Meta, senha SMTP) cifrado em repouso, com a chave fora do banco.
- Webhook de entrada validado por assinatura HMAC, com janela de tempo curta contra replay.
- Log de auditoria para o que muda regra, permissão, nota de avaliação e dado de contato.
- Conversa é dado pessoal: exclusão a pedido do titular precisa existir desde o começo, não depois.

## 7. Erro, e o que a concorrência ensina a não fazer

A lista de bugs reclamados na comunidade da Blip vira critério de aceite:

| Falha deles | Requisito nosso |
|---|---|
| Áudio que o atendente ouve e o cliente não recebe | Status por mensagem visível; falha de mídia com motivo e reenvio |
| Notificação não avisa ticket novo | Notificação em três camadas — som, contador na aba, push do navegador — com teste na configuração |
| Template com imagem falha | Validação da mídia do template antes do envio, com erro legível |
| Respostas prontas não carregam | Respostas prontas em cache local; funcionam com a rede oscilando |
| Ticket encerrado pelo usuário em fluxo humano | Máquina de estados explícita; evento do usuário não corrompe estado |
| Travamento do Desk web | Orçamento de performance por tela e reconexão de WebSocket com backoff |
| Loop infinito entre canais | Detector de laço: mesma origem e destino acima de N mensagens no intervalo T pausa e alerta |

## 8. Testes

- `packages/core`: tabela de casos para score, esforço, SLA, distribuição e cada métrica. Todo
  número que aparece em relatório tem teste com valor esperado escrito à mão.
- `apps/api`: teste de integração por caso de uso, com banco real em container.
- Entrega de mensagem: teste com a API da Meta dublada, cobrindo falha, retry e duplicata.
- Monitoria: conjunto de referência de conversas com nota humana; a acurácia da IA é medida contra
  ele a cada mudança de prompt, e a métrica é registrada — a bancada do `case-sync`.
- Fronts: teste do caminho crítico do atendente (receber, responder, transferir, encerrar).

## 9. Fases

| Fase | Entrega | Depende de |
|---|---|---|
| 1 | Fundação: monorepo, `db` com RLS, Identidade e Tenancy, `ui` com a marca | — |
| 2 | Conversas: WhatsApp oficial, filas, distribuição por carga, e o **Pipe Desk** | 1 |
| 3 | Gestão: eventos, monitoramento em tempo real, métricas, esforço, regras e SLA | 2 |
| 4 | Monitoria com IA: formulário, avaliação automática, calibração, insights, consumo | 3 |
| 5 | CRM: leads, formulários versionados, score, importação, e a ponte com Conversas | 1 |

A Monitoria (fase 4) é o único módulo que também funciona sozinho, plugado na Blip, na Digisac ou
no Chatwoot que o cliente já usa. Se aparecer oportunidade de receita antes da fase 4, ela pode ser
antecipada como produto independente sem quebrar este desenho — o que muda é só a origem da
transcrição.

## 10. Fora de escopo agora

Adiados de propósito, para não inflar a fundação:

- Construtor visual de fluxo / chatbot. O Pipe recebe e atende; automação de fluxo fica no n8n que
  já existe, via webhook.
- Telefonia e voz.
- Marketplace de extensões.
- Aplicativo móvel nativo. O Desk é web responsivo.
- Metadata engine com DDL em tempo de execução, no estilo Twenty. Campo customizado em JSONB
  resolve por muito tempo, sem a complexidade de migração de schema por tenant.
- Instagram, Messenger e Telegram. A arquitetura de canal já prevê, mas não entram no dia 1.

## 11. Em aberto

1. **Origem dos insights quando o lead não vem por canal oficial.** Pergunta registrada pelo
   Anderson em 05/09: se o Chatwoot do cliente está integrado por caminho não oficial e recebe lead
   do site, de onde sai o insight da IA? Resposta provável: da transcrição, que existe
   independentemente de o canal ser oficial — o canal oficial protege o número, não a análise.
   A confirmar antes da fase 4.
2. **Política padrão de nota da IA**: sugestão sempre, automática acima de um limiar de confiança,
   ou só apoio ao avaliador humano.
3. **Preço e unidade de cobrança** — por atendente, por conversa, por avaliação, ou híbrido. Define
   o que o `consumo_ia` precisa medir.
