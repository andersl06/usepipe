# Adendo: subdomínios por tenant

Decisão registrada em 29/09/2026. Este adendo substitui **somente a topologia de hosts fixos, a descoberta de tenant pelo login e o HTTP-01 como modo normal de certificado** nas specs de infraestrutura de 05/09 e implantação de 07/09. As demais decisões permanecem até revisão própria. A fonte de decisão detalhada é [01.1-CONTEXT.md](../../.planning/phases/01.1-subdominio-por-tenant/01.1-CONTEXT.md); a ativação futura está no [runbook](../../infra/runbooks/domain-activation.md).

| Host | Papel |
|---|---|
| `<D>` | site público |
| `www.<D>` | redirecionamento 301 para `<D>` |
| `login.<D>` | login e convites centrais; callback OAuth/SSO |
| `api.<D>` | API, webhooks e integrações |
| `crm.<D>` | CRM |
| `metricas.<D>` | Grafana opcional |
| `<slug>.<D>` | Gestão do tenant |
| `<slug>.desk.<D>` | Desk do mesmo tenant |

`D` é `PIPE_DOMINIO_CONTAS` validado, sem literal em código. `portal.<D>` e outros nomes reservados não são tenants; não têm router próprio, salvo os hosts fixos listados. O tenant de uma requisição autenticada nasce do Host original no navegador; em `api.<D>`, o Origin validado pode fornecer o slug. O servidor compara esse slug com o tenant da sessão ou da chave de API **antes** de atender dados ou fazer upgrade de WebSocket. A URL `returnTo` é aceita apenas para o tenant autenticado. A troca de hostname não troca o tenant da credencial.

O cookie de sessão usa `Domain=.<D>` para Gestão, Desk e login central, `Secure` em produção. Em desenvolvimento, `lvh.me` demonstra o compartilhamento; `*.localhost` usa cookie host-only e exige login por aplicativo. Origens fixas continuam em `PIPE_ORIGENS`; hosts de tenant são aceitos apenas pelo parser estrito de sufixo e slug. Reservados e domínios de terceiros nunca devem herdar autoridade de tenant.

Traefik roteia por padrões de host com prioridade explícita, com `/v1` no próprio host do tenant encaminhado à API. Em domínio real, ACME DNS-01 emite pedidos separados para `*.<D>`, `*.desk.<D>` e `<D>` + `www.<D>`; todos os A são DNS only, com CAA para Let's Encrypt. O modo pré-domínio `.sslip.io` usa HTTP-01 apenas para poucos tenants de smoke explícitos, sem certificado curinga. Nenhum CNAME de serviço terceiro deve ficar na zona que recebe o cookie.

O domínio pretendido é `usepipe.app`, mas a compra, o DNS, o deploy e o smoke na VPS são checkpoints do dono; este adendo não afirma que foram executados.
