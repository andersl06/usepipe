# Portão 2 — pacote de revisão do dono (RASCUNHO PARCIAL)

**Status:** pré-montagem. As fatias de backend/infra (01-10) e front/fluxo (01-11) ainda estão rodando. Este documento cobre só as partes que não dependem delas: CSS, valores persistidos e o contrato de API por chave de cliente. Quando 01-10 e 01-11 terminarem, o pacote final (`GATE2-REVIEW.md`) junta isto com o resto (mapa completo, contrato de navegação, breaking changes de rotas/filas/etc.).

Poucas perguntas, cada uma com recomendação. Para aprovar, basta responder "ok" em cada uma ou dizer o que mudar.

---

## 1. Endpoints de API acessíveis por chave de cliente — manter em português ou renomear agora?

O levantamento (01-35) achou 24+ rotas (~25 combinações método+caminho) que clientes conseguem chamar hoje com uma chave de API própria (`pipe_<prefixo>_<segredo>`), sem passar pelo Desk/Gestão:

`/v1/conversas*`, `/v1/contatos*`, `/v1/filas`, `/v1/atendentes*`, `/v1/mensagens-ativas*`, `/v1/anexos*` (GET/POST/DELETE conforme a rota).

Essas rotas foram classificadas "manter" (não renomear nesta fase) porque, em tese, mudar o caminho quebraria integração de quem já usa a chave.

**Mas (D-43):** não existe cliente real nem dado real em produção ainda — ninguém usou o sistema. Não há ninguém para avisar nem integração para quebrar hoje.

**Escolha:**
- (A) Manter os 24+ caminhos em português agora e só renomear numa fase futura, com aviso a clientes reais — mais devagar, mas evita mexer 2x se algum cliente já tiver integrado por engano.
- (B) Renomear agora junto com o resto da API (não há ninguém para avisar, D-43) — evita ficar com uma parte da API em PT para sempre "porque um dia pode ter cliente".

**Recomendação: (B) renomear agora.** Não existe cliente a proteger; manter esses 24 caminhos em português seria a única parte da API a ficar permanentemente fora do padrão do STD-02, sem ganho real hoje.

---

## 2. Exceções do glossário aprovado no CSS

O mapa de CSS (2632 seletores/variáveis) segue o glossário geral aprovado no portão 1, com 3 grupos que usam um sentido específico de CSS:

| Termo PT | Geral (portão 1) | Uso em CSS | Linhas afetadas |
|---|---|---|---|
| painel | `application` (módulo/rota) ou `panel` (componente de UI) | sempre `panel` — todo `painel` em CSS é componente de UI (sidebar, drawer), nunca a rota/módulo | 246 |
| estado | `state` (geral) ou `status` (conjunto fechado de valores) | sempre `status` — todo `estado` em CSS é o status fechado de conexão (online/offline/pausa/chat) | 35 |
| papel | `role` (permissão) | sempre `paper` — todo `papel` em CSS é um "cartão"/superfície com sombra e borda arredondada, nunca permissão | 54 |

`painel`→`panel` e `estado`→`status` já são os sentidos que o próprio glossário previu para esses casos (não é desvio, é aplicar a exceção já combinada). `papel`→`paper` é o único sentido realmente novo: cada ocorrência foi conferida no CSS de origem antes de decidir (nenhuma é sobre permissão/role).

**Recomendação: aprovar as 3 como estão.** Consistentes com o glossário e conferidas ocorrência por ocorrência (01-36).

---

## 3. Valores persistidos que ficam com o nome atual (não renomeiam)

`persisted.csv` tem 744 decisões (147 `keep` + 597 `keep-literal`) — nomes ou valores gravados no Postgres (coluna, jsonb, escopo de chave de API) que o código não vai renomear nesta fase, mesmo que o resto do arquivo mude para inglês.

Por que é seguro deixar como está: são valores que já estão gravados no banco hoje (ex. `conversa.estado = 'em_espera'`, `mensagem.tipo = 'documento'`, chaves dentro de colunas jsonb como `templateMensagem.variaveis`). Renomear o código sem migrar o banco quebraria a leitura desses registros; migrar o banco está fora do escopo desta fase (STD-06, decisão adiada para inventário próprio). Cada linha tem evidência (arquivo:linha + onde fica persistido).

Durante esta revisão encontramos e corrigimos:
- 3 ids duplicados em `persisted.csv` com decisões conflitantes (ex. `packages-core-literal-value-826bc472`, chave `entrada` de `process_http_execucao.contexto`): uma linha vinha de uma classificação inicial (D-09) e outra da classificação final por coluna jsonb (D-11, com evidência `jsonb-reach:default-keep`, mesma regra usada em outras 66 linhas). Mantivemos a versão D-11 (mais completa) e removemos a duplicata; ver todo movido para `completed/`.
- Conferidas as 10 linhas `persisted-wire-*` trazidas por 01-35 (chaves jsonb expostas em endpoints, ex. `desenho`, `variaveis`, `cabecalhos`): decisão `keep`/`D-09` correta para o tipo (chave de contrato JSON), todas com exceção B correspondente em `exceptions.csv` — sem inconsistência.

**Recomendação: aprovar como estão.** Nenhuma decisão nova pedida aqui — é confirmação de que o inventário está consistente.

---

## 4. Backend / infra (01-10) — A PREENCHER quando 01-10 terminar

## 5. Front / navegação (01-11) — A PREENCHER quando 01-11 terminar

---

## Verificações rodadas (só escopo CSS, os únicos que já dá para provar agora)

- `check-map --scopes css --require-status proposed --glossary GLOSSARY.md`: **0 erros, 0 avisos**.
- Não existe ainda uma ferramenta mecânica de renomeio para `css-class`/`css-var`/`data-attr` (isso é entregue pelo plano 01-25, depois do portão 2) — `rename-symbols`/`move-files`/`rewrite-literals` não cobrem esses tipos, então não há dry-run de aplicação a rodar ainda para CSS; a prova possível hoje é a validação estrutural do `check-map` acima.
- 3 pares de seletores diferentes mapeando para o mesmo nome novo (ex. `ct-cabeca-acoes` e `ct-cabecalho-acoes` → `ct-header-actions`, arquivos diferentes) — sinônimos legítimos, não é colisão (check-map já valida colisão só dentro do mesmo arquivo).
- 2 linhas `data-tooltip` com texto visível ao usuário ficam como estão (categoria A, fora do escopo desta fase).
