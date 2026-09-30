# Inventário visual — tela x estado x captura

**Congelado em:** 2026-09-30. Tema sempre `a confirmar na medição` (nenhuma captura foi lida para afirmar; D-12). Célula de estado = `capturado (arquivo)` ou `pendente`. A captura base de cada tela é registrada em `lista` (em `vazio` no Histórico, cuja captura mostra só o vazio); o estado real da captura é confirmado na medição. Itens abertos (D-10) detalhados em `CAPTURAS-PENDENTES.md`.

| Tela | Segmento Blip | Rota Pipe atual (App.tsx) | Onda | Tema (da captura) | lista | vazio | carregando | erro | abertos (D-10) |
|---|---|---|---|---|---|---|---|---|---|
| Casca (barra do Portal, barra do contato, desk-sidebar) | attendance (AttendanceShell + desk-sidebar) | `attendance` (índice -> monitoring) | 0 | a confirmar na medição | a confirmar nas capturas de tela (a casca aparece em todas) | a confirmar nas capturas de tela (a casca aparece em todas) | pendente | pendente | sem item aberto conhecido |
| Monitoramento | monitoring | `attendance/monitoring` | 1 | a confirmar na medição | capturado (attendance-desk-monitoring, 2026-09-07) | pendente | pendente | pendente | pendente (C-01..C-08) |
| Histórico | history | `attendance/history` | 1 | a confirmar na medição | pendente | capturado (attendance-desk-history, 2026-09-07) | pendente | pendente | pendente (C-09..C-14) |
| Filas | queue-management | `attendance/queue-management` (+ `/:queueId/edit`, R-02) | 1 | a confirmar na medição | capturado (attendance-desk-queue-management, 2026-09-07) | pendente | pendente | pendente | pendente (C-15) |
| Atendentes | team | `attendance/team` (+ create/edit/permission, R-03) | 1 | a confirmar na medição | capturado (attendance-desk-team, 2026-09-07) | pendente | pendente | pendente | pendente (C-16) |
| Regras | rules | `attendance/rules` | 2 | a confirmar na medição | capturado (attendance-desk-rules, 2026-09-07) | pendente | pendente | pendente | sem item aberto conhecido |
| SLA | sla-policy | `attendance/sla-policy` | 2 | a confirmar na medição | capturado (attendance-desk-sla-policy, 2026-09-07) | pendente | pendente | pendente | sem item aberto conhecido |
| Horários | attendance-hours | `attendance/attendance-hours` | 2 | a confirmar na medição | capturado (attendance-desk-attendance-hours, 2026-09-07) | pendente | pendente | pendente | sem item aberto conhecido |
| Pausas | personalizedbreaks | `attendance/personalizedbreaks` | 2 | a confirmar na medição | capturado (attendance-desk-personalizedbreaks, 2026-09-07) | pendente | pendente | pendente | sem item aberto conhecido |
| Respostas | replies | `attendance/replies` | 3 | a confirmar na medição | capturado (attendance-desk-replies, 2026-09-07) | pendente | pendente | pendente | sem item aberto conhecido |
| Templates | message-template | `attendance/message-template` | 3 | a confirmar na medição | capturado (attendance-desk-message-template, 2026-09-07) | pendente | pendente | pendente | sem item aberto conhecido |
| Canais | channels | `attendance/channels` (R-06) | 3 | a confirmar na medição | capturado (attendance-desk-channels, 2026-09-07) | pendente | pendente | pendente | sem item aberto conhecido |
| Configurações gerais | general-settings | `attendance/preferences/general|data|rules` (R-01) | 3 | a confirmar na medição | capturado (attendance-desk-general-settings, 2026-09-07) | pendente | pendente | pendente | sem item aberto conhecido |
| Relatório de atendimento (report) | report | `attendance/report` | 4 | a confirmar na medição | capturado (attendance-desk-report, 2026-09-07) | pendente | pendente | pendente | sem item aberto conhecido |
| Relatório de esforço (effort) | effort | `attendance/effort` | 4 | a confirmar na medição | pendente (sem captura attendance-desk-effort; ver FICHA-relatorio-esforco.md) | pendente | pendente | pendente | sem item aberto conhecido |
| Relatório de satisfação (survey-dashboard) | survey-dashboard | `attendance/survey-dashboard` (R-05) | 4 | a confirmar na medição | capturado (attendance-desk-survey-dashboard, 2026-09-07) | pendente | pendente | pendente | sem item aberto conhecido |
| Dashboard de ligações | calls-dashboard | sem rota (R-04) | 4 | a confirmar na medição | capturado (attendance-desk-calls-dashboard, 2026-09-07) | pendente | pendente | pendente | sem item aberto conhecido |
| Dashboard de vendas | sales-dashboard | sem rota (R-04) | 4 | a confirmar na medição | capturado (attendance-desk-sales-dashboard, 2026-09-07) | pendente | pendente | pendente | sem item aberto conhecido |
