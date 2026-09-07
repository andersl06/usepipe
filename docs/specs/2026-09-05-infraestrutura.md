# Pipe — infraestrutura e modelo de entrega

Decidido em 05/09/2026: **SaaS multi-tenant operado pela PJ**. O cliente não instala nada.
Este documento registra o que essa decisão implica, incluindo as partes desconfortáveis.

## 1. Topologia

```
                        Traefik (TLS automático)
                                 │
      ┌──────────┬───────────────┼───────────────┬──────────────┐
      ▼          ▼               ▼               ▼              ▼
    desk       gestao           crm             api          site
   Next.js    Next.js         Next.js         NestJS      estático
      └──────────┴───────────────┴───────────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
               Postgres 16     Redis      Storage de
               (pgvector)    (BullMQ)      objetos
                    ▲
                    │
                 workers
            (entrega, IA, agregações)
```

Tudo em Docker Compose atrás do Traefik. Começa numa máquina; a separação vem quando a conta
justificar, e a §7 diz quando.

## 2. Ambientes

| Ambiente | Onde | Para quê |
|---|---|---|
| Local | `docker-compose.yml` do repositório | desenvolvimento; Postgres na 5433 e Redis na 6380 para não brigar com outros projetos da máquina |
| Homologação | VPS, subdomínio próprio | validar migration e release antes do cliente ver |
| Produção | VPS dedicada ao Pipe | clientes pagantes |

**Produção do Pipe não divide máquina com experimento.** A VPS OVH de hoje já hospeda Twenty,
Chatwoot e n8n de outro projeto. Misturar dado de cliente pagante com ambiente de teste é o tipo de
economia que custa caro uma vez só.

## 3. Domínios e como o cliente chega

- `app.pipe.com.br` → Desk, a tela do atendente
- `gestao.pipe.com.br` → Gestão
- `crm.pipe.com.br` → CRM
- `api.pipe.com.br` → API, webhooks e servidor MCP
- `pipe.com.br` → site, blog e ferramentas

O tenant é resolvido **pelo login**, não pelo subdomínio. Um usuário pertence a um tenant, e a
sessão carrega qual é. Subdomínio por cliente entra depois, se e quando o white-label exigir, e é
mudança de roteamento, não de modelo de dados.

## 4. Isolamento entre clientes

Um banco, uma tabela por entidade, `tenant_id` em tudo, RLS ligada. A `api` abre transação com
`set_config('pipe.tenant_id', …, true)` e o Postgres faz o resto. Três garantias, todas com teste:

1. O papel da aplicação (`pipe_app`) **não é dono das tabelas e não tem `bypassrls`**. Com o papel
   dono, os testes passariam sem provar nada.
2. Consulta sem a variável de sessão definida **não retorna linha**. Falha fechada.
3. `with check` impede gravar linha com o tenant do vizinho.

Migrations rodam com outro papel, que é o dono.

A suíte `packages/db/tests/rls.test.ts` prova as três, e mais cinco premissas sem as quais elas
passariam sem valer nada: que `pipe_app` não é dono de tabela nenhuma e não tem `bypassrls`; que
**nenhuma tabela com `tenant_id` ficou sem política** (o teste falha nomeando a tabela nova); que a
partição criada agora nasce com política; que toda política usa a forma de subconsulta escalar; e
que o tenant não sobrevive ao erro da transação anterior, porque conexão devolvida ao pool com
variável suja seria vazamento silencioso.

### O que a RLS NÃO cobre, e por isso precisa de regra própria

Auditado em 07/09/2026. A RLS protege a linha do banco. Estas três superfícies estão fora do
alcance dela, e são onde um vazamento entre clientes aconteceria de verdade:

**1. O storage de objetos.** `anexo.chave_storage` guarda a chave, e o arquivo mora fora do banco.
A política protege a linha que aponta para o arquivo, nunca o arquivo. Hoje `urlDaMidia()` monta
`PIPE_STORAGE_URL_BASE/<chave>` — uma URL direta. O storage ainda não está ligado, e é por isso que
a regra entra aqui antes:

- O bucket **nasce privado**. Nenhum objeto com leitura anônima, em nenhum ambiente.
- O acesso é por **URL assinada de curta duração**, emitida pela `api` **depois** de ler a linha do
  `anexo` sob RLS. Se a linha não aparece para aquele tenant, a assinatura não é emitida.
- A chave do objeto **começa pelo `tenant_id`** (`<tenant>/<ano>/<mes>/<uuid>`). Não é a proteção —
  a proteção é a assinatura — mas torna auditável quem deveria ter cada arquivo, e transforma um
  vazamento em algo que se vê no log.
- Chave adivinhável nunca é defesa. Se a única coisa entre um cliente e o anexo do vizinho for o
  tamanho de um UUID, o desenho está errado.

**2. Redis e as filas.** BullMQ compartilha fila entre tenants e carrega o `tenant_id` no payload
do job. O consumo precisa **reafirmar o tenant** ao processar (é o que `noTenant(linha.tenant_id)`
faz na entrega), e nenhum job pode carregar dado de negócio no payload além do necessário para
buscá-lo de novo sob RLS.

**3. O CRM forkado.** Banco próprio e isolamento por schema, fora do alcance das nossas políticas.
Vale a regra da spec do fork: ele é um serviço de terceiro do ponto de vista do Pipe, e a fronteira
entre os dois é a rede.

### Quando isso deixa de bastar

Banco compartilhado é a escolha certa até o momento em que um cliente sozinho representa risco de
vizinho barulhento, ou em que alguém exige separação física por contrato. A saída não é reescrever:
é subir uma segunda instância do mesmo compose com um tenant só. A arquitetura já permite; o que
muda é custo e processo de atualização.

## 5. De quem é a conta do WhatsApp

Decisão de produto, não de infraestrutura, mas é aqui que ela dói se for errada.

**O cliente é dono do WABA dele.** O Pipe entra como provedor de tecnologia, e a conexão é feita
pelo fluxo de cadastro embutido da Meta, dentro do próprio Business Manager do cliente.

Por quê: é o que torna literal a promessa da página de que o número é dele. Se ele decidir sair,
sai com o número, e isso é argumento de venda, não perda. O caminho alternativo, centralizar os
números na sua conta e revender envio, dá margem no tráfego e cria dependência, mas transforma a
frase "o número é seu" em meia verdade, e vira passivo quando um cliente grande pedir para migrar.

O custo de envio da Meta é repassado, não embutido, e aparece no painel de consumo junto com o
consumo de IA.

## 6. Dados pessoais e LGPD

Neste modelo você é **operador**: trata dado pessoal por conta do cliente, que é o controlador.
Isso não é detalhe jurídico, é requisito de produto.

- **Contrato de tratamento** com cada cliente, definindo finalidade, prazo e o que acontece no fim.
- **Exclusão a pedido do titular** precisa existir desde a primeira versão, não depois. Conversa é
  dado pessoal, e cliente do seu cliente tem direito de sumir da base.
- **Retenção configurável por tenant**, com as partições antigas de `mensagem` e
  `evento_atendimento` indo para armazenamento frio e depois sendo descartadas.
- **Log de auditoria** de quem viu e mudou dado de contato, regra, permissão e nota de avaliação.
- **Segredo de canal cifrado em repouso**, com a chave fora do banco. Token da Meta vazado é
  incidente com nome e sobrenome.
- **Sub-operadores declarados**: o provedor do modelo de IA processa transcrição de conversa. Isso
  precisa estar no contrato, e o cliente precisa poder desligar a monitoria por IA.

## 7. Backup, e quando a máquina única deixa de servir

**Backup:** dump diário do Postgres com retenção de 30 dias, mais WAL contínuo para recuperação em
ponto no tempo. Storage de objetos com versionamento. **Restauração testada mensalmente** — backup
que nunca foi restaurado é fé, não backup.

**Os gatilhos para sair de uma máquina**, em ordem de chegada provável:

| Sinal | Ação |
|---|---|
| Postgres passa de 70% de CPU no pico | banco em máquina própria |
| Fila do BullMQ acumulando na hora cheia | workers em máquina própria, escalados por tipo de fila |
| Anexos passando de algumas centenas de GB | storage de objetos externo em vez de disco local |
| Leitura de relatório competindo com atendimento | réplica de leitura só para Gestão e consultas |
| Primeiro cliente que exige separação física | instância dedicada, mesmo compose, um tenant |

Nada disso entra agora. Está escrito para que a decisão, quando vier, seja consulta e não pânico.

## 8. Observabilidade

O mínimo honesto desde a primeira versão em produção:

- **Log estruturado** com `tenant_id`, `usuario_id` e identificador da requisição em toda linha.
- **Métrica de entrega de mensagem**: taxa de falha por canal e por tipo de mídia. É o número que
  avisa antes do cliente ligar.
- **Fila**: profundidade e idade do item mais velho.
- **Alerta** para: falha de entrega acima do normal, worker parado, migration pendente, certificado
  perto de vencer, e disco.
- **Página de status pública**, porque plataforma de atendimento que cai sem avisar perde cliente
  duas vezes.

**Observabilidade exportável, não só interna.** Cliente médio para cima quer ver a saúde da
plataforma nas ferramentas dele. A métrica sai em formato Prometheus, e o tenant pode apontar um
destino externo (Grafana, New Relic, Datadog). Sem isso, a resposta numa RFP é "não atende", e é um
item que aparece com frequência.

## 9. Publicação

Migration roda **antes** do código novo subir, e toda migration precisa ser compatível com a versão
anterior do código; senão não dá para voltar atrás sem perder dado. Publicação com substituição
gradual, e o healthcheck é o que decide se o contêiner novo recebe tráfego.

Toda publicação registra versão, autor e o que mudou, num lugar que o suporte consiga consultar às
duas da manhã.
