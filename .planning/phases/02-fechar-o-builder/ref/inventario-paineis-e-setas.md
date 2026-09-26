# Inventário — Painéis, copiar/colar, seletor de destino e setas

**Data da investigação:** 2026-09-26

Fontes cruzadas nesta investigação: `referencias-blip/builder/builder/PAINEIS.md`, `PAINEL-TestePublicar.md`, `PAINEL-Configuracoes.md`, `PAINEL-Historico.md`, `PAINEL-ImportExport.md`, `PAINEL-Saidas.md`, `PAINEL-Builder.md`, `PAINEL-Variaveis.md`, `referencias-blip/builder/builder-fluxo__pagina.html`, `referencias-blip/builder/builder/zip19/supernova.blip.ai/portal.css` e `portal.js` (bundle geral do Portal Blip — o Builder em si não tem um bundle próprio nesta captura, ver nota de escopo abaixo), e o código atual do Pipe (`apps/gestao-vite/src/paginas/builder/*`, `apps/api/src/controladores/gestao-builder.ts`, `packages/contracts/src/gestao-fluxo.ts`).

**Nota de escopo da captura.** `PAINEIS.md` (índice da captura zip19) documenta explicitamente que o DOM capturado (`builder-fluxo__pagina.html`) só contém o DOM *visível* — painéis abertos por clique/modal (Teste, Filas, versões antigas) não aparecem nele — e que nenhum bundle JS dedicado ao Builder (canvas, editor de bloco) foi encontrado separado do bundle geral `portal.js`/`portal.css` do Portal Blip nesta captura. Onde a nota abaixo diz "não encontrado nos bundles", é sobre essa mesma limitação, já registrada pelo próprio índice da captura (`PAINEIS.md`, seção "Painéis Procurados Não Encontrados nos Bundles").

---

## Painel de Teste (D-14)

**Como abre / layout:** `PAINEL-TestePublicar.md` confirma o título da tela — "Ambiente de testes" / "Test environment" — e um texto de cota: "Contatos no teste" / "Contacts in test", "Teste grátis" / "Free test", "Período válido por 30 dias ou até o consumo total do pacote, o que ocorrer primeiro. Recomendamos que os testes sejam realizados apenas em fluxos em construção, e não em ambientes de produção." Isso descreve uma **cota de contatos de teste** vinculada ao bot/aplicação (não necessariamente ao fluxo aberto no Builder).

**Evidência complementar de CSS (zip19/portal.css):** as classes `.test-env__rule-icon--info`/`--danger` e `.test-env__rule-title--info` (cor `#0096fa`, azul) / `--danger` (cor `#e60f0f`, vermelho) descrevem uma lista de "regras do ambiente de teste" com item informativo (ícone com fundo `#eff8ff`) e item de alerta (ícone com fundo `#fee2e2`) — compatível com o texto "Atente-se às regras de simulações" de `PAINEL-Configuracoes.md`. Não há, nesta captura, o marcador de conteúdo (HTML) desses itens — só a folha de estilo.

**Usuário "Tester":** não confirmado como conceito do Builder. Encontrado em outro ponto do bundle geral (`portal.js`, tela de detalhe de usuários da aplicação, classe `lt`/`dt`) um grupo de contato chamado `"Testers"` numa listagem com colunas nome/canal/última interação e um rótulo `testUsersLabel` — plausivelmente a mesma cota de "Contatos no teste" citada acima, mas é uma tela de gestão de usuários da aplicação, não o painel de Teste do Builder em si.

**Mecanismo real de teste do Portal (achado em outra tela, não o Builder):** em `portal.js` (fluxo de criação de aplicação, `auth.application.create.test`), a Blip usa o SDK `BlipChat` real (`new m.BlipChat().withAppKey(...).withAuth({authType: m.BlipChat.DEV_AUTH, ...})`) embutido num `<iframe>`/container, conectando a um bot de fato para pré-visualizar um template. Isso confirma que, **em pelo menos uma tela adjacente**, o padrão da Blip é testar contra um canal/bot real via BlipChat SDK, não uma simulação local — mas essa tela é de pré-visualização de template no onboarding, não o painel de Teste do editor de fluxo (Builder) propriamente dito.

**O que NÃO foi encontrado nos bundles (confirmado por `PAINEIS.md`):** "Chat de Teste — Interface de simulação e teste em tempo real" está explicitamente listado como painel procurado e não encontrado. Não há evidência de: variáveis de teste dentro do Builder, botão de reset de contato, layout do Debug (bloco atual, variáveis, ações executadas, erros).

Recomendação: **BLOQUEADO — captura pendente (D-03).** A evidência encontrada (cota de contatos de teste, regras de simulação, e o padrão geral de canal real via BlipChat SDK usado noutra tela) é insuficiente para decidir com segurança entre simulação local e canal de teste real ligado ao motor — decidir agora seria arbitrar sem ver o mecanismo real do Debug. Pendente: captura do painel de Teste do Builder ao vivo (dono), incluindo abrir o Debug após enviar uma mensagem de teste.

---

## Painel de Filas (D-15)

`PAINEIS.md` lista "Skills e filas — Gerenciamento de fila de atendimento" na seção "Painéis Procurados Não Encontrados nos Bundles" — ou seja, mesmo do lado da referência, não há evidência de bundle/tradução para um painel de Filas embutido no Builder. Nenhuma outra fonte desta investigação (`PAINEL-Builder.md`, `PAINEL-Atendimento.md`, `portal.js`) contém referência a um CRUD de filas dentro do fluxo de edição de fluxo.

**Estado atual do Pipe:** `painel-filas.tsx` é um atalho — cartão com texto fixo e um botão "Abrir gerenciamento de filas" que navega para `${baseDoAtendimento(...)}/atendentes/filas` (fora do Builder). O comentário do próprio arquivo (linhas 6-9) já registra o motivo: "A listagem, criação, edição, ativação e exclusão já existem em `PaginaFilas` e nas rotas de gestão; manter o formulário aqui duplicaria regras de cadastro e validação."

Recomendação: **atalho (manter, evoluir a UX se necessário).** Sem evidência de que a referência tenha um CRUD embutido diferente do que o Pipe já resolveu em `PaginaFilas`, criar um formulário duplicado dentro do Builder duplicaria validação sem ganho de paridade comprovado (mesmo princípio do "Don't Hand-Roll" do `02-RESEARCH.md`). Paridade visual exata da tela de filas do Builder da Blip (se ela de fato existir, fora dos bundles capturados) fica `PENDENTE-CAPTURA` — ver seção de capturas pendentes.

---

## Versões (D-16)

`PAINEL-Historico.md` confirma o título ("Histórico"/"History") e a descrição funcional ("Histórico de versões publicadas de tu flujo" / "History of published versions of your flow"), mas a seção "Notas" do próprio documento diz explicitamente: "Não encontrado nos bundles: lista de versões, datas, autores, botão de restaurar versão, diferenças entre versões." Ou seja, o layout exato da lista (colunas, ordenação, ações por linha) não está confirmado na referência.

`PAINEL-ImportExport.md` confirma o mecanismo de exportação do fluxo atual: botão "Descargar flujo" / "Export flow", descrição "Descarga flujo y configuraciones de acciones globales" — que corresponde exatamente ao par `{flow, globalActions}` já usado pelo Pipe.

**Estado atual do Pipe:**
- `GET :id/builder/versoes` (`apps/api/src/controladores/gestao-builder.ts:79-90`) já existe e devolve `VersaoDoFluxo[]` com as colunas `id`, `versao` (número), `estado`, `blocos` (contagem), `publicadaEm`, `publicadaPor`, `criadoEm`, `atualizadoEm` (`packages/contracts/src/gestao-fluxo.ts:338-348`) — suficiente para montar uma tabela sem inventar coluna nova.
- Nenhum código de front consome esse endpoint (`listarVersoes` não existe em `builder-gravar.ts`; confirmado por busca em `apps/gestao-vite/src`).
- A exportação do rascunho atual (`importar-exportar.ts`, `textoDeExportacao`/`validarImportacao`) já serializa `{flow, globalActions}` via `JSON.stringify({ flow, globalActions: globais }, null, 2)` — o mesmo contrato que a Blip usa para "Exportar flujo" (`PAINEL-ImportExport.md`).

**Conclusão para D-16:** o formato de exportação de uma versão antiga é o mesmo `{flow, globalActions}` já usado no rascunho — nunca um segundo formato, confirmando a decisão já travada em `02-CONTEXT.md`. O layout exato da lista (ordem das colunas, ações por linha, texto de cada estado) permanece `PENDENTE-CAPTURA` — o Pipe pode desenhar a tabela a partir das colunas já existentes na API (id/versão/estado/blocos/data de publicação/quem publicou) sem esperar a captura, mas o acabamento visual fino (ex.: onde fica o botão "Exportar versão" por linha) só fecha com a tela real.

---

## Copiar/colar (D-17)

**Referência (Blip):** `PAINEL-Builder.md` confirma o nome da funcionalidade ("Copiar e colar no Builder" / "Builder copy and paste") e a mensagem de erro de colagem inválida: "O conteúdo copiado não é um tarefa válido. Tente de novo." Não há, nos bundles capturados, a enumeração exata dos itens do menu de contexto do bloco nem confirmação de atalho de teclado (Ctrl+C/Ctrl+V) — o índice (`PAINEIS.md`) não lista "menu de contexto do bloco" entre os painéis encontrados nem entre os não encontrados, ou seja, esse detalhe específico não foi varrido nos bundles de tradução (que capturam texto, não estrutura de menu).

Uma referência adjacente e mais detalhada aparece em `PAINEL-Saidas.md`: cada **condição de saída** (não o bloco inteiro) tem seu próprio "Copiar" ("Copy condition") e "Colar" ("Paste condition"), com mensagens de sucesso/erro dedicadas ("Condición de salida copiada con éxito", "Houve um erro ao colar a condição de saída. Tente novamente"). Esse é um mecanismo diferente do copiar/colar de bloco — copiar/colar de uma condição de saída individual — e **não está implementado no Pipe hoje** (nenhuma função equivalente em `condicoes.ts`). Como D-17 já trava o escopo desta fase em confirmar cobertura/paridade do copiar/colar de **bloco** (já implementado), este achado fica registrado aqui como uma lacuna adjacente, não uma tarefa desta fase — se o dono quiser fechá-la, é um item novo, não uma correção de D-17.

**Estado atual do Pipe (copiar/colar de bloco):**
- Núcleo puro em `modelo.ts:342-388`: `copiaDoBloco` (id novo, `[Cópia]` no título, deslocamento, `$id`/`$connId` de saída removidos, `stateId` interno realinhado quando aponta para o próprio bloco copiado), `duplicarBloco` (usa `copiaDoBloco` com deslocamento fixo de 20px), `textoDoBlocoCopiado`/`blocoDoTextoCopiado` (serialização com marcador de área de transferência), `colarBloco` (sempre cria uma cópia nova, nunca sobrescreve o original).
- Menu de contexto em `canvas.tsx` (linhas ~416-441): botão direito no bloco abre **Duplicar → Copiar → Copiar Id → Excluir** (Excluir só aparece quando `podeExcluir` permite); botão direito no fundo do canvas abre **Colar**. O bloco de Início não tem menu (comentário do próprio arquivo, linha 37).
- Tecla `Delete`/`Backspace` remove a seta selecionada ou o bloco selecionado (quando `podeExcluir`) — não há atalho de teclado Ctrl+C/Ctrl+V para copiar/colar bloco hoje; a cópia/colagem depende do clique no menu de contexto.
- Existe também um mecanismo de colagem **de ações** (`colarAcoes`, distinto do de bloco), testado em `builder-painels.test.ts:41-63`: preserva a origem, cria ids únicos por ação e recusa a colagem inteira (atomicamente, sem colar parcial) quando o total ultrapassaria o limite de 15 ações por lista — é essa a colagem com "limite de 15" citada em `docs/builder-cards-pendencias.md`, não um limite de blocos colados de uma vez.

**Conclusão para D-17:** a cobertura funcional (duplicar, copiar, copiar id, colar, excluir) já existe e cobre o que a referência nomeia como "Copiar e colar no Builder". Paridade visual do menu (posição, ícones, ordem exata dos itens) permanece `PENDENTE-CAPTURA` — os bundles não têm o HTML do menu, só o texto de erro genérico.

---

## Seletor de destino (D-23)

**Referência (Blip):** `PAINEL-Saidas.md` confirma o rótulo "Direcionar para bloco" e o texto de exemplo ("Ex.: Dirija el usuario a este bloque, siempre que se mencione el asunto Y."), mas a seção "Notas" do documento diz que a "interface completa de definição de condições (operadores de comparação, valores, tipos de entrada)" não foi encontrada nos bundles — o widget exato do seletor de destino (select simples vs combobox com busca, modal, layout do estado vazio) não está confirmado.

**Estado atual do Pipe:** `painel-saidas.tsx`, função `seletorDeDestino` — um `<Selecao>` (`<select>` nativo estilizado) listando **todos** os blocos do mapa (`Object.values(mapa)`) sem filtro/busca, usado em três pontos do mesmo arquivo: saída normal, saída de disponibilidade (`OutOfAttendanceHour`/`NoAgentAvailable`) e saída padrão. Já trata: opção vazia com o rótulo "Direcionar para bloco" (`ROTULOS_DAS_SAIDAS.direcionar`), destino inexistente (mostra `{valor} (não existe)` como opção extra quando o `stateId` salvo não corresponde a nenhum bloco do mapa atual), e permite laço (o próprio bloco pode ser seu destino, comentário linha 52).

**Decisão já travada (D-23, `02-CONTEXT.md`):** substituir esse `<Selecao>` por um combobox pesquisável reaproveitando o padrão de busca sem acento/caixa já usado em `variaveis.ts`/`painel-variaveis.tsx` (`normalizar`/`filtrarVariaveis`). O placeholder já está fixado no `02-UI-SPEC.md`: "Buscar bloco de destino…" — mesmo padrão de `painel-variaveis.tsx`.

**Pendente:** forma exata do widget na referência (select nativo, combobox customizado, modal), comportamento de busca por título vs id, e o estado ativo/focado — nada disso está nos bundles capturados. O mecanismo de implementação (reaproveitar `filtrarVariaveis`) já está definido e não depende dessa captura para começar; só o acabamento visual fino do widget de busca (se a referência tiver algo diferente de um dropdown simples) fica `PENDENTE-CAPTURA`.

---

## Relações que geram seta (D-29.2)

| Relação | Campo serializado | Gera seta na referência | Fonte |
|---|---|---|---|
| Condição de saída normal | `$conditionOutputs[].stateId` (aponta para um bloco do mapa) | Sim | `modelo.ts:421-434` (`arestasDe`); Blip: `PAINEL-Saidas.md` ("Direcionar para bloco") |
| Saída de atendimento humano (`ClosedAttendant`/`ClosedClient`/`ClosedClientInactivity`) | `$conditionOutputs[].stateId` com `$isDeskOutput: true` | Sim — é um caso de `$conditionOutputs`, sem exclusão especial | `modelo.ts:283-295` (`novoBlocoDeAtendimento`); `painel-saidas.tsx` (`rotuloDaSaidaDeAtendimento`) |
| Saída de disponibilidade (`$isDeskCustomOutput`: `OutOfAttendanceHour`/`NoAgentAvailable`) | `$conditionOutputs[].stateId` com `$isDeskCustomOutput: true` | Sim — também é um caso de `$conditionOutputs`; `arestasDe` não filtra por `$isDeskCustomOutput` | `painel-saidas.tsx:83-153`; `modelo.ts:421-434` |
| Saída de erro de encaminhamento (`$isDeskDefaultOutput`) | `$conditionOutputs[].$isDeskDefaultOutput = true` | **Não** — excluída explicitamente | `modelo.ts:426` (`\|\| saida.$isDeskDefaultOutput`); `modelo.ts:296-300` (`novoBlocoDeAtendimento`, saída de erro) |
| Saída padrão / exceção | `$defaultOutput.stateId` | **Não** — comportamento intencional, mesmo com destino preenchido; `arestasDe` nunca lê `$defaultOutput` | `modelo.ts:421-434` (função não itera `$defaultOutput`); Blip: `PAINEL-Saidas.md:53` ("Observação: a seta que liga os blocos não será exibida") |
| `Redirect` (ação) | `settings.address` (string de nome de serviço/bot externo) | **Não** — aponta para um serviço fora do mapa, nunca para um `stateId` interno | `acoes-do-bloco.ts:58-69` (campo "Serviço", obrigatório); confirmado: nenhum campo `stateId`/destino-de-bloco nesta ação |
| `ProcessHttp` (ação) | `settings.uri`/`responseStatusVariable`/`responseBodyVariable` (sem campo de destino-bloco) | **Não** — a ação não referencia bloco algum, só variáveis de contexto | `acoes-do-bloco.ts:71-89` |
| Ações globais (`$enteringCustomActions`/`$leavingCustomActions`: `SetVariable`, `DeleteVariable`, `TrackEvent`) | sem campo de destino-bloco | **Não** — nenhuma ação global referencia outro estado | `painel-configuracao.tsx` (`AbaDeAcoesGlobais`); `acoes-do-bloco.ts` (nenhum tipo de ação global tem campo `stateId`) |
| Múltiplas saídas apontando para o mesmo destino | duas ou mais `$conditionOutputs[]` com o mesmo `stateId` | Sim, mas sem duplicar a seta (dedupe) | `modelo.ts:427-429` (`Set` de chaves `origem\u0000destino`) |
| Destino inexistente no mapa (`stateId` órfão) | `$conditionOutputs[].stateId` fora do mapa atual | **Não** | `modelo.ts:426` (`\|\| !mapa[saida.stateId]`) |

Nenhum terceiro campo de "ligação real guardada fora de `$conditionOutputs`" foi encontrado nesta investigação além do já mapeado acima — consistente com o achado do `02-RESEARCH.md` (Pitfall 3) de que a suspeita de bug em `arestasDe()` não tinha, até então, um candidato concreto. A validação final com o fluxo real do AUVP Capital (D-29.3) fica registrada como captura pendente abaixo.

---

## Capturas pendentes (D-03)

1. **PENDENTE-CAPTURA #1 — Painel de Teste ao vivo (D-14).** Abrir o painel de Teste do Builder da Blip com um fluxo publicado, enviar ao menos uma mensagem de teste e capturar: layout completo, campo/indicador de usuário "Tester", variáveis de teste disponíveis, botão de reset de contato, e o conteúdo do Debug (bloco atual, variáveis no momento, ações executadas, erros, se houver). Necessário para fechar a recomendação de mecanismo (simulação local vs canal real).
2. **PENDENTE-CAPTURA #2 — Painel de Filas embutido (D-15), se existir.** Confirmar se a Blip realmente tem uma tela de gerenciamento de filas dentro do editor de fluxo (não encontrada nos bundles) ou se, como o Pipe, também depende de navegação externa. Print da tela, se existir, com campos e validações.
3. **PENDENTE-CAPTURA #3 — Histórico de Versões (D-16).** Print da lista de versões publicadas (colunas, ordenação, ação por linha) e do fluxo de exportar/restaurar uma versão antiga específica (não a atual).
4. **PENDENTE-CAPTURA #4 — Menu de contexto do bloco (D-17).** Print do menu de contexto (clique direito num bloco) da referência, para conferir ordem/ícones exatos frente ao Duplicar/Copiar/Copiar Id/Excluir do Pipe.
5. **PENDENTE-CAPTURA #5 — Seletor de destino de ligação (D-23).** Print do campo "Direcionar para bloco" em uso (aberto, buscando, com destino inexistente) para confirmar se já é um combobox pesquisável na referência atual ou um select simples.
6. **PENDENTE-CAPTURA #6 — Export real do fluxo AUVP Capital + print do canvas da referência (D-29.3, plano 02-09).** Pedido ao dono: (a) exportar o fluxo AUVP Capital em produção (formato `{flow, globalActions}`) para validar `arestasDe()` com um caso real e complexo (múltiplas saídas, atendimento humano, `Redirect`, `ProcessHttp`, pesquisa de satisfação); (b) capturar print do mesmo fluxo aberto no canvas da Blip, para comparar quantidade, origem, destino e ausência/presença de setas linha a linha. Este item é bloqueante apenas para o plano 02-09 (validação com fluxos reais), não para o restante desta fase.
