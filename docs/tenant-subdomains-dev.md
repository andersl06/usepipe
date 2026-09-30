# Subdomínios de tenant no desenvolvimento

Use `lvh.me` para reproduzir o cookie compartilhado sem tocar no domínio real planejado (`pipebr.ai`). `lvh.me` resolve para `127.0.0.1`; sem DNS externo, acrescente `login.lvh.me`, `alfa.lvh.me`, `beta.lvh.me`, `alfa.desk.lvh.me` e `beta.desk.lvh.me` ao arquivo `hosts` local. A validação do domínio real deve usar HTTPS.

Pré-requisitos: Node/pnpm do projeto, Postgres e Redis locais já preparados e migrations locais previamente aplicadas pelo operador. Este guia não executa migrations. Evite rodar os Vite servers expostos a uma rede pública (`0.0.0.0`).

Copie `.env.example` para `.env` e ative o bloco `lvh.me`: `PIPE_DOMINIO_CONTAS=lvh.me`, `PIPE_COOKIE_DOMINIO=.lvh.me`, `PIPE_PORTA_PUBLICA=3110`, `PIPE_COOKIE_SEGURO=false`. Ajuste `GOOGLE_URL_RETORNO` para `http://login.lvh.me:3110/v1/auth/google/callback` (apenas configuração local; use login de dev, não OAuth Google). A API confere o par domínio/cookie ao iniciar. `PIPE_ORIGENS` contém apenas origens fixas extras, como CRM; origens dos tenants são aceitas pelo sufixo validado.

Crie dois tenants de teste com slugs `alfa` e `beta` e usuários locais distintos usando `pnpm --filter @pipe/api provision --nome "Alfa" --slug alfa --plano operacao --admin alfa@exemplo.test` e o equivalente para `beta`. O provisionamento também configura domínio do usuário; consulte a saída para a eventual verificação. Dados de seed locais também podem ser usados se já criarem esses slugs e usuários. Nunca use e-mails de cliente real.

Inicie `pnpm --filter @pipe/api dev`, `pnpm --filter @pipe/management-vite dev` e `pnpm --filter @pipe/desk-vite dev` em terminais separados. A API fica em 3010, Gestão em 3110, Desk em 3210. Entre por `http://login.lvh.me:3110/` e use o login de desenvolvimento (`/v1/auth/dev?email=alfa@exemplo.test`) pelo proxy dessa origem. Em seguida, abra `http://alfa.lvh.me:3110/application` e `http://alfa.desk.lvh.me:3210/`. O cookie `.lvh.me` permite a mesma sessão nas duas telas. Ao visitar `http://beta.lvh.me:3110/application` com a sessão de alfa, a API responde `403 tenant_mismatch` e a tela volta ao login central; não revela dados de beta.

No modo `*.localhost`, configure `PIPE_DOMINIO_CONTAS=localhost`, `PIPE_COOKIE_DOMINIO=` e `PIPE_PORTA_PUBLICA=3110`. Navegadores não compartilham `Domain=.localhost`. Para testar esse modo, abra `/v1/auth/dev?email=...` no próprio host de cada aplicativo (`alfa.localhost:3110` e `alfa.desk.localhost:3210`); cada um recebe um cookie host-only e pede login separado. O fluxo completo entre telas deve ser testado em `lvh.me`.

O script `scripts/dev-tenant-smoke.sh` automatiza as verificações pelo proxy do Vite com `curl --resolve`, dispensando DNS público; requer os serviços locais e usuários de teste prontos.
