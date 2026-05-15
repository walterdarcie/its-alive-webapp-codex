/**
 * Importa artistas do dump NDJSON do MusicBrainz para a tabela known_artists no Supabase.
 *
 * Como usar:
 *
 * 1. Baixe o dump de artistas do MusicBrainz (veja a data mais recente em
 *    https://data.metabrainz.org/pub/musicbrainz/data/json-dumps/):
 *    curl -L -o /tmp/mb-artist.tar.xz \
 *      "https://data.metabrainz.org/pub/musicbrainz/data/json-dumps/20260513-001002/artist.tar.xz"
 *
 * 2. Extraia o arquivo interno (requer xz e tar):
 *    tar -xJf /tmp/mb-artist.tar.xz -C /tmp mbdump/artist
 *
 * 3. Defina as variáveis de ambiente:
 *    export NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"
 *    export SUPABASE_SERVICE_ROLE_KEY="eyJ..."
 *
 * 4. Rode o script:
 *    npx tsx scripts/import-musicbrainz-artists.ts /tmp/mbdump/artist
 *
 * O script é idempotente: usa ON CONFLICT DO NOTHING, pode ser re-executado sem duplicar dados.
 * Tempo estimado: 20–40 min para ~3 M de artistas (limitado pela rede para o Supabase).
 */

import { createClient } from "@supabase/supabase-js";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const BATCH_SIZE = 500;
const EXCLUDED_TYPES = new Set(["Character"]);

type ArtistRow = {
  mbid: string;
  canonical_name: string;
  name_normalized: string;
};

function normalizeForDb(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/['''`"]/g, "");
}

async function flushBatch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  batch: ArtistRow[],
  inserted: { count: number }
) {
  if (batch.length === 0) return;
  const { error } = await supabase
    .from("known_artists")
    .upsert(batch, { onConflict: "mbid", ignoreDuplicates: true });
  if (error) {
    process.stderr.write(`[warn] batch error: ${error.message}\n`);
  } else {
    inserted.count += batch.length;
  }
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    process.stderr.write("Uso: npx tsx scripts/import-musicbrainz-artists.ts <caminho/para/mbdump/artist>\n");
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    process.stderr.write("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY\n");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });

  const batch: ArtistRow[] = [];
  const inserted = { count: 0 };
  let parsed = 0;
  let skipped = 0;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      skipped++;
      continue;
    }

    const mbid = typeof obj["id"] === "string" ? obj["id"] : "";
    const name = typeof obj["name"] === "string" ? obj["name"] : "";
    const type = typeof obj["type"] === "string" ? obj["type"] : null;

    if (!mbid || !name) {
      skipped++;
      continue;
    }

    if (type !== null && EXCLUDED_TYPES.has(type)) {
      skipped++;
      continue;
    }

    const name_normalized = normalizeForDb(name);
    if (!name_normalized) {
      skipped++;
      continue;
    }

    batch.push({ mbid, canonical_name: name, name_normalized });
    parsed++;

    if (batch.length >= BATCH_SIZE) {
      await flushBatch(supabase, batch.splice(0), inserted);
      process.stdout.write(`\r  inseridos: ${inserted.count.toLocaleString()}  lidos: ${parsed.toLocaleString()}`);
    }
  }

  await flushBatch(supabase, batch.splice(0), inserted);

  process.stdout.write(`\n\nConcluído.\n`);
  process.stdout.write(`  Lidos:     ${parsed.toLocaleString()}\n`);
  process.stdout.write(`  Inseridos: ${inserted.count.toLocaleString()}\n`);
  process.stdout.write(`  Ignorados: ${skipped.toLocaleString()}\n`);
}

main().catch((err) => {
  process.stderr.write(`Erro fatal: ${String(err)}\n`);
  process.exit(1);
});
