-- Habilita SELECT público em wallet_entries para suportar o feed social
-- (Novidades / Seguindo) e a página de perfil /u/[userId] sem service role.
--
-- Wallet entries são, por design social, uma "carteirinha pública": o que cada
-- usuário declarou que vai/foi assistir. INSERT/UPDATE/DELETE permanecem
-- restritos ao próprio dono.

drop policy if exists "wallet select own" on public.wallet_entries;

drop policy if exists "wallet select public" on public.wallet_entries;
create policy "wallet select public"
on public.wallet_entries
for select
using (true);

grant select on public.wallet_entries to anon;
