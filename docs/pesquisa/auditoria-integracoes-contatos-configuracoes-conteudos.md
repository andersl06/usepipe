# Auditoria antes da implementação

## Pipe encontrado

| Área                       | Arquivos/rotas existentes                                                                                                                       | Estado                                                                             | Dados e componentes reutilizáveis                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Integrações                | `apps/gestao/src/app/fluxo/[id]/itens.ts` e `barra-do-contato.tsx` exibem Integrações como ícone sem destino; não existe rota Webhook em Gestão | Não implementada                                                                   | `webhookSaida` e `apps/api/src/webhooks-saida.ts` configuram eventos de saída do Pipe; não representam a integração Webhook por bot da referência |
| Contatos                   | CRM: `/contatos` e `/contatos/[id]`; Desk: `apps/desk/src/componentes/painel-contato.tsx`; Gestão: o item `users` em `itens.ts` não tem destino | Parcial em outros contextos; ausente no contexto do bot                            | `contato`, `conversa`, `mensagem`, `inbox`, classificações e `contato.atributos`; o CRM já consulta dados, abas de Conversas/Lead e campos extras |
| Configurações/API e chaves | CRM: `/configuracoes/api`; Gestão: `/configuracoes`, `/configuracoes/dados`, `/configuracoes/gerais` e `/configuracoes/regras`                  | A tela existente não corresponde à API/chaves do bot                               | `chave_api` guarda prefixo/hash e a API autentica por chave; não há fluxo de gestão de chaves nem de segredo em Gestão                            |
| Conteúdos/templates        | `/comunicacao/modelos`, `lib/comunicacao.ts`, `FormularioModelo` e `salvarModelo`                                                               | CRUD local básico, não é o sidebar de templates da referência                      | `template_mensagem` persiste nome, idioma, categoria, status, texto, variáveis e cabeçalho; não modela botões, pagamento ou carrossel             |
| Subbarra                   | `fluxo/[id]/itens.ts` gera o catálogo; `barra-do-contato.tsx` desenha os itens e ícones                                                         | Catálogo estático inclui Inteligência artificial sem aplicar as permissões por bot | Ícones do projeto em `icones-portal.tsx`; regra de cinco itens visíveis e excedente já existe                                                     |
| Growth / Click Tracker     | `fluxo/[id]/growth` contém Mensagens ativas                                                                                                     | Mensagens ativas já existe; Click Tracker ainda não                                | O arquivo (16) traz `portal-fragment-click-tracker/latest/main.js`; não precisa de novo dump para identificar a tela                              |

## Referências verificadas

- `docs/capturas/cap6s/supernova.blip.ai/portal.js`: templates compilados,
  controladores, rotas e menu; `portal.css`: medidas e estados visuais.
- Capturas em Downloads `(10)` a `(15)`: HTML externo é a casca; rotas/telas
  internas vêm do bundle. O arquivo `(16)` contém `growth/clicktracker.html`,
  `portal.js` e o microfrontend Click Tracker completo.
- Webhook: estado Angular `auth.application.detail.integrations.webhook`, URL
  filha `/webhook`, abas `webhook-tab-1` e `webhook-tab-2`, template no bundle
  associado ao módulo indicado como 29045.
- Configurações: estados `auth.application.detail.configurations.apikey`
  (`/apikey`) e `auth.application.detail.configurations.accessToken` (`/keys`).
- Contato: estado `auth.application.detail.users.user`; usuário selecionado abre
  o detalhe pelo estado, podendo levar `ticketId` na URL.
- Template: lista usa `openNewMessageSidebar()`; o sidebar contém os tipos
  `text`, `image`, `document`, `video`, `payment` e `carousel`. Mídia, vídeo,
  pagamento e carrossel são condicionados a flags; não aparecem todos juntos.
- Menu: `getUpdatedMenus()` filtra as entradas pelas claims do bot. Inteligência
  artificial exige uma das claims 102, 103, 104 ou 117. No Pipe não há modelo de
  permissões por bot; incluir o item incondicionalmente não reproduz essa regra.

## Limites e segurança

Os dados do contato são multi-tenant no Pipe e podem alimentar leitura de
conversas; uma conversa é a entidade disponível mais próxima de ticket. Não há
entidade separada de ticket. A edição do contato no CRM não tem ação de gravação
na tela atual.

As capturas/configurações externas não serão usadas como fonte de credenciais.
Nenhum App Secret, token, cookie, access key, Client Secret ou valor de cliente
é necessário para a reprodução visual.
