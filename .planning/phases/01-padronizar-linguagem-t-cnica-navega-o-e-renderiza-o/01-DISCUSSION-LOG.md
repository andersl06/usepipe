# Phase 1: Padronizar linguagem técnica, navegação e renderização - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-24
**Phase:** 1-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o
**Areas discussed:** Vocabulário canônico, Fronteira código↔banco, URLs registradas fora, Comentários e fatiamento, Contrato de navegação e renderização (5ª área acrescentada pelo dono)

---

## Vocabulário canônico

| Pergunta | Opções | Escolha |
|---|---|---|
| Fonte do termo em inglês | Blip primeiro, idiomático depois / Idiomático próprio / Híbrido por camada | Blip primeiro, idiomático depois |
| Fixar "atendimento" | 3 termos distintos / conversation cobre tudo / Decidir no inventário | Decidir no inventário — executado com Codex (sol, medium) |
| Alcance do Codex | Inventário inteiro / Só glossário / Tudo que era Sonnet | Livre: "faz a divisão de tarefas... tem duas contas no codex, pode utilizar as duas" |
| Pastas, pacotes, apps | Tudo, apps com cuidado / Internas + pacotes / Só internas | Tudo, apps com cuidado |
| Aprovação | Glossário primeiro, mapa depois / Só ambíguos / Tudo de uma vez | Glossário primeiro, mapa depois |
| Nome de classe | Sufixo idiomático / Tradução literal | Sufixo idiomático |
| Env vars `PIPE_*` | Renomear com fallback / Seco / Exceção | Manter como exceção |
| Scripts e testes | Renomear ambos / Só testes | Renomear ambos |

**Notas:** Codex CLI 0.156.1 encontrado com perfis `~/.codex` e `~/.codex-conta2`.

---

## Fronteira código↔banco

| Pergunta | Opções | Escolha |
|---|---|---|
| Schema Drizzle | TS inglês, SQL intocado / Schema depois | TS inglês, SQL intocado |
| JSON de contratos e jsonb | Wire renomeia, jsonb não / Tudo PT / Por endpoint no inventário | Por endpoint no inventário |
| Filas, jobs, eventos WS, códigos de erro | Renomear com drenagem / Filas persistidas / Tudo persistido | Renomear com drenagem |
| Enums persistidos no código | Literal PT sob nome inglês / Camada de tradução | Definir no inventário |

---

## URLs registradas fora

| Pergunta | Opções | Escolha |
|---|---|---|
| `v1/auth/google/retorno` | Novo + alias / Corte seco / Exceção | Corte seco |
| `v1/auth/sso/retorno` | Não há cliente — corte seco / Há — alias / Verificar | Não há — corte seco |
| Convites e bookmarks | Corte seco / Só convite com redirect / Redirect em tudo | Corte seco em tudo |

---

## Comentários e fatiamento

| Pergunta | Opções | Escolha |
|---|---|---|
| Comentários PT | Traduzir todos via Codex / Só tocados / Ficam PT | Livre: 3 categorias (traduzir / remover redundante / validar antes de mexer no desatualizado), citações literais preservadas, Codex arquivo por arquivo, Sonnet revisa segurança/arquitetura/integrações |
| Ordem | Por camada / Por app / Big bang | Livre: bottom-up em 5 fatias com consumidores na mesma fatia, verde a cada fatia, deploy único |
| Linha de base | Consertar antes / Baseline com falhas | Consertar antes da fatia 1 |
| Branch | Nova a partir de limpeza / Direto em limpeza / Mesclar em master antes | Nova a partir de limpeza |

---

## Contrato de navegação e renderização

Evidência Blip levantada por pesquisa nas capturas (leitura de código, sem teste ao vivo).

| Pergunta | Opções | Escolha |
|---|---|---|
| Conversa aberta no Desk | ID no path / Paridade Blip / Validar ao vivo | Paridade com a Blip |
| Entrada externa numa conversa | Rota que consome e limpa / Remover link / postMessage | Livre: conversa no Desk não é compartilhável, só transferível; Gestão usa prévia própria — confirmado remover o link Gestão→Desk |
| Ticket histórico no contato | Path + query / Paridade Desk Blip / Tudo em state | Paridade com o Desk da Blip |
| Filtros aplicados | Query / Paridade Blip nova / Por tela | Paridade com a Blip nova |
| Passo de wizard | State / URL / Inventário | Decidir no inventário |
| Back/forward | Igual à Blip / Só entre telas | Igual à Blip |
| Renderização | SPA padrão, sem SSR / Avaliar por tela | SPA padrão, sem SSR |
| Deep link | Recursos de config/cadastro / Tudo no inventário | Tudo decidido no inventário |

---

## Claude's Discretion

- Divisão de tarefas entre Codex 1, Codex 2, Sonnet e Haiku.
- Formato/local dos artefatos de glossário e mapa.
- Mecanismo de drenagem de filas no deploy.

## Deferred Ideas

- Presets de filtro salvos.
- Migração de persistidos para inglês (por item do STD-06).
- Renomear env vars `PIPE_*`.
