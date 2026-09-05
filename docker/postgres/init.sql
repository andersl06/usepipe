-- Papel da aplicação, criado só no ambiente de desenvolvimento.
-- Ele NÃO é dono das tabelas e NÃO tem bypassrls: é assim que a política
-- tenant_isolado passa a valer de verdade. As migrations rodam com o papel `pipe`,
-- que é o dono — a separação exigida pela §1 do modelo de dados.
create extension if not exists vector;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'pipe_app') then
    create role pipe_app login password 'pipe_app';
  end if;
end
$$;

grant connect on database pipe to pipe_app;
grant usage on schema public to pipe_app;
