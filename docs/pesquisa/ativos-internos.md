# Ativos internos já existentes (base para o Pipe)

## Salesforce (org playground `anderson.linhares@auvp.com.br.playground`)
Objeto **Lead**: 353 campos (49 padrão + **304 customizados**).
É a "estrutura pronta" de captação por formulários que o usuário citou.

Campos-chave para o Pipe:
- Score / roteamento: `Score__c`, `Faixa_Score__c`, `Faixa_Score_Roteamento__c`, `Rating`
- Origem: `LeadSource`, `Source__c`, `UTM_Source__c`, `Campanha__c`, `Como_Conheceu_o_Curso__c`
- Ciclo: `Status`, `Dias_na_Fase__c`, `Data_da_Ultima_Alteracao_da_Fase__c`,
  `DataDesqualificacao__c`, `Motivo_da_Desqualificacao__c`, `Data_Retorno_Follow_Up__c`
- Propriedade: `OwnerId`, `Closer__c`, `Legacy_OwnerId__c`
- Diagnóstico (bloco `Diag_*`): Idade, Momento, Objetivo, Patrimônio Global/Investido/Projetado,
  Aporte Mensal, Imóveis, Perfil Patrimonial, Preocupações, Renda Projetada, Tags, Versão
- Dezenas de campos que são literalmente **perguntas de formulário** viradas coluna
  ("Com que frequência posta reels", "Como se sente em relação ao seu banco", ...)
- Integração: `BSUID__c` (WhatsApp), `C2MePhone__c`, `Aguardando_IA__c`, `Bext_*`

### Leitura para o Pipe
1. O padrão "1 pergunta = 1 campo" gerou 304 colunas. No Pipe isso deve virar
   **respostas de formulário versionadas** (form/versão/pergunta/resposta) + um punhado de
   campos derivados promovidos ao objeto Lead. Senão o Twenty herda a mesma dívida.
2. Score e faixa de roteamento já são conceito de negócio consolidado — o Pipe precisa de
   motor de score explícito (regras + peso + versão), não de um campo calculado escondido.
3. Já existe webhook n8n (kq4lU8aFv5CKNpvr) que seta fila do consultor e dispara template
   por faixa de score (60+ closer, 60- Comercial). É o comportamento a absorver.

## Infra e código já rodando
- **Twenty CRM self-hosted** em `crm.barboo` (VPS OVH 149.56.12.166, `/opt/stack`),
  com Traefik/HTTPS e Postgres+Redis compartilhados. Scripts locais em `~/twenty-crm`
  (`campos-funil.mjs`, `funil-cartao.mjs`, `schema-banking.mjs`, `view-busca.mjs`, `smoke-test.mjs`)
  = experiência real de manipular schema/campos/views do Twenty via API.
- **Chatwoot** rodando (mesma VPS) + repositório `~/barboo_chatwoot` com compose local/oracle/prod,
  docs de arquitetura, operação, segurança e deploy. Inbox de canal API já configurada
  (identifier `yK1g…`, assinatura `sha256=HMAC(secret,"ts.body")`).
- **n8n** em produção (VPS Hostinger e OVH) — orquestração já existente.
- **blip-dash** (`~/blip-dash`): Next.js + Drizzle + Postgres schema `blip`, conhecimento
  consolidado das APIs da Blip, roteador, tickets, tunnels e disparo de template.
- **Régua de esforço de atendimento** já definida (escrever/ler/ouvir/falar por ticket:
  200 e 1.000 char/min, áudio 2 KB/s) — base pronta do relatório individual de esforço.
- **case-sync**: pipeline n8n que classifica atendimento encerrado em Case do Salesforce
  (categoria/subcategoria/resumo), acurácia levada de 26% para 64% com bancada de medição.
  = protótipo funcional do "histórico com resumo por IA" e das "demandas frequentes".
