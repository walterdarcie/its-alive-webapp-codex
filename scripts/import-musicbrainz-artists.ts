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
 */

import { createClient } from "@supabase/supabase-js";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const BATCH_SIZE = 800;
const CONCURRENCY = 3;
const MAX_RETRIES = 5;
// Apenas tipos que fazem shows ao vivo. null inclui artistas sem tipo definido
// mas que são frequentemente buscados (artistas mais antigos / menos documentados).
// Excluímos Character (personagens fictícios) e Other (categorias genéricas).
const ALLOWED_TYPES = new Set(["Group", "Person", "Orchestra", "Choir", null]);

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function flushBatch(supabase: any, batch: ArtistRow[]): Promise<number> {
  if (batch.length === 0) return 0;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const { error } = await supabase
      .from("known_artists")
      .upsert(batch, { onConflict: "mbid", ignoreDuplicates: true });

    if (!error) return batch.length;

    const isTimeout = error.message?.includes("timeout") || error.message?.includes("statement");
    if (!isTimeout || attempt === MAX_RETRIES) {
      process.stderr.write(`\n[warn] batch falhou (tentativa ${attempt}/${MAX_RETRIES}): ${error.message}\n`);
      return 0;
    }

    // Backoff exponencial: 2s, 4s, 8s, 16s
    await sleep(2000 * 2 ** (attempt - 1));
  }
  return 0;
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

  let currentBatch: ArtistRow[] = [];
  let inserted = 0;
  let parsed = 0;
  let skipped = 0;

  const inFlight = new Set<Promise<void>>();

  async function dispatchBatch(batch: ArtistRow[]) {
    const p = flushBatch(supabase, batch).then((n) => {
      inserted += n;
      inFlight.delete(p);
    });
    inFlight.add(p);
    if (inFlight.size >= CONCURRENCY) {
      await Promise.race(inFlight);
    }
  }

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

    if (!mbid || !name) { skipped++; continue; }
    if (!ALLOWED_TYPES.has(type)) { skipped++; continue; }

    const name_normalized = normalizeForDb(name);
    if (!name_normalized) { skipped++; continue; }

    currentBatch.push({ mbid, canonical_name: name, name_normalized });
    parsed++;

    if (currentBatch.length >= BATCH_SIZE) {
      await dispatchBatch(currentBatch.splice(0));
      process.stdout.write(`\r  inseridos: ${inserted.toLocaleString("pt-BR")}  lidos: ${parsed.toLocaleString("pt-BR")}  `);
    }
  }

  if (currentBatch.length > 0) {
    await dispatchBatch(currentBatch.splice(0));
  }
  await Promise.all(inFlight);

  process.stdout.write(`\n\nConcluído.\n`);
  process.stdout.write(`  Lidos:     ${parsed.toLocaleString("pt-BR")}\n`);
  process.stdout.write(`  Inseridos: ${inserted.toLocaleString("pt-BR")}\n`);
  process.stdout.write(`  Ignorados: ${skipped.toLocaleString("pt-BR")}\n`);
}

main().catch((err) => {
  process.stderr.write(`Erro fatal: ${String(err)}\n`);
  process.exit(1);
});
