# Investigação de paridade Blip × Pipe

Status: em andamento. Escopo: Builder, Desk/Atendimento, roteador/subbots, APIs/LIME, referências HTML/capturas e comportamento visual. **Não equivale a certificação de paridade.** Nenhum ticket de produção deve ser criado para esta investigação.

## Régua de evidência

1. Comportamento reproduzido em bot/tenant de homologação da Blip e no Pipe, com configuração e passos anotados.
2. Documentação oficial atual da Blip (Help/API), com URL e data de consulta.
3. Captura/DOM original da Blip com data e estado de interface identificáveis.
4. Bundle original baixado da Blip, distinguindo código original de patches locais.
5. Engenharia reversa e notas em `C:/Users/anderson.linhares/pipe/referencias-blip/pesquisa/`.
6. Mock/clone, plano ou especificação Pipe: úteis para intenção, **não** prova da regra Blip.

O material da skill `blip-onboarding` descreve também cálculos e um distribuidor **do projeto `blip-dash`**. Eles não são automaticamente algoritmos nativos da Blip. Por exemplo, `workload = open + waiting + unread`, `hiddenWait` e os limites de 4 transferências paralelas são regras desse dashboard; só comparar com o Pipe como “regra Blip” após confirmação em fonte primária ou ensaio. O mesmo vale para medidas tiradas de HTML estático sem o estado aberto de menus/modais.

`desk-clone/ESTADO.md` esclarece que a cópia local mistura bundles originais com `boot-mock.js`/`dados-mock.js`, 14 respostas vazias e três patches em `app.js`/`vendor.js`; o mock aceita escritas sem persistir nem notificar. Portanto, testar transferência, encerramento, presença ou resposta pronta nesse clone **não reproduz a Blip real**. Os bundles/DOM originais ainda servem como evidência de estrutura visual e contratos, identificando versão e estado.

Exemplo de referência interna desatualizada: `docs/specs/2026-09-05-desk-requisitos.md` afirma que não há artigo de atalhos para `#`, mas o [Help oficial de acessibilidade do Desk](https://help.blip.ai/hc/pt-br/articles/34953352607511-Acessibilidade-no-Blip-Desk), atualizado antes dessa especificação, documenta `#` para respostas prontas. O usuário observou `/` em sua conta, então o comportamento da instância continua pendente de ensaio. Artigos do **Blip Go Personal** não devem ser aplicados automaticamente ao Portal/Desk do contrato Supernova; a edição do produto precisa ser marcada em cada fonte.

Outra nota desatualizada: `C:/Users/anderson.linhares/pipe/referencias-blip/pesquisa/blip-desk-funcoes.md:232` afirma que não encontrou atalhos documentados para o Desk, mas o mesmo [Help oficial de acessibilidade](https://help.blip.ai/hc/pt-br/articles/34953352607511-Acessibilidade-no-Blip-Desk) já lista, entre outros, `Ctrl+Shift+E` para transferir e `Ctrl+Shift+F` para finalizar. Não converter a ausência da nota em ausência da Blip.

`C:/Users/anderson.linhares/pipe/referencias-blip/fichas/FICHA-builder-diferencas.md` já inventaria itens visuais e funcionais do Builder (como copiar/colar bloco e versões), mas aponta para caminhos antigos `apps/gestao-vite/...`. Cada item precisa ser rechecado no `pipe-codex` atual: a ficha é pista de investigação, não veredito vigente. O próprio material `pendencias-referencia-atendimento.md` lista menus/modais cujo DOM aberto não foi capturado.

Cada achado exige: comportamento esperado, evidência Blip, evidência Pipe (arquivo/linha ou teste), classificação `presente | parcial | divergente | ausente | quebrado | não verificado`, impacto e reprodução. `rg` sem ocorrência é indício, não prova suficiente por si só. Contradição entre fontes vira questão aberta, não escolha arbitrária.

## Cobertura por frente

| Frente | Subáreas a confrontar | Estado |
| --- | --- | --- |
| Builder e runtime | blocos, conteúdo, entrada, condições, ações, publicação, versão, subfluxos, debug, variáveis, fallbacks, visual | Em análise |
| Desk e Atendimento | ticket, fila, regra, distribuição, status, transferência, mídias, atalhos, histórico, monitoramento, relatórios, permissões, visual | Em análise; primeiros achados em [auditoria de Atendimento](2026-09-30-blip-attendance-scope.md) |
| Roteador e contexto | identidade original/túnel, serviços, contexto compartilhado/desligado, redirect com mensagem, retorno, contatos por bot | Em análise |
| APIs/LIME | envelopes e erros, tickets, full-data, messages, contacts, contexts, tunnels, versões publicadas, paginação, transferências, webhook | Em análise |
| Canais e integrações | WhatsApp, Instagram, Messenger, templates, campanhas, janela e status de entrega | Ainda não fechado |
| Configuração/Portal | chaves, serviços, papéis, preferências, limites e isolamento por bot/tenant | Ainda não fechado |

## Achados transversais já confirmados no código (fora do Desk)

| Área | Diferença observável | Evidência e limite |
| --- | --- | --- |
| Contatos do bot | Na [Blip, “+ adicionar filtros” e período alteram a busca](https://help.blip.ai/hc/pt-br/articles/4474398115351-Como-buscar-um-ou-mais-contatos). No Pipe, `apps/management-vite/src/pages/flow/contacts/lista.tsx` renderiza “Adicionar filtros” sem ação, deixa “Aplicar” sempre desabilitado e datas `readOnly`; o comentário confirma ausência de backend para ambos. | **Quebrado/incompleto** na UI Pipe; conferir listagem e detalhe ao vivo em homologação. |
| Relatórios personalizados de Análise | A [Blip permite criar relatório e gráficos por eventos](https://help.blip.ai/hc/pt-br/articles/4474414384407-Como-criar-gr%C3%A1ficos-em-um-relat%C3%B3rio-customizado); `apps/management-vite/src/pages/flow/analytics/reports/reports.tsx:35` deixa “Criar relatório” desabilitado, marcado “em breve”. | **Ausente** como funcionalidade acionável no Pipe; não confundir com relatórios fixos já existentes. |
| Growth/Ads | A [Blip inicia conexão Meta pelo botão “Conectar ao Facebook”](https://help.blip.ai/hc/pt-br/articles/25426980322071-Como-criar-an%C3%BAncios-CTWA-usando-Blip-Ads-Manager); `apps/management-vite/src/pages/flow/growth/ads/anuncios.tsx:45` só informa que a conexão não existe no Pipe. | **Ausente**, possivelmente dependente de contrato/Marketing API; não é bug do fluxo de mensagens. |
| Modelos de mensagem | O [Help atual da Blip](https://help.blip.ai/hc/pt-br/articles/4474382379799-Como-criar-aprovar-e-usar-templates-de-WhatsApp-no-Blip) inclui cabeçalhos de imagem/vídeo/PDF e categoria Autenticação. `apps/management-vite/src/pages/flow/contents/tela.tsx:352-357` informa que o Pipe não cria Autenticação nem esses modelos com mídia por essa tela. A avaliação do texto por IA também apenas mostra aviso (`:589`). | **Parcial**: texto e outras opções existem; validar API de envio e lista separadamente. Artigo antigo da Blip sobre Autenticação conflita com o Help atualizado, portanto usar a versão corrente. |
| Modelo de mensagem — perda silenciosa de campos | A tela Pipe permite preencher **respostas rápidas e rodapé** (`apps/management-vite/src/pages/flow/contents/tela.tsx:665-717, 807-938`), mas `sendForEvaluation()` em `:368-376` envia somente `nome`, `idioma`, `categoria`, `corpo` e `exemplos`; nem `buttons`, nem `rodape` entram na chamada. O formulário alternativo de `registrations/communication-templates-formulario.tsx:75` já envia `rodape`, provando que há inconsistência entre telas Pipe. O modo “Botões de ação” desenha campos sem modelo persistido; os templates com mídia (que usariam o link exibido) são barrados antes de enviar. A [Blip trata botões e componentes como parte do template](https://help.blip.ai/hc/pt-br/articles/4474382379799-Como-criar-aprovar-e-usar-templates-de-WhatsApp-no-Blip). | **P0 de não funcionamento/consistência**: usuário pode configurar na prévia algo que não é submetido à Meta. Testar criação em homologação e ler payload/resposta aprovada; até lá, não confiar na prévia. |
| Identidade WhatsApp em evolução | A [Blip documenta BSUID e contatos sem telefone exposto](https://help.blip.ai/hc/pt-br/articles/38934034280855-Usernames-no-WhatsApp-BSUID-novos-IDs-e-impactos-no-Blip). `apps/api/src/domain/inbound.ts:426` trata qualquer identificador WhatsApp como telefone e grava `+${normalizarWaid(identificador)}`; `packages/core/src/telefone/index.ts:69` devolve IDs desconhecidos sem alteração. Um identificador não numérico pode virar um `telefone_e164` inválido semanticamente. | **Risco de compatibilidade emergente**, não incidente reproduzido: rollout gradual; testar com ambiente/contato BSUID e verificar validação de outbound/CRM antes de afirmar quebra. |
| Click Tracker | A [Blip requer conexão real do token da Marketing API](https://help.blip.ai/hc/pt-br/articles/15498339807255-Como-conectar-o-Click-Tracker-a-API-de-Marketing-da-Meta-Facebook-Ads) e [seleção de evento de conversão registrado](https://help.blip.ai/hc/pt-br/articles/16775881794327-Click-Tracker-Evento-de-Convers%C3%A3o-na-pr%C3%A1tica). `apps/management-vite/src/pages/flow/growth/clicktracker/clicktracker.tsx` é visual-only, com métricas fixas em zero, períodos `readOnly`, botões sem ação e textos fixos **“Tudo certo com o seu Token” / “Conectado”** mesmo sem integração. | **P0 de honestidade da interface**: pode induzir o operador a acreditar que o token e os dados estão corretos quando nada foi verificado. Não é só funcionalidade faltante. |
| Modos de conexão/API do bot | A Blip suporta [Builder, SDK e bot HTTP](https://help.blip.ai/hc/pt-br/articles/4474413783959-Como-construir-bots-atrav%C3%A9s-de-SDKs-ou-API-HTTP). A tela Pipe `apps/management-vite/src/pages/flow/settings/api/tela.tsx:16` declara que `wsEndpoint`/`tcpEndpoint`, endpoints de envio e OAuth 2.0 são vazios/visuais porque não há servidor SDK nem rotas correspondentes; URLs HTTP de recebimento e chave têm persistência real. `salvar()` em `:43-54` envia **só duas URLs**, embora a tela aceite URL de autorização, Client ID e Client Secret (`:197-240`); mexer nesses campos nem habilita Salvar, e os endpoints de envio aparecem vazios (`:270-283`). A Blip também documenta [OAuth 2.0 e cabeçalhos nos webhooks analíticos](https://help.blip.ai/hc/pt-br/articles/4474381206423-Enviando-dados-para-an%C3%A1lise-atrav%C3%A9s-de-Webhooks). | **Parcial por arquitetura, com controles enganosos**: não declarar a tela inteira ausente; marcar cada campo e efeito separadamente e bloquear/descrever o que não persiste. |
| Convite de membro ao bot | A [Blip envia convite por e-mail](https://help.blip.ai/hc/pt-br/articles/18698027332247-Cadastro-de-usu%C3%A1rios-no-Blip); `apps/management-vite/src/pages/flow/team/tela.tsx:182` diz que o Pipe cria o convite e oferece link para copiar, sem enviar e-mail nessa jornada. | **Diferença de UX/entrega**; a matriz de acesso por fluxo do Pipe existe e funciona em separado. |

Esses itens são exemplos de funções que **parecem visíveis** no Portal mas não produzem o efeito da origem. A comparação visual detalhada exige viewport e estado de interação capturados para ambos os produtos; HTML estático não demonstra resultado de clique.

Contrapesos verificados para evitar “tudo está faltando”: o Pipe já tem matriz de permissões **por fluxo** (`apps/management-vite/src/pages/flow/team/permissions.ts`, `fluxo_membro` no backend), templates de texto enviados pela integração WhatsApp (`apps/management-vite/src/lib/channels-gravar.ts`) e links rastreados próprios com backend separado de Click Tracker (`apps/management-vite/src/pages/flow/growth/tracked-links/`). Esses recursos não consertam as lacunas acima, mas devem aparecer como `presente` ou `diferente por escolha`, não como ausência genérica.

## Ensaios controlados necessários

Usar dois bots/fluxos de homologação no mesmo tenant, um roteador com dois serviços, duas filas de mesmo nome em bots distintos, duas regras conflitantes, um atendente compartilhado e contatos de teste sem dados reais. Registrar bot, versão publicada, canal, horário, IDs de bot/ticket/túnel **mascarados** e respostas LIME sem chaves. Não executar em operação real.

Na Blip, o ticket de ensaio deve nascer do **transbordo real de uma conversa de teste pelo fluxo**, não de uma linha inserida diretamente em banco nem de resposta mock de `set /tickets`. Antes da entrada, fotografar o estado inicial por comandos LIME de leitura (`get /tickets`, `/attendants`, `/rules`) usando a chave do bot correto; após o transbordo, verificar `status === 'success'` dentro do envelope, buscar `/tickets/{id}/full-data` e `/tickets/{id}/messages` paginando a 100, e resolver o tunnel com a chave apropriada quando necessário. Comparar também a UI do Portal/Desk. A skill `blip-onboarding` alerta que HTTP 200 pode carregar `status: failure`, `sequential_id` só é identificador junto do bot e transferência pode emitir **novo ticket**.

1. Abrir ticket em cada fluxo; verificar fila/regra, monitoramento, histórico, contato e isolamento de acesso.
2. Transferir para fila e atendente; comparar ID do ticket antes/depois, `DIRECT_TRANSFER`, histórico e métricas.
3. Fechar/reabrir Desk e usar F5 com Online, Pausa e Invisível; verificar persistência, opção “Continuar online” e elegibilidade de distribuição.
4. Digitar `/` e `#` no compositor; testar filtro, Enter, inserção sem envio e janela de 24 h.
5. Redirecionar roteador → subbot com contexto ligado/desligado e mensagem de contexto; comparar `contact.identity`, `tunnel.identity`, `tunnel.originator`, variáveis e contato em cada bot.
6. Publicar nova versão de fluxo durante contato ativo; testar entradas, saída sequencial, fallback, ação falha e debug.
7. Enviar mensagem sem atendimento criado para novo número de teste; seguir webhook → contato → contexto → execução → ticket/saída, incluindo erro LIME com HTTP 200.
8. Criar template de texto com rodapé e respostas rápidas pela tela de Conteúdos; capturar payload submetido, resposta da Meta e versão aprovada. Repetir pelo formulário alternativo de Cadastros para comparar.
9. Abrir Click Tracker sem token de Marketing API de homologação; verificar se Pipe anuncia indevidamente “Conectado” e se os números mudam ao escolher evento/período. Na Blip, conectar apenas conta Meta de teste autorizada.
10. Quando houver contato BSUID de teste, repetir entrada, cadastro e envio sem número exposto; verificar que `telefone_e164` continua nulo e que o ID preservado resolve o destinatário corretamente.

## Restrições de acesso observadas

Há uma aba Chrome já aberta em `supernova.blip.ai/application`, mas a ligação de automação à aba falhou duas vezes por timeout. Isso **não** confirma ambiente de homologação. Existem arquivos `.env` locais de outros projetos; seus valores não foram lidos nem utilizados. A criação de tickets reais depende da identificação explícita de bot/tenant e número descartável de homologação. Até lá, os ensaios acima são roteiro, não resultados.
