# Placeholders da landing page

Tudo o que ainda é provisório em `index.html`. Cada item tem marcador `data-placeholder` (e, nos depoimentos, o comentário `PLACEHOLDER: replace with a real, authorized testimonial before launch`).

## Before launch

- [ ] Liberar a origem `https://pipebr.app` nas configurações do canal do Pipe Chat. Sem isso o widget responde 403 e não aparece fora do domínio do canal. O script está no fim do `index.html`, antes de `</body>`.
- [ ] Confirmar os preços dos planos (abaixo) com o dono.
- [x] Depoimentos: a seção virou "Cenários de uso" (personagens fictícios, sem aspas de cliente e sem métricas de resultado), pronta para publicar. Quando houver um caso real autorizado por escrito, trocar o cenário correspondente.
- [ ] Ligar o formulário de contato e o botão "Teste grátis por 7 dias" ao cadastro/CRM de leads real.
- [ ] Gerar as imagens de `IMAGE-PROMPTS.md` e salvar em `assets/images/`.
- [ ] Gerar `assets/og-pipe.png` (1200x630), referenciado nas metatags e ainda inexistente.
- [ ] Páginas `/privacidade/` e `/termos/` ainda não existem (os links do rodapé caem na home pelo `error_page` do nginx).

## Cenários de uso (`data-scenario`, 3)

Personagens fictícios (Helena, Rafael e Camila), descritos em terceira pessoa como exemplos de uso. Não há citação de cliente nem número de resultado. A linha "Cenários ilustrativos, com personagens fictícios..." sob os cartões deve ficar enquanto forem fictícios. As fotos (`depoimento-*.webp`) são retratos de personagens inventados.

## data-placeholder="pricing" (3 planos)

Valores PROPOSTOS, a confirmar antes do lançamento (fonte: `pricing-proposal.json`). Preço anual = 20% de desconto.

| Plano | Mensal | Anual (por mês) | Atendentes | Atendente extra | Histórico | Canais |
|---|---|---|---|---|---|---|
| Essencial | R$ 199 | R$ 159 | 3 | R$ 59 | 90 dias | WhatsApp, Pipe Chat, e-mail |
| Operação (destaque) | R$ 599 | R$ 479 | 5 | R$ 99 | 12 meses | os 5 canais |
| Escala | a partir de R$ 2.490 | R$ 1.992 | 20 | R$ 89 | 24 meses | os 5 canais |

Cota de IA: Essencial 900 conversas/mês, Operação 5.000, Escala definida em contrato. Tarifas de mensagem do WhatsApp são da Meta e não estão incluídas (nota sob os planos). Não há comparação com concorrentes na página, de propósito.

## data-placeholder="pricing-overage"

Definido pelo dono: R$ 0,30 por conversa de IA acima da cota do plano. Texto sob os planos. Já não é incógnita, mas mantém o marcador para conferência com os planos.

## data-placeholder="contact"

Formulário `#contato`: não envia nada. Ao enviar, mostra "Este formulário ainda está sendo conectado" (ver `assets/landing.js`). Nenhum telefone ou e-mail foi inventado. Os botões "Teste grátis por 7 dias" e "Falar com um especialista" levam para `#contato` e pré-selecionam o assunto; o widget Pipe Chat tem o seu próprio botão "Falar com um especialista".

## Demonstrações do Desk e da Gestão (hero)

São maquetes em HTML/CSS (não imagens), com dados inventados (Marina Alves, Loja Girassol etc.), `aria-hidden` e `pointer-events:none`. Refletem o visual do app, mas não são capturas reais. Quando houver dados de demonstração semeados no app, podem ser trocadas por capturas webp de até 250 KB.