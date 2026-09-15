# Blip Desk — regras de negócio técnicas

Extraído de `C:\Users\anderson.linhares\desk-clone\fonte-original\app.js` (4,9 MB, bundle Vue **não** minificado, 115.462 linhas), dos templates decompilados em `desk-clone\templates\` e dos apoios em `desk-clone\docs\`.

Este documento é o complemento **técnico** de `blip-desk-regras.md`, `blip-desk-funcoes.md`, `regras-blip.md` e `blip-desk-medidas.md` — aqueles descrevem o Desk pela ótica da tela; aqui estão os nomes exatos das constantes, os enums completos, as máquinas de estado e os comandos LIME que as movem.

Convenção de leitura do bundle: `!0` é `true`, `!1` é `false`, `6e4` é `60000`, `1e3` é `1000`. Os nomes de módulo entre aspas (ex.: `"Divi"`, `"gw4j"`) são chaves do objeto webpack dentro do `app.js`; dá para achar qualquer um com `grep -n '^    "\?NOME"\?: function' app.js`.

---

## 1. Enums e máquinas de estado

### 1.1 `TicketStatusEnum` — 8 valores

Módulo `"Divi"`, **app.js:28793-28796**. Reexportado pelo barril `"RjSz"` (app.js:78387).

```js
e.None = "None", e.Waiting = "Waiting", e.Assigned = "Assigned", e.Open = "Open",
e.ClosedClient = "ClosedClient", e.ClosedClientInactivity = "ClosedClientInactivity",
e.ClosedAttendant = "ClosedAttendant", e.Transferred = "Transferred"
```

Os 8 valores estão confirmados. A leitura que faltava é **quais deles o Desk realmente vê**:

| Valor | O Desk enxerga? | Significado |
|---|---|---|
| `None` | Não | Estado nulo. Nenhuma comparação contra ele no bundle inteiro — só a declaração. |
| `Waiting` | Só como marcador visual | Aparece uma única vez no código de tela: `TicketService.addTicketMessage` (**app.js:111624-111641**) fabrica uma pseudo-mensagem `application/vnd.iris.ticket+json` com `content.status = "Waiting"` para desenhar o divisor "início do atendimento" na thread. Ticket em espera vive na fila do servidor, não na lista do agente. |
| `Assigned` | Não | Atribuído mas ainda não confirmado. Nenhuma comparação no bundle. Transição de servidor. |
| `Open` | **Sim** | Único status "vivo" na lista do agente. É atribuído **pelo próprio cliente** ao receber o ticket: `s.status = y.TicketStatusEnum.Open` em **app.js:15916**. |
| `ClosedClient` | Sim | Cliente encerrou. |
| `ClosedClientInactivity` | Sim | Encerrado por inatividade do cliente. |
| `ClosedAttendant` | Sim | Encerrado pelo atendente, por um gestor ou por um bot. |
| `Transferred` | Sim | Tirado do agente por transferência externa. |

### 1.2 Transições permitidas

O Desk **não** implementa uma tabela de transições. O servidor é a autoridade; o cliente só (a) dispara comandos que pedem transição e (b) reage ao evento de mudança. As transições que o código exercita:

#### (a) `None/Waiting/Assigned → Open` — recebimento

`app.js:15905-15975` (função `Y`, handler de ticket no MessageReceiver). Ordem exata:

1. **Porteiro de estado do agente** (app.js:15910): se a presença não for `"online"` **e** a mensagem não trouxer `metadata["#forceOnline"]`, o ticket é **recusado** — chama `H(e, "Receiving ticket for agent with invalid state", true)`, que devolve `NOTIF event=Failed, reason.code = 61`. Ou seja: **agente fora de Online não aceita ticket distribuído**, e o servidor é informado para redistribuir.
2. `ClientService.validAssignedTicket(e)` → `SET /tickets/{id}/confirm-received` (**app.js:111454-111485**). Se o ticket voltar com `closeDate` preenchido, também vira `Failed / 61`.
3. Se ainda não estiver na lista local: `isNew = true`, **`status = Open`**, `openDate` do servidor, `unreadMessages = 1`, carrega o lead score, chama `TicketService.receiveTicket`.
4. Confirma com `NOTIF event=Consumed`, com o `to` reescrito de `DESK_TICKET_DISTRIBUTION_DOMAIN` para `DESK_DOMAIN`.
5. Toca o som (`ticketDistributionSoundNotification`), notifica o navegador e emite `postMessage({type:"kanban", value:"new-ticket-received"})` para o iframe pai.
6. Se falhar em entrar na lista: `NOTIF event=Failed`, `reason.code = 61`, description `"Failed to add ticket to interface"`.

`reason.code 21` no `confirm-received` é engolido em silêncio (**app.js:111476**) — é o "ticket já confirmado".

#### (b) `Open → ClosedAttendant` — encerramento pelo atendente

`TicketService.closeTicket` (**app.js:111281-111336**) tem **duas rotas**, e a escolha depende do status que o ticket **já** tem:

```js
if (a.status !== "ClosedClient" && a.status !== "ClosedClientInactivity")
    SET /tickets/change-status  { id, tags, status: "ClosedAttendant", ownerIdentity, customerIdentity }
else
    SET /tickets/{id}/close     { id, tags, status: <status atual>, ownerIdentity, customerIdentity }
```

Quando o cliente já encerrou, o Desk **não** reescreve o status — só chama `/close` para arquivar e devolver o slot. Só o ticket ainda `Open` vira `ClosedAttendant` via `/tickets/change-status`. Ambos com timeout de `6e4` (60 s).

Existem ainda `closeTicketClient` (app.js:111338) e `closeTicketClientInactivity` (app.js:111367) para os caminhos simétricos.

#### (c) `Open → Transferred` — transferência

Dois métodos, **mesma URI**, resource diferente (`TicketService`, app.js:111190-111280), ambos com timeout 60 s:

| Método | URI | Resource |
|---|---|---|
| `sendTicketToTeam(ticket, team)` | `SET /tickets/{id}/transfer` | `{ team, averageAgentResponseTime }` |
| `sendTicketToAgent(ticket, agentIdentity)` | `SET /tickets/{id}/transfer` | `{ agentIdentity, team: "DIRECT_TRANSFER", averageAgentResponseTime }` |

`Constants.DIRECT_TRANSFER_TEAM = "DIRECT_TRANSFER"`, `Constants.DEFAULT_TEAM = "Default"`. Transferência direta para um agente é modelada como transferência para a fila-fantasma `DIRECT_TRANSFER`; a tela substitui esse nome por "Transferência direta" na exibição. Ambos abortam sem erro se o destino vier vazio (`if (!n) return`).

#### (d) Recebendo a transição do servidor

Função `G` em **app.js:15855-15905** — handler do evento de mudança de contexto do ticket:

1. `blip/tickets/setStatus` + `blip/tickets/setClosed` + `SET_TAGS` (na lista);
2. se for o ticket aberto na tela, repete em `blip/currentTicket/`;
3. escolhe o **modal de despedida** por status:

| Status recebido | Modal (`ModalType`) |
|---|---|
| `ClosedAttendant` ou `Transferred` | `MANAGER_CLOSED` |
| `ClosedClient` | `CLIENT_CLOSED` |
| `ClosedClientInactivity` | `INACTIVITY_CLIENT_CLOSED` |

A lista de gatilho está literal em **app.js:15870**: `var k = ["ClosedAttendant", "Transferred"]`. O mesmo mapeamento reaparece em `currentTicket/onTicketSelected` (**app.js:114131-114145**), para o caso do agente clicar num ticket que fechou enquanto ele estava em outro.

O modal `MANAGER_CLOSED` só diferencia o texto: `"Transferred" === ticket.status ? $t("status.transferred") : $t("status.closed")` (**app.js:79557**).

Se `state.blip.client.onlyChat` estiver ligado (modo embarcado), **nenhum modal abre** — o ticket é resolvido direto (app.js:15898).

#### (e) Saída da lista

`currentTicket/onTicketResolved` (**app.js:114090-114108**) é o ponto único de saída. Encadeia: `blip/tickets/resolvedTicket` (mutation `RESOLVE_TICKET`) → `clearTicket` → `blip/contact/clearContactCache` → `blip/metadata/saveMetadataAndClearCache` → `InactivityChecker.check()` → `commit("changeState","")` → `postMessage({type:"removeTicket"})`.

### 1.3 `AttendantStatus` — 5 valores

Módulo `"gw4j"`, **app.js:94773-94787**.

```js
e.ONLINE = "Online", e.OFFLINE = "Offline", e.PAUSE = "Pause",
e.INVISIBLE = "Invisible", e.RECONNECT = "Reconnect"
```

No mesmo módulo, o helper exportado **`isActiveAttendantStatus(s)`** (app.js:94775): `[ONLINE, PAUSE, RECONNECT].includes(s)`. `Invisible` e `Offline` **não** são estados ativos.

O seletor da interface (**app.js:73836** e **app.js:16906**) só oferece três: `[ONLINE, PAUSE, INVISIBLE]`. `Offline` e `Reconnect` são estados que só o sistema atribui.

Enum companheiro **`AttendantDevice`** — módulo `"3XZl"`, **app.js:17009-17015**: `WEB = "Web"`, `MOBILE = "Mobile"`. Escolhido em app.js:112272 por `isTheApp ? MOBILE : WEB`.

### 1.4 A ação `changeStatus` — a máquina inteira

`blip/account/changeStatus`, **app.js:112264-112331**. Assinatura: `{ newStatus, device, personalizedBreakReason, ignoreBlockSystem }`.

1. **Trava de página** (app.js:112288): se a página atual proíbe troca de status **e** `isActiveAttendantStatus(newStatus)`, o status é **forçado para `Invisible`** com `console.warn("Change status disabled on this page.")`. O agente pede Online e recebe Invisible.
2. **`Reconnect` é normalizado**: `r = (newStatus === RECONNECT) ? ONLINE : newStatus`. **`Reconnect` nunca chega ao servidor** — é um pseudo-status interno para forçar reenvio de `Online`.
3. Se o alvo é `ONLINE`, dispara `blip/activeMessages/loadConfigs` antes.
4. **Comando LIME**:
   ```
   SET  postmaster@<DESK_DOMAIN>
   uri   /attendants/change-status
   type  application/vnd.iris.desk.attendant-status-device+json
   resource { status, device, customPauseReason }
   ```
5. Se `blip/owners/blockAwayAgentUsage` (getter de `OwnerProps.BlockAwayAgentDeskUsage`) e `!ignoreBlockSystem`: `SET_SYSTEM_BLOCKED = (status !== "Online")` — o Desk se auto-bloqueia quando o agente sai de Online.
6. **Tratamento de erro** (app.js:112303-112311) — as regras que ninguém documenta:

| Condição do erro | Resultado |
|---|---|
| alvo era `Online` **e** `reason.code === 61` | vira **`Invisible`** + toast `goOnline` (erro) ou `goOnlineReconnect` (aviso, se o pedido veio de `Reconnect`) |
| `reason.code === 64` | status **mantido** (é o "já está assim") |
| qualquer outro erro | vira **`Offline`** |

7. **Finally** (roda sempre, app.js:112312): se o status resultante é `Offline`, fecha a conexão LIME (`client.instance.close()`); `setPresence` vira `"available"` ou `"unavailable"`; commit `SET_STATUS`; se mudou, `setTimerPauseStatus`; `postMessage({type:"changeStatus", value})` para o iframe pai.
8. **Efeito por status final**: `Online` → `blip/tickets/getWaiting`; `Pause` → `SET_PERSONALIZED_BREAK` com o motivo.

### 1.5 O que dispara cada transição de `AttendantStatus`

| Para | Gatilho | Onde |
|---|---|---|
| `Online` | clique no seletor de status | app.js:73840 |
| `Online` | login/entrada normal | app.js:79643 |
| `Online` | preferência **"manter online ao fechar a janela"** (`enableKeepAgentOnlineAfterClosingDeskWebWindow`) com `lastStatusOnDatabase === Online`, **ou** `blockAwayAgentUsage` ligado | `checkKeepAgentOnlinePreference`, app.js:12917-12930 |
| `Online` | botão do modal de sessão/reconexão | app.js:93021 |
| `Pause` | clique no seletor. **Se houver pausas personalizadas cadastradas** (`PersonalizedBreaksService.getPersonalizedBreaks()`), o clique **não** troca o status: abre o modal `PERSONALIZED_BREAKS` e espera a escolha do motivo | app.js:73840-73885 |
| `Pause` | escolha do motivo no modal, com `personalizedBreakReason` | app.js:12911-12925; track `desk-status-changed` com `trigger: "personalized-break"` |
| `Invisible` | clique no seletor | app.js:73840 |
| `Invisible` | **timeout de inatividade** — ver 1.6 | app.js:112817-112832 |
| `Invisible` | erro `61` ao tentar ficar Online | app.js:112303 |
| `Invisible` | trava de página | app.js:112288 |
| `Invisible` | evento externo `setAgentInvisible` | app.js:80464 |
| `Invisible` | fluxo de bloqueio | app.js:83886 |
| `Offline` | qualquer erro não-61/não-64 no `change-status` | app.js:112310 |
| `Offline` | logout (`SET_LOG_OUT_ACTION` true) | app.js:112482 |
| `Reconnect` | **dessincronia no polling**: em `getWaiting`, se o state local diz `Online` mas `GET /agents/info` responde `status !== "Online"`, dispara `changeStatus({newStatus: RECONNECT})`, que reenvia `Online` ao servidor | app.js:35674-35682 |
| qualquer | `postMessage({type:"changeStatus", status})` do iframe pai — só aceita valores presentes em `Object.values(AttendantStatus)` | app.js:79624-79628 |

### 1.6 Inatividade — duas máquinas distintas

**`InactivityChecker`** — **app.js:82030-82060**. É um `debounce` de `AppSettings.INACTIVITY_INTERVAL` (10 min). Só abre o modal se **todas** valerem:

- feature `NotificationFeature.InactivityModalSetOfflineEnabled`;
- `account.status === "Online"`;
- há tickets em espera **ou** `tickets.data.length > 0` (com a feature ligada) / só `tickets.waiting` (sem);
- `!ModalUtils.hasModalOpen()`;
- `blip/client/isConnected`;
- `!SegmentService.isMobile()`.

Com a feature ligada o modal é `INACTIVITY_SET_OFFLINE` e **não** fecha com clique fora nem com Esc (`closeOnClickOutside: false, closeOnEsc: false`). Sem a feature, é o modal `INACTIVITY` antigo, dispensável.

`InactivityChecker.check()` é re-armado por `claimTicket` (app.js:31857) e `onTicketResolved` (app.js:114100).

**Modal `inactivity-set-offline-modal`** — **app.js:112736-112834**. Contagem regressiva de `AppSettings.INACTIVITY_SET_OFFLINE_INTERVAL` (10 min), tick de 1 s.

> **Armadilha 1:** a contagem só existe se a preferência `enableKeepAgentOnlineAfterClosingDeskWebWindow` estiver **desligada** (`isCountdownEnabled = !preferencia`). Com a preferência ligada, o modal aparece mas **nunca** derruba o agente.

> **Armadilha 2 (o nome mente):** o método chama-se `setOfflineForInactivity`, a constante chama-se `INACTIVITY_SET_OFFLINE_INTERVAL`, o track é `desk-inactivitysetoffline-activated` — e o status que ele grava é **`"Invisible"`**, literal, hardcoded (app.js:112824). O agente **não** vai para `Offline` por inatividade; vai para `Invisible`, o que mantém sessão e conexão vivas.

O botão "atender agora" do modal só funciona se `tickets.waiting !== 0` e passa `claimTicketCaller: InactivitySetOfflineModal`.

### 1.7 `ClaimTicketCaller` — enum numérico

Módulo `"Bc2d"`, **app.js:25094-25107**. É o único enum **numérico** do domínio (os outros são string):

```js
Sidenav = 0, PostCloseModal = 1, InactivityModal = 2, InactivitySetOfflineModal = 3
```

Serve só para telemetria — quem pediu o próximo ticket.

### 1.8 Demais enums de domínio

| Enum | Módulo / linha | Valores |
|---|---|---|
| `MessageStatus` | `"8Mv+"`, app.js:21385 | `Accepted="accepted"`, `Dispatched="dispatched"`, `Received="received"`, `Consumed="consumed"`, `Failed="failed"` |
| `NotificationEvents` | `"NtqB"`, app.js:73691 | `Accepted`, `Dispatched`, `Received`, `Consumed`, `Failed` (mesmas cinco, **capitalizadas** — não confundir com `MessageStatus`) |
| `MessageType` | `"Zeim"`, app.js:85158 | `AUDIO`, `FILE`, `IMAGE`, `TEXT`, `TYPING`, `PAUSED`, `VIDEO`, `SUMMARY`, `FAILED`, `VIDEOCALL="videoCall"`, `VOICECALL="voiceCall"`, `JSON`, `UNKNOWN`, `CALLPERMISSION="callPermission"`, `REPLY`, `FLOW_SESSION="flowSession"` |
| `MessagePosition` | `"iM4b"`, app.js:96149 | `Right="right"`, `Left="left"` — **é a direção da mensagem na tela**; não há enum `direction` separado, o campo cru da mensagem usa `"sent"`/`"received"` (ver app.js:111627) |
| `CustomerResponseDelay` | `"/tJW"`, app.js:2617 | `WARNING="Warning"`, `CRITICAL="Critical"` |
| `TicketMenuOptions` | `"qBuc"`, app.js:102277 | `PIN="pin"`, `UNPIN="unpin"`, `UNREAD="unread"`, `READ="read"`, `SET_STANDBY="setStandbyMode"`, `UNSET_STANDBY="unsetStandbyMode"` |
| `PaneChatMenuOptions` | `"GkuU"`, app.js:31611 | `OUTBOUND_CALL`, `INBOUND_CALL`, `UTILITIES`, `EXPORT_TICKET_THREAD_EMAIL="sendTicketThreadEmail"` |
| `PaneChatMenuSubOptions` | `"6OFS"`, app.js:19619 | `REQUEST_CALL_PERMISSION`, `VOICE_CALL`, `RECEIVE_CALL`, `VIDEO_CALL`, `HEALTH_CHECK` |
| `PaymentStatus` | `"FvVE"`, app.js:31095 | `Pending`, `Paid`, `Denied`, `Expired`, `Voided`, `NotFinalized`, `Authorized`, `Chargeback` (valores = as próprias chaves). O mesmo módulo tem `PaymentNavbarLocation` (`create`, `history`, `historyDetail`, `review`) e `PaymentOption` (`cielo`, `openFinance`) |
| `AttendantDevice` | `"3XZl"`, app.js:17009 | `WEB="Web"`, `MOBILE="Mobile"` |
| `DistributionType` (valores) | `Constants`, app.js:1090-1092 | `ORLEANS_DISTRIBUTION="Orleans"`, `REDIS_DISTRIBUTION="Redis"`, `SQL_DISTRIBUTION="Sql"` |

**`ModalType`** — objeto literal (não é enum TS), **app.js:36747-36772**: `NONE="none"`, `CLOSE_TICKET`, `CANCEL_TICKET`, `INACTIVITY`, `INACTIVITY_SET_OFFLINE`, `SEND_CARD`, `SEND_FILE`, `TRANSFER`, `MANAGER_CLOSED`, `CLIENT_CLOSED`, `INACTIVITY_CLIENT_CLOSED`, `ADD_TAGS`, `COOKIE_AUTHORIZATION`, `SEND_ACTIVE_MESSAGE`, `SEND_MULT_FILE="send-multiple-files"`, `PERSONALIZED_BREAKS`, `TEMPLATE_MESSAGE_PREVIEW`, `ATTENDANT_DISCONNECT`, `HEALTH_CHECK`, `ATTENDANT_DISCONNECTED`, `EXPORT_TICKET_THREAD_EMAIL`, `CREATE_FOLDER="create-folder-modal"`, `CUSTOM_REPLIES`, `CUSTOM_REPLY_FORM`, `CATEGORY_FORM`.

**`MediaTypes`** — `"JyAs"`, **app.js:34488**: `Ticket=application/vnd.iris.ticket+json`, `ChatState=application/vnd.lime.chatstate+json`, `MediaLink=application/vnd.lime.media-link+json`, `DetailMedia=application/vnd.iris.media.detail-media+json`, `ReplyMessage=application/vnd.lime.reply+json`, `Redirect=application/vnd.lime.redirect+json`, `ThreadSummary=application/vnd.iris.desk.thread-summary+json`, `Text=text/plain`, `CallsMedia`, `ApplicationJson=application/json`, `CallsMakeOutboundCall`, `CallsIncomingCallAnswer`, `CallsSession`, `CallsCustomerPermission`, `InternalChat=application/vnd.iris.desk.internal-chat-notification+json`, `ExportTicketThreadEmailRequest`, `CopilotTranscriptionEnqueue`, `FlowSession=application/vnd.iris.desk.flow-session+json`.

> **Não encontrado:** não existe enum de **prioridade** de ticket no bundle. Também não há enum de "status de entrega" separado — quem faz esse papel são `MessageStatus` (na bolha) e `NotificationEvents` (no protocolo).

---

## 2. Elegibilidade e distribuição

### 2.1 `TicketOwnershipService.isTicketAvailableForUser` — a lógica completa

Módulo `"xY6i"`, **app.js:111065-111078**. É uma linha:

```js
e.isTicketAvailableForUser = function (ticketAttendant, userEmail) {
    return !ticketAttendant || (!!userEmail && ticketAttendant.trim().toLowerCase() === userEmail.trim().toLowerCase())
}
```

Regra completa, sem nada omitido:

1. **Ticket sem atendente (`ticketAttendant` vazio/null) → disponível para qualquer um.** Retorna `true`.
2. Ticket com atendente e **usuário sem e-mail** → `false`.
3. Caso contrário, compara os dois **após `trim()` e `toLowerCase()`**. Igual → disponível; diferente → não.

Não há verificação de slots, de fila, de time, de status do ticket nem de permissão aqui. É comparação de string, e só.

**Único ponto de uso no bundle inteiro**: a computed `ticketBelongsToCurrentUser` do compositor de mensagem, **app.js:76706-76709**:

```js
ticketBelongsToCurrentUser: function () {
    return !this.ticket || !this.ticketAttendant
        || TicketOwnershipService.isTicketAvailableForUser(this.ticketAttendant, this.$store.state.blip.account.me.email)
}
```

O `ticketAttendant` que entra na comparação **não é um e-mail cru** — vem da computed logo abaixo (**app.js:76710-76714**):

```js
ticketAttendant: function () {
    if (!this.ticket || !this.ticket.agentIdentity) return null;
    return decodeURIComponent(this.ticket.agentIdentity.split("@")[0])
}
```

Pega `ticket.agentIdentity` (formato `usuario%40dominio.com@desk.msging.net`), corta no **primeiro** `@` e faz `decodeURIComponent` — devolvendo `usuario@dominio.com`. É esse valor que é comparado com `account.me.email`.

`ticketBelongsToCurrentUser` governa se o compositor deixa digitar. **Não** governa distribuição.

> **Conclusão:** *não existe* no cliente uma regra de elegibilidade "este ticket pode ser atribuído a este agente". Toda a elegibilidade de distribuição (slots, fila, skill, prioridade) é decidida **no servidor**. O cliente só tem dois freios: o porteiro de `AttendantStatus` no recebimento (§1.2a) e este `isTicketAvailableForUser` para travar o compositor.

### 2.2 `claimTicket` — pegar o próximo da fila

`TicketManager.claimTicket`, **app.js:31823-31896**. Exposto como `throttleClaimTicket` — `lodash.throttle(fn, 300, { trailing: false })` (**app.js:31930-31935**): cliques em menos de 300 ms são descartados, e o descarte **não** é reexecutado no fim.

**Guarda de entrada** (app.js:31830) — retorna sem fazer nada se qualquer uma valer:

```js
tickets.claimable === 0 || tickets.waiting === 0 || tickets.isClaimingTicket
```

`isClaimingTicket` é um mutex explícito (`SET_IS_CLAIMING_TICKET`), ligado antes e desligado no `finally`.

**Comando**: `GET postmaster@<DESK_DOMAIN>` uri `/tickets/claim`, timeout `6e4` (60 s).

Sucesso: para cada item de `resource.items` marca `isNew = true`, carrega o lead score, chama `TicketService.receiveTicket(item, false)`; depois `getWaiting`, seleciona `tickets.data[0]` e re-arma o `InactivityChecker`.

**Erros — o mapa que faltava:**

| `reason` | Toast | Significado |
|---|---|---|
| `code === 67` | `toastData.claimAssigned` (warning) | o ticket foi pego por outro agente entre o clique e o comando |
| `code === 23` **e** `description === "Agent ticket list is full."` | `toastData.claimLimit.alert` (warning) | **o agente está no limite de slots** |
| qualquer outro | `toastData.claimTicket` (error) com botão que faz **reload da página** (`router.go(0)`) | falha genérica |

Em todos os casos de erro, `getWaiting` é chamado de novo para ressincronizar os contadores.

### 2.3 O que acontece quando o agente está no limite

Nada no cliente impede o clique. O Desk **envia** o `/tickets/claim`, o servidor recusa com `code 23 / "Agent ticket list is full."`, e o cliente mostra o toast `claimLimit`. O limite é do servidor; a mensagem é do cliente.

Pelo mesmo motivo, na distribuição automática o servidor simplesmente não envia o ticket — **não existe verificação de slot no bundle**. Coerente com o achado de que `OwnerProps.AgentSlots` está **declarada mas nunca lida** no front-end (§4).

### 2.4 `getWaiting` — o polling que sustenta os contadores

`blip/tickets/getWaiting`, **app.js:35660-35696**.

1. **Aborta se o agente não estiver `Online`.**
2. Lê a preferência `getKeepAgentOnlinePreference`.
3. `GET postmaster@<DESK_DOMAIN>` uri `/agents/info` (+ `?KeepAgentOnline=<valor>` se a preferência estiver ligada).
4. **Detector de dessincronia**: se o local ainda diz `Online` e `resource.status !== "Online"` → `changeStatus({ newStatus: RECONNECT })`.
5. `SET_WAITING { waiting: parseInt(resource.waitingTicketsCount), claimable: parseInt(resource.waitingClaimableTicketsCount) }` — **são dois contadores distintos**: quantos esperam na fila e quantos este agente pode puxar.
6. Se a preferência de manter online estiver ligada, roda `compareTicketsOpenOnServerWithDeskList(resource)` — reconciliação da lista local com a do servidor.

### 2.5 `ManualDistributionEnabled` e o contador de "claimable"

Ao receber um ticket, `OwnerProps.ManualDistributionEnabled` (default **`true`**, app.js:111705) decide se o contador de *claimable* também decrementa (mutation `SET_DECREASE_WAITING`, app.js:35224). É a única diferença de comportamento no cliente entre distribuição manual e automática.

### 2.6 Códigos de erro LIME observados no bundle

| Código | Onde | Significado no Desk |
|---|---|---|
| 21 | `ValidateAssignedTicket` (app.js:111476), `SetStandbyTicket`/`UnsetStandbyTicket` (111975/112009) | recurso já no estado pedido — engolido em silêncio |
| 23 + `"Agent ticket list is full."` | `claimTicket` (app.js:31866) | limite de slots do agente |
| 61 | `changeStatus` (app.js:112303), `MessageReceiver` (app.js:15946, 15971) | falha ao ficar Online / falha ao aceitar ticket distribuído |
| 64 | `changeStatus` (app.js:112310) | status já é esse — mantém |
| 67 | `claimTicket` (app.js:31860) | ticket já atribuído a outro |
| `ReasonCodes.COMMAND_RESOURCE_NOT_FOUND` | app.js:17391, 17418, 21564, 73158 | recurso inexistente — silenciado nos casos de thread/histórico |

---

## 3. Validações antes de cada ação

### 3.1 Enviar mensagem — a janela de 24 h

`TicketWindowExpirationService`, classe em **app.js:21314-21360**.

```js
isLastMessageWithinHours(ticket, hours) {
    void 0 === hours && (hours = 24);
    var d = this.getLastRelevantMessageDate(ticket);
    return !!d && (Date.now() - d.getTime()) / 36e5 < hours
}
```

- As **24 h estão no default do parâmetro** (app.js:21346). **Nenhum caller passa o segundo argumento** — na prática é sempre 24. Comparação `<`, estrita.
- `getLastRelevantMessageDate` (**app.js:21320**) tem cascata de fallback:
  1. `ticket.messages` filtrado por `direction === "received"` **E** `type !== MediaTypes.Ticket` **E** `type !== MediaTypes.ThreadSummary` → a **maior** `createDate` válida. **Só mensagem recebida do cliente conta** — resposta do atendente não reabre a janela;
  2. senão `ticket.storageDate`;
  3. senão `ticket.openDate`;
  4. senão `null` → `isLastMessageWithinHours` devolve `false`.
- `getValidMessageDate` (app.js:21316) descarta datas sem `createDate` ou `isNaN`.

**`needToSendActiveMessage`** — a regra completa, **app.js:76637-76638**, quatro condições em AND:

```js
"whatsapp" === getChannelNameFromDomain(this.ticket.customerDomain)
&& (!this.isLastMessageDateLessThan24Hours || this.isClosedClientInactivity || this.isClosedClient || this.isClosedAttendant)
&& this.ownerCansendActiveMessage
&& this.isActiveMessageInConversationEnabled
```

1. canal **exatamente** `whatsapp`;
2. janela estourada **OU** ticket fechado em qualquer das três formas;
3. `ownerCansendActiveMessage` (app.js:76619) = `OwnerProps.ActiveMessageEnabled`, default `false`;
4. `isActiveMessageInConversationEnabled` (feature toggle).

**`getChannelNameFromDomain`** — **app.js:71982**, switch sobre `domain.toLowerCase()`:

| domínio | retorno |
|---|---|
| `wa.gw.msging.net` | `whatsapp` |
| `messenger.gw.msging.net` | `messenger` |
| `take.io`, `tangram.com.br` | `sms` |
| `mailgun.gw.msging.net` | `mailgun` |
| `telegram.gw.msging.net` | `telegram` |
| `workplace.gw.msging.net` | `workplace` |
| `abs.gw.msging.net`, `skype.gw.msging.net` | `skype` |
| `businesschat.gw.msging.net` | `business-chat` |
| `infobip.gw.msging.net` | `infopib` (typo no fonte) |
| `businessmessages.gw.msging.net` | `gbm` |
| `instagram.gw.msging.net` | `instagram` |
| *default* | `blip-chat` |

> **Só `whatsapp` sofre a regra das 24 h.** Nenhum outro canal dispara `needToSendActiveMessage`.

Regra correlata — **`isTicketChannelReplyAvailable`** (app.js:72012): a citação/reply de mensagem só é oferecida em canais listados em `AppSettings.CHANNELS_REPLY_AVAILABLE`, cujo valor é `"whatsapp;blip-chat"` (`docs/desk-settings.json:97`). Consumido em app.js:78560 (`handleReplyCallback`).

### 3.2 O que bloqueia o campo de digitação

O template `templates/pane-chat-message-input.html` está reduzido; a árvore de decisão real está na render function do componente, **app.js:16312-16420**. É um ternário aninhado, avaliado nesta ordem:

1. **Guarda externa** (16315): só renderiza alguma coisa se `isClosedClient || isClosedClientInactivity || isClosedAttendant || ticketBelongsToCurrentUser`.
2. `isNotOffline && needToSendActiveMessage` → renderiza `<active-message-box>` **no lugar do input**. É esse o bloqueio da janela de 24 h.
3. `!isNotOffline || isClosedClient || isClosedClientInactivity || isClosedAttendant || isActionInProgress || isTicketInStandBy` → cai numa cadeia de alertas em vez do input:
   - `isClosedClient` → alert `clientClosed.title`
   - `isClosedClientInactivity` → alert `clientClosedInactivity.title`
   - `isClosedAttendant` → alert `attendantClosed.title`
   - `isDeskActionsFeatureEnabled && isActionInProgress` → paper `inputLock.description` + botão `inputLock.unlockButton` (16333-16358)
   - `isTicketInStandBy` → paper `standbyInputLock` + botão `resumeStandBy` (16380-16400)
   - senão (agente offline) → paper `youAre / offline` (16359-16378)
4. Só no `else` final aparece o `bds-paper` com `custom-reply` + a textarea `ref="inputTextarea"` (16401+).

Computeds envolvidas:

| computed | linha | condição |
|---|---|---|
| `isNotOffline` | 76622 | `account.status !== AttendantStatus.OFFLINE && this.ticket` |
| `isClosedAttendant` | 76625 | `"ClosedAttendant" === ticket.status` |
| `isClosedClient` | 76628 | `"ClosedClient" === ticket.status` |
| `isClosedClientInactivity` | 76631 | `"ClosedClientInactivity" === ticket.status` |
| `isActionInProgress` | 76589 | `null != ticket.flowSession` |
| `isTicketInStandBy` | 76592 | `ticket.standbyModeStart` truthy |
| `ticketBelongsToCurrentUser` | 76706 | ver §2.1 |

**Guarda no envio** (não no DOM) — `sendTextMessage`, **app.js:77254**, guarda em **77261**:

```js
if (ticket.messageInput && "" !== ticket.messageInput.trim()
    && account.status !== AttendantStatus.OFFLINE) { ... } else return
```

Mensagem vazia/só-espaço e agente `Offline` abortam **silenciosamente**, sem toast.

Botões laterais do compositor: `ownerCanSendAttachment` (76610, `CanSendAttachment`, default **true**), `ownerCanSendEmojis` (76616, `CanSendEmojis`, default **true**), `ownerCanSendAudioRecording` (76648, `CanSendAudioRecording`, default false), `isCopilotEnabled` (76673 = `TenantBotBlipCopilotEnabled && CareCopilotEnabled`), `suggestionsAllow` (76676 = `isCopilotEnabled && canCareCopilotSuggestionsPermission`).

> **Não existe limite de tamanho de texto no compositor.** Não há `maxlength` nem checagem de `messageInput.length` no input de chat. Os `maxlength` do bundle são de outros campos (nome de pasta 50, respostas rápidas 500, pagamento 128, e-mail 280 em app.js:114929).

### 3.3 Validação de anexo — pipeline exato

Laço em **app.js:95540-95595**, por arquivo, **nesta ordem**:

| # | linha | condição de rejeição | efeito |
|---|---|---|---|
| 1 | 95547 | `"" === file.type` | remove silenciosamente |
| 2 | 95552 | `isImageAttach && file.type.indexOf("image") === -1` | `showOnlyImageBanner` |
| 3 | 95558 | `ARCHIEVE_ACCEPT_EXTENSION.indexOf(file.type) === -1` | `showUnsuportedFormatBanner` |
| 4 | 95564 | `useFileTypeVerificationForTransit && !allowedList.includes(file.type)` | `showNotAllowedMediaBanner` |
| 5 | 95559 / 95424 | `file.size > MAX_ATTACHMENT_SIZE` (`validateMaxSizeAttachment`) | `showMaxSizeBanner` |
| 6 | 95562 / 95730 | `mediaLinkDocuments.length >= MAX_ATTACHMENT_COUNT` (`ownerExceedLimitAttachment`) | `showExceedCountBanner` e **aborta o laço inteiro** (`return`) |

`MAX_ATTACHMENT_SIZE = 104857600` (100 MB) e `MAX_ATTACHMENT_COUNT = 10` (`docs/desk-settings.json:17-18`). A lista de MIMEs permitidos vem de `ARCHIEVE_ACCEPT_EXTENSION` (sic, com o typo) e `IMAGE_ACCEPT_EXTENSION` (linhas 64-65 do settings).

Há uma segunda checagem no `MediaHandler`: `mediaSizeAllowed` (app.js:90331) e `throw new Error("MAX_ATTACHMENT_SIZE_ERROR")` (90375), tratado em 100235 com toast que faz `MAX_ATTACHMENT_SIZE / 1024 / 1024`.

`UseFileTypeVerificationForTransit` / `...AllowedList` aparecem duplicados em app.js:24170-24171 (pane-chat-body) e 95721-95723 (modal de anexo), ambos com default `false`. Em **app.js:24181** a mesma lista serve para **censurar mídia já recebida**: se o `type` não está na allowlist, o código faz `t.type = ""` e a mensagem deixa de renderizar como mídia.

> **Armadilha de tipo:** o `AllowedList` tem default `false` (booleano) mas é usado como array (`.includes`). Só não quebra porque a condição em 95564 avalia `useFileTypeVerificationForTransit` primeiro e curto-circuita. Se o owner ligar `ForTransit=true` **sem** configurar a allowlist, quebra.

### 3.4 Palavras proibidas

#### Fonte de dados

`OwnerService.getForbiddenWords(owner)` — **app.js:21929-21936**:

```
GET  postmaster@msging.net
uri   lime://<ownerIdentity>/buckets/blip:desk:forbidden-words
```

timeout `DEFAULT_CLIENT_TIMEOUT`. O bucket irmão de tags é `lime://<owner>/buckets/blip:desk:tags` (app.js:21919-21926).

`getForbiddenWordsConfigs` (**app.js:22108**) parseia o `resource` como JSON; erro cai em `{}` (22129). Normalização em **22131**:

```js
hasForbiddenWords  = a.hasForbiddenWords  || false
exactMatch         = a.exactMatch         || false
considerDiacritics = a.considerDiacritics || false
forbiddenWords     = hasForbiddenWords && a.forbiddenWords ? a.forbiddenWords : []
```

#### Feature toggle e cache

- `ForbiddenWordsFilterKey = "enable-forbidden-words-filter"` — **app.js:22347**.
- `ChatFeatures.isForbiddenWordsFilterEnabled()` (**app.js:22417**) usa `isUserFeatureEnabled(key, false)` — toggle **por usuário**, default `false`. Memoiza em uma estática de classe (22426/22432): **cache permanente na sessão, sem TTL**. Qualquer exceção → `false`.
- `loadOwnerForbiddenWordsOption` (**app.js:27064**) só busca se não houver cache ou se tiver expirado (helper `i(cache, key)` em **26703**: `!cache.hasOwnProperty(key) || cache[key].expireDate < new Date`). TTL gravado em **27082**: `CONFIGURATION_EXPIRATION_FORBIDDEN_WORDS_TIME` = **300000 ms = 5 min** (`docs/desk-settings.json:53`).
- State `forbiddenWords: {}` em 26783, chaveado por `ownerIdentity`; mutation `SET_FORBIDDEN_WORDS_OPTION` (26863); getter `getForbiddenWordsOption` (26894, fallback `{forbiddenWordsOptions: []}`).
- A lista é carregada **ao abrir cada ticket**: action `blip/currentTicket/getForbiddenWords` (113737), disparada em **113580** junto com `getTags`, logo após `SET_TICKET`.

#### Como é aplicado

Dentro de `sendTextMessage`, **antes** de chamar `MessageService.sendTextMessage` (app.js:77254-77300):

1. **77261** — guarda de texto vazio / agente offline;
2. **77267** — `await ChatFeatures.isForbiddenWordsFilterEnabled()`; se `false`, pula direto pro envio;
3. **77273** — `a = this.checkForbiddenWords()`; se vazio, segue;
4. **77277-77289** — se achou: monta a lista entre aspas, dispara **toast `TOAST_ERROR`** (`forbiddenWords.title` / `forbiddenWords.text`), envia o track Segment `desk-forbidden-words-try-send` (constante em 79385) e **`return`** — a mensagem **não é enviada**;
5. **77296** — se `checkForbiddenWords` lançar exceção, registra o erro e **envia mesmo assim** (fail-open).

Respostas diretas: **bloqueia o envio** (não substitui, não mascara — o texto fica intacto no input); **avisa** com toast listando as palavras; **não usa regex de match** — é tokenização + comparação de string.

#### A lógica de comparação — `checkForbiddenWords` (app.js:77434-77455)

Duas passadas:

1. **Frases** — todos os termos da lista que contêm espaço (`w.trim().includes(" ")`) vão para `checkForbiddenPhrases`. Se alguma bater, **retorna só as frases** e nem chega a testar palavras soltas.
2. **Palavras soltas** — o texto é dividido pelo regex `[,\s/.!?;:'"@#$%^&*[\]{}()|` + `=_ˆ]+`, tokens vazios descartados, e cada token comparado contra cada termo da lista:
   - `exactMatch = true` → igualdade estrita `token === termo`;
   - `exactMatch = false` (**default**) → **substring**: `token.includes(termo)`. O termo proibido bloqueia qualquer token que o contenha.

`checkForbiddenPhrases(texto, frases, considerDiacritics)` (**app.js:77427**) normaliza os dois lados e faz `texto.includes(frase)` — **substring pura sobre o texto inteiro**, sem fronteira de palavra, e **ignorando `exactMatch`**. É assimétrico em relação ao caminho de palavras soltas.

#### O bug do `normalizeText` — o filtro é case-sensitive por padrão

`StringUtils.normalizeText(e, lower=true, diacritics=true, collapse=true)` — **app.js:34104-34111**:

```js
var i = e;
return lower       && (i = i.toLocaleLowerCase()),
       diacritics  && (i = e.normalize("NFD").replace(/[̀-ͯ]/g, "")),   // <-- parte de `e`, não de `i`
       collapse    && (i = this.removeAllBreaksLine(i).replace(/\s+/g, " ").trim()),
       i
```

O ramo dos diacríticos parte de **`e` (a string original)**, não de `i` — **descartando o `toLocaleLowerCase()`** aplicado no passo anterior.

Como os callers passam `diacritics = !considerDiacritics` e `considerDiacritics` tem default `false`, o caminho padrão é `diacritics = true` → o lowercase é perdido:

| `considerDiacritics` | comportamento efetivo |
|---|---|
| `false` (**default**) | ignora acento, **respeita maiúsculas** — o filtro fica **case-sensitive**. `PALAVRA` passa se a lista tem `palavra` |
| `true` | ignora maiúsculas, **respeita acento** |

Nunca os dois ao mesmo tempo. Quase certamente não-intencional, e é o motivo mais provável de "a palavra estava na lista e passou mesmo assim".

### 3.5 Encerrar ticket

**O que impede encerrar** — só duas coisas:

1. **Tag obrigatória sem tag escolhida.** `requiredButNoTags` (**app.js:23752-23753**):
   ```js
   return this.hasTags && this.ticket.isTagsRequired && (!this.ticket.tags || 0 === this.ticket.tags.length)
   ```
   com `hasTags` (23749) = `!!ticket && ticket.tagOptions && ticket.tagOptions.length`.
2. **Metadado obrigatório não preenchido.** `isRequiredMetadataFilled` (23785) → getter `blip/metadata/isRequiredMetadataFilled(ownerIdentity, ticketId)`, **app.js:81265**:
   ```js
   if (!TicketFeatures.MetadataFeatureEnabled || !state.isScriptLoaded || !state.metadataFields[key]) return true;   // fail-open
   return fields.filter(f => f.isMandatory).length === fields.filter(f => f.isMandatory && f.isFilled).length
   ```

Aplicado em dois lugares (proteção dupla): o `disabled` do botão (render em **app.js:109606**, `disabled: requiredButNoTags || !isRequiredMetadataFilled`) e o guard do método `closeTicket` (**23790**, guarda em **23797**).

> **Nada mais bloqueia o encerramento.** Não há checagem de status do agente, de janela de 24 h nem de mensagens pendentes.

**Origem das tags obrigatórias:** `OwnerService.getTags(owner)` (21919) lê `lime://<owner>/buckets/blip:desk:tags`; `getTagsConfigs` (22070) normaliza em **22093**: `hasTags || false`, `isTagsRequired || false`, lista vazia se `hasTags` for falso. TTL gravado com `CONFIGURATION_EXPIRATION_TAGS_TIME` (app.js:~27046). Ao aplicar no ticket (**27124**) há um AND extra: `isTagsRequired = u.isTagsRequired && u.tagOptions.length > 0` — **lista de tags vazia anula a obrigatoriedade**.

**Modal:** `close-modal-container`. Seleção de tags por `setTicketSelectedTags` (23855) / `setTicketSelectedTagsFromChip` (23858), resumo do Copilot opcional, botão `#confirm-close-btn`. Se `isSendTicketThreadEmailPermission` (23782), aparece o botão "Enviar e-mail" (`onClickSendEmail`, 23820) que abre `ModalType.EXPORT_TICKET_THREAD_EMAIL` com `isFromCloseTicket: true` (23833); cancelar aquele modal reabre o de encerramento (27418).

**Comandos:** ver §1.2b. As `tags` viajam dentro do `resource` — é por isso que a validação de tag é pré-requisito e não uma etapa separada.

> **`resolveTicket` não existe** com esse nome. O equivalente é `TicketManager.closeModalAndResolveTicket` (**app.js:31908**), que fecha o modal e só dispara `blip/currentTicket/onTicketResolved` **se `ticket.closed` for truthy**.

### 3.6 Transferir ticket

#### Botão no header

Condição repetida em cinco variantes de layout (app.js:91135, 91148, 91315, 91327, 91423):

```js
isNotOfflineAndCloseClientInactivity && isNotOfflineAndClosedClient
&& isTransferTicketEnabled && agentHasTransferPermission
&& !hideElements("transfer-ticket-button")
```

| computed | linha | condição |
|---|---|---|
| `isNotOfflineAndClosedClient` | 101776 | `account.status !== OFFLINE && "ClosedClient" !== ticket.status` |
| `isNotOfflineAndCloseClientInactivity` | 101779 | `account.status !== OFFLINE && "ClosedClientInactivity" !== ticket.status` |
| `agentHasTransferPermission` | 101763 | `getPermissionAtOwner(owner, CAN_ATTENDANT_TRANSFER, true)` — default **true** |
| `isTransferTicketEnabled` | 101768 | `ownerConfiguration(owner, TransferTicketEnabled, true)` — default **true** |

#### Modal de transferência (app.js:31180-31430)

Cadeia de computeds:

```js
canTransfer          = selectedItem && (canTransferToTeams || canTransferAgent)                    // 31192
canTransferAgent     = canTransferDirectly && !isTeam && (canTransferToOffline || ownerTransferWithoutAgents)  // 31195
canTransferDirectly  = ownerTransferDirectly && ownerTransferDistributionType !== "Sql"            // 31198
canTransferToTeams   = (ownerTransferWithoutAgents || canTransferToOffline) && isTeam              // 31201
canTransferToOffline = selectedItem && selectedItem.isActive                                       // 31204
```

Props do owner: `ownerTransferWithoutAgents` (31210, `CanTransferWithoutAgents`, default **false**), `ownerTransferDirectly` (31213, `CanTransferDirectly`, default **false**), `ownerTransferDistributionType` (31216, `DistributionType`, sem default).

> **`DistributionType === "Sql"` proíbe transferência direta para agente**, mesmo com `CanTransferDirectly = true` (app.js:31199, `SQL_DISTRIBUTION` em 1092).

Botão confirmar (render 34360/34371): `disabled: !canTransfer || !isRequiredMetadataFilled`. O método `changeAgent` (**31394**) repete a guarda em **31396**.

**Resumo das condições:**

*Para fila (`isTeam = true`):* item selecionado **E** (`CanTransferWithoutAgents` **OU** a fila tem agente online) **E** metadados obrigatórios preenchidos.

*Para agente direto (`isTeam = false`):* item selecionado **E** `CanTransferDirectly` **E** `DistributionType !== "Sql"` **E** (o agente está `Online` **OU** `CanTransferWithoutAgents`) **E** metadados obrigatórios preenchidos.

#### Quando a fila destino não tem agente online

- Montagem das filas — `getTeamsAndAgentsOnline` (31294), mapeamento em **31300-31313**: `agentsOnline: Boolean(t.agentsOnline)` → `0` vira `false`.
- Montagem dos agentes — `getAgents` (31327): filtro em 31331 remove o próprio agente e os desabilitados (`identity !== me && (isEnabled === undefined || isEnabled === true)`); em 31336, `agentsOnline = (status === AttendantStatus.ONLINE)`.
- Com a fila vazia: `selectedItem.isActive = false` → `canTransferToOffline = false`. Se `CanTransferWithoutAgents = false`, `canTransferToTeams = false` → `canTransfer = false` → **botão desabilitado**, e aparece o tooltip (`shouldDisableTooltip`, 31207) com texto `tooltip.error.teamWithoutOnlineAgents` (fila) ou `tooltip.error.offlineAgents` (agente), via `tooltipText` (31222).
- Com `CanTransferWithoutAgents = true`, a transferência acontece mesmo com a fila vazia.
- Erro ao carregar as filas → `displayError` (31363), toast `toastData.getTeams.*` com callback de reload da rota.

#### Transferência múltipla

> O nome `canMultipleTicketTransfer` é o **valor string** da permissão. A computed no código chama-se **`hasMultipleTicketTransfersPermission`** (app.js:27891-27893):

```js
return this.isMultipleTicketTransfersEnabled && getters["blip/agentPermissions/hasPermissionMultipleTicketTransfer"]
```

- `hasPermissionMultipleTicketTransfer` (26305) = `multipleTicketTransferOwners.length > 0`, populado em 26381 (ver §5.2).
- `isMultipleTicketTransfersEnabled` = feature toggle `enable-multiple-ticket-transfer-access` (**app.js:114740-114750**), default `false`, memoizada; estado local inicial `false` em 27872, resolvido no `created` (27909-27911, `Promise.all` de 7 toggles).
- Uso no render: **app.js:80038** — o item do menu lateral só aparece com a computed verdadeira.

Ou seja: **toggle global de acesso E pelo menos um owner com a permissão**.

### 3.7 Pegar ticket da fila — as guardas em cada camada

Ver §2.2 para a função. As guardas espalhadas:

| Camada | Linha | Condição |
|---|---|---|
| Botão "Atender cliente" | 98450-98456, 98601 | `disabled: !isConnected` — o **único** `disabled` do botão é WebSocket caído. `bds-loading` amarrado a `isClaimingTicket` |
| Renderização do botão | 92990-93001 | só existe dentro do ramo "online" do `service-queue` (`isOnline`/`isPause`/`isInvisible`/`isOffline`, todos `status.toLowerCase() === ...`) |
| Modal de inatividade | 17106-17108 | `ticketsWaiting > 0 && account.status === AttendantStatus.ONLINE` |
| Modal set-offline | 112790-112792 | `!hasNoTicketsWaiting()` |
| Sidenav | 76334-76341 | **sem guarda** — chama direto com `ClaimTicketCaller.Sidenav` |
| Botão principal do service-queue | 93073 | `handleClaimClick` emite `request-scroll-to-new-ticket` e chama `onClaimTicket()` — **sem guarda própria** |
| Throttle | 31930-31935 | 300 ms, leading-only |
| Função | 31830 | `claimable === 0 \|\| waiting === 0 \|\| isClaimingTicket` |

**Estado `waiting` / `claimable`:** inicial `claimable: 0`, `isClaimingTicket: false` (35114-35115). Mutation `SET_WAITING` (**35218-35222**) toca o som se o número **subiu** (`e.waiting < novo && ticketSoundNotification()`) e satura em zero (`novo < 0 ? 0 : novo`). Mutation `SET_DECREASE_WAITING` (35227-35231) decrementa `claimable` **só se o flag vier true**. Origem dos números: `parseInt(resource.waitingTicketsCount)` e `parseInt(resource.waitingClaimableTicketsCount)` em 35685.

**Resumo — o que permite o claim:** WebSocket conectado; agente `Online` (gate implícito pela renderização, explícito nos modais); `waiting > 0` **e** `claimable > 0`; nenhum claim em voo; fora da janela de 300 ms do throttle.

---

## 4. `OwnerProps` — as configurações do bot

O objeto está em **app.js:28138-28188** (módulo `"DRzp"`). São **49 chaves**, não 32 — as 32 que você já tinha mais as de chamadas, Copilot, extensões, standby e verificação de arquivo.

### 4.1 De onde vêm os valores

Action `blip/owners/loadOwnerConfiguration`, **app.js:26967-27020**:

| Etapa | Linha | O que faz |
|---|---|---|
| Cache | 26975-26980 | se `state.owners[ownerIdentity].expireDate > agora`, aborta. TTL = `AppSettings.CONFIGURATION_EXPIRATION_TIME` (30 min) |
| Fonte | 26986 → `OwnerService.getDeskOwnerConfiguration` (app.js:22011-22035) | `GET postmaster@{MSG_DOMAIN}` uri `lime://{ownerIdentity}/configuration/caller?owner=postmaster@{DESK_DOMAIN}`; filtra os itens cujo `owner === "postmaster@"+DESK_DOMAIN`. Retorna lista de `{name, value}` — **tudo string** |
| Coerção | 26989-26996 | `"true"`→`true`, `"false"`→`false`; qualquer outra coisa **continua string** |
| Loop | **26997** `for (u in b.OwnerProps) d(u)` | itera as **CHAVES** do objeto, não os valores |
| Derivadas | 26998-27010 | ver abaixo |
| Persistência | 27010 | mutation `SET_OWNER_CONFIGURATION` (26845) faz merge em `state.owners[ownerIdentity]` |

> **Armadilha do loop:** como o `for..in` percorre chaves, nas duas entradas em que chave ≠ valor (`HasCieloValidConfigurations` → `"DeskSellCieloValidConfigurations"` e `HasOpenFinanceValidConfigurations` → `"DeskSellOpenFinanceValidConfigurations"`) o valor cru vindo do servidor é gravado sob a chave errada e **nunca é lido**. Só a derivada calculada localmente vale.

> **Armadilha do tipo:** números chegam como **string** e só viram número onde o código faz `Number(...)` explícito. `"true"`/`"false"` são os únicos casos coagidos automaticamente.

**As cinco derivadas calculadas no cliente:**

| Derivada | Linha | Como é calculada |
|---|---|---|
| `HasCieloValidConfigurations` | 26998 | `DeskSellPaymentEnabled && CieloPaymentClientId && CieloPaymentClientId !== ""` |
| `HasOpenFinanceValidConfigurations` | 26998 | idem com `OpenFinancePaymentClientId` |
| `CanRequestCopilot` | 27000, via `OwnerService.getBuckets` (21949-21975) | `GET postmaster@msging.net` uri `lime://{owner}/buckets`; verdadeiro se a lista contém **ambos** `blip_ai_suite:access_token` e `blip_ai_suite:client_credentials` |
| `Cluster` | 27008, via `TenantService.getTenantClusterName` (72750→72768) | `GET postmaster@{PORTAL_DOMAIN}` uri `/applications/{owner}/tenant`, campo `clusterName`; fallback `AppSettings.DEFAULT_CLUSTER_NAME` |
| `ExportTicketThreadEmail` | 27010, via `getExportTicketThreadEmailConfigs` (22147-22185) | lê o bucket `lime://{owner}/buckets/blip:desk:export-ticket-thread-email`, `JSON.parse`, monta `{domains[], emails[], exportTicketEmail, allowDomains, copyEmails}` — **é objeto, não bool** |

**Leitura**: getter `blip/owners/ownerConfiguration(ownerIdentity, prop, default)` (app.js:26798-26806) — devolve o default se o owner não estiver em cache ou se a prop for `undefined`. Helpers locais: `getConfig(prop)` (21080, sem default) e `getDeskConfiguration(prop, default)` (24610 / 76981 / 95714 / 100339).

### 4.2 Tabela completa

| Chave | Tipo | Default no código | O que controla | Linha app.js |
|---|---|---|---|---|
| `AgentSlots` | número | — | **só declarada, sem uso encontrado no front-end.** O limite existe, mas é aplicado 100% no servidor (ver §2.3) | 28139 |
| `TransferTicketEnabled` | bool | **`true`** | Mostra/oculta o botão de transferir (`isTransferTicketEnabled`); no boot filtra os owners elegíveis a transferência múltipla | 101769, 26381 |
| `CanTransferWithoutAgents` | bool | `false` | Permite transferir para time/agente **sem agente online** (`canTransferAgent`, `canTransferToTeams`, tooltip de erro) | 31211 (usos 31196, 31203, 31207) |
| `CanTransferDirectly` | bool | `false` | Habilita transferência direta para um agente específico — **só vale se `DistributionType !== "Sql"`** | 31214 (uso 31199) |
| `CanSendAttachment` | bool | **`true`** | Botão de anexo e o drag-and-drop de arquivo na janela do chat | 76611, 100137 (usos 16616, 16627, 100179) |
| `UseAuthenticatedMedia` | bool | `false` | `MediaHandler.isAuthenticatedMedia` — upload/fetch de mídia com token (`authorizationRealm: "blip"`), cruzado com `CHANNELS_SUPPORT_AUTHENTICATED_MEDIA` | 90336 |
| `CanSendEmojis` | bool | **`true`** | Renderiza o `emoji-picker` no input | 76617 (uso 16661) |
| `AgentMaxResponseDelay` | número (s) | sem default | Intervalo do alerta de demora do agente; vira `{interval, count}` e alimenta o timer de 1 s que marca o ticket como atrasado | 20866 (usos 20974-20982) |
| `AgentInactivityAlertCount` | número | **`1`** (`t ? Number(t) : 1`) | Quantos alertas até parar; 3 → severidade máxima, 2 e 1 → "warning" | 20864 (usos 20914-20918) |
| `CustomerMaxResponseDelay` | número (s) | sem default | Limite **crítico** de resposta do cliente → `CustomerResponseDelay.CRITICAL` | 20879 (uso 20986) |
| `CustomerWarningResponseDelay` | número (s) | sem default | Limite de **aviso** → `CustomerResponseDelay.WARNING` | 20885 (uso 20986) |
| `DistributionType` | texto | sem default | `"Orleans"` / `"Redis"` / `"Sql"`. Se `"Sql"`, desliga a transferência direta para agente | 31217 (enum 1090-1092, uso 31199) |
| `ShouldShowOnlyCurrentTicketMessages` | bool | sem default | Filtra o histórico para esconder mensagens de tickets de **outros times**: busca os tickets do cliente e remove mensagens caídas dentro das janelas desses tickets | 88585, 115344 (filtro 115346-115352) |
| `CanSendAudioRecording` | bool | `false` | Prop `canSendAudioRecording` → botão de gravar áudio | 76649 (uso 16708) |
| `AgentResponseDelayEnabled` | bool | **ausente = ligado** (`e && Boolean(e) \|\| void 0 === e`) | Liga o cálculo de `AgentMaxResponseDelay` | 20863 |
| `CustomerResponseDelayEnabled` | bool | **ausente = ligado** | Idem para os dois limites do cliente | 20874 |
| `HideImageFileNameFromMessages` | bool | `false` na lista, sem default no upload | Zera `content.title` de imagens (e de vídeos no upload) para não exibir o nome do arquivo | 24552, 115168 |
| `ActiveMessageEnabled` | bool | `false` | Três usos: filtra `ownerList` da tela de mensagem ativa (2264); compõe `activeMessageOwners` junto com a permissão `SEND_ACTIVE_MESSAGE` (26381); libera o fluxo "precisa mandar template" quando a janela de 24 h do WhatsApp expirou (76620→76638) | 2264, 26381, 76620 |
| `ActiveMessageCanSendWithOpenTicket` | bool | — | **só declarada, sem uso encontrado** | 28157 |
| `ActiveMessageLimitEnabled` | bool | `false` | Se **true**, o Desk **não** busca/exibe mensagens agendadas para o destinatário (`getScheduledMessagesToRecipientAsync` é pulado) | 35953 |
| `ActiveMessageLimitCount` | número | — | **só declarada, sem uso encontrado** | 28159 |
| `ActiveMessageLimitBatchDispatch` | número/bool | — | **só declarada, sem uso encontrado** | 28160 |
| `RouterIdentityActiveCampaign` | texto (identity) | — | Não é lida via `OwnerProps`; vem direto do objeto de configuração em `templateOwnerAdvancedConfigs` → vira `masterState` da campanha de mensagem ativa. O getter não tem consumidor no bundle | 2237 (decl. 28161) |
| `WaitingTicketsCountHiddenness` | bool | — | Getter `hideCountTicketWaiting`: se **qualquer** owner tiver true, esconde o contador de tickets aguardando no header | 26808 (getter 26804, consumo 92981) |
| `ManualDistributionEnabled` | bool | **`true`** | Ao receber ticket, define se o contador de *claimable* também decrementa (`SET_DECREASE_WAITING`) | 111705 (mutation 35224) |
| `ActiveMessageContactFieldsSearch` | lista/texto | — | **só declarada, sem uso encontrado** | 28164 |
| `ActiveMessageSearchSource` | texto | — | **só declarada, sem uso encontrado** | 28165 |
| `DeskSellPaymentEnabled` | bool | `false` | `isDeskSellEnabled` — exibe a opção Desk Sell no menu do ticket; pré-requisito das duas derivadas de pagamento | 98943, 26998 |
| `CieloPaymentClientId` | texto | — | Só na derivação de `HasCieloValidConfigurations` | 26998 |
| `OpenFinancePaymentClientId` | texto | — | Idem para OpenFinance | 26998 |
| `HasCieloValidConfigurations` (valor real `"DeskSellCieloValidConfigurations"`) | bool derivada | `false` | `hasCieloProblem` / `hasCieloValidConfigurationForDeskSell` — se falso, o formulário de link de pagamento Cielo mostra o alerta de config inválida | 26998, 13236, 30978 |
| `HasOpenFinanceValidConfigurations` (valor real `"DeskSellOpenFinanceValidConfigurations"`) | bool derivada | `false` | `hasOpenFinanceProblem` — mesmo comportamento no fluxo OpenFinance | 26998, 29168, 30978 |
| `CallsVideoEnabled` | bool | `false` | `isVideoCallsEnabled` — chamada de vídeo, **E** permissão `CAN_CALLS_VIDEO` | 80418 |
| `CallsVoiceOutboundEnabled` | bool | `false` | `isOutboundCallsEnabled` — ligação ativa; exige canal **whatsapp** + `CAN_CALLS_VOICE_OUTBOUND` | 80413 |
| `CallsVoiceInboundEnabled` | bool | `false` | `isInboundCallsEnabled` — ligação receptiva; exige canal **whatsapp** + `CAN_CALLS_VOICE_INBOUND` | 80408 |
| `CanRequestCopilot` | bool derivada (buckets) | `false` | Gate de credenciais do Blip AI Suite. Com `CareCopilotEnabled` + `CAN_CARE_COPILOT_SUMMARY` libera o resumo do ticket por IA | 27000, 23771, 24233, 31226 |
| `CareCopilotEnabled` | bool | `false` | Chave-mestra do Copilot no owner: resumo, sugestões de resposta, transcrição, análise | 23772, 24225, 26831, 31227, 75427, 76662, 82669 |
| `CopilotTicketAnalysisEnabled` | bool | `false` | Score/análise do ticket por IA. Em 26381 filtra owners com `CAN_CARE_COPILOT_SCORE` → `SET_DESK_SCORE_PERMISSION`; em 26831 compõe `hasCopilotTicketAnalysisEnabledOnAtLeastOneOwner` (exige também `TenantBotBlipCopilotEnabled && CareCopilotEnabled`) | 26381, 26831 |
| `HistoryEnabled` | bool | `false` | Com `CAN_ACCESS_CONTACT_HISTORY`, libera o item "histórico do contato" no menu lateral (basta 1 owner com true) | 27898 |
| `Extensions` | texto **JSON** parseado | `false` | `JSON.parse` → pares chave/valor que viram extensões da sidebar (`loadAllExtensions`) e do ticket (`loadTicketExtensions`); erro de parse cai em `console.warn("Error parsing extensions")` | 80260, 80295 |
| `Cluster` | texto derivada | `AppSettings.DEFAULT_CLUSTER_NAME` | Só telemetria: `ticketCluster` no Segment (79247), `clusterName` nas props do Copilot (85641) e no payload de eventos (13977) | 27008 |
| `TenantBotBlipCopilotEnabled` | bool | `false` | Flag do **tenant** para o Copilot; sempre combinada com `CareCopilotEnabled` (`isCopilotEnabled`) e com `CAN_CARE_COPILOT_SPEECH` para transcrição | 24222, 26831, 75424, 76671, 82669 |
| `AddPlusSignOnActiveMessage` | bool | `false` | Prefixa `+` no telefone do destinatário ao disparar mensagem ativa | 15368 |
| `BlockAwayAgentDeskUsage` | bool | — | Getter `blockAwayAgentUsage`: se qualquer owner tiver true, força o agente para `Online` ao abrir/retomar (12925) e marca `SET_SYSTEM_BLOCKED` quando o status não é `Online` — bloqueia usar o Desk em pausa/ausente | 26814 (getter 26811, consumos 12925, 112298) |
| `AIAgentIdentity` | texto (identity) | — | **só declarada, sem uso encontrado** | 28183 |
| `ExportTicketThreadEmail` | **objeto** | `false` na leitura | `{domains[], emails[], exportTicketEmail, allowDomains, copyEmails}`. `exportTicketEmail` é o liga/desliga real (23780→23786, junto com `CAN_EXPORT_TICKET_THREAD_EMAIL`); o modal usa `domains`/`emails`/`allowDomains` para validar destinatários | 27010, 23780, 27405, 33646 |
| `TicketStandbyModeEnabled` | bool | `false` | Getter `hasStandByModeEnabled` mostra o chip de filtro "Em espera" (14585); `isStandByModeVisible` mostra a opção no menu do ticket, junto com `CAN_PUT_TICKET_ON_STANDBY` | 26792, 85979 |
| `UseFileTypeVerificationForTransit` | bool | `false` | Liga a checagem de MIME em trânsito. Ligado + allowlist: mensagem com `content.type` fora da lista tem o `type` **zerado** (`t.type = ""`) e o card não renderiza | 24169 (efeito 24184), 95721 |
| `UseFileTypeVerificationForTransitAllowedList` | **lista** de MIME | `false` | A allowlist consultada acima; sem ela a verificação não age | 24172 (efeito 24184), 95724 |

### 4.3 Resumo das armadilhas de configuração

- **8 chaves são só declaradas**, sem nenhum consumidor no front-end: `AgentSlots`, `ActiveMessageCanSendWithOpenTicket`, `ActiveMessageLimitCount`, `ActiveMessageLimitBatchDispatch`, `ActiveMessageContactFieldsSearch`, `ActiveMessageSearchSource`, `AIAgentIdentity` — e `RouterIdentityActiveCampaign` só é lida por um getter sem consumidor. Elas são configuração do **servidor**, apenas espelhada no objeto do cliente.
- **Defaults `true`** (ausência da config **libera**): `CanSendAttachment`, `CanSendEmojis`, `TransferTicketEnabled` (no botão), `ManualDistributionEnabled`. `AgentResponseDelayEnabled` e `CustomerResponseDelayEnabled` também tratam `undefined` como ligado. **Todo o resto usa default `false`.**
- `HasCieloValidConfigurations` e `HasOpenFinanceValidConfigurations` têm **nome de chave diferente do valor** — quem for reimplementar precisa gravar sob o nome `DeskSell*ValidConfigurations`.

---

## 5. `AgentPermissionType` — as 17 permissões do agente

Módulo `"11U8"`, objeto literal em **app.js:3829** (bloco 3819-3831). São exatamente **17 membros** — os 17 que você listou, nenhum a mais.

> **Duas constantes têm nome interno que não bate com o valor string:**
> `CAN_EXPORT_TICKET_THREAD_EMAIL` → `"canSendTicketThreadEmail"`
> `CAN_ATTENDANT_MULTIPLE_TRANSFER` → `"canMultipleTicketTransfer"`

| Constante interna | Valor string | O que libera | Onde é verificada (linha app.js) |
|---|---|---|---|
| `SEND_ACTIVE_MESSAGE` | `canSendActiveMessage` | Menu/aba "Mensagens ativas" e a lista de bots habilitados para disparo. Alimenta `activeMessageOwners` + `havePermissionToSendActiveMessage` | 26381 (helper), 26411 (`hasPermissionAtOwnerToSendActiveMessage`); consumos em 2193, 2305, 2468, 15355, 35953, 76323-76327, 92962-92984 |
| `EDIT_CONTACT` | `canEditContact` | Botão/painel de editar contato no card do ticket (`agentHasPermissionToEditContact`, exibido só se não for o app mobile) | 2905-2906 (`checkEditContactPermission`); usos 2837, 2889 |
| `VIEW_AND_CREATE_PAYMENT_LINK` | `canViewAndCreatePaymentLink` | Aba "Pagamento" no painel de dados do contato / criação de link de pagamento (Desk Sell) | 98884-98886 (`checkPaymentPermission`); usos 98831, 98967 |
| `CAN_ATTENDANT_TRANSFER` | `canAttendantTransfer` | Botão de transferir ticket no header do chat. **Default `true`** | 101765-101767 (`agentHasTransferPermission`); `templates/pane-chat-header.js:182,195,362,374,470` |
| `CAN_CALLS_VIDEO` | `canCallsVideo` | Botão de chamada de vídeo (`blip/calls/isVideoCallsEnabled`), com `OwnerProps.CallsVideoEnabled` | 80418 |
| `CAN_CALLS_VOICE_OUTBOUND` | `canCallsVoiceOutbound` | Ligação de voz WhatsApp de saída, com `OwnerProps.CallsVoiceOutboundEnabled`; só canal whatsapp | 80413 |
| `CAN_CALLS_VOICE_INBOUND` | `canCallsVoiceInbound` | Recebimento de ligação de voz WhatsApp, com `OwnerProps.CallsVoiceInboundEnabled` | 80408 |
| `CAN_CARE_COPILOT_SUMMARY` | `canCareCopilotSummary` | Componente `ChatSummary` (resumo do atendimento). Exige também `CareCopilotEnabled` **E** `CanRequestCopilot` | 23773, 24233, 31228 (`ticketSummaryCareCopilotEnable`); render 34322, 109535 |
| `CAN_CARE_COPILOT_SUGGESTIONS` | `canCareCopilotSuggestions` | Assistente de texto / sugestões de resposta no compositor (borda "copilot-border") | 75430, 76665; usos 75415, 76677, 101197 |
| `CAN_CARE_COPILOT_SPEECH` | `canCareCopilotSpeech` | Transcrição de áudio (`transcriptionEnabled`), com `CareCopilotEnabled` + `TenantBotBlipCopilotEnabled` | 24233, 82669 (`getCopilotOwnerConfig`); usos 24219, 82664 |
| `CAN_CARE_COPILOT_SCORE` | `canCareCopilotScore` | Desk Score / análise de ticket. Vira `hasDeskScorePermission` (pareado com `CopilotTicketAnalysisEnabled`) | 26381 → `SET_DESK_SCORE_PERMISSION` (26356). O getter `hasDeskScorePermission` (26311) **não tem consumidor dentro do bundle** — provavelmente lido por MFE/extensão |
| `CAN_ACCESS_CONTACT_HISTORY` | `canAccessContactHistory` | Item "Histórico de contatos" na navbar. Usa `getOwnersPermissionIsActive` e cruza com `OwnerProps.HistoryEnabled` de cada owner | 27897; `templates/navbar.js:77` |
| `CAN_CREATE_AND_EDIT_CUSTOM_REPLIES` | `canCreateAndEditCustomReplies` | Respostas rápidas próprias do agente: mescla `agentReplies` na lista e habilita `canManageReplies` | 26837 (`repliesOptionByOwner`), 27163 (`loadRepliesOption`), 76668; uso 77050 |
| `CAN_EXPORT_TICKET_THREAD_EMAIL` | `canSendTicketThreadEmail` | Opção "Exportar histórico por e-mail" no menu do pane-chat. Exige também `OwnerProps.ExportTicketThreadEmail.exportTicketEmail` | 23777, 33643; usos 23783, 33630 |
| `CAN_ATTENDANT_MULTIPLE_TRANSFER` | `canMultipleTicketTransfer` | Item "Ações em massa" (transferência múltipla) na navbar. Vira `multipleTicketTransferOwners` | 26381 (com default `true`) → `hasPermissionMultipleTicketTransfer` (26305); uso 27892; `templates/navbar.js:100` |
| `CAN_PUT_TICKET_ON_STANDBY` | `canPutTicketOnStandbyMode` | Ação "Modo de Espera" no menu do ticket. Só aparece se `OwnerProps.TicketStandbyModeEnabled` também estiver ligado | 85982 (`canPutTicketOnStandByMode`); `templates/ticket-menu.js:71` |
| `CAN_CREATE_FOLDERS` | `canCreateFolders` | Pastas na lista de tickets: barra de filtros, botão de criar, `folder-list`, drag&drop de ticket para pasta | 26381 → `hasPermissionCreateFolder` (26308); usos 14524, 14534, 14543, 14587, 14814, 14834; `templates/chat-list.html:8,51` e `chat-list.js:45,403,493,499,520,527,533,554,570` |

### 5.1 Módulo Vuex `blip/agentPermissions`

Módulo `"CBp9"`, **app.js:26253-26428**, `namespaced: true`.

**State** (26286-26293): `permissions: []` (formato `[{ OwnerIdentity, Permissions: [{Name, IsActive}] }]`), `activeMessageOwners: []`, `multipleTicketTransferOwners: []`, `havePermissionToSendActiveMessage: false`, `hasDeskScorePermission: false`, `createFolderOwners: []`.

**Getters**:

| Getter | Linha | Retorno |
|---|---|---|
| `havePermissionToSendActiveMessage` | 26296 | bool |
| `getActiveMessageOwners` | 26299 | array de `ownerIdentity` |
| `getMultipleTicketTransferOwners` | 26302 | array de `ownerIdentity` |
| `hasPermissionMultipleTicketTransfer` | 26305 | `multipleTicketTransferOwners.length > 0` |
| `hasPermissionCreateFolder` | 26308 | `createFolderOwners.length > 0` |
| `hasDeskScorePermission` | 26311 | bool |
| `getPermissionAtOwner(ownerIdentity, permissionName, defaultValue)` | 26314 | acha o owner, acha a permissão por `Name`, devolve `IsActive`; devolve `defaultValue` se owner ou permissão não existirem. **`defaultValue` é `false` por omissão** |
| `getOwnersPermissionIsActive(permissionName)` | 26330 | array de `ownerIdentity` onde aquela permissão está `IsActive` (o 2º argumento passado nos call sites é ignorado) |

**Mutations** (26343-26362): `SET_ATTENDANT_PERMISSIONS`, `SET_ACTIVE_MESSAGE_PERMISSION`, `SET_ACTIVE_MESSAGE_OWNERS`, `SET_MULTIPLE_TICKET_TRANSFER_OWNERS`, `SET_DESK_SCORE_PERMISSION`, `SET_CREATE_FOLDER_OWNERS`.

**Actions**:
- `loadPermissions` (26364) — **idempotente e sem force-refresh**: se `state.permissions.length > 0`, retorna sem fazer nada. Só um reload da página recarrega permissões.
- `hasPermissionAtOwnerToSendActiveMessage(ownerIdentity)` (26397).
- `setActiveMessageSenderPermission(bool)` (26419).

**Comando LIME** (`AgentPermissionService.getAgentPermissions`, app.js:27770-27800):
```
GET  postmaster@<DESK_DOMAIN>
uri   /agent/permissions/all
```
Resposta: `resource.items` = lista por owner. Helper exportado `hasAgentPermission(perm, name)` (26281): `perm.Name === name && perm.IsActive`.

### 5.2 O helper que casa `OwnerProps` com `AgentPermissionType`

**app.js:26262-26269**:

```js
function i(permissions, ownerProp, permissionType) {
    var def = arguments.length > 3 && void 0 !== arguments[3] && arguments[3];  // 4º arg, default false
    return permissions.reduce(function (acc, item) {
        return getters["blip/owners/ownerConfiguration"](item.OwnerIdentity, ownerProp, def)
            && item.Permissions.some(function (p) { return hasAgentPermission(p, permissionType) })
            && acc.push(item.OwnerIdentity), acc
    }, [])
}
```

É um **AND de dois lados**: a configuração do bot **E** a permissão do agente. Devolve a lista de `ownerIdentity` onde ambos valem.

**O 4º argumento é o default do `ownerConfiguration`** — o que assumir quando aquele owner não tem a propriedade configurada. `false` (omitido) = fail-closed; `true` = fail-open, e a decisão fica só com a permissão do agente.

As quatro chamadas em **app.js:26381**:

| Resultado | OwnerProp | AgentPermissionType | 4º arg | Efeito |
|---|---|---|---|---|
| `activeMessageOwners` | `ActiveMessageEnabled` | `SEND_ACTIVE_MESSAGE` | (`false`) | fail-closed |
| `multipleTicketTransferOwners` | `TransferTicketEnabled` | `CAN_ATTENDANT_MULTIPLE_TRANSFER` | `true` | fail-open: transferência assumida ligada se o bot não disser o contrário |
| `hasDeskScorePermission` | `CopilotTicketAnalysisEnabled` | `CAN_CARE_COPILOT_SCORE` | (`false`) | fail-closed |
| `createFolderOwners` | **`"default"`** (string literal, não é uma `OwnerProps`) | `CAN_CREATE_FOLDERS` | `true` | `owners[id]["default"]` é sempre `undefined` → devolve `true` → **o lado do owner é neutralizado**, sobra só a permissão do agente |

Ou seja: pastas na lista de tickets **não têm chave de configuração de bot**; dependem exclusivamente de `canCreateFolders` no agente.

---

## 6. Modo Standby e pastas de ticket

### 6.1 Modo Standby ("Modo de Espera")

**O que é, tecnicamente:** é uma **pausa do timer de inatividade do ticket**. Os comandos LIME são literalmente `pause-inactivity` / `resume-inactivity` (app.js:111988 e 112021). Não existe nada no bundle que devolva o ticket à fila nem que libere o slot do agente.

- O ticket **continua na lista do agente** e continua contando em `rawTicketCount`/`ticketsCount` (app.js:14556-14582). O único efeito na contagem é aparecer também no chip "Em espera".
- Enquanto em standby, os alertas de demora do agente ficam **suprimidos**: `agentResponseDelayed` só vale se `standbyModeStart === undefined` (app.js:20812, 20971, 20982).
- **O cliente (contato) não recebe nada** pelo front-end — nenhum envio de mensagem, chatstate ou notificação aparece no fluxo. O efeito para o cliente é indireto: a conversa não é encerrada por inatividade.

| Ação | Onde | Comando |
|---|---|---|
| Ativar | `TicketService.SetStandbyTicket` (app.js:111975) | `SET postmaster@{DESK_DOMAIN}` uri `/tickets/{ticketId}/pause-inactivity`, type `application/vnd.iris.ticket+json`, resource `{id}` |
| Desativar | `TicketService.UnsetStandbyTicket` (app.js:112009) | `SET postmaster@{DESK_DOMAIN}` uri `/tickets/{ticketId}/resume-inactivity`, mesmo type/resource |

`reason.code === 21` é engolido em silêncio nos dois métodos.

**Cadeia UI → Vuex:** menu do ticket → `onMenuClick` → `TicketMenuOptions.SET_STANDBY` / `UNSET_STANDBY` (21239) → `onClickSetStandbyTicket` (21133) / `onClickUnsetStandbyTicket` (21153) → `OperateStandBy(bool)` (21173). Actions `blip/tickets/setStandbyTicket` (36286) e `unsetStandbyTicket` (36305), repassando para `blip/currentTicket/setStandby`/`unsetStandby` se for o ticket aberto. Mutations: `SET_SETSTANDBY_TICKET` grava `standbyModeStart: (new Date).toString()` (35394-35400); `SET_UNSETSTANDBY_TICKET` põe `undefined` (35401). Tracks: `desk-ticket-standby-mode-enabled` / `-disabled` (21205, 76835).

**Saída forçada pelo gestor:** notificação LIME com id no formato `{ticketId}:ManagerRemoveStandby` (app.js:34646) → `unsetStandbyTicket` com `isRemovedByManager: true` → toast `standbyMode.removedByManager` (36318-36327).

**Condições — todas precisam bater:**
1. `OwnerProps.TicketStandbyModeEnabled` no owner do ticket (checagem por owner em 85979; o getter global `hasStandByModeEnabled` em 26789 só decide se o chip de filtro aparece, e basta 1 owner).
2. Permissão `CAN_PUT_TICKET_ON_STANDBY` (`canPutTicketOnStandbyMode`), lida em 85981.
3. **`!isNew`** — é preciso **ter enviado a primeira mensagem**. Tooltip: `setStandbyMode.disabled.firstMessage` = "Você precisa enviar a primeira mensagem antes de colocar o ticket em espera". Sem permissão: `setStandbyMode.disabled.permission` (i18n em 114488).
4. Guardas de idempotência: o set retorna cedo se já há `standbyModeStart`; o unset retorna cedo se não há (21139, 21159).

**O que muda na tela:**
- **Item da lista** (`templates/chat-list-item.html:32`, render em 99283): aparece `<standby-timer>` — um `bds-chip-tag icon="pause" color="warning"` com cronômetro **crescente** (componente em 82066-82098, `setInterval` de 1 s somando desde `standbyModeStart`, formatado por `TimeFormatter.getTimerFormatted`).
- **Input bloqueado**: `isTicketInStandBy` (16323, computed em 76593) troca o compositor por um `bds-paper` com o texto `standbyInputLock.description` = "Retire o cliente do **Modo de espera** clicando no botão abaixo." + botão "Remover do Modo de Espera" → `resumeStandBy` (76806-76860), com loading `isResumingStandBy`.
- **Chip de filtro** "Em espera ({count})" (`templates/chat-list.html:37`, id `standby-tickets-chip`, constante `STANDBY_TICKETS_FILTER_ID` em 33413; track `desk-filter-standby-tickets` em 33418). Filtro: `!closed && standbyModeStart !== undefined` (14796, 35161, 71713).
- **Menu do ticket** (21669-21703): opção única que alterna entre `setStandbyMode` (ícone `pause`) e `unsetStandbyMode` (ícone `undo`) — `getStandByMenu` em 85997.

> **Não existe timeout automático de saída do standby no front-end.** Busca por `MaxStandby`, `standbyTimeout`, `StandbyTimeout`, `maxStandby`: zero ocorrências. O único caminho de saída não iniciado pelo agente é a notificação `ManagerRemoveStandby` vinda do servidor. Qualquer expiração é decisão server-side, invisível ao bundle.

### 6.2 Pastas de ticket (ticket folders)

**Natureza:** são **pessoais do agente**, não compartilhadas. O MIME é `application/vnd.iris.desk.ticket-agent-folder+json` (app.js:99453) e o `GET /ticket-folder` **não recebe owner nem agente** — o servidor resolve pelo remetente do comando. Não é bucket LIME; é recurso próprio do Desk em `postmaster@{DESK_DOMAIN}`.

Estado local no módulo Vuex `blip/ticketFolders` (app.js:71682-71890): `data[] = {folderId, name, color, count, position}`. No ticket fica só `folderId` (mutation `SET_TICKET_FOLDER`, app.js:35422).

**Comandos LIME** (`FolderService`, app.js:99435-99600):

| Operação | Método | URI | Type / resource |
|---|---|---|---|
| Criar | SET | `/ticket-folder` | `ticket-agent-folder+json`, `{name, color}` |
| Listar | GET | `/ticket-folder` | — (devolve `resource.items`) |
| Renomear / recolorir | MERGE | `/ticket-folder/{folderId}` | `ticket-agent-folder+json`, `{name, color, position}` |
| Apagar | DELETE | `/ticket-folder/{folderId}` | — |
| Reordenar | MERGE | `/ticket-folder-positions` | `application/vnd.iris.ticket-folder-positions+json`, `{folders:[{folderId, position}]}` |
| Mover ticket(s) | MERGE | `/tickets-folder-move` | `application/vnd.iris.ticket-folder-move+json`, `{folderId, ticketsId:[...]}` — `TicketService.setTicketFolder` (app.js:112043) |

Tirar da pasta = `setTicketFolder([ticketId], null)`.

**Actions Vuex:** `blip/ticketFolders/fetchFolders` (71805, chamada no boot em 77739), `updateFolder`, `removeFolder`, `setFolders`, `reorderFolders` (71852, drag&drop com `dropPosition: before|after`); `blip/tickets/setTicketFolder` (36336) e `blip/currentTicket/setFolder` (114188). Getters: `getFolderTickets(folderId, activeFilter)` (71689 — aplica o mesmo filtro all/unread/inactive/standby dentro da pasta e mantém fixados no topo), `getTicketsWithoutFolder` (71729), `getExistingFolders` (71682, usado para bloquear nome duplicado).

**Fluxos de tela:** criar/editar por `ModalType.CREATE_FOLDER = "create-folder-modal"` (36769), aberto por `openCreateFolderModal` (74551); mover por submenu "Mover para" no menu do ticket (render 21634-21650, `onFolderSelected` em 85951) **ou** drag&drop do ticket sobre a pasta (`onTicketDrop`, 74572). Templates: `folder-list.html`, `folder-list-item.html`, `folder-info-options.html`, `folder-submenu-container.html`, `create-folder-modal.html`.

**Apagar pasta não fecha ticket nenhum:** antes do DELETE, todos os tickets da pasta são movidos para `folderId: null` (app.js:23005-23023).

**Limites:**
- **Máximo 10 pastas** — hard-coded: `if ((ticketFolders.data||[]).length >= 10) return toast(...)` (app.js:74553). Mensagem: "O Desk permite até 10 pastas. Exclua ou reorganize pastas para criar uma nova." (i18n 3231).
- **Nome: 50 caracteres** — `maxlength="50" counterlenght="true"` em `bds-input#folder-name` (`templates/create-folder-modal.html:8`). Não pode ser vazio nem duplicado (case-insensitive) — `canCreate` / `isDuplicateName` (20542-20558).
- **Cores: paleta fixa de 8** (20517-20540): `#141414`, `#1968F0`, `#35DE90`, `#FBCF23`, `#F06305`, `#FB4BC1`, `#E60F0F`, `#00C6D7`.
- **Não há limite de tickets por pasta.** Um ticket tem no máximo uma pasta (`folderId` é escalar).

**Permissão:** `CAN_CREATE_FOLDERS`. Como visto em §5.2, o helper passa a string literal `"default"` no lugar de uma `OwnerProps`, com fallback `true` — **não existe flag de bot dedicada a pastas**. Basta a permissão do agente estar ativa em pelo menos um owner. Nos componentes a prop chega como `agentTicketFoldersEnabled` (85879, 110348).

**Afeta fila ou distribuição?** **Não. É puramente visual.** Nenhum comando de pasta toca roteamento, fila ou status. O único efeito colateral é de renderização: `pinnedTickets`/`notPinnedTickets` da lista principal passam a **excluir** tickets já alocados em alguma pasta existente (14562-14580), que são renderizados dentro do `folder-list-item`. Há integração com um MFE de Kanban: `parent.postMessage({type:"kanban", value:"folder-update"}, "*")` (20605). Tracks: `desk-folder-create`, `desk-folder-delete`, `desk-folder-ticket-move`, `desk-folder-ticket-move-drag-and-drop`, `desk-kanban-folder-created` (79407-79414).

---

## 7. O que NÃO foi encontrado

Procurado no bundle inteiro e ausente. Registrado aqui para ninguém refazer a busca.

| Procurado | Situação |
|---|---|
| Tabela de transições de `TicketStatusEnum` | **Não existe no cliente.** O Desk dispara três comandos (`change-status`, `close`, `transfer`) e reage ao evento de volta. A máquina é do servidor. |
| Enum de **prioridade** de ticket | Nenhuma ocorrência. |
| Enum de **status de entrega** separado | Não existe um terceiro. Quem faz o papel são `MessageStatus` (na bolha) e `NotificationEvents` (no protocolo) — mesmos cinco valores, capitalização diferente. |
| Enum de **direção** de mensagem | Não há enum. O campo cru usa as strings `"sent"` / `"received"` (app.js:111627). O que existe é `MessagePosition` (`right`/`left`), que é posição na tela. |
| Validação client-side de `AgentSlots` | A chave existe (app.js:28139) e **nunca é lida**. O limite só chega como `reason.code 23` com description `"Agent ticket list is full."` |
| Regra de elegibilidade "ticket X pode ir para agente Y" | Não existe. `isTicketAvailableForUser` é só comparação de e-mail para travar o compositor (§2.1). |
| Limite de tamanho do texto da mensagem | Nenhum `maxlength` nem checagem de `length` no compositor de chat. |
| Timeout automático de saída do standby | Zero ocorrências de `MaxStandby`, `standbyTimeout`, `StandbyTimeout`, `maxStandby`. Única saída não iniciada pelo agente é a notificação `{ticketId}:ManagerRemoveStandby` do servidor. |
| Aviso ao **cliente** ao entrar/sair do standby | Nenhum envio de mensagem, chatstate ou notificação ao contato no fluxo de standby. |
| Limite de tickets por pasta | Não existe. Só o limite de 10 pastas e 50 caracteres de nome. |
| Compartilhamento de pastas entre agentes | Nada sugere isso; o MIME é `ticket-agent-folder`. |
| `OwnerProps` dedicada a pastas | Não existe — o helper passa a string literal `"default"` com fallback `true` (§5.2). |
| `resolveTicket` (função com esse nome) | Não existe. É `closeModalAndResolveTicket` (31908) + `onTicketResolved`. |
| `takeTicket` | Não existe. É `claimTicket`. |
| `canMultipleTicketTransfer` (computed) | O nome é o **valor string** da permissão; a computed chama-se `hasMultipleTicketTransfersPermission` (27891). |
| Consumidor de `hasDeskScorePermission` | O getter existe (26311) mas nada dentro do bundle o lê — provavelmente é consumido por um MFE/extensão. |
| Uso de 8 chaves de `OwnerProps` | `AgentSlots`, `ActiveMessageCanSendWithOpenTicket`, `ActiveMessageLimitCount`, `ActiveMessageLimitBatchDispatch`, `ActiveMessageContactFieldsSearch`, `ActiveMessageSearchSource`, `AIAgentIdentity`, `RouterIdentityActiveCampaign` — só declaradas / getter sem consumidor. São configuração de servidor espelhada no cliente. |

---

## 8. Achados colaterais (bugs prováveis)

1. **`StringUtils.normalizeText` descarta o lowercase** (app.js:34110): o ramo dos diacríticos parte de `e` em vez de `i`. Como `considerDiacritics` tem default `false`, o filtro de palavras proibidas roda **case-sensitive** na configuração padrão — `PALAVRA` passa se a lista tem `palavra`. Ver §3.4.
2. **`checkForbiddenPhrases` ignora `exactMatch`** (app.js:77427): faz substring pura sobre o texto inteiro, sem fronteira de palavra, enquanto o caminho de palavras soltas (77445-77452) respeita a opção. Comportamento assimétrico entre termos com e sem espaço.
3. **`setOfflineForInactivity` não deixa o agente Offline** (app.js:112824): grava `"Invisible"` hardcoded, apesar do nome do método, da constante `INACTIVITY_SET_OFFLINE_INTERVAL` e do track `desk-inactivitysetoffline-activated`. Ver §1.6.
4. **`for (u in OwnerProps)` itera chaves, não valores** (app.js:26997): nas duas entradas em que chave ≠ valor, o valor cru do servidor é gravado sob a chave errada e nunca é lido. Ver §4.1.
5. **`loadPermissions` não tem force-refresh** (app.js:26364): se `state.permissions.length > 0`, retorna sem fazer nada. Mudança de permissão só entra em vigor com reload da página.
6. **`UseFileTypeVerificationForTransitAllowedList` tem default booleano mas é usado como array** (app.js:95564). Só não quebra pelo curto-circuito da condição anterior.
