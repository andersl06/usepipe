# Checklist manual de smoke (STD-11)

Preencher `result` e `date` somente durante a validação manual. Os casos dependentes do corte devem ser executados depois da atualização coordenada dos serviços e das configurações externas.

| id | env (local/vps) | area | steps | expected | result | date |
|---|---|---|---|---|---|---|
| SM-01 | local | Google OAuth | Recadastrar `/v1/auth/google/callback` no Console local e concluir o login. | Callback aceito; sessão criada; destino interno respeitado. |  |  |
| SM-02 | vps | Google OAuth | Recadastrar `/v1/auth/google/callback` no Console da VPS e concluir o login. | Callback aceito em produção; sessão criada. |  |  |
| SM-03 | local | SSO | Concluir login pelo provedor usando `/v1/auth/sso/callback`. | Callback aceito e usuário autenticado. |  |  |
| SM-04 | local | Convite | Abrir um convite novo em `/invite/:token` e concluir o aceite. | Convite válido abre a tela correta e pode ser aceito. |  |  |
| SM-05 | local | Sessão | Antes do corte, manter uma sessão antiga; depois do rename do cookie, recarregar e entrar novamente. | Sessão antiga é encerrada; novo login funciona com o cookie novo. |  |  |
| SM-06 | local | Tempo real | Após o novo login, abrir o Desk e observar o upgrade WebSocket em `/v1/eventos` com o cookie novo. | Upgrade autenticado retorna 101 e eventos continuam chegando. |  |  |
| SM-07 | local | Desk/conversa | Abrir uma conversa e pressionar F5. | A lista do Desk reaparece sem conversa selecionada. |  |  |
| SM-08 | local | Desk/histórico | Abrir uma conversa e usar Voltar no navegador. | A conversa fecha e o usuário permanece no Desk; NEEDS VALIDATION contra a Blip ao vivo. |  |  |
| SM-09 | local | Desk/contatos | Selecionar contato e ticket e inspecionar a URL. | IDs não aparecem na URL. |  |  |
| SM-10 | local | Desk/contatos | Com contato e ticket selecionados, pressionar F5. | A lista de contatos reaparece sem seleção. |  |  |
| SM-11 | local | Desk/navegação | Navegar pelo trilho entre `/chat`, `/contacts` e `/analytics`; usar Voltar e Avançar. | Histórico normal entre telas, sem reabrir seleção efêmera. |  |  |
| SM-12 | local | Gestão/deep links | Para cada classe deep-linkable de `nav-contract.md`, abrir a URL diretamente e pressionar F5. | Cada tela classificada abre e sobrevive ao F5 conforme o contrato. |  |  |
| SM-13 | local | Gestão/filtros | Aplicar filtros de monitoramento, log, análise e novidades; recarregar cada tela. | O último filtro de cada tela é restaurado. |  |  |
| SM-14 | local | Gestão/isolamento | Aplicar filtros, trocar de tenant e depois de usuário. | Filtros do tenant/usuário anterior não são aplicados. |  |  |
| SM-15 | local | Gestão/wizard | Percorrer os passos de criação de fluxo/roteador e certificados conforme `nav-contract.md`; usar F5 e histórico. | Passo e persistência seguem a classificação de D-31. |  |  |
| SM-16 | local | CRM/autenticação | Abrir as rotas renomeadas de entrada e convite sem sessão. | Middleware permite as rotas públicas corretas. |  |  |
| SM-17 | local | CRM/redirect | Abrir rota protegida sem sessão, autenticar e validar o parâmetro `destino`. | Retorno ocorre apenas para caminho interno; tentativa de open redirect externo é recusada. |  |  |
| SM-18 | local | Uploads | Enviar anexo, importar contatos e cadastrar certificado próximo aos limites aceitos. | Parsers específicos atendem as novas rotas; não há 413 indevido nem parsing JSON do anexo. |  |  |
| SM-19 | local | Chave de fluxo | Usar chave escopada na rota do próprio fluxo e depois em outro fluxo. | Próprio fluxo é aceito; outro fluxo retorna 403. |  |  |
| SM-20 | local | Observabilidade | Consultar `/metrics` e carregar `alertas.yml`. | Métricas renomeadas aparecem e todas as regras são aceitas pelo Prometheus. |  |  |
| SM-21 | vps | Filas | Executar o runbook de drain e registrar contagens de todas as filas antigas. | Todas as contagens chegam a 0 antes da troca dos serviços. |  |  |
| SM-22 | local | Visual | Revisar páginas representativas do Desk, Gestão, CRM e site após o rename de CSS. | Layout, temas e estados visuais permanecem íntegros. |  |  |

## D-52

Roteiro do plano 01-45 (`01-45-PLAN.md`, Task 3), executado em duas partes: o executor roda a
parte automatizável (navegador headless, sem sessão — nenhuma credencial do dono disponível,
`environment_notes` da execução) e registra o resultado aqui; o dono confirma o restante, que
exige login real. Servidores locais confirmados no ar antes do teste: API `http://localhost:3010/saude`
→ 200, Gestão `http://localhost:3110/` → 200, Desk `http://localhost:3210/` → 200 (D-50).

**Automatizado (Playwright/Chromium headless, 2026-09-28, sem sessão):**

| id | passo do roteiro (01-45 Task 3) | URL pedida | resultado |
|---|---|---|---|
| D52-AUTO-01 | Guarda de sessão captura a URL pedida (raiz) | `http://localhost:3110/` | 200; sem exceção de JS; final `http://localhost:3110/login?destino=%2F` |
| D52-AUTO-02 | Tela de login renderiza sozinha | `http://localhost:3110/login` | 200; sem exceção de JS; permanece em `/login` |
| D52-AUTO-03 | `/application` é rota reconhecida (guarda preserva o destino) | `http://localhost:3110/application` | 200; final `http://localhost:3110/login?destino=%2Fapplication` |
| D52-AUTO-04 | Passo 6: URL antiga `/portal` | `http://localhost:3110/portal` | 200; final `.../login?destino=%2Fportal` |
| D52-AUTO-05 | Passo 6: URL antiga `/flow/<uuid>/growth/active-messages?x=1` (com query) | `http://localhost:3110/flow/00000000-0000-0000-0000-000000000000/growth/active-messages?x=1` | 200; final `.../login?destino=%2Fflow%2F...%2Fgrowth%2Factive-messages%3Fx%3D1` — path E query completos preservados no `destino` |
| D52-AUTO-06 | Passo 6: URL antiga `/router/<uuid>/settings/basic` | `http://localhost:3110/router/00000000-0000-0000-0000-000000000000/settings/basic` | 200; final `.../login?destino=%2Frouter%2F...%2Fsettings%2Fbasic` |
| D52-AUTO-07 | Passo 6: URL antiga `/create/flow` | `http://localhost:3110/create/flow` | 200; final `.../login?destino=%2Fcreate%2Fflow` |
| D52-AUTO-08 | Passo 6: URL antiga `/contract/members` | `http://localhost:3110/contract/members` | 200; final `.../login?destino=%2Fcontract%2Fmembers` |
| D52-AUTO-09 | Passo 6: URL antiga `/updates` | `http://localhost:3110/updates` | 200; final `.../login?destino=%2Fupdates` |
| D52-AUTO-10 | Raiz do Desk também é guardada | `http://localhost:3210/` | 200; sem exceção de JS; final `http://localhost:3210/login?destino=%2F` |

Em todos os 10 casos: nenhuma exceção de JavaScript (`pageerror`) nem tela em branco; os únicos
erros de console são os `401` esperados da checagem `GET /v1/eu` sem sessão (comportamento
normal, não é falha). Isto prova, sem precisar de login: o bundle da Gestão e do Desk carrega e
roda depois das mudanças do 01-44/01-45 sem quebrar; a guarda de sessão (`RequireSession`)
reconhece cada uma dessas nove URLs (novas e antigas) como rota válida da árvore e preserva o
path completo + query no parâmetro `destino` antes de mandar para `/login` — inclusive para as
URLs antigas que dependem do `LegacyRedirect`/`LegacyContactRedirect` depois do login. Não prova
(porque exige sessão) que o `LegacyRedirect` de fato entrega no endereço novo certo depois do
login — isso é o passo 6 completo, abaixo, do dono.

**Pendente do dono (exige login real; nenhuma credencial disponível para o executor):**

| id | passo do roteiro (01-45 Task 3) | URL(s) | result | date |
|---|---|---|---|---|
| D52-01 | Login com usuário do seed → grade de fluxos em `/application` | `http://localhost:3110/login` | | |
| D52-02 | Abrir um fluxo → `/application/detail/<shortName>` (sem uuid, sem `/flow/`); F5 mantém a tela | | | |
| D52-03 | Navegar Atendimento → Monitoramento, Contatos (`?ticketId=`), Growth → Mensagens ativas, Configurações → Básicas, todas sob `/application/detail/<shortName>/...`; voltar/avançar do navegador | | | |
| D52-04 | Em Configurações básicas, renomear o fluxo → URL troca de shortName sem 404; shortName antigo dá "não encontrado" | | | |
| D52-05 | Criar fluxo: `/application/create/marketplace` → "Construir do zero" → `/application/create/name/builder` → criar → detalhe do fluxo novo; criar roteador: `/application/create/router` → `/application/create/name/master`; nome duplicado → "Já existe um fluxo com este nome" | | | |
| D52-06 | Colar URLs antigas (`/portal`, `/flow/<uuid-real>/growth/active-messages?x=1`, `/router/<uuid-real>/settings/basic`, `/create/flow`, `/contract/members`, `/updates`) já autenticado → cada uma termina na URL nova equivalente, com query preservada | | | |
| D52-07 | Contrato, Novidades, Implantação abrem sob `/application/...`; passos da Implantação levam a telas que existem (nada de `/canais`) | | | |
| D52-08 | Menus do contato e do contrato: nenhum item leva a tela em branco ou 404 | | | |

Ver `.planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/01-45-PLAN.md` (Task
3, `<how-to-verify>`) para o texto completo de cada passo.
