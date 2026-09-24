# PROJECT-HANDOFF.md

Estado do projeto Pipe, para uma sessão nova começar sem reler o histórico de
conversas. Isto é ESTADO, não diário — não registre aqui o que aconteceu numa
sessão, só o que ainda vale.

Escrito em 24/09/2026, no ramo `limpeza` (commit `a6f2742`), cruzando o código
atual, o `git log`, as specs, os documentos de handoff antigos que existiam em
`docs/` e a mineração de ~200 sessões de agente (esta conta, a conta 2 do
Claude — 29 sessões + 9 subagentes —, e os dois Codex). Onde uma conversa
antiga contradiz o código, o código venceu. **Aviso de confiabilidade**: pelo
menos 11 sessões da conta 2 foram cortadas por limite de sessão NO MEIO do
trabalho, sem aviso — o texto de "concluído" de um agente, sozinho, não é
prova; por isso este documento prioriza o que está no `git log` e passou em
teste, não o que uma sessão disse ter feito.

# Projeto

Pipe é uma plataforma de atendimento no WhatsApp (API oficial da Meta) com CRM
alimentado pelas conversas e monitoria por IA, para vender a empresas.

A relação com a Blip: **a Blip é régua de medida, não base de código.** A forma
das telas (disposição, textos, estados, navegação) é copiada da Blip quando ela
mostra a regra; a tinta (cor, ícone, marca) é sempre da Pipe. Nenhum código,
CSS, classe ou ícone da Blip entra no repositório — só a marcação e o CSS
capturados ficam como referência de medida, fora do git. Isso vale desde
12/09/2026 (decisão revertendo uma tentativa da manhã do mesmo dia de rodar a
cópia compilada da Blip como produto).

# Estado atual

Monorepo pnpm + turbo, todo em português (tabela, coluna, função, variável,
comentário). `apps/api` (NestJS) é a ÚNICA porta para o Postgres; os fronts só
falam com ela por HTTP; `apps/workers` é a exceção (fila e agregação).

Front reescrito de Next.js para Vite (decisão de 07/09/2026): hoje só existem
`apps/gestao-vite` e `apps/desk-vite` — não há mais `apps/gestao` nem
`apps/desk` no código (o `README.md` da raiz ainda cita os nomes antigos,
desatualizado). `apps/crm` é Next.js próprio, na porta 3300, com rotas
próprias (leads, oportunidades, contas). **Isso convive com uma integração
real com o Twenty** — ver Arquitetura e a seção "PRECISA VALIDAR" em Áreas
parcialmente prontas: o que acontece com `apps/crm` diante dessa integração
nunca foi decidido, nem em 07/09 nem depois.

Testado e commitado no ramo `limpeza` (ainda não mesclado em `master`):
canais (WhatsApp/Instagram/Messenger), monitoramento, equipe/permissões,
encerramento de ticket, Builder (parcial), e uma limpeza grande do
repositório. Local funciona; a VPS de demonstração está publicada mas com uma
pendência de configuração do dono (Google OAuth).

# Arquitetura

- **Isolamento entre clientes:** um banco, `tenant_id` em toda tabela, RLS
  ligada. Toda consulta passa por `comTenant(db, tenantId, tx => …)`. Nunca
  `Promise.all` dentro dessa transação — derruba o `set_config` do tenant e a
  consulta roda sem isolamento, silenciosamente.
- **Regra de negócio pura** vive em `packages/core` (métrica, esforço, score,
  SLA, distribuição, janela de 24h) — funções sem banco e sem HTTP, com tabela
  de casos.
- **Contratos** entre front e API em `packages/contracts`.
- **CRM em espelho — CORREÇÃO (a versão anterior deste documento estava
  errada):** não é sincronização dentro do próprio banco. É um espelho de
  verdade para uma instância EXTERNA do Twenty, via GraphQL/`/metadata`,
  implementado em `apps/api/src/dominio/twenty.ts` (644 linhas) e
  `dominio/espelho-crm.ts`, testado em `apps/api/tests/twenty.test.ts`.
  `contato`/`conta` → `person`/`company`; campos `tenant.twenty_url`,
  `tenant.twenty_chave` (cifrada), `contato.twenty_pessoa_id`,
  `conta.twenty_empresa_id` já existem no schema. Fila `apps/workers` +
  varredura de segurança a cada 5 min, mesmo padrão da entrega de mensagem.
  Pipe é a fonte da verdade; o Twenty só exibe (escrita é só de ida). Spec
  completa: `docs/specs/2026-09-07-integracao-twenty.md` (não superada — o
  código bate com ela). **PRECISA VALIDAR**: se o repositório do fork
  (`../pipe-crm-fork` na spec) ainda existe — não está presente nesta
  máquina —, e qual o papel de `apps/crm` diante disso (nunca decidido, nem
  na spec original).
- **Canais Meta:** conexão manual (WABA ID, Phone Number ID, token, App
  Secret) por enquanto — o cadastro embutido da Meta (Embedded Signup) exige
  app aprovado, e isso exige CNPJ, que ainda não foi resolvido. Webhook por
  canal, assinado (`X-Hub-Signature-256`), verificado em tempo constante.
- **Filas:** BullMQ; a entrega da resposta do bot só acontece no `apps/workers`
  — sem ele de pé, a Pipe recebe mensagem e nunca responde.
- **Migrations:** manuais em `packages/db/drizzle`, geradas pelo drizzle-kit
  mas revisadas à mão (há FKs que um `generate` novo tentaria remover por não
  entender o ciclo de import entre módulos — não aceitar).
- **Fluxo/roteador nunca é apagado de verdade** — "excluir" arquiva
  (`estado='arquivado'`), porque `execucao_fluxo.fluxo_versao_id` é
  `ON DELETE RESTRICT` e history não pode ficar órfão. Diferente da Blip e do
  Chatwoot, que apagam de fato — decisão Pipe.

# Fontes de verdade

- **Referência da Blip** (medidas, textos, DOM, CSS/JS extraído, capturas): `referencias-blip/`
  (fora do git, ~3,1 GB, organizada por área — `referencias-blip/README.md` explica cada pasta).
- **Design system / UI**: `packages/ui` (`@pipe/ui`); regra em
  `docs/specs/2026-09-05-design-system.md`; identidade em `docs/marca/MARCA.md`.
- **Specs de produto** (vinculantes onde dizem "vinculante"): `docs/specs/*.md`
  — desenho do produto, modelo de dados, métricas, requisitos do Desk,
  arquitetura de front, fork/integração do Twenty, preço, implantação. Ler o
  `README.md` da raiz, seção "Documentação", para o índice comentado.
- **Banco:** `packages/db/src/schema/*.ts` (schema) e `packages/db/drizzle/*.sql`
  (migrations, hoje até `0046`).
- **APIs:** controladores em `apps/api/src/controladores/*.ts`; contratos em
  `packages/contracts/src`.
- **Variáveis de ambiente:** `.env.example` na raiz (67 variáveis).
- **Testes:** `apps/api/tests`, `apps/gestao-vite/tests`, `apps/desk-vite/tests`
  (padrão node --test + tsx no front, vitest na API).
- **Pendências do Builder, levantadas ontem (23/09) pelo próprio dono**:
  `docs/builder-cards-pendencias.md` — a lista mais atual e precisa do que
  falta ali.

# Regras permanentes

- **A forma segue a Blip; a tinta é da Pipe.** Nunca "aproximado": medir no
  original (`getBoundingClientRect`/`getComputedStyle`), não só ler o CSS.
- **Tudo é copiado de algo — Blip ou open source —, nunca desenhado do zero**
  (palavra do dono, 11/09: "eu não quero nada criado, eu quero tudo copiado").
  O que cada licença permite copiar está no `README.md`, seção "Regra de
  licença": Chatwoot MIT fora de `enterprise/`, Take.Blip.Builder Apache-2.0
  (com atribuição), Twenty AGPL só como padrão/formato — nunca o código dentro
  de `apps/*` ou `packages/*` (contaminaria a licença do produto inteiro).
- **Nenhum código, CSS, classe, ícone, som ou imagem da Blip entra no
  repositório.** Só o comportamento e o texto. Ícone vem de conjunto livre
  (Lucide/Phosphor/Tabler) ou nosso.
- **`apps/api` é o único que fala com o Postgres.** Front nunca abre conexão.
- **Nunca `Promise.all` dentro de `comTenant`.**
- **Nunca invente comportamento que a Blip não mostra** — se a fonte não prova,
  a tela/rota diz isso no código/resumo em vez de fingir paridade.
- **Sem `window.confirm`/`alert`** nas telas — usar os modais próprios
  (`_modal.tsx` na Gestão).
- **Conta `@auvp` da Blip (referência) é só leitura** — nunca clicar em
  salvar/conectar por lá; extrair só lendo. Não é a conta usada para testar o
  Pipe.
- **Nunca conectar ao Pipe o número de WhatsApp que o Chatwoot do Barboo usa.**
- Ao delegar tela a um agente (Codex, conta 2): o pedido precisa citar as
  fontes exatas, medidas em px de origem × nossa, e exigir foto comparando —
  "aproximado" já foi reprovado uma vez.

# Áreas prontas

Confirmado por teste local e/ou verificação de agente, nesta sessão ou na
imediatamente anterior:

- **Canais WhatsApp, Instagram e Messenger** — conexão manual, webhook por
  canal, preferências, modelos de mensagem direto na Meta.
- **Reconexão de canal** quando o token do cliente vence — troca a credencial
  do mesmo canal em vez de exigir apagar e recriar (a Blip não tem botão de
  desconectar; a saída de lá também é reconectar por cima).
- **Canal dentro do bot** — conectar/reconectar acontece na página do canal
  DENTRO do roteador/fluxo, como na Blip; um número por bot, com a frase de
  recusa da Blip quando já está em uso.
- **Monitoramento** — cartões em tempo real, filtros rápidos e painel de
  filtros no formato da Blip (seletor próprio, sem `<select>` nativo), prévia
  da conversa dentro da própria Gestão (histórico + falar com o atendente),
  ações por ticket (transferir, mensagem, mais opções). Levou várias rodadas
  reprovadas (o dono rejeitou a 1ª entrega inteira em 22/09) até o commit
  `3343530`/`8f47a5f`; se algo aqui parecer errado, desconfie de uma tentativa
  intermediária, não do resultado final.
- **Encerramento de ticket** — um cartão só, usado no Desk e no Monitoramento,
  com seleção de tags e a regra "só exige tag quando existe tag marcada como
  obrigatória".
- **Equipe/permissões** — adicionar pessoa pede só o papel (a "barra de
  permissão"); os acessos detalhados ficam na edição, em página própria (não
  modal), como na Blip. Contrato tem papéis globais (Visualizar/Editar/Admin),
  diferentes dos de fluxo/roteador. Permissão POR ATENDENTE existe como exceção
  sobre o papel (migração 0046), e é restrita às capacidades de conversa e
  contato — não pode conceder poder de administrador por essa tela.
- **Filas, atendentes, pausas** — telas na forma da Blip (fila e permissões em
  página própria; nova fila/pausa em modal com texto literal).
- **mTLS** — a Pipe apresenta certificado do cliente ao chamar os hosts dele.
- **Chamada externa (ProcessHttp)** — roda por cursor e fila própria, fora da
  transação do fluxo.
- **Builder** — editor funcional (criar, mover, ligar, editar bloco), rascunho
  e publicação com histórico; seletor e ícones no formato da Blip; painéis de
  Biblioteca de variáveis e de Configuração (Ações Globais, Versões com
  importar/exportar). Ver "Áreas parcialmente prontas" para o que falta nele —
  é bastante. **Ressalva de confiança**: duas tentativas (23/09) de fotografar
  o Builder REAL da Blip para comparar pixel a pixel falharam (uma gerou
  captura parcial rejeitada pelo dono, a outra a ferramenta de navegador não
  gravava PNG de verdade). O que existe hoje foi medido pelo CSS/DOM extraído
  dos bundles, não por foto lado a lado do Builder renderizado — a paridade
  visual do Builder é mais fraca do que a das outras telas, que têm foto real.

# Áreas parcialmente prontas

**Builder** — a lista mais precisa é `docs/builder-cards-pendencias.md`
(23/09). Falta: catálogo completo de conteúdos e ações (só texto/menu/quick
reply e ProcessHttp têm editor); biblioteca de funções do contrato; seletor de
destino com pesquisa; pesquisa de satisfação nas saídas de atendimento humano;
paleta de tags igual à origem; comparação visual completa de todos os estados.
Painéis de **Gerenciamento de Filas** (ligado à página de filas que já existe)
e de **Teste** (a Blip usa um widget de chat de verdade — SDK do BlipChat —
ligado ao bot publicado, não uma simulação local; o Pipe não tem canal de
teste no motor) ainda sem paridade real. Copiar/colar bloco, ícone
`user-engaged` do nó de atendimento, e exportar versão antiga também faltam.

**Possível bug não confirmado no Builder**: `arestasDe()`
(`apps/gestao-vite/src/paginas/builder/modelo.ts:421`) só lê
`bloco.$conditionOutputs` para desenhar as setas do canvas — se uma ligação
real do fluxo estiver guardada em outro campo (ação de redirecionamento, saída
padrão), a seta pode não aparecer sem que os dados estejam errados. Achado por
mineração de sessão (23/09), diagnosticado mas não corrigido, sem teste que
cubra a função. Verificar antes de confiar no canvas visualmente.

**Encerramento de ticket** — funcional e testado, mas a comparação visual com
a Blip foi feita pelo CSS/marcação capturados, não por uma foto do modal
aberto — não há captura local dele (procurada em 22 zips, na pasta
`desk-clone` inteira incl. `sessao.har`, e em `blip-portal-uniao`; não
encontrada). O dono mencionou (24/09) ter uma guardada em algum zip; se for
encontrada, o card deve ser conferido de novo contra ela. **Cuidado com a
medida 656×432px que uma sessão anterior deu para o modal**: era do modal
LEGADO do portal, não do Desk — o modal real do Desk (`close-ticket-modal`,
achado no bundle compilado) tem ~600px de largura de container; usar essa
segunda medida. O aviso de sucesso da Blip ("Ticket #{0} finalizado com
sucesso!") foi reproduzido.

**CRM/Twenty — DECISÃO DE PRODUTO CONFIRMADA HOJE (24/09) pelo dono: "Pipe
será integrado ao Twenty como CRM."** O QUE JÁ ESTÁ IMPLEMENTADO (verificado
no código, não presumido): o mecanismo de espelho Pipe→Twenty descrito acima
(`dominio/twenty.ts`, `espelho-crm.ts`, schema, `tests/twenty.test.ts`) — não
é plano, é código que existe hoje. ARQUITETURA JÁ DECIDIDA, por
`docs/specs/2026-09-07-integracao-twenty.md` (não superada): uma instância do
Twenty por cliente (isolamento físico, não multi-workspace); login pelo
mesmo Google dos dois lados, sem senha-sombra guardada pelo Pipe; o Pipe é
dono do dado, o Twenty é espelho de exibição; fila com varredura de
segurança, igual à entrega de mensagem; chave de API por tenant, cifrada.
**PRECISA VALIDAR** (não inventar resposta): (1) se existe hoje uma instância
Twenty/fork rodando em algum lugar — o diretório do fork não está nesta
máquina; (2) o papel de `apps/crm` — descontinuar, virar customização dentro
do fork, ou os dois convivem com funções diferentes — pergunta em aberto
desde a spec original (§4) e nunca respondida; (3) por que
`apps/api/tests/prova-e2e-twenty.ts` (a prova de ponta a ponta de 07/09) não
está mais no repositório — se foi limpeza de scratch ou se a integração foi
pausada; (4) status de `apps/site`, que é assunto à parte, sem relação com
Twenty.

**`packages/mcp`, `packages/tempo-real`, `packages/ai`** — CORREÇÃO: em uma
resposta anterior desta mesma sessão eu disse que `mcp` era "casca vazia" e
sugeri apagar. Isso estava errado. Os três são fases planejadas na spec
vinculante `docs/specs/2026-09-05-pipe-design.md` (servidor MCP, "vem depois,
barato assim que a API existir") e `docs/specs/2026-09-07-arquitetura-de-front.md`
(tempo real por WebSocket) — não são código órfão, são fases 5/6 do roadmap
ainda não iniciadas. `packages/ai` já tem implementação real (resumo,
classificação, avaliação, bancada de prompt) para a fase de monitoria com IA,
que entra em "Análise" — ainda não construída. Não apagar sem reabrir a
decisão com o dono.

# Áreas ainda não implementadas

- **Servidor MCP** (fase 5/6 da spec de produto) — só o esqueleto do pacote.
- **Tempo real por WebSocket** — cliente escrito (`packages/tempo-real`), sem
  nenhum front consumindo; hoje as telas atualizam por consulta periódica.
- **Monitoria por IA / módulo de Análise** — decidido que entra depois; base
  em `packages/ai` já existe.
- **Base de conhecimento com citação, SSO em três degraus** — citados em
  `docs/specs/2026-09-05-o-que-falta.md` como não planejados ainda.
- **Cadastro embutido (Embedded Signup) da Meta** — bloqueado por falta de
  CNPJ/app aprovado; caminho atual é só conexão manual.
- **Canal de teste do Builder** ligado ao motor (a Blip usa um bot de
  verdade).

# Trabalho recente

Sequência dos últimos commits no ramo `limpeza` (mais novo primeiro):
limpeza do repositório e organização das referências da Blip fora do git;
ajustes visuais do dono no Builder/Monitoramento/Configurações; alinhamento de
monitoramento e histórico com a Blip; Builder + equipe + encerramento de
ticket + portal + serviços; reconexão de canal; monitoramento/filas/atendentes
/pausas na forma da Blip; canal conectado dentro do bot; chamada externa fora
da transação; certificado mTLS; canal Messenger.

A limpeza (24/09) apagou ~120 arquivos de código morto e scripts avulsos de
CLI, e moveu ~3,1 GB de material da Blip para `referencias-blip/` (fora do
git). Ainda NÃO foi mesclada em `master` (só existe no ramo `limpeza`).

# Problemas conhecidos

- **Ambiente local é frágil**: um processo de API/Vite deixado em segundo
  plano é encerrado sozinho pelo Claude Code quando o PC fica com pouca
  memória, e a API sobe de novo sem o `.env` da raiz (login com Google quebra
  com `falha_no_provedor`). Solução estável: subir a API numa janela própria
  do PowerShell carregando o `.env` manualmente, não em processo de fundo de
  um agente.
- **Docker Desktop** precisa ser iniciado manualmente depois de reiniciar o
  PC; sem ele, `pnpm -F @pipe/api test` falha por falta de Postgres/Redis.
- **Vite nesta máquina escuta em `[::1]`, não em `127.0.0.1`** — `curl`/testes
  automatizados que usam `127.0.0.1:PORTA` podem dar "connection refused" com
  o processo rodando; usar `http://[::1]:PORTA/`.
- **Build do Desk no Git Bash**: `MSYS_NO_PATHCONV=1` é obrigatório no
  `docker build`, senão o Git Bash reescreve `/desk/` como caminho do Windows
  e a imagem sobe com os `<script src>` apontando para um caminho que não
  existe (tela em branco). Já aconteceu uma vez em produção.
- **`tests/instagram.test.ts`, `tests/fluxo.test.ts` e `tests/messenger.test.ts`**
  oscilam quando rodam junto com a bateria inteira da API sob carga (falham em
  conjunto, passam isolados, verificado 24/09) — não é regressão de código, é
  timing/concorrência de banco entre arquivos de teste.
- **`pnpm typecheck` na raiz (turbo, todos os pacotes) está QUEBRADO** por
  `packages/core/src/fluxo/gerenciador.teste.ts:140` —
  `variaveis.status` não existe no tipo inferido. Os typechecks por app
  (`pnpm -F @pipe/api typecheck`, `@pipe/gestao-vite`, `@pipe/desk-vite`) NÃO
  cobrem `packages/core` isoladamente e por isso vinham passando "verdes" sem
  pegar isto — rodar `pnpm -F @pipe/core typecheck` para confirmar. Não
  corrigido nesta sessão (fora do escopo do handoff, que é só leitura).
- **VPS de demonstração** (`144.217.164.204`,
  `https://pipe.144-217-164-204.sslip.io`) está publicada, mas o login Google
  por lá depende do dono cadastrar
  `https://pipe.144-217-164-204.sslip.io/v1/auth/google/retorno` no Google
  Cloud Console (e estar na lista de usuários de teste, se o app estiver em
  modo Teste).
- **Número de teste da Meta** tem token que expira em 24h e não gera versão
  permanente — reconectar é rotina diária enquanto não houver número próprio
  com usuário de sistema.
- **`master` está 2 commits atrás de `limpeza`** — decidir quando mesclar.
- Branches soltas sem uso recente: `codex/atendimento-blip`,
  `desk-visual-pipe` (último commit 10/09), `integracao`, e vários
  `worktree-agent-*` — candidatas a apagar, sem urgência.

# Decisões importantes recuperadas das conversas

- **12/09/2026, fim do dia**: o produto é o aplicativo próprio
  (`apps/gestao-vite` e irmãos), não a cópia compilada da Blip — reverteu a
  tentativa da manhã do mesmo dia de rodar a cópia com uma ponte (`apps/ponte`,
  LIME) por trás. A ponte continua existindo, mas não é mais o caminho do
  produto.
- **07/09/2026**: front migra de Next.js (App Router) para Vite, copiando o
  padrão do Twenty/Chatwoot (front estático, API separada). Isso supersede
  partes do `README.md` da raiz que ainda descrevem as telas como Next.js.
- **07/09/2026**: decisão do dono de fazer o CRM como fork AGPL do Twenty,
  em repositório próprio (`docs/specs/2026-09-07-fork-do-twenty.md`), com a
  integração de espelho desenhada e testada e2e no mesmo dia
  (`integracao-twenty.md`). CORREÇÃO (24/09): uma versão anterior deste
  documento afirmava que essa estratégia foi "superada" por `apps/crm` — não
  há evidência disso. O dono confirmou hoje (24/09) que **o Twenty segue
  sendo a decisão de CRM**. `apps/crm` existe em paralelo, mas seu papel
  final é PRECISA VALIDAR (ver Áreas parcialmente prontas), não decisão
  tomada.
- **11/09/2026**: "tudo copiado, nada inventado" — ver Regras permanentes.
- **Preço:** por atendente, IA (assistente + monitoria) como itens à parte.
  Entrada do cliente: venda assistida por enquanto (self-service existe no
  código, desligado).

# O que NÃO fazer

- Não construir tela nova sem antes achar a fonte exata a copiar (Blip ou open
  source) e medir contra ela.
- Não copiar código/CSS/ícone da Blip para dentro do repositório.
- Não trazer código do fork do Twenty (nem de `chatwoot/enterprise/`) para
  dentro de `apps/*` ou `packages/*` — quebra a fronteira de licença.
- Não usar `Promise.all` dentro de uma transação `comTenant`.
- Não aceitar um `drizzle-kit generate` que proponha apagar as FKs de
  `0003_chaves_cruzadas` — elas nascem em migration própria de propósito.
- Não deixar a API/Vite subir em processo de fundo desacompanhado nesta
  máquina — memória baixa mata o processo e ele volta sem `.env`.
- Não apagar `packages/mcp`/`tempo-real`/`ai` achando que são código morto —
  são fases planejadas (ver Áreas parcialmente prontas).
- Não fazer login de teste "atalho" na Pipe — o dono já rejeitou explicitamente
  esse caminho, quer testar desde o login real do Google.
- Não clicar em salvar/conectar na conta `@auvp` da Blip (é só leitura).
- Não colar/reusar captura de DOM da Blip sem checar se não veio com dado
  sensível embutido (aconteceu: token de sessão real, telefone e flags da
  conta dentro de `blip-footer-with-blip-status-mfe`, 13/09) — é por isso que
  o material de captura fica fora do git, em `referencias-blip/`.

# Próximas frentes

Sem ordem de prioridade fixa — decisão do dono:

1. **Fechar o Builder** — o item com mais lacuna conhecida (ver
   `docs/builder-cards-pendencias.md`); depende de decidir o que entra no
   motor (`packages/core`) antes de desenhar mais tela.
2. **Mesclar `limpeza` em `master`** e decidir o destino de `apps/crm` diante
   da integração com o Twenty (PRECISA VALIDAR — ver Áreas parcialmente
   prontas), o de `apps/site` e das branches soltas.
3. **Testar de ponta a ponta na VPS** com número de WhatsApp real — depende do
   dono cadastrar o redirect do Google lá.
4. **Decidir a publicação no GitHub** (histórico novo ou reescrito, público ou
   privado) — pendência antiga, ainda em aberto; hoje não há `git remote`
   configurado.
5. **Migrar para o fluxo GSD**, que é o motivo deste documento existir.
6. **Decisão de produto nunca fechada**: a Blip tem dois modelos de pesquisa de
   satisfação (nativo do Portal, 1-5, só PT-BR, retenção de 3 meses; e um
   modelo alternativo) — falta decidir se o Pipe replica um, o outro, ou
   unifica os dois. Levantado em pesquisa de 15/09, sem decisão até hoje.

# Critério para atualizar este documento

Atualizar só quando: uma decisão permanente nova for tomada; uma fase/área
mudar de "parcial" para "pronta" (ou vice-versa); ou um problema conhecido for
resolvido. Não registrar aqui o resumo de cada sessão — isso é o histórico de
conversa, que este documento existe para não precisar reler.
