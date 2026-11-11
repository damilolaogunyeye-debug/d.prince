-- D.prince Learning Portal: one-time setup for project ipykxionlzmkstyvqugm
-- Supabase Dashboard -> SQL Editor -> New query -> paste -> Run. Safe to run again.
-- Creates a login that can only use its own empty schema "dprince_portal".
-- Nothing in "public" (your existing tables) is touched. The password below is a
-- scrambled verifier: it cannot be used to log in. The real password exists only
-- on the portal's server, which connects by itself after this has run.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'dprince_app') then
    create role dprince_app login password 'SCRAM-SHA-256$4096:i/uFY7kvE8r9aAQzovq7OQ==$JCXi/WqPayDiKzJtrTcfhNsyqN36ex39xZBBhCJFbg4=:zD34l6HvFq+yjJqx1f/BL7fL+ByBGjMPZS5zjQPgXUE=';
  else
    alter role dprince_app login password 'SCRAM-SHA-256$4096:i/uFY7kvE8r9aAQzovq7OQ==$JCXi/WqPayDiKzJtrTcfhNsyqN36ex39xZBBhCJFbg4=:zD34l6HvFq+yjJqx1f/BL7fL+ByBGjMPZS5zjQPgXUE=';
  end if;
end $$;
grant dprince_app to current_user;
create schema if not exists dprince_portal authorization dprince_app;
