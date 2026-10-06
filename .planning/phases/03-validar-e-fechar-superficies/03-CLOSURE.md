# Fase 3: Validar e fechar superfícies atuais — fechamento

**Data:** 2026-10-06. Fonte: respostas do dono, uma a uma. A Fase 3 não tem planos próprios; ela atesta o que as fases 02, 03.1, 03.1.1, 03.2 e 03.3 entregaram.

## Critérios

| # | Critério | Veredito do dono | Evidência / ressalva |
|---|---|---|---|
| 1 | Desk aprovado visualmente contra a Blip | **Aprovado** | Resposta do dono em 2026-10-06 |
| 2 | Atendimento (monitoramento, histórico, encerramento, filas, atendentes, pausas, regras) funcional e aprovado | **Aprovado** ("tudo aprovado") | Fase 03.2 (portões 19, 22 e 25 e GATE-FINAL ficam aprovados por esta resposta; registrar no `03.2-` correspondente) |
| 3 | Conexão de canal WhatsApp aprovada visualmente | **Parcial ("mais ou menos")** | Pipe Chat não funcionava para o dono. Causa achada e corrigida em `dcf3b7e8` (o widget não lia o envelope `{data:[...]}` da API, então nunca exibia mensagens). Falta o dono reconferir depois do deploy; Pipe Chat só foi exercitado com a API real em ambiente local |
| 4 | Instagram e Messenger validados de ponta a ponta | **Aprovado pelo dono, condicional** ("não cheguei a conectar... se sim, por mim está aprovado") | Só testes automáticos com payloads simulados no formato da Meta: `instagram.test.ts` (14 casos) e `messenger.test.ts` (7). Nunca conectado a conta real da Meta. Validação com contas reais fica para a Fase 5 |
| 5 | Inventário das demais superfícies com classificação | **Aberto** | `.planning/phases/03.4-inventario-em-breve-e-nao-disponivel/INVENTORY.md` cobre só o que está marcado "em breve/não disponível". Falta uma tabela de todas as superfícies com o estado (implementada, verificada, aprovada) |

## Superfícies já aprovadas por fase (referência)

- Fase 2 Builder: aprovada com overrides do dono (C-42 sem comparação, linhas NEEDS VALIDATION aceitas).
- Fase 03.3: 13 pontos aprovados em bloco (2026-10-06).
- Fase 03.2 Atendimento: aprovada por esta resposta.
- Pendências abertas: Fase 03.1 (itens de navegador e WhatsApp real), 03.1.1 (HUMAN-UAT, token do canal "Test Number" expirado).
