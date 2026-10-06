# Fluxos do site

## vendas-ia.json — assistente de vendas do chat da landing page

Fluxo do Builder (formato `{flow, globalActions}`) com: boas-vindas, agente de IA (OpenAI `gpt-4.1-mini`, memória de 10 mensagens, handoff `falar_com_especialista`), bloco do Desk para a fila `Especialista` e bloco de erro que oferece o especialista.

### Como importar em produção

1. Gestão > o fluxo (crie um fluxo novo, por exemplo "Vendas IA") > Builder > Configuração > Versões > **Importar fluxo** e escolha `vendas-ia.json`.
2. Confira o bloco **Assistente de vendas Pipe**. O bloco de preços do prompt se chama `PRECOS - CONFIRMAR ANTES DO LANCAMENTO` e traz uma proposta que o dono ainda precisa confirmar: edite ou apague antes de publicar.
3. Publique o fluxo.

### O que precisa estar configurado em produção

- **Chave do provedor de IA**: no fluxo, em Variáveis sensíveis, crie `OPENAI_API_KEY` com a chave da OpenAI (o nome padrão que o bloco procura). A chave nunca vai para o repositório. Sem ela o agente falha e o visitante recebe a mensagem de erro com a oferta do especialista. Se preferir outro modelo ou provedor, troque no bloco da IA.
- **Fila `Especialista`**: o fluxo precisa ter uma fila ativa chamada exatamente `Especialista`, com atendentes habilitados. O handoff grava `teams = Especialista` no contato e o Desk escolhe a fila por esse nome (uma regra de fila ou a fila padrão do fluxo valem antes, então não deixe uma regra capturando essas conversas). Os dados que o visitante informou ficam nos campos extras do contato (`lead_nome`, `lead_contato`, `lead_motivo`).
- **Fora do horário** (ou sem ninguém online): o ticket entra na fila mesmo assim e a conversa fica aberta; o visitante lê que um especialista responde assim que voltar.
- **Canal Pipe Chat**: crie o canal, vincule-o a este fluxo e publique o fluxo. Em origens permitidas, inclua `https://pipebr.app`.
- **Site**: use o snippet do canal e acrescente `data-specialist="Falar com um especialista"` para mostrar o botão (opcional):

```html
<script src="https://<origem da gestão>/pipe-chat.js" data-key="<chave>" data-specialist="Falar com um especialista" async></script>
```

O botão envia o texto como mensagem do visitante; a IA reconhece e chama o especialista. Fica desabilitado por 30 segundos depois do clique.

### Como testar

- Builder > Testar: sem chave, o teste usa uma simulação; digite `/handoff falar_com_especialista` para percorrer a saída do Desk.
- Com a chave: abra o site, converse, peça um especialista e confira o ticket na fila `Especialista` no Desk.
- Testes automáticos (sem LLM real): `pnpm --filter @pipe/core exec vitest run src/flow/vendas-ia.test.ts`.
