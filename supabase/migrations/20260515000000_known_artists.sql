-- known_artists: artistas do MusicBrainz para resolução de MBID sem chamar setlist.fm /search/artists
-- name_normalized: lowercase, sem diacríticos, sem apóstrofos — mesma normalização de findKnownArtistFromPrefix

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS known_artists (
  mbid            TEXT PRIMARY KEY,
  canonical_name  TEXT NOT NULL,
  name_normalized TEXT NOT NULL
);

-- Índice B-tree para lookup exato e LIKE 'prefix%' (uso principal)
CREATE INDEX IF NOT EXISTS known_artists_name_prefix_idx
  ON known_artists (name_normalized text_pattern_ops);

-- Índice trigrama para buscas de similaridade / autocomplete futuro
CREATE INDEX IF NOT EXISTS known_artists_trgm_idx
  ON known_artists USING GIN (name_normalized gin_trgm_ops);

ALTER TABLE known_artists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "known_artists_select_public" ON known_artists;
CREATE POLICY "known_artists_select_public"
  ON known_artists FOR SELECT USING (true);

-- Seed com os artistas que antes ficavam hardcoded em lib/setlist-api.ts
-- name_normalized = normalizeLoose(canonical_name).replace(/['''`"]/g, "")
INSERT INTO known_artists (mbid, canonical_name, name_normalized) VALUES
  ('ca891d65-d9b0-4258-89f7-e6ba29d83767', 'Iron Maiden',           'iron maiden'),
  ('65f4f0c5-ef9e-490c-aee3-909e7ae6b2ab', 'Metallica',             'metallica'),
  ('66c662b6-6e2f-4930-8610-912e24c63ed1', 'AC/DC',                 'ac/dc'),
  ('eeb1195b-f213-4ce1-b28c-8565211f8e43', 'Guns N'' Roses',        'guns n roses'),
  ('b071f9fa-14b0-4217-8e97-eb41da73f598', 'The Rolling Stones',    'the rolling stones'),
  ('83d91898-7763-47d7-b03b-b92132375c47', 'Pink Floyd',            'pink floyd'),
  ('67f66c07-6e61-4026-ade5-7e782fad3a5d', 'Foo Fighters',          'foo fighters'),
  ('678d88b2-87b0-403b-b63d-5da7465aecc3', 'Led Zeppelin',          'led zeppelin'),
  ('0383dadf-2a4e-4d10-a46a-e9e041da8eb3', 'Queen',                 'queen'),
  ('b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d', 'The Beatles',           'the beatles'),
  ('a3cb23fc-acd3-4ce0-8f36-1e5aa6a18432', 'U2',                    'u2'),
  ('5b11f4ce-a62d-471e-81fc-a69a8278c7da', 'Nirvana',               'nirvana'),
  ('cc197bad-dc9c-440d-a5b5-d52ba2e14234', 'Coldplay',              'coldplay'),
  ('a74b1b7f-71a5-4011-9441-d0b5e4122711', 'Radiohead',             'radiohead'),
  ('39ab1aed-75e0-4140-bd47-540276886b60', 'Oasis',                 'oasis'),
  ('8bfac288-ccc5-448d-9573-c33ea2aa5c30', 'Red Hot Chili Peppers', 'red hot chili peppers'),
  ('cc0b7089-c08d-4c10-b6b0-873582c17fd6', 'System of a Down',      'system of a down'),
  ('f59c5520-5f46-4d2c-b2c4-822eabf53419', 'Linkin Park',           'linkin park'),
  ('83b9cbe7-9857-49e2-ab8e-b57b01038103', 'Pearl Jam',             'pearl jam'),
  ('f181961b-20f7-459e-89de-920ef03c7ed0', 'The Strokes',           'the strokes'),
  ('ada7a83c-e3e1-40f1-93f9-3e73dbc9298a', 'Arctic Monkeys',        'arctic monkeys'),
  ('6c4c2eaa-13aa-4f50-b6a5-fc83b1390aa9', 'Angra',                 'angra'),
  ('e6041d2c-1d5f-49a2-b48d-7d7466b2f9aa', 'Sepultura',             'sepultura')
ON CONFLICT (mbid) DO NOTHING;
