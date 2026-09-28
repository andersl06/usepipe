# D-52 edge check (nginx, Vite, Traefik)

**Date:** 2026-09-28
**Conclusion:** nenhuma mudança necessária — a borda já serve `/application/**` corretamente.

## `apps/management-vite/nginx.conf`

`location / { try_files $uri /index.html; }` — SPA fallback genérico, sem lista de rotas
conhecidas. Qualquer caminho sem arquivo próprio no disco (inclusive todo `/application/**`)
cai no `index.html`, e o React Router resolve a partir daí. Nenhuma mudança de comportamento
necessária; só o comentário (que citava os exemplos PT antigos `/portal`, `/fluxo/:id`) foi
atualizado para os exemplos atuais neste plano.

## `apps/management-vite/vite.config.ts`

Sem `base` configurado em `defineConfig` — o app serve tudo a partir da raiz (`/`), então
`/application/**` não colide com nenhum prefixo reservado pelo bundler. Confirmado por leitura
do arquivo; nenhuma mudança necessária.

## Traefik (`infra/compose/docker-compose.prod.yml`)

O roteamento é por **Host**, não por `PathPrefix`, para os três fronts e a API:

```
traefik.http.routers.api.rule=Host(`api.usepipe.com.br`) && !PathPrefix(`/metrics`)
traefik.http.routers.desk.rule=Host(`app.usepipe.com.br`)
traefik.http.routers.management.rule=Host(`gestao.usepipe.com.br`)
traefik.http.routers.crm.rule=Host(`crm.usepipe.com.br`)
```

Nenhum roteador casa por caminho (`PathPrefix`) dentro de um host que sirva a Gestão — a única
negação de `PathPrefix` é a da própria API para `/metrics`, sem relação com `/application`.
Confirmado por `grep -in "PathPrefix\|traefik.http.routers" infra/compose/docker-compose.prod.yml`
neste plano: nenhum roteador de outro serviço poderia interceptar `/application/**` dentro do
host da Gestão. Nenhuma mudança necessária.
