# Pipe Gestão (Vite)

A Gestão como SPA — `docs/specs/2026-09-07-arquitetura-de-front.md`, decidida de
vez em 17/09/2026: Vite + SWC, React 19, React Router 7, TanStack Query, CSS
puro com os tokens de `@pipe/ui`. A `api` NestJS é a única porta para o banco.

Substitui `apps/gestao` (Next) tela a tela; quando chegar à paridade, o Next sai.

## Subir

```bash
pnpm --filter @pipe/api dev          # :3010 (o .env da raiz)
pnpm --filter @pipe/gestao-vite dev  # :3110, com proxy de /v1 para a api
```

Sessão em desenvolvimento: abrir `http://localhost:3010/v1/auth/dev` uma vez
(o cookie `pipe_sessao` é do host `localhost`, e vale para a 3110).

## O que já migrou (toda a Gestão)

- Entrada: `/entrar`, `/convite/:token`
- Portal e conta: `/portal`, `/novidades`, `/contrato` (+ membros, certificados),
  `/minha-conta`, `/bem-vindo`, `/trocar-conta/sem-acesso`, `/criar/fluxo`,
  `/criar/roteador`
- Contato (`/fluxo/:id/**`): home, canais, serviços, contatos, integrações, log,
  growth, configurações, conteúdos e as sete abas da Análise
- Operação (casco de barras + lateral): monitoramento, histórico, relatórios
  (atendimento, esforço, satisfação), monitoria e ficha, implantação, canais
- Cadastros: regras (atendimento, horários), atendentes (gestão, filas, pausas),
  comunicação (modelos, respostas prontas), preferências (regras, dados, gerais)

Cada tela é a MESMA do Next (mesmo CSS, mesmas regras, mesmos testes); só a
leitura mudou: de server component para `GET /v1/gestao/…` (`lib/consulta.ts`),
e cada Server Action virou `POST` (`lib/acoes.ts` para os formulários dos
cadastros; `paginas/*/acoes.ts` para os demais).

## O que ficou de fora, de propósito

- A troca de conta pelo SUBDOMÍNIO (`<conta>.usepipe…`), que era o `middleware.ts`
  do Next: em desenvolvimento não há subdomínio; em produção é decisão de edge
  (ver a spec, §3). A troca pelo seletor da barra do portal funciona.
- Certificados mTLS seguem sem armazenamento (`lib/certificados.ts`).
