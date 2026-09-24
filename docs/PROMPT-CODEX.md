# Prossiga a construção do Pipe

Cole este texto inteiro como primeira mensagem. Ele é autossuficiente: diz onde está
cada coisa, o que já foi decidido, o que falta e o que não pode ser refeito.

---

## O produto

Pipe é uma plataforma de atendimento e CRM para vender a empresas, em
`userpipe.com.br`. Três frentes que conversam pela mesma API:

- **Desk** — a tela do atendente. Visual copiado do Blip Desk, que é layout validado.
- **Gestão** — supervisão, filas, regras, SLA, monitoria.
- **CRM** — leads e oportunidades, espelhados no Twenty.

Mais um **chatbot com builder**, onde a empresa cliente monta os próprios processos,
com ajuda de uma IA que também tira dúvidas sobre métricas e fluxos.

## Regra número um: não refaça o que já existe

`pipe/referencias-blip/pesquisa/` tem **40+ documentos, mais de 14 mil linhas** de engenharia
reversa da Blip, do Chatwoot e do Twenty, feitas contra código-fonte real. Antes de
pesquisar qualquer coisa, procure ali. Já aconteceu de refazerem levantamento pronto.

Os que mais importam:

| Arquivo | O que tem |
|---|---|
| `blip-api-schemas.md` | protocolo LIME, 17 extensões, schemas de Ticket/Contact/Attendant/Rule/Template, estrutura do Builder, webhook, limites. **1.469 linhas, com marca de procedência por afirmação** |
| `blip-desk-regras-tecnicas.md` | enums, máquinas de estado, as 49 `OwnerProps`, as 17 permissões, validações |
| `blip-gestao-regras-tecnicas.md` | como a Gestão grava configuração, regras, SLA, prioridade, horário; as 3 camadas de permissão; ~75 `OwnerProps` |
| `blip-identidade-tenant-permissao.md` | usuário global × tenant × permissão por bot; o duplo portão |
| `catalogo-gatilhos-acoes.md` | 53 peças do builder, cruzando Blip e Twenty, com vocabulário decidido |
| `chatwoot-seguranca-performance.md` | Pundit, isolamento, CVEs, índices, paginação, rate limits |
| `twenty.md` | metadata engine, as duas APIs GraphQL, tipos de campo |
| `arquitetura-multi-tenant.md` | pool × silo × bridge, com números e gatilho de troca |

## O que já está de pé

### No monorepo `pipe/`

- **`apps/api`** — 11 controladores (conversas, canais, mensagens-ativas, webhooks-whatsapp, crm, sso, convites, operação, anexos), 15 módulos de domínio
- **`packages/db`** — ~90 tabelas em 7 schemas, com RLS multi-tenant
- **`packages/core`** — distribuição por carga ponderada, SLA que pausa quando aguarda cliente, métricas (TMR/TME/TMA), régua de esforço, janela de 24h, score. **Com testes.**
- **`packages/ai`** — classificação, resumo, transcrição, avaliação, controle de consumo, e uma **bancada** que barra mudança de prompt sem regressão
- **`apps/gestao`** — 19 rotas já criadas
- **`apps/desk`, `apps/crm`, `apps/workers`, `apps/site`**

### Fora do monorepo: `desk-clone/`

O Desk e a Gestão **originais da Blip rodando localmente**, sem Blip e sem login,
com dados falsos e a marca Pipe aplicada. Servem como referência visual viva.

```bash
cd ~/desk-clone && node servidor.js
# Desk:    http://127.0.0.1:8787/
# Gestão:  http://127.0.0.1:8790/
```

Leia `desk-clone/LEIAME.md` e `desk-clone/ESTADO.md`.

## O que falta construir, em ordem de dependência

### 1. Dicionário de metadados do Twenty  ← comece aqui

As tabelas `dicionarioObjeto` e `dicionarioCampo` (em `packages/db/src/schema/automacao.ts`)
existem e estão **vazias**. Um worker precisa ler a **Metadata API** do Twenty
(`/metadata`, não `/graphql`) e preencher, por tenant.

Sem isso nada depois funciona: o builder não sabe quais campos oferecer, e a IA não
sabe o que existe para montar fluxo — ela chuta.

Regras que já custaram caro (estão no cabeçalho de `apps/api/src/dominio/twenty.ts`):
- o schema de **autenticação** está em `/metadata`, não em `/graphql`
- casar por **`name`**, nunca por `label` — o workspace em pt-BR devolve rótulo traduzido
- URL e chave vêm do **tenant**, nunca do ambiente; sem configuração a integração não
  acontece. Fallback silencioso é como o dado de um cliente vai parar no CRM de outro.

### 2. Motor de fluxo (o interpretador)

`fluxo`, `bloco`, `transicao`, `execucaoFluxo`, `execucaoPasso` estão modelados e
**ninguém os executa**. `entrada.ts` não menciona fluxo.

- roda no **worker**, não no webhook — o webhook responde 200 rápido e enfileira
- **idempotente**, pelo mesmo motivo que `entrada.ts` é: a Meta reenvia
- precisa nascer sabendo que pode ser **interrompido**: fluxo e atendente humano
  competem pela mesma conversa

### 3. Catálogo de blocos

Está especificado em `catalogo-gatilhos-acoes.md`: 53 peças, vocabulário decidido
(`conversa` e não "ticket", `fila`, condição com a forma do Twenty e nome em português).

Onde a ação toca CRM, os parâmetros saem do **dicionário**, nunca de campo escrito no
código — cada cliente tem objetos próprios.

### 4. Builder visual, em `apps/gestao`

Sem ele só quem mexe em código configura, e aí não é produto.

### 5. IA: assistente do app

`packages/mcp` tem **3 linhas** — é esqueleto. É o caminho para o assistente ganhar as
ferramentas do Pipe (ler fila, explicar métrica, montar bloco).

O Twenty já faz isso: 22 ferramentas em `workflow-tools/tools/`, e a descrição de
`create_complete_workflow` gasta **metade do texto nos erros comuns**. Copie esse
padrão: toda ferramenta descreve também o erro que a IA comete.

## Duas lacunas de arquitetura — decidir antes de codar

### O motor de automação não ramifica

`acao.ordem` é lista linear e `TIPOS_ACAO` não tem `condicao`, `filtrar` nem
`repetir_para_cada`. Metade das ações de controle de fluxo do catálogo não tem onde
encaixar. **Isso é decisão de arquitetura, não tarefa de implementação.**

### Falta `dicionarioMetrica`

A fundação de métricas do Pipe é melhor que a da Blip e a do Chatwoot: `evento_atendimento`
imutável, `metricaDiaria` com soma e contagem separadas, `dicionarioCampo.agregavel`.

Mas falta a camada do meio: uma tabela de métricas com **fórmula, unidade, dimensões
válidas e sinônimos**. Sem sinônimos, "qual meu TMR" e "quanto demoro pra responder"
são perguntas diferentes para a IA. E métrica que não está escrita, a IA inventa
diferente a cada resposta.

## O que falta validar

Isto é tão importante quanto o que falta construir.

1. **Nada foi verificado contra instância viva da Blip.** Todo o levantamento é leitura
   de código e documentação. Existe uma sonda pronta e somente-leitura em
   `desk-clone/sonda-blip.mjs` (todo comando tem `method: 'get'` fixo, chaves nunca
   impressas, saída descreve a forma do objeto e não o conteúdo). Ela precisa das
   credenciais do blip-dash — o classificador de segurança bloqueou o acesso na sessão
   anterior. **Peça permissão explícita ao usuário antes de tentar.**
2. **Duas divergências abertas** entre a doc oficial e o código do Desk: a doc tem
   `Assigned` e não tem `ClosedClientInactivity`; o bundle mostra o contrário.
3. **A ordem de avaliação das regras de fila** não está documentada em lugar nenhum.
   Sem ela não dá para reproduzir o roteamento da Blip.
4. **`Ticket.priority` 0..7** — a interface só expõe 4 níveis e ninguém sabe de onde
   vêm os outros valores.
5. **Deslocamento de parâmetro com mídia no cabeçalho do template** — a armadilha mais
   cara e a única ainda sem fonte oficial. `/message-templates-enriched` resolveria.
6. **O JSON do fluxo** está apoiado no parser oficial da Take, não num export real.
7. **As telas da Gestão local** — verifiquei SLA funcionando; Monitoramento, Filas,
   Atendentes, Regras, Horários e Pausas ainda não foram conferidas.

## Tarefa pequena e concreta pendente

Na Gestão local (`desk-clone/gestao-local/`):
- a **logo do Pipe está deformada** em alguns pontos — o `pipe/marca.css` esconde o
  `<bds-illustration>` e põe o símbolo como fundo; onde a proporção do espaço original
  não bate, distorce. Ajustar caso a caso.
- **"Blip" ainda aparece** em alguns lugares. A maioria das ocorrências no bundle é
  código interno (`blipChat`, `BlipService`), mas há texto de interface. Procure nos
  arquivos de i18n e nos `<title>`, não no JavaScript.

## Como trabalhar

- **Português** em código, comentário, commit e conversa. O projeto inteiro é assim.
- **Não invente pesquisa**: se um documento em `referencias-blip/pesquisa/` responde, use.
- **Marque procedência**: ao afirmar algo sobre a Blip, diga se veio de código, da doc
  ou de dedução. O padrão já está em uso nos documentos.
- **Não force feature flag para `true` em massa.** No Desk isso ligou telas sem mock e
  gerou uma cascata de erros; na Gestão foi usada a captura real das 742 flags.
- **Verifique renderizado, não status HTTP.** O padrão que funciona: a página reporta
  o próprio DOM para o servidor (`POST /log`) e você lê o arquivo. Foi assim que se
  descobriu que a lista do Desk já funcionava e o que faltava era a navbar.
- **Regra visual, que não muda:** só logo e cor Moss `#4A5D23`. Tipografia, ícones,
  espaçamento, densidade e geometria continuam os da Blip. Moss não vira cor de alerta.

## Por onde eu começaria

O dicionário de metadados (item 1). É pequeno, destrava os itens 2 a 5, e dá para
verificar de verdade: ao terminar, `dicionarioCampo` tem os campos reais do workspace
Twenty do tenant, incluindo os que o cliente criou ontem.
