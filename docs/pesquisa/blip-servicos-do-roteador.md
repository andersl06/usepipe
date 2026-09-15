# Serviços do roteador

## Contrato de tela

A rota de referência é `application/detail/{bot}/template/master`. O cabeçalho
mostra `Serviços`, seguido de dois parágrafos, do botão `Adicionar um serviço`
e dos cartões de serviços. O cartão principal tem título, tooltip, as linhas
`Serviço:`, `Chatbot:` e `Contrato:`, além de editar e excluir. Serviços filhos
repetem as linhas sem o título principal.

O formulário usa `Crie um nome para seu serviço`, `Associe um chatbot para este
serviço`, `É o meu chatbot principal`, `Não redirecionar automaticamente para o
principal` e `Expiração do redirecionamento`. Principal esconde persistência e
expiração; persistência marcada também esconde expiração. Busca sem resultado
mostra `Nenhum chatbot encontrado`; bot não publicado aparece apagado.

## Dados e limite atual

O HAR contém comandos LIME de aplicações e de configuração do contato. Nenhum
segredo, token ou dado pessoal foi reproduzido neste documento. O Pipe tem
`fluxo.tipo`, mas ainda não possui a relação persistida roteador → serviço.
Por isso a tela implementada mostra o principal, consulta os fluxos do tenant
para a busca e mantém filhos e gravação como indisponíveis.

A extração segura do HAR encontrou as chamadas LIME `GET
/applications/{bot}@msging.net/tenant` e `GET /applications?tenantId={tenant}`.
O quadro de resposta de aplicação traz os campos de identificação da aplicação;
os quadros disponíveis não trazem uma relação de serviços com `defaultChild`,
`redirectTimeout` ou `persistent`. Por isso não foi copiado payload real:
ele conteria identificadores e dados de terceiros, e não provaria o contrato
de persistência da tela.

O SQL proposto, sem criar migration nesta etapa, é:

```sql
create table roteador_servico (
  id uuid primary key,
  tenant_id uuid not null references tenant(id) on delete cascade,
  roteador_id uuid not null references fluxo(id) on delete cascade,
  servico_id uuid not null references fluxo(id) on delete restrict,
  nome text not null,
  principal boolean not null default false,
  persistente boolean not null default false,
  timeout_seg integer,
  unique (tenant_id, roteador_id, servico_id),
  check (roteador_id <> servico_id)
);
```
