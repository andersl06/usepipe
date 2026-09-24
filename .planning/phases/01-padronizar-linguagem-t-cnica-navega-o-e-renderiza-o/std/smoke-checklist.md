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
