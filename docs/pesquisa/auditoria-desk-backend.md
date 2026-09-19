# Auditoria — Desk (tela do atendente) × backend

Levantamento de toda ação que `apps/desk-vite` oferece ao atendente, cruzada
com `apps/api` (`controladores/desk.ts`, `conversas.ts`, `catalogo.ts`,
`mensagens-ativas.ts`, `anexos.ts` e os domínios por trás deles). Fonte das
regras da origem: `blip-desk-regras-tecnicas.md` e `blip-desk-funcoes.md`.

Feito em 19/09/2026. Método: grep de `onClick`/`api(`/`pedir(`/`executar(` em
`apps/desk-vite/src`, leitura de cada tela, e correspondência com o
controlador/domínio da `api` e os testes em `apps/api/tests`.

## Tabela

| # | Ação | Rota/função | Grava? | Teste? | Regra da origem OK? | Lacuna |
|---|------|-------------|--------|--------|----------------------|--------|
| 1 | Responder com texto livre | `POST /v1/conversas/:id/mensagens` → `enviarMensagem` | Sim (outbox real) | `envio-sessao.test.ts` | Sim — janela de 24h por `avaliarEnvio` (`@pipe/core`), só o dono responde (`exigirAtribuicao`) | Nenhuma |
| 2 | Enviar anexo (imagem/áudio/vídeo/documento) | `POST /v1/anexos` + `POST /v1/conversas/:id/mensagens {anexo_id}` | Sim | `anexos.test.ts` (upload) + `ponta-a-ponta.test.ts` (mensagem com `anexo_id`) | Parcial — ver lacuna | **Grande, só documentada**: o botão diz "máximo de 10 arquivos por envio" (`MAX_ARQUIVOS_POR_MENSAGEM`, devolvido por `/v1/anexos`) mas `Compositor.anexar()` só lê `lista?.[0]` e o `<input>` não tem `multiple` — só 1 arquivo por envio. Corrigir de verdade exigiria decidir se cada anexo extra vira uma mensagem própria (o schema atual só aceita 1 `anexo_id` por mensagem) |
| 3 | Enviar modelo (template) — janela de 24h fechada | `ModalDeModelo.enviar()` → mesma rota, `tipo: 'template'` | Sim | `envio-sessao.test.ts` (rota) — falta um teste específico de `template_id`/`parametros` pela sessão do Desk (existe pela chave, `ponta-a-ponta.test.ts`) | Sim | Pequena: nenhum teste session-cookie cobre o caminho `template_id` isolado (só o de chave). Não corrigido — risco baixo, mesma função de domínio já testada nos dois modos de credencial |
| 4 | Resposta pronta (`#atalho`) | Preenche o campo local; envia por `POST /v1/conversas/:id/mensagens` | Sim | Coberto indiretamente pelo item 1 | Era **não** — a tela nunca mandava `resposta_pronta_id`, e o backend já sabia gravá-lo "no mesmo insert" (`resposta pronta carimbada no mesmo insert`, `envio-sessao.test.ts`) | **Corrigida**: `compositor.tsx` agora guarda o id da resposta escolhida e manda `resposta_pronta_id` no envio; qualquer edição manual do texto depois de escolher a resposta limpa o id (não falseia o relatório de esforço) |
| 5 | Nota interna / "Comentário" do painel do contato | `POST /v1/desk/acoes/salvarNotaInterna` → `dominio/desk/acoes.ts` | Sim | **Não havia nenhum teste do controlador `/v1/desk/*` inteiro** | Sem regra de origem correspondente (é feature própria do Pipe) | **Corrigida**: `apps/api/tests/desk-acoes.test.ts` (novo), casos de vazio/sem conversa |
| 6 | Status do atendente (Online/Pausa/Invisível) | `POST /v1/desk/acoes/definirStatus` | Sim | Não havia | Parcial — ver lacuna grande | **Corrigida a lacuna de teste** (`desk-acoes.test.ts`: pausa exige motivo, fecha pausa anterior, aceita offline). **Lacuna grande não corrigida**: a origem não deixa o atendente ficar Offline por clique (só Online/Pausa/Invisível — Offline é automático); o Pipe aceita `estado: 'offline'` como valor livre de `definirStatus`, embora a UI (`trilho.tsx`) só ofereça os três. Bloquear no backend é indispensável para não depender só da tela; ficou documentado, não corrigido, porque também precisa decidir o texto de erro certo |
| 7 | Queda por inatividade | `POST /v1/desk/acoes/cairPorInatividade` | Sim | Não havia | Sim — idempotente, não derruba quem já está offline, fecha pausa aberta | **Corrigida**: teste novo cobre a queda e o no-op |
| 8 | Puxar o próximo da fila ("Atender") | `POST /v1/desk/acoes/atender` | Sim | Não havia | Parcial — ver lacuna grande | **Corrigida a lacuna de teste** (`desk-acoes.test.ts`). **Lacuna grande não corrigida**: a origem só distribui (manual ou automática) para quem tem "vaga" (`limite_simultâneo − ativas > 0`); o Pipe já tem essa conta pronta para a distribuição AUTOMÁTICA (`dominio/distribuicao.ts` + `vagas()`/`motivoInelegivel()` de `@pipe/core`), mas `atender` (puxada manual) não a chama — o atendente pode puxar tickets sem limite algum. Corrigir direito exige decidir a semântica exata (limite por fila vs. total) e uma checagem atômica dentro do mesmo `UPDATE ... FOR UPDATE SKIP LOCKED`, para não abrir uma corrida entre o `SELECT` de capacidade e a atribuição — não é uma troca de uma linha |
| 9 | Transferir (fila ou atendente), individual | `POST /v1/conversas/:id/transferir` → `transferirConversa` | Sim | `transferencia.test.ts` | Sim — herda janela de 24h e prioridade, não herda tags nem mensagens, exige `conversa.transferir` para transferir ticket de outro | Nenhuma |
| 10 | Transferir em massa | `POST /v1/desk/acoes/transferirEmMassa` → `transferirConversa` em série | Sim | Não havia | Sim — mesma regra da transferência individual, restrita às conversas do próprio atendente (a tela só lista `fila.conversas`, que já é escopado por `sessao.usuarioId`) | **Corrigida**: teste novo (sucesso, sem seleção, sem destino, item inexistente no meio do lote não derruba os demais) |
| 11 | Encerrar (com etiqueta obrigatória) | `POST /v1/conversas/:id/encerrar` → `encerrarConversa` | Sim | `conversa-eventos.test.ts` | Sim — etiqueta obrigatória, fecha espera em aberto antes | Nenhuma |
| 12 | Modo de Espera (entrar/sair) | `POST /v1/conversas/:id/espera` → `alternarEspera` | Sim | `conversa-eventos.test.ts` | Sim — a máquina de estados (`packages/core/.../maquina.ts`) só permite `em_espera` a partir de `em_atendimento`, que só existe depois da primeira resposta: a regra "só entra em espera quem já respondeu" está estruturalmente garantida, não é checagem solta | Nenhuma |
| 13 | Reenviar mensagem em falha | `POST /v1/conversas/:id/mensagens/:mensagemId/reenviar` → `reenviarMensagem` | Sim | `envio-sessao.test.ts` | N/A (correção de defeito do Desk antigo, não regra da Blip) | Nenhuma |
| 14 | Reabrir conversa encerrada | — | — | — | — | **Não existe, e não deveria por engano de leitura**: o texto "Envie uma nova mensagem para reabrir a conversa" no compositor fechado é informativo (na Blip, o CLIENTE reabrir cria um TICKET NOVO, não é ação do atendente) — mas o backend recusa (`conversa_encerrada`) e a tela nem desenha um campo de texto ali. Não é lacuna: só o texto é herdado da referência sem um botão porque não existe ação do atendente aqui |
| 15 | Editar dados do contato (nome/telefone/e-mail/documento) | `PATCH /v1/contatos/:id` → `ControladorContatos.editar` | Sim (com auditoria) | `contatos-editar.test.ts` (validação de e-mail/telefone, telefone único, permissão `contato.editar`, mescla de `atributos`) | Sim | **Corrigida**: o botão "Editar" do painel do contato estava com `disabled` e um comentário dizendo que a edição "era do CRM" — mas a rota já existe, testada e com permissão própria. Agora abre um formulário inline (`painel.tsx`, componente `EdicaoDoContato`) que chama a rota; erro (ex.: sem `contato.editar`, telefone em uso) aparece na tela |
| 16 | Etiquetar contato (fora do encerramento) | — | — | — | — | **Grande, só documentada**: a tabela `contato_etiqueta` existe no schema, mas nenhuma rota da `api` lê ou grava nela — não há endpoint, domínio nem UI. Construir do zero (rota + permissão + tela) é fora do escopo de correção simples |
| 17 | Etiquetar conversa aberta (sem encerrar) | — | — | — | — | **Grande, só documentada**: a única forma de marcar tag numa conversa aberta é pelo botão "Adicionar tags" do cabeçalho, que hoje só abre o modal de **Finalizar** (`conversa.tsx`) — ou seja, tag em conversa aberta obriga fechar o ticket. A Blip separa os dois (`ModalType.ADD_TAGS` ≠ `CLOSE_TICKET`). Corrigir exige uma rota nova (`POST /v1/conversas/:id/etiquetas`, sem migration — a tabela `conversa_etiqueta` já existe) e uma tela nova; não é wiring simples |
| 18 | Pin/Fixar ticket, marcar como não lido, Standby pelo menu do cartão | — | — | — | — | **Grande, só documentada**: o menu "⋮" e o botão "Informações do ticket" do cartão (`cartao.tsx`) só fazem `stopPropagation()` — não abrem nada. A origem oferece fixar até 50 tickets e marcar como lido/não lido manualmente (`TicketMenuOptions`), mas o Pipe não tem coluna nenhuma para "fixado" nem para "não lido manual" — exigiria migration nova, o que o escopo desta tarefa pede para evitar salvo indispensável. Não fiz a migration por ser decisão de produto (o que fixar, por quanto tempo, se é por atendente) melhor tomada fora de uma correção "simples" |
| 19 | Exportar ticket (baixar transcrição) | — (agora client-side) | — | — | Parcial | **Corrigida, versão simples**: o item de menu "Exportar ticket" (`conversa.tsx`) só fechava o menu, sem fazer nada. Como a thread inteira já está carregada na tela (`itens`), agora ele monta um `.txt` com a transcrição e baixa pelo navegador — sem rota nova. **Não cobre** o caso "download assíncrono por e-mail" de 90 dias a 5 anos da referência (isso é tela de gestor, fora do Desk) |
| 20 | Status do atendente e ações em massa: dados vêm de | `GET /v1/desk/fila`, `GET /v1/desk/filas` | Leitura | Cobertos indiretamente pelos testes de escrita acima; sem teste próprio do `GET` | — | Pequena, não corrigida por baixo risco: leitura pura, sem regra de negócio para validar além do isolamento por tenant (já coberto em vários outros testes do mesmo padrão de `noTenant`) |
| 21 | Aba Contatos: listar/buscar, ver ficha, ver histórico | `GET /v1/desk/contatos`, `/contatos/:id` | Leitura | Sem teste próprio | — | Pequena, não corrigida (mesma razão do item 20) |
| 22 | Ver ticket antigo (histórico do contato) | `GET /v1/desk/tickets/:id` | Leitura | Sem teste próprio | — | Pequena, não corrigida |
| 23 | Métricas do atendente | `GET /v1/desk/metricas` | Leitura | Sem teste próprio | Teto de 92 dias aplicado corretamente | Pequena, não corrigida |
| 24 | Mensagem ativa (disparo de template, fora do atendimento) | `POST /v1/mensagens-ativas` → `dispararMensagemAtiva` | Sim | `mensagens-ativas.test.ts` | Sim — limite de contatos por disparo (`MAX_CONTATOS_POR_DISPARO` = 15, a tela usa a mesma constante), canal resolvido e conferido contra o tenant | Nenhuma |
| 25 | Palavras proibidas no envio | — | — | — | — | **Não existe no Pipe** (nem no cliente, nem no servidor). A Blip filtra no cliente, com um bug documentado (`normalizeText` perde o `toLowerCase` quando ignora acento — `blip-desk-regras-tecnicas.md` §3.4). Como é filtro de conteúdo com paridade de bot/tenant, e não existe hoje nenhuma tabela/feature-flag equivalente no Pipe, fica só documentado como lacuna grande (motor novo) |
| 26 | Limite de tamanho de anexo / tipos aceitos | Validado dentro de `guardarAnexo` (`dominio/anexo.ts`) | Sim | Fora do escopo desta auditoria (arquivo não tocado: mexe em mídia) | A Blip não limita por tamanho de texto, só de anexo — igual ao Pipe | Não auditado a fundo: `dominio/midia.ts` está na lista de "não editar" desta tarefa |
| 27 | Código morto: `salvarComentarioDoContato` e `enviarMensagemAtiva` em `desk-vite/src/lib/acoes.ts` | Nenhuma — `ACOES` do `desk.ts` não tinha essas duas chaves | — | — | — | **Corrigida**: os dois `export const` foram removidos. Nenhuma tela chamava nenhum dos dois (a "mensagem ativa" de verdade usa `POST /v1/mensagens-ativas` direto; não existe "comentário do contato" separado da nota interna) — eram exports órfãos que, se chamados, dariam 404 |

## Resumo

- **27 ações/pontos auditados** (ações de escrita, leituras principais e dois achados de código morto/dead-end).
- **OK sem lacuna**: 10 (itens 1, 3\*, 9, 11, 12, 13, 20\*, 21\*, 22\*, 23\*, 24 — os marcados com \* são leituras de baixo risco, sem teste próprio mas cobertas indiretamente).
- **Corrigidas nesta rodada**: 6 (itens 4, 5, 6-teste, 7, 8-teste, 10, 15, 19, 27 — a numeração conta correções, não itens únicos: 8 correções ao todo).
- **Lacuna grande, só documentada** (motor novo, tabela nova ou decisão de produto): 6 (itens 2, 6-regra-offline, 8-capacidade, 16, 17, 18, 25).

## O que foi corrigido nesta rodada

1. **Testes para `/v1/desk/acoes/*`** — `apps/api/tests/desk-acoes.test.ts` (novo, 18 casos): lista fechada de ações (404 fora dela), sessão obrigatória (401), `definirStatus` (estado inválido, pausa sem motivo, fecha pausa anterior, aceita offline/invisível), `cairPorInatividade` (derruba e é idempotente), `salvarNotaInterna` (grava e recusa vazio), `atender` (só online, puxa a mais antiga da fila certa, ignora fila alheia), `transferirEmMassa` (recusa sem seleção/destino, transfere várias, um id inexistente no lote não derruba os demais).
2. **`resposta_pronta_id` no envio de texto** — `apps/desk-vite/src/paginas/atendimentos/compositor.tsx`: a escolha de uma resposta pronta agora viaja até `POST /v1/conversas/:id/mensagens`; editar o texto depois de escolher limpa a marca (a rota e a coluna já existiam e já tinham teste — só a tela não usava).
3. **Botão "Editar" do contato, ligado** — `apps/desk-vite/src/paginas/atendimentos/painel.tsx` (`EdicaoDoContato`, novo componente): chama `PATCH /v1/contatos/:id`, já testado e com permissão própria (`contato.editar`); antes, o botão vivia `disabled` com um comentário dizendo (erradamente) que a edição não era do Desk.
4. **"Exportar ticket" deixou de ser um botão morto** — `apps/desk-vite/src/paginas/atendimentos/conversa.tsx`: gera um `.txt` da transcrição já carregada e baixa pelo navegador; antes só fechava o menu.
5. **Código morto removido** — `apps/desk-vite/src/lib/acoes.ts`: `salvarComentarioDoContato` e `enviarMensagemAtiva`, que nenhuma tela chamava e que dariam 404 se chamassem (não estavam no mapa `ACOES` de `controladores/desk.ts`).

## O que ficou documentado como lacuna grande (não corrigido)

- **Anexo único por envio** apesar do rótulo prometer até 10 (item 2) — decisão de modelo de dados (mensagem × anexos).
- **`definirStatus` aceita `estado: 'offline'` livremente**, embora a origem só deixe o sistema atribuir Offline (item 6) — decidir o texto do erro e se algum caminho legítimo precisa dele.
- **`atender` (puxada manual) não respeita o limite de vagas** que a distribuição automática já respeita via `@pipe/core` (item 8) — corrigir direito pede uma checagem atômica dentro do `UPDATE ... FOR UPDATE SKIP LOCKED`, não uma troca de linha solta.
- **Etiquetar contato** (item 16) e **etiquetar conversa aberta sem encerrar** (item 17) — rotas e, no segundo caso, uma tela, inexistentes.
- **Pin/não-lido/standby pelo menu do cartão** (item 18) — precisaria de coluna nova (`fixado`, "não lida manual"), decisão de produto antes de código.
- **Palavras proibidas** (item 25) — não existe hoje no Pipe, em nenhuma camada.

## Verificações rodadas

```
pnpm -F @pipe/api typecheck            → limpo (nenhum erro; builder-do-fluxo.ts também limpo no momento desta auditoria)
pnpm -F @pipe/desk-vite typecheck      → limpo
pnpm -F @pipe/desk-vite lint           → limpo
cd apps/desk-vite && node --import tsx --test tests/*.test.ts   → 16/16
pnpm -F @pipe/api exec vitest run tests/desk-acoes.test.ts tests/envio-sessao.test.ts tests/conversa-eventos.test.ts tests/transferencia.test.ts tests/contatos-editar.test.ts
                                        → 66/66 (18 novos + 48 já existentes, todos verdes)
pnpm -F @pipe/ponte test               → 17/17 (não tocado; rodado por instrução da tarefa)
```

Nenhum commit foi feito.
