-- Backfill: limpa imagens de artista persistidas em wallet_entries.show_data
-- vindas da cascata antiga (Wikipedia/Wikimedia, ou ausente). A cascata nova
-- prioriza Deezer e a UI re-resolve via /api/artist-image quando os campos
-- não estão presentes no JSONB.
--
-- Importante: o trigger wallet_entries_set_updated_at_trigger é desabilitado
-- durante o UPDATE para preservar updated_at — ele alimenta o feed "Seguindo"
-- (ordenação + occurredAtIso). Sem isso, a migration faria toda a wallet de
-- todos os usuários virar atividade fresca no feed dos seguidores.

alter table public.wallet_entries
  disable trigger wallet_entries_set_updated_at_trigger;

update public.wallet_entries
set show_data = show_data
  - 'artistImageUrl'
  - 'artistImagePageUrl'
  - 'artistImageSource'
where show_data ? 'artistImageUrl'
  and (show_data->>'artistImageSource') is distinct from 'deezer';

alter table public.wallet_entries
  enable trigger wallet_entries_set_updated_at_trigger;
