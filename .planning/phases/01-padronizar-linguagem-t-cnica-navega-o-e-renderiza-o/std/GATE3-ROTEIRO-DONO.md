# Roteiro de navegador do dono — Portão 3 (Fase 1)

Este roteiro serve para você testar, no navegador, se o Pipe continua funcionando depois da tradução dos nomes técnicos (rotas, pastas, variáveis) para inglês. O texto que você vê na tela continua em português — só o que aparece na barra de endereço muda.

Marque `[ ] ok` ou `[ ] problema` em cada passo. Se marcar problema, siga a seção "O que fazer se der problema" no final.

## Antes de começar

- **URLs locais** (cada uma é um site separado, abra em abas diferentes do mesmo navegador):
  - Gestão: `http://localhost:3110`
  - Desk (atendimento): `http://localhost:3210`
  - CRM: `http://localhost:3300`
  - A API (`http://localhost:3000`) precisa estar rodando em outra janela; você não acessa ela direto.
- **Usuário de teste:** não existe login de atalho no Pipe — entre sempre com sua conta Google normal (a mesma que você já usa). Use uma janela normal do navegador, e só troque para uma aba anônima quando o passo pedir (para testar convite/link sem sessão).
- **Dados:** este ambiente é local e não tem clientes reais nem histórico real — é esperado ver listas vazias ou com poucos itens de teste.
- Tenha à mão pelo menos um bot (fluxo ou roteador) já configurado na Gestão, com algum ticket de teste no Desk, para os passos de conversa.

---

## Login e convite

1. Abra `http://localhost:3110/login` (Gestão). **Esperado:** a tela de entrar aparece pedindo e-mail/Google; a URL é `/login`, não `/entrar`.
   [ ] ok  [ ] problema
2. Entre com sua conta Google. **Esperado:** login aceito; você cai em `/portal`, com a lista de bots.
   [ ] ok  [ ] problema
3. Em outra aba, abra `http://localhost:3210/login` (Desk) e entre com a mesma conta. **Esperado:** login aceito; você cai na tela de Atendimentos, na raiz (`/`).
   [ ] ok  [ ] problema
4. Em outra aba, abra `http://localhost:3300/login` (CRM) e entre com a mesma conta. **Esperado:** login aceito; você cai na tela inicial do CRM.
   [ ] ok  [ ] problema
5. Na Gestão, abra "Contrato > Membros" (URL `/contract/members`). Clique em "Convidar", digite um e-mail de teste e envie. **Esperado:** aparece uma tela com o link do convite para copiar.
   [ ] ok  [ ] problema
6. Copie esse link e abra numa aba anônima. **Esperado:** o link contém `/invite/` (não `/convite/`) e abre a tela de aceitar convite normalmente.
   [ ] ok  [ ] problema

## Desk (atendimento)

7. Na aba do Desk, confira a URL na raiz. **Esperado:** é só `http://localhost:3210/`, mostrando a lista de atendimentos (não existe mais tela em `/chat`).
   [ ] ok  [ ] problema
8. Clique em um ticket da lista para abrir a conversa. **Esperado:** a conversa abre ao lado da lista, e a URL continua `http://localhost:3210/` (sem `/chat` e sem nenhum id na URL).
   [ ] ok  [ ] problema
9. Feche a conversa pelo botão de fechar da própria tela (não pelo Voltar do navegador). **Esperado:** a conversa fecha e você continua na lista de atendimentos, na mesma URL `/`.
   [ ] ok  [ ] problema
10. Abra a conversa de novo e pressione F5. **Esperado:** a página recarrega e mostra a lista de atendimentos, sem nenhuma conversa selecionada (é esperado perder a seleção no F5).
    [ ] ok  [ ] problema
11. Abra a conversa de novo e clique em Voltar do navegador. **Esperado:** a conversa fecha e você continua no Desk (não volta para o login nem sai do site).
    [ ] ok  [ ] problema
12. Clique no seu avatar (no trilho lateral) e troque seu status entre Online / Em pausa / Invisível — isso decide sua fila de atendimento. **Esperado:** Online mostra a fila de tickets normalmente; Em pausa/Invisível mostra a mensagem "Fique online para atender".
    [ ] ok  [ ] problema
13. No trilho lateral, clique no ícone de Contatos. **Esperado:** a URL vira `http://localhost:3210/contacts`.
    [ ] ok  [ ] problema
14. Selecione um contato e, se ele tiver, um ticket do histórico dele. **Esperado:** a URL continua em `/contacts`, sem id de contato nem de ticket aparecendo nela.
    [ ] ok  [ ] problema
15. Com contato/ticket selecionado, pressione F5. **Esperado:** volta para a lista de contatos, sem nada selecionado.
    [ ] ok  [ ] problema
16. No trilho lateral, clique no ícone de Métricas. **Esperado:** a URL vira `http://localhost:3210/analytics`.
    [ ] ok  [ ] problema
17. Pressione F5 em `/analytics`. **Esperado:** a tela de métricas recarrega normalmente, sem sair da tela.
    [ ] ok  [ ] problema
18. Navegue pelo trilho entre `/` (Atendimentos), `/contacts` e `/analytics`, depois use Voltar e Avançar do navegador. **Esperado:** o histórico se comporta normal entre as três telas, sem reabrir conversa ou seleção antiga.
    [ ] ok  [ ] problema

## Gestão

19. Na aba da Gestão, na lista de bots (`/portal`), clique em um bot para abrir. **Esperado:** a URL vira algo como `http://localhost:3110/flow/<id>` (fluxo/chatbot) ou `http://localhost:3110/router/<id>` (roteador) — nunca mais `/fluxo/` ou `/roteador/` em português.
    [ ] ok  [ ] problema
20. Dentro do bot, abra "Atendimento > Monitoramento". **Esperado:** a URL termina em `.../attendance/monitoring`.
    [ ] ok  [ ] problema
21. Na tela de Monitoramento, aplique um filtro de fila e de atendente. **Esperado:** a lista filtra na hora; a URL NÃO ganha `?fila=` nem `?atendente=` — o filtro fica só na tela.
    [ ] ok  [ ] problema
22. Pressione F5 na tela de Monitoramento com o filtro aplicado. **Esperado:** o mesmo filtro (fila/atendente) volta sozinho, sem você escolher de novo.
    [ ] ok  [ ] problema
23. Abra "Log" (histórico de mensagens), aplique um filtro de busca ou data, e pressione F5. **Esperado:** o filtro aplicado volta sozinho depois do F5.
    [ ] ok  [ ] problema
24. Abra "Análise > Dashboard", escolha um período, e pressione F5. **Esperado:** o período escolhido continua o mesmo depois do F5.
    [ ] ok  [ ] problema
25. Troque de conta pelo seletor de conta (no topo da tela) para outra conta que você tenha acesso. **Esperado:** os filtros que você aplicou na conta anterior NÃO aparecem nesta conta nova.
    [ ] ok  [ ] problema
26. Volte para a conta original e abra o Builder do bot (aba "Builder"). **Esperado:** o editor visual do fluxo abre normalmente, com a URL terminando em `/builder`.
    [ ] ok  [ ] problema
27. Pressione F5 dentro do Builder. **Esperado:** o Builder recarrega mostrando o mesmo fluxo, sem tirar você do bot.
    [ ] ok  [ ] problema
28. Copie a URL de uma tela interna do bot (por exemplo, a de Configurações Básicas, algo como `.../flow/<id>/settings/basic`), cole numa aba nova e pressione Enter — sem clicar em nada antes. **Esperado:** a tela abre direto, sem passar por outra tela no meio.
    [ ] ok  [ ] problema
29. Pressione F5 nessa mesma tela colada. **Esperado:** continua na mesma tela, sem cair para fora do bot nem voltar para `/portal`.
    [ ] ok  [ ] problema
30. Abra "Novidades" (URL `/updates`), faça uma busca, e pressione F5. **Esperado:** a busca aplicada volta sozinha depois do F5.
    [ ] ok  [ ] problema

## CRM

31. Na aba do CRM, abra a lista de leads (URL `/leads`). **Esperado:** a lista aparece normalmente, com a URL `/leads`.
    [ ] ok  [ ] problema
32. Clique em um lead da lista. **Esperado:** a URL vira `/leads/<id>` e a tela de detalhe do lead abre.
    [ ] ok  [ ] problema
33. Pressione F5 na tela do lead aberto. **Esperado:** a mesma tela do lead recarrega com os mesmos dados (não cai na lista nem desloga).
    [ ] ok  [ ] problema
34. Numa aba anônima (sem login), tente abrir `http://localhost:3300/leads` direto. **Esperado:** você é mandado para `/login` com `?destino=` apontando para `/leads`; depois de entrar, você volta para `/leads` (nunca para um site de fora).
    [ ] ok  [ ] problema
35. De volta à aba logada, abra `/accounts` e depois `/contacts`. **Esperado:** as duas listas abrem normalmente, com essas novas URLs em inglês.
    [ ] ok  [ ] problema

## Conferência visual

36. Olhe rapidamente as três telas (Desk, Gestão, CRM): cores, ícones, botões e textos. **Esperado:** nada quebrou visualmente depois da troca de nomes técnicos — o visual é o mesmo de antes.
    [ ] ok  [ ] problema

---

## O que fazer se der problema

Se algum passo falhar (marcar "problema"):

1. Anote o **número do passo** (por exemplo, "passo 14").
2. Tire um **print da tela** no momento do problema (inclua a barra de endereço com a URL visível).
3. Escreva em uma linha o que você esperava e o que aconteceu de diferente.
4. Envie o número do passo + o print para quem está conduzindo o portão 3 — não precisa tentar consertar nada sozinho.

Nenhum passo marcado "problema" fica pendente: cada um vira um item a corrigir antes da virada final (corte) do sistema.
