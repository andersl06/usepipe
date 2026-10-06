# Proposta de preços do Pipe (para aprovação do dono)

Status: **proposta, precisa de aprovação do dono**. Data da pesquisa: 2026-10-06. CRM fora do escopo.
Regra do dono: planos do mesmo tipo dos omnichannel do mercado, porém mais baratos; foco em resolutividade e preço baixo.
Câmbio suposto: R$ 5,50/US$ (o mesmo de `docs/specs/2026-09-07-preco.md`). Preços mudam; tudo marcado "não confirmado" não foi lido em página oficial.

## 1. O que já existe no código

- `packages/db/src/schema/identity.ts`: `PLANOS = ['essencial', 'operacao', 'escala']` e `LIMITES_DO_PLANO` (preço por atendente em centavos, mínimo de atendentes, conversas com IA por atendente, amostra de monitoria, excedente por conversa, SSO).
  - essencial: R$ 97/atendente, mínimo 3, 300 conversas IA/atendente, monitoria 20%, excedente R$ 0,25, sem SSO.
  - operacao: R$ 179/atendente, mínimo 5, 1.000 conversas IA/atendente, monitoria 100%, excedente R$ 0,18, sem SSO.
  - escala: sob contrato, mínimo 20, SSO, preço e franquia no registro do tenant.
- `docs/specs/2026-09-07-preco.md`: proposta anterior (por atendente, franquia de IA), custo medido (infra ~R$ 4,80 a R$ 8 por cliente; IA ~R$ 0,07 por conversa em modelo misto), Meta repassada. `REQUIREMENTS.md`: COBR-01 (módulo de faturamento) e COBR-02 (unidade de cobrança é decisão do dono).
- Esta proposta mantém os três nomes do código. Muda o modelo de cobrança de "por atendente" para "pacote mensal com N atendentes incluídos + atendente extra", porque é a forma como Zenvia, Octadesk, Respond.io e a Blip Go vendem. Se o dono preferir manter por atendente, o equivalente está na seção 3.

## 2. Comparativo de mercado

| Plataforma | Plano | Preço | Inclui | Fonte (lida em 2026-10-06) |
|---|---|---|---|---|
| Zenvia (Customer Cloud) | Starter | R$ 0 | 1 usuário, 100 interações | zenvia.com (via busca) |
| Zenvia | Specialist | R$ 600/mês | 10 usuários, 500 interações; usuário extra R$ 150; interação extra R$ 1,32 | idem |
| Zenvia | Expert | R$ 1.800/mês | 30 usuários, 2.000 interações; extra R$ 100/usuário | idem |
| Zenvia | Professional | R$ 3.900/mês | 50 usuários, 5.000 interações | idem |
| Zenvia | Enterprise | sob consulta | | idem |
| Zenvia setup | | R$ 649 no 1o mês se WhatsApp/RCS | taxas maiores nos planos altos | idem |
| Octadesk | One | a partir de R$ 2.499/mês | 3.000 conversas ativas/dia; bot, automação e IA inclusos; onboarding obrigatório cotado à parte | https://botaihub.com.br/ferramentas/octadesk/ e epicflow.com.br (terceiros, "confirmado em julho/2026"; não confirmado no site oficial) |
| Octadesk | Flow | a partir de R$ 4.399/mês | 5.500 conversas ativas/dia | idem |
| Octadesk | Nexus | sob consulta | 9.000/dia | idem |
| Digisac | sem planos fixos | "a partir de R$ 197" | preço por atendentes, canais, volume e IA; teste grátis de 10 dias; sem tabela publicada | https://digisac.com.br/blog/quanto-custa-a-digisac |
| Blip (Take Blip) | Blip Go Basic | R$ 179,90/mês | WhatsApp Business Platform, agente de IA, CRM Kanban básico, campanhas; nº de usuários não confirmado | https://www.claro.com.br/files/104379/x/55058bcd79/tco-blip-go-1.pdf (via busca; não confirmado no site) |
| Blip | Go Intermediário | R$ 239,90/mês | idem | idem |
| Blip | Go Avançado | R$ 399,90/mês | idem | idem |
| Blip | Plano corporativo | sob consulta; casos citados ~R$ 1.000 a R$ 2.449+ (terceiros) | | b2bstack.com.br; spec de preço interna |
| Kommo | Base | US$ 20/usuário/mês (novos clientes a partir de 1/set/2026) | CRM com mensageria; IA | https://www.kommo.com/br/blog/atualizacao-precos-kommo/ |
| Kommo | Advanced | US$ 30/usuário/mês | até 3 agentes de IA, automação | idem; Enterprise não encontrado |
| Chatwoot Cloud | Hacker | US$ 0 | até 2 agentes, 500 conversas, só live chat, retenção 30 dias | https://chatwoot.com/pricing |
| Chatwoot Cloud | Startups | US$ 19/agente/mês (cobrança anual) | conversas ilimitadas, todos os canais, 300 créditos de IA | idem |
| Chatwoot Cloud | Business | US$ 39/agente/mês | times, automação, SLA, 500 créditos IA | idem |
| Chatwoot Cloud | Enterprise | US$ 99/agente/mês | SSO, auditoria, 800 créditos IA | idem; teste 15 dias; crédito extra US$ 20 por 1.000 |
| Chatwoot self-host | Community | grátis (custo de servidor) | | idem (preço do self-host pago: não confirmado) |
| Respond.io | Starter | US$ 79/mês (US$ 948/ano) | 5 usuários, usuário extra US$ 12, 5.000 créditos IA | https://respond.io/pricing |
| Respond.io | Growth | US$ 159/mês | 10 usuários, extra US$ 20, fluxos, agentes de IA | idem |
| Respond.io | Advanced | US$ 279/mês | 10 usuários, extra US$ 24, SSO | idem; cobra por contato ativo; Meta cobrada à parte |
| Gupshup, Wati, Intercom | não coletados | | | não confirmado (fora do tempo desta pesquisa) |

Observações: Octadesk, Digisac, Blip e Zenvia não publicam tudo no site e os números vêm de terceiros ou de busca; trate como indicativo. Em todos, a taxa da Meta é cobrada à parte (Respond.io diz isso explicitamente; Zenvia cobra setup do canal).

### Mediana por faixa equivalente (convertida a R$ 5,50)

| Faixa | Base de comparação | Valores usados (R$/mês) | Mediana |
|---|---|---|---|
| Entrada, 3 atendentes | Digisac 197, Blip Go Intermediário 240, Chatwoot Startups 313, Kommo Base 330, Respond Starter 435, Zenvia Specialist 600 | | **R$ 321** |
| Intermediária, 5 atendentes | Kommo Advanced 825, Respond Growth 874, Chatwoot Business 1.072, Octadesk One 2.499 | | **R$ 973** (R$ 874 se incluir Blip Go Avançado 400) |
| Alta, 20 atendentes | Respond Advanced + 10 extras 2.855, Zenvia Professional 3.900, Chatwoot Business 20x 4.290, Octadesk Flow 4.399 | | **R$ 4.095** |

## 3. Os 3 planos propostos

Faixa-alvo: 25% a 40% abaixo da mediana da faixa equivalente.

| | Essencial | Operação (destacado) | Escala |
|---|---|---|---|
| Mensal | **R$ 199** | **R$ 599** | a partir de **R$ 2.490** |
| Anual (por mês, 20% off) | R$ 159 | R$ 479 | R$ 1.992 |
| Abaixo da mediana | 38% | 38% (viés conservador 31%) | 39% |
| Atendentes incluídos | 3 | 5 | 20 |
| Atendente extra | R$ 59 | R$ 99 | R$ 89 |
| Canais | WhatsApp, Pipe Chat, e-mail | + Instagram, Messenger | todos, + instância dedicada opcional |
| Conversas (atendimento humano) | ilimitadas | ilimitadas | ilimitadas |
| Bot e agente de IA | fluxos no Builder; IA 300 conversas/atendente (900) | IA 1.000 conversas/atendente (5.000) | IA negociada |
| Excedente de IA | R$ 0,25 | R$ 0,18 | tabela |
| Monitoria | amostra de 20% | 100% | 100% + calibração |
| Histórico retido | 90 dias | 12 meses | 24 meses (ou contrato) |
| Suporte | e-mail, 1 dia útil | e-mail e WhatsApp, 4 h | canal direto, 1 h |
| SSO | não | não | sim |
| Setup | sem taxa | sem taxa | a combinar |
| Teste grátis | 14 dias (sugestão) | 14 dias | piloto |

Equivalente por atendente (se o dono quiser manter o modelo atual do código): Essencial 3 x R$ 66, Operação 5 x R$ 120. O código hoje tem R$ 97 e R$ 179, portanto estes preços exigem alterar `LIMITES_DO_PLANO` e criar o conceito de "pacote + extra" (COBR-01/02).

Isso fica abaixo da Blip Go Intermediário (R$ 239,90) só no Essencial; o número de usuários e limites da Blip Go não foram confirmados.

## 4. Premissas explícitas e verificação de custo

1. Infra por cliente: R$ 4,80 a R$ 8 (degrau 2 e 1 do spec de preço); instância dedicada ~R$ 96 (Escala).
2. Meta WhatsApp repassada ao custo, fora do plano e fora da margem.
3. IA: o spec usa Anthropic (Haiku/Sonnet) com R$ 0,07 por conversa, valor mantido como conservador. Cotação OpenAI de referência (pricepertoken.com, lida em 2026-10-06; fontes divergem, Azure/batch aparece pela metade): GPT-5 mini US$ 0,25/1M entrada e US$ 2,00/1M saída; GPT-4.1 mini US$ 0,40 e US$ 1,60. Conversa de agente com ~15 mil tokens de entrada (contexto acumulado) e ~2 mil de saída em GPT-5 mini: US$ 0,0078 = **R$ 0,043**. Usamos R$ 0,07 para ter folga.
4. Uso: todo o limite de IA consumido (pior caso). Suporte, impostos e gateway de pagamento não incluídos.

| Plano | Receita | Custo direto (pior caso) | Margem bruta |
|---|---|---|---|
| Essencial (3 atend., 900 conv. IA) | R$ 199 | 900 x 0,07 + 5 = R$ 68 | **66%** |
| Operação (5 atend., 5.000 conv. IA) | R$ 599 | 5.000 x 0,07 + 5 = R$ 355 | **41%** (com uso típico de 40% do limite: ~R$ 145, 76%) |
| Escala (20 atend., 10.000 conv. IA, dedicado) | R$ 2.490 | 700 + 96 = R$ 796 | **68%** |
| Anual com 20% off, Operação | R$ 479 | R$ 355 | 26% no pior caso (ver risco) |

Meta (pass-through, informativo): modelo por mensagem desde 1/jul/2025; só mensagens template são cobradas, conforme categoria (marketing, utilidade, autenticação) e país do destinatário; mensagens de serviço dentro da janela de 24 h são gratuitas, e utilidade dentro da janela também; janela de 72 h gratuita para anúncios Click to WhatsApp; desconto por volume em utilidade e autenticação; contas em BRL desde 1/jul/2026 (fonte: developers.facebook.com/documentation/business-messaging/whatsapp/pricing). Valores de referência de terceiro, não confirmados no rate card oficial: marketing ~R$ 0,39, utilidade ~R$ 0,08, autenticação ~R$ 0,09 por mensagem. **Isso é cobrado pela Meta e não está incluso em nenhum plano do Pipe.**

## 5. Riscos

- **Subpreço vs. sustentabilidade**: Operação no pior caso de IA fica com 41% de margem, 26% no anual. Mitigação: franquia de IA com corte e aviso (não excedente automático), como recomenda o spec anterior.
- Câmbio: dólar a R$ 6,50 reduz a margem de IA em ~18%.
- Comparativos de Octadesk, Digisac e Blip vêm de terceiros e podem estar defasados; Blip Go pode ser mais barata que o Essencial em casos de 1 atendente.
- Preço muito baixo pode sinalizar produto inferior; reforçar a história de "número do cliente, Meta visível, preço publicado".
- Tabela comparativa não inclui Gupshup, Wati e Intercom.
- Dependência de construir cobrança (COBR-01) e medição de conversas de IA por tenant antes de vender.

## 6. Perguntas para o dono

1. Cobrar por **pacote com atendentes incluídos** (esta proposta) ou manter **por atendente** (R$ 97/179 no código)?
2. Ao estourar a franquia de IA: **parar e avisar** ou **cobrar excedente**? E o desconto anual de 20% é aceitável dado o pior caso de margem?
3. Qual o nicho de lançamento? Define se o Essencial (R$ 199, 3 atendentes) ou a Operação é o plano de entrada, e se há teste grátis de 14 dias.
