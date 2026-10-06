# Proposta de preÃ§os do Pipe (para aprovaÃ§Ã£o do dono)

Status: **proposta, precisa de aprovaÃ§Ã£o do dono**. Data da pesquisa: 2026-10-06. CRM fora do escopo.
Regra do dono: planos do mesmo tipo dos omnichannel do mercado, porÃ©m mais baratos; foco em resolutividade e preÃ§o baixo.
CÃ¢mbio suposto: R$ 5,50/US$ (o mesmo de `docs/specs/2026-09-07-preco.md`). PreÃ§os mudam; tudo marcado "nÃ£o confirmado" nÃ£o foi lido em pÃ¡gina oficial.

## 1. O que jÃ¡ existe no cÃ³digo

- `packages/db/src/schema/identity.ts`: `PLANOS = ['essencial', 'operacao', 'escala']` e `LIMITES_DO_PLANO` (preÃ§o por atendente em centavos, mÃ­nimo de atendentes, conversas com IA por atendente, amostra de monitoria, excedente por conversa, SSO).
  - essencial: R$ 97/atendente, mÃ­nimo 3, 300 conversas IA/atendente, monitoria 20%, excedente R$ 0,25, sem SSO.
  - operacao: R$ 179/atendente, mÃ­nimo 5, 1.000 conversas IA/atendente, monitoria 100%, excedente R$ 0,18, sem SSO.
  - escala: sob contrato, mÃ­nimo 20, SSO, preÃ§o e franquia no registro do tenant.
- `docs/specs/2026-09-07-preco.md`: proposta anterior (por atendente, franquia de IA), custo medido (infra ~R$ 4,80 a R$ 8 por cliente; IA ~R$ 0,07 por conversa em modelo misto), Meta repassada. `REQUIREMENTS.md`: COBR-01 (mÃ³dulo de faturamento) e COBR-02 (unidade de cobranÃ§a Ã© decisÃ£o do dono).
- Esta proposta mantÃ©m os trÃªs nomes do cÃ³digo. Muda o modelo de cobranÃ§a de "por atendente" para "pacote mensal com N atendentes incluÃ­dos + atendente extra", porque Ã© a forma como Zenvia, Octadesk, Respond.io e a Blip Go vendem. Se o dono preferir manter por atendente, o equivalente estÃ¡ na seÃ§Ã£o 3.

## 2. Comparativo de mercado

| Plataforma | Plano | PreÃ§o | Inclui | Fonte (lida em 2026-10-06) |
|---|---|---|---|---|
| Zenvia (Customer Cloud) | Starter | R$ 0 | 1 usuÃ¡rio, 100 interaÃ§Ãµes | zenvia.com (via busca) |
| Zenvia | Specialist | R$ 600/mÃªs | 10 usuÃ¡rios, 500 interaÃ§Ãµes; usuÃ¡rio extra R$ 150; interaÃ§Ã£o extra R$ 1,32 | idem |
| Zenvia | Expert | R$ 1.800/mÃªs | 30 usuÃ¡rios, 2.000 interaÃ§Ãµes; extra R$ 100/usuÃ¡rio | idem |
| Zenvia | Professional | R$ 3.900/mÃªs | 50 usuÃ¡rios, 5.000 interaÃ§Ãµes | idem |
| Zenvia | Enterprise | sob consulta | | idem |
| Zenvia setup | | R$ 649 no 1o mÃªs se WhatsApp/RCS | taxas maiores nos planos altos | idem |
| Octadesk | One | a partir de R$ 2.499/mÃªs | 3.000 conversas ativas/dia; bot, automaÃ§Ã£o e IA inclusos; onboarding obrigatÃ³rio cotado Ã  parte | https://botaihub.com.br/ferramentas/octadesk/ e epicflow.com.br (terceiros, "confirmado em julho/2026"; nÃ£o confirmado no site oficial) |
| Octadesk | Flow | a partir de R$ 4.399/mÃªs | 5.500 conversas ativas/dia | idem |
| Octadesk | Nexus | sob consulta | 9.000/dia | idem |
| Digisac | sem planos fixos | "a partir de R$ 197" | preÃ§o por atendentes, canais, volume e IA; teste grÃ¡tis de 10 dias; sem tabela publicada | https://digisac.com.br/blog/quanto-custa-a-digisac |
| Blip (Take Blip) | Blip Go Basic | R$ 179,90/mÃªs | WhatsApp Business Platform, agente de IA, CRM Kanban bÃ¡sico, campanhas; nÂº de usuÃ¡rios nÃ£o confirmado | https://www.claro.com.br/files/104379/x/55058bcd79/tco-blip-go-1.pdf (via busca; nÃ£o confirmado no site) |
| Blip | Go IntermediÃ¡rio | R$ 239,90/mÃªs | idem | idem |
| Blip | Go AvanÃ§ado | R$ 399,90/mÃªs | idem | idem |
| Blip | Plano corporativo | sob consulta; casos citados ~R$ 1.000 a R$ 2.449+ (terceiros) | | b2bstack.com.br; spec de preÃ§o interna |
| Kommo | Base | US$ 20/usuÃ¡rio/mÃªs (novos clientes a partir de 1/set/2026) | CRM com mensageria; IA | https://www.kommo.com/br/blog/atualizacao-precos-kommo/ |
| Kommo | Advanced | US$ 30/usuÃ¡rio/mÃªs | atÃ© 3 agentes de IA, automaÃ§Ã£o | idem; Enterprise nÃ£o encontrado |
| Chatwoot Cloud | Hacker | US$ 0 | atÃ© 2 agentes, 500 conversas, sÃ³ live chat, retenÃ§Ã£o 30 dias | https://chatwoot.com/pricing |
| Chatwoot Cloud | Startups | US$ 19/agente/mÃªs (cobranÃ§a anual) | conversas ilimitadas, todos os canais, 300 crÃ©ditos de IA | idem |
| Chatwoot Cloud | Business | US$ 39/agente/mÃªs | times, automaÃ§Ã£o, SLA, 500 crÃ©ditos IA | idem |
| Chatwoot Cloud | Enterprise | US$ 99/agente/mÃªs | SSO, auditoria, 800 crÃ©ditos IA | idem; teste 15 dias; crÃ©dito extra US$ 20 por 1.000 |
| Chatwoot self-host | Community | grÃ¡tis (custo de servidor) | | idem (preÃ§o do self-host pago: nÃ£o confirmado) |
| Respond.io | Starter | US$ 79/mÃªs (US$ 948/ano) | 5 usuÃ¡rios, usuÃ¡rio extra US$ 12, 5.000 crÃ©ditos IA | https://respond.io/pricing |
| Respond.io | Growth | US$ 159/mÃªs | 10 usuÃ¡rios, extra US$ 20, fluxos, agentes de IA | idem |
| Respond.io | Advanced | US$ 279/mÃªs | 10 usuÃ¡rios, extra US$ 24, SSO | idem; cobra por contato ativo; Meta cobrada Ã  parte |
| Gupshup, Wati, Intercom | nÃ£o coletados | | | nÃ£o confirmado (fora do tempo desta pesquisa) |

ObservaÃ§Ãµes: Octadesk, Digisac, Blip e Zenvia nÃ£o publicam tudo no site e os nÃºmeros vÃªm de terceiros ou de busca; trate como indicativo. Em todos, a taxa da Meta Ã© cobrada Ã  parte (Respond.io diz isso explicitamente; Zenvia cobra setup do canal).

### Mediana por faixa equivalente (convertida a R$ 5,50)

| Faixa | Base de comparaÃ§Ã£o | Valores usados (R$/mÃªs) | Mediana |
|---|---|---|---|
| Entrada, 3 atendentes | Digisac 197, Blip Go IntermediÃ¡rio 240, Chatwoot Startups 313, Kommo Base 330, Respond Starter 435, Zenvia Specialist 600 | | **R$ 321** |
| IntermediÃ¡ria, 5 atendentes | Kommo Advanced 825, Respond Growth 874, Chatwoot Business 1.072, Octadesk One 2.499 | | **R$ 973** (R$ 874 se incluir Blip Go AvanÃ§ado 400) |
| Alta, 20 atendentes | Respond Advanced + 10 extras 2.855, Zenvia Professional 3.900, Chatwoot Business 20x 4.290, Octadesk Flow 4.399 | | **R$ 4.095** |

## 3. Os 3 planos propostos

Faixa-alvo: 25% a 40% abaixo da mediana da faixa equivalente.

| | Essencial | OperaÃ§Ã£o (destacado) | Escala |
|---|---|---|---|
| Mensal | **R$ 199** | **R$ 599** | a partir de **R$ 2.490** |
| Anual (por mÃªs, 20% off) | R$ 159 | R$ 479 | R$ 1.992 |
| Abaixo da mediana | 38% | 38% (viÃ©s conservador 31%) | 39% |
| Atendentes incluÃ­dos | 3 | 5 | 20 |
| Atendente extra | R$ 59 | R$ 99 | R$ 89 |
| Canais | WhatsApp, Pipe Chat, e-mail | + Instagram, Messenger | todos, + instÃ¢ncia dedicada opcional |
| Conversas (atendimento humano) | ilimitadas | ilimitadas | ilimitadas |
| Bot e agente de IA | fluxos no Builder; IA 300 conversas/atendente (900) | IA 1.000 conversas/atendente (5.000) | IA negociada |
| Excedente de IA | R$ 0,25 | R$ 0,18 | tabela |
| Monitoria | amostra de 20% | 100% | 100% + calibraÃ§Ã£o |
| HistÃ³rico retido | 90 dias | 12 meses | 24 meses (ou contrato) |
| Suporte | e-mail, 1 dia Ãºtil | e-mail e WhatsApp, 4 h | canal direto, 1 h |
| SSO | nÃ£o | nÃ£o | sim |
| Setup | sem taxa | sem taxa | a combinar |
| Teste grÃ¡tis | 14 dias (sugestÃ£o) | 14 dias | piloto |

Equivalente por atendente (se o dono quiser manter o modelo atual do cÃ³digo): Essencial 3 x R$ 66, OperaÃ§Ã£o 5 x R$ 120. O cÃ³digo hoje tem R$ 97 e R$ 179, portanto estes preÃ§os exigem alterar `LIMITES_DO_PLANO` e criar o conceito de "pacote + extra" (COBR-01/02).

Isso fica abaixo da Blip Go IntermediÃ¡rio (R$ 239,90) sÃ³ no Essencial; o nÃºmero de usuÃ¡rios e limites da Blip Go nÃ£o foram confirmados.

## 4. Premissas explÃ­citas e verificaÃ§Ã£o de custo

1. Infra por cliente: R$ 4,80 a R$ 8 (degrau 2 e 1 do spec de preÃ§o); instÃ¢ncia dedicada ~R$ 96 (Escala).
2. Meta WhatsApp repassada ao custo, fora do plano e fora da margem.
3. IA: o spec usa Anthropic (Haiku/Sonnet) com R$ 0,07 por conversa, valor mantido como conservador. CotaÃ§Ã£o OpenAI de referÃªncia (pricepertoken.com, lida em 2026-10-06; fontes divergem, Azure/batch aparece pela metade): GPT-5 mini US$ 0,25/1M entrada e US$ 2,00/1M saÃ­da; GPT-4.1 mini US$ 0,40 e US$ 1,60. Conversa de agente com ~15 mil tokens de entrada (contexto acumulado) e ~2 mil de saÃ­da em GPT-5 mini: US$ 0,0078 = **R$ 0,043**. Usamos R$ 0,07 para ter folga.
4. Uso: todo o limite de IA consumido (pior caso). Suporte, impostos e gateway de pagamento nÃ£o incluÃ­dos.

| Plano | Receita | Custo direto (pior caso) | Margem bruta |
|---|---|---|---|
| Essencial (3 atend., 900 conv. IA) | R$ 199 | 900 x 0,07 + 5 = R$ 68 | **66%** |
| OperaÃ§Ã£o (5 atend., 5.000 conv. IA) | R$ 599 | 5.000 x 0,07 + 5 = R$ 355 | **41%** (com uso tÃ­pico de 40% do limite: ~R$ 145, 76%) |
| Escala (20 atend., 10.000 conv. IA, dedicado) | R$ 2.490 | 700 + 96 = R$ 796 | **68%** |
| Anual com 20% off, OperaÃ§Ã£o | R$ 479 | R$ 355 | 26% no pior caso (ver risco) |

Meta (pass-through, informativo): modelo por mensagem desde 1/jul/2025; sÃ³ mensagens template sÃ£o cobradas, conforme categoria (marketing, utilidade, autenticaÃ§Ã£o) e paÃ­s do destinatÃ¡rio; mensagens de serviÃ§o dentro da janela de 24 h sÃ£o gratuitas, e utilidade dentro da janela tambÃ©m; janela de 72 h gratuita para anÃºncios Click to WhatsApp; desconto por volume em utilidade e autenticaÃ§Ã£o; contas em BRL desde 1/jul/2026 (fonte: developers.facebook.com/documentation/business-messaging/whatsapp/pricing). Valores de referÃªncia de terceiro, nÃ£o confirmados no rate card oficial: marketing ~R$ 0,39, utilidade ~R$ 0,08, autenticaÃ§Ã£o ~R$ 0,09 por mensagem. **Isso Ã© cobrado pela Meta e nÃ£o estÃ¡ incluso em nenhum plano do Pipe.**

## 5. Riscos

- **SubpreÃ§o vs. sustentabilidade**: OperaÃ§Ã£o no pior caso de IA fica com 41% de margem, 26% no anual. MitigaÃ§Ã£o: franquia de IA com corte e aviso (nÃ£o excedente automÃ¡tico), como recomenda o spec anterior.
- CÃ¢mbio: dÃ³lar a R$ 6,50 reduz a margem de IA em ~18%.
- Comparativos de Octadesk, Digisac e Blip vÃªm de terceiros e podem estar defasados; Blip Go pode ser mais barata que o Essencial em casos de 1 atendente.
- PreÃ§o muito baixo pode sinalizar produto inferior; reforÃ§ar a histÃ³ria de "nÃºmero do cliente, Meta visÃ­vel, preÃ§o publicado".
- Tabela comparativa nÃ£o inclui Gupshup, Wati e Intercom.
- DependÃªncia de construir cobranÃ§a (COBR-01) e mediÃ§Ã£o de conversas de IA por tenant antes de vender.

## 6. Perguntas para o dono

1. Cobrar por **pacote com atendentes incluÃ­dos** (esta proposta) ou manter **por atendente** (R$ 97/179 no cÃ³digo)?
2. Ao estourar a franquia de IA: **parar e avisar** ou **cobrar excedente**? E o desconto anual de 20% Ã© aceitÃ¡vel dado o pior caso de margem?
3. Qual o nicho de lanÃ§amento? Define se o Essencial (R$ 199, 3 atendentes) ou a OperaÃ§Ã£o Ã© o plano de entrada, e se hÃ¡ teste grÃ¡tis de 14 dias.

## DecisÃµes do dono (2026-10-06)

1. **Modelo:** pacote fechado (Essencial, OperaÃ§Ã£o, Escala), nÃ£o por atendente.
2. **Cota de IA estourada:** **cobra a mais** (o atendimento da IA nÃ£o para). O valor do excedente ainda **nÃ£o foi definido**: precisa de um preÃ§o por conversa de IA acima da cota (custo estimado de R$ 0,07 por conversa).
3. **Teste grÃ¡tis:** **7 dias**.
4. **Nicho de lanÃ§amento:** sem resposta ainda.
5. Os valores dos trÃªs planos seguem como propostos acima, atÃ© o dono dizer o contrÃ¡rio. Concorrentes nÃ£o aparecem na LP.

ConsequÃªncias no cÃ³digo (Fase 6, COBR-01/02): `LIMITES_DO_PLANO` (hoje por atendente) precisa virar pacote; construir cobranÃ§a do excedente de IA e controle do perÃ­odo de teste de 7 dias.
