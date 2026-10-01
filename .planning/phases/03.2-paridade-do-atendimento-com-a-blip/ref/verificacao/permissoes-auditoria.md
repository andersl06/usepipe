# Auditoria das permissões do atendente (Desk)

Base: correção A da Onda 1 (D-T01, item f), 2026-10-01. Código: `apps/api/src/domain/management/permissions-of-agent.ts` (`DESK_PERMISSIONS`).

A tela de Permissões mostra exatamente as 10 permissões do pedido do dono, na ordem e com os rótulos dele, sob as colunas "Gerais" e "Status". Só as linhas com código **aplicado pelas rotas** têm interruptor funcional (efetiva = exceção da pessoa, senão papéis). As demais ficam desabilitadas, com o motivo escrito na própria linha. Nenhum código de permissão foi apagado; só mudou o que a tela mostra e o que `PATCH /v1/management/agents/permissions` aceita gravar (apenas os 3 códigos aplicados).

| # | Rótulo | Código Pipe | Onde é aplicado (`requirePermission`) | Estado |
|---|---|---|---|---|
| 1 | Editar dados do contato | `contato.editar` | `controllers/catalogo.ts` (editar contato); `domain/etiquetas.ts` (atributos/etiquetas do contato) | ATIVA: o interruptor concede ou nega de fato |
| 2 | Enviar mensagem ativa | nenhum | `controllers/messages-active.ts` e `domain/message-active.ts` não checam permissão alguma | SEM CONTROLE: a função existe, qualquer sessão do tenant usa; linha desabilitada |
| 3 | Criar links de pagamento | nenhum | a função não existe no Pipe | EM BREVE (dependência) |
| 4 | Criar pastas e etapas do Kanban para organizar os tickets | nenhum | a função não existe no Pipe | EM BREVE (dependência) |
| 5 | Transferir tickets | `conversa.transferir` | `domain/conversation.ts` (transferência) e `controllers/management-operations.ts` (transferir pelo Monitoramento) | ATIVA, com ressalva: o código só é exigido para transferir ticket de OUTRO atendente; o atendente transfere o próprio ticket sem ele (comentário no código: decisão de modelo de dados). Na Blip o interruptor nega também o ticket próprio. |
| 6 | Transferir múltiplos tickets ao mesmo tempo | nenhum | não há transferência em lote no Pipe | EM BREVE (dependência) |
| 7 | Receber ligações de voz | nenhum | a função não existe no Pipe | EM BREVE (dependência) |
| 8 | Realizar ligações de voz | nenhum | a função não existe no Pipe | EM BREVE (dependência) |
| 9 | Acesso ao Histórico dos contatos no Blip Desk | `contato.ver` (existe no catálogo) | nenhuma rota exige `contato.ver`; `GET /v1/desk/contacts` e `/contacts/:id` só pedem sessão | SEM CONTROLE: linha desabilitada |
| 10 | Criar respostas prontas | `resposta_pronta.gerenciar` | `domain/management/communication.ts` (criar, editar, excluir resposta pronta) | ATIVA. O código é da área de gestão e antes não aparecia nesta tela; agora a exceção por pessoa é aceita só para ele |

## Achados a decidir (não alterados nesta correção)

1. **Mensagem ativa sem checagem** (linha 2): exigir uma permissão nova mudaria o acesso de todos os papéis atuais. Precisa de decisão do dono: criar o código (ex.: `mensagem_ativa.enviar`), conceder aos papéis de atendente por migração e só então exigir na rota.
2. **Histórico dos contatos sem checagem** (linha 9): o código `contato.ver` já existe; falta exigir nas rotas do Desk e garantir que os papéis de atendente o tenham, para não bloquear todos de uma vez.
3. **Transferir tickets** (linha 5): decidir se o código passa a valer também para o ticket próprio, como na Blip. Hoje desligar o interruptor só impede transferir ticket de outro atendente.
4. `GET /v1/management/agents/permissions` não exige permissão: qualquer sessão do tenant lê as permissões de qualquer atendente. A gravação exige `usuario.gerenciar`.
5. Funções que o Pipe não tem (3, 4, 6, 7, 8) dependem de produto novo (pagamentos, Kanban, lote, voz).
