# Arquitetura de front: Vite, uma URL por aplicativo, e tempo real por WebSocket

Vinculante. Decidida em 07/09/2026, e substitui o Next.js App Router nas três telas.

O desenho copia o **framework do Twenty e do Chatwoot** (Vite, front estático, API separada) com a
**separação de URL do `conselheiros-auvp`** (api, app e lp em endereços próprios).

## 1. O que cada referência ensinou

| | Twenty (`twenty-front`) | Chatwoot | conselheiros-auvp |
|---|---|---|---|
| Empacotador | Vite + `@vitejs/plugin-react-swc` | Vite + Vue 3 | Vite + `@vitejs/plugin-react` |
| Estilo | Linaria / wyw-in-js (**zero-runtime**) | Tailwind | Tailwind |
| Dados | Apollo + GraphQL | REST + WebSocket | REST (`fetch` em `lib/api.ts`) |
| Estado | Jotai | Vuex/Pinia | Context do React |
| Servido como | estático | **estático pelo Rails** | estático |
| URLs | uma | uma | **api, app e lp separadas** |

Quatro coisas dão a performance deles, e três já são nossas ou custam pouco:

1. **SWC no lugar do Babel.** Compilação em Rust; é a diferença entre 400 ms e 4 s no recarregamento.
2. **CSS sem custo em runtime.** O Twenty usa Linaria justamente para fugir do CSS-in-JS com
   runtime. **Nós já estamos um passo à frente**: `globais.css` com tokens é CSS puro. Não entra
   Linaria, não entra Emotion, não entra Tailwind — o cromo medido da Blip e do Lightning fica
   intacto, e por acaso é a opção mais rápida das três.
3. **Front estático.** Hoje cada navegação no Pipe abre transação no Postgres pelo server component.
   Com Vite o front vira arquivo em CDN e o dado vem de uma API que dá para cachear.
4. **WebSocket em vez de recarregar.** É onde somos mais fracos: `apps/desk/src/app/acoes.ts` chama
   `revalidatePath('/')` **seis vezes**, e cada chamada reconsulta a tela inteira — lista, conversa
   e painel do contato. Numa tela de atendimento é a coisa mais cara que fazemos.

## 2. A stack decidida

| Camada | Escolha | Por quê |
|---|---|---|
| Build | **Vite + `@vitejs/plugin-react-swc`** | igual ao Twenty |
| Rotas | **React Router 6** | igual aos três |
| Estilo | **CSS com tokens, o que já temos** | zero runtime, e preserva o trabalho de medição |
| Dados | **REST na `api` NestJS + TanStack Query** | o GraphQL do Twenty existe porque os objetos dele são customizáveis pelo usuário; o nosso schema é fixo, e GraphQL aqui seria complexidade sem retorno |
| Estado | **Context**, como no conselheiros | Jotai só quando doer |
| Tempo real | **WebSocket** | mata os seis `revalidatePath` |

## 3. As URLs

```
usepipe.com.br          →  lp        Vite estático, é a única que precisa de SEO
app.usepipe.com.br      →  desk      Vite SPA
gestao.usepipe.com.br   →  gestao    Vite SPA
crm.usepipe.com.br      →  crm       Vite SPA
api.usepipe.com.br      →  api       NestJS — a ÚNICA porta para o banco
```

**A consequência que quase derruba isso, e que já está resolvida:** com o front em
`gestao.usepipe.com.br` e a API em `api.usepipe.com.br`, o cookie de sessão precisa atravessar
subdomínios. A saída é `Domain=.usepipe.com.br` mantendo `SameSite=Lax` — subdomínio do mesmo pai é o
mesmo site para o navegador.

A alternativa seria `SameSite=None` com CORS de credencial, e ela é **pior**: `None` manda o cookie
em requisição de qualquer site, que é exatamente o que o `Lax` existe para impedir.

CORS com lista fechada de origens, nunca `*` — com credencial o curinga é recusado pelo navegador, e
mesmo que não fosse seria abrir a API para qualquer site agir em nome de quem está logado.

## 4. O WebSocket

Um canal por aplicativo, autenticado **pelo mesmo cookie de sessão** — não por token no query
string, que vaza em log de servidor e em histórico de proxy.

| Aplicativo | O que empurra |
|---|---|
| **Desk** | mensagem nova, mudança de estado da conversa, atribuição, janela de 24h fechando, status do atendente |
| **Gestão** | os cartões do Monitoramento e a tabela detalhada, que hoje recarregam a cada 30 s |
| **CRM** | mudança de fase no funil e lead novo |

Três regras que valem para os três:

1. **O evento carrega o `tenant_id` e o assunto, nunca o dado.** O cliente recebe "a conversa X
   mudou" e busca de novo pela API, sob RLS. Empurrar o registro pelo socket seria uma segunda porta
   para o dado, com um segundo lugar para errar o isolamento.
2. **A inscrição é validada no servidor.** Quem se inscreve em `conversa:<id>` só recebe se aquela
   conversa pertencer ao tenant da sessão — checado no momento da inscrição, não confiado no cliente.
3. **Reconexão com recuo exponencial e recarga completa ao voltar.** Socket que cai e volta sem
   recarregar deixa a tela mentindo, e mentira em tela de atendimento vira mensagem perdida.

## 5. O que morre na migração

- **Server components** que consultam o banco: viram endpoint na `api`.
- **Server actions**: viram `POST` mais estado no cliente.
- **`revalidatePath`**: vira invalidação de cache do TanStack Query, disparada pelo WebSocket.
- **`force-dynamic`** nas 25 rotas: deixa de existir, porque não há mais renderização no servidor.

## 6. O que sobrevive inteiro

- **Todo o CSS.** `globais.css` da Gestão, o do Desk e o do CRM, com o cromo medido da Blip e do
  Lightning. É a maior parte do trabalho visual da semana e não se toca nela.
- **`packages/ui`**, `packages/core`, `packages/db`, `packages/ai`, `packages/autenticacao`.
- **A estrutura de componentes** de cada tela: `EstruturaGestao`, o trilho do Desk, a lista de leads.
  O que muda é de onde os dados chegam, não como a tela é montada.

## 7. Ordem de trabalho

1. `packages/contracts` de verdade — hoje tem 3 linhas, e é o que faz front e API concordarem.
2. Endpoints de sessão na `api` (entrar com Google, quem sou eu, sair) e CORS.
3. Um aplicativo Vite por vez, começando pelo que tem menos superfície.
4. WebSocket, depois que o primeiro aplicativo estiver de pé.
5. `lp` por último — é a única que precisa de SEO, e por isso a única que talvez peça pré-render.
