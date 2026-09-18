/**
 * Estrutura da Gestão — o que sobrou do casco do portal PARALELO que existia
 * para as telas que não têm contato.
 *
 * As três rotas que usavam este casco foram embora: Atendimento (Monitora-
 * mento, Histórico, Relatórios, Atendentes, Comunicação, Regras, Preferências,
 * Canais) já tinha se mudado para dentro do contato antes desta entrega —
 * `/{tipo}/:id/atendimento/*`, casco em `paginas/operacao/casca.tsx`. Nesta
 * entrega foi a vez de Builder (`/fluxo/:id/builder`, casco próprio em
 * `paginas/builder.tsx`, `BarrasDoContato`) e Growth (`/fluxo/:id/growth/*`,
 * casco em `paginas/fluxo/growth/casca.tsx` — o `/growth` solto em
 * `paginas/growth-portal.tsx` era duplicata e foi retirado, com a rota velha
 * redirecionando para o portal, como já era feito para o Atendimento). A
 * Implantação, que fica de fora do contato por ser onboarding de CONTA e não
 * de um fluxo ou roteador, ganhou o cromo do PORTAL direto em
 * `paginas/implantacao/page.tsx` (`pt-app` + `BarraDoPortal`, como em
 * "Novidades" e no Painel do contrato) — a barra de módulos que sobraria
 * aqui, sem Builder nem Growth para acender, desenhava uma fileira vazia.
 *
 * Sem NENHUMA rota usando `<EstruturaGestao/>` como casco, o componente saiu.
 * Este arquivo continua de pé só porque `paginas/operacao/casca.tsx` (agente
 * ativo, fora do escopo desta entrega) importa `URL_DESK` daqui — mover a
 * constante quebraria aquele import sem necessidade. Quem quiser fazer a
 * faxina completa precisa mexer nos dois arquivos juntos.
 */

/** Onde vive o app do atendente. O rodapé da lateral do Atendimento aponta para lá. */
export const URL_DESK =
  (import.meta.env['VITE_PIPE_DESK_URL'] as string | undefined) ?? 'http://localhost:3200';
